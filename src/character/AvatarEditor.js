/**
 * Editor de avatar de 7ots: <ots-avatar-editor> / createAvatarEditor().
 *
 *   const ed = createAvatarEditor(div, { value: identity.look, onChange: (look) => … });
 *   <ots-avatar-editor></ots-avatar-editor>  → el.value = {...}; el.addEventListener('change', e => e.detail)
 *
 * Valor: { kind: 'character'|'plush'|'image', character: spec, material: 'plush'|'vinyl', avatar, image }
 * (un 'realistic' heredado se abre como 'character'; `avatar` solo se conserva).
 *
 * - Personaje 2D: estilos, forma (se deforma arrastrando sus puntos, con simetría), color,
 *   acabado, ojos, boca, cara y accesorios (arrastrables). Deshacer/rehacer, aleatorio,
 *   exportar SVG/JSON, vista previa hablando/con ánimos/gestos.
 * - Personaje 3D: la MISMA spec y las mismas pestañas, con vista previa 3D (src/character3d, se
 *   arrastra para girarlo) y material peluche/vinilo. Los puntos arrastrables son del 2D: en 3D se
 *   ocultan (forma, ojos y boca se cambian desde las pestañas).
 * - Carta: la carta coleccionable holográfica del ot (la del pet de escritorio) con su personaje, o
 *   con una imagen propia como arte; se elige la lámina (holo, prisma, cosmos, oro, sin lámina).
 *   Nombre, rol y bio de la carta: propiedad `el.identity` u `opts.identity` (+ `opts.otsId`).
 *
 * Idioma: atributo `lang` (o la propiedad nativa `el.lang`, u `opts.locale` en createAvatarEditor).
 * Cambiarlo vuelve a pintar los textos en caliente conservando el valor, la pestaña y el historial.
 * Sin `lang`, se usa el del ancestro con [lang] / <html lang> / navegador (detectLocale) y, si la
 * página cambia el idioma global con setLocale(), el editor lo sigue.
 */

import {
  normalizeCharacter, renderCharacter, createCharacter, applyPreset, randomCharacter, layout, bodyPoints,
  SHAPES, EYES, BROWS, MOUTHS, CHEEKS, PATTERNS, FINISHES, TEXTURES, ACCESSORIES, ACCESSORY_GROUPS, BODY_POINTS,
  CHARACTER_MOODS, CHARACTER_GESTURES, CHARACTER_MORPHS, partLabel,
} from './Character.js';
import { translator, detectLocale, getLocale, onLocaleChange, formatNumber } from '../i18n/index.js';
import { STYLES as ART_STYLES } from './styles.js';
import { loadCharacter3D } from '../avatar/three.js';
import { createTradingCard, CARD_FOILS } from './TradingCard.js';

const VIEW = [-20, -50, 240, 270];
const AXIS = 100;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KINDS = ['character', 'plush', 'image'];
const RANDOM_N = 12;
const MATERIALS = ['plush', 'vinyl'];

const TABS = ['styles', 'shape', 'color', 'eyes', 'mouth', 'face', 'acc'];
const GESTURES = CHARACTER_GESTURES;
// Morphs temporales para la vista previa (las formas "shape:<id>" se ven ya en la pestaña de forma).
const MORPHS = CHARACTER_MORPHS.filter((m) => !m.startsWith('shape'));
const OUTLINES = ['auto', 'none', 'thin', 'bold', 'tone', 'sticker'];
const MAX_ACC = 16;

const CSS = `
:host{all:initial;display:block;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ae-fg);
  --ae-bg:#ffffff;--ae-soft:#f4f4fa;--ae-line:#e4e4ee;--ae-fg:#17171f;--ae-muted:#6b6f82;--ae-p:#6d5dfc;--ae-p-soft:#6d5dfc1f;--ae-stage:radial-gradient(circle at 50% 35%,#ffffff,#eceaf7)}
@media (prefers-color-scheme:dark){:host{--ae-bg:#17171e;--ae-soft:#1f1f28;--ae-line:#2c2c38;--ae-fg:#ececf3;--ae-muted:#9a9db0;--ae-stage:radial-gradient(circle at 50% 35%,#2a2a36,#15151c)}}
:host([theme=light]){--ae-bg:#ffffff;--ae-soft:#f4f4fa;--ae-line:#e4e4ee;--ae-fg:#17171f;--ae-muted:#6b6f82;--ae-stage:radial-gradient(circle at 50% 35%,#ffffff,#eceaf7)}
:host([theme=dark]){color-scheme:dark;--ae-bg:#17171e;--ae-soft:#1f1f28;--ae-line:#2c2c38;--ae-fg:#ececf3;--ae-muted:#9a9db0;--ae-stage:radial-gradient(circle at 50% 35%,#2a2a36,#15151c)}
*{box-sizing:border-box}
.wrap{background:var(--ae-bg);border:1px solid var(--ae-line);border-radius:16px;overflow:hidden}
.kinds{display:flex;gap:4px;padding:10px;border-bottom:1px solid var(--ae-line);flex-wrap:wrap}
.kinds button,.tabs button{font:inherit;border:0;background:transparent;color:var(--ae-muted);padding:7px 12px;border-radius:999px;cursor:pointer}
.kinds button[aria-pressed=true]{background:var(--ae-p);color:#fff}
.body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);min-height:460px}
@media (max-width:760px){.body{grid-template-columns:minmax(0,1fr)}}
.left{border-right:1px solid var(--ae-line);display:flex;flex-direction:column;min-width:0}
@media (max-width:760px){.left{border-right:0;border-bottom:1px solid var(--ae-line)}}
.stage{position:relative;aspect-ratio:240/270;max-height:420px;margin:0 auto;width:100%;background:var(--ae-stage);touch-action:none;user-select:none}
.stage>div,.stage>svg{position:absolute;inset:0;width:100%;height:100%}
.stage .ch3{cursor:grab}
.ov{overflow:visible}
.h{cursor:grab;fill:#fff;stroke:var(--ae-p);stroke-width:2.2;outline:none}
.h:hover,.h:focus-visible{fill:var(--ae-p)}
.h.axis{stroke-dasharray:3 2}
.h.sel{fill:var(--ae-p);stroke:#fff}
.hl{fill:none;stroke:var(--ae-p);stroke-width:1;stroke-dasharray:4 3;opacity:.55;pointer-events:none}
.bar{display:flex;flex-wrap:wrap;gap:6px;padding:10px;align-items:center;border-top:1px solid var(--ae-line)}
.bar .sp{flex:1}
.btn{font:inherit;font-size:13px;border:1px solid var(--ae-line);background:var(--ae-bg);color:var(--ae-fg);padding:6px 10px;border-radius:9px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.btn:hover{border-color:var(--ae-p)}
.btn:disabled{opacity:.4;cursor:default}
.btn.p{background:var(--ae-p);border-color:var(--ae-p);color:#fff}
select.btn{padding:6px 28px 6px 10px;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239a9db0' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;background-size:14px}
select.btn option{background:var(--ae-soft);color:var(--ae-fg)}
.right{display:flex;flex-direction:column;min-width:0}
.tabs{display:flex;gap:2px;padding:8px 8px 0;overflow-x:auto;border-bottom:1px solid var(--ae-line);scrollbar-width:thin}
.tabs button{border-radius:9px 9px 0 0;white-space:nowrap;padding:8px 11px}
.tabs button[aria-selected=true]{color:var(--ae-fg);box-shadow:inset 0 -2px var(--ae-p)}
.panel{padding:14px;overflow:auto;max-height:560px;flex:1}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
.opt{font:inherit;font-size:11.5px;color:var(--ae-muted);background:var(--ae-soft);border:2px solid transparent;border-radius:12px;padding:4px 4px 5px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0}
.opt svg{width:100%;aspect-ratio:1;display:block}
.opt span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.opt:hover{border-color:var(--ae-line)}
.opt[aria-pressed=true]{border-color:var(--ae-p);background:var(--ae-p-soft);color:var(--ae-fg)}
.arts{grid-template-columns:none;grid-template-rows:repeat(2,auto);grid-auto-flow:column;grid-auto-columns:minmax(78px,86px);overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding-bottom:6px;scrollbar-width:thin}
.arts .opt{scroll-snap-align:start}
.arts i{width:100%;aspect-ratio:1;display:block;border-radius:8px;background:var(--ae-line);opacity:.5}
.arts img{width:100%;aspect-ratio:1;display:block}
h4{margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ae-muted);font-weight:600}
h4:first-child{margin-top:0}
.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 14px}
label.f{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ae-muted)}
label.f input[type=range]{accent-color:var(--ae-p);width:100%}
label.c{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ae-muted)}
input[type=color]{width:34px;height:28px;padding:0;border:1px solid var(--ae-line);border-radius:8px;background:none;cursor:pointer}
input[type=text],input[type=url]{font:inherit;width:100%;padding:7px 9px;border-radius:9px;border:1px solid var(--ae-line);background:var(--ae-soft);color:var(--ae-fg)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font:inherit;font-size:12.5px;border:1px solid var(--ae-line);background:var(--ae-soft);color:var(--ae-fg);padding:5px 10px;border-radius:999px;cursor:pointer}
.chip[aria-pressed=true]{border-color:var(--ae-p);background:var(--ae-p-soft)}
.sw{display:flex;flex-wrap:wrap;gap:6px}
.sw button{width:24px;height:24px;border-radius:50%;border:2px solid var(--ae-bg);box-shadow:0 0 0 1px var(--ae-line);cursor:pointer}
.hint{font-size:12.5px;color:var(--ae-muted);margin:8px 0 0}
.card{border:1px solid var(--ae-line);border-radius:12px;padding:12px;background:var(--ae-soft)}
.sel-acc{margin-top:12px}
.hidden{display:none!important}
:host([simple]) [data-kind=image],:host([simple]) [data-bar=export]{display:none!important}
:host([simple]) .wrap{border:0;border-radius:0;background:transparent}
.alt{padding:18px;display:grid;gap:14px;max-width:640px}
.rh{display:flex;align-items:center;gap:10px}
.rh .chip{margin-left:auto}
.opt i.ph{display:block;aspect-ratio:1;border-radius:10px;background:var(--ae-line);opacity:.5;animation:ph 1.2s ease-in-out infinite alternate}
@keyframes ph{to{opacity:.15}}
.alt img{max-width:160px;border-radius:14px;border:1px solid var(--ae-line)}
.alt.cardv{max-width:none;grid-template-columns:minmax(220px,340px) minmax(220px,1fr);align-items:start;gap:22px}
.alt .tcard{padding:8px 0}
.alt .side{display:grid;gap:14px;align-content:start}
@media (max-width:640px){.alt.cardv{grid-template-columns:1fr}}
`;

const SWATCHES = ['#a0714f', '#f1c27d', '#fcd9b6', '#e0a97e', '#8d5524', '#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f8fafc', '#94a3b8', '#1f2937'];

/** Valor completo del editor a partir de un `look` de identidad (o parcial). */
export function normalizeEditorValue(v = {}) {
  const kind = KINDS.includes(v.kind) ? v.kind : 'character'; // 'realistic' (heredado) → character
  return {
    kind,
    character: normalizeCharacter(v.character || {}),
    material: MATERIALS.includes(v.material) ? v.material : 'plush',
    avatar: { url: typeof v.avatar?.url === 'string' ? v.avatar.url : '', body: v.avatar?.body === 'M' ? 'M' : 'F' },
    image: typeof v.image === 'string' ? v.image : '',
    card: { foil: CARD_FOILS.includes(v.card?.foil) ? v.card.foil : '' },
  };
}

/**
 * @param {HTMLElement} container
 * @param {{ value?: object, onChange?: (v:object)=>void, plush?: boolean, simple?: boolean, theme?: 'light'|'dark', locale?: string }} [opts]
 *   plush: false oculta el tipo «Personaje 3D» (se acepta también el antiguo `realistic: false`).
 *   locale: idioma de la interfaz ('es', 'en', 'pt'…); se puede cambiar luego con `el.lang = 'en'`.
 *   lookFree: async (characters[]) => boolean[]: qué caras están libres; las sugerencias al azar de la
 *   pestaña Estilos solo muestran las libres (en 7ots.com cada ot es único). Sin ella se muestran todas.
 */
export function createAvatarEditor(container, opts = {}) {
  const el = document.createElement('ots-avatar-editor');
  if (opts.plush === false || opts.realistic === false) el.setAttribute('no-plush', '');
  if (opts.simple) el.setAttribute('simple', ''); // sin selector de tipo ni exportar (p. ej. la portada)
  if (opts.theme) el.setAttribute('theme', opts.theme);
  if (opts.locale) el.setAttribute('lang', opts.locale);
  if (opts.identity || opts.otsId) el.identity = { ...(opts.identity || {}), id: opts.otsId, createdAt: opts.createdAt };
  if (opts.lookFree) el.lookFree = opts.lookFree;
  if (opts.value) el.value = opts.value;
  if (opts.onChange) el.addEventListener('change', (e) => opts.onChange(e.detail));
  container.appendChild(el);
  return {
    el,
    get value() { return el.value; },
    set value(v) { el.value = v; },
    destroy: () => el.remove(),
  };
}

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

export class AvatarEditor extends Base {
  static get observedAttributes() {
    return ['lang'];
  }

  constructor() {
    super();
    this._v = normalizeEditorValue();
    this._tab = 'styles';
    this._accGroup = 'head';
    this._sel = -1;
    this._sym = true;
    this._past = [];
    this._future = [];
    this._ready = false;
    this._t = translator(detectLocale());
  }

  /** Idioma en uso (resuelto: 'es', 'en', 'pt'…). Para cambiarlo, el atributo/propiedad `lang`. */
  get locale() {
    return this._t.locale;
  }

  attributeChangedCallback(name, prev, next) {
    if (name === 'lang' && prev !== next) this._applyLocale();
  }

  /** lang propio → idioma global si la página lo cambió → ancestro [lang] / <html lang> / navegador. */
  _resolveLocale() {
    const own = this.getAttribute('lang');
    if (own) return detectLocale(own);
    if (this._followGlobal) return getLocale();
    return detectLocale(this.parentElement?.closest?.('[lang]')?.getAttribute('lang'));
  }

  _applyLocale() {
    this._t = translator(this._resolveLocale());
    if (!this._ready) return;
    this._renderChrome();
    this._renderAll();
  }

  /** Datos de la carta (name, role, bio, tagline, id, createdAt); no forman parte del valor. */
  get identity() { return this._ident || {}; }
  set identity(i) {
    this._ident = { ...(i || {}) };
    if (this._ready && this._v.kind === 'image') this._renderImage();
  }

  get value() { return structuredClone(this._v); }
  set value(v) {
    this._v = normalizeEditorValue(v);
    this._past = [];
    this._future = [];
    this._sel = -1;
    if (this._ready) this._renderAll();
  }

  connectedCallback() {
    // Idioma global: si la página llama a setLocale() (y no hay lang propio), el editor lo sigue.
    this._offLocale?.();
    this._g0 = getLocale();
    this._offLocale = onLocaleChange((g) => {
      if (g !== this._g0) {
        this._g0 = g;
        this._followGlobal = true;
      }
      if (this._localeQueued) return; // addMessages emite una vez por idioma: agrupar
      this._localeQueued = true;
      queueMicrotask(() => {
        this._localeQueued = false;
        this._applyLocale();
      });
    });
    if (this._ready) return this._renderKind();
    this._ready = true;
    this._t = translator(this._resolveLocale());
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
      <div class="wrap">
        <div class="kinds" role="group"></div>
        <div class="body" data-view="character">
          <div class="left">
            <div class="stage">
              <div class="ch"></div>
              <div class="ch3 hidden"></div>
              <svg class="ov" viewBox="${VIEW.join(' ')}"></svg>
            </div>
            <div class="bar hidden" data-bar="material"></div>
            <div class="bar" data-bar="play"></div>
            <div class="bar" data-bar="export"></div>
          </div>
          <div class="right">
            <div class="tabs" role="tablist"></div>
            <div class="panel" role="tabpanel"></div>
          </div>
        </div>
        <div class="alt hidden" data-view="image"></div>
      </div>`;
    this.$ = (s) => root.querySelector(s);
    this.$$ = (s) => [...root.querySelectorAll(s)];
    this._ch = createCharacter(this.$('.ch'), this._v.character, { fit: VIEW.join(' '), title: this._t('editor.preview') });
    this._ov = this.$('.ov');
    this._renderChrome();

    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e, false));
    root.addEventListener('change', (e) => this._onInput(e, true));
    this._ov.addEventListener('pointerdown', (e) => this._onDown(e));
    this._ov.addEventListener('keydown', (e) => this._onHandleKey(e));
    this._ov.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.$('.stage').addEventListener('pointermove', (e) => { if (!this._drag) this._pv.lookAtPoint(e.clientX, e.clientY); });
    this.$('.stage').addEventListener('pointerleave', () => this._pv.lookAt(0, 0));
    this.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.composedPath()[0];
      if (t?.tagName === 'INPUT' && t.type === 'text') return;
      e.preventDefault();
      e.shiftKey ? this._redo() : this._undo();
    });
    this._renderAll();
  }

  disconnectedCallback() {
    this._artIO?.disconnect();
    this._speech?.stop?.();
    this._offLocale?.();
    this._offLocale = null;
    cancelAnimationFrame(this._raf3);
    this._raf3 = 0;
    this._ch3?.destroy();
    this._dropCard();
    this._ch3 = null;
    this._ch3P = null;
  }

  // ───────────── vista previa 3D ─────────────

  /** Vista previa activa: la 3D en «Personaje 3D» (si cargó), si no la 2D. Misma API. */
  get _pv() {
    return this._v.kind === 'plush' && this._ch3 ? this._ch3 : this._ch;
  }

  /** Carga (una vez) el ot 3D en la vista previa. Si falla, se queda la 2D con un aviso. */
  _mount3d() {
    if (this._ch3 || this._ch3P) return;
    const p = (this._ch3P = loadCharacter3D()
      .then((m) => {
        if (!this.isConnected || this._ch3P !== p) return;
        this._ch3 = m.createCharacter3D(this.$('.ch3'), this._v.character, {
          material: this._v.material, orbit: true, stage: { key: 'overlay', zIndex: 2147483001, maxDpr: 1.5 },
        });
        if (this._ch3.fallback) throw new Error('webgl');
        this._ch3.mood(this.$('[data-a=mood]')?.value || 'neutral', { fx: false });
        this._renderKind();
      })
      .catch((err) => {
        console.warn('[7ots] vista previa 3D no disponible:', err?.message || err);
        this._ch3?.destroy?.();
        this._ch3 = null;
        this._failed3d = true;
        if (!this.isConnected) return;
        this._renderKind();
        this._msg?.(this._t('editor.plush.unavailable'));
      }));
  }

  /** Actualiza la vista 3D como mucho una vez por frame (reconstruir la geometría cuesta). */
  _sync3d() {
    if (!this._ch3 || this._raf3) return;
    this._raf3 = requestAnimationFrame(() => {
      this._raf3 = 0;
      this._ch3?.update(this._v.character, { material: this._v.material });
    });
  }

  // ───────────── estado ─────────────

  get _c() { return this._v.character; }

  /** Cambia el personaje. commit=false durante un arrastre o un slider (sin historial). */
  _set(mut, { commit = true, panel = true } = {}) {
    if (!this._pending) this._pending = structuredClone(this._v);
    const next = structuredClone(this._c);
    mut(next);
    this._v.character = normalizeCharacter(next);
    this._ch.update(this._v.character);
    this._sync3d();
    this._drawOverlay();
    if (commit) this._commit(panel);
  }

  _commit(panel = true) {
    if (this._pending) {
      this._past.push(this._pending);
      if (this._past.length > 100) this._past.shift();
      this._future = [];
      this._pending = null;
    }
    if (panel) this._renderPanel();
    this._syncBar();
    this.dispatchEvent(new CustomEvent('change', { detail: this.value, bubbles: true, composed: true }));
  }

  _setMeta(mut) {
    this._pending = structuredClone(this._v);
    mut(this._v);
    this._commit(false);
    this._renderKind();
  }

  _undo() {
    if (!this._past.length) return;
    this._future.push(structuredClone(this._v));
    this._v = this._past.pop();
    this._afterHistory();
  }
  _redo() {
    if (!this._future.length) return;
    this._past.push(structuredClone(this._v));
    this._v = this._future.pop();
    this._afterHistory();
  }
  _afterHistory() {
    this._sel = Math.min(this._sel, this._c.accessories.length - 1);
    this._renderAll();
    this.dispatchEvent(new CustomEvent('change', { detail: this.value, bubbles: true, composed: true }));
  }

  // ───────────── render ─────────────

  _renderAll() {
    this._ch.update(this._c);
    this._sync3d();
    this._renderKind();
    this._renderPanel();
    this._drawOverlay();
    this._syncBar();
  }

  /** Textos fijos (tipos, barras, pestañas) en el idioma actual. */
  _renderChrome() {
    const t = this._t;
    const kinds = this.$('.kinds');
    kinds.setAttribute('aria-label', t('editor.kinds.label'));
    kinds.innerHTML = KINDS.filter((k) => k !== 'plush' || !(this.hasAttribute('no-plush') || this.hasAttribute('no-realistic')))
      .map((k) => `<button type="button" data-kind="${k}">${esc(t(`editor.kinds.${k}`))}</button>`)
      .join('');
    this._ov.setAttribute('aria-label', t('editor.controls'));
    this._ch.svg.setAttribute('aria-label', t('editor.preview'));
    const mood = this.$('[data-a=mood]')?.value || 'neutral';
    this.$('[data-bar=play]').innerHTML = `
      <button class="btn" type="button" data-a="undo" title="${esc(t('editor.undoTitle', { keys: 'Ctrl+Z' }))}" aria-label="${esc(t('editor.undo'))}">↶</button>
      <button class="btn" type="button" data-a="redo" title="${esc(t('editor.redoTitle', { keys: 'Ctrl+Shift+Z' }))}" aria-label="${esc(t('editor.redo'))}">↷</button>
      <button class="btn" type="button" data-a="random" title="${esc(t('editor.randomTitle'))}">🎲 ${esc(t('editor.random'))}</button>
      <span class="sp"></span>
      <button class="btn" type="button" data-a="talk">🗣 ${esc(t('editor.talk'))}</button>
      <select class="btn" data-a="mood" aria-label="${esc(t('editor.mood'))}">${CHARACTER_MOODS.map((m) => `<option value="${m}">${esc(partLabel(t, 'moods', m))}</option>`).join('')}</select>
      <select class="btn" data-a="gesture" aria-label="${esc(t('editor.gesture'))}"><option value="">${esc(t('editor.gesturePick'))}</option>${GESTURES.map((g) => `<option value="${g}">${esc(partLabel(t, 'gestures', g))}</option>`).join('')}</select>
      <select class="btn" data-a="morph" aria-label="${esc(t('editor.morph'))}"><option value="">${esc(t('editor.morphPick'))}</option>${MORPHS.map((m) => `<option value="${m}">${esc(partLabel(t, 'morphs', m))}</option>`).join('')}</select>`;
    this.$('[data-a=mood]').value = mood;
    this.$('[data-bar=material]').innerHTML = `<span class="hint" style="margin:0">${esc(t('editor.plush.material'))}</span>
      <span class="chips">${MATERIALS.map((m) => `<button type="button" class="chip" data-material="${m}">${esc(t(`editor.plush.materials.${m}`))}</button>`).join('')}</span>
      <span class="hint" style="margin:0">${esc(t('editor.plush.hint'))}</span>`;
    this.$('[data-bar=export]').innerHTML = `
      <button class="btn" type="button" data-a="svg">⬇ SVG</button>
      <button class="btn" type="button" data-a="png">⬇ PNG</button>
      <button class="btn" type="button" data-a="json">⧉ ${esc(t('editor.copyJson'))}</button>
      <span class="sp"></span>
      <span class="hint" data-msg aria-live="polite"></span>`;
    this.$('.tabs').innerHTML = TABS.map((id) => `<button type="button" role="tab" data-tab="${id}">${esc(t(`editor.tabs.${id}`))}</button>`).join('');
  }

  _syncBar() {
    this.$('[data-a=undo]').disabled = !this._past.length;
    this.$('[data-a=redo]').disabled = !this._future.length;
  }

  _renderKind() {
    const k = this._v.kind;
    const plush = k === 'plush';
    this.$$('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
    // «Personaje 3D» comparte la vista del 2D (mismas pestañas); solo cambia la vista previa
    this.$$('[data-view]').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== (plush ? 'character' : k)));
    if (plush && !this._failed3d) this._mount3d();
    const show3d = plush && !!this._ch3;
    this.$('.ch').classList.toggle('hidden', show3d);
    this.$('.ch3').classList.toggle('hidden', !show3d);
    this.$('.ov').classList.toggle('hidden', plush);
    this.$('[data-bar=material]').classList.toggle('hidden', !plush);
    this.$$('[data-material]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.material === this._v.material)));
    if (k === 'image') this._renderImage();
    else this._dropCard();
  }

  _dropCard() {
    if (!this._card) return;
    this._card.destroy();
    this._card = null;
    this.$('[data-view=image]').innerHTML = '';
  }

  _renderImage() {
    const img = this._v.image;
    const t = this._t;
    const view = this.$('[data-view=image]');
    const id = this.identity;
    const look = { ...(id.look || {}), kind: 'image', image: /^https?:\/\//.test(img) ? img : '', character: this._v.character };
    const data = { identity: { ...id, look }, id: id.id, createdAt: id.createdAt, foil: this._v.card.foil, locale: this.locale };
    const foil = this._v.card.foil;
    if (!view.querySelector('.tcard')) {
      view.classList.add('cardv');
      view.innerHTML = `<div class="tcard"></div><div class="side"></div>`;
      this._card?.destroy();
      this._card = createTradingCard(view.querySelector('.tcard'), data);
    } else this._card.update(data);
    view.querySelector('.side').innerHTML = `
      <div><h4>${esc(t('editor.image.title'))}</h4><p class="hint" style="margin:0">${esc(t('editor.image.intro'))}</p></div>
      <div><span class="hint" style="margin:0 0 6px;display:block">${esc(t('editor.image.foil'))}</span>
        <span class="chips"><button type="button" class="chip" data-foil="" aria-pressed="${!foil}">${esc(t('editor.image.foils.auto'))}</button>${CARD_FOILS.map((f) => `<button type="button" class="chip" data-foil="${f}" aria-pressed="${foil === f}">${esc(t(`editor.image.foils.${f}`))}</button>`).join('')}</span></div>
      <label class="f">${esc(t('editor.image.url'))}<input type="url" data-m="image" placeholder="${esc(t('editor.image.placeholder'))}" value="${esc(img)}"></label>
      <p class="hint" style="margin:0">${esc(t('editor.image.hint'))}</p>`;
  }

  _thumbView(kind) {
    if (kind === 'face') {
      const L = layout(this._c);
      const s = Math.max(L.box.w * 0.82, (L.mouthY - L.eyeY) * 2.4);
      return `${L.cx - s / 2} ${(L.eyeY + L.mouthY) / 2 - s / 2 - L.r * 0.4} ${s} ${s}`;
    }
    return '-25 -55 250 260';
  }

  /** Rejilla de miniaturas; `kind` es el tipo de pieza del catálogo de textos (ver partLabel). */
  _grid(kind, items, current, attr, mk, view, pressed = (it) => it.id === current) {
    return `<div class="grid">${items
      .map((it) => {
        const label = esc(partLabel(this._t, kind, it.id));
        return `<button type="button" class="opt" ${attr}="${it.id}" aria-pressed="${pressed(it)}" title="${label}">${renderCharacter({ ...mk(it), style: 'none' }, { open: 0 }, { viewBox: view })}<span>${label}</span></button>`;
      })
      .join('')}</div>`;
  }

  /**
   * Sugerencias al azar que nadie tiene (si hay `lookFree`): reemplazan a los estilos fijos, que en
   * 7ots.com ya estarían tomados. Se piden de a lotes y se guardan hasta que se pida «Otros».
   */
  _randomGrid(view) {
    if (!this._rand) {
      this._loadRandoms();
      return `<div class="grid">${'<button type="button" class="opt" disabled><i class="ph"></i></button>'.repeat(RANDOM_N)}</div>`;
    }
    return `<div class="grid">${this._rand
      .map((ch, i) => `<button type="button" class="opt" data-rand="${i}" title="🎲">${renderCharacter({ ...ch, style: 'none' }, { open: 0 }, { viewBox: view })}</button>`)
      .join('')}</div>`;
  }

  async _loadRandoms() {
    if (this._randBusy) return;
    this._randBusy = true;
    const out = [];
    try {
      for (let round = 0; round < 4 && out.length < RANDOM_N; round++) {
        const batch = Array.from({ length: RANDOM_N + 4 }, () => normalizeCharacter(randomCharacter()));
        let free = batch.map(() => true);
        if (this.lookFree) free = await Promise.resolve(this.lookFree(batch)).catch(() => free);
        out.push(...batch.filter((_, i) => free?.[i] !== false));
      }
    } finally {
      this._randBusy = false;
    }
    this._rand = out.slice(0, RANDOM_N);
    if (this._ready && this._tab === 'styles') this._renderPanel();
  }

  /**
   * Tira de estilos artísticos (styles.js): el personaje actual en cada estilo, con su fondo.
   * Son muchos SVG con filtros: cada miniatura se rasteriza una vez como <img> estática, solo
   * cuando entra en vista, y se recuerda mientras el personaje (salvo el estilo) no cambie.
   */
  _artStyles() {
    const cur = this._c.style || 'none';
    const opts = ART_STYLES.map((st) => {
      const label = esc(partLabel(this._t, 'styles', st.id));
      const src = this._artThumbs?.get(st.id);
      return `<button type="button" class="opt" data-artstyle="${st.id}" aria-pressed="${st.id === cur}" title="${label}">${src ? `<img alt="" src="${src}">` : '<i></i>'}<span>${label}</span></button>`;
    });
    return `<h4>${esc(this._t('editor.artStyle.title'))}</h4><div class="grid arts">${opts.join('')}</div><p class="hint">${esc(this._t('editor.artStyle.hint'))}</p>`;
  }

  /** Pinta las miniaturas pendientes de la tira según van apareciendo. */
  _lazyArtThumbs() {
    this._artIO?.disconnect();
    const strip = this.$('.arts');
    if (!strip) return;
    const { style, ...rest } = this._c;
    const view = this._thumbView('full');
    const key = JSON.stringify(rest) + view;
    if (this._artKey !== key) {
      this._artKey = key;
      this._artThumbs = new Map();
      strip.querySelectorAll('img').forEach((img) => img.replaceWith(document.createElement('i')));
    }
    const fill = (btn) => {
      const ph = btn.querySelector('i');
      if (!ph) return;
      const id = btn.dataset.artstyle;
      let src = this._artThumbs.get(id);
      if (!src) {
        src = `data:image/svg+xml,${encodeURIComponent(renderCharacter({ ...rest, style: id }, { open: 0 }, { viewBox: view }))}`;
        this._artThumbs.set(id, src);
      }
      const img = document.createElement('img');
      img.alt = '';
      img.src = src;
      ph.replaceWith(img);
    };
    const todo = [...strip.querySelectorAll('.opt')].filter((b) => b.querySelector('i'));
    if (!todo.length) return;
    if (typeof IntersectionObserver !== 'function') return todo.forEach(fill);
    this._artIO = new IntersectionObserver((entries, io) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        fill(e.target);
      }
    }, { root: strip, rootMargin: '0px 90px' });
    todo.forEach((b) => this._artIO.observe(b));
  }

  _range(path, key, min, max, step, value) {
    return `<label class="f">${esc(this._t(key))}<input type="range" data-k="${path}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }
  _color(path, key, value) {
    return `<label class="c"><input type="color" data-k="${path}" value="${value || '#000000'}">${esc(this._t(key))}</label>`;
  }

  _renderPanel() {
    this.$$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === this._tab)));
    const c = this._c;
    const t = this._t;
    const T = (key, vars) => esc(t(key, vars));
    const with_ = (patch) => ({ ...c, ...patch });
    const face = this._thumbView('face');
    const full = this._thumbView('full');
    let h = '';
    switch (this._tab) {
      case 'styles':
        h = `${this._artStyles()}<h4 class="rh">${T('editor.styles.title')}<button type="button" class="chip" data-a="reroll">🎲 ${T('editor.styles.more')}</button></h4>${this._randomGrid(full)}
          <p class="hint">${T('editor.styles.hint')}</p>
          <label class="c" style="margin-top:8px"><input type="checkbox" data-keep-body ${this._keepBody ? 'checked' : ''}> ${T('editor.styles.keepBody')}</label>`;
        break;
      case 'shape':
        h = `<h4>${T('editor.shape.title')}</h4>${this._grid('shapes', SHAPES, c.body.points ? '' : c.body.shape, 'data-shape', (s) => with_({ body: { ...c.body, shape: s.id, points: null } }), full)}
          <h4>${T('editor.shape.deform')}</h4>
          <p class="hint" style="margin-top:0">${T('editor.shape.hint')}</p>
          <div class="chips" style="margin-top:8px">
            <button type="button" class="chip" data-a="sym" aria-pressed="${this._sym}">↔ ${T('editor.shape.symmetry')}</button>
            <button type="button" class="chip" data-a="reshape" ${c.body.points ? '' : 'disabled'}>${T('editor.shape.reset')}</button>
            <button type="button" class="chip" data-a="squash">${T('editor.shape.wider')}</button>
            <button type="button" class="chip" data-a="stretch">${T('editor.shape.taller')}</button>
          </div>`;
        break;
      case 'color':
        h = `<h4>${T('editor.color.body')}</h4><div class="sw">${SWATCHES.map((s) => `<button type="button" data-swatch="${s}" style="background:${s}" title="${s}" aria-label="${T('editor.color.swatch', { color: s })}"></button>`).join('')}</div>
          <div class="row" style="margin-top:10px">${this._color('body.color', 'editor.color.custom', c.body.color)}</div>
          <h4>${T('editor.color.finish')}</h4>${this._grid('finishes', FINISHES, c.finish, 'data-finish', (f) => with_({ finish: f.id }), full)}
          <h4>${T('editor.color.texture')}</h4>${this._grid('textures', TEXTURES, c.texture, 'data-texture', (x) => with_({ texture: x.id }), full)}
          <h4>${T('editor.color.outline')}</h4><div class="chips">${OUTLINES.map((v) => `<button type="button" class="chip" data-outline="${v}" aria-pressed="${c.outline === v}">${T(`editor.color.outlines.${v}`)}</button>`).join('')}</div>
          <h4>${T('editor.color.pattern')}</h4>${this._grid('patterns', PATTERNS, c.body.pattern, 'data-pattern', (p) => with_({ body: { ...c.body, pattern: p.id } }), full)}
          <div class="row" style="margin-top:10px">${this._color('body.patternColor', 'editor.color.patternColor', c.body.patternColor)}</div>`;
        break;
      case 'eyes':
        h = `<h4>${T('editor.eyes.title', { count: EYES.length })}</h4>${this._grid('eyes', EYES, c.eyes.type, 'data-eyes', (e) => with_({ eyes: { ...c.eyes, type: e.id } }), face)}
          <h4>${T('editor.settings')}</h4><div class="row">
            ${this._range('eyes.size', 'editor.size', 0.4, 2.2, 0.05, c.eyes.size)}
            ${this._range('eyes.spacing', 'editor.spacing', 0.3, 2, 0.05, c.eyes.spacing)}
            ${this._range('eyes.y', 'editor.height', -50, 50, 1, c.eyes.y)}
          </div><div class="row" style="margin-top:10px">
            ${this._color('eyes.iris', 'editor.eyes.iris', c.eyes.iris)}${this._color('eyes.white', 'editor.eyes.white', c.eyes.white)}${this._color('eyes.ink', 'editor.eyes.pupil', c.eyes.ink)}
          </div><p class="hint">${T('editor.eyes.hint')}</p>`;
        break;
      case 'mouth':
        h = `<h4>${T('editor.mouth.title', { count: MOUTHS.length })}</h4>${this._grid('mouths', MOUTHS, c.mouth.type, 'data-mouth', (m) => with_({ mouth: { ...c.mouth, type: m.id } }), face)}
          <h4>${T('editor.settings')}</h4><div class="row">
            ${this._range('mouth.size', 'editor.size', 0.4, 2.2, 0.05, c.mouth.size)}
            ${this._range('mouth.y', 'editor.height', -50, 50, 1, c.mouth.y)}
          </div><div class="row" style="margin-top:10px">
            ${this._color('mouth.color', 'editor.mouth.stroke', c.mouth.color || '#5b3b25')}${this._color('mouth.lipColor', 'editor.mouth.lipstick', c.mouth.lipColor)}
          </div><p class="hint">${T('editor.mouth.hint', { talk: t('editor.talk') })}</p>`;
        break;
      case 'face':
        h = `<h4>${T('editor.face.brows')}</h4>${this._grid('brows', BROWS, c.brows.type, 'data-brows', (b) => with_({ brows: { ...c.brows, type: b.id } }), face)}
          <div class="row" style="margin-top:10px">${this._color('brows.color', 'editor.face.browColor', c.brows.color || '#3f2a1d')}</div>
          <h4>${T('editor.face.cheeks')}</h4>${this._grid('cheeks', CHEEKS, c.cheeks.type, 'data-cheeks', (x) => with_({ cheeks: { ...c.cheeks, type: x.id } }), face)}
          <div class="row" style="margin-top:10px">${this._color('cheeks.color', 'editor.colorLabel', c.cheeks.color)}</div>`;
        break;
      case 'acc': {
        const on = new Set(c.accessories.map((a) => a.id));
        const list = ACCESSORIES.filter((a) => a.group === this._accGroup);
        const bare = { ...c, accessories: [] };
        h = `<div class="chips">${ACCESSORY_GROUPS.map(([g]) => `<button type="button" class="chip" data-accgroup="${g}" aria-pressed="${g === this._accGroup}">${esc(partLabel(t, 'groups', g))}</button>`).join('')}</div>
          <h4>${T('editor.acc.group', { group: partLabel(t, 'groups', this._accGroup) })}</h4>
          ${this._grid('accessories', list, '', 'data-acc', (a) => ({ ...bare, accessories: [{ id: a.id }] }), full, (a) => on.has(a.id))}
          ${this._accEditor()}`;
        break;
      }
    }
    const scroll = this.$('.arts')?.scrollLeft || 0;
    this.$('.panel').innerHTML = h;
    const strip = this.$('.arts');
    if (strip) {
      strip.scrollLeft = scroll;
      this._lazyArtThumbs();
    } else this._artIO?.disconnect();
  }

  _accEditor() {
    const list = this._c.accessories;
    const T = (key, vars) => esc(this._t(key, vars));
    if (!list.length) return `<p class="hint">${T('editor.acc.empty')}</p>`;
    const a = list[this._sel];
    return `<h4>${T('editor.acc.worn', { count: list.length })}</h4><div class="chips">${list
      .map((x, i) => `<button type="button" class="chip" data-selacc="${i}" aria-pressed="${i === this._sel}">${esc(partLabel(this._t, 'accessories', x.id))}</button>`)
      .join('')}</div>
      ${a ? `<div class="card sel-acc"><div class="row">
        ${this._range(`acc.${this._sel}.scale`, 'editor.size', 0.2, 3, 0.05, a.scale)}
        ${this._range(`acc.${this._sel}.rot`, 'editor.acc.rotation', -180, 180, 1, a.rot)}
        ${this._range(`acc.${this._sel}.x`, 'editor.acc.posX', -120, 120, 1, a.x)}
        ${this._range(`acc.${this._sel}.y`, 'editor.acc.posY', -120, 120, 1, a.y)}
      </div><div class="row" style="margin-top:10px">
        ${this._color(`acc.${this._sel}.color`, 'editor.colorLabel', a.color)}${this._color(`acc.${this._sel}.color2`, 'editor.acc.detail', a.color2)}
      </div><div class="chips" style="margin-top:10px">
        <button type="button" class="chip" data-a="accflip">⇋ ${T('editor.acc.flip')}</button>
        <button type="button" class="chip" data-a="accup">${T('editor.acc.front')}</button>
        <button type="button" class="chip" data-a="accdown">${T('editor.acc.back')}</button>
        <button type="button" class="chip" data-a="accreset">${T('editor.acc.reset')}</button>
        <button type="button" class="chip" data-a="accdel">✕ ${T('editor.acc.remove')}</button>
      </div><p class="hint">${T('editor.acc.hint')}</p></div>` : `<p class="hint">${T('editor.acc.select')}</p>`}`;
  }

  // ───────────── overlay (puntos arrastrables) ─────────────

  _drawOverlay() {
    const c = this._c;
    const t = this._t;
    const L = layout(c);
    let h = '';
    if (this._v.kind === 'character') {
      if (this._tab === 'shape') {
        const pts = bodyPoints(c);
        h += `<path class="hl" d="M${pts.map((p) => p.join(' ')).join('L')}Z"/>`;
        h += pts
          .map((p, i) => `<circle class="h${this._sym && (i === 0 || i === BODY_POINTS / 2) ? ' axis' : ''}" tabindex="0" role="slider" aria-label="${esc(t('editor.shape.point', { n: formatNumber(i + 1, t.locale) }))}" data-pt="${i}" cx="${p[0]}" cy="${p[1]}" r="5.5"/>`)
          .join('');
      }
      if (this._tab === 'eyes') h += `<circle class="h" tabindex="0" aria-label="${esc(t('editor.eyes.drag'))}" data-face="eyes" cx="${L.cx + L.sp}" cy="${L.eyeY}" r="${Math.max(6, L.r * 0.5)}"/>`;
      if (this._tab === 'mouth') h += `<circle class="h" tabindex="0" aria-label="${esc(t('editor.mouth.drag'))}" data-face="mouth" cx="${L.cx}" cy="${L.mouthY}" r="6"/>`;
      if (this._tab === 'acc') {
        c.accessories.forEach((a, i) => {
          const part = ACCESSORIES.find((x) => x.id === a.id);
          const at = L.anchors[part.anchor] || L.anchors.center;
          h += `<circle class="h${i === this._sel ? ' sel' : ''}" tabindex="0" aria-label="${esc(t('editor.acc.drag', { name: partLabel(t, 'accessories', part.id) }))}" data-acch="${i}" cx="${at.x + a.x}" cy="${at.y + a.y}" r="6"/>`;
        });
      }
    }
    this._ov.innerHTML = h;
    if (this._focusSel) {
      this._ov.querySelector(this._focusSel)?.focus();
      this._focusSel = null;
    }
  }

  _svgPoint(e) {
    const m = this._ov.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  _onDown(e) {
    const t = e.target;
    if (!(t instanceof SVGElement) || !t.classList.contains('h')) return;
    e.preventDefault();
    const start = this._svgPoint(e);
    if (!start) return;
    const c0 = structuredClone(this._c);
    let kind;
    if (t.dataset.pt) kind = ['pt', +t.dataset.pt];
    else if (t.dataset.face) kind = ['face', t.dataset.face];
    else if (t.dataset.acch) {
      kind = ['acc', +t.dataset.acch];
      if (this._sel !== kind[1]) {
        this._sel = kind[1];
        this._renderPanel();
      }
    } else return;
    this._drag = true;
    this._ov.setPointerCapture(e.pointerId);
    let raf = 0;
    let last = start;
    const move = (ev) => {
      last = this._svgPoint(ev) || last;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(false); });
    };
    const apply = (commit) => {
      const dx = last[0] - start[0];
      const dy = last[1] - start[1];
      this._set((n) => this._dragMut(n, c0, kind, dx, dy, last), { commit, panel: commit });
      if (!commit) this._drawOverlay();
    };
    const up = () => {
      cancelAnimationFrame(raf);
      this._ov.removeEventListener('pointermove', move);
      this._ov.removeEventListener('pointerup', up);
      this._ov.removeEventListener('pointercancel', up);
      this._drag = false;
      apply(true);
    };
    this._ov.addEventListener('pointermove', move);
    this._ov.addEventListener('pointerup', up);
    this._ov.addEventListener('pointercancel', up);
  }

  _dragMut(n, c0, [type, id], dx, dy, at) {
    if (type === 'pt') {
      const pts = structuredClone(c0.body.points || bodyPoints(c0));
      const i = id;
      const onAxis = i === 0 || i === BODY_POINTS / 2;
      pts[i] = [this._sym && onAxis ? pts[i][0] : at[0], at[1]];
      if (this._sym && !onAxis) {
        const j = (BODY_POINTS - i) % BODY_POINTS;
        pts[j] = [2 * AXIS - at[0], at[1]];
      }
      n.body.points = pts.map(([x, y]) => [Math.min(235, Math.max(-35, x)), Math.min(235, Math.max(-35, y))]);
    } else if (type === 'face' && id === 'eyes') {
      n.eyes.y = c0.eyes.y + dy;
      const L = layout(c0);
      n.eyes.spacing = c0.eyes.spacing * Math.max(0.1, (L.sp + dx) / L.sp);
    } else if (type === 'face' && id === 'mouth') {
      n.mouth.y = c0.mouth.y + dy;
    } else if (type === 'acc') {
      n.accessories[id].x = c0.accessories[id].x + dx;
      n.accessories[id].y = c0.accessories[id].y + dy;
    }
  }

  _onHandleKey(e) {
    const t = e.target;
    const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
    if (!d || !(t instanceof SVGElement)) return;
    e.preventDefault();
    const [dx, dy] = e.shiftKey ? [d[0] * 5, d[1] * 5] : d;
    const c0 = structuredClone(this._c);
    let kind;
    let sel;
    if (t.dataset.pt) {
      kind = ['pt', +t.dataset.pt];
      sel = `[data-pt="${t.dataset.pt}"]`;
    } else if (t.dataset.face) {
      kind = ['face', t.dataset.face];
      sel = `[data-face="${t.dataset.face}"]`;
    } else if (t.dataset.acch) {
      kind = ['acc', +t.dataset.acch];
      sel = `[data-acch="${t.dataset.acch}"]`;
    } else return;
    const cx = +t.getAttribute('cx');
    const cy = +t.getAttribute('cy');
    this._focusSel = sel;
    this._set((n) => this._dragMut(n, c0, kind, dx, dy, [cx + dx, cy + dy]), { panel: false });
  }

  _onWheel(e) {
    if (this._tab !== 'acc' || this._sel < 0) return;
    e.preventDefault();
    const i = this._sel;
    this._set((n) => {
      const a = n.accessories[i];
      if (e.shiftKey) a.rot = Math.max(-180, Math.min(180, a.rot + Math.sign(e.deltaY) * 5));
      else a.scale = Math.max(0.2, Math.min(3, a.scale * (e.deltaY > 0 ? 0.95 : 1.05)));
    }, { commit: false, panel: false });
    clearTimeout(this._wheelT);
    this._wheelT = setTimeout(() => this._commit(true), 350);
  }

  // ───────────── eventos del panel ─────────────

  _onClick(e) {
    const b = e.target.closest?.('button');
    if (!b) return;
    const d = b.dataset;
    const c = this._c;
    if (d.kind) {
      this._setMeta((v) => (v.kind = d.kind));
      return this._drawOverlay();
    }
    if (d.tab) {
      this._tab = d.tab;
      this._renderPanel();
      this._drawOverlay();
      return;
    }
    if (d.rand) {
      const pick = structuredClone(this._rand?.[+d.rand]);
      if (!pick) return;
      return this._set((n) => {
        const keep = this._keepBody ? { body: n.body, finish: n.finish } : {};
        Object.assign(n, pick, keep, { style: n.style });
      });
    }
    if (d.preset) return this._set((n) => Object.assign(n, applyPreset(n, d.preset, this._keepBody ? ['body', 'finish'] : [])));
    if (d.artstyle) return this._set((n) => { n.style = d.artstyle; });
    if (d.shape) return this._set((n) => { n.body.shape = d.shape; n.body.points = null; });
    if (d.swatch) return this._set((n) => { n.body.color = d.swatch; });
    if (d.finish) return this._set((n) => { n.finish = d.finish; });
    if (d.texture) return this._set((n) => { n.texture = d.texture; });
    if (d.outline) return this._set((n) => { n.outline = d.outline; });
    if (d.pattern) return this._set((n) => { n.body.pattern = d.pattern; });
    if (d.eyes) return this._set((n) => { n.eyes.type = d.eyes; });
    if (d.mouth) return this._set((n) => { n.mouth.type = d.mouth; });
    if (d.brows) return this._set((n) => { n.brows.type = d.brows; });
    if (d.cheeks) return this._set((n) => { n.cheeks.type = d.cheeks; });
    if (d.accgroup) {
      this._accGroup = d.accgroup;
      return this._renderPanel();
    }
    if (d.acc) {
      const i = c.accessories.findIndex((a) => a.id === d.acc);
      if (i >= 0) {
        this._sel = -1;
        return this._set((n) => n.accessories.splice(i, 1));
      }
      if (c.accessories.length >= MAX_ACC) return this._msg(this._t('editor.acc.max', { max: MAX_ACC }));
      this._sel = c.accessories.length;
      return this._set((n) => n.accessories.push({ id: d.acc }));
    }
    if (d.selacc) {
      this._sel = +d.selacc;
      this._renderPanel();
      return this._drawOverlay();
    }
    if (d.foil !== undefined) return this._setMeta((v) => (v.card = { foil: d.foil }));
    if (d.material) {
      this._setMeta((v) => (v.material = d.material));
      return this._sync3d();
    }
    const i = this._sel;
    switch (d.a) {
      case 'undo': return this._undo();
      case 'redo': return this._redo();
      case 'random': return this._set((n) => Object.assign(n, randomCharacter()));
      case 'reroll': this._rand = null; return this._renderPanel();
      case 'sym': this._sym = !this._sym; b.setAttribute('aria-pressed', String(this._sym)); return this._drawOverlay();
      case 'reshape': return this._set((n) => { n.body.points = null; });
      case 'squash':
      case 'stretch': {
        const k = d.a === 'squash' ? [1.08, 0.96] : [0.95, 1.06];
        return this._set((n) => {
          const pts = n.body.points || bodyPoints(n);
          const ys = pts.map((p) => p[1]);
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          n.body.points = pts.map(([x, y]) => [AXIS + (x - AXIS) * k[0], cy + (y - cy) * k[1]]);
        });
      }
      case 'accflip': return this._set((n) => { n.accessories[i].flip = !n.accessories[i].flip; });
      case 'accreset': return this._set((n) => Object.assign(n.accessories[i], { x: 0, y: 0, scale: 1, rot: 0, flip: false }));
      case 'accdel': this._sel = -1; return this._set((n) => n.accessories.splice(i, 1));
      case 'accup':
      case 'accdown': {
        const j = d.a === 'accup' ? i + 1 : i - 1;
        if (j < 0 || j >= c.accessories.length) return;
        this._sel = j;
        return this._set((n) => { [n.accessories[i], n.accessories[j]] = [n.accessories[j], n.accessories[i]]; });
      }
      case 'talk': return this._talk();
      case 'svg': return this._download('avatar.svg', new Blob([this._exportSVG()], { type: 'image/svg+xml' }));
      case 'png': return this._png();
      case 'json':
        navigator.clipboard?.writeText(JSON.stringify(this._c, null, 2)).then(() => this._msg(this._t('editor.jsonCopied')), () => this._msg(this._t('editor.copyFailed')));
        return;
    }
  }

  _onInput(e, final) {
    const t = e.target;
    if (t.dataset?.a === 'mood' && final) {
      this._ch.mood(t.value);
      return this._ch3?.mood(t.value);
    }
    if (t.dataset?.a === 'gesture' && final) {
      if (t.value) this._pv.gesture(t.value);
      t.value = '';
      return;
    }
    if (t.dataset?.a === 'morph' && final) {
      if (t.value) this._pv.morph(t.value);
      t.value = '';
      return;
    }
    if (t.hasAttribute?.('data-keep-body')) {
      this._keepBody = t.checked;
      return;
    }
    if (t.dataset?.m) {
      if (!final) return;
      return this._setMeta((v) => {
        if (t.dataset.m === 'image') v.image = t.value.trim();
      });
    }
    const k = t.dataset?.k;
    if (!k) return;
    const val = t.type === 'range' ? Number(t.value) : t.value;
    const [a, b, c] = k.split('.');
    this._set(
      (n) => {
        if (a === 'acc') n.accessories[+b][c] = val;
        else n[a][b] = val;
      },
      { commit: final, panel: false },
    );
  }

  // ───────────── utilidades ─────────────

  _talk() {
    // Lip-sync por visemas a partir de una frase de ejemplo (en el idioma del editor).
    this._speech?.stop?.();
    this._speech = this._pv.speak(this._t('editor.talkSample'));
  }

  _exportSVG() {
    const svg = renderCharacter(this._c, {}, { viewBox: this._ch.svg.getAttribute('viewBox'), title: 'Avatar 7ots' });
    return svg.replace('<svg ', '<svg width="512" height="576" ');
  }

  _png() {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([this._exportSVG()], { type: 'image/svg+xml' }));
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 576;
      cv.getContext('2d').drawImage(img, 0, 0, 512, 576);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => b && this._download('avatar.png', b));
    };
    img.onerror = () => { URL.revokeObjectURL(url); this._msg(this._t('editor.pngFailed')); };
    img.src = url;
  }

  _download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  _msg(s) {
    const m = this.$('[data-msg]');
    m.textContent = s;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => (m.textContent = ''), 2500);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ots-avatar-editor')) {
  customElements.define('ots-avatar-editor', AvatarEditor);
}
