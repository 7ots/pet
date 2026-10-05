/**
 * ProxyLLM — cliente del LLM desde el navegador.
 *
 * El navegador NUNCA tiene API keys: habla con el proxy de 7ots (`server/`) o con
 * cualquier backend propio que implemente el mismo contrato:
 *
 *   POST {endpoint}/chat
 *   body:  { system, messages, tools, session }
 *          session: id aleatorio de la pestaña (sessionStorage); el proxy puede usarlo para
 *          agrupar la conversación en su historial. No identifica a la persona.
 *   resp:  { text, toolCalls: [{id, name, args}], finishReason, provider, raw? }
 *
 * Formato neutral de mensajes (independiente de OpenAI/Claude):
 *   { role: 'user', content: string }
 *   { role: 'assistant', content: string, toolCalls?: [...], raw?: any }
 *   { role: 'tool', toolCallId, name, content: string, isError?: boolean }
 *
 * `raw` es el contenido original del proveedor (p. ej. bloques de Claude con
 * thinking). El proxy lo necesita de vuelta para continuar el turno sin perder
 * razonamiento; el navegador lo trata como opaco.
 *
 * Para usar otro transporte, pasa `llm: { step: async (req) => resp }` en la config.
 */
import { createStore } from '../core/storage.js';

export class ProxyLLM {
  /**
   * @param {object} opt
   * @param {string} opt.endpoint  Base del proxy, p. ej. "https://midominio.com/api/agent"
   * @param {string} [opt.siteKey] Identificador público del sitio (el proxy lo valida)
   * @param {number} [opt.timeoutMs]
   * @param {string|(() => string)} [opt.locale]  idioma del visitante: va en Accept-Language para que
   *   el proxy conteste sus errores en ese idioma
   */
  constructor({ endpoint, siteKey = null, timeoutMs = 60000, locale = null } = {}) {
    if (!endpoint) throw new Error('[7ots] llm.endpoint es obligatorio');
    this.endpoint = endpoint.replace(/\/$/, '');
    this.siteKey = siteKey;
    this.timeoutMs = timeoutMs;
    this.locale = locale;
    this.session = sessionId();
  }

  async step({ system, messages, tools, signal }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    try {
      const res = await fetch(`${this.endpoint}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.siteKey ? { 'X-Site-Key': this.siteKey } : {}),
          ...acceptLanguage(this.locale),
        },
        body: JSON.stringify({ system, messages, tools, session: this.session }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`LLM proxy ${res.status}: ${detail.slice(0, 200)}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Cabecera Accept-Language a partir de un idioma (texto o función); vacía si no hay. */
export function acceptLanguage(locale) {
  const lang = typeof locale === 'function' ? locale() : locale;
  return lang ? { 'Accept-Language': String(lang) } : {};
}

/** Id de la pestaña: dura lo que la conversación (sessionStorage) y es aleatorio. */
function sessionId() {
  const store = createStore('llm');
  let id = store.get('session');
  if (!id) {
    const b = new Uint8Array(12);
    globalThis.crypto?.getRandomValues?.(b);
    id = [...b].map((x) => (x || Math.floor(Math.random() * 256)).toString(16).padStart(2, '0')).join('');
    store.set('session', id);
  }
  return id;
}
