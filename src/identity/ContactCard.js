/**
 * <ots-identity> — tarjeta de contacto de un agente: quién es y cómo hablar con él.
 *
 *   <ots-identity src="/api/agent/identity"></ots-identity>
 *   <ots-identity src="https://otro-sitio.com/.well-known/7ots-agent.json" face></ots-identity>
 *
 * Atributos:
 *   src       URL de la tarjeta (defecto /api/agent/identity). También: `el.identity = {...}`.
 *   endpoint  proxy de 7ots para videollamadas y voz (defecto: el de `src` si acaba en /identity)
 *   face      muestra la cara viva (createFace) con un botón «Escuchar»
 *   greeting  lo que dice al pulsar «Escuchar» (defecto: se presenta)
 *   compact   versión en una línea
 *   lang      idioma de la interfaz ('es', 'en', 'pt'…). También `el.lang = 'en'`; se aplica en caliente.
 *             Sin él: el del ancestro con [lang] / <html lang> / navegador (detectLocale), y sigue a
 *             setLocale() si la página cambia el idioma global. No se usa `identity.language` para
 *             los botones (la tarjeta la lee el visitante), pero sí para el saludo de «Escuchar»,
 *             que dice la voz del agente en su idioma.
 *
 * Botones según la tarjeta: chatear aquí (si hay un <ots-agent> en la página), correo,
 * @handle de apuchat (copiar), videollamada en meet.apuchat.com y guardar contacto (vCard).
 * Eventos: `ots-identity:load` { identity }, `ots-identity:call` { url }, `ots-identity:error`.
 */

import { defineIdentity } from './schema.js';
import { createFace } from './Face.js';
import { translator, detectLocale, getLocale, onLocaleChange } from '../i18n/index.js';
import '../i18n/messages/identity.js';

export class IdentityCard extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'endpoint', 'face', 'compact', 'greeting', 'lang'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._card = null;
    this._face = null;
    this._t = translator(detectLocale());
  }

  /** Idioma en uso (resuelto). Para cambiarlo, el atributo/propiedad `lang`. */
  get locale() {
    return this._t.locale;
  }

  /** lang propio → idioma global si la página lo cambió → ancestro [lang] / <html lang> / navegador. */
  _resolveLocale() {
    const own = this.getAttribute('lang');
    if (own) return detectLocale(own);
    if (this._followGlobal) return getLocale();
    return detectLocale(this.parentElement?.closest?.('[lang]')?.getAttribute('lang'));
  }

  connectedCallback() {
    this.setAttribute('data-ots-ignore', ''); // la proactividad del widget no reacciona a la tarjeta
    this._t = translator(this._resolveLocale());
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
        this._relocalize();
      });
    });
    if (!this._card && !this._loading) this._load();
  }

  disconnectedCallback() {
    this._face?.destroy();
    this._face = null;
    this._offLocale?.();
    this._offLocale = null;
  }

  attributeChangedCallback(name, prev, next) {
    if (prev === next || !this.isConnected) return;
    if (name === 'lang') this._relocalize();
    else if (name === 'src') this._load();
    else if (this._card) this._render();
  }

  /** Vuelve a pintar en el idioma actual (sin recargar la tarjeta). */
  _relocalize() {
    const next = translator(this._resolveLocale());
    const changed = next.locale !== this._t.locale;
    this._t = next;
    if (!this.isConnected) return;
    if (this._card) {
      // La cara viva no tiene textos visibles: solo se rehace si cambia el idioma de verdad.
      if (changed || !this.hasAttribute('face')) this._render();
    } else if (this._failed) this._renderError();
  }

  _renderError() {
    this.shadowRoot.innerHTML = `<style>${css()}</style><div class="card error">${esc(this._t('identity.card.loadError'))}</div>`;
  }

  /** Tarjeta actual (normalizada). Asignar un objeto la pinta sin pedir nada a la red. */
  get identity() {
    return this._card;
  }
  set identity(v) {
    this._gen = (this._gen || 0) + 1; // una carga en curso ya no pisa lo asignado
    this._raw = v;
    this._card = normalizeCard(v);
    this._render();
  }

  get endpoint() {
    const e = this.getAttribute('endpoint');
    if (e) return e.replace(/\/$/, '');
    const src = this.getAttribute('src') || '/api/agent/identity';
    return /\/identity$/.test(src) ? src.replace(/\/identity$/, '') : '';
  }

  async _load() {
    if (this._raw && !this.hasAttribute('src')) return this._render();
    const src = this.getAttribute('src') || '/api/agent/identity';
    const gen = (this._gen = (this._gen || 0) + 1);
    this._loading = true;
    this._failed = false;
    this.shadowRoot.innerHTML = `<style>${css()}</style><div class="card loading" aria-busy="true" aria-label="${esc(this._t('identity.card.loading'))}"><div class="sk"></div></div>`;
    try {
      const r = await fetch(src, { credentials: 'omit' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (gen !== this._gen) return;
      this._card = normalizeCard(data);
      this._render();
      this.dispatchEvent(new CustomEvent('ots-identity:load', { detail: { identity: this._card }, bubbles: true }));
    } catch (e) {
      if (gen !== this._gen) return;
      this._failed = true;
      this._renderError();
      this.dispatchEvent(new CustomEvent('ots-identity:error', { detail: { error: e }, bubbles: true }));
    } finally {
      this._loading = false;
    }
  }

  _render() {
    const c = this._card;
    if (!c) return;
    this._face?.destroy();
    this._face = null;
    const compact = this.hasAttribute('compact');
    const live = this.hasAttribute('face');
    const ep = this.endpoint;
    const hasWidget = !!document.querySelector('ots-agent');
    const initial = esc((c.look.emoji || c.name.slice(0, 1)).toUpperCase());
    const portrait = c.look.image ? `<img src="${esc(c.look.image)}" alt="" referrerpolicy="no-referrer">` : `<span>${initial}</span>`;
    const ans = c.contact.answers || {};
    const t = this._t;
    const btn = (act, icon, label, sub = '') =>
      `<button class="act" data-act="${act}">${ICON[icon]}<span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
    const actions = [
      hasWidget ? btn('chat', 'chat', t('identity.card.chat'), t('identity.card.chatSub')) : '',
      c.contact.email ? btn('mail', 'mail', t('identity.card.mail'), ans.email ? t('identity.card.mailInstant', { email: c.contact.email }) : c.contact.email) : '',
      c.contact.apuchat ? btn('apuchat', 'at', `@${c.contact.apuchat}`, ans.apuchat ? t('identity.card.apuchatInstant') : t('identity.card.apuchatSub')) : '',
      c.contact.call && ep ? btn('call', 'video', t('identity.card.call'), t('identity.card.callSub')) : '',
      live ? btn('listen', 'voice', t('identity.card.listen')) : '',
      ep ? `<a class="act" href="${esc(`${ep}/identity.vcf`)}" download="${esc(c.id)}.vcf">${ICON.card}<span><b>${esc(t('identity.card.save'))}</b><small>${esc(t('identity.card.saveSub'))}</small></span></a>` : '',
    ].filter(Boolean);
    const langs = [...new Set([c.language, ...c.languages].filter(Boolean))];

    this.shadowRoot.innerHTML = `<style>${css()}</style>
      <article class="card ${compact ? 'compact' : ''}" style="--p:${esc(c.look.color)};--a:${esc(c.look.accent)}" aria-label="${esc(t('identity.card.label', { name: c.name }))}">
        <header>
          <div class="pic ${live ? 'live' : ''}">${live ? '' : portrait}</div>
          <div class="who">
            <h2>${esc(c.name)}</h2>
            ${c.role ? `<p class="role">${esc(c.role)}</p>` : ''}
            ${c.tagline && !compact ? `<p class="tag">${esc(c.tagline)}</p>` : ''}
          </div>
        </header>
        ${!compact && c.bio ? `<p class="bio">${esc(c.bio)}</p>` : ''}
        ${!compact && (c.personality?.traits?.length || langs.length) ? `<ul class="chips">${langs.map((l) => `<li class="lang">${esc(l.toUpperCase())}</li>`).join('')}${(c.personality?.traits || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${!compact && c.contact.hours ? `<p class="hours">${esc(c.contact.hours)}</p>` : ''}
        ${actions.length ? `<nav class="acts">${actions.join('')}</nav>` : ''}
        <p class="note" role="status" aria-live="polite"></p>
        <footer>${esc(t('identity.card.footer'))} · <a href="https://7ots.com" target="_blank" rel="noopener">7ots</a></footer>
      </article>`;

    this.shadowRoot.querySelectorAll('button.act').forEach((b) => b.addEventListener('click', () => this._act(b.dataset.act, b)));
    if (live) this._mountFace();
  }

  async _mountFace() {
    const pic = this.shadowRoot.querySelector('.pic');
    try {
      this._face = await createFace(pic, { identity: this._raw && !this.hasAttribute('src') ? this._raw : this._card, endpoint: this.endpoint, subtitles: false, locale: this._t.locale });
    } catch (e) {
      pic.innerHTML = this._card.look.image ? `<img src="${esc(this._card.look.image)}" alt="">` : `<span>${esc(this._card.name.slice(0, 1))}</span>`;
    }
  }

  async _act(act, b) {
    const c = this._card;
    const t = this._t;
    const note = (s) => (this.shadowRoot.querySelector('.note').textContent = s);
    if (act === 'chat') {
      const w = document.querySelector('ots-agent');
      w?.api?.open();
      return;
    }
    if (act === 'mail') {
      location.href = `mailto:${c.contact.email}?subject=${encodeURIComponent(t('identity.card.mailSubject', { name: c.name }))}`;
      return;
    }
    if (act === 'apuchat') {
      try {
        await navigator.clipboard.writeText(`@${c.contact.apuchat}`);
        note(t('identity.card.apuchatCopied', { handle: c.contact.apuchat }));
      } catch {
        note(t('identity.card.apuchatSearch', { handle: c.contact.apuchat }));
      }
      return;
    }
    if (act === 'listen') {
      b.disabled = true;
      try {
        await this._face?.say(this.getAttribute('greeting') || greetingFor(c));
      } finally {
        b.disabled = false;
      }
      return;
    }
    if (act === 'call') {
      // La ventana se abre ya (dentro del clic) para que el navegador no la bloquee.
      const win = window.open('', '_blank');
      b.disabled = true;
      note(t('identity.card.callPreparing', { name: c.name }));
      try {
        const r = await fetch(`${this.endpoint}/identity/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !out.call_url) throw new Error(out.error || `HTTP ${r.status}`);
        if (win) {
          win.opener = null;
          win.location.href = out.call_url;
        } else location.href = out.call_url;
        note(t('identity.card.callReady', { name: c.name }));
        this.dispatchEvent(new CustomEvent('ots-identity:call', { detail: { url: out.call_url }, bubbles: true }));
      } catch (e) {
        win?.close();
        note(t('identity.card.callError', { error: e.message }));
      } finally {
        b.disabled = false;
      }
    }
  }
}

/** Presentación por defecto de «Escuchar»: la dice la voz del agente, así que va en su idioma. */
function greetingFor(c) {
  const t = translator(c.language || 'es');
  const intro = c.role ? t('identity.greeting.introRole', { name: c.name, role: c.role }) : t('identity.greeting.intro', { name: c.name });
  return `${intro} ${c.tagline || t('identity.greeting.offer')}`;
}

/** Acepta una tarjeta pública o una identidad completa y devuelve la forma de la tarjeta. */
function normalizeCard(raw) {
  const id = defineIdentity(raw || {});
  const contact = raw?.contact || {};
  return {
    ...id,
    contact: {
      ...id.contact,
      call: !!contact.call,
      meet: !!contact.meet,
      answers: contact.answers || {},
    },
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  chat: svg('<path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-6l-4.5 3.6A.9.9 0 0 1 5 18.9V16a3 3 0 0 1-1-2.2Z"/>'),
  mail: svg('<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5Z"/>'),
  at: svg('<path d="M12 2a10 10 0 1 0 5 18.7l-1-1.7A8 8 0 1 1 20 12v1a2 2 0 0 1-4 0V8h-2v.8A5 5 0 1 0 15 16a4 4 0 0 0 7-3v-1A10 10 0 0 0 12 2Zm0 13a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z"/>'),
  video: svg('<path d="M15 8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2.5l5 3.5V7l-5 3.5Z"/>'),
  voice: svg('<path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/>'),
  card: svg('<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM9 8a2.5 2.5 0 1 1-2.5 2.5A2.5 2.5 0 0 1 9 8Zm5 9H4v-.8C4 14.3 7.3 13.5 9 13.5s5 .8 5 2.7Zm6-3h-4v-2h4Zm0-4h-4V8h4Z"/>'),
};

function css() {
  return `
  :host { all: initial; display: block; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ots-fg, #14141f); }
  * { box-sizing: border-box; }
  .card { --p: #6d5dfc; --a: #22d3ee; max-width: 380px; background: var(--ots-bg, #fff); border: 1px solid var(--ots-line, #e7e7ef); border-radius: 18px;
    padding: 18px; box-shadow: 0 8px 30px rgba(20,20,40,.08); position: relative; overflow: hidden; }
  .card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 64px; background: linear-gradient(120deg, var(--p), var(--a)); opacity: .14; }
  .card.loading .sk { height: 120px; border-radius: 12px; background: linear-gradient(90deg, #f1f1f6, #e7e7ef, #f1f1f6); background-size: 200% 100%; animation: sk 1.2s infinite linear; }
  @keyframes sk { to { background-position: -200% 0; } }
  .card.error { color: #9b1c1c; font-size: 14px; }
  header { display: flex; gap: 14px; align-items: center; position: relative; }
  .pic { width: 72px; height: 72px; flex: none; border-radius: 50%; background: var(--p); display: grid; place-items: center; overflow: hidden;
    box-shadow: 0 0 0 4px var(--ots-bg, #fff), 0 0 0 6px color-mix(in srgb, var(--p) 45%, transparent); position: relative; }
  .pic.live { width: 96px; height: 96px; background: color-mix(in srgb, var(--p) 18%, #fff); }
  .pic img { width: 100%; height: 100%; object-fit: cover; }
  .pic span { color: #fff; font-size: 30px; font-weight: 700; }
  h2 { margin: 0; font-size: 20px; line-height: 1.2; }
  .role { margin: 2px 0 0; color: var(--p); font-weight: 600; font-size: 14px; }
  .tag { margin: 4px 0 0; color: #5b5b6b; font-size: 13px; }
  .bio { margin: 14px 0 0; font-size: 14px; line-height: 1.5; color: #33334a; }
  .chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; }
  .chips li { font-size: 12px; padding: 3px 9px; border-radius: 99px; background: color-mix(in srgb, var(--p) 10%, #fff); color: #33334a; }
  .chips li.lang { background: var(--p); color: #fff; font-weight: 600; }
  .hours { margin: 10px 0 0; font-size: 12px; color: #6b6b7b; }
  .acts { display: grid; gap: 8px; margin-top: 16px; }
  .act { all: unset; box-sizing: border-box; display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--ots-line, #e7e7ef);
    border-radius: 12px; cursor: pointer; transition: border-color .15s, background .15s; color: inherit; text-decoration: none; }
  .act:hover { border-color: var(--p); background: color-mix(in srgb, var(--p) 6%, #fff); }
  .act:focus-visible { outline: 2px solid var(--p); outline-offset: 2px; }
  .act[disabled] { opacity: .6; cursor: progress; }
  .act svg { width: 20px; height: 20px; fill: var(--p); flex: none; }
  .act span { display: flex; flex-direction: column; min-width: 0; }
  .act b { font-size: 14px; font-weight: 600; }
  .act small { font-size: 12px; color: #6b6b7b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { min-height: 0; margin: 10px 0 0; font-size: 13px; color: #33334a; }
  .note:empty { display: none; }
  footer { margin-top: 14px; font-size: 11px; color: #8b8b9b; text-align: right; }
  footer a { color: inherit; }
  .compact { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px; }
  .compact::before { display: none; }
  .compact .pic { width: 48px; height: 48px; }
  .compact h2 { font-size: 16px; }
  .compact .acts { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .compact .act small, .compact footer { display: none; }
  .compact .act { padding: 6px 10px; }
  @media (prefers-color-scheme: dark) {
    :host { --ots-fg: #ececf4; --ots-bg: #17171f; --ots-line: #2c2c3a; }
    .bio, .chips li, .note { color: #d0d0dc; }
    .chips li { background: color-mix(in srgb, var(--p) 22%, #17171f); }
    .act:hover { background: color-mix(in srgb, var(--p) 14%, #17171f); }
    .tag, .act small, .hours { color: #9d9dad; }
  }
  `;
}

if (typeof customElements !== 'undefined' && !customElements.get('ots-identity')) customElements.define('ots-identity', IdentityCard);
