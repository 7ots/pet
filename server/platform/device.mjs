/**
 * Signing a computer in to 7ots.com (`7ots login`, or "Connect" in the pet's settings), so the
 * desktop pet can list the account's ots, switch to another one and bring its settings home.
 *
 * Device flow, like a TV app: the computer asks for a code, opens /app/#device/<code>, the
 * person (signed in to the dashboard) approves it, and the computer picks up a bearer token.
 *
 *   POST /api/device/start   { name }  → { code, url, expiresIn }      (no auth, rate-limited)
 *   POST /api/device/poll    { code }  → 202 pending · 200 { token } once · 410 expired/denied
 *   GET  /api/device/me                → { account, ots: [summary] }  (Authorization: Bearer)
 *   GET  /api/device/ots/:id           → { ots: summary, identity }   (the owner's full identity)
 *   DELETE /api/device/token           → signs this computer out
 *   GET  /api/device/ots/:id/orquesta  → { connected, project, projectName, projects }
 *   POST /api/device/ots/:id/orquesta/tasks { text, projectId? } · GET …/tasks/:tid
 *        The desktop ot uses the account's Orquesta connection through here: the Orquesta token
 *        stays sealed on 7ots.com and never reaches the computer. The device is the owner's (it
 *        was approved from the dashboard), so it may pick any project the connection can reach.
 *   GET  /api/device/ots/:id/inbox     → { apuchat, email, conversations: [{ channel, who, at, messages }] }
 *        what people wrote to the ot on apuchat and email lately, and what it answered (read only;
 *        the channels' keys stay on 7ots.com)
 *   GET  /api/device/ots/:id/byte · GET …/byte/games|status · POST …/byte/play { game } · …/byte/stop   (byte.mjs)
 *   GET  /api/device/ots/:id/wallet    → { linked, wallets: [{ network, address, usdc, native, symbol, explorerUrl }],
 *        payments: [{ amount, asset, to, status, txUrl, … }], manageUrl }  the ot's Notlogin subwallet,
 *        read only: approving a payment still happens on 7ots.com + Notlogin
 *   GET  /api/device/ots/:id/desktop   → { state, rev }  what the desktop pet keeps of this ot (settings,
 *        tamagotchi progress, notes, reminders, watchers), so a new computer gets it too; state null = none yet
 *   PUT  /api/device/ots/:id/desktop   { state, rev } → { rev } · 409 { state, rev } when another computer
 *        wrote since `rev` (the pet merges and tries again). No keys: those never leave the computer.
 *   POST /api/device/ots/:id/tts       { text, voiceId?, lang? } → audio/mpeg: apuchat audio for the desktop pet
 *        with the ot's apuchat token on 7ots.com or the platform's (account's monthly free voice quota)
 *
 * From the dashboard (session cookie, X-7ots-Admin: 1, same origin; see routes.mjs):
 *   GET  /api/platform/device/:code    → { name, expiresIn }  what is asking
 *   POST /api/platform/device/:code    { approve: bool }
 *   GET  /api/platform/devices         DELETE /api/platform/devices/:id
 *
 * Tokens are only stored hashed. Pending codes live in memory (10 min): a restart just means
 * running `7ots login` again.
 */

import { defineIdentity } from '../../src/identity/schema.js';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, getDb } from './db.mjs';
import { newId, sha256, token } from './crypto.mjs';
import { getConversation, getOwnOts, listConversations, listOts, publicAccount } from './store.mjs';
import { listProjects, orquestaAccountView, otsOrquesta, runTask, taskStatus } from './orquesta.mjs';
import { walletView } from './wallet.mjs';
import { createByte } from './byte.mjs';
import { otsSynthesize } from './runtime.mjs';

const CODE_TTL = 10 * 60_000;
const PREFIX = '7d_'; // so a leaked token is recognizable

const pending = new Map(); // code → { name, at, accountId?, token?, denied? }

function sweep() {
  const t = Date.now();
  for (const [c, v] of pending) if (t - v.at > CODE_TTL) pending.delete(c);
}

export function deviceFromBearer(req) {
  const m = /^Bearer\s+(7d_[A-Za-z0-9_-]{20,200})$/.exec(String(req.headers.authorization || ''));
  if (!m) return null;
  const d = getDb();
  const row = d.prepare('SELECT d.id AS device_id, a.* FROM devices d JOIN accounts a ON a.id = d.account_id WHERE d.hash = ?').get(sha256(m[1]));
  if (!row) return null;
  d.prepare('UPDATE devices SET last_used_at = ? WHERE id = ?').run(Date.now(), row.device_id);
  return { deviceId: row.device_id, account: row };
}

export function listDevices(accountId) {
  return getDb().prepare('SELECT id, name, created_at AS createdAt, last_used_at AS lastUsedAt FROM devices WHERE account_id = ? ORDER BY last_used_at DESC').all(accountId);
}

/**
 * @param {{ send: Function, readJson: Function, base: (req) => string, rateLimit: (req) => boolean, summary: (ots) => object }} deps
 */
/** What the pet and 7ots.com keep in sync (the look goes only as look.character). */
const SYNCED = ['name', 'role', 'tagline', 'bio', 'language', 'languages', 'personality'];
const MAX_MODEL = 60 * 1024 * 1024;
const MAX_DESKTOP = 1024 * 1024;

export function createDevice({ send, readJson, base, rateLimit, summary, save }) {
  const byte = createByte({ send, readJson });
  /** Public half (/api/device/*). @returns {Promise<boolean>} */
  async function api(req, res, path) {
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/start' && req.method === 'POST') {
      if (!rateLimit(req)) return send(res, 429, { error: 'rate' }), true;
      const { name } = await readJson(req, 4096);
      sweep();
      if (pending.size > 2000) return send(res, 503, { error: 'busy' }), true;
      const code = token().replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
      pending.set(code, { name: String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'computer', at: Date.now() });
      return send(res, 200, { code, url: `${base(req)}/app/#device/${code}`, expiresIn: CODE_TTL / 1000 }), true;
    }
    if (path === '/poll' && req.method === 'POST') {
      const { code } = await readJson(req, 4096);
      sweep();
      const p = pending.get(String(code || ''));
      if (!p || p.denied) return pending.delete(String(code || '')), send(res, 410, { error: p?.denied ? 'denied' : 'expired' }), true;
      if (!p.token) return send(res, 202, { status: 'pending' }), true;
      pending.delete(code); // handed out once
      return send(res, 200, { token: p.token }), true;
    }
    const who = deviceFromBearer(req);
    if (path === '/me' || path === '/token' || path.startsWith('/ots/')) {
      if (!who) return send(res, 401, { error: 'login' }), true;
      const { account } = who;
      if (path === '/me' && req.method === 'GET') return send(res, 200, { account: publicAccount(account), ots: listOts(account.id).map(summary) }), true;
      if (path === '/token' && req.method === 'DELETE') {
        getDb().prepare('DELETE FROM devices WHERE id = ?').run(who.deviceId);
        return send(res, 200, { ok: true }), true;
      }
      const m = /^\/ots\/([a-z0-9_]{4,40})$/.exec(path);
      if (m && req.method === 'GET') {
        const ots = getOwnOts(account.id, m[1]);
        if (!ots) return send(res, 404, { error: 'not found' }), true;
        return send(res, 200, { ots: summary(ots), identity: defineIdentity(ots.identity), updatedAt: ots.updatedAt }), true;
      }
      // sync with the desktop pet: the same look, personality and character sheet on both sides
      const sm = /^\/ots\/([a-z0-9_]{4,40})\/identity$/.exec(path);
      if (sm && req.method === 'PUT') {
        const ots = getOwnOts(account.id, sm[1]);
        if (!ots) return send(res, 404, { error: 'not found' }), true;
        const inc = (await readJson(req, 512 * 1024))?.identity;
        if (!inc || typeof inc !== 'object') return send(res, 400, { error: 'identity' }), true;
        const patch = Object.fromEntries(SYNCED.filter((k) => k in inc).map((k) => [k, inc[k]]));
        if (inc.look?.character) patch.look = { character: inc.look.character }; // the rest of the look (image, avatar) is the web's
        try {
          const next = await save(ots, { identity: defineIdentity(patch, ots.identity) });
          return send(res, 200, { identity: defineIdentity(next.identity), updatedAt: next.updatedAt }), true;
        } catch (e) {
          return send(res, e.status || 500, { error: e.message }), true;
        }
      }
      // a full-body model (.glb/.vrm) of a mod: content-addressed, served at /mods/<sha16>.<ext> like on the pet
      const fm = /^\/ots\/([a-z0-9_]{4,40})\/files$/.exec(path);
      if (fm && req.method === 'POST') {
        if (!getOwnOts(account.id, fm[1])) return send(res, 404, { error: 'not found' }), true;
        const ext = new URL(req.url, 'http://x').searchParams.get('ext');
        if (!['glb', 'vrm'].includes(ext)) return send(res, 400, { error: 'ext' }), true;
        const chunks = [];
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > MAX_MODEL) return send(res, 413, { error: 'too big' }), true;
          chunks.push(c);
        }
        const buf = Buffer.concat(chunks);
        if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF') return send(res, 400, { error: 'not a glTF binary' }), true;
        const h = createHash('sha256').update(buf).digest('hex').slice(0, 16);
        mkdirSync(join(dataDir(), 'mods'), { recursive: true });
        writeFileSync(join(dataDir(), 'mods', `${h}.${ext}`), buf);
        return send(res, 200, { url: `/mods/${h}.${ext}` }), true;
      }
      // the desktop pet's own state of this ot, the same on every computer (cli/lib/desktop-sync.mjs merges it)
      const dm = /^\/ots\/([a-z0-9_]{4,40})\/desktop$/.exec(path);
      if (dm && (req.method === 'GET' || req.method === 'PUT')) {
        if (!getOwnOts(account.id, dm[1])) return send(res, 404, { error: 'not found' }), true;
        const db = getDb();
        const row = db.prepare('SELECT data, updated_at FROM ots_desktop WHERE ots_id = ?').get(dm[1]);
        const cur = { state: row ? JSON.parse(row.data) : null, rev: row?.updated_at || 0 };
        if (req.method === 'GET') return send(res, 200, cur), true;
        const inc = await readJson(req, MAX_DESKTOP).catch(() => null);
        if (!inc?.state || typeof inc.state !== 'object' || Array.isArray(inc.state)) return send(res, 400, { error: 'state' }), true;
        if (Number(inc.rev) !== cur.rev) return send(res, 409, cur), true;
        const rev = Math.max(Date.now(), cur.rev + 1);
        db.prepare('INSERT INTO ots_desktop (ots_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(ots_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(dm[1], JSON.stringify(inc.state), rev);
        return send(res, 200, { rev }), true;
      }
      // the desktop pet speaking with apuchat audio through its ot on 7ots.com: the ot's own apuchat token there, or the
      // platform's (the account's monthly free voice quota, like the web widget). apuchat does not issue voice tokens per
      // account, so this is how a desktop ot gets that voice without one; the token never reaches the computer.
      const vm = /^\/ots\/([a-z0-9_]{4,40})\/tts$/.exec(path);
      if (vm && req.method === 'POST') {
        const ots = getOwnOts(account.id, vm[1]);
        if (!ots) return send(res, 404, { error: 'not found' }), true;
        if (!rateLimit(req)) return send(res, 429, { error: 'rate' }), true;
        const { text, voiceId, lang } = (await readJson(req, 16 * 1024)) || {};
        const say = String(text || '').trim().slice(0, 600);
        if (!say) return send(res, 400, { error: 'text' }), true;
        const iv = ots.identity.voice || {};
        const voice = { ...iv, provider: 'apuchat', model: '', voiceId: String(voiceId || (iv.provider === 'apuchat' ? iv.voiceId : '') || '').slice(0, 80), ...(lang ? { lang: String(lang).slice(0, 12) } : {}) };
        try {
          const { audio, contentType } = await otsSynthesize(ots, { text: say, voice });
          res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
          return res.end(audio), true;
        } catch (e) {
          return send(res, e.status || 502, { error: e.message }), true;
        }
      }
      const im = /^\/ots\/([a-z0-9_]{4,40})\/inbox$/.exec(path);
      if (im && req.method === 'GET') {
        const ots = getOwnOts(account.id, im[1]);
        if (!ots) return send(res, 404, { error: 'not found' }), true;
        const conversations = listConversations(ots.id, { limit: 60 })
          .filter((c) => c.channel === 'apuchat' || c.channel === 'apumail')
          .slice(0, 10)
          .map((c) => ({ channel: c.channel, who: c.visitor, at: c.updatedAt, messages: (getConversation(ots.id, c.id)?.messages || []).slice(-6).map((m) => ({ role: m.role, text: m.content.slice(0, 1200), at: m.at })) }));
        const s = ots.settings;
        return send(res, 200, { apuchat: s.APUCHAT_AGENT_CALLSIGN || null, email: s.APUMAIL_AGENT_INBOX || null, conversations }), true;
      }
      const bm = /^\/ots\/([a-z0-9_]{4,40})(\/byte(?:\/.*)?)$/.exec(path);
      if (bm) {
        const ots = getOwnOts(account.id, bm[1]);
        if (!ots) return send(res, 404, { error: 'not found' }), true;
        return byte(req, res, ots, bm[2]);
      }
      const wm = /^\/ots\/([a-z0-9_]{4,40})\/wallet$/.exec(path);
      if (wm && req.method === 'GET') {
        const ots = getOwnOts(account.id, wm[1]);
        if (!ots) return send(res, 404, { error: 'not found' }), true;
        const v = await walletView(account, ots);
        return send(res, 200, {
          configured: v.configured, linked: v.linked, scoped: v.scoped, error: v.error,
          wallets: v.wallets.map((w) => ({ network: w.namespace === 'solana' ? 'solana' : w.network, address: w.address, usdc: w.balances?.usdcFormatted ?? null, native: w.balances?.nativeFormatted ?? null, symbol: w.namespace === 'solana' ? 'SOL' : 'ETH', explorerUrl: w.explorerUrl })),
          payments: v.payments.slice(0, 10).map(({ id, network, to, amount, asset, reason, status, txHash, txUrl, createdAt }) => ({ id, network, to, amount, asset, reason, status, txHash, txUrl, createdAt })),
          manageUrl: `${base(req)}/app/#ots/${encodeURIComponent(ots.id)}/wallet`,
        }), true;
      }
      const om = /^\/ots\/([a-z0-9_]{4,40})\/orquesta(\/tasks(?:\/([A-Za-z0-9_-]{4,100}))?)?$/.exec(path);
      if (om) {
        const ots = getOwnOts(account.id, om[1]);
        if (!ots) return send(res, 404, { error: 'not found' }), true;
        return orquesta(req, res, account, ots, !!om[2], om[3]);
      }
    }
    return false;
  }

  /** The ot's Orquesta, used by the desktop ot with the account's connection. */
  async function orquesta(req, res, account, ots, tasks, tid) {
    const view = orquestaAccountView(account.id);
    if (!tasks && req.method === 'GET') {
      const cfg = otsOrquesta(ots);
      let projects = [];
      let error = view.error;
      if (view.connected) projects = await listProjects(account.id).catch((e) => ((error = e.message), []));
      return send(res, 200, { connected: view.connected, error, project: cfg.project, projectName: cfg.projectName, projects }), true;
    }
    if (!view.connected) return send(res, 409, { error: 'Orquesta is not connected on 7ots.com' }), true;
    if (tasks && !tid && req.method === 'POST') {
      const { text, projectId } = await readJson(req, 64 * 1024);
      let project = otsOrquesta(ots).project;
      if (projectId) {
        const p = (await listProjects(account.id)).find((x) => x.id === String(projectId));
        if (!p) return send(res, 404, { error: 'that project is not shared with 7ots' }), true;
        project = p.id;
      }
      if (!project) return send(res, 400, { error: 'pick a project' }), true;
      // the owner, from their own computer: tasks on for this one, the chosen project
      const out = await runTask({ ...ots, settings: { ...ots.settings, ORQUESTA_TASKS: '1', ORQUESTA_PROJECT: project } }, { task: text, who: `owner ${account.email || account.id}`, channel: 'desktop' });
      return send(res, out.ok === false && !out.id ? 400 : 200, out), true;
    }
    if (tid && req.method === 'GET') return send(res, 200, await taskStatus(ots, tid)), true;
    return send(res, 405, { error: 'method' }), true;
  }

  /** Dashboard half, already behind the session + same-origin checks. @returns {boolean} */
  async function dashboard(req, res, account, path) {
    const m = /^\/device\/([A-Za-z0-9]{8,40})$/.exec(path);
    if (m) {
      sweep();
      const p = pending.get(m[1]);
      if (!p || p.token || p.denied) return send(res, 410, { error: 'expired' }), true;
      if (req.method === 'GET') return send(res, 200, { name: p.name, expiresIn: Math.max(0, Math.round((CODE_TTL - (Date.now() - p.at)) / 1000)) }), true;
      if (req.method === 'POST') {
        const { approve } = await readJson(req, 4096);
        if (approve !== true) return (p.denied = true), send(res, 200, { ok: true }), true;
        const raw = PREFIX + token();
        const t = Date.now();
        getDb().prepare('INSERT INTO devices (id, hash, account_id, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').run(newId('dev'), sha256(raw), account.id, p.name, t, t);
        p.token = raw;
        p.accountId = account.id;
        return send(res, 200, { ok: true }), true;
      }
    }
    if (path === '/devices' && req.method === 'GET') return send(res, 200, { devices: listDevices(account.id) }), true;
    const d = /^\/devices\/([\w-]{4,60})$/.exec(path);
    if (d && req.method === 'DELETE') {
      getDb().prepare('DELETE FROM devices WHERE id = ? AND account_id = ?').run(d[1], account.id);
      return send(res, 200, { ok: true }), true;
    }
    return false;
  }

  return { api, dashboard };
}
