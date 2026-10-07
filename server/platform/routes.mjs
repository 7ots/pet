/**
 * Rutas de la plataforma 7ots.com (PLATFORM=true).
 *
 * Públicas, una API de agente por ots (el widget las llama igual que /api/agent/*):
 *   GET  /api/o/:id/config · /embed.js · /identity · /identity.vcf · /portrait.svg · /model.glb · /3d   (cualquier origen)
 *   POST /api/o/:id/chat · /tts · /identity/call · /contact/*          (solo desde sus dominios)
 *
 * Dashboard (sesión de /auth/*; escrituras con X-7ots-Admin: 1 y mismo origen):
 *   GET    /api/platform/me
 *   GET    /api/platform/ots                 POST (crear)
 *   GET    /api/platform/ots/:id             PATCH { name, status, domains } · DELETE
 *   POST   /api/platform/ots/:id/duplicate
 *   GET    /api/platform/ots/:id/conversations[?before]   GET|DELETE …/conversations/:cid
 *   GET    /api/platform/ots/:id/usage
 *   *      /api/platform/ots/:id/admin/*     misma forma que /api/agent/admin/* (el backoffice
 *                                            edita un ots con ?ots=<id>)
 *   *      /api/mods, /api/platform/mods/*, /api/device/mods/*   community mods (mods.mjs)
 *   GET    /api/platform/sites               POST { kind, url, name, guide } · POST …/:id/verify · DELETE …/:id  (sites.mjs)
 *   GET    /api/platform/device/:code · POST { approve }   GET /api/platform/devices · DELETE …/:id
 *
 *   GET    /api/platform/ots/:id/vm          POST …/vm/enroll · DELETE …/vm   (vm.mjs)
 *   GET    /api/platform/ots/:id/byte · POST …/byte/connect|play|stop · DELETE …/byte   (byte.mjs)
 *   GET    /api/platform/ots/:id/wallet      POST …/wallet/payments/:pid/approve|decline|refresh   (wallet.mjs)
 *
 * Desktop pet signed in with `7ots login` (Authorization: Bearer 7d_…): /api/device/* — see device.mjs
 *   (…/ots/:id/vm[/jobs…]: the offload channel to the ot's worker, vm.mjs)
 * Worker on the ot's own server (Authorization: Bearer 7vm_…): /api/vm/* — see vm.mjs
 *   apuchat identity and Orquesta tasks (…/apuchat/*, …/orquesta/*, /auth/apuchat|orquesta): see connect.mjs
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MEET_AVATARS, MEET_SCENES, OPENAI_VOICES, GROK_VOICES, defineIdentity, identityPrompt, publicIdentity, toVCard } from '../identity.mjs';
import { errorText, reqT, requestLocale } from '../i18n.mjs';
import { dataDir, monthOf } from './db.mjs';
import { randomIdentity, cleanSeed } from '../../src/identity/random.js';
import { currentAccount } from './auth.mjs';
import {
  OTS_KEYS, MAX_OTS_PER_ACCOUNT, accountUsage, addUsage, cleanDomains, countOts, createOts, withFreeLook, lookTaken, deleteConversation, deleteOts, duplicateOts,
  getConversation, getOts, getOwnOts, listConversations, listOts, logTurn, originAllowed, publicAccount, updateOts, usageByOts, usageHistory,
} from './store.mjs';
import { freeMessages, freeTts, otsChannels, otsEnv, otsLlmInfo, otsStep, otsSynthesize, otsTtsProvider, platformLlmEnv, stopOtsChannels } from './runtime.mjs';
import { createConnect } from './connect.mjs';
import { createDevice, deviceFromBearer } from './device.mjs';
import { createVm } from './vm.mjs';
import { createSites } from './sites.mjs';
import { portraitOf, profilePage } from './profile.mjs';
import { stage3dHeaders, stage3dPage } from './stage3d.mjs';
import { orquestaAccountView, orquestaUrl } from './orquesta.mjs';
import { createMods } from './mods.mjs';
import { createWallet } from './wallet.mjs';
import { createByte } from './byte.mjs';
import { characterOf, modelGlb, modelHash } from './model3d.mjs';
import '../../src/i18n/messages/platform.js';

const penv = process.env;
const OTS_RATE = () => Number(penv.PLATFORM_OTS_RATE_PER_MIN || 120);
const OTS_DAILY = () => Number(penv.PLATFORM_OTS_DAILY_LIMIT || 1000);

/**
 * @param {object} deps  helpers HTTP de server.mjs
 */
export function createPlatform({ send, readJson, rateLimit, callLimit, originOf, embedScript, bundleVersion, relay, sendApumail, startApuchat }) {
  const selfOrigins = (req) => new Set([originOf(req), penv.PLATFORM_URL && new URL(penv.PLATFORM_URL).origin].filter(Boolean));

  // ───────────────────────────── API pública de cada ots ─────────────────────────────

  const otsBuckets = new Map();
  function otsRate(id) {
    const now = Date.now();
    const rate = OTS_RATE();
    const b = otsBuckets.get(id) || { tokens: rate, at: now };
    b.tokens = Math.min(rate, b.tokens + ((now - b.at) / 60000) * rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    otsBuckets.set(id, b);
    if (otsBuckets.size > 10000) otsBuckets.clear();
    return true;
  }

  /** Paid calls (chat, voice) per ot and day: Origin can be forged by scripts, so this caps what anyone can spend. */
  const otsDays = new Map(); // ots.id → { day, n }
  function otsDaily(id) {
    const day = new Date().toISOString().slice(0, 10);
    const d = otsDays.get(id);
    const cur = d?.day === day ? d : { day, n: 0 };
    if (cur.n >= OTS_DAILY()) return false;
    cur.n += 1;
    otsDays.set(id, cur);
    if (otsDays.size > 20000) otsDays.clear();
    return true;
  }

  // An ot whose account connected Orquesta lends it its voice (Settings → Identity → Face & voice
  // there): Orquesta's origin — and meet, where that agent talks on calls (it announces
  // `[voice]7ots:<id>`) — may use /tts without being typed into the ot's domains. Only /tts —
  // the brain stays Orquesta's, so /chat still needs the domain.
  const ORQUESTA_VOICE_HOSTS = ['meet.apuchat.com'];
  function orquestaVoice(ots, origin, path) {
    if (path !== '/tts') return false;
    try {
      const u = new URL(origin);
      const o = new URL(orquestaUrl());
      const hosts = [o.hostname, `www.${o.hostname}`, ...ORQUESTA_VOICE_HOSTS];
      if (u.protocol !== 'https:' || !hosts.includes(u.hostname)) return false;
    } catch {
      return false;
    }
    return orquestaAccountView(ots.accountId).connected;
  }

  function otsCors(req, res, ots, path) {
    const origin = req.headers.origin;
    if (!origin) return false; // el widget siempre manda Origin; sin él no se sirve la IA
    // From 7ots.com itself only the owner's preview (with their session) may use the ot.
    const self = selfOrigins(req).has(origin);
    if (self ? currentAccount(req)?.id !== ots.accountId : !originAllowed(ots, origin) && !orquestaVoice(ots, origin, path)) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Site-Key, Accept, Accept-Language');
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  }

  /**
   * The ot's 3D body as glTF binary (model3d.mjs), for byte arena and any glTF viewer. ?v=<hash> (the URL
   * profileOf hands out) is immutable: a new look is a new hash. Without it (or with an old one) it is the
   * current body, cached briefly. 404 when the ot has no drawn character (an outside VRM, a photo).
   */
  async function sendModel(req, res, ots) {
    const ch = characterOf(ots.identity);
    const hash = modelHash(ch);
    if (!hash) return send(res, 404, { error: 'no 3d body' });
    const etag = `"${hash}"`;
    const v = new URL(req.url, 'http://x').searchParams.get('v');
    const headers = {
      'Content-Type': 'model/gltf-binary',
      'Cache-Control': v === hash ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    let out;
    try {
      out = await modelGlb(ch);
    } catch (e) {
      console.error('[model3d]', ots.id, e.message);
      return send(res, 500, { error: 'could not build the 3d body' });
    }
    if (!out) return send(res, 404, { error: 'no 3d body' });
    res.writeHead(200, { ...headers, 'Content-Length': out.glb.length });
    return res.end(req.method === 'HEAD' ? undefined : out.glb);
  }

  async function publicApi(req, res, id, path) {
    const t = reqT(req);
    const ots = getOts(id);
    const open = ['/config', '/embed.js', '/identity', '/identity.vcf', '/traits.json', '/portrait.svg', '/model.glb', '/3d'].includes(path);
    if (open) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') return send(res, 204);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: t('server.http.methodNotAllowed') });
      if (!ots) return send(res, 404, { error: t('platform.api.notFound') });
      if (path === '/config') return send(res, 200, ots.widget);
      if (path === '/embed.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
        if (ots.status !== 'on') return res.end('/* 7ots: ots en pausa */');
        return res.end(embedScript(ots.widget, await bundleVersion(), `/api/o/${ots.id}`));
      }
      if (path === '/3d') {
        res.writeHead(200, stage3dHeaders());
        return res.end(req.method === 'HEAD' ? undefined : stage3dPage());
      }
      if (path === '/model.glb') return sendModel(req, res, ots);
      if (path === '/traits.json') return send(res, 200, traitsMeta(ots, `${originOf(req)}/api/o/${ots.id}`));
      const card = publicIdentity(ots.identity, otsChannels(ots).live());
      if (path === '/portrait.svg') {
        const pic = portraitOf(card);
        if (pic.redirect) {
          res.writeHead(302, { Location: pic.redirect, 'Cache-Control': 'public, max-age=300' });
          return res.end();
        }
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          // Opened directly as a document, it still runs nothing.
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        });
        return res.end(pic.svg);
      }
      if (path === '/identity.vcf') {
        res.writeHead(200, { 'Content-Type': 'text/vcard; charset=utf-8', 'Content-Disposition': `inline; filename="${card.id}.vcf"`, 'Cache-Control': 'no-cache' });
        return res.end(toVCard(card, { baseUrl: `${originOf(req)}/api/o/${ots.id}/identity.vcf` }));
      }
      // A person opening the link sees the ot's card; agents and the card itself (Accept: */* or JSON) get the JSON.
      res.setHeader('Vary', 'Accept');
      if (/text\/html/.test(req.headers.accept || '') && !/[?&]format=json\b/.test(req.url)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        const ep = `${originOf(req)}/api/o/${ots.id}`;
        return res.end(profilePage(card, traitsMeta(ots, ep), ep, requestLocale(req)));
      }
      return send(res, 200, card);
    }

    if (!ots) return send(res, 404, { error: t('platform.api.notFound') });
    if (!otsCors(req, res, ots, path)) return send(res, 403, { error: t('platform.api.originNotAllowed') });
    if (req.method === 'OPTIONS') return send(res, 204);
    if (req.method !== 'POST') return send(res, 405, { error: t('server.http.methodNotAllowed') });
    if (ots.status !== 'on') return send(res, 403, { error: t('platform.api.paused') });
    if (!rateLimit(req)) return send(res, 429, { error: t('server.http.rateLimited') });
    if (!otsRate(ots.id)) return send(res, 429, { error: t('platform.api.otsRateLimited') });
    if ((path === '/chat' || path === '/tts') && !otsDaily(ots.id)) return send(res, 429, { error: t('platform.api.otsDailyLimit') });

    if (path === '/chat') {
      const { system, messages, tools = [], session } = await readJson(req, 1024 * 1024);
      if (typeof system !== 'string' || !Array.isArray(messages) || !messages.length || !Array.isArray(tools)) return send(res, 400, { error: t('server.http.badRequest') });
      if (messages.length > 300 || tools.length > 128 || system.length > 30000) return send(res, 413, { error: t('server.http.tooLarge') });
      const pre = [ots.settings.SERVER_INSTRUCTIONS, identityPrompt(ots.identity)].filter(Boolean).join('\n\n');
      let out;
      try {
        out = await otsStep(ots, { system: `${pre}\n\n${system}`, messages, tools, locale: requestLocale(req) });
      } catch (e) {
        // Sin cupo: el visitante ve un aviso normal en el chat, no un error.
        if (e.status !== 402) throw e;
        out = { text: errorText(e, t), toolCalls: [], finishReason: 'quota', provider: '7ots' };
      }
      const last = messages[messages.length - 1];
      const key = typeof session === 'string' && /^[\w-]{8,64}$/.test(session) ? session : null;
      if (key) {
        const seen = last?.role === 'user' ? visibleTurn(last.content) : { text: '', page: '' };
        const { created } = logTurn(ots, { key, page: seen.page, origin: req.headers.origin || '', user: seen.text, reply: out.text || '' });
        if (created) addUsage(ots, 'conversation');
      }
      return send(res, 200, out);
    }

    if (path === '/tts') {
      const { text } = await readJson(req, 16 * 1024);
      const { audio, contentType } = await otsSynthesize(ots, { text });
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
      return res.end(audio);
    }

    if (path === '/identity/call') {
      if (!callLimit(req)) return send(res, 429, { error: t('server.http.callLimited') });
      const { motivo } = await readJson(req, 4 * 1024);
      const call = await otsChannels(ots).openCall({ reason: String(motivo || '').slice(0, 200) });
      addUsage(ots, 'call');
      return send(res, 200, { call_url: call.call_url, expires_at: call.expires_at });
    }

    const { env } = otsEnv(ots);
    if (path === '/contact/apumail') return send(res, 200, await sendApumail(await readJson(req, 128 * 1024), env));
    if (path === '/contact/apuchat') return send(res, 200, await startApuchat(await readJson(req, 128 * 1024), env));
    if (path === '/contact/apuchat/send') return send(res, 200, await relay.relaySend(await readJson(req, 16 * 1024)));
    if (path === '/contact/apuchat/wait') return send(res, 200, await relay.relayWait(await readJson(req, 4 * 1024)));
    if (path === '/contact/apuchat/end') return send(res, 200, await relay.relayEnd(await readJson(req, 4 * 1024)));
    send(res, 404, { error: t('server.http.unknownRoute') });
  }

  // ───────────────────────────── dashboard ─────────────────────────────

  function otsSummary(ots, usage = {}) {
    const llm = otsLlmInfo(ots);
    return {
      id: ots.id,
      name: ots.name,
      status: ots.status,
      domains: ots.domains,
      identity: { name: ots.identity.name, role: ots.identity.role, look: ots.identity.look },
      llm: `${llm.name}:${llm.model}`,
      platformLlm: llm.platform,
      tts: otsTtsProvider(ots),
      usage,
      createdAt: ots.createdAt,
      updatedAt: ots.updatedAt,
    };
  }

  /** Vista de ajustes con la forma de serverView() (el backoffice la pinta igual). */
  function serverViewOf(ots) {
    const values = {};
    const secrets = {};
    for (const [k, meta] of Object.entries(OTS_KEYS)) {
      if (meta.managed) continue;
      if (meta.secret) secrets[k] = { set: !!ots.secrets[k], source: ots.secrets[k] ? 'backoffice' : null, restart: false };
      else values[k] = { value: ots.settings[k] ?? '', source: ots.settings[k] != null ? 'backoffice' : null, restart: false };
    }
    return { values, secrets };
  }

  function statusOf(ots) {
    const ch = otsChannels(ots);
    const { env, platformLlm, platformTts } = otsEnv(ots);
    const llm = otsLlmInfo(ots);
    return {
      llm: `${llm.name}:${llm.model}`,
      tts: otsTtsProvider(ots),
      platform: { llm: platformLlm, tts: platformTts },
      channels: ch.status(),
      live: ch.live(),
      contact: {
        apumail: !!(env.APUMAIL_INBOX && env.APUMAIL_INBOX_TOKEN && env.APUMAIL_TO),
        apuchatOperator: !!(env.APUCHAT_NOTIFIER_IDENTITY_KEY && env.APUCHAT_OPERATOR_HANDLE),
      },
    };
  }

  /** Guarda un ots y arranca/para sus canales según haga falta. */
  async function save(ots, patch) {
    const next = updateOts(ots.id, patch);
    if (next.status !== 'on') await stopOtsChannels(next.id);
    else otsChannels(next); // reinicia solo si cambió su configuración de canales
    return next;
  }

  async function adminApi(req, res, ots, route) {
    const t = reqT(req);
    if (route === '/session' && req.method === 'GET') return send(res, 200, { authed: true, mode: 'platform' });
    if (route === '/login' || route === '/logout') return send(res, 400, { error: t('platform.api.login') });
    if (route === '/state' && req.method === 'GET') {
      return send(res, 200, {
        ots: otsSummary(ots),
        identity: ots.identity,
        widget: ots.widget,
        server: serverViewOf(ots),
        status: statusOf(ots),
        options: { meetAvatars: MEET_AVATARS, meetScenes: MEET_SCENES, openaiVoices: OPENAI_VOICES, grokVoices: GROK_VOICES },
      });
    }
    if (route === '/identity' && req.method === 'PUT') {
      const identity = defineIdentity(await readJson(req, 256 * 1024), ots.identity);
      return send(res, 200, { identity: (await save(ots, { identity })).identity });
    }
    if (route === '/widget' && req.method === 'PUT') {
      const w = await readJson(req, 256 * 1024);
      if (!w || typeof w !== 'object' || Array.isArray(w)) return send(res, 400, { error: t('server.admin.invalidWidget') });
      return send(res, 200, { widget: (await save(ots, { widget: sanitizeWidget(w) })).widget });
    }
    if (route === '/server' && req.method === 'PUT') {
      const { values = {}, secrets = {} } = await readJson(req, 256 * 1024);
      const settings = { ...ots.settings };
      const sec = { ...ots.secrets };
      const changed = [];
      for (const [k, v] of Object.entries(values || {})) {
        const meta = OTS_KEYS[k];
        if (!meta || meta.secret || meta.managed) continue;
        const before = settings[k];
        if (v === null || v === '') delete settings[k];
        else settings[k] = String(v).slice(0, 20000);
        if (before !== settings[k]) changed.push(k);
      }
      for (const [k, v] of Object.entries(secrets || {})) {
        const meta = OTS_KEYS[k];
        if (!meta?.secret || v === '') continue;
        const before = sec[k];
        if (v === null) delete sec[k];
        else sec[k] = String(v).trim().slice(0, 4000);
        if (before !== sec[k]) changed.push(k);
      }
      // A key typed in the backoffice is not the identity the dashboard made: forget what it knew about it.
      if (changed.includes('APUCHAT_AGENT_IDENTITY_KEY')) for (const k of ['APUCHAT_AGENT_CALLSIGN', 'APUCHAT_AGENT_FREE', 'APUCHAT_AGENT_OWNER']) delete settings[k];
      const next = await save(ots, { settings, secrets: sec });
      return send(res, 200, { changed, channels: changed.some((k) => OTS_KEYS[k].channels), restart: [], server: serverViewOf(next), status: statusOf(next) });
    }
    if (route === '/test/llm' && req.method === 'POST') {
      const t0 = Date.now();
      try {
        const out = await otsStep(ots, { system: t('server.admin.testSystem'), messages: [{ role: 'user', content: t('server.admin.testPrompt') }], tools: [], locale: requestLocale(req) });
        const llm = otsLlmInfo(ots);
        return send(res, 200, { ok: true, text: out.text, ms: Date.now() - t0, llm: `${llm.name}:${llm.model}` });
      } catch (e) {
        return send(res, 200, { ok: false, error: errorText(e, t).slice(0, 300), ms: Date.now() - t0 });
      }
    }
    if (route === '/test/tts' && req.method === 'POST') {
      const { text, voice } = await readJson(req, 16 * 1024);
      const { audio, contentType } = await otsSynthesize(ots, { text: String(text || t('server.admin.ttsSample')).slice(0, 300), voice: voice || ots.identity.voice });
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
      return res.end(audio);
    }
    if (route === '/status' && req.method === 'GET') return send(res, 200, statusOf(ots));
    send(res, 404, { error: t('server.admin.unknownRoute') });
  }

  async function dashboardApi(req, res, path) {
    const t = reqT(req);
    const origin = req.headers.origin;
    if (origin && !selfOrigins(req).has(origin)) return send(res, 403, { error: t('server.admin.sameOrigin') });
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-7ots-admin'] !== '1') return send(res, 403, { error: t('server.admin.missingHeader') });
    const account = currentAccount(req);
    if (!account) return send(res, 401, { error: t('platform.api.login') });

    if (path === '/me' && req.method === 'GET') {
      return send(res, 200, {
        account: publicAccount(account),
        limits: { maxOts: MAX_OTS_PER_ACCOUNT(), freeMessages: freeMessages(), freeTts: freeTts(), platformLlm: !!platformLlmEnv() },
        usage: { month: monthOf(), llm_platform: accountUsage(account.id, 'llm_platform'), tts_platform: accountUsage(account.id, 'tts_platform') },
        integrations: connect.integrations(account),
      });
    }
    if ((await connect.account(req, res, account, path)) !== false) return;
    if (await device.dashboard(req, res, account, path)) return;
    if (await sites(req, res, account, path)) return;
    if ((path === '/mods' || path.startsWith('/mods/')) && (await mods.accountApi(req, res, account, path.slice('/mods'.length)))) return;

    if (path === '/ots' && req.method === 'GET') {
      const usage = usageByOts(account.id);
      return send(res, 200, { ots: listOts(account.id).map((o) => otsSummary(o, usage[o.id] || {})) });
    }
    if (path === '/ots' && req.method === 'POST') {
      if (countOts(account.id) >= MAX_OTS_PER_ACCOUNT()) return send(res, 403, { error: t('platform.api.tooManyOts', { max: MAX_OTS_PER_ACCOUNT() }) });
      const { name, language, seed, otName, apuchat, character, kind, material } = await readJson(req, 64 * 1024);
      const lang = ['es', 'en', 'pt'].includes(language) ? language : requestLocale(req);
      // From the 7ots.com hero: the same ot the visitor just rolled (seed + optional name).
      const rolled = cleanSeed(seed) ? randomIdentity(cleanSeed(seed), { lang, name: String(otName || '').trim().slice(0, 40) || undefined }) : null;
      const identity = rolled ? { ...STARTER[lang], ...rolled } : { language: lang, voice: { lang: { es: 'es-ES', en: 'en-US', pt: 'pt-BR' }[lang] }, ...STARTER[lang] };
      // …and the face as they left it in the landing editor (defineIdentity normalizes it).
      // Each ot is unique: a face chosen in the editor must be free (409 otherwise); without one, it gets a free face.
      const chosen = character && typeof character === 'object' && !Array.isArray(character);
      let ots = createOts(account.id, { name, identity: chosen ? { ...identity, look: { ...identity.look, kind: kind === 'plush' ? 'plush' : 'character', material, character } } : withFreeLook(identity, cleanSeed(seed) || null) });
      // "Free apuchat identity" box: best effort, the ot is created anyway.
      let apuchatError = null;
      if (apuchat === true) {
        try {
          ots = await connect.freeIdentity(account, ots);
        } catch (e) {
          apuchatError = errorText(e, t);
          if (!e.i18n) console.warn('[7ots] apuchat identity on create:', e.message);
        }
      }
      return send(res, 201, { ots: otsSummary(ots), ...(apuchat === true ? { apuchat: ots.settings.APUCHAT_AGENT_CALLSIGN || null, apuchatError } : {}) });
    }

    const m = path.match(/^\/ots\/([a-z0-9_]{4,40})(\/.*)?$/);
    if (!m) return send(res, 404, { error: t('server.http.unknownRoute') });
    const ots = getOwnOts(account.id, m[1]);
    if (!ots) return send(res, 404, { error: t('platform.api.notFound') });
    const sub = m[2] || '';

    if (sub.startsWith('/admin/')) return adminApi(req, res, ots, sub.slice('/admin'.length));
    if (await connect.ots(req, res, account, ots, sub)) return;
    if (await vm.dashboard(req, res, account, ots, sub)) return;
    if (await wallet(req, res, account, ots, sub)) return;
    if (await byte(req, res, ots, sub)) return;

    if (sub === '' && req.method === 'GET') return send(res, 200, { ots: otsSummary(ots, usageByOts(account.id)[ots.id] || {}) });
    if (sub === '' && req.method === 'PATCH') {
      const body = await readJson(req, 16 * 1024);
      const patch = {};
      if (typeof body.name === 'string') patch.name = body.name;
      if (body.status === 'on' || body.status === 'off') patch.status = body.status;
      if (body.domains !== undefined) {
        const list = Array.isArray(body.domains) ? body.domains : String(body.domains).split(/[\s,]+/).filter(Boolean);
        patch.domains = cleanDomains(list);
        if (patch.domains.length < list.length) return send(res, 400, { error: t('platform.api.badDomains') });
      }
      return send(res, 200, { ots: otsSummary(await save(ots, patch)) });
    }
    if (sub === '' && req.method === 'DELETE') {
      await stopOtsChannels(ots.id);
      await connect.release(account, ots);
      await vm.releaseOts(ots.id); // its 7ots server (Orquesta VM) goes too; ots_vms cascades with the ot
      deleteOts(ots.id);
      return send(res, 200, { ok: true });
    }
    if (sub === '/duplicate' && req.method === 'POST') {
      if (countOts(account.id) >= MAX_OTS_PER_ACCOUNT()) return send(res, 403, { error: t('platform.api.tooManyOts', { max: MAX_OTS_PER_ACCOUNT() }) });
      return send(res, 201, { ots: otsSummary(duplicateOts(account.id, ots)) });
    }
    if (sub === '/usage' && req.method === 'GET') return send(res, 200, { months: usageHistory(ots.id) });
    if (sub === '/conversations' && req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      return send(res, 200, { conversations: listConversations(ots.id, { before: url.searchParams.get('before'), limit: url.searchParams.get('limit') }) });
    }
    const c = sub.match(/^\/conversations\/(c_[A-Za-z0-9_-]{10,40})$/);
    if (c && req.method === 'GET') {
      const conv = getConversation(ots.id, c[1]);
      return conv ? send(res, 200, { conversation: conv }) : send(res, 404, { error: t('server.http.notFound') });
    }
    if (c && req.method === 'DELETE') return send(res, 200, { ok: deleteConversation(ots.id, c[1]) });
    send(res, 404, { error: t('server.http.unknownRoute') });
  }

  const connect = createConnect({ send, readJson, originOf, save });
  const device = createDevice({ send, readJson, rateLimit, base: (req) => (penv.PLATFORM_URL || originOf(req)).replace(/\/+$/, ''), summary: (o) => otsSummary(o), save });
  const sites = createSites({ send, readJson });
  const mods = createMods({ send, readJson });
  const wallet = createWallet({ send, readJson });
  const byte = createByte({ send, readJson });
  const vm = createVm({ send, readJson, rateLimit, base: (req) => (penv.PLATFORM_URL || originOf(req)).replace(/\/+$/, '') });

  /** @returns {Promise<boolean>} true si atendió la ruta */
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (await connect.auth(req, res, url)) return true;
    // models of mods (uploaded by a pet when it syncs): public, content-addressed, immutable
    const mf = /^\/mods\/([a-f0-9]{16})\.(glb|vrm)$/.exec(p);
    if (mf && (req.method === 'GET' || req.method === 'HEAD')) {
      const file = join(dataDir(), 'mods', `${mf[1]}.${mf[2]}`);
      if (!existsSync(file)) return send(res, 404, { error: 'not found' }), true;
      res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': statSync(file).size, 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' });
      if (req.method === 'HEAD') return res.end(), true;
      createReadStream(file).pipe(res);
      return true;
    }
    const m = p.match(/^\/api\/o\/([a-z0-9_]{4,40})(\/.*)$/);
    if (m) {
      await publicApi(req, res, m[1], m[2]);
      return true;
    }
    // The landing asks before sending the visitor to sign in: each ot is unique, a repeated face can't be created.
    if (p === '/api/look/free' && req.method === 'POST') {
      const { character, characters } = await readJson(req, 256 * 1024);
      const isObj = (c) => c && typeof c === 'object' && !Array.isArray(c);
      const free = (c) => (isObj(c) ? !lookTaken({ look: { kind: 'character', character: c } }) : false);
      // en lote (las sugerencias al azar del editor): { characters: [...] } → { free: [bool…] }
      if (Array.isArray(characters)) send(res, 200, { free: characters.slice(0, 32).map(free) });
      else send(res, 200, { free: free(character) });
      return true;
    }
    const dv = p.match(/^\/api\/device\/ots\/([a-z0-9_]{4,40})\/vm(\/.*)?$/);
    if (dv) {
      const who = deviceFromBearer(req);
      if (!who) send(res, 401, { error: 'login' });
      else await vm.device(req, res, who, dv[1], dv[2] || '');
      return true;
    }
    // community mods: public listing, and the same signed-in api for the pet (bearer) as for the dashboard
    if (p === '/api/mods' || p.startsWith('/api/mods/')) {
      if (!(await mods.publicApi(req, res, p.slice('/api/mods'.length)))) send(res, 404, { error: 'not found' });
      return true;
    }
    if (p === '/api/device/mods' || p.startsWith('/api/device/mods/')) {
      const who = deviceFromBearer(req);
      if (!who) send(res, 401, { error: 'login' });
      else if (!(await mods.accountApi(req, res, who.account, p.slice('/api/device/mods'.length)))) send(res, 404, { error: 'not found' });
      return true;
    }
    if (p.startsWith('/api/vm/')) {
      await vm.worker(req, res, p.slice('/api/vm'.length));
      return true;
    }
    if (p.startsWith('/api/device/')) {
      if (!(await device.api(req, res, p.slice('/api/device'.length)))) send(res, 404, { error: reqT(req)('server.http.unknownRoute') });
      return true;
    }
    if (p.startsWith('/api/platform/')) {
      await dashboardApi(req, res, p.slice('/api/platform'.length));
      return true;
    }
    return false;
  };
}

/** Rol y tono de partida de un ots nuevo, en su idioma (los defectos del esquema son en español). */
const STARTER = {
  es: { role: 'asistente virtual', personality: { tone: 'cercano y claro' } },
  en: { role: 'virtual assistant', personality: { tone: 'friendly and clear' } },
  pt: { role: 'assistente virtual', personality: { tone: 'próximo e claro' } },
};

/**
 * Lo que de verdad escribió el visitante en un mensaje del widget: sin el <page_context> ni el
 * <user_state> que añade AgentBrain. Los eventos proactivos (<evento_del_sistema>) y los
 * resultados de herramientas (contenido no textual) no son texto del visitante.
 */
function visibleTurn(content) {
  if (typeof content !== 'string') return { text: '', page: '' };
  const page = /<page_context>[\s\S]*?^URL: (\S+)/m.exec(content)?.[1] || '';
  if (content.includes('<evento_del_sistema>')) return { text: '', page };
  const text = content
    .replace(/<page_context>[\s\S]*?<\/page_context>/g, '')
    .replace(/<user_state>[\s\S]*?<\/user_state>/g, '')
    .trim();
  return { text, page: page.slice(0, 500) };
}

/** Igual que settings.mjs: solo datos y nada que tenga que fijar el servidor. */
function sanitizeWidget(w) {
  const out = JSON.parse(JSON.stringify(w));
  for (const k of ['endpoint', 'llm', 'auth', 'templates', 'actions', 'identity']) delete out[k];
  return out;
}

/**
 * The ot's unique traits as NFT-style metadata (ERC-721 / Metaplex shape). The face fingerprint is
 * what makes an ot unique (UNIQUE index); the permanent apuchat @handle is its unique name. When
 * minting ships, the token will be these traits: whoever holds it holds the ot.
 */
function traitsMeta(ots, ep) {
  const look = ots.identity?.look || {};
  const ch = look.character || {};
  const handle = ots.settings?.APUCHAT_AGENT_CALLSIGN && ots.settings.APUCHAT_AGENT_FREE !== '1' ? ots.settings.APUCHAT_AGENT_CALLSIGN : null;
  const attr = (trait_type, value) => (value == null || value === '' ? null : { trait_type, value });
  return {
    name: ots.identity?.name || ots.name,
    description: ots.identity?.tagline || ots.identity?.role || '',
    external_url: `${ep}/identity`,
    fingerprint: ots.lookPrint || null,
    handle,
    minted: false,
    attributes: [
      attr('Kind', look.kind),
      attr('Material', look.kind === 'plush' ? look.material : null),
      attr('Body', ch.body?.shape),
      attr('Body color', ch.body?.color),
      attr('Pattern', ch.body?.pattern && ch.body.pattern !== 'none' ? ch.body.pattern : null),
      attr('Finish', ch.finish),
      attr('Eyes', ch.eyes?.type),
      attr('Brows', ch.brows?.type),
      attr('Mouth', ch.mouth?.type),
      attr('Cheeks', ch.cheeks?.type),
      attr('Accessories', Array.isArray(ch.accessories) ? ch.accessories.map((a) => a?.id).filter(Boolean).join(', ') || 'none' : null),
    ].filter(Boolean),
  };
}
