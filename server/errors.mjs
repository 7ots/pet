/**
 * Monitoreo de errores propio (P10, "Sentry o similar"), sin dependencias ni terceros:
 *   - back: errores 5xx del servidor, uncaughtException y unhandledRejection;
 *   - front: window.onerror / unhandledrejection de 7ots.com y del panel → POST /api/site/error.
 * Cada error va al log (journald) y, agrupado por firma, se avisa por correo a ERROR_ALERT_EMAIL
 * (defecto maestro@apumail.com) con el mismo buzón de envío que el resto de avisos (server/notify.mjs).
 * Una misma firma avisa como mucho una vez por hora; tope global ERROR_ALERT_MAX_PER_HOUR (defecto 12).
 * Nunca se mandan cuerpos de request, cookies ni cabeceras: sólo mensaje, pila, ruta y navegador.
 */
import { createHash } from 'node:crypto';
import { notifyConfigured, sendNotify } from './notify.mjs';

const env = process.env;
const HOUR = 3600_000;
const seen = new Map(); // firma → { at, n }
let sentHour = 0;
let sentCount = 0;

const clip = (v, n) => String(v ?? '').slice(0, n);
const sigOf = (kind, msg, where) => createHash('sha1').update(`${kind}|${msg}|${where}`).digest('hex').slice(0, 12);

/** Registra un error y avisa (best-effort, nunca lanza). */
export function reportError({ kind = 'server', message, stack, where = '', ua = '', page = '' }) {
  try {
    const msg = clip(message, 300) || 'Error';
    const sig = sigOf(kind, msg, clip(where, 200));
    const now = Date.now();
    const e = seen.get(sig);
    console.error(`[7ots][error:${kind}] ${sig} ${msg}${where ? ` @ ${clip(where, 200)}` : ''}`);
    if (e && now - e.at < HOUR) { e.n++; return; }
    const repeats = e?.n || 0;
    seen.set(sig, { at: now, n: 0 });
    if (seen.size > 2000) seen.clear();
    const hour = Math.floor(now / HOUR);
    if (hour !== sentHour) { sentHour = hour; sentCount = 0; }
    if (sentCount >= Number(env.ERROR_ALERT_MAX_PER_HOUR || 12) || !notifyConfigured()) return;
    sentCount++;
    const text = [
      `Producto: 7ots.com`,
      `Tipo: ${kind}`,
      `Firma: ${sig}${repeats ? ` (se repitió ${repeats} veces en la hora anterior)` : ''}`,
      `Mensaje: ${msg}`,
      where && `Dónde: ${clip(where, 300)}`,
      page && `Página: ${clip(page, 300)}`,
      ua && `Navegador: ${clip(ua, 200)}`,
      `Fecha: ${new Date(now).toISOString()}`,
      env.REVISION && `Versión: ${env.REVISION}`,
      '',
      clip(stack, 3000),
    ].filter((x) => x !== '' && x != null && x !== false).join('\n');
    sendNotify({ to: env.ERROR_ALERT_EMAIL || 'maestro@apumail.com', subject: `[7ots error] ${kind}: ${msg.slice(0, 120)}`, text }).catch(() => {});
  } catch { /* el monitor nunca rompe nada */ }
}

/** Errores del proceso que no pasan por un request. */
export function watchProcess() {
  process.on('uncaughtException', (err) => reportError({ kind: 'uncaught', message: err?.message || String(err), stack: err?.stack }));
  process.on('unhandledRejection', (err) => reportError({ kind: 'unhandledRejection', message: err?.message || String(err), stack: err?.stack }));
}

/** POST /api/site/error: errores del navegador. Responde 204 siempre que el formato sea válido. */
export function createErrorIntake({ send, clientIp, originOf }) {
  const perIp = new Map();
  return async function handle(req, res, url) {
    if (url.pathname !== '/api/site/error') return false;
    if (req.method !== 'POST') { send(res, 405, { error: 'POST only' }); return true; }
    const origin = req.headers.origin;
    if (origin && origin !== originOf(req) && origin !== 'https://7ots.com') { send(res, 403, { error: 'origin' }); return true; }
    const ip = clientIp(req);
    const now = Date.now();
    const b = perIp.get(ip);
    const cur = b && now - b.at < 600_000 ? b : { at: now, n: 0 };
    cur.n++;
    perIp.set(ip, cur);
    if (perIp.size > 5000) perIp.clear();
    if (cur.n > 20) { res.setHeader('Retry-After', '600'); send(res, 429, { error: 'rate' }); return true; }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16_384) { send(res, 413, { error: 'too large' }); return true; }
    }
    let d;
    try { d = JSON.parse(raw || '{}'); } catch { send(res, 400, { error: 'json' }); return true; }
    if (!d || typeof d.message !== 'string' || !d.message.trim()) { send(res, 400, { error: 'message' }); return true; }
    reportError({ kind: 'browser', message: d.message, stack: d.stack, where: d.source ? `${clip(d.source, 200)}:${d.line || 0}:${d.col || 0}` : '', page: d.page, ua: req.headers['user-agent'] });
    res.writeHead(204);
    res.end();
    return true;
  };
}
