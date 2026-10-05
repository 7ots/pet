/**
 * API del backoffice de 7ots (/api/agent/admin/*).
 *
 * Acceso:
 *   - Con ADMIN_PASSWORD: login → cookie firmada (HttpOnly, SameSite=Strict, 12 h).
 *   - Sin ADMIN_PASSWORD: solo desde esta máquina (loopback y sin cabeceras de proxy).
 * Además: mismo origen obligatorio y, en escrituras, la cabecera X-7ots-Admin (fuerza preflight).
 * Los secretos nunca se devuelven: solo si están configurados.
 * Los errores salen en el idioma de Accept-Language (el backoffice manda el que tenga elegido).
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getIdentity, setIdentity, MEET_AVATARS, MEET_SCENES, OPENAI_VOICES, GROK_VOICES, TTS_MODELS } from './identity.mjs';
import { widgetConfig, saveWidget, serverView, saveServer } from './settings.mjs';
import { reqT, requestLocale } from './i18n.mjs';

const env = process.env;
const COOKIE = 'ots_admin';
const TTL = 12 * 3600_000;
const SALT = randomBytes(32); // las sesiones caducan al reiniciar el proceso

/**
 * @param {object} deps
 * @param {() => {name:string, model:string, step:Function}} deps.llm
 * @param {() => object} deps.channels
 * @param {(o:{channels:boolean}) => Promise<void>} deps.reload   reaplica la configuración del servidor
 * @param {Function} deps.synthesize
 * @param {Function} deps.ttsProvider
 * @param {Function} deps.readJson
 * @param {Function} deps.send
 */
export function createAdmin({ llm, channels, reload, synthesize, ttsProvider, readJson, send }) {
  const key = () => createHmac('sha256', SALT).update(env.ADMIN_PASSWORD || 'local').digest();
  const sign = (exp) => createHmac('sha256', key()).update(`admin.${exp}`).digest('base64url');
  const fails = new Map();

  function mode(req) {
    if (env.ADMIN_PASSWORD) return 'password';
    return isLocal(req) ? 'local' : 'blocked';
  }

  function authed(req) {
    const m = mode(req);
    if (m === 'local') return true;
    if (m === 'blocked') return false;
    const raw = parseCookies(req.headers.cookie)[COOKIE] || '';
    const [exp, mac] = raw.split('.');
    if (!exp || !mac || Number(exp) < Date.now()) return false;
    return safeEqual(mac, sign(exp));
  }

  function status() {
    const ch = channels();
    return {
      llm: `${llm().name}:${llm().model}`,
      tts: ttsProvider(),
      channels: ch.status(),
      live: ch.live(),
      contact: {
        apumail: !!(env.APUMAIL_INBOX && env.APUMAIL_INBOX_TOKEN && env.APUMAIL_TO),
        apuchatOperator: !!(env.APUCHAT_NOTIFIER_IDENTITY_KEY && env.APUCHAT_OPERATOR_HANDLE),
      },
    };
  }

  /** @returns {Promise<boolean>} true si atendió la ruta */
  return async function handle(req, res, path) {
    if (!path.startsWith('/admin/')) return false;
    const route = path.slice('/admin'.length);
    const t = reqT(req);
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      send(res, 403, { error: t('server.admin.sameOrigin') });
      return true;
    }
    res.setHeader('X-Frame-Options', 'DENY');
    const write = req.method !== 'GET' && req.method !== 'HEAD';
    if (write && req.headers['x-7ots-admin'] !== '1') {
      send(res, 403, { error: t('server.admin.missingHeader') });
      return true;
    }

    if (route === '/session' && req.method === 'GET') {
      send(res, 200, { authed: authed(req), mode: mode(req) });
      return true;
    }

    if (route === '/login' && req.method === 'POST') {
      if (!env.ADMIN_PASSWORD) {
        send(res, 400, { error: mode(req) === 'local' ? t('server.admin.noPasswordLocal') : t('server.admin.definePassword') });
        return true;
      }
      const ip = req.socket.remoteAddress;
      const now = Date.now();
      const recent = (fails.get(ip) || []).filter((t) => now - t < 10 * 60_000);
      if (recent.length >= 5) {
        send(res, 429, { error: t('server.admin.tooManyAttempts') });
        return true;
      }
      const { password } = await readJson(req, 4096);
      if (!safeEqual(hash(String(password || '')), hash(env.ADMIN_PASSWORD))) {
        recent.push(now);
        fails.set(ip, recent);
        send(res, 401, { error: t('server.admin.wrongPassword') });
        return true;
      }
      fails.delete(ip);
      const exp = now + TTL;
      const secure = req.socket.encrypted || (env.TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] === 'https');
      res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Path=/api/agent/admin; HttpOnly; SameSite=Strict; Max-Age=${TTL / 1000}${secure ? '; Secure' : ''}`);
      send(res, 200, { ok: true });
      return true;
    }

    if (route === '/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/api/agent/admin; HttpOnly; SameSite=Strict; Max-Age=0`);
      send(res, 200, { ok: true });
      return true;
    }

    if (!authed(req)) {
      send(res, 401, { error: mode(req) === 'blocked' ? t('server.admin.closed') : t('server.admin.login') });
      return true;
    }

    if (route === '/state' && req.method === 'GET') {
      send(res, 200, {
        identity: getIdentity(),
        widget: widgetConfig(),
        server: serverView(),
        status: status(),
        options: { meetAvatars: MEET_AVATARS, meetScenes: MEET_SCENES, openaiVoices: OPENAI_VOICES, grokVoices: GROK_VOICES, ttsModels: TTS_MODELS },
      });
      return true;
    }

    if (route === '/identity' && req.method === 'PUT') {
      send(res, 200, { identity: setIdentity(await readJson(req, 256 * 1024)) });
      return true;
    }

    if (route === '/widget' && req.method === 'PUT') {
      send(res, 200, { widget: saveWidget(await readJson(req, 256 * 1024)) });
      return true;
    }

    if (route === '/server' && req.method === 'PUT') {
      const { values, secrets } = await readJson(req, 256 * 1024);
      const r = saveServer(values, secrets);
      if (r.changed.length) await reload({ channels: r.channels });
      send(res, 200, { ...r, server: serverView(), status: status() });
      return true;
    }

    if (route === '/test/llm' && req.method === 'POST') {
      const t0 = Date.now();
      try {
        const out = await llm().step({
          // La prueba contesta en el idioma del backoffice.
          system: t('server.admin.testSystem'),
          messages: [{ role: 'user', content: t('server.admin.testPrompt') }],
          tools: [],
          locale: requestLocale(req),
        });
        send(res, 200, { ok: true, text: out.text, ms: Date.now() - t0, llm: `${llm().name}:${llm().model}` });
      } catch (e) {
        send(res, 200, { ok: false, error: String(e.message || e).slice(0, 300), ms: Date.now() - t0 });
      }
      return true;
    }

    if (route === '/test/tts' && req.method === 'POST') {
      const { text, voice } = await readJson(req, 16 * 1024);
      const { audio, contentType } = await synthesize({ text: String(text || t('server.admin.ttsSample')).slice(0, 300), voice: voice || getIdentity().voice });
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
      res.end(audio);
      return true;
    }

    if (route === '/status' && req.method === 'GET') {
      send(res, 200, status());
      return true;
    }

    send(res, 404, { error: t('server.admin.unknownRoute') });
    return true;
  };
}

function isLocal(req) {
  const ip = req.socket.remoteAddress || '';
  const loop = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  // Detrás de un proxy inverso en la misma máquina todo parece loopback: si hay cabeceras de proxy, no es local.
  const proxied = req.headers['x-forwarded-for'] || req.headers.forwarded || req.headers['x-real-ip'];
  return loop && !proxied;
}

function parseCookies(h = '') {
  const out = {};
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const hash = (s) => createHash('sha256').update(s).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
