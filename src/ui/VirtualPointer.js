/**
 * VirtualPointer — el ratón y el teclado del agente.
 *
 * Un cursor visible (con el nombre del agente) se desplaza hasta los elementos y genera la
 * misma secuencia de eventos que un usuario real:
 *
 *   ratón    pointerover/enter → pointermove → pointerdown/mousedown → focus →
 *            pointerup/mouseup → click (· dblclick · contextmenu)
 *   teclado  keydown → keypress → beforeinput/input (execCommand, compatible con React/Vue) → keyup
 *   arrastre pointerdown → dragstart → dragenter/dragover… → drop → dragend → pointerup
 *
 * Límites del navegador (no se pueden saltar desde JavaScript, y es bueno que así sea):
 *  - Los eventos son sintéticos (`isTrusted: false`): no mueven el ratón del sistema, no activan
 *    `:hover` de CSS, no abren el desplegable nativo de un <select> ni diálogos de archivos.
 *  - Las teclas sintéticas no tienen acción por defecto; aquí se emulan las útiles
 *    (Enter, Tab, Espacio, Retroceso, flechas, Inicio/Fin, Ctrl+A).
 *
 * El usuario puede detener al agente en cualquier momento con Esc.
 *
 *   const p = new VirtualPointer({ name: 'Nube', color: '#4f46e5' });
 *   await p.click(el); await p.type(input, 'hola'); await p.press('Enter');
 */

import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

const EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable=true], summary';

export class PointerCancelled extends Error {
  constructor() {
    super('El usuario detuvo al asistente (Esc).');
  }
}

export class VirtualPointer {
  /**
   * @param {object} [opt]
   * @param {boolean} [opt.visible=true]  false → mismos eventos, sin cursor ni animación
   * @param {number}  [opt.speed=1]       multiplicador de velocidad (2 = el doble de rápido)
   * @param {string}  [opt.name='Asistente']
   * @param {string}  [opt.color='#4f46e5']
   * @param {(el: Element) => boolean} [opt.isOwnUi]  elementos del propio widget (no cuentan como "tapado")
   * @param {() => void} [opt.onCancel]  el usuario pulsó Esc (AgentWidget aborta el turno)
   * @param {(key: string, vars?: object) => string} [opt.t]  traductor de la etiqueta del cursor
   */
  constructor({ visible = true, speed = 1, name = null, color = '#4f46e5', isOwnUi = null, onCancel = null, t = translator() } = {}) {
    this.t = t;
    this.visible = visible;
    this.speed = Math.max(0.25, Number(speed) || 1);
    this.name = name || t('widget.defaultName');
    this.color = color;
    this.isOwnUi = isOwnUi || ((el) => !!el?.closest?.('[data-ots-root]'));
    this.onCancel = onCancel;
    this.x = window.innerWidth - 80;
    this.y = window.innerHeight - 80;
    this._hovered = null;
    this._host = null;
    this._hideTimer = null;
    this._busy = 0;
    this._cancelled = false;
    this._onKey = (e) => {
      if (e.isTrusted && e.key === 'Escape' && this._busy) {
        this._cancelled = true;
        this._label(this.t('widget.pointer.halted'));
        this.onCancel?.();
      }
    };
  }

  /** Sin animación si no hay que mostrarla o la pestaña/usuario no la quieren. */
  get _instant() {
    return !this.visible || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ───────────────────────────── API pública ─────────────────────────────

  /** Mueve el cursor hasta el elemento (lo desplaza a la vista si hace falta). */
  async moveTo(el, { hover = true } = {}) {
    return this._run(async () => {
      const pt = await this._aim(el);
      await this._glide(pt.x, pt.y);
      if (hover) this._hover(pt.hit, pt);
      return pt;
    });
  }

  async hover(el) {
    return this.moveTo(el, { hover: true });
  }

  /**
   * Click real (con eventos de puntero, foco y activación).
   * @param {Element} el
   * @param {{button?: 'left'|'right', double?: boolean}} [opt]
   */
  async click(el, { button = 'left', double = false } = {}) {
    return this._run(async () => {
      const pt = await this._aim(el);
      await this._glide(pt.x, pt.y);
      this._hover(pt.hit, pt);
      await this._pause(90);
      const t = pt.hit;
      const btn = button === 'right' ? 2 : 0;
      const clicks = double ? 2 : 1;
      for (let i = 1; i <= clicks; i++) {
        this._check();
        this._ripple();
        const down = this._fire(t, 'pointerdown', pt, { button: btn, buttons: btn === 2 ? 2 : 1 });
        const mdown = this._fire(t, 'mousedown', pt, { button: btn, buttons: btn === 2 ? 2 : 1, detail: i });
        if (down && mdown) focusFrom(t);
        await this._pause(60);
        this._fire(t, 'pointerup', pt, { button: btn });
        this._fire(t, 'mouseup', pt, { button: btn, detail: i });
        if (btn === 2) {
          this._fire(t, 'contextmenu', pt, { button: 2, detail: i });
        } else {
          // Un click sintético vía dispatchEvent ejecuta la activación (enlaces, checkbox, submit).
          this._fire(t, 'click', pt, { detail: i });
        }
        if (i < clicks) await this._pause(70);
      }
      if (double && btn === 0) this._fire(t, 'dblclick', pt, { detail: 2 });
      await this._pause(120);
      return t;
    });
  }

  /**
   * Escribe como un usuario: tecla a tecla, con los eventos de teclado e input.
   * @param {Element|null} el   null → el elemento que tiene el foco
   * @param {string} text       '\n' en un textarea = salto de línea
   * @param {{clear?: boolean}} [opt]
   */
  async type(el, text, { clear = false } = {}) {
    return this._run(async () => {
      let target = el || deepActive();
      if (!target || target === document.body) throw new Error('No hay ningún campo con el foco. Indica el campo (target).');
      if (el) {
        const pt = await this._aim(el);
        await this._glide(pt.x, pt.y);
        this._hover(pt.hit, pt);
      }
      if (deepActive() !== target) {
        this._ripple();
        focusFrom(target);
      }
      target = deepActive() || target;
      if (!isEditable(target)) throw new Error('Ese elemento no admite texto.');
      if (clear) {
        selectAll(target);
        if (!document.execCommand('delete')) setNativeValue(target, '');
      }
      const chars = [...String(text)];
      // Rápido pero visible: ~35 ms por tecla, y como mucho ~2,5 s en total.
      const per = this._instant ? 0 : Math.min(35, 2500 / Math.max(1, chars.length)) / this.speed;
      this._label(this.t('widget.pointer.typing'));
      for (const ch of chars) {
        this._check();
        if (ch === '\n' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          await this._pressIn(target, 'Enter');
        } else {
          await this._key(target, ch, () => insertText(target, ch));
        }
        if (per) await sleep(per * (0.6 + Math.random() * 0.8));
      }
      this._label(null);
      return target;
    });
  }

  /**
   * Pulsa una tecla o combinación: "Enter", "Tab", "Shift+Tab", "Escape", "ArrowDown",
   * "Control+a", "Backspace"… sobre el elemento con foco (o `el` si se da).
   */
  async press(combo, el = null) {
    return this._run(async () => {
      if (el) {
        const pt = await this._aim(el);
        await this._glide(pt.x, pt.y);
        if (deepActive() !== el) focusFrom(el);
      }
      const target = deepActive() || document.body;
      await this._pressIn(target, combo);
      await this._pause(80);
      return deepActive();
    });
  }

  /** Arrastra `src` y lo suelta sobre `dst` (HTML5 drag & drop y librerías de pointer events). */
  async drag(src, dst) {
    return this._run(async () => {
      const a = await this._aim(src);
      await this._glide(a.x, a.y);
      this._hover(a.hit, a);
      await this._pause(80);
      this._fire(a.hit, 'pointerdown', a, { buttons: 1 });
      this._fire(a.hit, 'mousedown', a, { buttons: 1 });
      const dt = new DataTransfer();
      const draggable = a.hit.closest?.('[draggable=true]') || (src.draggable ? src : null);
      let dragOk = false;
      if (draggable) dragOk = this._fireDrag(draggable, 'dragstart', a, dt);

      // El destino puede no estar en pantalla: se calcula tras el scroll del origen.
      const r = dst.getBoundingClientRect();
      const b = { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) };
      const steps = this._instant ? 2 : 14;
      let over = null;
      for (let i = 1; i <= steps; i++) {
        this._check();
        const x = a.x + (b.x - a.x) * EASE(i / steps);
        const y = a.y + (b.y - a.y) * EASE(i / steps);
        this._place(x, y);
        const hit = this._hitAt(x, y) || dst;
        const pt = { x, y };
        this._fire(hit, 'pointermove', pt, { buttons: 1 });
        this._fire(hit, 'mousemove', pt, { buttons: 1 });
        if (dragOk) {
          if (hit !== over) {
            if (over) this._fireDrag(over, 'dragleave', pt, dt);
            this._fireDrag(hit, 'dragenter', pt, dt);
            over = hit;
          }
          this._fireDrag(hit, 'dragover', pt, dt);
        }
        if (!this._instant) await sleep(28 / this.speed);
      }
      const end = this._hitAt(b.x, b.y) || dst;
      if (dragOk) {
        this._fireDrag(end, 'drop', b, dt);
        this._fireDrag(draggable, 'dragend', b, dt);
      }
      this._fire(end, 'pointerup', b);
      this._fire(end, 'mouseup', b);
      this._ripple();
      await this._pause(150);
      return end;
    });
  }

  /** Rueda del ratón sobre un elemento (o la página): desplaza su contenedor desplazable. */
  async scroll(direction = 'down', amount = 1, el = null) {
    return this._run(async () => {
      let pt = { x: window.innerWidth / 2, y: window.innerHeight / 2, hit: document.scrollingElement };
      if (el) {
        pt = await this._aim(el);
        await this._glide(pt.x, pt.y);
      }
      const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
      const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
      const box = scrollableFrom(pt.hit, dx ? 'x' : 'y');
      const page = box === document.scrollingElement || box === document.body;
      const size = page ? window.innerHeight : box.clientHeight;
      const px = Math.round(size * 0.8 * Math.min(10, Math.max(0.1, amount)));
      const ok = this._fire(pt.hit, 'wheel', pt, { deltaX: dx * px, deltaY: dy * px, deltaMode: 0 }, WheelEvent);
      if (ok) {
        const opts = { left: dx * px, top: dy * px, behavior: this._instant ? 'instant' : 'smooth' };
        page ? window.scrollBy(opts) : box.scrollBy(opts);
      }
      await this._pause(350);
      return box;
    });
  }

  /** Oculta el cursor ya (p. ej. al cerrar el widget). */
  hide() {
    clearTimeout(this._hideTimer);
    this._host?.classList.remove('on');
  }

  destroy() {
    document.removeEventListener('keydown', this._onKey, true);
    this._host?.remove();
    this._host = null;
  }

  // ───────────────────────────── internos ─────────────────────────────

  async _run(fn) {
    if (!this._busy) this._cancelled = false;
    this._busy++;
    document.addEventListener('keydown', this._onKey, true);
    this._show();
    try {
      this._check();
      return await fn();
    } finally {
      this._busy--;
      if (!this._busy) {
        document.removeEventListener('keydown', this._onKey, true);
        this._scheduleHide();
      }
    }
  }

  _check() {
    if (this._cancelled) throw new PointerCancelled();
  }

  async _pause(ms) {
    this._check();
    if (!this._instant) await sleep(ms / this.speed);
    this._check();
  }

  /**
   * Lleva el elemento a la vista y calcula el punto donde "pulsar".
   * Comprueba qué hay realmente bajo ese punto: si otro elemento lo tapa (banner de cookies,
   * modal del sitio), falla con un mensaje útil en lugar de pulsar a ciegas.
   */
  async _aim(el) {
    if (!el?.isConnected) throw new Error('El elemento ya no está en la página. Vuelve a leer el contexto.');
    const target = visualTarget(el);
    let r = target.getBoundingClientRect();
    const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    if (!inView) {
      target.scrollIntoView({ behavior: this._instant ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
      r = await settle(target, this._instant);
    }
    if (r.width === 0 && r.height === 0) throw new Error('El elemento no es visible (quizá está en un menú o pestaña cerrados).');
    const x = clamp(r.left + Math.min(r.width / 2, 60), 1, window.innerWidth - 2);
    const y = clamp(r.top + r.height / 2, 1, window.innerHeight - 2);
    const hit = this._hitAt(x, y);
    const ok = hit && (hit === target || target.contains(hit) || hit.contains(target) || labelFor(hit) === el || el.contains(hit));
    if (!ok) {
      if (!hit || this.isOwnUi(hit)) return { x, y, hit: target }; // tapado por el propio widget: da igual
      const cover = describe(hit);
      throw new Error(`Hay algo encima del elemento (${cover}). Ciérralo o desplázate antes de intentarlo.`);
    }
    return { x, y, hit };
  }

  _hitAt(x, y) {
    let hit = document.elementFromPoint(x, y);
    // Atraviesa shadow roots abiertos (web components del sitio).
    while (hit?.shadowRoot && !this.isOwnUi(hit)) {
      const inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    return hit;
  }

  async _glide(x, y) {
    const x0 = this.x;
    const y0 = this.y;
    const dist = Math.hypot(x - x0, y - y0);
    if (this._instant || dist < 2) return this._place(x, y);
    const dur = Math.min(700, 180 + dist * 0.45) / this.speed;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        if (this._cancelled) return resolve();
        const t = Math.min(1, (now - start) / dur);
        this._place(x0 + (x - x0) * EASE(t), y0 + (y - y0) * EASE(t));
        t < 1 ? requestAnimationFrame(tick) : resolve();
      };
      requestAnimationFrame(tick);
    });
    this._check();
    this._place(x, y);
  }

  _place(x, y) {
    this.x = x;
    this.y = y;
    if (this._host) this._host.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Eventos de entrada/salida al pasar de un elemento a otro. */
  _hover(el, pt) {
    const prev = this._hovered?.isConnected ? this._hovered : null;
    if (prev === el) {
      this._fire(el, 'pointermove', pt);
      this._fire(el, 'mousemove', pt);
      return;
    }
    if (prev) {
      this._fire(prev, 'pointerout', pt, { relatedTarget: el });
      this._fire(prev, 'mouseout', pt, { relatedTarget: el });
      for (const n of chain(prev)) if (!n.contains(el)) {
        this._fire(n, 'pointerleave', pt, { bubbles: false });
        this._fire(n, 'mouseleave', pt, { bubbles: false });
      }
    }
    this._fire(el, 'pointerover', pt, { relatedTarget: prev });
    this._fire(el, 'mouseover', pt, { relatedTarget: prev });
    for (const n of chain(el).reverse()) if (!prev || !n.contains(prev)) {
      this._fire(n, 'pointerenter', pt, { bubbles: false });
      this._fire(n, 'mouseenter', pt, { bubbles: false });
    }
    this._fire(el, 'pointermove', pt);
    this._fire(el, 'mousemove', pt);
    this._hovered = el;
  }

  /** @returns {boolean} false si el sitio canceló el evento (preventDefault) */
  _fire(el, type, pt, extra = {}, Ctor = null) {
    const base = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: pt.x, clientY: pt.y, screenX: pt.x + window.screenX, screenY: pt.y + window.screenY,
      button: 0, buttons: 0, detail: 0,
    };
    const C = Ctor || (type.startsWith('pointer') ? (window.PointerEvent || MouseEvent) : MouseEvent);
    const init = type.startsWith('pointer')
      ? { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: /down/.test(type) ? 0.5 : 0, ...extra }
      : { ...base, ...extra };
    return el.dispatchEvent(new C(type, init));
  }

  _fireDrag(el, type, pt, dataTransfer) {
    const ev = new DragEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: pt.x, clientY: pt.y, dataTransfer,
    });
    const notCancelled = el.dispatchEvent(ev);
    // dragstart cancelado = no se arrastra. drop/dragover cancelados = el sitio lo aceptó.
    return type === 'dragstart' ? notCancelled : !notCancelled;
  }

  /** Secuencia de teclado alrededor de una acción (insertar texto, borrar…). */
  async _key(target, key, action, mods = {}) {
    const init = { key, code: codeOf(key), bubbles: true, cancelable: true, composed: true, ...mods };
    const down = target.dispatchEvent(new KeyboardEvent('keydown', init));
    let ok = down;
    if (down && key.length === 1 && !mods.ctrlKey && !mods.metaKey) {
      ok = target.dispatchEvent(new KeyboardEvent('keypress', { ...init, charCode: key.charCodeAt(0) }));
    }
    if (ok && action) action();
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    return ok;
  }

  /** Pulsa una combinación y emula su acción por defecto (las teclas sintéticas no la tienen). */
  async _pressIn(target, combo) {
    const parts = String(combo).split('+').map((s) => s.trim()).filter(Boolean);
    const key = normalizeKey(parts.pop() || '');
    const mods = {
      ctrlKey: parts.some((p) => /^(ctrl|control)$/i.test(p)),
      shiftKey: parts.some((p) => /^shift$/i.test(p)),
      altKey: parts.some((p) => /^(alt|option)$/i.test(p)),
      metaKey: parts.some((p) => /^(meta|cmd|command)$/i.test(p)),
    };
    this._label(combo);
    this._check();
    await this._key(target, key, () => defaultAction(target, key, mods), mods);
    this._label(null);
  }

  // ───────────────────────── dibujo del cursor ─────────────────────────

  _mount() {
    if (this._host || !this.visible) return;
    const host = document.createElement('div');
    host.setAttribute('data-ots-root', 'pointer');
    host.setAttribute('aria-hidden', 'true');
    // popover="manual" lo lleva a la capa superior: así se dibuja también encima de un <dialog> modal del sitio.
    if ('popover' in host) host.popover = 'manual';
    host.style.cssText =
      'position:fixed;inset:auto;left:0;top:0;margin:0;padding:0;border:0;width:0;height:0;overflow:visible;background:none;' +
      'z-index:2147483647;pointer-events:none;will-change:transform;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host { all: initial; }
      .c { position: absolute; left: -3px; top: -2px; opacity: 0; transition: opacity .2s; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
      :host(.on) .c { opacity: 1; }
      .tag { position: absolute; left: 18px; top: 20px; white-space: nowrap; font: 600 12px/1 system-ui, sans-serif;
        color: #fff; background: ${this.color}; padding: 5px 8px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
      .tag small { font-weight: 400; opacity: .85; margin-left: 6px; }
      .ring { position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; border-radius: 50%;
        border: 2px solid ${this.color}; opacity: 0; transform: scale(.3); }
      .ring.go { animation: ring .45s ease-out; }
      @keyframes ring { 0% { opacity: .9; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.6); } }
      @media (prefers-reduced-motion: reduce) { .ring.go { animation: none; } }
    </style>
    <div class="ring"></div>
    <div class="c">
      <svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7.5 16 L11 24 L14.5 22.5 L11 15 L18.5 15 Z"
        fill="${this.color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div class="tag"><span class="n"></span><small class="s"></small></div>
    </div>`;
    root.querySelector('.n').textContent = this.name;
    root.querySelector('.s').textContent = this.t('widget.pointer.hint');
    document.documentElement.appendChild(host);
    this._host = host;
    this._place(this.x, this.y);
  }

  _show() {
    if (!this.visible) return;
    this._mount();
    this._host.shadowRoot.querySelector('.n').textContent = this.name; // por si cambió (identidad nueva)
    clearTimeout(this._hideTimer);
    this._raise();
    this._host.classList.add('on');
  }

  /** Vuelve a ponerse el último de la capa superior (por si el sitio abrió un modal después). */
  _raise() {
    const h = this._host;
    if (!h?.showPopover) return;
    try {
      if (h.matches(':popover-open')) {
        if (!document.querySelector('dialog:modal')) return;
        h.hidePopover();
      }
      h.showPopover();
    } catch {}
  }

  _scheduleHide() {
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this._host?.classList.remove('on'), 2500);
  }

  _label(text) {
    const s = this._host?.shadowRoot.querySelector('.s');
    if (s) s.textContent = text || this.t('widget.pointer.hint');
  }

  _ripple() {
    const ring = this._host?.shadowRoot.querySelector('.ring');
    if (!ring) return;
    ring.classList.remove('go');
    void ring.offsetWidth; // reinicia la animación
    ring.classList.add('go');
  }
}

// ───────────────────────────── helpers ─────────────────────────────

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Espera a que termine el scroll suave (posición estable) y devuelve el rect final. */
async function settle(el, instant) {
  let r = el.getBoundingClientRect();
  if (instant) return r;
  for (let i = 0; i < 30; i++) {
    await sleep(40);
    const n = el.getBoundingClientRect();
    if (Math.abs(n.top - r.top) < 1 && Math.abs(n.left - r.left) < 1) return n;
    r = n;
  }
  return r;
}

/** Checkbox/radio ocultos (estilo "switch"): se pulsa su <label> visible. */
function visualTarget(el) {
  const r = el.getBoundingClientRect();
  if ((r.width < 2 || r.height < 2 || getComputedStyle(el).opacity === '0') && el.labels?.length) return el.labels[0];
  return el;
}

function labelFor(node) {
  const label = node.closest?.('label');
  return label?.control || null;
}

function chain(el) {
  const out = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement || n.getRootNode()?.host) out.push(n);
  return out;
}

function describe(el) {
  const text = (el.getAttribute?.('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const id = el.id ? `#${el.id}` : '';
  return `${el.tagName.toLowerCase()}${id}${text ? ` «${text}»` : ''}`;
}

function deepActive() {
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

function focusFrom(el) {
  const f = el.closest?.(FOCUSABLE) || (el.matches?.(FOCUSABLE) ? el : null);
  if (f && deepActive() !== f) f.focus({ preventScroll: true });
}

function isEditable(el) {
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
  if (el.tagName !== 'INPUT') return false;
  return !el.readOnly && !el.disabled && /^(text|search|email|url|tel|number|password|date|time|datetime-local|month|week)?$/.test(el.type === 'text' ? '' : el.type);
}

function selectAll(el) {
  if (el.select) el.select();
  else if (el.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Inserta texto en la posición del cursor. execCommand genera beforeinput/input "reales" que
 * React, Vue y los editores entienden; si el navegador no lo permite, se usa el setter nativo.
 */
function insertText(el, text) {
  const before = el.value ?? el.textContent;
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {}
  const after = el.value ?? el.textContent;
  if (ok && after !== before) return;
  if (el.isContentEditable) {
    el.textContent += text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return;
  }
  let start = null;
  try { start = el.selectionStart; } catch {}
  const v = el.value;
  if (start == null) setNativeValue(el, v + text);
  else {
    const end = el.selectionEnd;
    setNativeValue(el, v.slice(0, start) + text + v.slice(end));
    try { el.setSelectionRange(start + text.length, start + text.length); } catch {}
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
}

function tabbables() {
  return [...document.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.closest('[data-ots-root], [inert], [hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

function scrollableFrom(el, axis) {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    const over = axis === 'x' ? s.overflowX : s.overflowY;
    const can = axis === 'x' ? n.scrollWidth > n.clientWidth : n.scrollHeight > n.clientHeight;
    if (can && /(auto|scroll|overlay)/.test(over)) return n;
  }
  return document.scrollingElement || document.documentElement;
}

const KEY_ALIASES = {
  enter: 'Enter', return: 'Enter', tab: 'Tab', esc: 'Escape', escape: 'Escape', space: ' ', spacebar: ' ',
  backspace: 'Backspace', delete: 'Delete', supr: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft',
  right: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
};

function normalizeKey(k) {
  return KEY_ALIASES[k.toLowerCase()] || (k.length === 1 ? k : k[0].toUpperCase() + k.slice(1));
}

function codeOf(key) {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  if (key === ' ') return 'Space';
  if (key.length > 1) return key;
  return '';
}

/** Lo que haría el navegador con una tecla real. */
function defaultAction(el, key, m) {
  const tag = el.tagName;
  const text = isEditable(el);
  if ((m.ctrlKey || m.metaKey) && key.toLowerCase() === 'a') return selectAll(el);
  if (m.ctrlKey || m.metaKey || m.altKey) return;
  switch (key) {
    case 'Enter':
      if (tag === 'TEXTAREA' || el.isContentEditable) return insertText(el, '\n');
      if (tag === 'INPUT' && el.form && !/^(checkbox|radio|button|submit|reset)$/.test(el.type)) return el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
      if (el.matches('a[href], button, summary, [role=button], [role=link], [role=tab], [role=menuitem], input[type=submit], input[type=button]')) return el.click();
      return;
    case ' ':
      if (text) return insertText(el, ' ');
      if (el.matches('button, summary, [role=button], [role=checkbox], [role=switch], [role=tab], input[type=checkbox], input[type=radio]')) return el.click();
      return window.scrollBy({ top: window.innerHeight * 0.8 });
    case 'Tab': {
      const list = tabbables();
      const i = list.indexOf(el);
      const next = list[(i + (m.shiftKey ? -1 : 1) + list.length) % list.length];
      return next?.focus();
    }
    case 'Backspace':
      if (text) return document.execCommand('delete') || deleteChar(el, -1);
      return;
    case 'Delete':
      if (text) return document.execCommand('forwardDelete') || deleteChar(el, 1);
      return;
    case 'ArrowUp':
    case 'ArrowDown': {
      const dir = key === 'ArrowDown' ? 1 : -1;
      if (tag === 'SELECT') {
        const i = clamp(el.selectedIndex + dir, 0, el.options.length - 1);
        if (i !== el.selectedIndex) {
          el.selectedIndex = i;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (tag === 'INPUT' && (el.type === 'number' || el.type === 'range')) return stepInput(el, dir);
      if (!text) return window.scrollBy({ top: dir * 60 });
      return;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
      if (tag === 'INPUT' && el.type === 'range') return stepInput(el, key === 'ArrowRight' ? 1 : -1);
      return;
    case 'PageDown':
    case 'PageUp':
      if (!text) window.scrollBy({ top: (key === 'PageDown' ? 1 : -1) * window.innerHeight * 0.85 });
      return;
    case 'Home':
    case 'End':
      if (!text) window.scrollTo({ top: key === 'Home' ? 0 : document.documentElement.scrollHeight });
      return;
    default:
      if (key.length === 1 && text) insertText(el, key);
  }
}

function deleteChar(el, dir) {
  if (el.value == null) return;
  let s = el.selectionStart ?? el.value.length;
  let e = el.selectionEnd ?? s;
  if (s === e) (dir < 0 ? (s = Math.max(0, s - 1)) : (e = Math.min(el.value.length, e + 1)));
  setNativeValue(el, el.value.slice(0, s) + el.value.slice(e));
  el.setSelectionRange?.(s, s);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: dir < 0 ? 'deleteContentBackward' : 'deleteContentForward' }));
}

function stepInput(el, dir) {
  try { dir > 0 ? el.stepUp() : el.stepDown(); } catch { return; }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
