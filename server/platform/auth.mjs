/**
 * Acceso a la plataforma: enlace por correo y "Entrar con notlogin" (OIDC + PKCE).
 *
 *   POST /auth/email          { email }  → manda el enlace (buzón de apumail de la plataforma)
 *   GET  /auth/email?token=…  página con el botón "Entrar" (los antivirus del correo abren
 *                              los enlaces: un GET nunca gasta el enlace)
 *   POST /auth/email/confirm  token=…    gasta el enlace, abre sesión y lleva a /app/
 *   GET  /auth/notlogin                   → notlogin.com/authorize
 *   GET  /auth/notlogin/callback          ?code&state → sesión y /app/
 *   POST /auth/logout · /auth/logout-all (cierra todas las sesiones de la cuenta)
 *
 * Variables:
 *   PLATFORM_URL             origen público (https://7ots.com); los enlaces nunca salen de la cabecera Host
 *   PLATFORM_MAIL_INBOX      buzón de apumail que manda los enlaces · PLATFORM_MAIL_TOKEN su token
 *                            (sin buzón y fuera de producción, el enlace sale por consola)
 *   NOTLOGIN_CLIENT_ID       slug de 7ots como vendor de notlogin (también el `aud` del id_token)
 *   NOTLOGIN_CLIENT_SECRET   opcional · NOTLOGIN_URL (defecto https://notlogin.com)
 *
 * Sesión: cookie `ots_session` (HttpOnly, SameSite=Lax, 30 días); en la base de datos solo su hash.
 */

import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { reqT, teamT } from '../i18n.mjs';
import { signValue, unsignValue } from './crypto.mjs';
import { SESSION_TTL, accountExists, consumeLoginToken, createLoginToken, createSession, deleteAccountSessions, deleteSession, recentLoginTokens, sessionAccount, upsertAccount, linkNotlogin } from './store.mjs';
import { WALLET_SCOPE, saveNotloginTokens } from './wallet.mjs';

const penv = process.env;
export const SESSION_COOKIE = 'ots_session';
const OIDC_COOKIE = 'ots_oidc';
const OIDC_TTL = 10 * 60_000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const notloginUrl = () => (penv.NOTLOGIN_URL || 'https://notlogin.com').replace(/\/+$/, '');
export const notloginConfigured = () => !!penv.NOTLOGIN_CLIENT_ID;
export const mailConfigured = () => !!(penv.PLATFORM_MAIL_INBOX && penv.PLATFORM_MAIL_TOKEN);
const production = () => penv.NODE_ENV === 'production';

export function parseCookies(h = '') {
  const out = {};
  for (const part of String(h).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Cuenta de la sesión de esta petición (o null). */
export function currentAccount(req) {
  return sessionAccount(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

/**
 * @param {{ send: Function, readJson: Function, originOf: (req) => string, clientIp: (req) => string }} deps
 */
export function createAuth({ send, readJson, originOf, clientIp }) {
  const base = (req) => (penv.PLATFORM_URL || originOf(req)).replace(/\/+$/, '');
  const secure = (req) => base(req).startsWith('https:');
  const ipHits = new Map();
  const newAccounts = new Map(); // ip → timestamps of accounts created in the last day
  const MAX_NEW_ACCOUNTS = () => Number(penv.PLATFORM_NEW_ACCOUNTS_PER_IP_DAY || 3);

  /** New accounts per IP and day (each one brings a free quota). Returns the account, or null when over the cap. */
  function login(req, who) {
    if (accountExists(who)) return upsertAccount(who);
    const ip = clientIp(req);
    const now = Date.now();
    const recent = (newAccounts.get(ip) || []).filter((t) => now - t < 86400_000);
    if (recent.length >= MAX_NEW_ACCOUNTS()) return null;
    const account = upsertAccount(who);
    recent.push(now);
    newAccounts.set(ip, recent);
    if (newAccounts.size > 5000) newAccounts.clear();
    return account;
  }

  function cookie(req, name, value, { path = '/', maxAge }) {
    return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure(req) ? '; Secure' : ''}`;
  }

  function startSession(req, res, account, via) {
    const raw = createSession(account.id, via);
    res.setHeader('Set-Cookie', [cookie(req, SESSION_COOKIE, raw, { maxAge: SESSION_TTL }), cookie(req, OIDC_COOKIE, '', { path: '/auth/notlogin', maxAge: 0 })]);
  }

  function redirect(res, to) {
    res.writeHead(303, { Location: to, 'Cache-Control': 'no-store' });
    res.end();
  }

  /** Vuelve a la pantalla de acceso con un aviso (clave i18n que traduce el dashboard). */
  const fail = (res, key) => redirect(res, `/app/?error=${encodeURIComponent(key)}`);

  function tooMany(req) {
    const ip = clientIp(req);
    const now = Date.now();
    const recent = (ipHits.get(ip) || []).filter((t) => now - t < 3600_000);
    if (recent.length >= 10) return true;
    recent.push(now);
    ipHits.set(ip, recent);
    if (ipHits.size > 5000) ipHits.clear();
    return false;
  }

  async function sendLink(req, email) {
    const url = `${base(req)}/auth/email?token=${createLoginToken(email)}`;
    const t = reqT(req); // el correo, en el idioma de quien lo pide
    if (!mailConfigured()) {
      if (production()) throw Object.assign(new Error('mail'), { status: 501, key: 'platform.api.mailNotConfigured' });
      console.log(`[7ots] ${teamT()('platform.log.magicLink', { email, url })}`);
      return;
    }
    const api = (penv.APUMAIL_API || 'https://api.apumail.com').replace(/\/+$/, '');
    const r = await fetch(`${api}/api/v1/inbox/${encodeURIComponent(penv.PLATFORM_MAIL_INBOX.toLowerCase())}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${penv.PLATFORM_MAIL_TOKEN}` },
      body: JSON.stringify({ to: email, subject: t('platform.mail.subject'), text: t('platform.mail.body', { url }) }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (!r?.ok) {
      console.error('[7ots] plataforma: no se pudo mandar el enlace', r?.status ?? 'sin respuesta');
      throw Object.assign(new Error('mail'), { status: 502, key: 'platform.api.mailFailed' });
    }
  }

  // ── notlogin (OIDC) ──

  const redirectUri = (req) => `${base(req)}/auth/notlogin/callback`;

  function notloginStart(req, res, url) {
    if (!notloginConfigured()) return fail(res, 'platform.api.notloginNotConfigured');
    const verifier = randomBytes(32).toString('base64url');
    const st = { s: randomBytes(16).toString('base64url'), v: verifier, n: randomBytes(16).toString('base64url'), e: Date.now() + OIDC_TTL };
    // ?link=<otsId>: "Connect Notlogin" from the Wallet tab — ties notlogin to the signed-in account and
    // asks for the wallet scopes (wallet.mjs); comes back to that ot's Wallet tab.
    const link = String(url.searchParams.get('link') || '');
    const me = link && currentAccount(req);
    if (me && /^[a-z0-9_]{4,40}$/.test(link)) Object.assign(st, { l: me.id, o: link });
    const params = new URLSearchParams({
      vendor: penv.NOTLOGIN_CLIENT_ID,
      client_id: penv.NOTLOGIN_CLIENT_ID,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: st.l ? WALLET_SCOPE : 'openid profile email',
      state: st.s,
      nonce: st.n,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    res.setHeader('Set-Cookie', cookie(req, OIDC_COOKIE, signValue(Buffer.from(JSON.stringify(st)).toString('base64url')), { path: '/auth/notlogin', maxAge: OIDC_TTL }));
    redirect(res, `${notloginUrl()}/authorize?${params}`);
  }

  async function notloginCallback(req, res, url) {
    const raw = unsignValue(parseCookies(req.headers.cookie)[OIDC_COOKIE]);
    let st = null;
    try {
      st = raw && JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    } catch {
      /* cookie rota */
    }
    const code = url.searchParams.get('code');
    if (!st || st.e < Date.now() || !code || url.searchParams.get('state') !== st.s) return fail(res, 'platform.api.notloginFailed');
    try {
      const body = new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: st.v, redirect_uri: redirectUri(req), client_id: penv.NOTLOGIN_CLIENT_ID });
      if (penv.NOTLOGIN_CLIENT_SECRET) body.set('client_secret', penv.NOTLOGIN_CLIENT_SECRET);
      const r = await fetch(`${notloginUrl()}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id_token) throw new Error(`token ${r.status}`);
      const claims = await verifyIdToken(j.id_token, st.n);
      if (st.l) {
        const back = (k) => redirect(res, `/app/?notice=${k}#ots/${st.o}/wallet`);
        if (currentAccount(req)?.id !== st.l) return back('walletFailed');
        try {
          linkNotlogin(st.l, claims.sub);
        } catch {
          return back('walletLinkFailed');
        }
        saveNotloginTokens(st.l, j);
        res.setHeader('Set-Cookie', cookie(req, OIDC_COOKIE, '', { path: '/auth/notlogin', maxAge: 0 }));
        return back('walletConnected');
      }
      const account = login(req, { notloginSub: claims.sub, email: claims.email_verified ? claims.email : null });
      if (!account) return fail(res, 'platform.api.tooManyAccounts');
      startSession(req, res, account, 'notlogin');
      redirect(res, '/app/');
    } catch (e) {
      console.warn('[7ots] notlogin:', e.message);
      fail(res, e.i18n?.key || 'platform.api.notloginFailed');
    }
  }

  /** @returns {Promise<boolean>} */
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/auth/')) return false;
    const t = reqT(req);
    const write = req.method === 'POST';
    // Formularios propios: mismo origen (la cookie es Lax, pero así no hay CSRF de login).
    const origin = req.headers.origin;
    if (write && origin && origin !== base(req) && origin !== originOf(req)) {
      send(res, 403, { error: t('server.admin.sameOrigin') });
      return true;
    }

    if (p === '/auth/providers' && req.method === 'GET') {
      send(res, 200, { email: mailConfigured() || !production(), notlogin: notloginConfigured() });
      return true;
    }

    if (p === '/auth/email' && write) {
      const { email } = await readJson(req, 4096);
      const e = String(email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(e) || e.length > 200) return send(res, 400, { error: t('platform.api.badEmail') }), true;
      if (tooMany(req) || recentLoginTokens(e) >= 5) return send(res, 429, { error: t('platform.api.tooManyLinks') }), true;
      try {
        await sendLink(req, e);
      } catch (err) {
        send(res, err.status || 500, { error: t(err.key || 'server.http.internal') });
        return true;
      }
      send(res, 200, { ok: true });
      return true;
    }

    if (p === '/auth/email' && req.method === 'GET') {
      const token = String(url.searchParams.get('token') || '').replace(/[^A-Za-z0-9_-]/g, '');
      // same-origin (no no-referrer): con no-referrer el navegador envía el formulario con `Origin: null`.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
      res.end(confirmPage(t, token));
      return true;
    }

    if (p === '/auth/email/confirm' && write) {
      const form = await readForm(req);
      const email = consumeLoginToken(form.get('token'));
      if (!email) return fail(res, 'platform.api.linkInvalid'), true;
      const account = login(req, { email });
      if (!account) return fail(res, 'platform.api.tooManyAccounts'), true;
      startSession(req, res, account, 'email');
      redirect(res, '/app/');
      return true;
    }

    if (p === '/auth/notlogin' && req.method === 'GET') return notloginStart(req, res, url), true;
    if (p === '/auth/notlogin/callback' && req.method === 'GET') return await notloginCallback(req, res, url), true;

    if ((p === '/auth/logout' || p === '/auth/logout-all') && write) {
      if (p === '/auth/logout-all') {
        // Same-origin only (the dashboard always sends Origin), so no other site can sign the user out.
        const account = currentAccount(req);
        if (!origin) return send(res, 403, { error: t('server.admin.sameOrigin') }), true;
        if (account) deleteAccountSessions(account.id);
      }
      deleteSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
      res.setHeader('Set-Cookie', cookie(req, SESSION_COOKIE, '', { maxAge: 0 }));
      send(res, 200, { ok: true });
      return true;
    }

    send(res, 404, { error: t('server.http.notFound') });
    return true;
  };
}

async function readForm(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 4096) break;
    chunks.push(c);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function confirmPage(t, token) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>7ots.com</title>
<link rel="icon" type="image/svg+xml" href="/brand/favicon.svg">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 Inter,system-ui,sans-serif;color:#fff;
background:radial-gradient(60% 50% at 20% 10%,rgb(168 85 247/.35),transparent 70%),radial-gradient(50% 40% at 85% 80%,rgb(34 211 238/.22),transparent 70%),#120d33}
main{text-align:center;padding:40px 32px;margin:16px;max-width:380px;border-radius:24px;background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.14);backdrop-filter:blur(12px)}
img{width:56px;height:56px;margin-bottom:8px}p{margin:0 0 22px;color:rgb(255 255 255/.85)}
button{font:800 18px/1 system-ui,sans-serif;background:linear-gradient(180deg,#fef08a,#fde047 45%,#facc15);color:#1e1850;border:0;border-radius:999px;padding:15px 34px;cursor:pointer;box-shadow:0 6px 0 #ca8a04,0 14px 34px rgb(250 204 21/.25)}
button:active{transform:translateY(5px);box-shadow:0 1px 0 #ca8a04}</style></head>
<body><main><img src="/brand/mark.svg" alt="7ots"><p>${esc(t('platform.mail.confirm'))}</p><form method="post" action="/auth/email/confirm"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">${esc(t('platform.mail.button'))}</button></form></main></body></html>`;
}

// ───────────────────────────── id_token de notlogin (EdDSA) ─────────────────────────────

let jwks = null; // { at, keys: Map<kid, KeyObject> }

async function loadJwks(force) {
  if (!force && jwks && Date.now() - jwks.at < 5 * 60_000) return jwks.keys;
  const r = await fetch(`${notloginUrl()}/.well-known/jwks.json`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  const keys = new Map();
  for (const k of (await r.json()).keys || []) {
    try {
      keys.set(k.kid, createPublicKey({ key: k, format: 'jwk' }));
    } catch {
      /* clave rara: se ignora */
    }
  }
  jwks = { at: Date.now(), keys };
  return keys;
}

const part = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

async function verifyIdToken(idToken, nonce) {
  const [h, p, s] = String(idToken).split('.');
  if (!s) throw new Error('id_token mal formado');
  const header = part(h);
  if (header.alg !== 'EdDSA') throw new Error('alg inesperado');
  let keys = await loadJwks(false);
  let key = keys.get(header.kid);
  if (!key) key = (keys = await loadJwks(true)).get(header.kid);
  if (!key) throw new Error('clave de firma desconocida');
  if (!cryptoVerify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) throw new Error('firma inválida');
  const c = part(p);
  const now = Math.floor(Date.now() / 1000);
  if (c.iss !== notloginUrl()) throw new Error('iss');
  if (c.aud !== penv.NOTLOGIN_CLIENT_ID && !(Array.isArray(c.aud) && c.aud.includes(penv.NOTLOGIN_CLIENT_ID))) throw new Error('aud');
  if (c.token_use && c.token_use !== 'id') throw new Error('token_use');
  if (!(c.exp + 60 > now)) throw new Error('caducado');
  if (c.nonce !== nonce) throw new Error('nonce');
  if (typeof c.sub !== 'string' || !c.sub) throw new Error('sin sub');
  return c;
}
