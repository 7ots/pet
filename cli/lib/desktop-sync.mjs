/**
 * What the desktop pet keeps of its ot, the same on every computer signed in to 7ots.com
 * (GET/PUT /api/device/ots/:id/desktop, server/platform/device.mjs). account.mjs sync() covers the
 * identity (look, mods, personality); this covers the rest:
 *
 *   settings    config.json: brain, voice, pet, access, screen, memory, integrations
 *               (not home/account/lang/character: those are this computer's or the identity's)
 *   progress    the tamagotchi's born, xp and stats (food/energy/fun stay per computer: they decay anyway)
 *   notes       memory.json · reminders.json · watchers.json
 *
 * Three-way merge against the last state both sides agreed on (~/.7ots/sync-desktop.json), so what one
 * computer deleted (a fired reminder, a forgotten note) does not come back from the other:
 *   settings, per key: the side that changed wins; both → the newer one. A computer that never synced
 *             takes what 7ots.com has (a new install should not wipe your settings with its defaults),
 *             unless 7ots.com only has the default and this computer changed it.
 *   lists:    union by id, minus what either side removed since the base.
 *   progress: each side's gains since the base add up; born is the oldest.
 * Keys (keys.json) never leave the computer.
 */

import { existsSync, statSync } from 'node:fs';
import { api, signedIn } from './account.mjs';
import { CONFIG_DEFAULTS, loadConfig, saveConfig } from './config.mjs';
import { homeFile, readJson, writeJson } from './paths.mjs';
import { xpForLevel } from './pet-core.mjs';

const SETTINGS = ['brain', 'voice', 'pet', 'access', 'screen', 'memory', 'integrations'];
const STATS = ['ok', 'fail', 'turns'];
const MAX_NOTES = 200;
const LISTS = {
  notes: { file: 'memory.json', key: (n) => `${n.at}|${n.text}`, order: (n) => n.at || 0, keep: (n) => n && typeof n.text === 'string' },
  reminders: { file: 'reminders.json', key: (r) => r.id, order: (r) => r.at || 0, keep: (r) => r?.id && !r.done },
  watchers: { file: 'watchers.json', key: (w) => w.id, order: (w) => w.created || 0, keep: (w) => w?.id && !w.done },
};

// equal regardless of key order (each computer's config.json writes its keys in its own order)
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
const mtime = (f) => (existsSync(homeFile(f)) ? statSync(homeFile(f)).mtimeMs : 0);

/** xp as one number (level 3 with 10 xp = everything it took to get there + 10). */
export function totalXp({ level = 1, xp = 0 } = {}) {
  let t = Math.max(0, Number(xp) || 0);
  for (let l = 1; l < level; l++) t += xpForLevel(l);
  return t;
}
export function levelOf(total) {
  let level = 1;
  let xp = Math.max(0, Math.round(total));
  while (xp >= xpForLevel(level)) xp -= xpForLevel(level++);
  return { level, xp };
}

/** This computer's side. `pet` is the live tamagotchi object when the pet is running. */
export function localState(pet = readJson(homeFile('pet.json')) || {}) {
  const config = loadConfig();
  const lists = Object.fromEntries(Object.entries(LISTS).map(([k, l]) => [k, (readJson(homeFile(l.file), []) || []).filter(l.keep)]));
  return {
    settings: Object.fromEntries(SETTINGS.map((k) => [k, config[k]])),
    progress: { born: pet.born || Date.now(), xp: totalXp(pet), stats: Object.fromEntries(STATS.map((k) => [k, Number(pet.stats?.[k]) || 0])) },
    ...lists,
  };
}

function mergeList(name, base, local, remote) {
  const { key, order } = LISTS[name];
  if (!remote) return local;
  const inB = new Set((base || []).map(key));
  const inL = new Set(local.map(key));
  const inR = new Set(remote.map(key));
  const out = new Map();
  for (const x of [...local, ...remote]) {
    const k = key(x);
    if (out.has(k)) continue; // the local copy came first
    if (base && inB.has(k) && (!inL.has(k) || !inR.has(k))) continue; // removed on one side
    out.set(k, x);
  }
  const list = [...out.values()].sort((a, b) => order(a) - order(b));
  return name === 'notes' ? list.slice(-MAX_NOTES) : list;
}

function mergeProgress(base, local, remote) {
  if (!remote) return local;
  const born = Math.min(...[base?.born, local.born, remote.born].filter(Boolean));
  // no base: this computer never synced; its counts may overlap the cloud's, so the larger wins
  const add = (b, l, r) => (b == null ? Math.max(l, r) : Math.max(0, b + (l - b) + (r - b)));
  return { born, xp: add(base?.xp, local.xp, remote.xp), stats: Object.fromEntries(STATS.map((k) => [k, add(base?.stats?.[k], local.stats[k], remote.stats?.[k] || 0)])) };
}

/** @returns the merged state, with when each setting last changed (settingsAt) */
export function merge(base, local, remote, localAt = Date.now()) {
  const settings = {};
  const settingsAt = {};
  for (const k of SETTINGS) {
    const l = local.settings[k];
    const r = remote?.settings?.[k];
    const b = base?.settings?.[k];
    const rAt = remote?.settingsAt?.[k] || 0;
    let useLocal;
    if (r === undefined) useLocal = true;
    // first sync here: what 7ots.com has wins (your settings from another computer), unless only this side was customized
    else if (!base) useLocal = same(r, CONFIG_DEFAULTS[k]) && !same(l, CONFIG_DEFAULTS[k]);
    else {
      const lc = !same(l, b);
      const rc = !same(r, b);
      useLocal = lc && rc ? localAt > rAt : lc;
    }
    settings[k] = useLocal ? l : r;
    settingsAt[k] = useLocal ? (base && same(l, b) ? base.settingsAt?.[k] || rAt : localAt) : rAt;
  }
  return {
    v: 1,
    settings,
    settingsAt,
    progress: mergeProgress(base?.progress, local.progress, remote?.progress),
    ...Object.fromEntries(Object.keys(LISTS).map((k) => [k, mergeList(k, base?.[k], local[k], remote?.[k])])),
  };
}

/** Writes what changed here. @returns the sections it wrote */
function apply(next, local, pet) {
  const wrote = [];
  if (!same(next.settings, local.settings)) {
    saveConfig({ ...loadConfig(), ...next.settings });
    wrote.push('settings');
  }
  if (!same(next.progress, local.progress)) {
    const p = pet || readJson(homeFile('pet.json')) || {};
    Object.assign(p, levelOf(next.progress.xp), { born: next.progress.born, stats: { ...p.stats, ...next.progress.stats } });
    if (!pet) writeJson(homeFile('pet.json'), p);
    wrote.push('progress');
  }
  for (const [k, l] of Object.entries(LISTS)) {
    if (same(next[k], local[k])) continue;
    writeJson(homeFile(l.file), next[k]);
    wrote.push(k);
  }
  return wrote;
}

/**
 * One round. `pet`: the running pet's tamagotchi (it saves it itself, so progress goes there, not to the file).
 * @returns {Promise<{action: 'off'|'same'|'push'|'pull', wrote?: string[]}>} pull = something changed here
 */
export async function syncDesktop({ pet } = {}) {
  const otsId = loadConfig().account?.otsId;
  if (!signedIn() || !otsId) return { action: 'off' };
  const file = homeFile('sync-desktop.json');
  const saved = readJson(file) || {};
  const base = saved.otsId === otsId ? saved.state : null;
  const local = localState(pet);
  const localAt = Math.max(mtime('config.json'), 1);
  const path = `/ots/${encodeURIComponent(otsId)}/desktop`;
  let { state: remote, rev } = await api(path);
  let next;
  let pushed = false;
  for (let tries = 0; ; tries++) {
    next = merge(base, local, remote, localAt);
    if (same(next, remote)) break;
    try {
      ({ rev } = await api(path, { method: 'PUT', body: { state: next, rev } }));
      pushed = true;
      break;
    } catch (e) {
      if (e.status !== 409 || tries >= 2) throw e;
      ({ state: remote, rev } = e.data); // another computer wrote meanwhile: merge with that
    }
  }
  const wrote = apply(next, local, pet);
  writeJson(file, { otsId, rev, at: Date.now(), state: next });
  return { action: wrote.length ? 'pull' : pushed ? 'push' : 'same', wrote };
}
