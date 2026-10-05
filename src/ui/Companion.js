/**
 * Companion — modo lúdico: el avatar sale del chat y se pasea por la página.
 *
 *   init({ mode: 'companion', companion: { size: 150, idleHomeMs: 30000, follow: true } })
 *
 * El avatar (3D o 2D) flota sobre la página dentro del Shadow DOM del widget. Camina hasta
 * los elementos, los señala (gesto + flecha + resaltado), habla en un bocadillo y vuelve a su
 * rincón cuando se queda quieto. Pulsarlo abre el chat; arrastrarlo lo cambia de sitio.
 *
 * El modelo lo usa con las acciones `point_at`, `tour` y `go_home`. Además, con `follow`, se
 * acerca a lo que toque con el ratón virtual (click, type_text…) para que se vea quién actúa.
 */

import { renderMarkdown } from './markdown.js';
import { revealElement } from './UIManager.js';
import { escapeHtml } from './markdown.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

const MARGIN = 10;
const GAP = 14;

export class Companion {
  /**
   * @param {object} o
   * @param {ShadowRoot} o.root        shadow root del widget (comparte su CSS)
   * @param {HTMLElement|null} o.stage nodo del avatar que se muda al compañero
   * @param {import('../avatar/AvatarStage.js').AvatarStage|null} o.avatar
   * @param {object} o.ui              UIManager (highlight)
   * @param {string} o.name
   * @param {'right'|'left'} [o.side]
   * @param {(text:string)=>Promise<void>} [o.speak]  voz (resuelve al terminar)
   * @param {()=>void} [o.onActivate]  click en el compañero
   * @param {()=>boolean} [o.panelOpen]
   * @param {(key: string, vars?: object) => string} [o.t]  traductor (etiquetas accesibles)
   */
  constructor({ root, stage, avatar, ui, name, side = 'right', speak = null, onActivate = null, panelOpen = () => false, config = {}, t = translator() }) {
    this.t = t;
    this.root = root;
    this.stage = stage;
    this.avatar = avatar;
    this.ui = ui;
    this.name = name;
    this.side = side;
    this.speak = speak;
    this.onActivate = onActivate;
    this.panelOpen = panelOpen;
    this.cfg = { size: 150, idleHomeMs: 30000, follow: true, wanderMs: 0, watchCursor: false, ...config };
    /** Lo pone el widget: false mientras el agente trabaja o el chat está abierto. */
    this.canWander = () => true;
    this.x = 0;
    this.y = 0;
    this._anchor = null; // elemento junto al que está (lo sigue al hacer scroll)
    this._home = null; // posición elegida por el usuario al arrastrarlo
    this._timers = {};
    this._offs = [];
    this._sayToken = 0;
  }

  get size() {
    return innerWidth < 640 ? Math.round(this.cfg.size * 0.66) : this.cfg.size;
  }

  mount() {
    const el = document.createElement('div');
    el.className = 'buddy';
    el.setAttribute('data-ots-ignore', '');
    el.innerHTML = `
      <div class="b-say" role="status" aria-live="polite" hidden><div class="b-say-text"></div></div>
      <button class="b-body" aria-label="${escapeHtml(this.t('widget.companion.talkTo', { name: this.name }))}" title="${escapeHtml(this.name)}">
        <span class="b-stage"></span><span class="b-shadow"></span>
      </button>
      <span class="b-arrow" aria-hidden="true" hidden></span>`;
    // Capa superior (popover) para no quedar bajo el fondo de un <dialog> modal del sitio.
    if ('popover' in el) el.popover = 'manual';
    this.root.appendChild(el);
    this.el = el;
    this._raise();
    if (this.stage) el.querySelector('.b-stage').appendChild(this.stage);
    el.style.setProperty('--bs', `${this.size}px`);

    // Click = abrir el chat; arrastrar = moverlo (y recordar el sitio).
    const body = el.querySelector('.b-body');
    let drag = null;
    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, x: this.x, y: this.y, moved: false };
      body.setPointerCapture(e.pointerId);
    });
    body.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      this._anchor = null;
      this._place(drag.x + dx, drag.y + dy, 0);
    });
    body.addEventListener('pointerup', () => {
      if (drag?.moved) this._home = { x: this.x, y: this.y };
      else if (drag) this.onActivate?.();
      drag = null;
    });
    body.addEventListener('pointercancel', () => (drag = null));
    el.querySelector('.b-say').addEventListener('click', () => this.onActivate?.());

    // Si está junto a un elemento, lo acompaña al hacer scroll o cambiar el tamaño.
    let raf = 0;
    const follow = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--bs', `${this.size}px`);
        if (this._anchor?.isConnected) this._placeNear(this._anchor, 0);
        else this.home({ instant: true });
      });
    };
    addEventListener('scroll', follow, { passive: true, capture: true });
    addEventListener('resize', follow);
    this._offs.push(() => removeEventListener('scroll', follow, { capture: true }), () => removeEventListener('resize', follow));

    this.home({ instant: true });
    this._idleLook();
    this.setBehavior(this.cfg);
  }

  /** Vuelve a poner nombre e idioma en las etiquetas (identidad o idioma nuevos). */
  relabel() {
    const body = this.el?.querySelector('.b-body');
    if (!body) return;
    body.setAttribute('aria-label', this.t('widget.companion.talkTo', { name: this.name }));
    body.title = this.name;
  }

  /**
   * Cuánta vida propia tiene (lo ajusta el nivel de iniciativa).
   * @param {{ wanderMs?: number, watchCursor?: boolean }} o  wanderMs 0 = no curiosea
   */
  setBehavior({ wanderMs = this.cfg.wanderMs, watchCursor = this.cfg.watchCursor } = {}) {
    this.cfg.wanderMs = wanderMs;
    this.cfg.watchCursor = watchCursor;
    this._scheduleWander();
    this._offCursor?.();
    this._offCursor = null;
    if (watchCursor) {
      let last = 0;
      const look = (e) => {
        const now = Date.now();
        if (now - last < 300 || this._busyLooking()) return;
        last = now;
        this.avatar?.lookAt?.(e.clientX, e.clientY, 700);
      };
      addEventListener('pointermove', look, { passive: true });
      this._offCursor = () => removeEventListener('pointermove', look);
      this._offs.push(() => this._offCursor?.());
    }
  }

  _busyLooking() {
    return document.hidden || this.el.classList.contains('walking') || !this.el.querySelector('.b-arrow').hidden;
  }

  /** Curiosidad: de vez en cuando se acerca a algo de la pantalla y lo mira, sin hablar. */
  _scheduleWander() {
    clearTimeout(this._timers.wander);
    const ms = this.cfg.wanderMs;
    if (!ms) return;
    this._timers.wander = setTimeout(() => {
      this._wander().finally(() => this._scheduleWander());
    }, ms * (0.7 + Math.random() * 0.6));
  }

  async _wander() {
    if (document.hidden || this._anchor || !this.canWander() || !this.el.querySelector('.b-say').hidden) return;
    const s = this.size;
    const candidates = [...document.querySelectorAll('h1, h2, h3, img, button, a[class*=btn], a[class*=button], [class*=card], figure, table')].filter((el) => {
      if (el.closest('[data-ots-root], [data-ots-ignore]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 30 && r.height > 16 && r.top > 40 && r.bottom < innerHeight - 40 && r.width < innerWidth * 0.9 && el !== this._lastWander;
    });
    if (!candidates.length) return;
    const el = candidates[Math.floor(Math.random() * candidates.length)];
    this._lastWander = el;
    this.el.classList.add('curious');
    await this._placeNear(el);
    if (this._anchor) return this.el.classList.remove('curious'); // el agente lo necesitó mientras tanto
    const r = el.getBoundingClientRect();
    this.avatar?.lookAt?.(r.left + r.width / 2, r.top + r.height / 2, 2000);
    if (Math.random() < 0.35) this.avatar?.gesture?.(['index', 'shrug', 'handup'][Math.floor(Math.random() * 3)], 1.6, r.left + r.width / 2 < this.x + s / 2);
    await sleep(2600 + Math.random() * 2000);
    this.el.classList.remove('curious');
    if (!this._anchor && this.canWander()) this.home();
  }

  destroy() {
    Object.values(this._timers).forEach(clearTimeout);
    this._offs.forEach((f) => f());
    this.el?.remove();
  }

  /** Acompaña al panel: si se abre, se aparta a un lado; en móvil se esconde. */
  panelChanged(open) {
    this.el.classList.toggle('behind', open && innerWidth < 640);
    // Al abrir se aparta junto al panel; al cerrar se queda donde estaba si señalaba algo.
    if (open || !this._anchor) this.home();
  }

  // ───────────────────────────── movimiento ─────────────────────────────

  /** Vuelve a su rincón (o al sitio donde lo dejó el usuario). */
  home({ instant = false } = {}) {
    this._anchor = null;
    const s = this.size;
    let x;
    let y;
    if (this._home) ({ x, y } = this._home);
    else {
      const open = this.panelOpen() && innerWidth >= 640;
      const offset = open ? Math.min(380, innerWidth - 24) + 32 : 20;
      x = this.side === 'left' ? offset : innerWidth - s - offset;
      y = innerHeight - s - 20;
    }
    return this._place(x, y, instant ? 0 : undefined);
  }

  /** Camina hasta quedarse al lado del elemento, sin taparlo. */
  async goTo(el) {
    if (!el?.isConnected) throw new Error('El elemento ya no está en la página');
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
      revealElement(el);
      await settle(el);
    }
    this._anchor = el;
    await this._placeNear(el);
    this._touch();
  }

  /** Va al elemento, lo señala y (opcional) dice algo. Resuelve al terminar de hablar. */
  async pointAt(el, message = '', { signal } = {}) {
    await this.goTo(el);
    if (signal?.aborted) return;
    const r = el.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const cx = this.x + this.size / 2;
    this.avatar?.lookAt?.(tx, ty, 2500);
    this.avatar?.gesture?.('index', 2.5, tx < cx);
    this._arrow(tx, ty);
    this.ui?.highlight?.(el, { duration: 2600, scroll: false });
    if (message) await this.say(message, { signal });
    else await sleep(1200, signal);
  }

  /** Recorrido: señala varias cosas seguidas, hablando en cada una. */
  async tour(steps, { signal, resolve } = {}) {
    let done = 0;
    for (const s of steps) {
      if (signal?.aborted) break;
      const el = resolve(s.target);
      if (!el) continue;
      await this.pointAt(el, s.message || '', { signal });
      done++;
      await sleep(350, signal);
    }
    return done;
  }

  /** Se acerca a lo que toca el ratón virtual (sin hablar ni esperar a que llegue). */
  follow(el) {
    if (!this.cfg.follow || !el?.isConnected) return;
    this._anchor = el;
    this._placeNear(el);
    this._touch();
  }

  _placeNear(el, duration) {
    const s = this.size;
    const r = el.getBoundingClientRect();
    const vw = innerWidth;
    const vh = innerHeight;
    const midY = r.top + r.height / 2 - s / 2;
    const midX = r.left + r.width / 2 - s / 2;
    const cy = clamp(midY, MARGIN, vh - s - MARGIN);
    const cx = clamp(midX, MARGIN, vw - s - MARGIN);
    const right = [r.right + GAP, cy];
    const left = [r.left - s - GAP, cy];
    // Prefiere el lado natural del widget para no cruzar la pantalla sin necesidad.
    const options = [...(this.side === 'left' ? [left, right] : [right, left]), [cx, r.bottom + GAP], [cx, r.top - s - GAP]];
    const fits = ([x, y]) => x >= MARGIN && y >= MARGIN && x + s <= vw - MARGIN && y + s <= vh - MARGIN;
    // Si no cabe fuera (elemento enorme), se pone dentro de su esquina superior.
    const [x, y] = options.find(fits) || [
      this.side === 'left' ? Math.max(r.left, 0) + MARGIN : Math.min(r.right, vw) - s - MARGIN,
      Math.max(r.top, 0) + MARGIN,
    ];
    return this._place(x, y, duration);
  }

  /** Mueve el cuerpo con un paseo animado. Resuelve al llegar. */
  _place(x, y, duration) {
    const s = this.size;
    x = clamp(x, MARGIN, innerWidth - s - MARGIN);
    y = clamp(y, MARGIN, innerHeight - s - MARGIN);
    const dist = Math.hypot(x - this.x, y - this.y);
    const instant = document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = duration ?? (instant ? 0 : clamp(dist * 1.1, 0, 1300));
    const el = this.el;
    if (ms > 0 && dist > 4) {
      el.classList.add('walking');
      el.classList.toggle('to-left', x < this.x);
      clearTimeout(this._timers.walk);
      this._timers.walk = setTimeout(() => el.classList.remove('walking'), ms);
    }
    this._raise();
    el.style.transitionDuration = `${ms}ms`;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.dataset.v = y < innerHeight / 2 ? 'top' : 'bottom';
    el.dataset.h = x + s / 2 < innerWidth / 2 ? 'left' : 'right';
    this.x = x;
    this.y = y;
    return sleep(ms);
  }

  /** Se vuelve a poner encima si el sitio abrió un modal después. */
  _raise() {
    const el = this.el;
    if (!el?.showPopover) return;
    try {
      if (el.matches(':popover-open')) {
        if (!document.querySelector('dialog:modal')) return;
        el.hidePopover();
      }
      el.showPopover();
    } catch {}
  }

  _arrow(tx, ty) {
    const a = this.el.querySelector('.b-arrow');
    const cx = this.size / 2;
    const ang = Math.atan2(ty - (this.y + cx), tx - (this.x + cx));
    const d = cx * 0.95;
    a.style.transform = `translate(${cx + Math.cos(ang) * d}px, ${cx + Math.sin(ang) * d}px) rotate(${ang}rad)`;
    a.hidden = false;
    a.classList.remove('go');
    void a.offsetWidth;
    a.classList.add('go');
    clearTimeout(this._timers.arrow);
    this._timers.arrow = setTimeout(() => (a.hidden = true), 2600);
  }

  // ───────────────────────────── habla ─────────────────────────────

  /**
   * Bocadillo junto al avatar. Con `speak`, además lo dice en voz alta.
   * Resuelve cuando termina la voz o el tiempo de lectura.
   */
  async say(text, { speak = true, signal } = {}) {
    const token = ++this._sayToken;
    const box = this.el.querySelector('.b-say');
    const t = String(text || '').trim();
    box.querySelector('.b-say-text').innerHTML = renderMarkdown(t.length > 240 ? `${t.slice(0, 237)}…` : t);
    box.hidden = false;
    this._touch();
    const reading = clamp(t.length * 55, 1800, 9000);
    const voice = speak && this.speak ? this.speak(t).catch(() => {}) : null;
    await Promise.race([Promise.all([voice || sleep(reading), sleep(Math.min(reading, 1500))]), abortPromise(signal)]);
    clearTimeout(this._timers.say);
    this._timers.say = setTimeout(() => {
      if (token === this._sayToken) box.hidden = true;
    }, 2500);
  }

  hush() {
    this._sayToken++;
    this.el.querySelector('.b-say').hidden = true;
  }

  // ───────────────────────────── inactividad ─────────────────────────────

  _touch() {
    clearTimeout(this._timers.idle);
    this._timers.idle = setTimeout(() => {
      if (this._anchor) this.home();
    }, this.cfg.idleHomeMs);
  }

  /** De vez en cuando mira a otro lado: parece vivo aunque nadie le hable. */
  _idleLook() {
    clearTimeout(this._timers.look);
    this._timers.look = setTimeout(() => {
      if (!document.hidden && !this.el.classList.contains('walking')) {
        this.avatar?.lookAt?.(Math.random() * innerWidth, Math.random() * innerHeight * 0.7, 1200);
      }
      this._idleLook();
    }, 7000 + Math.random() * 9000);
  }
}

/**
 * Acciones del modo compañero.
 * @param {Companion} companion
 * @param {{ t?: Function }} [opt]  traductor de los títulos (por defecto, el del compañero)
 */
export function createCompanionActions(companion, { t = companion.t || translator() } = {}) {
  const TARGET = { type: 'string', description: 'Ref (p. ej. "e12") o selector CSS del elemento' };
  const need = (context, t) => {
    const el = context.resolve(t);
    if (!el) throw new Error(`No encuentro "${t}" en la página. Usa get_page_context o find_on_page.`);
    return el;
  };
  return [
    {
      name: 'point_at',
      category: 'ui',
      title: () => t('widget.companion.pointAt'), // función: sigue el idioma actual
      description:
        'Tu avatar camina por la página hasta el elemento, lo señala y dice el mensaje en un bocadillo (y en voz alta). ' +
        'Úsalo para enseñar dónde está algo. El mensaje debe ser corto (una frase).',
      parameters: {
        type: 'object',
        properties: { target: TARGET, message: { type: 'string', description: 'Lo que dices al señalarlo (breve)' } },
        required: ['target'],
      },
      handler: async ({ target, message = '' }, { context, signal }) => {
        const el = need(context, target);
        await companion.pointAt(el, message, { signal });
        return { ok: true, data: `Señalado "${label(el)}".` };
      },
    },
    {
      name: 'tour',
      category: 'ui',
      title: () => t('widget.companion.tour'), // función: sigue el idioma actual
      description:
        'Visita guiada: tu avatar recorre varios elementos en orden, señalando y comentando cada uno. ' +
        'Ideal para "enséñame la página" o explicar un formulario. Máximo 8 pasos, mensajes breves.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            maxItems: 8,
            items: { type: 'object', properties: { target: TARGET, message: { type: 'string' } }, required: ['target', 'message'] },
          },
        },
        required: ['steps'],
      },
      timeoutMs: 120000,
      handler: async ({ steps }, { context, signal }) => {
        const n = await companion.tour(steps.slice(0, 8), { signal, resolve: (t) => context.resolve(t) });
        companion.home();
        return { ok: true, data: `Recorrido hecho: ${n} de ${steps.length} pasos.` };
      },
    },
    {
      name: 'go_home',
      category: 'ui',
      title: () => t('widget.companion.goHome'), // función: sigue el idioma actual
      description: 'Tu avatar vuelve a su rincón de la pantalla.',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        await companion.home();
        return { ok: true };
      },
    },
  ];
}

// ───────────────────────────── helpers ─────────────────────────────

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function sleep(ms, signal) {
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), r()), { once: true });
  });
}

function abortPromise(signal) {
  return new Promise((r) => signal?.addEventListener('abort', r, { once: true }));
}

/** Espera a que el scroll suave termine (posición estable) o 900 ms. */
async function settle(el) {
  let last = null;
  for (let i = 0; i < 18; i++) {
    await sleep(50);
    const top = el.getBoundingClientRect().top;
    if (last !== null && Math.abs(top - last) < 1) return;
    last = top;
  }
}

function label(el) {
  return (el.getAttribute('aria-label') || el.querySelector?.('h1, h2, h3, legend')?.innerText || el.innerText || el.getAttribute('alt') || el.tagName.toLowerCase()).replace(/\s+/g, ' ').trim().slice(0, 60);
}
