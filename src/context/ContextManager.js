/**
 * ContextManager — consciencia del contexto (DOM Awareness).
 *
 * Responsabilidades:
 *  1. Escanear el DOM y convertirlo en un contexto compacto (JSON + Markdown) que el
 *     LLM entienda: URL, estructura, sección actual, elementos interactivos, formularios.
 *  2. Asignar "refs" estables (e1, e2…) a los elementos interactivos para que el LLM
 *     actúe sobre ellos sin inventar selectores CSS frágiles.
 *  3. Vigilar la página: MutationObserver (cambios del DOM, alertas, SPA), scroll
 *     (sección visible) e historial (pushState/replaceState/popstate/hashchange).
 *
 * Privacidad:
 *  - Nunca se envían valores de inputs password, tarjetas (autocomplete cc-*),
 *    ni de nada marcado con [data-ots-private] o `privateSelectors`.
 *  - Lo marcado con [data-ots-ignore] (y el propio widget) no existe para el agente.
 *  - El texto de la página es CONTENIDO NO CONFIABLE: el system prompt se lo dice al
 *    LLM para mitigar prompt injection desde el sitio (p. ej. reseñas de usuarios).
 */

const INTERACTIVE = [
  'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
  '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=checkbox]',
  '[role=switch]', '[contenteditable=""]', '[contenteditable=true]',
].join(',');

const SECTION_CANDIDATES = [
  '[data-ots-section]', 'section', 'article', 'main > [id]', '[role=region]', 'form[id]',
].join(',');

const ALERT_SELECTOR = '[role=alert], [aria-live=assertive], [aria-invalid=true], .error, .alert-danger, .is-invalid';

const ALWAYS_PRIVATE = [
  'input[type=password]', '[autocomplete^=cc-]', '[data-ots-private]', '[data-ots-private] *',
];

export class ContextManager {
  /**
   * @param {object} opt
   * @param {import('../core/EventBus.js').EventBus} opt.bus
   * @param {string[]} [opt.ignoreSelectors]   Zonas invisibles para el agente.
   * @param {string[]} [opt.privateSelectors]  Zonas cuyo contenido/valor no sale del navegador.
   * @param {string}   [opt.sectionSelector]   Override de qué cuenta como "sección".
   * @param {number}   [opt.maxElements=80]
   * @param {number}   [opt.maxChars=9000]      Tamaño máximo del markdown de contexto.
   * @param {() => object} [opt.extra]          Contexto adicional del desarrollador (carrito, plan…).
   */
  constructor({
    bus,
    ignoreSelectors = [],
    privateSelectors = [],
    sectionSelector = SECTION_CANDIDATES,
    maxElements = 80,
    maxChars = 9000,
    extra = null,
  } = {}) {
    this.bus = bus;
    this.ignoreSel = ['[data-ots-root]', '[data-ots-ignore]', 'script', 'style', 'noscript', 'template', ...ignoreSelectors].join(',');
    this.privateSel = [...ALWAYS_PRIVATE, ...privateSelectors].join(',');
    this.sectionSel = sectionSelector;
    this.maxElements = maxElements;
    this.maxChars = maxChars;
    this.extra = extra;

    /** ref -> WeakRef<Element> ; el -> ref (para que un elemento conserve su ref) */
    this._refs = new Map();
    this._refOf = new WeakMap();
    this._seq = 0;

    this.currentSection = null;
    this._lastUrl = location.href;
    this._cleanup = [];
  }

  // ───────────────────────────── Observación ─────────────────────────────

  start() {
    // 1) Cambios de ruta (SPA): parcheamos history una sola vez por página.
    patchHistoryOnce();
    const onRoute = () => {
      if (location.href === this._lastUrl) return;
      const prev = this._lastUrl;
      this._lastUrl = location.href;
      this.bus.emit('context:route', { url: location.href, prev });
      queueMicrotask(() => this._detectSection());
    };
    for (const ev of ['ots:locationchange', 'popstate', 'hashchange']) {
      window.addEventListener(ev, onRoute);
      this._cleanup.push(() => window.removeEventListener(ev, onRoute));
    }

    // 2) Sección visible: scroll con throttle.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      setTimeout(() => { ticking = false; this._detectSection(); }, 250);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    this._cleanup.push(() => window.removeEventListener('scroll', onScroll));

    // 3) MutationObserver: nuevas secciones (SPA), modales del sitio y alertas/errores.
    let pending = { added: 0, removed: 0, alerts: new Set() };
    let flushTimer = null;
    const flush = () => {
      flushTimer = null;
      const { added, removed, alerts } = pending;
      pending = { added: 0, removed: 0, alerts: new Set() };
      if (added || removed) this.bus.emit('context:mutation', { added, removed });
      for (const text of alerts) this.bus.emit('context:alert', { text });
      this._detectSection();
    };
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (target && this._isIgnored(target)) continue;
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1 || this._isIgnored(n)) continue;
          pending.added++;
          const alerts = n.matches?.(ALERT_SELECTOR) ? [n] : [...(n.querySelectorAll?.(ALERT_SELECTOR) || [])];
          for (const a of alerts) {
            const t = cleanText(a.innerText || a.getAttribute('aria-label') || '');
            if (t) pending.alerts.add(t.slice(0, 200));
          }
        }
        pending.removed += r.removedNodes.length;
        if (r.type === 'attributes' && target?.matches?.(ALERT_SELECTOR)) {
          const t = cleanText(target.innerText || '');
          if (t) pending.alerts.add(t.slice(0, 200));
        }
      }
      if (!flushTimer) flushTimer = setTimeout(flush, 400);
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-invalid', 'role', 'class', 'hidden', 'open'],
    });
    this._cleanup.push(() => mo.disconnect());

    this._detectSection();
  }

  stop() {
    this._cleanup.forEach((fn) => fn());
    this._cleanup = [];
  }

  /** La sección que contiene la línea de lectura (40% del alto del viewport). */
  _detectSection() {
    const y = window.innerHeight * 0.4;
    let best = null;
    let bestArea = Infinity;
    for (const el of document.querySelectorAll(this.sectionSel)) {
      if (this._isIgnored(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom >= y && r.height > 0) {
        const area = r.height * r.width;
        if (area < bestArea) { best = el; bestArea = area; } // la más específica gana
      }
    }
    const info = best ? { id: best.id || null, title: sectionTitle(best), el: best } : null;
    const changed = (info?.el || null) !== (this.currentSection?.el || null);
    this.currentSection = info;
    if (changed && info) this.bus.emit('context:section', { id: info.id, title: info.title });
  }

  // ───────────────────────────── Refs ─────────────────────────────

  refFor(el) {
    let ref = this._refOf.get(el);
    if (!ref) {
      ref = `e${++this._seq}`;
      this._refOf.set(el, ref);
    }
    this._refs.set(ref, new WeakRef(el));
    return ref;
  }

  /**
   * Resuelve un objetivo que viene del LLM: "e12", {ref:"e12"}, {selector:"#id"} o un selector.
   * @returns {Element|null}
   */
  resolve(target) {
    if (!target) return null;
    if (typeof target === 'object') {
      if (target.ref) return this.resolve(target.ref);
      if (target.selector) return this.resolve(target.selector);
      return null;
    }
    const s = String(target).trim();
    if (/^e\d+$/.test(s)) {
      const el = this._refs.get(s)?.deref();
      return el && el.isConnected ? el : null;
    }
    try {
      const el = document.querySelector(s);
      return el && !this._isIgnored(el) ? el : null;
    } catch {
      return null; // selector inválido
    }
  }

  // ───────────────────────────── Snapshot ─────────────────────────────

  /** Contexto estructurado de la página, listo para serializar. */
  snapshot() {
    const section = this.currentSection;
    const viewport = { top: 0, bottom: window.innerHeight };

    // Elementos interactivos: primero los visibles en pantalla, luego los de la sección actual,
    // luego el resto, hasta maxElements.
    const all = [...document.querySelectorAll(INTERACTIVE)].filter((el) => !this._isIgnored(el) && isVisible(el));
    const score = (el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom >= viewport.top && r.top <= viewport.bottom) return 0;
      if (section?.el?.contains(el)) return 1;
      return 2;
    };
    const ranked = all
      .map((el, i) => ({ el, s: score(el), i }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .slice(0, this.maxElements)
      .sort((a, b) => a.i - b.i) // devolver en orden de documento
      .map(({ el, s }) => ({ ...this._describe(el), inView: s === 0 }));

    const forms = [...document.forms]
      .filter((f) => !this._isIgnored(f) && isVisible(f))
      .slice(0, 8)
      .map((f) => ({
        ref: this.refFor(f),
        name: f.getAttribute('aria-label') || f.getAttribute('name') || f.id || sectionTitle(f) || null,
        fields: [...f.elements]
          .filter((el) => el.matches(INTERACTIVE) && !this._isIgnored(el) && el.type !== 'hidden')
          .slice(0, 25)
          .map((el) => this._describe(el)),
      }));

    const headings = [...document.querySelectorAll('h1, h2, h3')]
      .filter((h) => !this._isIgnored(h) && isVisible(h))
      .slice(0, 40)
      .map((h) => ({
        level: Number(h.tagName[1]),
        text: cleanText(h.innerText).slice(0, 100),
        id: h.id || h.closest('[id]')?.id || null,
        current: !!section?.el?.contains(h),
      }));

    const main = document.querySelector('main, [role=main]') || document.body;

    return {
      url: location.href,
      path: location.pathname + location.search + location.hash,
      title: document.title,
      lang: document.documentElement.lang || navigator.language,
      description: document.querySelector('meta[name=description]')?.content || null,
      scroll: {
        percent: Math.round((window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)) * 100),
      },
      section: section ? { id: section.id, title: section.title, text: this._text(section.el, 2500) } : null,
      headings,
      elements: ranked,
      forms,
      pageText: section ? null : this._text(main, 2500),
      selection: this._selection(),
      extra: safeCall(this.extra),
    };
  }

  /** Markdown compacto: es lo que realmente ve el LLM en cada turno. */
  toMarkdown(snap = this.snapshot()) {
    const L = [];
    L.push(`# Página: ${snap.title || '(sin título)'}`);
    L.push(`URL: ${snap.url}`);
    if (snap.description) L.push(`Descripción: ${snap.description}`);
    L.push(`Idioma: ${snap.lang} · Scroll: ${snap.scroll.percent}%`);
    if (snap.extra) L.push(`Datos del sitio: ${JSON.stringify(snap.extra).slice(0, 800)}`);

    if (snap.headings.length) {
      L.push('', '## Estructura');
      for (const h of snap.headings) {
        L.push(`${'  '.repeat(h.level - 1)}- ${h.text}${h.id ? ` (#${h.id})` : ''}${h.current ? '  ← el usuario está aquí' : ''}`);
      }
    }

    if (snap.section) {
      L.push('', `## Sección actual: ${snap.section.title || snap.section.id || '(sin nombre)'}`, snap.section.text);
    } else if (snap.pageText) {
      L.push('', '## Contenido visible', snap.pageText);
    }

    if (snap.selection) L.push('', `## Texto seleccionado por el usuario`, snap.selection);

    if (snap.elements.length) {
      L.push('', '## Elementos interactivos (usa el ref para actuar; * = visible en pantalla)');
      for (const e of snap.elements) L.push(`[${e.ref}]${e.inView ? '*' : ''} ${fmtEl(e)}`);
    }

    if (snap.forms.length) {
      L.push('', '## Formularios');
      for (const f of snap.forms) {
        L.push(`[${f.ref}] form "${f.name || 'sin nombre'}": ${f.fields.map((x) => `${x.ref} ${x.label || x.name || x.kind}${x.required ? '*' : ''}`).join(', ')}`);
      }
    }

    let md = L.join('\n');
    if (md.length > this.maxChars) md = md.slice(0, this.maxChars) + '\n…(contexto truncado)';
    return md;
  }

  /** Texto legible de un elemento (tool read_element). */
  readElement(target, maxChars = 4000) {
    const el = this.resolve(target);
    if (!el) return null;
    return this._text(el, maxChars);
  }

  /** Búsqueda por texto de elementos/secciones que no entraron en el snapshot. */
  search(query, limit = 10) {
    const q = normalize(query);
    if (!q) return [];
    const out = [];
    for (const el of document.querySelectorAll(`${INTERACTIVE}, h1, h2, h3, h4, label, [data-ots-section], [id]`)) {
      if (out.length >= limit) break;
      if (this._isIgnored(el) || !isVisible(el)) continue;
      const d = this._describe(el);
      const hay = normalize(`${d.label} ${d.name || ''} ${el.id} ${d.href || ''}`);
      if (hay.includes(q)) out.push(d);
    }
    return out;
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  _isIgnored(el) {
    return !!el.closest?.(this.ignoreSel);
  }

  _isPrivate(el) {
    return !!el.matches?.(this.privateSel) || !!el.closest?.('[data-ots-private]');
  }

  _describe(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const type = el.getAttribute('type');
    const d = {
      ref: this.refFor(el),
      kind: role || (tag === 'input' ? `input:${type || 'text'}` : tag),
      label: accessibleName(el).slice(0, 80),
    };
    if (el.id) d.id = el.id;
    if (el.name) d.name = el.name;
    if (tag === 'a') d.href = relHref(el.getAttribute('href'));
    if (el.required || el.getAttribute('aria-required') === 'true') d.required = true;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') d.disabled = true;
    if (el.getAttribute('aria-invalid') === 'true') d.invalid = true;
    if (type === 'checkbox' || type === 'radio') d.checked = el.checked;
    if (tag === 'select') {
      d.options = [...el.options].slice(0, 12).map((o) => o.text.trim());
      d.value = this._isPrivate(el) ? '[privado]' : el.selectedOptions[0]?.text;
    } else if ((tag === 'input' || tag === 'textarea') && !['checkbox', 'radio', 'submit', 'button'].includes(type)) {
      if (this._isPrivate(el)) d.value = el.value ? '[privado]' : '';
      else if (el.value) d.value = el.value.slice(0, 60);
      if (el.placeholder) d.placeholder = el.placeholder.slice(0, 60);
    }
    return d;
  }

  _text(el, maxChars) {
    // Clonamos para poder quitar zonas ignoradas/privadas sin tocar la página real.
    const clone = el.cloneNode(true);
    clone.querySelectorAll(this.ignoreSel).forEach((n) => n.remove());
    clone.querySelectorAll('[data-ots-private]').forEach((n) => { n.textContent = '[privado]'; });
    // innerText necesita layout; en un nodo desconectado cae a textContent.
    const text = cleanText(clone.innerText || clone.textContent || '');
    return text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
  }

  _selection() {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed) return null;
    const node = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
    if (!node || this._isIgnored(node) || this._isPrivate(node)) return null;
    return cleanText(sel.toString()).slice(0, 500) || null;
  }
}

// ───────────────────────────── utilidades puras ─────────────────────────────

/** Emite 'ots:locationchange' en cada pushState/replaceState (routers SPA). */
function patchHistoryOnce() {
  if (history.__otsPatched) return;
  history.__otsPatched = true;
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function (...args) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event('ots:locationchange'));
      return r;
    };
  }
}

function isVisible(el) {
  if (el.hidden || el.closest('[hidden], [aria-hidden=true], [inert]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.02;
}

function accessibleName(el) {
  const aria = el.getAttribute('aria-label');
  if (aria) return cleanText(aria);
  const lb = el.getAttribute('aria-labelledby');
  if (lb) {
    const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ');
    if (t.trim()) return cleanText(t);
  }
  if (el.labels?.length) return cleanText([...el.labels].map((l) => l.innerText).join(' '));
  const own = cleanText(el.innerText || '');
  if (own) return own;
  return cleanText(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') ||
    el.querySelector?.('img[alt]')?.alt || el.value || el.name || '');
}

function sectionTitle(el) {
  return cleanText(
    el.getAttribute('data-ots-section') || el.getAttribute('aria-label') ||
    el.querySelector('h1, h2, h3, h4, legend')?.innerText || el.id || '',
  ).slice(0, 80) || null;
}

function relHref(href) {
  if (!href) return null;
  try {
    const u = new URL(href, location.href);
    return u.origin === location.origin ? u.pathname + u.search + u.hash : u.href;
  } catch {
    return href;
  }
}

function fmtEl(e) {
  let s = `${e.kind} "${e.label || e.name || e.placeholder || ''}"`;
  if (e.href) s += ` → ${e.href}`;
  if (e.value !== undefined && e.value !== '') s += ` = "${e.value}"`;
  if (e.checked !== undefined) s += e.checked ? ' [✓]' : ' [ ]';
  if (e.options) s += ` opciones: ${e.options.join(' | ')}`;
  if (e.required) s += ' (requerido)';
  if (e.disabled) s += ' (deshabilitado)';
  if (e.invalid) s += ' (inválido)';
  return s;
}

function cleanText(t) {
  return String(t).replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

function normalize(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function safeCall(fn) {
  if (typeof fn !== 'function') return null;
  try {
    return fn() ?? null;
  } catch {
    return null;
  }
}
