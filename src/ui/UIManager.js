/**
 * UIManager — interfaz dinámica que el agente inyecta en la página anfitriona.
 *
 * Todo vive dentro de UN host `<div data-ots-root="overlay">` con Shadow DOM propio,
 * añadido a <body>: aparece "dentro" de la página (encima del contenido), pero ni el
 * CSS del sitio rompe nuestros estilos ni los nuestros rompen el sitio.
 *
 * Componentes:
 *   toast({message, type, duration})
 *   modal({title, content|template+data, actions, size}) → Promise<valor del botón | null>
 *   sidebar({title, content|template+data, side})         / closeSidebar()
 *   confirm({title, message, confirmText, cancelText})     → Promise<boolean>
 *   highlight(element, {message, duration})               → foco visual sobre un elemento real
 *   card({title, content, facts, target, actions})         → tarjeta de información junto a un elemento
 *   registerTemplate(name, (data, {escape}) => html)       → HTML rico de CONFIANZA (del dev)
 *
 * El contenido que genera el LLM pasa por renderMarkdown (sin HTML crudo). Las plantillas
 * son código del desarrollador: reciben datos del LLM y deben escaparlos con `escape`.
 */

import { escapeHtml, renderMarkdown } from './markdown.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

/**
 * Lleva un elemento al centro de la pantalla. Suave salvo si el usuario prefiere
 * menos movimiento o la pestaña está oculta (ahí el scroll suave no llega a ejecutarse).
 */
export function revealElement(el) {
  const instant = document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: instant ? 'instant' : 'smooth', block: 'center' });
}

export class UIManager {
  /**
   * @param {object} [o]
   * @param {object} [o.bus]
   * @param {object} [o.theme]
   * @param {(key: string, vars?: object) => string} [o.t]  traductor (por defecto, el idioma global)
   */
  constructor({ bus, theme = {}, t = translator() } = {}) {
    this.bus = bus;
    this.theme = theme;
    this.t = t;
    this.templates = new Map();
    this._host = null;
    this._root = null;
    this._seq = 0;
    this._highlights = new Set();
    this._card = null;
    /** Dónde abrir una tarjeta sin elemento: el widget pone aquí el avatar compañero. */
    this.cardAnchor = () => null;
  }

  /** Color principal en caliente (identidad nueva). */
  setPrimary(color) {
    this.theme = { ...this.theme, primary: color };
    this._host?.style.setProperty('--ots-primary', color);
  }

  mount() {
    if (this._host) return;
    this._host = document.createElement('div');
    this._host.setAttribute('data-ots-root', 'overlay');
    // El host no ocupa espacio ni captura clics; solo sus hijos lo hacen.
    this._host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    if (this.theme.primary) this._host.style.setProperty('--ots-primary', this.theme.primary);
    this._root = this._host.attachShadow({ mode: 'open' });
    this._root.innerHTML = `<style>${overlayCss(this.theme)}</style>
      <div class="toasts" part="toasts" aria-live="polite"></div>
      <div class="layer"></div>`;
    document.body.appendChild(this._host);
  }

  destroy() {
    this._highlights.forEach((h) => h.remove());
    this._host?.remove();
    this._host = this._root = null;
  }

  registerTemplate(name, render) {
    this.templates.set(name, render);
  }

  /** Renderiza contenido: plantilla del dev (confiable) o markdown del LLM (escapado). */
  renderContent({ content = '', template = null, data = null } = {}) {
    if (template) {
      const fn = this.templates.get(template);
      if (!fn) return `<p>${escapeHtml(content || '')}</p>`;
      try {
        return fn(data || {}, { escape: escapeHtml, markdown: renderMarkdown });
      } catch (err) {
        console.error('[7ots] plantilla falló', template, err);
        return `<p>${escapeHtml(content || '')}</p>`;
      }
    }
    return renderMarkdown(content);
  }

  // ───────────────────────────── Toast ─────────────────────────────

  toast({ message, type = 'info', duration = 5000 } = {}) {
    this.mount();
    const el = document.createElement('div');
    el.className = `toast ${['info', 'success', 'warning', 'error'].includes(type) ? type : 'info'}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<div class="toast-body">${renderMarkdown(message)}</div><button class="x" aria-label="${escapeHtml(this.t('widget.dialog.close'))}">×</button>`;
    const close = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector('.x').onclick = close;
    this._root.querySelector('.toasts').appendChild(el);
    if (duration > 0) setTimeout(close, Math.min(duration, 30000));
    return close;
  }

  // ───────────────────────────── Modal ─────────────────────────────

  /**
   * @returns {Promise<string|null>} valor del botón pulsado, o null si se cerró.
   */
  modal({ title = '', content = '', template = null, data = null, actions = [], size = 'md', dismissible = true } = {}) {
    this.mount();
    return new Promise((resolve) => {
      const id = `m${++this._seq}`;
      // Si la página tiene abierto un <dialog> modal, todo lo demás es inert: el nuestro se abre
      // también como modal nativo (capa superior, encima del suyo) para que se pueda pulsar.
      const overPageModal = !!document.querySelector('dialog:modal');
      const wrap = document.createElement(overPageModal ? 'dialog' : 'div');
      wrap.className = 'backdrop';
      wrap.innerHTML = `
        <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
          <header><h2 id="${id}-t">${escapeHtml(title)}</h2>${dismissible ? `<button class="x" aria-label="${escapeHtml(this.t('widget.dialog.close'))}">×</button>` : ''}</header>
          <div class="content">${this.renderContent({ content, template, data })}</div>
          ${actions.length ? `<footer>${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-i="${i}">${escapeHtml(a.label)}</button>`).join('')}</footer>` : ''}
        </div>`;
      const prevFocus = document.activeElement;
      const done = (value) => {
        wrap.classList.add('out');
        document.removeEventListener('keydown', onKey, true);
        wrap.close?.(); // el modal nativo se cierra ya: si no, la página sigue inert durante la animación
        setTimeout(() => wrap.remove(), 200);
        prevFocus?.focus?.();
        resolve(value);
      };
      const onKey = (e) => { if (e.key === 'Escape' && dismissible) { e.stopPropagation(); done(null); } };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap && dismissible) done(null);
        if (e.target.closest('.x')) done(null);
        const b = e.target.closest('button[data-i]');
        if (b) done(actions[Number(b.dataset.i)].value ?? actions[Number(b.dataset.i)].label);
      });
      this._root.querySelector('.layer').appendChild(wrap);
      if (overPageModal) {
        wrap.addEventListener('cancel', (e) => e.preventDefault()); // Esc lo gestiona onKey
        wrap.showModal();
      }
      (wrap.querySelector('.btn.primary') || wrap.querySelector('button'))?.focus();
    });
  }

  confirm({ title = this.t('widget.dialog.confirm'), message = '', confirmText = this.t('widget.dialog.ok'), cancelText = this.t('widget.dialog.cancel') } = {}) {
    return this.modal({
      title,
      content: message,
      size: 'sm',
      actions: [
        { label: cancelText, value: 'no' },
        { label: confirmText, value: 'yes', primary: true },
      ],
    }).then((v) => v === 'yes');
  }

  // ───────────────────────────── Sidebar ─────────────────────────────

  sidebar({ title = '', content = '', template = null, data = null, side = 'right' } = {}) {
    this.mount();
    this.closeSidebar();
    const el = document.createElement('aside');
    el.className = `sidebar ${side === 'left' ? 'left' : 'right'}`;
    el.setAttribute('role', 'complementary');
    el.innerHTML = `<header><h2>${escapeHtml(title)}</h2><button class="x" aria-label="${escapeHtml(this.t('widget.dialog.close'))}">×</button></header>
      <div class="content">${this.renderContent({ content, template, data })}</div>`;
    el.querySelector('.x').onclick = () => this.closeSidebar();
    this._root.querySelector('.layer').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    return () => this.closeSidebar();
  }

  closeSidebar() {
    const el = this._root?.querySelector('.sidebar');
    if (!el) return;
    el.classList.remove('in');
    setTimeout(() => el.remove(), 250);
  }

  closeAll() {
    this._root?.querySelectorAll('.backdrop').forEach((b) => b.querySelector('.x')?.click() ?? b.remove());
    this.closeSidebar();
    this.closeCard();
    this.clearHighlights();
  }

  // ───────────────────────────── Tarjeta ─────────────────────────────

  /**
   * Tarjeta de información que "despliega" el agente junto a un elemento de la página (o junto
   * al avatar): título, texto en markdown, datos clave y botones de pregunta rápida.
   * Solo hay una a la vez; sigue al elemento al hacer scroll.
   * @param {object} o
   * @param {Element|null} [o.target]
   * @param {{label:string, value:string}[]} [o.facts]
   * @param {{label:string, onClick:()=>void}[]} [o.actions]
   * @param {number} [o.duration] ms (0 = hasta que se cierre)
   */
  card({ title = '', content = '', facts = [], target = null, actions = [], duration = 0, tone = 'info' } = {}) {
    this.mount();
    this.closeCard();
    const el = document.createElement('div');
    el.className = `card ${['info', 'tip', 'warning', 'success'].includes(tone) ? tone : 'info'}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title || this.t('widget.dialog.info'));
    el.innerHTML = `
      <header><h3>${escapeHtml(title)}</h3><button class="x" aria-label="${escapeHtml(this.t('widget.dialog.close'))}">×</button></header>
      ${content ? `<div class="card-body">${renderMarkdown(content)}</div>` : ''}
      ${facts.length ? `<dl>${facts.slice(0, 8).map((f) => `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`).join('')}</dl>` : ''}
      ${actions.length ? `<footer>${actions.slice(0, 3).map((a, i) => `<button class="chip" data-i="${i}">${escapeHtml(a.label)}</button>`).join('')}</footer>` : ''}
      <span class="card-tail" aria-hidden="true"></span>`;
    const layer = this._root.querySelector('.layer');
    layer.appendChild(el);

    let raf = 0;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
      if (this._card === handle) this._card = null;
    };
    const handle = { close };
    this._card = handle;
    el.querySelector('.x').onclick = close;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      close();
      actions[Number(b.dataset.i)]?.onClick?.();
    });

    const tail = el.querySelector('.card-tail');
    const place = () => {
      if (closed) return;
      const anchor = target?.isConnected ? target : this.cardAnchor();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x;
      let y;
      let side = 'none';
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        // Preferencia: a la derecha, a la izquierda, debajo, encima.
        if (r.right + 16 + w < innerWidth - 8) [x, y, side] = [r.right + 16, r.top + r.height / 2 - h / 2, 'left'];
        else if (r.left - 16 - w > 8) [x, y, side] = [r.left - 16 - w, r.top + r.height / 2 - h / 2, 'right'];
        else if (r.bottom + 16 + h < innerHeight - 8) [x, y, side] = [r.left + r.width / 2 - w / 2, r.bottom + 16, 'top'];
        else [x, y, side] = [r.left + r.width / 2 - w / 2, r.top - 16 - h, 'bottom'];
      } else {
        [x, y] = [innerWidth - w - 24, innerHeight - h - 96];
      }
      x = Math.min(Math.max(8, x), innerWidth - w - 8);
      y = Math.min(Math.max(8, y), innerHeight - h - 8);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      tail.dataset.side = side;
      if (anchor && side !== 'none') {
        const r = anchor.getBoundingClientRect();
        if (side === 'left' || side === 'right') tail.style.top = `${Math.min(Math.max(14, r.top + r.height / 2 - y), h - 14)}px`;
        else tail.style.left = `${Math.min(Math.max(14, r.left + r.width / 2 - x), w - 14)}px`;
      }
      raf = requestAnimationFrame(place);
    };
    place();
    if (duration > 0) setTimeout(close, Math.min(duration, 120000));
    return close;
  }

  closeCard() {
    this._card?.close();
  }

  // ───────────────────────────── Highlight ─────────────────────────────

  /**
   * Dibuja un marco pulsante sobre un elemento REAL de la página (sin modificarlo)
   * y, opcionalmente, un globo con un mensaje. Sigue al elemento si hay scroll.
   */
  highlight(target, { message = '', duration = 6000, scroll = true } = {}) {
    if (!target) return () => {};
    this.mount();
    if (scroll) revealElement(target);
    const box = document.createElement('div');
    box.className = 'spot';
    const tip = message ? document.createElement('div') : null;
    if (tip) {
      tip.className = 'tip';
      tip.innerHTML = renderMarkdown(message);
    }
    const layer = this._root.querySelector('.layer');
    layer.appendChild(box);
    tip && layer.appendChild(tip);

    let raf = 0;
    const place = () => {
      if (!target.isConnected) return stop();
      const r = target.getBoundingClientRect();
      const pad = 6;
      Object.assign(box.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      if (tip) {
        const below = r.bottom + 12 + tip.offsetHeight < innerHeight;
        tip.style.top = `${below ? r.bottom + 12 : Math.max(8, r.top - tip.offsetHeight - 12)}px`;
        tip.style.left = `${Math.min(Math.max(8, r.left), innerWidth - tip.offsetWidth - 8)}px`;
      }
      raf = requestAnimationFrame(place);
    };
    const handle = { remove: () => stop() };
    const stop = () => {
      cancelAnimationFrame(raf);
      box.remove();
      tip?.remove();
      this._highlights.delete(handle);
    };
    this._highlights.add(handle);
    place();
    if (duration > 0) setTimeout(stop, duration);
    return stop;
  }

  clearHighlights() {
    [...this._highlights].forEach((h) => h.remove());
  }
}

function overlayCss(theme) {
  const primary = theme.primary || '#5b5bf0';
  const radius = theme.radius || '14px';
  const font = theme.font || 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  return `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .toasts, .layer { font-family: ${font}; }
  .toasts, .layer, .toast, .modal, .sidebar, .tip, .card {
    --bg: #ffffff; --fg: #1d1d27; --muted: #6b6b7b; --line: #e6e6ef; --primary: var(--ots-primary, ${primary});
  }
  @media (prefers-color-scheme: dark) {
    .toasts, .layer, .toast, .modal, .sidebar, .tip, .card { --bg: #1c1c24; --fg: #f1f1f5; --muted: #a3a3b3; --line: #33333f; }
  }
  .toasts { position: fixed; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 10px; max-width: min(380px, calc(100vw - 32px)); }
  .toast { pointer-events: auto; display: flex; gap: 10px; align-items: flex-start; background: var(--bg); color: var(--fg);
    border: 1px solid var(--line); border-left: 4px solid var(--primary); border-radius: ${radius}; padding: 12px 12px 12px 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,.15); font-size: 14px; line-height: 1.45; animation: in .25s ease; }
  .toast.success { border-left-color: #1f9d55; } .toast.warning { border-left-color: #d98e04; } .toast.error { border-left-color: #d64545; }
  .toast-body { flex: 1; } .toast-body p { margin: 0; }
  .out { opacity: 0; transform: translateY(-6px); transition: all .2s ease; }
  .x { all: unset; cursor: pointer; font-size: 20px; line-height: 1; color: var(--muted); padding: 2px 6px; border-radius: 6px; }
  .x:hover { background: rgba(127,127,127,.15); }
  dialog.backdrop { margin: 0; border: 0; width: 100%; height: 100%; max-width: none; max-height: none; color: inherit; }
  dialog.backdrop::backdrop { background: transparent; }
  .backdrop { position: fixed; inset: 0; background: rgba(10,10,20,.45); display: grid; place-items: center; pointer-events: auto; padding: 16px; animation: fade .2s ease; }
  .modal { background: var(--bg); color: var(--fg); border-radius: ${radius}; width: min(560px, 100%); max-height: calc(100vh - 32px);
    display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,.3); animation: in .22s ease; }
  .modal.sm { width: min(420px, 100%); } .modal.lg { width: min(820px, 100%); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 8px; }
  h2 { margin: 0; font-size: 18px; }
  .content { padding: 4px 18px 16px; overflow: auto; font-size: 15px; line-height: 1.55; }
  .content h2, .content h3, .content h4 { margin: 14px 0 6px; font-size: 15px; }
  .content a { color: var(--primary); }
  .content code { background: rgba(127,127,127,.15); padding: 1px 5px; border-radius: 5px; }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px 16px; border-top: 1px solid var(--line); flex-wrap: wrap; }
  .btn { all: unset; cursor: pointer; padding: 9px 16px; border-radius: 10px; border: 1px solid var(--line); font-size: 14px; font-weight: 500; }
  .btn:hover { background: rgba(127,127,127,.1); }
  .btn.primary { background: var(--primary); color: #fff; border-color: transparent; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn:focus-visible, .x:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .sidebar { position: fixed; top: 0; bottom: 0; width: min(380px, 92vw); background: var(--bg); color: var(--fg); pointer-events: auto;
    box-shadow: 0 0 40px rgba(0,0,0,.2); display: flex; flex-direction: column; transition: transform .25s ease; }
  .sidebar.right { right: 0; transform: translateX(105%); } .sidebar.left { left: 0; transform: translateX(-105%); }
  .sidebar.in { transform: none; }
  .spot { position: fixed; border: 3px solid var(--primary); border-radius: 10px; pointer-events: none;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 25%, transparent), 0 0 0 9999px rgba(10,10,20,.18);
    animation: pulse 1.4s ease-in-out infinite; }
  .tip { position: fixed; max-width: 300px; background: var(--primary); color: #fff; padding: 10px 12px; border-radius: 10px;
    font-size: 14px; line-height: 1.4; box-shadow: 0 8px 24px rgba(0,0,0,.2); pointer-events: none; }
  .tip p { margin: 0; } .tip a { color: #fff; }
  .card { position: fixed; left: 0; top: 0; width: min(320px, calc(100vw - 16px)); background: var(--bg); color: var(--fg);
    border: 1px solid var(--line); border-top: 4px solid var(--primary); border-radius: ${radius}; pointer-events: auto;
    box-shadow: 0 16px 44px rgba(0,0,0,.22); font-size: 14px; line-height: 1.45; animation: pop .28s cubic-bezier(.2,1.4,.4,1); }
  .card.tip { border-top-color: #1f9d55; } .card.warning { border-top-color: #d98e04; } .card.success { border-top-color: #1f9d55; }
  .card header { padding: 12px 12px 4px 14px; }
  .card h3 { margin: 0; font-size: 15px; }
  .card-body { padding: 0 14px 8px; } .card-body p { margin: 0 0 6px; } .card-body ul { margin: 0 0 6px; padding-left: 18px; }
  .card dl { margin: 0; padding: 4px 14px 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .card dl div { background: color-mix(in srgb, var(--primary) 8%, transparent); border-radius: 8px; padding: 6px 8px; }
  .card dt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .card dd { margin: 2px 0 0; font-weight: 600; }
  .card footer { border: 0; padding: 4px 14px 12px; justify-content: flex-start; gap: 6px; }
  .chip { all: unset; cursor: pointer; font-size: 13px; padding: 6px 10px; border-radius: 999px; color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 45%, transparent); }
  .chip:hover { background: color-mix(in srgb, var(--primary) 10%, transparent); }
  .chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .card-tail { position: absolute; width: 12px; height: 12px; background: var(--bg); border: 1px solid var(--line); transform: rotate(45deg); }
  .card-tail[data-side="none"] { display: none; }
  .card-tail[data-side="left"] { left: -7px; margin-top: -6px; border-top-color: transparent; border-right-color: transparent; }
  .card-tail[data-side="right"] { right: -7px; margin-top: -6px; border-bottom-color: transparent; border-left-color: transparent; }
  .card-tail[data-side="top"] { top: -8px; margin-left: -6px; border-bottom-color: transparent; border-right-color: transparent; }
  .card-tail[data-side="bottom"] { bottom: -7px; margin-left: -6px; border-top-color: transparent; border-left-color: transparent; }
  .card.out { opacity: 0; transition: opacity .18s ease; }
  @keyframes pop { from { opacity: 0; scale: .85; } }
  @keyframes in { from { opacity: 0; transform: translateY(8px) scale(.98); } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pulse { 50% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--primary) 15%, transparent), 0 0 0 9999px rgba(10,10,20,.18); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;
}
