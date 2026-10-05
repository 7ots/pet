/**
 * Acceso seguro a sessionStorage.
 *
 * sessionStorage puede lanzar (modo privado, iframes sandbox, cookies bloqueadas),
 * así que todo va envuelto en try/catch y el widget funciona igual sin persistencia.
 * Se usa sessionStorage (no localStorage) para que la conversación sobreviva a una
 * navegación dentro del sitio pero muera al cerrar la pestaña.
 */
export function createStore(namespace) {
  const k = (key) => `7ots:${namespace}:${key}`;
  return {
    get(key, fallback = null) {
      try {
        const raw = sessionStorage.getItem(k(key));
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(k(key), JSON.stringify(value));
      } catch {
        /* sin persistencia: no pasa nada */
      }
    },
    remove(key) {
      try {
        sessionStorage.removeItem(k(key));
      } catch {
        /* ignore */
      }
    },
  };
}
