/**
 * Community mods: looks that people share for any ot (src/character/mods.js), with installs,
 * 1–5 star ratings (one per account, only after installing) and reports.
 *
 * New mods wait for an admin (PLATFORM_ADMINS: emails, comma separated) unless an admin uploads
 * them. A mod reported by MOD_REPORTS_HIDE accounts (default 3) is hidden until reviewed.
 *
 * Public (any origin):
 *   GET  /api/mods[?sort=top|new|popular&q=…]   → { mods: [view] }   approved only
 *   GET  /api/mods/:id                          → { mod: view }
 * Signed in, from the dashboard (/api/platform/mods/*, session) or the pet (/api/device/mods/*, bearer):
 *   GET    /mods/mine            → { mods: [view], admin, pending: [view] (admins) }
 *   POST   /mods                 { mod }  → publish or update one of yours (by its id)
 *   POST   /mods/files?ext=glb|vrm  raw body (≤ 20 MB) → { url: '/mods/<sha16>.<ext>' }
 *   POST   /mods/:id/install     → { mod: view }   (counts once per account)
 *   POST   /mods/:id/rate        { stars: 1..5 }
 *   POST   /mods/:id/report      { reason }
 *   POST   /mods/:id/review      { status: approved|rejected|hidden }   (admins)
 *   DELETE /mods/:id             (its author or an admin)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeMod } from '../../src/character/mods.js';
import { dataDir, getDb } from './db.mjs';

const MAX_FILE = 20 * 1024 * 1024;
const MAX_MOD_JSON = 2 * 1024 * 1024;
const STATUSES = ['pending', 'approved', 'rejected', 'hidden'];
const MODEL = /^\/mods\/([a-f0-9]{16})\.(glb|vrm)$/;

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec(`
CREATE TABLE IF NOT EXISTS community_mods (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT '',
  mod TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  installs INTEGER NOT NULL DEFAULT 0,
  stars_sum INTEGER NOT NULL DEFAULT 0,
  stars_n INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_mods_status ON community_mods(status, created_at DESC);
CREATE TABLE IF NOT EXISTS mod_installs (mod_id TEXT NOT NULL REFERENCES community_mods(id) ON DELETE CASCADE, account_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (mod_id, account_id));
CREATE TABLE IF NOT EXISTS mod_ratings (mod_id TEXT NOT NULL REFERENCES community_mods(id) ON DELETE CASCADE, account_id TEXT NOT NULL, stars INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (mod_id, account_id));
CREATE TABLE IF NOT EXISTS mod_reports (mod_id TEXT NOT NULL REFERENCES community_mods(id) ON DELETE CASCADE, account_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, PRIMARY KEY (mod_id, account_id));
`);
    ready = true;
  }
  return d;
}

export const isModAdmin = (account) =>
  !!account?.email && String(process.env.PLATFORM_ADMINS || '').toLowerCase().split(/[\s,]+/).filter(Boolean).includes(account.email.toLowerCase());

const authorOf = (a) => String(a.name || (a.email || '').split('@')[0] || 'anon').slice(0, 40);

function view(row, me) {
  if (!row) return null;
  const v = {
    id: row.id,
    mod: JSON.parse(row.mod),
    author: row.author,
    status: row.status,
    installs: row.installs,
    rating: row.stars_n ? Math.round((row.stars_sum / row.stars_n) * 10) / 10 : null,
    ratings: row.stars_n,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (me) {
    const d = db();
    v.mine = row.account_id === me.id;
    v.installed = !!d.prepare('SELECT 1 FROM mod_installs WHERE mod_id = ? AND account_id = ?').get(row.id, me.id);
    v.myStars = d.prepare('SELECT stars FROM mod_ratings WHERE mod_id = ? AND account_id = ?').get(row.id, me.id)?.stars || null;
    v.reported = !!d.prepare('SELECT 1 FROM mod_reports WHERE mod_id = ? AND account_id = ?').get(row.id, me.id);
  }
  return v;
}

const ORDER = {
  // Bayesian average: a single 5★ does not beat many 4.5★
  top: '(stars_sum + 3.0 * 2) / (stars_n + 2) DESC, installs DESC, created_at DESC',
  new: 'created_at DESC',
  popular: 'installs DESC, stars_n DESC, created_at DESC',
};

export function listMods({ sort = 'top', q = '', limit = 60 } = {}) {
  const like = `%${String(q).toLowerCase().replace(/[%_]/g, '').slice(0, 40)}%`;
  return db()
    .prepare(`SELECT * FROM community_mods WHERE status = 'approved' AND (lower(id) LIKE ? OR lower(mod) LIKE ? OR lower(author) LIKE ?) ORDER BY ${ORDER[sort] || ORDER.top} LIMIT ?`)
    .all(like, like, like, Math.min(100, Math.max(1, Number(limit) || 60)));
}

/** A model a mod points at must already be on 7ots.com (uploaded first through /mods/files). */
function modelsMissing(mod) {
  const urls = [mod.model?.url].filter((u) => MODEL.test(u || ''));
  return urls.filter((u) => !existsSync(join(dataDir(), 'mods', u.slice('/mods/'.length))));
}

export function createMods({ send, readJson }) {
  /** Public half. @returns {Promise<boolean>} */
  async function publicApi(req, res, path) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return send(res, 204), true;
    if (req.method !== 'GET') return false;
    if (path === '' || path === '/') {
      const u = new URL(req.url, 'http://x');
      return send(res, 200, { mods: listMods({ sort: u.searchParams.get('sort'), q: u.searchParams.get('q') || '', limit: u.searchParams.get('limit') }).map((r) => view(r)) }), true;
    }
    const m = /^\/([a-z0-9-]{1,32})$/.exec(path);
    if (m) {
      const row = db().prepare("SELECT * FROM community_mods WHERE id = ? AND status = 'approved'").get(m[1]);
      return row ? send(res, 200, { mod: view(row) }) : send(res, 404, { error: 'not found' }), true;
    }
    return false;
  }

  /** Signed-in half (account from the session or a device). path is after /mods. @returns {Promise<boolean>} */
  async function accountApi(req, res, account, path) {
    const d = db();
    const admin = isModAdmin(account);
    const now = Date.now();
    if (path === '' && req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      return send(res, 200, { mods: listMods({ sort: u.searchParams.get('sort'), q: u.searchParams.get('q') || '' }).map((r) => view(r, account)) }), true;
    }
    if (path === '/mine' && req.method === 'GET') {
      const mine = d.prepare('SELECT * FROM community_mods WHERE account_id = ? ORDER BY updated_at DESC').all(account.id).map((r) => view(r, account));
      const pending = admin ? d.prepare("SELECT * FROM community_mods WHERE status IN ('pending', 'hidden') ORDER BY reports DESC, created_at").all().map((r) => ({ ...view(r, account), reports: r.reports })) : [];
      return send(res, 200, { mods: mine, admin, pending }), true;
    }
    if (path === '/files' && req.method === 'POST') {
      const ext = new URL(req.url, 'http://x').searchParams.get('ext');
      if (!['glb', 'vrm'].includes(ext)) return send(res, 400, { error: 'ext' }), true;
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > MAX_FILE) return send(res, 413, { error: 'max 20 MB' }), true;
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF') return send(res, 400, { error: 'not a glTF binary (.glb/.vrm)' }), true;
      const h = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      mkdirSync(join(dataDir(), 'mods'), { recursive: true });
      writeFileSync(join(dataDir(), 'mods', `${h}.${ext}`), buf);
      return send(res, 200, { url: `/mods/${h}.${ext}` }), true;
    }
    if (path === '' && req.method === 'POST') {
      const body = await readJson(req, MAX_MOD_JSON + 4096);
      const mod = normalizeMod(body?.mod);
      if (!mod) return send(res, 400, { error: 'mod' }), true;
      if (!mod.model && !mod.parts.length && !Object.keys(mod.character).length) return send(res, 400, { error: 'empty mod' }), true;
      const missing = modelsMissing(mod);
      if (missing.length) return send(res, 409, { error: 'upload the model first', missing }), true;
      const prev = d.prepare('SELECT account_id FROM community_mods WHERE id = ?').get(mod.id);
      if (prev && prev.account_id !== account.id) return send(res, 409, { error: 'id taken' }), true;
      const json = JSON.stringify({ ...mod, by: mod.by || authorOf(account) });
      if (prev) d.prepare("UPDATE community_mods SET mod = ?, status = ?, updated_at = ? WHERE id = ?").run(json, admin ? 'approved' : 'pending', now, mod.id);
      else d.prepare('INSERT INTO community_mods (id, account_id, author, mod, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(mod.id, account.id, authorOf(account), json, admin ? 'approved' : 'pending', now, now);
      return send(res, prev ? 200 : 201, { mod: view(d.prepare('SELECT * FROM community_mods WHERE id = ?').get(mod.id), account) }), true;
    }
    const m = /^\/([a-z0-9-]{1,32})(\/(install|rate|report|review))?$/.exec(path);
    if (!m) return false;
    const row = d.prepare('SELECT * FROM community_mods WHERE id = ?').get(m[1]);
    // authors and admins see their mod whatever its status; everyone else only approved ones
    if (!row || (row.status !== 'approved' && row.account_id !== account.id && !admin)) return send(res, 404, { error: 'not found' }), true;
    const action = m[3];
    if (!action && req.method === 'GET') return send(res, 200, { mod: view(row, account) }), true;
    if (!action && req.method === 'DELETE') {
      if (row.account_id !== account.id && !admin) return send(res, 403, { error: 'not yours' }), true;
      d.prepare('DELETE FROM community_mods WHERE id = ?').run(row.id);
      return send(res, 200, { ok: true }), true;
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' }), true;
    if (action === 'install') {
      const r = d.prepare('INSERT OR IGNORE INTO mod_installs (mod_id, account_id, at) VALUES (?, ?, ?)').run(row.id, account.id, now);
      if (r.changes) d.prepare('UPDATE community_mods SET installs = installs + 1 WHERE id = ?').run(row.id);
      return send(res, 200, { mod: view(d.prepare('SELECT * FROM community_mods WHERE id = ?').get(row.id), account) }), true;
    }
    if (action === 'rate') {
      const stars = Math.round(Number((await readJson(req, 1024))?.stars));
      if (!(stars >= 1 && stars <= 5)) return send(res, 400, { error: 'stars 1-5' }), true;
      if (row.account_id === account.id) return send(res, 403, { error: 'own mod' }), true;
      if (!d.prepare('SELECT 1 FROM mod_installs WHERE mod_id = ? AND account_id = ?').get(row.id, account.id)) return send(res, 403, { error: 'install it first' }), true;
      const old = d.prepare('SELECT stars FROM mod_ratings WHERE mod_id = ? AND account_id = ?').get(row.id, account.id);
      d.prepare('INSERT INTO mod_ratings (mod_id, account_id, stars, at) VALUES (?, ?, ?, ?) ON CONFLICT(mod_id, account_id) DO UPDATE SET stars = excluded.stars, at = excluded.at').run(row.id, account.id, stars, now);
      d.prepare('UPDATE community_mods SET stars_sum = stars_sum + ?, stars_n = stars_n + ? WHERE id = ?').run(stars - (old?.stars || 0), old ? 0 : 1, row.id);
      return send(res, 200, { mod: view(d.prepare('SELECT * FROM community_mods WHERE id = ?').get(row.id), account) }), true;
    }
    if (action === 'report') {
      const reason = String((await readJson(req, 4096))?.reason || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
      const r = d.prepare('INSERT OR IGNORE INTO mod_reports (mod_id, account_id, reason, at) VALUES (?, ?, ?, ?)').run(row.id, account.id, reason, now);
      if (r.changes) {
        d.prepare('UPDATE community_mods SET reports = reports + 1 WHERE id = ?').run(row.id);
        const hide = Number(process.env.MOD_REPORTS_HIDE || 3);
        d.prepare("UPDATE community_mods SET status = 'hidden' WHERE id = ? AND status = 'approved' AND reports >= ?").run(row.id, hide);
      }
      return send(res, 200, { ok: true }), true;
    }
    if (action === 'review') {
      if (!admin) return send(res, 403, { error: 'admins only' }), true;
      const status = (await readJson(req, 1024))?.status;
      if (!STATUSES.includes(status)) return send(res, 400, { error: 'status' }), true;
      d.prepare('UPDATE community_mods SET status = ?, reports = CASE WHEN ? = \'approved\' THEN 0 ELSE reports END, updated_at = ? WHERE id = ?').run(status, status, now, row.id);
      if (status === 'approved') d.prepare('DELETE FROM mod_reports WHERE mod_id = ?').run(row.id);
      return send(res, 200, { mod: view(d.prepare('SELECT * FROM community_mods WHERE id = ?').get(row.id), account) }), true;
    }
    return false;
  }

  return { publicApi, accountApi };
}
