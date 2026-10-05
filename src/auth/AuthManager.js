/**
 * AuthManager — autenticación y estado del usuario del sitio anfitrión.
 *
 * El widget NO hace login: se engancha a la sesión que el sitio ya tiene.
 * Tres formas de conectarlo (config.auth):
 *
 *   { token: 'eyJ...' }                          // JWT fijo
 *   { getToken: async () => miStore.jwt }        // se pide en cada llamada (soporta refresh)
 *   { credentials: 'include' }                   // sesión por cookie (same-origin)
 *
 * Opcionales:
 *   getUser: () => ({ name, plan })   // datos NO sensibles que el agente puede conocer
 *   exposeClaims: ['name', 'role']    // claims del JWT que el agente puede ver (por defecto ninguno)
 *   allowedOrigins: ['https://api.misitio.com']  // orígenes que reciben el token (además del propio)
 *   header: 'Authorization', scheme: 'Bearer'
 *
 * Garantías:
 *   - El token jamás se incluye en el prompt ni se manda al proxy del LLM.
 *   - Solo se adjunta a peticiones hacia el mismo origen o `allowedOrigins`.
 *   - El JWT se decodifica SOLO para leer exp/claims de presentación; la verificación
 *     real la hace siempre el backend del sitio.
 */
export class AuthManager {
  constructor({ bus, config = {} } = {}) {
    this.bus = bus;
    this.cfg = { header: 'Authorization', scheme: 'Bearer', exposeClaims: [], allowedOrigins: [], ...config };
    this._token = this.cfg.token || null;
  }

  /** Actualiza el token (p. ej. tras login/logout/refresh en el sitio). */
  setToken(token) {
    this._token = token || null;
    this.bus?.emit('auth:change', { authenticated: this.isAuthenticated(), user: this.publicUser() });
  }

  async getToken() {
    if (typeof this.cfg.getToken === 'function') {
      try {
        return (await this.cfg.getToken()) || null;
      } catch {
        return null;
      }
    }
    if (this._token && isExpired(this._token)) return null;
    return this._token;
  }

  isAuthenticated() {
    if (typeof this.cfg.isAuthenticated === 'function') return !!this.cfg.isAuthenticated();
    // Con getToken/cookies el token no es legible de forma síncrona: si hay getUser,
    // "hay usuario" = sesión iniciada; si no, se asume sesión y decide el backend (401).
    if (typeof this.cfg.getToken === 'function' || this.cfg.credentials === 'include') {
      if (typeof this.cfg.getUser !== 'function') return typeof this.cfg.getToken === 'function';
      try {
        return !!this.cfg.getUser();
      } catch {
        return false;
      }
    }
    return !!this._token && !isExpired(this._token);
  }

  /** Datos del usuario que SÍ puede ver el LLM (nombre, plan…). Nunca el token. */
  publicUser() {
    if (!this.isAuthenticated()) return null;
    const user = {};
    const claims = this._token ? decodeJwt(this._token) : null;
    for (const k of this.cfg.exposeClaims) if (claims?.[k] !== undefined) user[k] = claims[k];
    try {
      Object.assign(user, this.cfg.getUser?.() || {});
    } catch {
      /* ignore */
    }
    return user;
  }

  canReceiveToken(url) {
    try {
      const origin = new URL(url, location.href).origin;
      return origin === location.origin || this.cfg.allowedOrigins.includes(origin);
    } catch {
      return false;
    }
  }

  /** Headers de auth para una URL (vacío si ese origen no está autorizado). */
  async headersFor(url) {
    if (!this.canReceiveToken(url)) return {};
    const token = await this.getToken();
    if (!token) return {};
    return { [this.cfg.header]: this.cfg.scheme ? `${this.cfg.scheme} ${token}` : token };
  }

  /**
   * fetch autenticado para los handlers de acciones:
   *   const r = await ctx.auth.fetch('/api/me/balance')
   */
  async fetch(url, init = {}) {
    const headers = new Headers(init.headers || {});
    for (const [k, v] of Object.entries(await this.headersFor(url))) headers.set(k, v);
    const res = await fetch(url, {
      ...init,
      headers,
      credentials: init.credentials || this.cfg.credentials || 'same-origin',
    });
    if (res.status === 401) {
      this.bus?.emit('auth:change', { authenticated: false, user: null, reason: 'unauthorized' });
      if (typeof this.cfg.onUnauthorized === 'function') this.cfg.onUnauthorized();
    }
    return res;
  }
}

/** Decodifica el payload de un JWT sin verificar la firma (solo lectura de claims). */
export function decodeJwt(token) {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

function isExpired(token) {
  const exp = decodeJwt(token)?.exp;
  return typeof exp === 'number' && exp * 1000 < Date.now() - 5000;
}
