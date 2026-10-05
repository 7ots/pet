/**
 * Integración Apuchat — derivar la conversación a una persona real.
 *
 * Flujo (sin claves en el navegador):
 *
 *   LLM → escalate_to_human({reason, summary})
 *     → confirmación del usuario
 *     → POST {endpoint}/contact/apuchat                 (proxy del sitio)
 *         proxy → POST {hub}/api/video-call             crea un canal privado
 *         proxy → entra al canal con la identidad del agente (relé)
 *         proxy → POST {hub}/api/dm                     avisa al operador con su enlace
 *         proxy ← {handoff_id, handoff_token, call_url_public}
 *     → ApuchatBridge.join() → el widget pasa a "modo humano":
 *         lo que escribe el usuario → POST {endpoint}/contact/apuchat/send
 *         respuestas del operador  ← POST {endpoint}/contact/apuchat/wait (long-poll)
 *     → Botón "Videollamada" abre call_url_public (voz/vídeo de apuchat).
 *
 * Todo pasa por el proxy: el hub no admite CORS desde sitios de terceros y las credenciales
 * del canal no deben salir del servidor. El navegador solo guarda un id + token opacos del relé
 * (en sessionStorage, para sobrevivir a navegaciones de página).
 */

import { acceptLanguage } from '../llm/ProxyLLM.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

const MAX_MSG = 8192;

export class ApuchatBridge {
  /**
   * @param {object} o
   * @param {string} o.endpoint   proxy de 7ots (p. ej. '/api/agent')
   * @param {string} [o.siteKey]
   * @param {import('../core/EventBus.js').EventBus} o.bus
   * @param {ReturnType<import('../core/storage.js').createStore>} o.store
   * @param {(key: string, vars?: object) => string} [o.t]  traductor (avisos del chat; su `locale` va en Accept-Language)
   */
  constructor({ endpoint, siteKey, bus, store, t = translator() }) {
    this.t = t;
    this.base = `${endpoint.replace(/\/$/, '')}/contact/apuchat`;
    this.siteKey = siteKey;
    this.bus = bus;
    this.store = store;
    this.session = store.get('apuchat', null); // {id, token, since, call_url_public}
    if (this.session && !this.session.token) this.session = null; // formato antiguo
    this._stop = null;
  }

  get active() {
    return !!this.session;
  }

  get callUrl() {
    return this.session?.call_url_public || null;
  }

  /** Reanuda una sesión guardada (tras navegar de página). */
  resume() {
    if (this.session && !this._stop) this._loop();
  }

  /** @param {{handoff_id, handoff_token, call_url_public}} started  respuesta de /contact/apuchat */
  join({ handoff_id, handoff_token, call_url_public }) {
    this.session = { id: handoff_id, token: handoff_token, since: null, call_url_public: call_url_public || null };
    this._save();
    this._loop();
    this.bus.emit('handoff:start', { callUrl: this.callUrl });
  }

  async send(text) {
    if (!this.session) throw new Error('No hay conversación con una persona activa');
    const res = await this._post('send', { text: String(text).slice(0, MAX_MSG) });
    if (res.status === 404 || res.status === 410) {
      this.end(this.t('widget.handoff.closed'));
      throw new Error('canal cerrado');
    }
    if (!res.ok) throw new Error(`apuchat send ${res.status}`);
  }

  /** Long-poll (vía proxy) de mensajes del operador. */
  _loop() {
    let stopped = false;
    const ctrl = new AbortController();
    this._stop = () => {
      stopped = true;
      ctrl.abort();
    };
    const run = async () => {
      let backoff = 1000;
      while (!stopped && this.session) {
        const s = this.session;
        try {
          const res = await this._post('wait', { since: s.since }, ctrl.signal);
          if (res.status === 404 || res.status === 410) return this.end(this.t('widget.handoff.closed'));
          if (!res.ok) throw new Error(`wait ${res.status}`);
          const { messages = [], since, ended } = await res.json();
          if (ended) return this.end(this.t('widget.handoff.closed'));
          if (since != null) s.since = since;
          for (const m of messages) this.bus.emit('handoff:message', { from: m.from, text: m.text });
          this._save();
          backoff = 1000;
        } catch (err) {
          if (stopped) return;
          await new Promise((r) => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, 15000);
        }
      }
    };
    run();
  }

  /** Termina el modo humano y vuelve al asistente. */
  end(reason = '') {
    this._stop?.();
    this._stop = null;
    if (!this.session) return;
    const { id, token } = this.session;
    this.session = null;
    this.store.remove('apuchat');
    // Best-effort: avisa al equipo y libera el relé (keepalive por si se cierra la página).
    this._post('end', { id, token }, undefined, true).catch(() => {});
    this.bus.emit('handoff:end', { reason });
  }

  /** Pausa el polling sin cerrar la sesión (antes de navegar). */
  suspend() {
    this._stop?.();
    this._stop = null;
  }

  _post(path, data, signal, keepalive = false) {
    const { id, token } = this.session || {};
    return fetch(`${this.base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.siteKey ? { 'X-Site-Key': this.siteKey } : {}), ...acceptLanguage(this.t.locale) },
      body: JSON.stringify({ id, token, ...data }),
      signal,
      keepalive,
    });
  }

  _save() {
    this.store.set('apuchat', this.session);
  }
}

/**
 * Herramienta para el LLM + conexión del puente.
 * @param {object} o
 * @param {string} o.endpoint
 * @param {string} [o.siteKey]
 * @param {ApuchatBridge} o.bridge
 * @param {() => Array<{from,text}>} o.getTranscript
 * @param {(key: string, vars?: object) => string} [o.t]  traductor (por defecto, el del puente)
 */
export function createApuchatActions({ endpoint, siteKey, bridge, getTranscript, t = bridge?.t || translator() }) {
  return [
    {
      name: 'escalate_to_human',
      category: 'contact',
      description:
        'Conecta al usuario en vivo con una persona del equipo (chat en este mismo widget, con opción de videollamada) vía apuchat. ' +
        'Úsalo si el usuario lo pide, si está frustrado, o si el caso requiere una persona (pagos, reclamaciones, excepciones). ' +
        'Incluye un resumen para que la persona no tenga que volver a preguntar.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo en pocas palabras' },
          summary: { type: 'string', description: 'Resumen del caso y lo que ya se intentó' },
          urgency: { type: 'string', enum: ['baja', 'normal', 'alta'] },
        },
        required: ['reason', 'summary'],
      },
      confirm: () => t('widget.contact.humanConfirm'),
      enabled: () => !bridge.active,
      timeoutMs: 30000,
      handler: async (args, { auth, ui }) => {
        const user = auth?.publicUser() || null;
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/contact/apuchat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(siteKey ? { 'X-Site-Key': siteKey } : {}), ...acceptLanguage(t.locale) },
          body: JSON.stringify({
            reason: args.reason,
            summary: args.summary,
            urgency: args.urgency || 'normal',
            user,
            page: { url: location.href, title: document.title },
            transcript: getTranscript().slice(-30),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: body.error || `No se pudo contactar con soporte (HTTP ${res.status}). Ofrece dejar un correo.` };

        bridge.join(body);
        // Primer mensaje al operador, en el idioma del visitante (así sabe en cuál contestar).
        await bridge
          .send(t('widget.contact.handoffIntro', { name: user?.name || t('widget.contact.visitor'), reason: args.reason, summary: args.summary, url: location.href }))
          .catch(() => {});
        ui?.toast({ message: t('widget.contact.connected'), type: 'success' });
        return {
          ok: true,
          data: {
            connected: true,
            operatorNotified: body.operatorNotified !== false,
            note: 'El usuario ya está en el chat con una persona; tus próximos mensajes no serán necesarios hasta que vuelva. Despídete en una frase.',
          },
        };
      },
    },
  ];
}

