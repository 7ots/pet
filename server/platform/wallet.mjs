/**
 * The ot's wallet: a managed subwallet in the owner's Notlogin account (agentId = the ot's id).
 *
 * Money never moves without the owner. The ot can only PROPOSE a payment (tool `request_payment`, owner
 * chat only); the owner approves it in the dashboard's Wallet tab, which turns it into a Notlogin
 * `withdraw` intent that they confirm on notlogin.com with a fresh sign-in. 7ots holds no keys.
 *
 *   NOTLOGIN_SERVICE_TOKEN   provisions/reads the agent wallets (GET /api/x402/wallet?userId&agentId)
 *   account integration 'notlogin' { access, refresh, exp }   scopes wallet:read intents:create, from
 *                            "Connect Notlogin" (/auth/notlogin?link=<otsId>, auth.mjs)
 *
 * Dashboard (connect.mjs-style, mounted from routes.mjs):
 *   GET  …/ots/:id/wallet                         addresses, balances, payments
 *   POST …/ots/:id/wallet/payments/:pid/approve   → { url } of the Notlogin confirm page
 *   POST …/ots/:id/wallet/payments/:pid/decline
 *   POST …/ots/:id/wallet/payments/:pid/refresh   reads the intent's outcome
 */

import { randomBytes } from 'node:crypto';
import { reqT } from '../i18n.mjs';
import { getDb } from './db.mjs';
import { getIntegration, setIntegration } from './store.mjs';

const penv = process.env;
const notloginUrl = () => (penv.NOTLOGIN_URL || 'https://notlogin.com').replace(/\/+$/, '');
export const WALLET_SCOPE = 'openid profile email wallet:read intents:create';
export const walletConfigured = () => !!(penv.NOTLOGIN_CLIENT_ID && penv.NOTLOGIN_SERVICE_TOKEN);

const NETWORKS = ['base', 'solana'];
const ADDR = { base: /^0x[0-9a-fA-F]{40}$/, solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ };
const MAX_OPEN = 10;

// ───────────────────────────── Notlogin tokens ─────────────────────────────

/** Saves the tokens from the token endpoint (the link callback or a refresh). */
export function saveNotloginTokens(accountId, j) {
  if (!j?.access_token) return;
  const prev = getIntegration(accountId, 'notlogin') || {};
  setIntegration(accountId, 'notlogin', {
    access: j.access_token,
    refresh: j.refresh_token || prev.refresh || null,
    exp: Date.now() + (Number(j.expires_in) || 900) * 1000,
    scope: j.scope || prev.scope || '',
  });
}

/** A valid access token with the wallet scopes, refreshing it when needed. null = connect again. */
export async function accessToken(accountId) {
  const it = getIntegration(accountId, 'notlogin');
  if (!it) return null;
  if (it.access && it.exp > Date.now() + 30_000) return it.access;
  if (!it.refresh) return null;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: it.refresh, client_id: penv.NOTLOGIN_CLIENT_ID });
  if (penv.NOTLOGIN_CLIENT_SECRET) body.set('client_secret', penv.NOTLOGIN_CLIENT_SECRET);
  const r = await fetch(`${notloginUrl()}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body, signal: AbortSignal.timeout(10000) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r?.ok || !j.access_token) {
    // single-use refresh: a rejected one is gone for good
    if (r && r.status >= 400 && r.status < 500) setIntegration(accountId, 'notlogin', null);
    return null;
  }
  saveNotloginTokens(accountId, j);
  return j.access_token;
}

// ───────────────────────────── Notlogin calls ─────────────────────────────

/** The ot's wallets (created on first call) with balances. */
async function agentWallets(sub, otsId) {
  const q = new URLSearchParams({ userId: sub, agentId: otsId, vendorSlug: penv.NOTLOGIN_CLIENT_ID });
  const r = await fetch(`${notloginUrl()}/api/x402/wallet?${q}`, { headers: { Authorization: `Bearer ${penv.NOTLOGIN_SERVICE_TOKEN}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`notlogin wallet ${r.status}${j.error ? `: ${String(j.error).slice(0, 120)}` : ''}`);
  return (j.wallets || [])
    .filter((w) => w.namespace === 'evm' || w.namespace === 'solana')
    .map((w) => ({ namespace: w.namespace, network: w.network, address: w.address, balances: w.balances || null, balanceError: w.balanceError || null }));
}

async function intentCall(accountId, path, init = {}) {
  const tok = await accessToken(accountId);
  if (!tok) throw Object.assign(new Error('relink'), { relink: true });
  const r = await fetch(`${notloginUrl()}/api/v1/account/intents${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('relink'), { relink: true });
  if (!r.ok) throw new Error(j.error || `notlogin ${r.status}`);
  return j;
}

// ───────────────────────────── payments ─────────────────────────────

// public block explorers: an address page lists everything that came in and went out
const EXPLORER = { base: ['https://basescan.org/address/', 'https://basescan.org/tx/'], solana: ['https://solscan.io/account/', 'https://solscan.io/tx/'] };
const walletNetwork = (w) => (w.namespace === 'solana' ? 'solana' : w.network);
export const addressUrl = (network, address) => (EXPLORER[network] && address ? EXPLORER[network][0] + encodeURIComponent(address) : null);
const txUrl = (network, hash) => (EXPLORER[network] && hash ? EXPLORER[network][1] + encodeURIComponent(hash) : null);

const payOf = (r) =>
  r && { id: r.id, network: r.network, to: r.to_addr, amount: r.amount, asset: r.asset, reason: r.reason, who: r.who, status: r.status, intentId: r.intent_id || null, txHash: r.tx_hash || null, txUrl: txUrl(r.network, r.tx_hash), error: r.error || null, createdAt: r.created_at, updatedAt: r.updated_at };

export function listPayments(otsId, limit = 30) {
  return getDb().prepare('SELECT * FROM ots_payments WHERE ots_id = ? ORDER BY created_at DESC LIMIT ?').all(otsId, limit).map(payOf);
}

function getPayment(otsId, id) {
  return payOf(getDb().prepare('SELECT * FROM ots_payments WHERE id = ? AND ots_id = ?').get(String(id || ''), otsId));
}

function setPayment(id, patch) {
  const cols = { status: 'status', intentId: 'intent_id', txHash: 'tx_hash', error: 'error' };
  const keys = Object.keys(patch).filter((k) => cols[k]);
  if (!keys.length) return;
  getDb()
    .prepare(`UPDATE ots_payments SET ${keys.map((k) => `${cols[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => (patch[k] == null ? null : String(patch[k]).slice(0, 300))), Date.now(), id);
}

/** A payment the ot proposes. It stays 'pending' until the owner approves it. */
export function requestPayment(ots, { network, to, amount, asset, reason }, who = 'owner') {
  network = String(network || 'base').toLowerCase();
  if (!NETWORKS.includes(network)) throw new Error(`network must be one of ${NETWORKS.join(', ')}`);
  to = String(to || '').trim();
  if (!ADDR[network].test(to)) throw new Error(`"to" is not a valid ${network} address`);
  amount = String(amount ?? '').trim();
  if (!/^\d+(\.\d{1,9})?$/.test(amount) || Number(amount) <= 0) throw new Error('amount must be a positive decimal, e.g. "2.5"');
  asset = String(asset || 'USDC').trim().slice(0, 60) || 'USDC';
  const open = getDb().prepare("SELECT COUNT(*) n FROM ots_payments WHERE ots_id = ? AND status IN ('pending', 'confirming')").get(ots.id).n;
  if (open >= MAX_OPEN) throw new Error('Too many payments waiting for approval; ask your owner to review them first');
  const id = `pay_${randomBytes(8).toString('hex')}`;
  const now = Date.now();
  getDb()
    .prepare('INSERT INTO ots_payments (id, ots_id, account_id, network, to_addr, amount, asset, reason, who, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ots.id, ots.accountId, network, to, amount, asset, String(reason || '').slice(0, 300), String(who).slice(0, 120), 'pending', now, now);
  return getPayment(ots.id, id);
}

/** Notlogin withdraw params: USDC is Notlogin's default stable; anything else goes as the asset ref. */
const withdrawParams = (otsId, p) => ({ network: p.network, to: p.to, amount: p.amount, agentId: otsId, ...(p.asset && p.asset.toUpperCase() !== 'USDC' ? { asset: p.asset } : {}) });

async function syncPayment(accountId, p) {
  if (p.status !== 'confirming' || !p.intentId) return p;
  const i = await intentCall(accountId, `/${encodeURIComponent(p.intentId)}`);
  if (i.status === 'done') setPayment(p.id, { status: 'paid', txHash: i.result?.txHash || i.result?.hash || i.result?.signature || null });
  else if (i.status === 'cancelled') setPayment(p.id, { status: 'cancelled' });
  else if (i.expiresAt && Date.parse(i.expiresAt) < Date.now()) setPayment(p.id, { status: 'pending', intentId: null });
  return { ...p, ...payOf(getDb().prepare('SELECT * FROM ots_payments WHERE id = ?').get(p.id)) };
}

// ───────────────────────────── views ─────────────────────────────

export async function walletView(account, ots) {
  const linked = !!account.notlogin_sub;
  const scoped = linked && !!getIntegration(account.id, 'notlogin');
  const v = { configured: walletConfigured(), linked, scoped, wallets: [], error: null, payments: listPayments(ots.id), connectUrl: `/auth/notlogin?link=${encodeURIComponent(ots.id)}`, notloginUrl: notloginUrl() };
  if (!v.configured || !linked) return v;
  try {
    v.wallets = (await agentWallets(account.notlogin_sub, ots.id)).map((w) => ({ ...w, explorerUrl: addressUrl(walletNetwork(w), w.address) }));
  } catch (e) {
    v.error = e.message;
  }
  return v;
}

// ───────────────────────────── dashboard routes ─────────────────────────────

export function createWallet({ send, readJson }) {
  /** @returns {Promise<boolean>} */
  return async function dashboard(req, res, account, ots, sub) {
    if (sub !== '/wallet' && !sub.startsWith('/wallet/')) return false;
    const t = reqT(req);
    if (sub === '/wallet' && req.method === 'GET') {
      const v = await walletView(account, ots);
      // payments waiting on Notlogin: pick up their outcome while the tab is open
      if (v.scoped) for (const p of v.payments.filter((x) => x.status === 'confirming').slice(0, 3)) await syncPayment(account.id, p).catch(() => null);
      return send(res, 200, { ...v, payments: listPayments(ots.id) }), true;
    }
    const m = sub.match(/^\/wallet\/payments\/(pay_[a-f0-9]{16})\/(approve|decline|refresh)$/);
    if (!m || req.method !== 'POST') return send(res, 404, { error: t('server.http.unknownRoute') }), true;
    const p = getPayment(ots.id, m[1]);
    if (!p) return send(res, 404, { error: t('server.http.notFound') }), true;
    try {
      if (m[2] === 'decline') {
        if (!['pending', 'confirming'].includes(p.status)) return send(res, 409, { error: t('platform.wallet.notPending') }), true;
        setPayment(p.id, { status: 'declined' });
        return send(res, 200, { payment: getPayment(ots.id, p.id) }), true;
      }
      if (m[2] === 'refresh') return send(res, 200, { payment: await syncPayment(account.id, p) }), true;
      // approve → a Notlogin withdraw intent, confirmed by the owner on notlogin.com
      if (!['pending', 'confirming'].includes(p.status)) return send(res, 409, { error: t('platform.wallet.notPending') }), true;
      if (!account.notlogin_sub) return send(res, 409, { error: t('platform.wallet.relink'), relink: true }), true;
      const base = (penv.PLATFORM_URL || '').replace(/\/+$/, '');
      const intent = await intentCall(account.id, '', {
        method: 'POST',
        body: JSON.stringify({ type: 'withdraw', params: withdrawParams(ots.id, p), ...(base ? { returnTo: `${base}/app/#ots/${ots.id}/wallet` } : {}) }),
      });
      setPayment(p.id, { status: 'confirming', intentId: intent.id, error: null });
      return send(res, 200, { url: intent.url, payment: getPayment(ots.id, p.id) }), true;
    } catch (e) {
      if (e.relink) return send(res, 409, { error: t('platform.wallet.relink'), relink: true }), true;
      console.warn('[7ots] wallet:', e.message);
      return send(res, 502, { error: String(e.message).slice(0, 200) }), true;
    }
  };
}

// ───────────────────────────── the ot's tools (owner chat) ─────────────────────────────

const TOOLS = [
  {
    name: 'wallet_info',
    description: 'Shows your own wallet: your addresses (Base and Solana) and balances, and the payments you proposed with their status.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'request_payment',
    description:
      'Proposes a payment from your wallet. It does NOT pay by itself: your owner must approve it in the Wallet tab and confirm it on Notlogin. ' +
      'Only use it when your owner asked you to pay something, with the exact address and amount.',
    parameters: {
      type: 'object',
      properties: {
        network: { type: 'string', enum: NETWORKS, description: 'base (default) or solana' },
        to: { type: 'string', description: 'Destination address' },
        amount: { type: 'string', description: 'Decimal amount, e.g. "2.5"' },
        asset: { type: 'string', description: 'USDC (default) or a token address' },
        reason: { type: 'string', description: 'What it is for, in a few words' },
      },
      required: ['to', 'amount'],
    },
  },
];

/** Wallet tools for the owner chat, or null when the account has no Notlogin wallet. */
export function walletTools(ots, account) {
  if (!walletConfigured() || !account?.notlogin_sub) return null;
  return {
    tools: TOOLS,
    names: TOOLS.map((x) => x.name),
    prompt: 'You have your own crypto wallet (Notlogin). You can check it with wallet_info and propose payments with request_payment; your owner approves every payment in the Wallet tab, so say so after proposing one.',
    run: async (name, args = {}) => {
      if (name === 'wallet_info') {
        const wallets = await agentWallets(account.notlogin_sub, ots.id).catch((e) => ({ error: e.message }));
        return { ok: true, wallets, payments: listPayments(ots.id, 10).map(({ id, network, to, amount, asset, reason, status, txHash }) => ({ id, network, to, amount, asset, reason, status, txHash })) };
      }
      if (name === 'request_payment') {
        const p = requestPayment(ots, args, 'owner chat');
        return { ok: true, id: p.id, status: p.status, note: 'Waiting for your owner to approve it in the Wallet tab.' };
      }
      throw new Error(`Unknown tool: ${name}`);
    },
  };
}
