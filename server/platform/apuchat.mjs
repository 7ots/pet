/**
 * apuchat for the platform: an apuchat identity (@callsign) for each ot, made from the dashboard.
 *
 * Every 7ots account can hold two apuchat accounts (sealed in `integrations`, kind 'apuchat'):
 *   managed  an anonymous apuchat account the platform creates on first use (no sign-up): it owns the
 *            identities made for the user's ots. Its session lasts 90 days; when it is refused, the
 *            recovery token gets a new one (and if even that fails, a new anonymous account is made).
 *   linked   the user's own apuchat account, connected with apuchat's /link flow (app "7ots"): new
 *            identities go there and the ot's identity can be claimed into it.
 *
 * Hub contract (APUCHAT_HUB, read once at boot; server to server only):
 *   POST /api/account                        → { account_id, recovery_token, session_token }
 *   POST /api/account/recover {recovery_token} → { session_token }
 *   POST /api/account/identities              Bearer session|apt_ → { callsign, identity_key, free_identity, … }
 *   DELETE /api/account/identities/:callsign
 *   GET  /api/identities/mint/quote?callsign= Bearer → { valid, taken, reason, tier, tier_label, price_usd, … }
 *   POST /api/identities/mint/checkout { callsign, return_url } → { checkout_id, url, price_usd, tier }
 *   GET  /api/identities/mint/checkout/:id    → { status, callsign, upgraded, identity_key? }
 *   POST /api/v1/link/exchange { code, app }  → { account_id, identities, app_token (apt_, shown once), scopes, notice }
 *   POST /api/account/identities/claim { identity_key }  Bearer apt_ → { ok, callsign, moved, paid }
 *                                             (409 *_not_transferable when it is paid/verified elsewhere)
 * apt_ errors: 401 invalid_app_token (the link is forgotten) · 403 insufficient_scope. Paying needs
 * Stripe on apuchat: 503 not_configured until then (we point to minting with USDC on apuchat instead).
 * return_url must be on 7ots.com (or localhost:8787 in development); apuchat appends ?apuchat_checkout=<id>&status=….
 *   GET  /api/dm/wait?timeout=1               X-Identity-Key → { callsign, … }  (checks a pasted key)
 *
 * Free identities expire after 24 h without DM activity; the ot's channel long-polls /api/dm/wait,
 * which counts as activity, so they live while the ot is on.
 */

import { i18nError } from '../i18n.mjs';
import { getIntegration, setIntegration } from './store.mjs';

const penv = process.env;
const HUB = (penv.APUCHAT_HUB || 'https://apuchat.com').replace(/\/+$/, '');
const SESSION_REFRESH_MS = 80 * 24 * 3600_000; // sessions last 90 days: renew a bit before
export const CALLSIGN_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const IDENTITIES_PER_DAY = () => Number(penv.PLATFORM_APUCHAT_IDENTITIES_PER_DAY || 5);

export const apuchatHub = () => HUB;

async function hub(method, path, { bearer, identityKey, body, timeoutMs = 15000 } = {}) {
  let res;
  try {
    res = await fetch(HUB + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(identityKey ? { 'X-Identity-Key': identityKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw i18nError(424, 'platform.apuchat.unreachable');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data: data || {} };
}

/** Upstream error → our error (the hub's own text is never shown; its code helps a few cases). */
function hubError(r) {
  const code = String(r.data.code || r.data.error || '');
  if (r.status === 503 && /not_configured/.test(code)) return i18nError(501, 'platform.apuchat.paymentsOff', { url: `${HUB}/account/mint` });
  if (r.status === 429) return i18nError(429, 'platform.apuchat.hubBusy');
  if (r.status === 403 && /insufficient_scope/.test(code)) return i18nError(403, 'platform.apuchat.insufficientScope');
  if (r.status === 409 && /not_transferable/.test(code)) return i18nError(409, 'platform.apuchat.notTransferable');
  if (r.status === 409) return i18nError(409, 'platform.apuchat.taken');
  return i18nError(424, 'platform.apuchat.failed', { status: r.status });
}

// ───────────────────────────── account state ─────────────────────────────

const state = (accountId) => getIntegration(accountId, 'apuchat') || {};
const saveState = (accountId, s) => setIntegration(accountId, 'apuchat', s.managed || s.linked || s.checkouts?.length ? s : null);
const locks = new Map(); // accountId → Promise (one session refresh / account creation at a time)

function locked(accountId, fn) {
  const prev = locks.get(accountId) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(accountId, tail);
  tail.then(() => locks.get(accountId) === tail && locks.delete(accountId));
  return run;
}

/** Public view for the dashboard (never tokens). */
export function apuchatAccountView(accountId) {
  const s = state(accountId);
  return { managed: !!s.managed, linked: s.linked ? { accountId: s.linked.account_id || '', canClaim: can(s.linked, 'identities:write') } : null };
}

/** Whether the app token of the link was granted a scope (older links without a scope list: assume yes). */
const can = (linked, scope) => !!linked?.app_token && (!Array.isArray(linked.scopes) || linked.scopes.includes(scope));

async function createManaged(accountId) {
  const r = await hub('POST', '/api/account', { body: {} });
  if (!r.ok || !r.data.session_token || !r.data.recovery_token) throw hubError(r);
  const s = state(accountId);
  s.managed = { account_id: r.data.account_id, recovery_token: r.data.recovery_token, session_token: r.data.session_token, at: Date.now() };
  saveState(accountId, s);
  return s.managed.session_token;
}

/** Gets a fresh session with the recovery token; if apuchat no longer knows it, starts a new anonymous account. */
async function recoverManaged(accountId) {
  const s = state(accountId);
  if (!s.managed?.recovery_token) return createManaged(accountId);
  const r = await hub('POST', '/api/account/recover', { body: { recovery_token: s.managed.recovery_token } });
  if (r.ok && r.data.session_token) {
    s.managed = { ...s.managed, session_token: r.data.session_token, at: Date.now() };
    saveState(accountId, s);
    return s.managed.session_token;
  }
  if (r.status === 401 || r.status === 403 || r.status === 404) {
    console.warn('[7ots] apuchat: recovery refused, new anonymous account for', accountId);
    return createManaged(accountId);
  }
  throw hubError(r);
}

/** Session of the managed account (made on first use, renewed when old). */
function managedSession(accountId, { create = true } = {}) {
  return locked(accountId, async () => {
    const m = state(accountId).managed;
    if (!m) {
      if (!create) return null;
      return createManaged(accountId);
    }
    if (Date.now() - (m.at || 0) > SESSION_REFRESH_MS) return recoverManaged(accountId);
    return m.session_token;
  });
}

/**
 * A call as one of the account's apuchat accounts. 'managed' renews its session once on 401;
 * 'linked' uses the app token (a 401 means the user revoked it: the link is forgotten).
 */
async function as(accountId, owner, method, path, o = {}) {
  if (owner === 'linked') {
    const l = state(accountId).linked;
    if (!l?.app_token) throw i18nError(409, 'platform.apuchat.notLinked');
    const r = await hub(method, path, { ...o, bearer: l.app_token });
    if (r.status === 401) {
      const s = state(accountId);
      delete s.linked;
      saveState(accountId, s);
      throw i18nError(409, 'platform.apuchat.linkExpired');
    }
    return r;
  }
  let token = await managedSession(accountId);
  let r = await hub(method, path, { ...o, bearer: token });
  if (r.status === 401) {
    token = await locked(accountId, () => recoverManaged(accountId));
    r = await hub(method, path, { ...o, bearer: token });
  }
  return r;
}

/** Which apuchat account new identities go to: the user's own when linked with a token, else the managed one. */
export const defaultOwner = (accountId, scope = 'identities:write') => (can(state(accountId).linked, scope) ? 'linked' : 'managed');

// ───────────────────────────── identities ─────────────────────────────

const madeToday = new Map(); // accountId → timestamps (free identities made in the last day)

/** A new free identity. Limited per account and day (each one is a handle taken on apuchat). */
export async function createFreeIdentity(accountId) {
  const now = Date.now();
  const recent = (madeToday.get(accountId) || []).filter((t) => now - t < 86400_000);
  if (recent.length >= IDENTITIES_PER_DAY()) throw i18nError(429, 'platform.apuchat.tooManyIdentities', { max: IDENTITIES_PER_DAY() });
  const owner = defaultOwner(accountId);
  const r = await as(accountId, owner, 'POST', '/api/account/identities', { body: {} });
  if (!r.ok || !r.data.identity_key || !r.data.callsign) throw hubError(r);
  recent.push(now);
  madeToday.set(accountId, recent);
  if (madeToday.size > 5000) madeToday.clear();
  return { callsign: String(r.data.callsign).toLowerCase(), identityKey: r.data.identity_key, free: r.data.free_identity !== false, owner };
}

/** Deletes an identity on apuchat (only the free ones the platform made; best effort). */
export async function deleteIdentity(accountId, owner, callsign) {
  if (!CALLSIGN_RE.test(callsign || '') || (owner !== 'managed' && owner !== 'linked')) return false;
  const r = await as(accountId, owner, 'DELETE', `/api/account/identities/${encodeURIComponent(callsign)}`).catch(() => null);
  return !!r?.ok;
}

/** The @callsign of an identity key, or null if apuchat does not accept it. */
export async function callsignOf(identityKey) {
  const r = await hub('GET', '/api/dm/wait?timeout=1', { identityKey, timeoutMs: 20000 });
  if (r.status === 401 || r.status === 403 || r.status === 404) return null;
  if (!r.ok) throw hubError(r);
  return r.data.callsign ? String(r.data.callsign).toLowerCase() : null;
}

// ───────────────────────────── permanent handle (paid) ─────────────────────────────

export async function quote(accountId, owner, callsign) {
  const r = await as(accountId, owner, 'GET', `/api/identities/mint/quote?callsign=${encodeURIComponent(callsign)}`);
  if (!r.ok) throw hubError(r);
  const q = r.data;
  return { callsign, valid: !!q.valid, taken: !!q.taken, reason: q.reason || null, tier: q.tier || null, tierLabel: q.tier_label || null, priceUsd: q.price_usd ?? null };
}

/** Starts a card checkout; the checkout is remembered so only this ot can read its result. */
export async function checkout(accountId, owner, { otsId, callsign, returnUrl }) {
  const r = await as(accountId, owner, 'POST', '/api/identities/mint/checkout', { body: { callsign, return_url: returnUrl } });
  if (!r.ok || !r.data.checkout_id || !r.data.url) throw hubError(r);
  const s = state(accountId);
  s.checkouts = [{ id: String(r.data.checkout_id), otsId, callsign, owner, at: Date.now() }, ...(s.checkouts || []).filter((c) => Date.now() - c.at < 7 * 86400_000)].slice(0, 20);
  saveState(accountId, s);
  return { checkoutId: String(r.data.checkout_id), url: String(r.data.url), priceUsd: r.data.price_usd ?? null, tier: r.data.tier || null };
}

export const pendingCheckouts = (accountId, otsId) => (state(accountId).checkouts || []).filter((c) => c.otsId === otsId).map(({ id, callsign, at }) => ({ id, callsign, at }));

/** Status of a checkout started for this ot (null if it isn't one of its own). Fulfilled/failed ones are forgotten. */
export async function checkoutStatus(accountId, otsId, id) {
  const c = (state(accountId).checkouts || []).find((x) => x.id === String(id) && x.otsId === otsId);
  if (!c) return null;
  const r = await as(accountId, c.owner, 'GET', `/api/identities/mint/checkout/${encodeURIComponent(c.id)}`);
  if (!r.ok) throw hubError(r);
  const status = ['pending', 'fulfilled', 'failed'].includes(r.data.status) ? r.data.status : 'pending';
  if (status !== 'pending') {
    const s = state(accountId);
    s.checkouts = (s.checkouts || []).filter((x) => x.id !== c.id);
    saveState(accountId, s);
  }
  return { status, callsign: String(r.data.callsign || c.callsign).toLowerCase(), upgraded: !!r.data.upgraded, identityKey: r.data.identity_key || null, owner: c.owner };
}

// ───────────────────────────── linking the user's apuchat account ─────────────────────────────

/** Where to send the browser to link (apuchat appends `code`; it doesn't echo `state`, so it rides in the return URL). */
export const linkUrl = (returnUrl) => `${HUB}/link?${new URLSearchParams({ app: '7ots', return: returnUrl })}`;

export async function exchangeLink(accountId, code) {
  const r = await hub('POST', '/api/v1/link/exchange', { body: { code, app: '7ots' } });
  if (!r.ok || !r.data.account_id) throw hubError(r);
  const s = state(accountId);
  const scopes = Array.isArray(r.data.scopes) ? r.data.scopes.map(String) : typeof r.data.scopes === 'string' ? r.data.scopes.split(/[\s,]+/).filter(Boolean) : null;
  // The app token is shown once: it lives only sealed in the database and is never logged.
  s.linked = { account_id: String(r.data.account_id), app_token: r.data.app_token || '', scopes, at: Date.now() };
  saveState(accountId, s);
  return { accountId: s.linked.account_id, canClaim: can(s.linked, 'identities:write') };
}

export function unlink(accountId) {
  const s = state(accountId);
  delete s.linked;
  saveState(accountId, s);
}

/** Moves an identity (by its key) into the linked account. */
export async function claimIdentity(accountId, identityKey) {
  const r = await as(accountId, 'linked', 'POST', '/api/account/identities/claim', { body: { identity_key: identityKey } });
  if (!r.ok) throw hubError(r);
  return { callsign: r.data.callsign ? String(r.data.callsign).toLowerCase() : null, moved: r.data.moved !== false, paid: !!r.data.paid };
}
