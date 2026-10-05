/**
 * Dashboard routes of the platform's integrations: an apuchat identity per ot and Orquesta tasks.
 * Mounted by routes.mjs (same session, same-origin and X-7ots-Admin rules as the rest of /api/platform).
 *
 * Account:
 *   DELETE /api/platform/apuchat/link               forget the linked apuchat account
 *   GET    /api/platform/orquesta/projects          projects of the connected Orquesta account
 *   POST   /api/platform/orquesta/key { key }       connect with an oak_ key · DELETE /api/platform/orquesta
 * One ot:
 *   GET    …/ots/:id/apuchat                         its identity, the account's apuchat state, open checkouts
 *   POST   …/ots/:id/apuchat/identity                new free identity · DELETE (detach; deletes free ones)
 *   POST   …/ots/:id/apuchat/key { key }             use an existing identity key
 *   GET    …/ots/:id/apuchat/quote?callsign=         price of a permanent handle
 *   POST   …/ots/:id/apuchat/checkout { callsign }   → { url } (card payment on apuchat; back to /app/?apuchat_ots=<id>)
 *   GET    …/ots/:id/apuchat/checkout/:cid           result; a newly revealed key is stored in the ot
 *   POST   …/ots/:id/apuchat/claim                   move the ot's identity into the linked apuchat account
 *   GET|PUT …/ots/:id/orquesta                       project, tasks on/off, allowed senders, daily cap; recent tasks
 *   POST   …/ots/:id/orquesta/ask { message, history }   the owner talks to the ot (only place with tools + owner)
 *   GET    …/ots/:id/orquesta/tasks/:tid · POST …/cancel
 * Browser redirects (state in a signed cookie, bound to the session's account):
 *   GET /auth/apuchat?ots= → apuchat /link → GET /auth/apuchat/callback?state&code
 *   GET /auth/orquesta?ots= → Orquesta OAuth (PKCE) → GET /auth/orquesta/callback?code&state
 *   Both end in /app/?notice=<key>#ots/<id>/<tab>.
 */

import { randomBytes } from 'node:crypto';
import { reqT, requestLocale } from '../i18n.mjs';
import { currentAccount, parseCookies } from './auth.mjs';
import { signValue, unsignValue } from './crypto.mjs';
import { getOwnOts, listTasks, tasksLastDay } from './store.mjs';
import { otsChannels, otsStep } from './runtime.mjs';
import {
  CALLSIGN_RE, apuchatAccountView, apuchatHub, callsignOf, checkout, checkoutStatus, claimIdentity, createFreeIdentity, defaultOwner, deleteIdentity,
  exchangeLink, linkUrl, pendingCheckouts, quote, unlink,
} from './apuchat.mjs';
import {
  askOt, authorizeUrl, cancelTask, disconnect, exchangeCode, listProjects, manageUrl, orquestaAccountView, orquestaUrl, otsOrquesta, parseAllow, projectUrl, saveKey, taskStatus,
  registerOts,
} from './orquesta.mjs';
import { assertPublicUrl, integrationsView, normalizeOtIntegrations, otIntegrations, testIntegration } from './integrations.mjs';

const penv = process.env;
const STATE_TTL = 10 * 60_000;
const COOKIES = { apuchat: 'ots_apuchat_link', orquesta: 'ots_orquesta_oauth' };
const IDENTITY_KEYS = ['APUCHAT_AGENT_CALLSIGN', 'APUCHAT_AGENT_FREE', 'APUCHAT_AGENT_OWNER'];

/**
 * @param {{ send: Function, readJson: Function, originOf: Function, save: (ots, patch) => Promise<object> }} deps
 */
export function createConnect({ send, readJson, originOf, save }) {
  const base = (req) => (penv.PLATFORM_URL || originOf(req)).replace(/\/+$/, '');

  function cookie(req, name, value, path, maxAge) {
    return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${base(req).startsWith('https:') ? '; Secure' : ''}`;
  }
  const putState = (req, res, kind, st) => res.setHeader('Set-Cookie', cookie(req, COOKIES[kind], signValue(Buffer.from(JSON.stringify(st)).toString('base64url')), `/auth/${kind}`, STATE_TTL));
  function takeState(req, res, kind) {
    res.setHeader('Set-Cookie', cookie(req, COOKIES[kind], '', `/auth/${kind}`, 0));
    const raw = unsignValue(parseCookies(req.headers.cookie)[COOKIES[kind]]);
    try {
      const st = raw && JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      return st && st.e > Date.now() ? st : null;
    } catch {
      return null;
    }
  }
  function redirect(res, to) {
    res.writeHead(303, { Location: to, 'Cache-Control': 'no-store' });
    res.end();
  }
  const back = (res, notice, otsId, tab) => redirect(res, `/app/?notice=${encodeURIComponent(notice)}${otsId ? `#ots/${otsId}/${tab}` : ''}`);

  // ───────────────────────────── apuchat identity of an ot ─────────────────────────────

  const hasIdentity = (ots) => !!ots.secrets.APUCHAT_AGENT_IDENTITY_KEY;
  const isFree = (ots) => hasIdentity(ots) && ots.settings.APUCHAT_AGENT_FREE === '1';
  // A paid handle held by the platform's anonymous account would be lost if the ot let go of its key.
  const wouldLose = (ots) => hasIdentity(ots) && !isFree(ots) && ots.settings.APUCHAT_AGENT_OWNER === 'managed';

  function apuchatView(account, ots) {
    const st = otsChannels(ots).status().apuchat || null;
    const has = hasIdentity(ots);
    return {
      hub: apuchatHub(),
      mintUrl: `${apuchatHub()}/account/mint`,
      identity: has ? { callsign: ots.settings.APUCHAT_AGENT_CALLSIGN || st?.callsign || null, free: isFree(ots), owner: ots.settings.APUCHAT_AGENT_OWNER || 'own' } : null,
      paused: ots.status !== 'on',
      listening: !!st && !st.lastError,
      error: st?.lastError || null,
      account: apuchatAccountView(account.id),
      checkouts: pendingCheckouts(account.id, ots.id),
    };
  }

  /** Puts an identity in the ot (its key is a channel setting: the apuchat channel restarts with it). */
  function setIdentity(ots, { key, callsign, free, owner }) {
    const settings = { ...ots.settings };
    for (const k of IDENTITY_KEYS) delete settings[k];
    const secrets = { ...ots.secrets };
    if (key) {
      secrets.APUCHAT_AGENT_IDENTITY_KEY = key;
      if (callsign) settings.APUCHAT_AGENT_CALLSIGN = callsign;
      if (free) settings.APUCHAT_AGENT_FREE = '1';
      if (owner) settings.APUCHAT_AGENT_OWNER = owner;
    } else delete secrets.APUCHAT_AGENT_IDENTITY_KEY;
    return save(ots, { settings, secrets });
  }

  /** New free identity for an ot that has none (also used when creating an ot with the box ticked). */
  async function freeIdentity(account, ots) {
    const id = await createFreeIdentity(account.id);
    return setIdentity(ots, { key: id.identityKey, callsign: id.callsign, free: id.free, owner: id.owner });
  }

  async function apuchatOts(req, res, account, ots, sub) {
    const t = reqT(req);
    const url = new URL(req.url, 'http://x');
    if (sub === '/apuchat' && req.method === 'GET') return send(res, 200, apuchatView(account, ots));

    if (sub === '/apuchat/identity' && req.method === 'POST') {
      // One live free identity per ot; a paid or pasted one has to be detached first.
      if (isFree(ots)) return send(res, 409, { error: t('platform.apuchat.alreadyFree') });
      if (hasIdentity(ots)) return send(res, 409, { error: t('platform.apuchat.hasIdentity') });
      const next = await freeIdentity(account, ots);
      return send(res, 201, apuchatView(account, next));
    }
    if (sub === '/apuchat/identity' && req.method === 'DELETE') {
      if (!hasIdentity(ots)) return send(res, 200, apuchatView(account, ots));
      if (wouldLose(ots)) return send(res, 409, { error: t('platform.apuchat.claimFirst') });
      const { APUCHAT_AGENT_CALLSIGN: cs, APUCHAT_AGENT_OWNER: owner } = ots.settings;
      const free = isFree(ots);
      const next = await setIdentity(ots, {});
      if (free && cs) await deleteIdentity(account.id, owner, cs);
      return send(res, 200, apuchatView(account, next));
    }
    if (sub === '/apuchat/key' && req.method === 'POST') {
      const { key } = await readJson(req, 8 * 1024);
      const k = String(key || '').trim();
      if (!k || k.length > 400 || /\s/.test(k)) return send(res, 400, { error: t('platform.apuchat.badKey') });
      if (wouldLose(ots)) return send(res, 409, { error: t('platform.apuchat.claimFirst') });
      const callsign = await callsignOf(k);
      if (!callsign) return send(res, 400, { error: t('platform.apuchat.keyRefused') });
      const next = await setIdentity(ots, { key: k, callsign, owner: 'own' });
      return send(res, 200, apuchatView(account, next));
    }
    if (sub === '/apuchat/quote' && req.method === 'GET') {
      const callsign = String(url.searchParams.get('callsign') || '').trim().replace(/^@/, '').toLowerCase();
      if (!CALLSIGN_RE.test(callsign)) return send(res, 400, { error: t('platform.apuchat.badCallsign') });
      const upgrade = isFree(ots) && ots.settings.APUCHAT_AGENT_CALLSIGN === callsign;
      const q = await quote(account.id, upgrade ? ots.settings.APUCHAT_AGENT_OWNER : defaultOwner(account.id, 'identities:mint'), callsign);
      return send(res, 200, { ...q, upgrade, available: upgrade || (q.valid && !q.taken) });
    }
    if (sub === '/apuchat/checkout' && req.method === 'POST') {
      const { callsign: raw } = await readJson(req, 4 * 1024);
      const callsign = String(raw || '').trim().replace(/^@/, '').toLowerCase();
      if (!CALLSIGN_RE.test(callsign)) return send(res, 400, { error: t('platform.apuchat.badCallsign') });
      // Same callsign as the ot's free identity → in-place upgrade, made by the account that owns it.
      const upgrade = isFree(ots) && ots.settings.APUCHAT_AGENT_CALLSIGN === callsign;
      if (!upgrade && wouldLose(ots)) return send(res, 409, { error: t('platform.apuchat.claimFirst') });
      const owner = upgrade ? ots.settings.APUCHAT_AGENT_OWNER : defaultOwner(account.id, 'identities:mint');
      // No #fragment: apuchat appends ?apuchat_checkout=<id>&status=… to it; the dashboard opens the ot's tab from apuchat_ots.
      const out = await checkout(account.id, owner, { otsId: ots.id, callsign, returnUrl: `${base(req)}/app/?apuchat_ots=${ots.id}` });
      return send(res, 200, { url: out.url, checkoutId: out.checkoutId, priceUsd: out.priceUsd, tier: out.tier });
    }
    const ck = sub.match(/^\/apuchat\/checkout\/([A-Za-z0-9_-]{4,100})$/);
    if (ck && req.method === 'GET') {
      const st = await checkoutStatus(account.id, ots.id, ck[1]);
      if (!st) return send(res, 404, { error: t('server.http.notFound') });
      let next = ots;
      if (st.status === 'fulfilled') {
        if (st.identityKey) {
          const { APUCHAT_AGENT_CALLSIGN: old, APUCHAT_AGENT_OWNER: oldOwner } = ots.settings;
          const wasFree = isFree(ots);
          next = await setIdentity(ots, { key: st.identityKey, callsign: st.callsign, owner: st.owner });
          // The free handle it replaces goes back to apuchat (best effort).
          if (wasFree && old && old !== st.callsign) await deleteIdentity(account.id, oldOwner, old).catch(() => {});
        } else if (st.upgraded && ots.settings.APUCHAT_AGENT_CALLSIGN === st.callsign) {
          const settings = { ...ots.settings };
          delete settings.APUCHAT_AGENT_FREE;
          next = await save(ots, { settings });
        }
      }
      return send(res, 200, { status: st.status, callsign: st.callsign, upgraded: st.upgraded, applied: next !== ots, apuchat: apuchatView(account, next) });
    }
    if (sub === '/apuchat/claim' && req.method === 'POST') {
      if (!hasIdentity(ots)) return send(res, 409, { error: t('platform.apuchat.noIdentity') });
      await claimIdentity(account.id, ots.secrets.APUCHAT_AGENT_IDENTITY_KEY);
      const next = await save(ots, { settings: { ...ots.settings, APUCHAT_AGENT_OWNER: 'linked' } });
      return send(res, 200, apuchatView(account, next));
    }
    return false;
  }

  // ───────────────────────────── Orquesta panel of an ot ─────────────────────────────

  function orquestaView(account, ots) {
    const cfg = otsOrquesta(ots);
    return {
      url: orquestaUrl(),
      // Where the owner changes which Orquesta projects 7ots may reach (per-project consent).
      manageUrl: manageUrl(),
      account: orquestaAccountView(account.id),
      ...cfg,
      projectUrl: cfg.project ? projectUrl(cfg.project) : null,
      usedToday: tasksLastDay(ots.id),
      recent: listTasks(ots.id, 20).map((x) => ({ id: x.id, who: x.who, channel: x.channel, task: x.task.slice(0, 300), status: x.status, result: x.result.slice(0, 2000), error: x.error, createdAt: x.createdAt, updatedAt: x.updatedAt })),
    };
  }

  async function orquestaOts(req, res, account, ots, sub) {
    const t = reqT(req);
    if (sub === '/orquesta' && req.method === 'GET') return send(res, 200, orquestaView(account, ots));
    if (sub === '/orquesta' && req.method === 'PUT') {
      const body = await readJson(req, 16 * 1024);
      const settings = { ...ots.settings };
      if (body.project !== undefined) {
        const id = String(body.project || '').trim();
        if (!id) {
          delete settings.ORQUESTA_PROJECT;
          delete settings.ORQUESTA_PROJECT_NAME;
        } else {
          const p = (await listProjects(account.id)).find((x) => x.id === id);
          if (!p) return send(res, 400, { error: t('platform.orquesta.noProject') });
          settings.ORQUESTA_PROJECT = p.id;
          settings.ORQUESTA_PROJECT_NAME = p.name;
        }
      }
      if (body.tasks !== undefined) {
        if (body.tasks) settings.ORQUESTA_TASKS = '1';
        else delete settings.ORQUESTA_TASKS;
      }
      if (body.allow !== undefined) {
        const { list, bad } = parseAllow(body.allow);
        if (bad.length) return send(res, 400, { error: t('platform.orquesta.badAllow', { list: bad.slice(0, 5).join(', ') }) });
        if (list.length) settings.ORQUESTA_ALLOW = list.join(', ');
        else delete settings.ORQUESTA_ALLOW;
      }
      if (body.daily !== undefined) settings.ORQUESTA_DAILY = String(Math.min(200, Math.max(1, Math.floor(Number(body.daily)) || 20)));
      if (settings.ORQUESTA_TASKS && !settings.ORQUESTA_PROJECT) return send(res, 400, { error: t('platform.orquesta.pickProject') });
      const saved = await save(ots, { settings });
      registerOts(account.id, { force: true }).catch(() => null); // seeds the link in Orquesta for a first project
      return send(res, 200, orquestaView(account, saved));
    }
    if (sub === '/orquesta/ask' && req.method === 'POST') {
      const { message, history } = await readJson(req, 128 * 1024);
      const msg = String(message || '').trim();
      if (!msg) return send(res, 400, { error: t('server.http.badRequest') });
      if (ots.status !== 'on') return send(res, 409, { error: t('platform.api.paused') });
      const out = await askOt(ots, { message: msg, history, ownerEmail: account.email || account.id, locale: requestLocale(req) }, (a) => otsStep(ots, a));
      return send(res, 200, out);
    }
    const tm = sub.match(/^\/orquesta\/tasks\/([A-Za-z0-9_-]{4,100})(\/cancel)?$/);
    if (tm && !tm[2] && req.method === 'GET') {
      const out = await taskStatus(ots, tm[1]);
      return out.ok ? send(res, 200, out) : send(res, 404, { error: out.error });
    }
    if (tm && tm[2] && req.method === 'POST') {
      const row = await cancelTask(ots, tm[1]);
      return row ? send(res, 200, { id: row.id, status: row.status }) : send(res, 404, { error: t('server.http.notFound') });
    }
    return false;
  }

  // ───────────────────────────── account-level routes ─────────────────────────────

  async function accountApi(req, res, account, path) {
    if (path === '/apuchat/link' && req.method === 'DELETE') {
      unlink(account.id);
      return send(res, 200, { apuchat: apuchatAccountView(account.id) });
    }
    if (path === '/orquesta/projects' && req.method === 'GET') return send(res, 200, { projects: await listProjects(account.id) });
    if (path === '/orquesta/key' && req.method === 'POST') {
      const { key } = await readJson(req, 4 * 1024);
      await saveKey(account.id, key);
      return send(res, 200, { orquesta: orquestaAccountView(account.id) });
    }
    if (path === '/orquesta' && req.method === 'DELETE') {
      disconnect(account.id);
      return send(res, 200, { orquesta: orquestaAccountView(account.id) });
    }
    return false;
  }

  // ───────────────────────────── browser redirects ─────────────────────────────

  async function authRoutes(req, res, url) {
    const p = url.pathname;
    if (!/^\/auth\/(apuchat|orquesta)(\/callback)?$/.test(p) || req.method !== 'GET') return false;
    const account = currentAccount(req);
    if (!account) {
      redirect(res, '/app/');
      return true;
    }
    const kind = p.split('/')[2];
    const tab = kind;

    if (!p.endsWith('/callback')) {
      const ots = getOwnOts(account.id, url.searchParams.get('ots'));
      const st = { s: randomBytes(16).toString('base64url'), acc: account.id, ots: ots?.id || null, e: Date.now() + STATE_TTL };
      if (kind === 'apuchat') {
        putState(req, res, kind, st);
        redirect(res, linkUrl(`${base(req)}/auth/apuchat/callback?state=${st.s}`));
        return true;
      }
      try {
        const { url: to, verifier } = await authorizeUrl({ redirectUri: `${base(req)}/auth/orquesta/callback`, state: st.s });
        putState(req, res, kind, { ...st, v: verifier });
        redirect(res, to);
      } catch (e) {
        console.warn('[7ots] orquesta connect:', e.message);
        back(res, 'orquestaFailed', st.ots, tab);
      }
      return true;
    }

    const st = takeState(req, res, kind);
    const code = url.searchParams.get('code');
    // The flow must come back to the same browser AND the same 7ots account that started it.
    const ok = st && st.acc === account.id && code && url.searchParams.get('state') === st.s;
    const otsId = st?.ots && getOwnOts(account.id, st.ots) ? st.ots : null;
    if (!ok) {
      back(res, url.searchParams.get('error') === 'access_denied' ? `${kind}Denied` : `${kind}Failed`, otsId, tab);
      return true;
    }
    try {
      if (kind === 'apuchat') await exchangeLink(account.id, code);
      else await exchangeCode(account.id, { code, verifier: st.v, redirectUri: `${base(req)}/auth/orquesta/callback` });
      back(res, kind === 'apuchat' ? 'apuchatLinked' : 'orquestaConnected', otsId, tab);
    } catch (e) {
      console.warn(`[7ots] ${kind} callback:`, e.message);
      back(res, `${kind}Failed`, otsId, tab);
    }
    return true;
  }

  /** Dashboard → Assistant → Integrations (MCP servers / APIs the ot can use when its owner asks). */
  async function integrationsOts(req, res, account, ots, sub) {
    const t = reqT(req);
    const fail = (e) => send(res, 400, { error: e.code ? t(`platform.integ.${e.code}`) : String(e.message || e).slice(0, 300) });
    if (sub === '/integrations' && req.method === 'GET') return send(res, 200, { items: integrationsView(ots) });
    if (sub === '/integrations' && req.method === 'PUT') {
      const body = await readJson(req, 64 * 1024);
      let out;
      try {
        out = normalizeOtIntegrations(body.items, ots);
        for (const c of out.list) if (c.url && c.on) await assertPublicUrl(c.url);
      } catch (e) {
        return fail(e);
      }
      const settings = { ...ots.settings };
      if (out.list.length) settings.INTEGRATIONS = JSON.stringify(out.list);
      else delete settings.INTEGRATIONS;
      const saved = await save(ots, { settings, secrets: out.secrets });
      return send(res, 200, { items: integrationsView(saved) });
    }
    const m = sub.match(/^\/integrations\/([a-z0-9]{6,16})\/test$/);
    if (m && req.method === 'POST') {
      const c = otIntegrations(ots).find((x) => x.id === m[1]);
      if (!c) return send(res, 404, { error: t('platform.integ.notFound') });
      try {
        return send(res, 200, await testIntegration(ots, c));
      } catch (e) {
        return send(res, 200, { ok: false, error: e.code ? t(`platform.integ.${e.code}`) : String(e.message || e).replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 ***').slice(0, 300) });
      }
    }
    return false;
  }

  return {
    /** /api/platform/<path> for the account; false if not one of these routes. */
    account: accountApi,
    /** /api/platform/ots/:id<sub>; false if not one of these routes. */
    async ots(req, res, account, ots, sub) {
      if (sub.startsWith('/apuchat')) return (await apuchatOts(req, res, account, ots, sub)) !== false;
      if (sub.startsWith('/orquesta')) return (await orquestaOts(req, res, account, ots, sub)) !== false;
      if (sub.startsWith('/integrations')) return (await integrationsOts(req, res, account, ots, sub)) !== false;
      return false;
    },
    auth: authRoutes,
    freeIdentity,
    integrations: (account) => ({ apuchat: apuchatAccountView(account.id), orquesta: { ...orquestaAccountView(account.id), url: orquestaUrl() } }),
    /** When an ot is deleted: give its free identity back to apuchat (best effort). */
    async release(account, ots) {
      if (isFree(ots) && ots.settings.APUCHAT_AGENT_CALLSIGN) await deleteIdentity(account.id, ots.settings.APUCHAT_AGENT_OWNER, ots.settings.APUCHAT_AGENT_CALLSIGN).catch(() => {});
    },
  };
}
