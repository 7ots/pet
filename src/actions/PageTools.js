/**
 * PageTools — herramientas que el sitio declara en su propio HTML.
 *
 * El dashboard ya tiene formularios y botones que hacen cosas (invitar a alguien, crear una
 * carpeta, exportar). Con un atributo se convierten en herramientas del agente, sin escribir JS:
 *
 *   <form data-ots-tool="invitar_miembro"
 *         data-ots-description="Invita a una persona al equipo"
 *         data-ots-confirm="¿Invitar a {email} como {rol}?">      ← "false" = sin confirmación
 *     <label>Email <input name="email" type="email" required></label>
 *     <select name="rol"><option>lector</option><option>editor</option></select>
 *   </form>
 *
 *   <button data-ots-tool="exportar_csv" data-ots-description="Descarga la tabla en CSV">…</button>
 *
 * Formularios → los campos con `name` son los parámetros (tipo, enum, required y descripción
 * salen del propio HTML). El agente rellena (con el ratón visible si está activo) y envía.
 * Botones / enlaces → herramienta sin parámetros que hace click.
 *
 * Resultado: el sitio puede responder al agente disparando en el formulario/botón
 *   el.dispatchEvent(new CustomEvent('ots-result', { detail: {...} }))
 * y si no, se devuelve el texto de [role=status] / [role=alert] que aparezca.
 *
 * Opcionales: data-ots-auth (solo con sesión), data-ots-ignore (ocultar al agente).
 * Los campos privados (contraseña, tarjeta, [data-ots-private]) nunca son parámetros.
 * La lista se actualiza sola cuando la página cambia (SPA, pestañas, modales).
 */

import { setFieldValue } from './builtins.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

const PRIVATE = 'input[type=password], [autocomplete^=cc-], [autocomplete=one-time-code], [data-ots-private], [data-ots-private] *';
const RESULT_WAIT_MS = 1500;

export class PageTools {
  /**
   * @param {object} o  { actions, context, bus, pointer?, t? }  t = traductor de las confirmaciones
   */
  constructor({ actions, context, bus, pointer = null, t = translator() }) {
    this.t = t;
    this.actions = actions;
    this.context = context;
    this.bus = bus;
    this.pointer = pointer;
    /** name → Element */
    this._tools = new Map();
    this._offs = [];
    this._timer = null;
  }

  start() {
    const later = () => {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.scan(), 250);
    };
    this._offs.push(this.bus.on('context:mutation', later), this.bus.on('context:route', later));
    this.scan();
  }

  stop() {
    clearTimeout(this._timer);
    this._offs.forEach((off) => off?.());
    this._offs = [];
    for (const name of this._tools.keys()) this.actions.unregister(name);
    this._tools.clear();
  }

  /** Sincroniza el registro con los [data-ots-tool] presentes ahora en el DOM. */
  scan() {
    const seen = new Map();
    for (const el of document.querySelectorAll('[data-ots-tool]')) {
      if (el.closest('[data-ots-ignore], [data-ots-root]')) continue;
      const name = String(el.dataset.otsTool).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 64);
      if (!name || seen.has(name)) continue;
      if (this.actions.has(name) && !this._tools.has(name)) {
        console.warn(`[7ots] data-ots-tool="${name}" choca con una acción existente; se ignora.`);
        continue;
      }
      seen.set(name, el);
    }
    for (const [name, el] of this._tools) {
      if (seen.get(name) !== el) {
        this.actions.unregister(name);
        this._tools.delete(name);
      }
    }
    for (const [name, el] of seen) {
      if (this._tools.get(name) === el) continue;
      this.actions.register(el.tagName === 'FORM' ? this._formTool(name, el) : this._buttonTool(name, el));
      this._tools.set(name, el);
    }
  }

  list() {
    return [...this._tools.keys()];
  }

  // ───────────────────────────── formularios ─────────────────────────────

  _formTool(name, form) {
    const fields = formFields(form);
    const properties = {};
    const required = [];
    for (const f of fields) {
      properties[f.name] = f.schema;
      if (f.required) required.push(f.name);
    }
    const privateRequired = [...form.querySelectorAll(PRIVATE)].some((el) => el.required);
    return {
      name,
      category: 'page',
      title: form.dataset.otsTitle || name,
      description:
        `[página] ${form.dataset.otsDescription || form.getAttribute('aria-label') || form.querySelector('legend, h2, h3')?.textContent?.trim() || name}` +
        (privateRequired ? ' (tiene campos privados que el usuario debe escribir antes)' : ''),
      parameters: { type: 'object', properties, required },
      requiresAuth: form.hasAttribute('data-ots-auth'),
      confirm: confirmFor(form, this.t),
      timeoutMs: 60000,
      handler: async (args, { ui }) => {
        if (!form.isConnected) return { ok: false, error: 'El formulario ya no está en la página.' };
        const visible = isVisible(form);
        for (const f of fields) {
          if (!(f.name in args)) continue;
          const value = args[f.name];
          const el = f.pick(value);
          if (!el) return { ok: false, error: `Valor no válido para ${f.name}: ${value}` };
          if (this.pointer && visible && isVisible(el)) {
            if (f.kind === 'text') {
              await this.pointer.type(el, String(value), { clear: true });
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (f.kind === 'check' || f.kind === 'radio') {
              const want = f.kind === 'radio' ? true : value === true || value === 'true';
              if (el.checked !== want) await this.pointer.click(el);
            } else {
              await this.pointer.moveTo(el);
              setFieldValue(el, f.kind === 'number' ? String(value) : value);
            }
          } else {
            setFieldValue(el, typeof value === 'boolean' ? String(value) : String(value));
          }
        }
        if (!form.checkValidity()) {
          const bad = [...form.elements].filter((el) => el.willValidate && !el.validity.valid);
          if (visible) form.reportValidity();
          return { ok: false, error: `El formulario no es válido: ${bad.map((el) => `${el.name || el.id}: ${el.validationMessage}`).join('; ')}` };
        }
        const submitter = form.querySelector('[type=submit], button:not([type])');
        if (this.pointer && visible && submitter && isVisible(submitter)) await this.pointer.moveTo(submitter);
        const result = waitResult(form);
        form.requestSubmit ? form.requestSubmit(submitter || undefined) : form.submit();
        if (!visible) ui?.toast?.({ message: this.t('widget.pageTools.done', { title: form.dataset.otsTitle || name.replace(/_/g, ' ') }), type: 'success' });
        return { ok: true, data: (await result) ?? 'Enviado.' };
      },
    };
  }

  // ───────────────────────────── botones ─────────────────────────────

  _buttonTool(name, el) {
    return {
      name,
      category: 'page',
      title: el.dataset.otsTitle || name,
      description: `[página] ${el.dataset.otsDescription || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 80) || name}`,
      parameters: { type: 'object', properties: {} },
      requiresAuth: el.hasAttribute('data-ots-auth'),
      confirm: confirmFor(el, this.t),
      handler: async () => {
        if (!el.isConnected) return { ok: false, error: 'El botón ya no está en la página.' };
        const result = waitResult(el);
        if (this.pointer && isVisible(el)) await this.pointer.click(el);
        else el.click();
        return { ok: true, data: (await result) ?? 'Hecho.' };
      },
    };
  }
}

// ───────────────────────────── helpers ─────────────────────────────

/** Describe los campos con name de un formulario como parámetros JSON Schema. */
function formFields(form) {
  const groups = new Map();
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.matches(PRIVATE) || el.closest('[data-ots-ignore]')) continue;
    if (/^(hidden|submit|button|reset|file|image)$/.test(el.type)) continue;
    if (!groups.has(el.name)) groups.set(el.name, []);
    groups.get(el.name).push(el);
  }
  const out = [];
  for (const [name, els] of groups) {
    const el = els[0];
    const desc = el.dataset.otsDescription || labelText(el) || el.placeholder || name;
    let schema;
    let kind = 'text';
    let pick = () => el;
    if (el.type === 'radio') {
      kind = 'radio';
      const values = els.map((r) => r.value);
      schema = { type: 'string', enum: values, description: `${labelText(el.closest('fieldset')?.querySelector('legend')) || desc}` };
      pick = (v) => els.find((r) => r.value === v) || null;
    } else if (el.type === 'checkbox') {
      kind = 'check';
      schema = { type: 'boolean', description: desc };
    } else if (el.tagName === 'SELECT') {
      kind = 'select';
      schema = { type: 'string', enum: [...el.options].filter((o) => !o.disabled && o.value !== '').map((o) => o.value), description: desc };
    } else if (el.type === 'number' || el.type === 'range') {
      kind = 'number';
      schema = { type: 'number', description: [desc, el.min && `mín. ${el.min}`, el.max && `máx. ${el.max}`].filter(Boolean).join(', ') };
    } else {
      schema = { type: 'string', description: desc + (el.type && el.type !== 'text' && el.tagName === 'INPUT' ? ` (${el.type})` : '') };
    }
    out.push({ name, schema, kind, pick, required: els.some((x) => x.required) });
  }
  return out;
}

function confirmFor(el, t = translator()) {
  const c = el.dataset.otsConfirm;
  if (c === 'false') return false;
  const title = el.dataset.otsTitle || el.dataset.otsTool.replace(/_/g, ' ');
  return (args) => {
    if (c && c !== 'true') return c.replace(/\{(\w+)\}/g, (_, k) => String(args?.[k] ?? ''));
    const detail = Object.entries(args || {}).map(([k, v]) => `${k}: **${v}**`).join(', ');
    return detail ? t('widget.confirm.pageToolWith', { title, detail }) : t('widget.confirm.pageTool', { title });
  };
}

/** Espera la respuesta del sitio (evento ots-result) o un mensaje de estado. */
function waitResult(el) {
  const scope = el.closest('form, [role=dialog], section, main') || document.body;
  const before = statusText(scope);
  return new Promise((resolve) => {
    const done = (v) => {
      clearTimeout(timer);
      el.removeEventListener('ots-result', onResult);
      resolve(v);
    };
    const onResult = (e) => done(e.detail ?? 'Hecho.');
    const timer = setTimeout(() => {
      const after = statusText(scope.isConnected ? scope : document.body);
      done(after && after !== before ? after : null);
    }, RESULT_WAIT_MS);
    el.addEventListener('ots-result', onResult);
  });
}

function statusText(scope) {
  return [...scope.querySelectorAll('[role=status], [role=alert], [aria-live]')]
    .map((n) => n.innerText?.trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500);
}

function labelText(el) {
  if (!el) return '';
  const l = el.labels?.[0] || (el.tagName === 'LEGEND' ? el : null);
  const t = l ? [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ') : el.getAttribute?.('aria-label') || '';
  return t.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function isVisible(el) {
  if (!el.isConnected || el.closest('[hidden], [inert]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
