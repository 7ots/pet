/**
 * Relé de apuchat: el proxy hace de puente entre el widget y el canal del hub.
 *
 * Por qué en el servidor y no en el navegador:
 *   - El hub solo acepta CORS de sus propios orígenes (meet.apuchat.com): el navegador de un
 *     sitio cualquiera no puede llamar a /api/channels/* directamente.
 *   - Los canales de videollamada exigen `identity_key` para entrar. Esa clave (y el
 *     channel_token) no deben llegar al visitante.
 *
 * El navegador solo recibe un id de derivación y un token opaco generado aquí, que sirven para
 * este relé y nada más.
 *
 * Contrato del hub usado (apuchat.com):
 *   POST /api/channels/:id/join   Bearer channel_token  {identity_key}          → {session_id, callsign, history}
 *   GET  /api/channels/:id/wait?timeout&since   Bearer + X-Session-Id           → {messages:[{id,from,text,kind}]}
 *   POST /api/channels/:id/send   Bearer + X-Session-Id  {to:'all', message}   (≤ 8192)
 *   Errores de sesión: 400 {code:'not_joined'} · 410 {code:'session_expired'} → re-join.
 *   401/403/404 → canal cerrado o credenciales inválidas.
 *
 * Estado en memoria: con varias instancias del proxy usa sesiones "sticky" o cambia `handoffs`
 * por un almacén compartido (Redis…). Un reinicio cierra las derivaciones activas.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { tEs, teamT } from './i18n.mjs';

const MAX_MSG = 8192;
const WAIT_SECONDS = 25; // por debajo del timeout típico de proxies inversos
const IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_HANDOFFS = 5000;

/** @type {Map<string, {tokenHash: Buffer, hub: string, channel_id: string, channel_token: string, identity_key: string, session_id: string|null, callsign: string|null, touched: number}>} */
const handoffs = new Map();

const sha = (s) => createHash('sha256').update(String(s)).digest();

/** Error del relé: `key` es la clave de i18n (server.relay.*); se traduce al responder al visitante. */
export class RelayError extends Error {
  constructor(status, key, vars) {
    super(tEs(key, vars));
    this.status = status;
    this.i18n = { key, vars };
  }
}

/**
 * Entra en el canal recién creado con la identidad "agent" de la videollamada y registra
 * la derivación. Devuelve lo único que verá el navegador.
 */
export async function openHandoff({ hub, channel_id, channel_token, identity_key }) {
  sweep();
  if (handoffs.size >= MAX_HANDOFFS) throw new RelayError(503, 'server.relay.tooMany');
  const h = { tokenHash: null, hub, channel_id, channel_token, identity_key, session_id: null, callsign: null, touched: Date.now() };
  await join(h);
  const id = randomBytes(12).toString('base64url');
  const token = randomBytes(24).toString('base64url');
  h.tokenHash = sha(token);
  handoffs.set(id, h);
  return { handoff_id: id, handoff_token: token };
}

/** Mensaje del visitante → canal. */
export async function relaySend({ id, token, text }) {
  const h = auth(id, token);
  const message = String(text ?? '').trim().slice(0, MAX_MSG);
  if (!message) throw new RelayError(400, 'server.relay.empty');
  const res = await withSession(h, () =>
    hubFetch(h, `/send`, { method: 'POST', body: JSON.stringify({ to: 'all', message }) }),
  );
  if (!res.ok) throw new RelayError(res.status === 429 ? 429 : 502, res.status === 429 ? 'server.relay.slowDown' : 'server.relay.sendFailed');
  return { ok: true };
}

/**
 * Long-poll: mensajes nuevos del equipo desde `since`.
 * Devuelve `since` avanzado aunque todos los mensajes se filtren (control, eco, estado).
 */
export async function relayWait({ id, token, since }) {
  const h = auth(id, token);
  const qs = new URLSearchParams({ timeout: String(WAIT_SECONDS) });
  if (since != null && /^\d+$/.test(String(since))) qs.set('since', String(since));
  let res;
  try {
    res = await withSession(h, () => hubFetch(h, `/wait?${qs}`, { method: 'GET' }, (WAIT_SECONDS + 10) * 1000));
  } catch (err) {
    if (err instanceof RelayError && err.status === 410) {
      handoffs.delete(id);
      return { ended: true, messages: [], since };
    }
    throw err;
  }
  if (!res.ok) throw new RelayError(502, 'server.relay.noResponse');
  const body = await res.json().catch(() => ({}));
  let cursor = since ?? null;
  const messages = [];
  for (const m of body.messages || []) {
    cursor = m.id ?? cursor;
    if (m.from === h.callsign) continue; // eco propio
    if (m.kind === 'status') continue; // "el agente está trabajando…": efímero
    const text = String(m.text ?? m.message ?? '').trim();
    if (!text || text.startsWith('[')) continue; // [rtc] [avatar] [scene] [lang] [via]: señalización
    messages.push({ id: m.id, from: m.from, text });
  }
  return { messages, since: cursor, ended: false };
}

/** El visitante vuelve al asistente: se avisa al equipo (en el idioma del servidor) y se olvidan las credenciales. */
export async function relayEnd({ id, token }) {
  const h = auth(id, token);
  handoffs.delete(id);
  await hubFetch(h, `/send`, { method: 'POST', body: JSON.stringify({ to: 'all', message: teamT()('server.relay.visitorLeft') }) }).catch(() => {});
  return { ok: true };
}

// ───────────────────────────── internos ─────────────────────────────

function auth(id, token) {
  const h = handoffs.get(String(id || ''));
  const got = sha(token || '');
  if (!h || !timingSafeEqual(got, h.tokenHash)) throw new RelayError(404, 'server.relay.gone');
  h.touched = Date.now();
  return h;
}

async function join(h) {
  const res = await fetch(`${h.hub}/api/channels/${encodeURIComponent(h.channel_id)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.channel_token}` },
    body: JSON.stringify({ identity_key: h.identity_key }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new RelayError(410, 'server.relay.closed');
  if (!res.ok) throw new RelayError(502, 'server.relay.joinFailed', { status: res.status });
  const body = await res.json();
  h.session_id = body.session_id;
  h.callsign = body.callsign || h.callsign;
}

function hubFetch(h, path, init, timeoutMs = 15000) {
  return fetch(`${h.hub}/api/channels/${encodeURIComponent(h.channel_id)}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.channel_token}`, 'X-Session-Id': h.session_id || '' },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Ejecuta una llamada con la sesión del hub; si caducó (not_joined / session_expired) re-entra
 * y reintenta UNA vez. Otros 400 (validación) no provocan re-join: evitaría bucles.
 */
async function withSession(h, call) {
  for (let attempt = 0; ; attempt++) {
    if (!h.session_id) await join(h);
    const res = await call();
    if (res.status === 401 || res.status === 403 || res.status === 404) throw new RelayError(410, 'server.relay.closed');
    if ((res.status === 400 || res.status === 410) && attempt === 0) {
      const code = (await res.clone().json().catch(() => ({}))).code;
      if (res.status === 410 || code === 'not_joined' || code === 'session_expired') {
        h.session_id = null;
        continue;
      }
    }
    return res;
  }
}

function sweep() {
  const now = Date.now();
  for (const [id, h] of handoffs) if (now - h.touched > IDLE_TTL_MS) handoffs.delete(id);
}
