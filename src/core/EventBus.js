/**
 * EventBus — pub/sub mínimo y tipado por convención.
 *
 * Todos los módulos se comunican por aquí en vez de llamarse entre sí,
 * así cualquier pieza (avatar, voz, UI) se puede reemplazar sin tocar el resto.
 *
 * Eventos emitidos por el framework (payload entre llaves):
 *   ready {}                          · widget montado
 *   user:message {text, source}       · el usuario escribió/habló
 *   agent:thinking {on}               · el LLM está trabajando
 *   agent:message {text}              · respuesta de texto del agente
 *   agent:error {error}
 *   action:start {name, args}         · antes de ejecutar una herramienta
 *   action:end {name, args, result}   · después (result.ok true/false)
 *   context:route {url, prev}         · cambio de URL (SPA o hash)
 *   context:section {id, title}       · el usuario entró en otra sección
 *   context:mutation {added, removed} · cambios relevantes del DOM
 *   proactive:trigger {reason}        · la proactividad decidió intervenir
 *   auth:change {authenticated, user}
 *   voice:start {text} / voice:end {}
 *   handoff:message {from, text}      · mensaje de un humano (apuchat)
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  /** Suscribe y devuelve una función para desuscribir. '*' recibe todo. */
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const off = this.on(event, (p) => { off(); fn(p); });
    return off;
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  emit(event, payload = {}) {
    for (const key of [event, '*']) {
      for (const fn of this._handlers.get(key) || []) {
        try {
          key === '*' ? fn(event, payload) : fn(payload);
        } catch (err) {
          // Un listener roto nunca debe tumbar el widget.
          console.error(`[7ots] listener de "${event}" falló:`, err);
        }
      }
    }
  }

  clear() {
    this._handlers.clear();
  }
}
