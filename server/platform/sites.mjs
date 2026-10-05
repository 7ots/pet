/**
 * Sites, APIs and MCP servers an account enrolls so ots know how to use them.
 *
 * The directory is Prowl.world: 7ots registers the entry there (source '7ots') as one Prowl
 * vendor, starts the domain claim and hands the owner Prowl's three proofs (DNS TXT,
 * /.well-known/prowl-verify.txt or a <meta>). Once verified, Prowl serves the owner's usage
 * guide at GET /v1/context/{domain}, which is what desktop ots read.
 *
 * From the dashboard (session cookie, X-7ots-Admin: 1, same origin; see routes.mjs):
 *   GET    /api/platform/sites                → { sites, enabled }
 *   POST   /api/platform/sites                { kind, url, name, guide } → { site }
 *   POST   /api/platform/sites/:id/verify     → { site }  (422 while the proof isn't there)
 *   DELETE /api/platform/sites/:id
 *
 * Env: PROWL_API (default https://prowl.world), PROWL_EMAIL + PROWL_PASSWORD (the 7ots vendor).
 */

import { getDb } from './db.mjs';
import { newId } from './crypto.mjs';

const KINDS = ['site', 'api', 'mcp'];
const base = () => (process.env.PROWL_API || 'https://prowl.world').replace(/\/+$/, '');
export const sitesEnabled = () => !!(process.env.PROWL_EMAIL && process.env.PROWL_PASSWORD);

let access = null;
async function prowl(path, { method = 'GET', body, retry = true } = {}) {
  if (!access) {
    const r = await fetch(`${base()}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.PROWL_EMAIL, password: process.env.PROWL_PASSWORD }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw Object.assign(new Error(`prowl login ${r.status}`), { status: 502 });
    access = (await r.json()).access_token;
  }
  const r = await fetch(`${base()}${path}`, {
    method,
    headers: { authorization: `Bearer ${access}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 401 && retry) {
    access = null;
    return prowl(path, { method, body, retry: false });
  }
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

const row = (r) =>
  r && {
    id: r.id,
    kind: r.kind,
    url: r.url,
    domain: r.domain,
    name: r.name,
    guide: r.guide,
    status: r.status,
    proof: JSON.parse(r.proof || 'null'),
    createdAt: r.created_at,
    verifiedAt: r.verified_at,
  };

export function listSites(accountId) {
  return getDb().prepare('SELECT * FROM sites WHERE account_id = ? ORDER BY created_at DESC').all(accountId).map(row);
}

function cleanUrl(raw) {
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
  return u;
}

export function createSites({ send, readJson }) {
  const fail = (res, e) => send(res, e.status || 502, { error: e.message || 'Prowl error' });

  return async function sites(req, res, account, path) {
    if (!path.startsWith('/sites')) return false;
    const d = getDb();
    if (path === '/sites' && req.method === 'GET') return send(res, 200, { sites: listSites(account.id), enabled: sitesEnabled() }), true;
    if (!sitesEnabled()) return send(res, 503, { error: 'Site enrollment is not configured on this server (PROWL_EMAIL/PROWL_PASSWORD).' }), true;

    if (path === '/sites' && req.method === 'POST') {
      const { kind, url, name, guide } = await readJson(req, 32 * 1024);
      const u = cleanUrl(String(url || '').trim());
      if (!u) return send(res, 400, { error: 'Invalid URL' }), true;
      const k = KINDS.includes(kind) ? kind : 'site';
      const domain = u.hostname.replace(/^www\./, '').toLowerCase();
      if (d.prepare('SELECT 1 FROM sites WHERE account_id = ? AND domain = ?').get(account.id, domain)) return send(res, 409, { error: `${domain} is already registered` }), true;
      const title = String(name || '').trim().slice(0, 120) || domain;
      const text = String(guide || '').trim().slice(0, 8000);
      try {
        const reg = await prowl('/v1/register', {
          method: 'POST',
          body: {
            name: title,
            website_url: `https://${domain}`,
            category: [k === 'mcp' ? 'mcp' : k === 'api' ? 'api' : 'website'],
            kind: k,
            usage_guide: text || undefined,
            source: '7ots',
            ...(k === 'mcp' ? { mcp_manifest_url: u.href } : k === 'api' && u.pathname !== '/' ? { api_docs_url: u.href } : {}),
          },
        });
        const serviceId = reg.status === 201 ? reg.data.id : reg.status === 409 ? reg.data.detail?.service_id : null;
        if (!serviceId) throw Object.assign(new Error(reg.data.detail?.message || reg.data.detail || `Prowl register ${reg.status}`), { status: 502 });
        const claim = await prowl('/v1/claim', { method: 'POST', body: { service_id: serviceId } });
        if (claim.status !== 200) throw Object.assign(new Error(claim.data.detail || `Prowl claim ${claim.status}`), { status: claim.status === 409 ? 409 : 502 });
        const c = claim.data;
        const proof = { dnsRecord: c.dns_record, dnsValue: c.dns_value, wellKnownUrl: c.well_known_url, wellKnownContent: c.well_known_content, metaTag: c.meta_tag };
        const id = newId('site');
        d.prepare('INSERT INTO sites (id, account_id, kind, url, domain, name, guide, service_id, status, proof, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, account.id, k, u.href, domain, title, text, serviceId, 'pending', JSON.stringify(proof), Date.now());
        return send(res, 201, { site: row(d.prepare('SELECT * FROM sites WHERE id = ?').get(id)) }), true;
      } catch (e) {
        return fail(res, e), true;
      }
    }

    const m = path.match(/^\/sites\/(site_[A-Za-z0-9_-]{6,60})(\/verify)?$/);
    const s = m && d.prepare('SELECT * FROM sites WHERE id = ? AND account_id = ?').get(m[1], account.id);
    if (!s) return send(res, 404, { error: 'Not found' }), true;
    if (m[2] && req.method === 'POST') {
      try {
        const v = await prowl('/v1/claim/verify', { method: 'POST', body: { service_id: s.service_id } });
        if (v.status === 422) return send(res, 422, { error: 'proof_missing', site: row(s) }), true;
        if (v.status !== 200) throw Object.assign(new Error(v.data.detail || `Prowl verify ${v.status}`), { status: 502 });
        d.prepare("UPDATE sites SET status = 'verified', verified_at = ? WHERE id = ?").run(Date.now(), s.id);
        return send(res, 200, { site: row(d.prepare('SELECT * FROM sites WHERE id = ?').get(s.id)) }), true;
      } catch (e) {
        return fail(res, e), true;
      }
    }
    if (!m[2] && req.method === 'DELETE') {
      d.prepare('DELETE FROM sites WHERE id = ?').run(s.id);
      return send(res, 200, { ok: true }), true;
    }
    return send(res, 405, { error: 'Method not allowed' }), true;
  };
}
