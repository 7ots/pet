/**
 * McpClient — cliente MCP mínimo para el navegador (transporte Streamable HTTP).
 *
 * Permite que el agente use el servidor MCP que el sitio YA expone para su propio
 * backend, autenticado con el token del usuario logueado. Así el sitio no tiene que
 * reescribir sus capacidades como acciones del widget: se descubren solas.
 *
 * Protocolo (JSON-RPC 2.0 sobre POST):
 *   initialize → notifications/initialized → tools/list → tools/call
 * El servidor puede responder JSON o text/event-stream; soportamos ambos.
 *
 * Requisitos del lado del sitio:
 *   - CORS que permita el origen de la página y exponga el header `Mcp-Session-Id`
 *     (en same-origin no hace falta nada).
 *   - Aceptar `Authorization: Bearer <token>` (el mismo JWT del usuario).
 */

const PROTOCOL_VERSION = '2025-06-18';

export class McpClient {
  /**
   * @param {object} opt
   * @param {string} opt.url
   * @param {import('../auth/AuthManager.js').AuthManager} [opt.auth]
   * @param {string} [opt.clientName]
   * @param {string|(() => string)} [opt.locale]  idioma del visitante (cabecera Accept-Language)
   */
  constructor({ url, auth = null, clientName = '7ots-agent', locale = null }) {
    this.url = new URL(url, location.href).href;
    this.locale = locale;
    this.auth = auth;
    this.clientName = clientName;
    this.sessionId = null;
    this.serverInfo = null;
    this._id = 0;
  }

  async connect() {
    const res = await this._rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: this.clientName, version: '0.1.0' },
    });
    this.serverInfo = res?.serverInfo || null;
    await this._notify('notifications/initialized');
    return res;
  }

  async listTools() {
    const tools = [];
    let cursor;
    do {
      const r = await this._rpc('tools/list', cursor ? { cursor } : {});
      tools.push(...(r?.tools || []));
      cursor = r?.nextCursor;
    } while (cursor);
    return tools;
  }

  /** @returns {Promise<{text: string, structured: any, isError: boolean}>} */
  async callTool(name, args = {}) {
    const r = await this._rpc('tools/call', { name, arguments: args });
    const text = (r?.content || [])
      .map((c) => (c.type === 'text' ? c.text : c.type === 'resource' ? c.resource?.text || '' : `[${c.type}]`))
      .join('\n')
      .trim();
    return { text, structured: r?.structuredContent ?? null, isError: !!r?.isError };
  }

  close() {
    if (!this.sessionId) return;
    // Cierre best-effort de la sesión en el servidor.
    this._headers().then((h) => fetch(this.url, { method: 'DELETE', headers: h, keepalive: true }).catch(() => {}));
    this.sessionId = null;
  }

  // ───────────────────────────── transporte ─────────────────────────────

  async _headers() {
    const h = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    const lang = typeof this.locale === 'function' ? this.locale() : this.locale;
    if (lang) h['Accept-Language'] = lang;
    // El token solo se adjunta si el AuthManager permite ese origen.
    const auth = await this.auth?.headersFor(this.url);
    return { ...h, ...(auth || {}) };
  }

  async _notify(method, params) {
    await fetch(this.url, {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }),
    }).catch(() => {});
  }

  async _rpc(method, params, retried = false) {
    const id = ++this._id;
    const res = await fetch(this.url, {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    // Sesión caducada: la especificación indica 404 → se re-inicializa y se reintenta una vez.
    if (res.status === 404 && this.sessionId && method !== 'initialize' && !retried) {
      this.sessionId = null;
      await this.connect();
      return this._rpc(method, params, true);
    }
    if (res.status === 401 || res.status === 403) throw new Error('MCP: no autorizado (¿sesión expirada?)');
    if (!res.ok) throw new Error(`MCP ${method}: HTTP ${res.status}`);
    const sid = res.headers.get('Mcp-Session-Id');
    if (sid) this.sessionId = sid;

    const type = res.headers.get('Content-Type') || '';
    const msg = type.includes('text/event-stream') ? await readSseResponse(res, id) : await res.json();
    if (msg?.error) throw new Error(`MCP ${method}: ${msg.error.message || 'error'}`);
    return msg?.result;
  }
}

/** Lee un stream SSE hasta encontrar la respuesta JSON-RPC con nuestro id. */
async function readSseResponse(res, id) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!data) continue;
      try {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          reader.cancel().catch(() => {});
          return msg;
        }
      } catch {
        /* evento no JSON: ignorar */
      }
    }
  }
  throw new Error('MCP: el stream terminó sin respuesta');
}
