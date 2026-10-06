#!/usr/bin/env node
/**
 * Proxy de 7ots — el único sitio donde viven las claves.
 *
 *   POST /api/agent/chat              { system, messages, tools } → { text, toolCalls, ... }
 *   POST /api/agent/tts               { text, lang }             → audio/mpeg
 *   POST /api/agent/contact/apumail   ticket por correo
 *   POST /api/agent/contact/apuchat   crea canal apuchat + avisa al operador
 *   POST /api/agent/channels/apumail  webhook de apumail (el agente contesta correos)
 *   GET  /api/agent/identity          tarjeta pública del agente (identidad visual, voz, contacto)
 *   GET  /api/agent/identity.vcf      la misma tarjeta como vCard
 *   GET  /.well-known/7ots-agent.json descubrimiento del agente (igual que /identity)
 *   POST /api/agent/identity/call     videollamada de meet con el agente → { call_url }
 *   GET  /api/agent/config            configuración pública del widget (la del backoffice)
 *   GET  /api/agent/embed.js          snippet de una línea: carga el widget con esa configuración
 *   GET  /api/agent/7ots.js · 7ots.mjs  el widget (IIFE / ESM) desde dist/
 *   *    /api/agent/admin/*           API del backoffice (ver server/admin.mjs)
 *   GET  /backoffice/                 backoffice de 7ots.com (siempre, aunque SERVE_STATIC=false)
 *   GET  /api/agent/health
 *
 * En modo desarrollo también sirve el repo como estáticos (site/, brand/, examples/, src/, dist/)
 * y el backend de demo (server/demo.mjs). Cero frameworks: Node 22 + fetch nativo.
 *
 *   npm run dev          → http://localhost:8787/ (web) · /examples/ (demo)
 *
 * Seguridad:
 *   - CORS restringido a ALLOWED_ORIGINS (además del propio origen).
 *   - SITE_KEYS opcional: el widget manda X-Site-Key; útil si un proxy sirve a varios sitios.
 *   - Límite de peticiones por IP y tamaño máximo de cuerpo.
 *   - Nota: el `system` lo envía el widget. Para que nadie use tu proxy como LLM genérico,
 *     combina ALLOWED_ORIGINS + SITE_KEYS + rate limit, y si lo necesitas fija el prompt
 *     en el servidor con SERVER_INSTRUCTIONS (se antepone siempre).
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { llmsTxt } from '../cli/lib/prompts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(join(ROOT, '.env'));
const { loadSettings, widgetConfig } = await import('./settings.mjs');
loadSettings(); // lo guardado en el backoffice (data/config.json + data/secrets.json) manda sobre .env

const { createLLM } = await import('./llm.mjs');
const { synthesize, ttsProvider } = await import('./tts.mjs');
const { sendApumail, startApuchat } = await import('./contact.mjs');
const relay = await import('./apuchat-relay.mjs');
const { handleDemo } = await import('./demo.mjs');
const { startAgentChannels } = await import('./channels/index.mjs');
const { getIdentity, identityConfigured, identityPrompt, publicIdentity, toVCard } = await import('./identity.mjs');
const { createAdmin } = await import('./admin.mjs');
// Idioma: respuestas al cliente según Accept-Language; consola y equipo según LOCALE (ver server/i18n.mjs).
const { reqT, requestLocale, teamT, i18nError, errorText } = await import('./i18n.mjs');

const env = process.env;
const PORT = Number(env.PORT || 8787);
const PREFIX = '/api/agent';
const SERVE_STATIC = env.SERVE_STATIC !== 'false';
const DEMO = env.DEMO !== 'false';
// Se leen en cada petición: el backoffice los cambia en caliente.
const csv = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED = () => csv(env.ALLOWED_ORIGINS);
const SITE_KEYS = () => csv(env.SITE_KEYS);
const RATE = () => Number(env.RATE_LIMIT_PER_MIN || 40);

let llm = createLLM();
// Los canales ven siempre el LLM vigente (el backoffice puede cambiar de proveedor sin reiniciarlos).
const liveLlm = { get name() { return llm.name; }, get model() { return llm.model; }, step: (a) => llm.step(a) };
// El agente también atiende por apumail/apuchat/meet si hay variables APUMAIL_AGENT_* / APUCHAT_AGENT_*.
let channels = startAgentChannels({ llm: liveLlm });

/** Reaplica la configuración del servidor tras guardar en el backoffice. */
async function reload({ channels: restartChannels = false } = {}) {
  llm = createLLM();
  if (restartChannels) {
    await Promise.race([channels.stop(), new Promise((r) => setTimeout(r, 3000))]);
    channels = startAgentChannels({ llm: liveLlm });
  }
  const t = teamT();
  console.log(`[7ots] ${t('server.log.applied', { llm: `${llm.name}:${llm.model}`, tts: ttsProvider() })}${restartChannels ? t('server.log.channelsRestarted') : ''}`);
}

const admin = createAdmin({ llm: () => llm, channels: () => channels, reload, synthesize, ttsProvider, readJson, send });

// Plataforma multi-cuenta (7ots.com): cuentas, varios ots por cuenta y dashboard en /app/. Ver server/platform/.
const PLATFORM = env.PLATFORM === 'true';
let platform = null;
let auth = null;
let platformRuntime = null;
if (PLATFORM) {
  const { assertSecret } = await import('./platform/crypto.mjs');
  assertSecret();
  const { openDb } = await import('./platform/db.mjs');
  openDb();
  const { createPlatform } = await import('./platform/routes.mjs');
  const { createAuth } = await import('./platform/auth.mjs');
  platformRuntime = await import('./platform/runtime.mjs');
  platform = createPlatform({ send, readJson, rateLimit, callLimit, originOf, embedScript, bundleVersion, relay, sendApumail, startApuchat });
  auth = createAuth({ send, readJson, originOf, clientIp });
  platformRuntime.startAllChannels();
  console.log(`[7ots] ${teamT()('platform.log.ready', { db: env.PLATFORM_DB || 'data/platform.db' })}`);
}

// ───────────────────────────── servidor ─────────────────────────────

// Commit desplegado: scripts/deploy.sh escribe REVISION (JSON) en la raíz. Sin él (dev) → null.
const REVISION = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'REVISION'), 'utf8')); } catch { return null; }
})();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const t = reqT(req);
  if (REVISION?.commit) res.setHeader('X-7ots-Revision', REVISION.commit);
  try {
    if (url.pathname === '/version.json' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(REVISION || { commit: null }));
    }
    if (platform && ((await platform(req, res, url)) || (await auth(req, res, url)))) return;
    if (PLATFORM && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) return await serveApp(req, res, url.pathname);
    if (url.pathname === '/llms.txt' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' });
      return res.end(llmsTxt(PLATFORM ? 'https://7ots.com' : originOf(req)));
    }
    if (publicIdentityRoute(req, res, url)) return; // tarjeta pública: cualquier origen puede leerla
    if (await publicWidgetRoute(req, res, url)) return; // config pública y embed.js
    if (url.pathname.startsWith(`${PREFIX}/admin/`)) {
      // In platform mode each ot has its own admin under /api/platform; the single-tenant one would rule them all.
      if (PLATFORM) return send(res, 404, { error: t('server.http.notFound') });
      if (await admin(req, res, url.pathname.slice(PREFIX.length))) return;
    }
    if (url.pathname === '/backoffice' || url.pathname.startsWith('/backoffice/')) return await serveBackoffice(req, res, url.pathname);
    if (!cors(req, res)) return send(res, 403, { error: t('server.http.originNotAllowed') });
    // In platform mode the operator's /api/agent (the landing demo) only answers the platform's own pages.
    if (PLATFORM && url.pathname.startsWith(PREFIX) && req.method === 'POST' && !sameOrigin(req)) return send(res, 403, { error: t('server.http.originNotAllowed') });
    if (req.method === 'OPTIONS') return send(res, 204);

    if (url.pathname.startsWith(PREFIX)) return await api(req, res, url.pathname.slice(PREFIX.length));
    if (DEMO && (await handleDemo(req, res, url, { readJson, send }))) return;
    if (SERVE_STATIC && req.method === 'GET') return await serveStatic(req, res, url.pathname);
    send(res, 404, { error: t('server.http.notFound') });
  } catch (err) {
    // Only our own (i18n) errors reach the visitor as text; provider/SDK errors can echo keys or bodies.
    const status = err.i18n ? err.status || 500 : err.status ? 502 : 500;
    if (status >= 500 && status !== 501) console.error('[7ots]', req.method, url.pathname, err);
    if (!res.headersSent) send(res, status, { error: status >= 500 && status !== 501 ? t('server.http.internal') : errorText(err, t) });
  }
});

async function api(req, res, path) {
  const t = reqT(req);
  if (path === '/health') {
    return send(res, 200, { ok: true, llm: `${llm.name}:${llm.model}`, tts: ttsProvider(), apumail: !!(env.APUMAIL_INBOX && env.APUMAIL_INBOX_TOKEN && env.APUMAIL_TO), apuchat: true, channels: channels.status() });
  }
  if (await channels.handle(req, res, path)) return;
  if (req.method !== 'POST') return send(res, 405, { error: t('server.http.methodNotAllowed') });
  if (SITE_KEYS().length && !SITE_KEYS().includes(req.headers['x-site-key'])) return send(res, 401, { error: t('server.http.badSiteKey') });
  if (!rateLimit(req)) return send(res, 429, { error: t('server.http.rateLimited') });

  if (path === '/chat') {
    const body = await readJson(req, 1024 * 1024);
    const { system, messages, tools = [] } = body;
    if (typeof system !== 'string' || !Array.isArray(messages) || !messages.length || !Array.isArray(tools)) {
      return send(res, 400, { error: t('server.http.badRequest') });
    }
    if (messages.length > 300 || tools.length > 128 || system.length > 30000) return send(res, 413, { error: t('server.http.tooLarge') });
    // La personalidad de la identidad (con sus instrucciones privadas) la pone el servidor.
    const pre = [env.SERVER_INSTRUCTIONS, identityConfigured() ? identityPrompt(getIdentity()) : ''].filter(Boolean).join('\n\n');
    const sys = pre ? `${pre}\n\n${system}` : system;
    const t0 = Date.now();
    // `locale`: idioma de los textos fijos del proveedor (rechazo, modo mock); el modelo contesta en el del prompt.
    const out = await llm.step({ system: sys, messages, tools, locale: requestLocale(req) });
    if (env.LOG_LEVEL === 'debug') console.log(`[7ots] chat ${Date.now() - t0}ms ${out.finishReason} tools=${out.toolCalls.map((c) => c.name).join(',')}`);
    return send(res, 200, out);
  }

  if (path === '/tts') {
    const { text } = await readJson(req, 16 * 1024);
    const { audio, contentType } = await synthesize({ text, voice: getIdentity().voice });
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
    return res.end(audio);
  }

  if (path === '/identity/call') {
    if (!callLimit(req)) return send(res, 429, { error: t('server.http.callLimited') });
    const { motivo } = await readJson(req, 4 * 1024);
    const call = await channels.openCall({ reason: String(motivo || '').slice(0, 200) });
    return send(res, 200, { call_url: call.call_url, expires_at: call.expires_at });
  }

  if (path === '/contact/apumail') return send(res, 200, await sendApumail(await readJson(req, 128 * 1024)));
  if (path === '/contact/apuchat') return send(res, 200, await startApuchat(await readJson(req, 128 * 1024)));
  // Relé del chat con el equipo (el hub no admite CORS de terceros): {id, token, ...}
  if (path === '/contact/apuchat/send') return send(res, 200, await relay.relaySend(await readJson(req, 16 * 1024)));
  if (path === '/contact/apuchat/wait') return send(res, 200, await relay.relayWait(await readJson(req, 4 * 1024)));
  if (path === '/contact/apuchat/end') return send(res, 200, await relay.relayEnd(await readJson(req, 4 * 1024)));

  send(res, 404, { error: t('server.http.unknownRoute') });
}

// ───────────────────────────── identidad pública ─────────────────────────────

function publicIdentityRoute(req, res, url) {
  const p = url.pathname;
  const json = p === `${PREFIX}/identity` || p === '/.well-known/7ots-agent.json';
  const vcf = p === `${PREFIX}/identity.vcf`;
  if (!json && !vcf) return false;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    send(res, 204);
    return true;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { error: reqT(req)('server.http.methodNotAllowed') });
    return true;
  }
  const card = publicIdentity(getIdentity(), channels.live());
  if (vcf) {
    const body = toVCard(card, { baseUrl: `${originOf(req)}${PREFIX}/identity.vcf` });
    res.writeHead(200, { 'Content-Type': 'text/vcard; charset=utf-8', 'Content-Disposition': `inline; filename="${card.id}.vcf"`, 'Cache-Control': 'no-cache' });
    res.end(body);
    return true;
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(card));
  return true;
}

function originOf(req) {
  const proto = env.TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${req.headers.host}`;
}

// ───────────────────────────── widget: config pública, embed y bundle ─────────────────────────────

async function publicWidgetRoute(req, res, url) {
  const p = url.pathname;
  const routes = [`${PREFIX}/config`, `${PREFIX}/embed.js`, `${PREFIX}/7ots.js`, `${PREFIX}/7ots.mjs`];
  if (!routes.includes(p)) return false;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { error: reqT(req)('server.http.methodNotAllowed') });
    return true;
  }
  if (p === `${PREFIX}/config`) {
    send(res, 200, widgetConfig());
    return true;
  }
  if (p === `${PREFIX}/embed.js`) {
    const v = await bundleVersion();
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(embedScript(widgetConfig(), v));
    return true;
  }
  const file = join(ROOT, 'dist', p.endsWith('.mjs') ? '7ots.esm.js' : '7ots.iife.js');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': url.searchParams.has('v') ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  } catch {
    send(res, 503, { error: reqT(req)('server.http.noDist') });
  }
  return true;
}

async function bundleVersion() {
  try {
    return String(Math.floor((await stat(join(ROOT, 'dist', '7ots.iife.js'))).mtimeMs));
  } catch {
    return '0';
  }
}

/**
 * <script src="https://tu-proxy/api/agent/embed.js" data-site-key="pk_…" async></script>
 * Carga el widget con la configuración del backoffice. Lo que la página ponga en
 * window.SevenOtsConfig (acciones, auth, plantillas…) se mezcla encima. Al arrancar emite
 * el evento `7ots:ready` en window con { agent }.
 * `endpoint`: ruta de la API del agente (en la plataforma, la de cada ots: /api/o/<id>).
 */
function embedScript(config, v, endpoint = PREFIX) {
  return `/* 7ots.com — widget con la configuración del backoffice */
(function () {
  var s = document.currentScript;
  if (!s || window.__7otsEmbed) return;
  window.__7otsEmbed = true;
  var origin = new URL(s.src).origin;
  var base = ${JSON.stringify(config).replace(/</g, '\\u003c')};
  base.endpoint = origin + '${endpoint}';
  base.identity = true;
  if (s.dataset.siteKey) base.siteKey = s.dataset.siteKey;
  function merge(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) {
      var x = b[k], y = a[k];
      o[k] = x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y) ? merge(y, x) : x;
    }
    return o;
  }
  function start() {
    var agent = window.SevenOts.init(merge(base, window.SevenOtsConfig || {}));
    window.dispatchEvent(new CustomEvent('7ots:ready', { detail: { agent: agent } }));
  }
  var js = document.createElement('script');
  js.src = origin + '${PREFIX}/7ots.js?v=${v}';
  js.onload = function () { document.body ? start() : document.addEventListener('DOMContentLoaded', start); };
  document.head.appendChild(js);
})();
`;
}

/** Dashboard de la plataforma (/app/): mismas cabeceras que el backoffice. */
function serveApp(req, res, pathname) {
  return serveBackoffice(req, res, pathname, 'app');
}

async function serveBackoffice(req, res, pathname, dir = 'backoffice') {
  if (pathname === `/${dir}`) {
    res.writeHead(302, { Location: `/${dir}/` });
    return res.end();
  }
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(ROOT, rel);
  if (!file.startsWith(join(ROOT, dir))) return send(res, 403, { error: reqT(req)('server.http.forbidden') });
  try {
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) return redirectSlash(req, res, pathname);
      file = join(file, 'index.html');
    }
    const data = await readFile(file);
    const headers = { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    // Nada se puede enmarcar (clickjacking).
    headers['Content-Security-Policy'] = "frame-ancestors 'none'";
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    send(res, 404, { error: reqT(req)('server.http.notFound') });
  }
}

// Cada videollamada ocupa al agente y gasta cupo de /api/video-call del hub (15/min por IP).
const callBuckets = new Map();
function callLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (callBuckets.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 3) return false;
  recent.push(now);
  callBuckets.set(ip, recent);
  if (callBuckets.size > 5000) callBuckets.clear();
  return true;
}

// ───────────────────────────── helpers HTTP ─────────────────────────────

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // misma página / curl
  const self = `http://${req.headers.host}`;
  const selfS = `https://${req.headers.host}`;
  const allowed = ALLOWED();
  const ok = origin === self || origin === selfS || allowed.includes(origin) || allowed.includes('*');
  if (!ok) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Site-Key, Mcp-Session-Id, Mcp-Protocol-Version, Accept, Accept-Language');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return !!origin && (origin === originOf(req) || (env.PLATFORM_URL && origin === new URL(env.PLATFORM_URL).origin));
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status);
    return res.end();
  }
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

async function readJson(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw i18nError(413, 'server.http.bodyTooLarge');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw i18nError(400, 'server.http.badJson');
  }
}

const buckets = new Map();
function clientIp(req) {
  // The right-most X-Forwarded-For entry is the one our proxy added; the ones before it are client-controlled.
  return (env.TRUST_PROXY === 'true' && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress;
}

function rateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const rate = RATE();
  const b = buckets.get(ip) || { tokens: rate, at: now };
  b.tokens = Math.min(rate, b.tokens + ((now - b.at) / 60000) * rate);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 10000) buckets.clear();
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon',
};
/** Directorio pedido sin barra final: 301 a la forma con barra (conserva la query). */
function redirectSlash(req, res, pathname) {
  const q = req.url.indexOf('?');
  res.writeHead(301, { Location: `${pathname}/${q >= 0 ? req.url.slice(q) : ''}` });
  res.end();
}

const STATIC_DIRS = ['site', 'brand', 'examples', 'src', 'dist'];

async function serveStatic(req, res, pathname) {
  if (pathname === '/') {
    res.writeHead(302, { Location: '/site/start/' });
    return res.end();
  }
  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (!STATIC_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) return send(res, 404, { error: reqT(req)('server.http.notFound') });
  let file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 403, { error: reqT(req)('server.http.forbidden') });
  try {
    if ((await stat(file)).isDirectory()) {
      // /site/start → /site/start/: sin la barra, los recursos relativos (start.css) no cargan.
      if (!pathname.endsWith('/')) return redirectSlash(req, res, pathname);
      file = join(file, 'index.html');
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, { error: reqT(req)('server.http.notFound') });
  }
}

/** Carga .env sin dependencias (no pisa variables ya definidas). */
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, async () => {
    await Promise.race([Promise.all([channels.stop(), platformRuntime?.stopAllChannels()]), new Promise((r) => setTimeout(r, 3000))]); // cuelga las llamadas abiertas
    process.exit(0);
  });
}

// El banner de arranque sale en el idioma del servidor (LOCALE → idioma de la identidad → español).
server.listen(PORT, () => {
  const t = teamT();
  console.log(`[7ots] ${t('server.log.listening', { port: PORT, llm: `${llm.name}:${llm.model}`, tts: ttsProvider() })}`);
  if (SERVE_STATIC) console.log(`[7ots] ${t('server.log.demo', { url: `http://localhost:${PORT}/examples/` })}`);
  console.log(`[7ots] ${t('server.log.backoffice', { url: `http://localhost:${PORT}/backoffice/` })}${env.ADMIN_PASSWORD ? '' : t('server.log.localOnly')}`);
});
