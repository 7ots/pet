/**
 * ActionRegistry — el puente entre el Function Calling del LLM y el sitio web.
 *
 * Cada acción es una herramienta que el LLM puede invocar:
 *
 *   agent.actions.register({
 *     name: 'consultar_saldo',                    // snake_case, único
 *     description: 'Devuelve el saldo del usuario logueado.',
 *     parameters: { type: 'object', properties: {}, required: [] },   // JSON Schema
 *     requiresAuth: true,         // solo se ofrece si hay sesión (AuthManager)
 *     title: 'Consultar saldo',   // nombre legible (texto o () => texto, para seguir el idioma)
 *     confirm: false,             // true | (args, ctx) => string|false  → pide confirmación al usuario
 *     timeoutMs: 15000,
 *     handler: async (args, ctx) => {
 *       const r = await ctx.auth.fetch('/api/me/balance');   // lleva el JWT, el LLM nunca lo ve
 *       return r.json();
 *     },
 *   });
 *
 * `ctx` que recibe cada handler:
 *   { auth, ui, context, bus, agent, t, signal }   (t = traductor del widget, para textos al usuario)
 *
 * Fuentes de herramientas:
 *   - builtins.js       → navegar, click, rellenar formularios, resaltar, modales, toasts…
 *   - registerMcpServer → todas las tools del MCP autenticado del sitio, automáticamente.
 *   - integrations/     → Apumail (correo/tickets) y Apuchat (derivar a humano).
 *   - el desarrollador  → cualquier función propia con register().
 *
 * Reglas de seguridad aplicadas aquí (no dependen del LLM):
 *   - Solo se ejecutan herramientas registradas y con argumentos validados contra su schema.
 *   - `confirm` muestra un diálogo real al usuario ANTES de ejecutar (acciones con efectos).
 *   - `requiresAuth` oculta la herramienta si no hay sesión.
 *   - `enabled()` permite ofrecer herramientas solo en ciertas páginas o estados.
 *   - Timeout por acción; los errores vuelven al LLM como resultado, nunca rompen el loop.
 */

import { McpClient } from '../mcp/McpClient.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export class ActionRegistry {
  /**
   * @param {object} deps  { bus, auth, ui, context, agent, t } — se inyectan desde AgentWidget.
   */
  constructor(deps = {}) {
    this.deps = deps;
    if (!deps.t) deps.t = translator();
    /** @type {Map<string, object>} */
    this._actions = new Map();
    /** @type {Map<string, McpClient>} */
    this._mcp = new Map();
  }

  /** Registra (o reemplaza) una acción. Devuelve una función para quitarla. */
  register(def) {
    if (!def || !NAME_RE.test(def.name || '')) {
      throw new Error(`[7ots] nombre de acción inválido: ${def?.name}`);
    }
    if (typeof def.handler !== 'function') throw new Error(`[7ots] ${def.name}: falta handler`);
    this._actions.set(def.name, {
      description: '',
      parameters: { type: 'object', properties: {}, required: [] },
      requiresAuth: false,
      confirm: false,
      timeoutMs: 20000,
      category: 'custom',
      ...def,
    });
    return () => this.unregister(def.name);
  }

  registerMany(defs) {
    defs.forEach((d) => this.register(d));
  }

  unregister(name) {
    this._actions.delete(name);
  }

  has(name) {
    return this._actions.has(name);
  }

  /**
   * Herramientas disponibles AHORA, en formato neutral {name, description, parameters}.
   * El proxy las traduce a tools de Claude o functions de OpenAI.
   */
  specs() {
    const authed = !!this.deps.auth?.isAuthenticated();
    const out = [];
    for (const a of this._actions.values()) {
      if (a.requiresAuth && !authed) continue;
      if (typeof a.enabled === 'function' && !safeBool(a.enabled)) continue;
      out.push({ name: a.name, description: a.description, parameters: a.parameters });
    }
    return out;
  }

  /**
   * Ejecuta una acción pedida por el LLM.
   * Siempre resuelve (nunca lanza): {ok:true, data} | {ok:false, error}
   */
  async execute(name, args = {}, { signal } = {}) {
    const a = this._actions.get(name);
    const { bus, ui, auth, t } = this.deps;
    if (!a) return { ok: false, error: `La herramienta "${name}" no existe.` };
    if (a.requiresAuth && !auth?.isAuthenticated()) {
      return { ok: false, error: 'El usuario no ha iniciado sesión. Pídele que inicie sesión primero.' };
    }

    const problem = validate(a.parameters, args);
    if (problem) return { ok: false, error: `Argumentos inválidos: ${problem}` };

    // Confirmación humana para acciones con efectos (enviar, pagar, editar perfil…).
    if (a.confirm) {
      const message = typeof a.confirm === 'function' ? a.confirm(args, this.deps) : t('widget.confirm.runAction', { action: actionTitle(a) });
      if (message !== false) {
        const ok = await ui.confirm({ title: t('widget.confirm.title'), message: String(message), confirmText: t('widget.confirm.yes'), cancelText: t('widget.dialog.cancel') });
        if (!ok) return { ok: false, error: 'El usuario rechazó la acción. No la reintentes salvo que te lo pida.' };
      }
    }

    bus?.emit('action:start', { name, args });
    let result;
    try {
      const data = await withTimeout(
        a.handler(args, { ...this.deps, signal }),
        a.timeoutMs,
        `La acción "${name}" tardó demasiado.`,
      );
      result = data && typeof data === 'object' && 'ok' in data ? data : { ok: true, data: data ?? null };
    } catch (err) {
      result = { ok: false, error: err?.message || String(err) };
    }
    bus?.emit('action:end', { name, args, result });
    return result;
  }

  // ─────────────────────── MCP autenticado del sitio ───────────────────────

  /**
   * Conecta un servidor MCP del sitio (Streamable HTTP) y registra todas sus tools
   * como acciones `<prefix>__<tool>`. Usa el token del AuthManager en cada llamada,
   * así el MCP actúa en nombre del usuario logueado.
   *
   * @param {object} opt
   * @param {string} opt.url            p. ej. "/mcp" o "https://api.misitio.com/mcp"
   * @param {string} [opt.name='site']  prefijo de las tools
   * @param {boolean} [opt.requiresAuth=true]
   * @param {(tool) => boolean} [opt.filter]      para exponer solo algunas tools
   * @param {(tool) => boolean|string} [opt.confirm]  confirmación por tool (p. ej. las que escriben)
   */
  async registerMcpServer({ url, name = 'site', requiresAuth = true, filter = null, confirm = null } = {}) {
    const client = new McpClient({ url, auth: this.deps.auth, clientName: '7ots-agent', locale: () => this.deps.t?.locale });
    await client.connect();
    const tools = await client.listTools();
    this._mcp.get(name)?.close();
    this._mcp.set(name, client);

    // Quita las tools previas de ese servidor (reconexión / cambio de usuario).
    for (const key of [...this._actions.keys()]) if (key.startsWith(`${name}__`)) this._actions.delete(key);

    for (const t of tools) {
      if (filter && !filter(t)) continue;
      const readOnly = t.annotations?.readOnlyHint === true;
      const toolName = `${name}__${t.name}`.slice(0, 64);
      this.register({
        name: toolName,
        title: t.title || t.name,
        category: 'mcp',
        description: `[${name}] ${t.description || t.title || t.name}`,
        parameters: t.inputSchema || { type: 'object', properties: {} },
        requiresAuth,
        // Por defecto: las tools no marcadas como solo-lectura piden confirmación.
        confirm: confirm ? (args) => confirm(t, args) : readOnly ? false : () => this.deps.t('widget.confirm.mcp', { action: t.title || t.name }),
        timeoutMs: 30000,
        handler: async (args) => {
          const r = await client.callTool(t.name, args);
          return r.isError ? { ok: false, error: r.text || 'Error en la herramienta MCP' } : { ok: true, data: r.structured ?? r.text };
        },
      });
    }
    return tools.map((t) => t.name);
  }

  closeAll() {
    for (const c of this._mcp.values()) c.close();
    this._mcp.clear();
  }
}

// ───────────────────────────── helpers ─────────────────────────────

/** Nombre legible de una acción (`title` puede ser texto o función, para seguir el idioma). */
export function actionTitle(a) {
  const t = typeof a?.title === 'function' ? a.title() : a?.title;
  return t || a?.name || '';
}

function safeBool(fn) {
  try {
    return !!fn();
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, msg) {
  let t;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); }),
  ]);
}

/**
 * Validación mínima de JSON Schema (type/required/enum/anidados).
 * Suficiente para frenar alucinaciones del LLM sin meter dependencias.
 * @returns {string|null} descripción del problema o null si es válido
 */
export function validate(schema, value, path = 'args') {
  if (!schema || typeof schema !== 'object') return null;
  const t = schema.type;
  const typeOk = {
    object: (v) => v && typeof v === 'object' && !Array.isArray(v),
    array: Array.isArray,
    string: (v) => typeof v === 'string',
    number: (v) => typeof v === 'number' && Number.isFinite(v),
    integer: Number.isInteger,
    boolean: (v) => typeof v === 'boolean',
  };
  if (t && typeOk[t] && !typeOk[t](value)) return `${path} debe ser ${t}`;
  if (schema.enum && !schema.enum.includes(value)) return `${path} debe ser uno de: ${schema.enum.join(', ')}`;
  if (t === 'object' && value) {
    for (const k of schema.required || []) {
      if (value[k] === undefined || value[k] === null || value[k] === '') return `falta ${path}.${k}`;
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (value[k] !== undefined) {
        const p = validate(sub, value[k], `${path}.${k}`);
        if (p) return p;
      }
    }
  }
  if (t === 'array' && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const p = validate(schema.items, value[i], `${path}[${i}]`);
      if (p) return p;
    }
  }
  return null;
}
