/**
 * Your 7ots.com account on this computer: sign in once, then the pet can list your ots,
 * become another one and bring its settings (identity, look, voice, personality).
 *
 *   login()    device flow (server/platform/device.mjs): POST /api/device/start, open
 *              /app/#device/<code>, you press Connect, we poll for a 7d_ token
 *              (saved as SEVENOTS_TOKEN in ~/.7ots/keys.json, 0600)
 *   me()       { account, ots: [summary] }
 *   pull(id)   { ots, identity }: everything the ot has on 7ots.com
 *   use(id)    makes that ot this computer's pet (~/.7ots/identity.json; the previous one is
 *              kept in identity.prev.json) and points its home at 7ots.com
 *   logout()   revokes the token on 7ots.com and forgets it here
 *   sync()     keeps this pet and its ot on 7ots.com equal (look and mods, personality, character
 *              sheet): whichever side changed since the last sync wins; both → the newer one
 */

import { hostname } from 'node:os';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { env, loadConfig, saveConfig, saveKey } from './config.mjs';
import { homeFile, readJson, writeJson } from './paths.mjs';
import { defineIdentity } from '../../src/identity/schema.js';

export const SEVENOTS_URL = (process.env.SEVENOTS_URL || 'https://7ots.com').replace(/\/+$/, '');

export async function api(path, { token = env().SEVENOTS_TOKEN, method = 'GET', body } = {}) {
  const res = await fetch(`${SEVENOTS_URL}/api/device${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) saveKey('SEVENOTS_TOKEN', ''); // revoked from the dashboard
  if (!res.ok && res.status !== 202) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return { status: res.status, ...data };
}

export const signedIn = () => Boolean(env().SEVENOTS_TOKEN);

/**
 * Starts signing in. Returns { url, done } right away so a UI can show the link; `done`
 * resolves with me() once approved (or rejects: denied / expired).
 */
export async function startLogin({ open } = {}) {
  const { code, url, expiresIn } = await api('/start', { method: 'POST', token: '', body: { name: `7ots pet · ${hostname()}` } });
  open?.(url);
  const done = (async () => {
    const end = Date.now() + expiresIn * 1000;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 2000));
      let r;
      try {
        r = await api('/poll', { method: 'POST', token: '', body: { code } });
      } catch (e) {
        if (e.status === 410) throw e;
        continue; // network hiccup: keep waiting
      }
      if (r.token) {
        saveKey('SEVENOTS_TOKEN', r.token);
        return me();
      }
    }
    throw Object.assign(new Error('expired'), { status: 410 });
  })();
  done.catch(() => {}); // the caller may not await it
  return { url, done };
}

export const me = () => api('/me');

/**
 * apuchat audio through the ot on 7ots.com (POST /api/device/ots/:id/tts): apuchat does not issue voice tokens per
 * account, so a pet without APUCHAT_VOICE_TOKEN speaks with its ot's voice there (the account's monthly free quota).
 * @returns {Promise<{ audio: Buffer, contentType: string }>}  or throws an Error with .status and the server's reason
 */
export async function cloudSpeak(otsId, { text, voiceId, lang }) {
  const res = await fetch(`${SEVENOTS_URL}/api/device/ots/${encodeURIComponent(otsId)}/tts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env().SEVENOTS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId, lang }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) saveKey('SEVENOTS_TOKEN', ''); // revoked from the dashboard
    throw Object.assign(new Error(`7ots.com ${res.status}${data.error ? `: ${data.error}` : ''}`), { status: res.status === 401 ? 401 : res.status === 402 || res.status === 429 ? res.status : 502 });
  }
  return { audio: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'audio/mpeg' };
}
export const pull = (id) => api(`/ots/${encodeURIComponent(id)}`);

export async function use(id) {
  const { ots, identity } = await pull(id);
  const file = homeFile('identity.json');
  if (existsSync(file)) copyFileSync(file, homeFile('identity.prev.json'));
  writeJson(file, defineIdentity(identity));
  const config = loadConfig();
  config.account = { otsId: ots.id, name: ots.identity?.name || ots.name, at: Date.now() };
  // An Orquesta or self-hosted home stays put: only the look and personality come from 7ots.com.
  if (['local', '7ots'].includes(config.home?.kind || 'local')) config.home = { kind: '7ots', url: `${SEVENOTS_URL}/api/o/${ots.id}` };
  saveConfig(config);
  return { ots, identity };
}

export async function logout() {
  if (signedIn()) await api('/token', { method: 'DELETE' }).catch(() => {});
  saveKey('SEVENOTS_TOKEN', '');
  const config = loadConfig();
  delete config.account;
  saveConfig(config);
}

// ── sync: the same ot here and on 7ots.com ──
const SYNCED = ['name', 'role', 'tagline', 'bio', 'language', 'languages'];
const SHEET = ['backstory', 'style', 'quirks', 'scenario', 'greeting', 'examples'];
const MODEL = /^\/mods\/([a-f0-9]{16})\.(glb|vrm)$/;
const hashOf = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** The part of an identity both sides keep equal. */
function syncView(identity) {
  const id = defineIdentity(identity);
  const { tone, traits, sheet } = id.personality;
  return { ...Object.fromEntries(SYNCED.map((k) => [k, id[k]])), personality: { tone, traits, sheet }, look: { character: id.look.character } };
}
/** This pet's side: identity.json + the character sheet (kept in config.character). */
function localView() {
  const raw = readJson(homeFile('identity.json')) || {};
  const ch = loadConfig().character || {};
  return syncView({ ...raw, personality: { ...raw.personality, sheet: Object.fromEntries(SHEET.filter((k) => ch[k]).map((k) => [k, ch[k]])) } });
}
const modelsOf = (view) => (view.look.character.mods || []).map((m) => m.model?.url).filter((u) => MODEL.test(u || ''));
const localMtime = () => Math.max(...['identity.json', 'config.json'].map((f) => (existsSync(homeFile(f)) ? statSync(homeFile(f)).mtimeMs : 0)));

async function pushModels(view) {
  const token = env().SEVENOTS_TOKEN;
  for (const url of modelsOf(view)) {
    const file = homeFile(url.slice(1));
    if (!existsSync(file)) continue;
    const head = await fetch(`${SEVENOTS_URL}${url}`, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (head?.ok) continue;
    const [, , ext] = MODEL.exec(url);
    const r = await fetch(`${SEVENOTS_URL}/api/device/ots/${encodeURIComponent(loadConfig().account.otsId)}/files?ext=${ext}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: readFileSync(file), signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`model upload: HTTP ${r.status}`);
  }
}
async function pullModels(view) {
  for (const url of modelsOf(view)) {
    const file = homeFile(url.slice(1));
    if (existsSync(file)) continue;
    const r = await fetch(`${SEVENOTS_URL}${url}`, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    // content-addressed: only keep it if it is what its name says
    if (buf.toString('latin1', 0, 4) !== 'glTF' || createHash('sha256').update(buf).digest('hex').slice(0, 16) !== MODEL.exec(url)[1]) continue;
    mkdirSync(homeFile('mods'), { recursive: true });
    writeFileSync(file, buf);
  }
}

/** @returns {Promise<{action: 'off'|'same'|'push'|'pull'}>} */
export async function sync() {
  const otsId = loadConfig().account?.otsId;
  if (!signedIn() || !otsId) return { action: 'off' };
  let state = readJson(homeFile('sync.json')) || {};
  if (state.otsId !== otsId) state = { otsId };
  const remote = await pull(otsId);
  const cloud = syncView(remote.identity);
  const local = localView();
  const hc = hashOf(cloud);
  const hl = hashOf(local);
  const done = (action, extra = {}) => (writeJson(homeFile('sync.json'), { ...state, at: Date.now(), ...extra }), { action });
  if (hc === hl) return done('same', { local: hl, cloud: hc });
  const localChanged = hl !== state.local;
  const cloudChanged = hc !== state.cloud;
  if (!localChanged && !cloudChanged) return done('same'); // they differ only in how each side writes it
  const push = localChanged && cloudChanged ? localMtime() > (remote.updatedAt || 0) : localChanged;
  if (push) {
    await pushModels(local);
    const r = await api(`/ots/${encodeURIComponent(otsId)}/identity`, { method: 'PUT', body: { identity: local } });
    return done('push', { local: hl, cloud: hashOf(syncView(r.identity)) });
  }
  await pullModels(cloud);
  const file = homeFile('identity.json');
  const raw = readJson(file) || {};
  const { sheet = {}, ...personality } = cloud.personality;
  writeJson(file, { ...raw, ...Object.fromEntries(SYNCED.map((k) => [k, cloud[k]])), personality: { ...raw.personality, ...personality }, look: { ...raw.look, character: cloud.look.character } });
  const config = loadConfig();
  config.character = { ...config.character, ...Object.fromEntries(SHEET.map((k) => [k, sheet[k] || ''])) };
  saveConfig(config);
  return done('pull', { local: hashOf(localView()), cloud: hc });
}

// ── community mods (server/platform/mods.mjs) ──
const MAX_SHARE = 20 * 1024 * 1024;

/** Downloads a mod's /mods/<hash> models into ~/.7ots/mods (checked against their hash). */
async function fetchModels(mod) {
  const urls = [mod.model?.url].filter((u) => MODEL.test(u || ''));
  for (const url of urls) {
    const file = homeFile(url.slice(1));
    if (existsSync(file)) continue;
    const r = await fetch(`${SEVENOTS_URL}${url}`, { signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw Object.assign(new Error(`model: HTTP ${r.status}`), { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.toString('latin1', 0, 4) !== 'glTF' || createHash('sha256').update(buf).digest('hex').slice(0, 16) !== MODEL.exec(url)[1]) throw Object.assign(new Error('model: bad file'), { status: 502 });
    mkdirSync(homeFile('mods'), { recursive: true });
    writeFileSync(file, buf);
  }
}

/** A data: glb (≤ 1.5 MB, inline in the mod) becomes a /mods/<hash> file here, so it can be shared as one. */
function inlineToFile(url) {
  const m = /^data:model\/gltf-binary;base64,(.+)$/.exec(url || '');
  if (!m) return url;
  const buf = Buffer.from(m[1], 'base64');
  const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 16)}.glb`;
  mkdirSync(homeFile('mods'), { recursive: true });
  if (!existsSync(homeFile(`mods/${name}`))) writeFileSync(homeFile(`mods/${name}`), buf);
  return `/mods/${name}`;
}

export const community = {
  async list({ sort = 'top', q = '' } = {}) {
    const qs = `?sort=${encodeURIComponent(sort)}&q=${encodeURIComponent(q)}`;
    if (signedIn()) return api(`/mods${qs}`);
    const r = await fetch(`${SEVENOTS_URL}/api/mods${qs}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return r.json();
  },
  mine: () => api('/mods/mine'),
  /** Counts the install (signed in), downloads its models and returns the mod to wear. */
  async install(id) {
    const { mod } = signedIn()
      ? await api(`/mods/${encodeURIComponent(id)}/install`, { method: 'POST', body: {} })
      : await (await fetch(`${SEVENOTS_URL}/api/mods/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) })).json();
    if (!mod?.mod) throw Object.assign(new Error('not found'), { status: 404 });
    await fetchModels(mod.mod);
    return mod.mod;
  },
  rate: (id, stars) => api(`/mods/${encodeURIComponent(id)}/rate`, { method: 'POST', body: { stars } }),
  report: (id, reason) => api(`/mods/${encodeURIComponent(id)}/report`, { method: 'POST', body: { reason } }),
  remove: (id) => api(`/mods/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Publishes a mod of this pet: first its models (as /mods/<hash> files on 7ots.com), then the mod. */
  async share(mod) {
    const out = { ...mod, ...(mod.model ? { model: { ...mod.model, url: inlineToFile(mod.model.url) } } : {}) };
    const token = env().SEVENOTS_TOKEN;
    for (const url of [out.model?.url].filter((u) => MODEL.test(u || ''))) {
      const head = await fetch(`${SEVENOTS_URL}${url}`, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (head?.ok) continue;
      const file = homeFile(url.slice(1));
      if (!existsSync(file)) throw Object.assign(new Error('model missing here'), { status: 404 });
      if (statSync(file).size > MAX_SHARE) throw Object.assign(new Error('max 20 MB'), { status: 413 });
      const r = await fetch(`${SEVENOTS_URL}/api/device/mods/files?ext=${MODEL.exec(url)[2]}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: readFileSync(file), signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw Object.assign(new Error(`model upload: HTTP ${r.status}`), { status: r.status });
    }
    return api('/mods', { method: 'POST', body: { mod: out } });
  },
};
