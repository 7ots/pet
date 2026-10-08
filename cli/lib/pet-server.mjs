/**
 * The pet daemon on http://127.0.0.1:7717 (SEVENOTS_PET_PORT).
 *
 *   GET  /health                       { ok, name }               (no token)
 *   GET  /pet?token=…[&desktop=1]      the pet page (browser and desktop modes)
 *   GET  /dist/7ots.esm.js             the 7ots bundle (createCharacter)
 *   GET  /state?token=…                identity + state
 *   GET  /events?token=…               SSE: { state, say?, gesture?, effect?, morph?, activity? }
 *   POST /event   X-7ots-Token         { type: tool|shell|prompt|stop|notify|start|feed|play|sleep|wake|say, … }
 *   POST /tts     X-7ots-Token         { text } → audio with the configured voice
 *   POST /ask     X-7ots-Token         { text } → { reply, actions }   reminders, notes, open a site (assistant.mjs)
 *   POST /stt     X-7ots-Token         raw audio (webm/ogg) → { text }   voice control (stt.mjs)
 *   POST /log     X-7ots-Token         { page, msg } → pet.log «audio[page]: msg» (what each page did with its audio)
 *   GET  /reminders?token=…            { reminders, notes }
 *   GET  /inferences?token=…           the brain's history: what was sent (the data it used) and what came back
 *   GET  /memory?token=…               everything it keeps about you: notes, what it saw, what it said, its state
 *   GET  /account                      7ots.com account: signed in?, its ots · POST /account/login|use|logout
 *   POST /screen/look                  look at the screen now (access.screen) · POST /seen/forget
 *   POST /reminders/cancel             { id }
 *   GET  /processes                    what the pet is running (reminders, watchers, screen) + the computer's (access.processes)
 *   POST /watchers/cancel              { id | 'all' }
 *   GET  /cloud                        7ots.com link + the cloud assistant's VM status (integrations.mjs)
 *   POST /integrations/test            { integration } → { ok, tools? (MCP), text?, error? } (a draft, not saved)
 *   GET  /byte · /byte/games · /byte/status · POST /byte/play { game } · /byte/stop · /byte/connect   the twin ot plays byte arena (7ots.com)
 *   GET  /wallet                       the twin ot's wallet on 7ots.com (read only): addresses, balances, payments + tx links
 *   GET  /orquesta/projects · POST /orquesta/send { projectId, text } · GET /orquesta/prompt?id=   your Orquesta agents
 *   POST /character/letta              write the character sheet into a Letta agent's persona (LETTA_API_KEY)
 *   GET  /settings?token=…             the settings page: brain, what it may see and do, notes, reminders
 *   GET  /config?token=…               { config: { brain, pet, access }, clis, keys: { NAME: bool }, … }
 *   POST /config                       { brain?, pet?, access?, keys? } → saved to ~/.7ots and applied live
 *   POST /config/test                  one line from the current brain → { ok, text, ms }
 *   POST /notes/forget                 { at | 'all' }
 *   POST /conversation/forget          drop the conversation memory (turns + summary)
 *   POST /quit    X-7ots-Token
 *   POST /dance   X-7ots-Token         { name?, ms?, music? } → dances (DANCES in motion.js) with music (beat.js or ~/.7ots/music) — { aura: true } elige un farmeo de aura
 *   POST /entrance X-7ots-Token        { dance? } → a wrestling-style entrance: walks in, spotlights, pyro, its name, a dance
 *   GET  /music?token=…                { files } your own tracks in ~/.7ots/music · GET /music/<file>?token=… plays one
 *   GET  /senses?token=…[&preview=1]   the camera page (face + gestures → labels; the desktop shell runs it hidden)
 *   GET  /senses/status · /senses/config   what it notices now, rules, gestures, today · what the camera page needs
 *   GET  /senses/vendor/<file>         MediaPipe code and models (no token; downloaded by POST /senses/vendor)
 *   POST /senses                       { events: [{ kind: state|presence|gesture|status, … }] } from the camera page
 *   POST /senses/rules { action: add|set|remove|accept|reject|on|off, id?, rule? } · /senses/gestures { map, commands }
 *   POST /senses/baseline { baseline|null } · /senses/pause { min | resume } · /senses/forget · /senses/reflect
 *   POST /senses/snap { id, image }    one camera frame the daemon asked for ({senses:{snap:id}} on /events) when you
 *                                      ask it to look at you; seen by the vision brain, shown as a thumbnail, never stored
 *
 * Only listens on 127.0.0.1 and only answers to Host 127.0.0.1/localhost (no DNS rebinding).
 * The token lives in ~/.7ots/pet.token (0600): other users of the machine can't drive the pet.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, chmodSync, mkdirSync, rmSync, symlinkSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { cardShot } from './card-shot.mjs';
import { join } from 'node:path';
import { createAssistant, notify, tr } from './assistant.mjs';
import { createWatchers, processes, processSummary } from './watchers.mjs';
import { createInferenceLog, otherInferences } from './inferences.mjs';

const MAX_INF = 300;
import { AI_CLIS, createBrain, detectClis, petSystem } from './brain.mjs';
import { CONFIG_DEFAULTS, env, loadConfig, saveConfig, saveKey } from './config.mjs';
import { loadIdentity } from './identity.mjs';
import { readJson, writeJson } from './paths.mjs';
import { sttProvider, transcribe } from './stt.mjs';
import { localVoices, synthesizeLocal, warmLocal } from './tts-local.mjs';
import { createScreenWatcher } from './screen.mjs';
import { createSiteContext } from './prowl.mjs';
import { createSenses } from './senses/index.mjs';
import { ensureVendor, vendorFile, vendorStatus } from './senses/vendor.mjs';
import { SEVENOTS_URL, cloudSpeak, community, sync as syncOt, logout as accountLogout, me as accountMe, pull as pullOt, signedIn, startLogin, use as useOt } from './account.mjs';
import { openUrl } from './open.mjs';
import { syncDesktop } from './desktop-sync.mjs';
import { VM_KINDS } from './vm.mjs';
import { cloudByte, cloudStatus, cloudWallet, createExtras, lettaSync, normalizeCharacter, normalizeIntegrations, redact, testCustom } from './integrations.mjs';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { line } from './lines.mjs';
import { defineIdentity, GROK_VOICES, OPENAI_VOICES, TTS_MODELS } from '../../src/identity/schema.js';
import { normalizeMod, normalizeMods, MAX_MODS } from '../../src/character/mods.js';
import { MOD_CATALOG } from '../../src/character/mods/index.js';
import { DANCES, AURA_MOVES } from '../../src/character/motion.js';
import { stripSpeechTags } from '../../src/voice/tags.js';

/** Mods importados en este pet (~/.7ots/mods/library.json), normalizados. */
// scenes between ots on the same desktop (pet/electron/director.cjs plays them)
const SCENE_NAMES = ['rocky', 'sf', 'dbz', 'matrix', 'duel', 'sw', 'fight', 'twist'];
const SCENE_EVERY = ['rare', 'normal', 'often'];
// dances and their music (pet.html plays them; music: synthesized, your own files in ~/.7ots/music, or none)
const MUSIC_MODES = ['synth', 'files', 'off'];
const ENTRANCE_KINDS = ['wwe', 'rock', 'magic'];
const MUSIC_TYPES = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm' };
const MUSIC_FILE = /^[^/\\\0]{1,160}\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|webm)$/i;
function musicFiles() {
  try {
    return readdirSync(homeFile('music')).filter((f) => MUSIC_FILE.test(f) && !f.startsWith('.') && statSync(homeFile(`music/${f}`)).isFile()).sort();
  } catch {
    return [];
  }
}
const modLibrary = () => (readJson(homeFile('mods/library.json')) || []).map(normalizeMod).filter(Boolean);
import { ensureHome, homeFile, PET_PORT, PKG_ROOT } from './paths.mjs';
import { applyEvent, loadPet, need, savePet, tick, view } from './pet-core.mjs';

export function petToken() {
  ensureHome();
  const f = homeFile('pet.token');
  if (existsSync(f)) {
    const t = readFileSync(f, 'utf8').trim();
    if (t.length >= 32) return t;
  }
  const t = randomBytes(24).toString('hex');
  writeFileSync(f, t + '\n', { mode: 0o600 });
  chmodSync(f, 0o600);
  return t;
}

/** Is a daemon already running? */
export async function petAlive(port = PET_PORT) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Sends an event to the daemon; false if it isn't running. */
export async function postPet(path, body, port = PET_PORT) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-7ots-Token': petToken() },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(1500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const VOICE_PROVIDERS = ['elevenlabs', 'openai', 'apuchat', 'grok', 'fish'];
const SETTABLE_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ORQUESTA_TOKEN', 'ELEVENLABS_API_KEY', 'APUCHAT_VOICE_TOKEN', 'XAI_API_KEY', 'FISH_API_KEY', 'LETTA_API_KEY', 'APUMAIL_TOKEN', 'SENSES_ICS_URL'];
// The settings page speaks the human's language: SEVENOTS_LANG, config.lang, the system's, then the ot's.
const uiLangOf = (c, fallback) => [process.env.SEVENOTS_LANG, c.lang, String(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').slice(0, 2).toLowerCase(), fallback].find((l) => ['en', 'es', 'pt'].includes(l)) || 'en';
const brainLabel = (b = {}) => (b.kind === 'cli' ? `${b.cli}${b.model ? ` · ${b.model}` : ''}` : b.kind === 'api' ? `${b.provider || 'api'}${b.model ? ` · ${b.model}` : ''}` : b.kind || 'lines');

const GAP = { 0: Infinity, 1: 10 * 60_000, 2: 90_000, 3: 20_000 }; // minimum silence between spontaneous lines
// "important" ones (agent finished / waiting / a new session) obey the annoyance level too: 0 = never a word on its own
const IMPORTANT_GAP = { 0: Infinity, 1: 5 * 60_000, 2: 60_000, 3: 15_000 };
const HELLO_GAP = 30 * 60_000; // every new agent session says "start": one hello per half hour is plenty
const CHAT_QUIET = 90_000; // while you talk to it, no small talk on top of the conversation
const CHATTY = { 0: 0, 1: 0.02, 2: 0.12, 3: 0.35 }; // chance to comment a routine event (tool, ok, prompt)
const IDLE = { 0: Infinity, 1: 60 * 60_000, 2: 20 * 60_000, 3: 5 * 60_000 }; // idle chatter every…

export function startPetServer({ port = PET_PORT, log = () => {} } = {}) {
  const token = petToken();
  let config = loadConfig();
  let scenePlay = null; // { scene, at }: asked from settings, taken by the director on its next poll
  const sceneConf = (c = config) => ({ on: true, every: 'normal', list: SCENE_NAMES, ...c.pet?.scenes });
  // a dance to play: its name (or one at random), how long and the music under it, per the pet's music setting
  const musicFor = (d = {}) => {
    const pool = d.aura ? AURA_MOVES : DANCES; // { aura: true } = farmeo de aura
    const name = DANCES.includes(d.name) ? d.name : pool[Math.floor(Math.random() * pool.length)];
    const ms = Math.max(1500, Math.min(60000, Number(d.ms) || 8000));
    const mode = d.music === false ? 'off' : config.pet.music || 'synth';
    const vol = Math.max(0, Math.min(1, Number(config.pet.musicVol ?? 0.5)));
    const files = mode === 'files' ? musicFiles() : [];
    const file = typeof d.file === 'string' && files.includes(d.file) ? d.file : files[Math.floor(Math.random() * files.length)];
    const music = mode === 'off' ? null : file ? { file, vol } : { style: typeof d.style === 'string' ? d.style : '', vol };
    return { name, ms, music };
  };
  const annoyOf = (c) => Math.max(0, Math.min(3, Number(c.pet.annoy ?? 2)));
  let annoy = annoyOf(config);
  const { identity } = loadIdentity();
  if (!identity) throw Object.assign(new Error('no identity'), { code: 'NO_IDENTITY' });
  const lang = identity.language || 'en';
  /** The voice for a provider: what its settings card saved, else the identity's (only if it is that provider's). */
  const voiceFor = (kind) => {
    const iv = identity.voice || {};
    const own = config.voice.providers?.[kind] || {};
    // the identity's voice id/model belong to its own provider: not sent to another (an ElevenLabs id means nothing to Fish)
    return { ...iv, ...(iv.provider === kind ? {} : { voiceId: '', model: '' }), provider: kind, ...(config.voice.voiceId ? { voiceId: config.voice.voiceId } : {}), ...own };
  };
  let brainImpl = createBrain(config.brain, config.home); // swapped live from the settings page
  const inferences = createInferenceLog();
  /**
   * Text → audio with a provider. apuchat without a token of its own: through the ot on 7ots.com when this computer is
   * signed in (apuchat has no per-account voice tokens; that was the 401 testers hit pasting other keys).
   */
  const voiceAudio = async (kind, text, voice) => {
    const keys = env();
    if (kind === 'apuchat' && !keys.APUCHAT_VOICE_TOKEN && keys.SEVENOTS_TOKEN && config.account?.otsId) {
      return cloudSpeak(config.account.otsId, { text: stripSpeechTags(text), voiceId: voice.voiceId || '', lang: voice.lang || '' });
    }
    const { synthesize } = await import('../../server/tts.mjs');
    // process.env too: XAI_TTS_VOICE, FISH_VOICE_ID, APUCHAT_VOICE_URL… (the keys still come from env())
    return synthesize({ text, voice, env: { ...process.env, ...keys } });
  };
  if (config.voice.kind === 'local') warmLocal();
  const brain = inferences.wrap(() => brainImpl, () => brainLabel(config.brain)); // every call lands in the history
  const pet = tick(loadPet());
  const clients = new Set();
  const history = []; // last lines (so the AI doesn't repeat itself)
  const activity = []; // what happened lately, for the window's feed
  let thinking = false;
  let lastSpoke = 0;
  let lastHello = 0;
  let chatUntil = 0;
  let lastIdle = Date.now();
  let viewSet = null; // 2D/3D changed in the settings since start: pages that (re)connect pick it up too

  const broadcast = (msg) => {
    const data = `data: ${JSON.stringify({ state: view(pet), ...msg })}\n\n`;
    if (msg.say) log(`audio: say → ${clients.size} page(s) «${String(msg.say).slice(0, 60)}»${msg.ambient ? ' (ambient)' : ''}`); // to debug a voice heard twice
    for (const res of clients) res.write(data);
  };

  // Approve / Reject in its bubble before acting for you (Orquesta…). Unanswered in 2 min = rejected.
  const asks = new Map(); // id → { text, done }
  function confirm(text, ms = 120_000) {
    const id = randomBytes(6).toString('hex');
    return new Promise((resolve) => {
      const done = (ok) => {
        if (!asks.delete(id)) return;
        clearTimeout(timer);
        log(`approval ${ok ? 'yes' : 'no'}: ${text.slice(0, 80)}`);
        broadcast({ ask: { id, done: true }, thinking: ok });
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), ms);
      asks.set(id, { text, done });
      lastSpoke = Date.now();
      if (config.access.notify !== false) notify(`${identity.name} · 7ots`, text);
      broadcast({ ask: { id, text }, thinking: false, gesture: 'think', point: 'user', stir: true });
    });
  }
  // Orquesta sign-in in the browser; once in, its integration is on
  let connecting = null;
  function connectOrquesta() {
    return (connecting ||= import('./orquesta.mjs')
      .then(async (o) => {
        if (o.via() !== '7ots') return o.login({ open: openUrl });
        // signed in to 7ots.com: connect it there (once for the ot everywhere); its token stays there
        openUrl(`${SEVENOTS_URL}/app/#ots/${config.account.otsId}/orquesta`);
        for (const end = Date.now() + 10 * 60_000; Date.now() < end; ) {
          await new Promise((r) => setTimeout(r, 4000));
          if ((await o.cloudOrquesta().catch(() => null))?.connected) return { organizationName: '' };
        }
        throw new Error('not connected on 7ots.com in time');
      })
      .then((r) => {
        const next = loadConfig();
        next.integrations = { ...next.integrations, orquesta: { ...next.integrations?.orquesta, on: true } };
        saveConfig(next);
        config = loadConfig();
        log(`orquesta: connected${r.organizationName ? ` (${r.organizationName})` : ''}`);
        broadcast({ orquesta: true });
        return r;
      })
      .finally(() => (connecting = null)));
  }

  async function speak(kind, vars = {}, situation = '', { force = false, gesture = null } = {}) {
    const now = Date.now();
    const quiet = now < chatUntil || (!force && senses?.quiet()) || (kind === 'hello' && now - lastHello < HELLO_GAP) || (force ? now - lastSpoke < IMPORTANT_GAP[annoy] : pet.asleep || now - lastSpoke < GAP[annoy]);
    if (quiet) {
      broadcast({ gesture });
      return;
    }
    lastSpoke = now;
    if (kind === 'hello') lastHello = now;
    let text = '';
    if (brain.kind !== 'lines' && situation && !thinking) {
      thinking = true;
      broadcast({ thinking: true, gesture });
      try {
        text = await brain.think({
          purpose: kind,
          system: petSystem(identity, { lang }),
          messages: [{ role: 'user', content: `${situation}${history.length ? `\n(Things you already said: ${history.join(' | ')})` : ''}` }],
          timeoutMs: 30000,
        });
      } catch (e) {
        log(`brain: ${e.message}`);
      }
      thinking = false;
    }
    if (!text) text = line(kind, lang, { name: identity.name, level: pet.level, ...vars });
    if (!text) return;
    history.push(text);
    if (history.length > 6) history.shift();
    pet.lastTalk = now;
    if (Date.now() < chatUntil) return broadcast({ thinking: false }); // you started talking to it while it thought
    broadcast({ say: text, gesture, thinking: false, ambient: true });
  }

  const SITUATION = {
    tool: (e) => `Your human's coding agent just used the tool ${e.tool || '?'}${e.detail ? ` (${e.detail})` : ''}.`,
    toolFail: (e) => `Your human's coding agent tried the tool ${e.tool || '?'} and it FAILED${e.detail ? `: ${e.detail}` : ''}.`,
    ok: (e) => `In the terminal, ${e.cmd ? `the command \`${e.cmd}\`` : 'a command'} just succeeded.`,
    fail: (e) => `In the terminal, ${e.cmd ? `the command \`${e.cmd}\`` : 'a command'} just failed with exit code ${e.code}.`,
    prompt: (e) => `Your human just asked their coding agent${e.text ? `: "${String(e.text).slice(0, 300)}"` : ' something'}.`,
    stop: () => `Your human's coding agent just finished its turn. Encourage them to check the result.`,
    waiting: (e) => `Your human's coding agent is waiting for them (permission or an answer)${e.message ? `: ${e.message}` : ''}. Get their attention.`,
    hello: () => `You just woke up on your human's desktop. Say hi.`,
    levelUp: () => `You just reached level ${pet.level}. Celebrate.`,
    fed: () => `Your human just fed you.`,
    played: () => `Your human just played with you.`,
    slept: () => `You are going to sleep now.`,
    woke: () => `You just woke up.`,
    hungry: () => `You are hungry (food ${Math.round(pet.food)}/100). Ask for food; the command is "7ots feed".`,
    bored: () => `You are bored (fun ${Math.round(pet.fun)}/100). Ask to play; the command is "7ots play".`,
    sleepy: () => `You are very tired. Ask for a nap; the command is "7ots sleep".`,
    idle: () => `Nothing happened for a while.${watcher?.now() && Date.now() - watcher.now().at < 30 * 60_000 ? ` (On their screen lately: ${watcher.now().doing})` : ''} Say something in character about keeping them company, their work or their wellbeing.`,
  };

  /** Event → one feed row: { kind, ok, text, at }. Care actions and `say` are not activity. */
  function track(ev) {
    const text = {
      tool: () => `${ev.tool || 'tool'}${ev.detail ? ` · ${ev.detail}` : ''}`,
      shell: () => ev.cmd || `exit ${ev.code}`,
      prompt: () => ev.text || '',
      stop: () => ev.detail || '',
      notify: () => ev.message || '',
      start: () => '',
    }[ev.type];
    if (!text || (ev.type === 'shell' && Number(ev.code) === 130)) return null;
    const row = { kind: ev.type, ok: ev.type === 'tool' ? ev.ok !== false : ev.type === 'shell' ? Number(ev.code) === 0 : true, text: String(text()).slice(0, 140), at: Date.now() };
    activity.push(row);
    if (activity.length > 30) activity.shift();
    return row;
  }

  function onEvent(ev) {
    const act = track(ev);
    if (act) broadcast({ activity: act });
    const r = applyEvent(pet, ev);
    // asleep it sleeps: the agent's events (finished, waiting, failures) don't move it or make it talk
    if (pet.asleep && ev.type !== 'sleep') return broadcast({});
    // Something in the agent's terminal needs you: walk over there and point at it.
    if (ev.type === 'stop' || ev.type === 'notify' || (ev.type === 'shell' && ![0, 130].includes(Number(ev.code)))) broadcast({ point: 'agent' });
    if (r.effect || r.morph) broadcast({ effect: r.effect, morph: r.morph });
    if (ev.type === 'say' && ev.text) {
      lastSpoke = Date.now();
      broadcast({ say: String(ev.text).slice(0, 300), gesture: 'wave' });
      return;
    }
    const kind = r.line;
    if (!kind) return broadcast({ gesture: r.gesture });
    const routine = !r.important && !['fail', 'toolFail'].includes(kind);
    if (routine && Math.random() >= CHATTY[annoy]) return broadcast({ gesture: r.gesture });
    // access.agent off: the brain hears that something happened, not what (no prompts, commands or details).
    const seen = config.access.agent ? ev : { type: ev.type, tool: ev.tool, ok: ev.ok, code: ev.code };
    const sit = SITUATION[kind]?.(seen) || '';
    speak(kind, { cmd: ev.cmd || '', tool: ev.tool || '' }, sit, { force: r.important && ev.type !== 'tool', gesture: r.gesture });
  }

  // Needs and idle chatter, once a minute.
  const timer = setInterval(() => {
    tick(pet);
    savePet(pet);
    const n = need(pet);
    const now = Date.now();
    if (n && now - pet.lastTalk > Math.max(GAP[annoy], 5 * 60_000)) speak(n, {}, SITUATION[n]());
    else if (now - lastIdle > IDLE[annoy] && now - pet.lastTalk > IDLE[annoy] / 2) {
      lastIdle = now;
      speak('idle', {}, SITUATION.idle());
    }
    broadcast({});
  }, 60_000);

  // Sync with its ot on 7ots.com (account.mjs sync): same look, mods, personality and sheet on both sides,
  // and (desktop-sync.mjs) its settings, tamagotchi progress, notes, reminders and watchers.
  let syncing = false;
  let syncSoon = null;
  let syncErr = '';
  async function cloudSync() {
    if (syncing) return;
    syncing = true;
    try {
      const r = await syncOt();
      // the rest of what this pet keeps (settings, progress, notes, reminders, watchers): desktop-sync.mjs
      const d = await syncDesktop({ pet });
      syncErr = '';
      if (r.action === 'push' || r.action === 'pull') log(`sync: ${r.action} 7ots.com`);
      if (d.action === 'push' || d.action === 'pull') log(`sync: desktop ${d.action} 7ots.com${d.wrote?.length ? ` (${d.wrote.join(', ')})` : ''}`);
      if (d.wrote?.includes('progress')) savePet(pet);
      // its new look/personality, settings or lists, everywhere (progress alone is already live)
      if (r.action === 'pull' || d.wrote?.some((k) => k !== 'progress')) restart();
      else if (d.wrote?.length) broadcast({});
    } catch (e) {
      if (e.message !== syncErr) log(`sync: ${(syncErr = e.message)}`);
    } finally {
      syncing = false;
    }
  }
  const syncTimer = setInterval(cloudSync, 60_000);
  const syncFirst = setTimeout(cloudSync, 8000);
  const syncLater = () => (clearTimeout(syncSoon), (syncSoon = setTimeout(cloudSync, 3000)));

  // Watchers: a price or a program it waits for, then it tells you (like a reminder, on a condition).
  const watchers = createWatchers({
    log,
    onFire: (w, now) => {
      const line = tr(w.lang || lang).watchFire(w, now);
      lastSpoke = Date.now();
      pet.lastTalk = lastSpoke;
      if (config.access.notify !== false) notify(`${identity.name} · 7ots`, line);
      broadcast({ say: line, gesture: 'wave', effect: 'exclaim', watcher: w, point: 'user', stir: pet.asleep });
    },
  });

  // The assistant: reminders that speak, notify and open the tab; notes it learns.
  const assistant = createAssistant({
    brain,
    access: () => config.access,
    memoryTokens: () => config.memory.tokens,
    lang,
    name: identity.name,
    log,
    watchers,
    procs: () => processSummary(),
    system: (said) => petSystem(identity, { lang: said || 'auto', role: 'assistant' }),
    // offload to the ot's cloud worker (access.vm): needs this computer signed in to 7ots.com
    cloud: () => (env().SEVENOTS_TOKEN && config.account?.otsId) || null,
    context: () => senses.prompt(),
    say: (text) => {
      lastSpoke = Date.now();
      pet.lastTalk = lastSpoke;
      broadcast({ say: text, gesture: 'wave', effect: 'exclaim', point: 'user', stir: pet.asleep });
    },
    // Prowl.world guides for sites mentioned (or, with access.screen, in the active window's title)
    sites: createSiteContext({
      enabled: () => config.access.sites !== false,
      screen: () => config.access.screen === true,
      windows: () => watcher?.seen?.windows || [],
      log,
    }),
    // logs, email, Orquesta agents, custom integrations (settings → Permissions)
    extra: createExtras({
      config: () => config,
      brain,
      log,
      system: (said) => petSystem(identity, { lang: said || 'auto', role: 'assistant' }),
      confirm,
      connect: connectOrquesta,
      onLater: (text) => {
        lastSpoke = Date.now();
        pet.lastTalk = lastSpoke;
        if (config.access.notify !== false) notify(`${identity.name} · 7ots`, text);
        broadcast({ say: text, gesture: 'wave', effect: 'exclaim', point: 'user', stir: pet.asleep });
      },
    }),
    onFire: (r, text) => {
      lastSpoke = Date.now();
      pet.lastTalk = lastSpoke;
      broadcast({ say: text, gesture: 'wave', effect: 'exclaim', reminder: r, point: r.open && config.access.open ? 'browser' : 'user', stir: pet.asleep });
    },
  });

  // What you are doing (access.screen): active window + a screenshot now and then, summed up by the brain.
  const watcher = createScreenWatcher({
    brain,
    enabled: () => config.access.screen === true,
    every: () => Math.max(1, Number(config.screen?.every) || 5),
    lang,
    log,
    onSeen: (row) => {
      broadcast({ seen: row });
      if (!row.say || pet.asleep || Date.now() < chatUntil || Date.now() - lastSpoke < GAP[annoy] || Math.random() >= CHATTY[annoy]) return;
      lastSpoke = Date.now();
      pet.lastTalk = lastSpoke;
      history.push(row.say);
      if (history.length > 6) history.shift();
      broadcast({ say: row.say, gesture: 'point', ambient: true });
    },
  });

  // Senses (senses/): camera (face + gestures, from the hidden /senses page), activity, the computer, email,
  // calendar → rules and gesture commands, and a reflector that now and then proposes something.
  async function senseTalk({ text = '', about = '', exact = false, kind = 'senses', important = false, gesture = 'wave' }) {
    const now = Date.now();
    if (now < chatUntil || thinking || asks.size || (pet.asleep && !important)) return false;
    if (now - lastSpoke < (important ? IMPORTANT_GAP : GAP)[annoy]) return false;
    let say = exact ? text : '';
    if (!say && about && brain.kind !== 'lines') {
      thinking = true;
      try {
        say = await brain.think({
          purpose: kind,
          system: petSystem(identity, { lang }),
          messages: [{ role: 'user', content: `${about}\nOne short line to them, in character.${history.length ? `\n(Things you already said: ${history.join(' | ')})` : ''}` }],
          timeoutMs: 30000,
        });
      } catch (e) {
        log(`brain: ${e.message}`);
      }
      thinking = false;
    }
    say = String(say || text || '').trim();
    if (!say || Date.now() < chatUntil) return false;
    lastSpoke = Date.now();
    pet.lastTalk = lastSpoke;
    history.push(say);
    if (history.length > 6) history.shift();
    if (important && config.access.notify !== false) notify(`${identity.name} · 7ots`, say);
    broadcast({ say, gesture, effect: important ? 'exclaim' : null, point: 'user', stir: important && pet.asleep, ambient: !important });
    return true;
  }
  async function senseAsk(text) {
    chatUntil = Date.now() + CHAT_QUIET;
    broadcast({ thinking: true, activity: track({ type: 'prompt', text }) });
    const r = (await lookAt(text)) || (await assistant.ask(text));
    lastSpoke = Date.now();
    chatUntil = Date.now() + CHAT_QUIET;
    broadcast({ thinking: false, say: r.reply, photo: r.photo, gesture: r.actions.length ? 'nod' : null, point: r.actions.some((a) => a.type === 'open') ? 'browser' : null });
  }
  // A real look, only when asked ("¿cómo me ves?"): the camera page sends one frame, the vision brain looks at it,
  // the pet shows it as a thumbnail. Kept in memory only; the file the CLI reads is deleted right after.
  const LOOK_RE = /c[oó]mo me ves|m[ií]rame|me (?:est[aá]s )?viendo|qu[eé] (?:me )?ves|me ves\b|look at me|how do i look|can you see me|what do you see|como (?:é que )?(?:voc[eê] )?me v[eê]|olh[ae] pra mim/i;
  const snaps = new Map();
  function snapFrame(ms = 6000) {
    const id = randomBytes(6).toString('hex');
    return new Promise((resolve) => {
      const t = setTimeout(() => (snaps.delete(id), resolve(null)), ms);
      snaps.set(id, (img) => (clearTimeout(t), snaps.delete(id), resolve(img)));
      broadcast({ senses: { snap: id } });
    });
  }
  async function lookAt(text) {
    if (!brain.vision || !senses.cameraOn() || !LOOK_RE.test(text)) return null;
    const photo = await snapFrame();
    if (!photo) return log('senses look: no frame from the camera page'), null;
    mkdirSync(homeFile('senses'), { recursive: true });
    const f = homeFile(`senses/look-${randomBytes(4).toString('hex')}.jpg`);
    writeFileSync(f, Buffer.from(photo.slice(photo.indexOf(',') + 1), 'base64'), { mode: 0o600 });
    try {
      const reply = await brain.think({
        purpose: 'look',
        system: `${petSystem(identity, { lang: 'auto' })}\n\nYour human asked you to look at them: the image is a frame from their webcam, taken just now. Look at it for real and answer what they asked, warm and specific to what you see (expression, light, posture, what is around). One to three short lines. Never guess identity, age, health or anything sensitive; do not describe other people in it.`,
        messages: [{ role: 'user', content: `${text}${senses.prompt() ? `\n\n${senses.prompt()}` : ''}` }],
        files: [f],
        timeoutMs: 120000,
      });
      return reply ? { reply, actions: [], photo } : null;
    } catch (e) {
      log(`senses look: ${e.message}`);
      return null;
    } finally {
      rmSync(f, { force: true });
    }
  }
  const senses = createSenses({
    config: () => config,
    brain,
    lang,
    log,
    system: () => petSystem(identity, { lang }),
    annoy: () => annoy,
    busy: () => Date.now() < chatUntil || thinking || asks.size > 0 || pet.asleep,
    talk: senseTalk,
    confirm,
    asking: () => asks.size > 0,
    answer: (ok) => {
      const a = [...asks.values()].at(-1);
      if (a) a.done(ok);
      return Boolean(a);
    },
    remind: (r) => assistant.remind(r),
    ask: (text) => senseAsk(String(text).slice(0, 300)).catch((e) => log(`senses ask: ${e.message}`)),
    notify: (text) => config.access.notify !== false && notify(`${identity.name} · 7ots`, text),
    broadcast,
  });
  senses.bind({
    setConfig: (patch) => {
      const next = loadConfig();
      next.senses = { ...next.senses, ...patch };
      saveConfig(next);
      config = loadConfig();
    },
  });

  // Home on getorquesta.com: comment on what the project's agent does.
  let stopWatch = () => {};
  if (config.home.kind === 'orquesta' && config.home.projectId && env().ORQUESTA_TOKEN) {
    import('./orquesta.mjs').then(({ watchLogs }) => {
      stopWatch = watchLogs(
        config.home.projectId,
        (l) => {
          const detail = String(l.message || '').slice(0, 200);
          if (l.level === 'error') onEvent({ type: 'tool', ok: false, tool: 'Orquesta', detail });
          else if (/complet|finish|done|success/i.test(`${l.category} ${l.message}`)) onEvent({ type: 'stop', detail });
          else onEvent({ type: 'tool', ok: true, tool: 'Orquesta', detail });
        },
        { onError: (e) => log(`orquesta: ${e.message}`) },
      );
    });
  }

  const okToken = (t) => {
    const a = Buffer.from(String(t || ''));
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const page = (file = 'pet.html', extra = {}) =>
    readFileSync(join(PKG_ROOT, 'cli', 'pet', file), 'utf8')
      .replace('__BOOT__', JSON.stringify({ token, pid: process.pid, companion: !!process.env.SEVENOTS_COMPANION, identity, otsId: config.account?.otsId || '', voice: config.voice, lang, annoy, brain: brainLabel(config.brain), activity, stt: sttProvider(env()), backdrop: config.pet.backdrop !== false, ...extra }).replace(/</g, '\\u003c'));

  // Visitors: other ots of the account invited onto this desktop (their look, saved so they come offline too).
  // The desktop shell opens a window for each and stages scenes between them (see electron/director.cjs).
  const VISITORS = homeFile('visitors.json');
  const visitors = () => {
    try {
      return JSON.parse(readFileSync(VISITORS, 'utf8')).filter((v) => v?.id && v.identity?.name);
    } catch {
      return [];
    }
  };

  // A second ot with everything: its own daemon (brain, voice, memory, reminders, settings) in ~/.7ots/ots/<id>,
  // on the next port. It starts with this one's settings and keys (keys.json is shared), and lives as long as it.
  // At most one for now. The old look-only visitors (no `full`) still work.
  const MAX_FULL = 1;
  const companion = (v) => {
    const dir = homeFile(join('ots', v.id));
    return { dir, url: `http://127.0.0.1:${port + 1}`, tokenFile: join(dir, 'pet.token') };
  };
  async function startCompanion(v) {
    const c = companion(v);
    const up = await fetch(`${c.url}/health`).then((r) => (r.ok ? r.json() : null), () => null);
    if (up && up.name === v.identity.name) return;
    mkdirSync(c.dir, { recursive: true });
    const f = (n) => join(c.dir, n);
    if (!existsSync(f('identity.json'))) writeFileSync(f('identity.json'), JSON.stringify(v.identity, null, 2));
    if (!existsSync(f('config.json'))) {
      const next = { ...JSON.parse(JSON.stringify(config)), account: { otsId: v.id, name: v.identity.name, at: Date.now() } };
      if (['local', '7ots'].includes(next.home?.kind || 'local')) next.home = { kind: '7ots', url: `${SEVENOTS_URL}/api/o/${v.id}` };
      writeFileSync(f('config.json'), JSON.stringify(next, null, 2));
    }
    try {
      if (!existsSync(f('keys.json')) && existsSync(homeFile('keys.json'))) symlinkSync(homeFile('keys.json'), f('keys.json'));
    } catch {}
    const out = openSync(homeFile('pet.log'), 'a');
    spawn(process.execPath, [join(PKG_ROOT, 'cli', '7ots.mjs'), 'pet', '--daemon'], {
      cwd: c.dir, // never pick up a project's .7ots/identity.json
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, out],
      env: { ...process.env, SEVENOTS_COMPANION: '1', SEVENOTS_HOME: c.dir, SEVENOTS_PET_PORT: String(port + 1), SEVENOTS_PORT_WAIT: '1' },
    }).unref();
    log(`companion: ${v.identity.name} on ${c.url}`);
  }
  const quitCompanion = (v) => {
    const c = companion(v);
    let t = '';
    try {
      t = readFileSync(c.tokenFile, 'utf8').trim();
    } catch {}
    return fetch(`${c.url}/quit`, { method: 'POST', headers: { 'X-7ots-Token': t, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  };
  let entranceDone = false;
  const fullOnes = () => visitors().filter((v) => v.full);
  if (!process.env.SEVENOTS_COMPANION) fullOnes().forEach((v) => startCompanion(v).catch((e) => log(`companion: ${e.message}`)));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost'].includes(host)) return res.writeHead(403).end();
    const json = (code, data) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    const p = url.pathname;

    if (p === '/health') return json(200, { ok: true, name: identity.name, pid: process.pid });
    if (req.method === 'GET' && p === '/dist/7ots.esm.js') {
      const f = join(PKG_ROOT, 'dist', '7ots.esm.js');
      if (!existsSync(f)) return res.writeHead(404).end('run npm run build');
      return res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }).end(readFileSync(f));
    }
    if (req.method === 'GET' && /^\/mods\/[a-f0-9]{16}\.(vrm|glb)$/.test(p)) {
      // 3D models of full-body mods, uploaded from settings (content-addressed, so cacheable); one that is
      // not here yet (a community mod you only browse) comes from 7ots.com, checked against its name, not kept
      const f = homeFile(p.slice(1));
      let buf = existsSync(f) ? readFileSync(f) : null;
      if (!buf) {
        const r = await fetch(`${SEVENOTS_URL}${p}`, { signal: AbortSignal.timeout(60000) }).catch(() => null);
        const b = r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
        if (b && createHash('sha256').update(b).digest('hex').slice(0, 16) === p.slice(6, 22)) buf = b;
      }
      if (!buf) return res.writeHead(404).end();
      return res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'max-age=31536000, immutable' }).end(buf);
    }
    if (req.method === 'GET' && p === '/favicon.svg') return res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' }).end(readFileSync(join(PKG_ROOT, 'brand', 'favicon.svg')));
    // the camera's libraries and models (MediaPipe, pinned by hash in senses/vendor.mjs): public files
    if (req.method === 'GET' && p.startsWith('/senses/vendor/')) {
      const v = vendorFile(p.slice(15));
      if (!v || !existsSync(v.file)) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': v.type, 'Content-Length': statSync(v.file).size, 'Cache-Control': 'max-age=86400' });
      return createReadStream(v.file).pipe(res);
    }
    const authed = okToken(url.searchParams.get('token') || req.headers['x-7ots-token']);
    if (!authed) return json(401, { error: 'token' });

    if (req.method === 'GET' && p === '/pet') {
      const g = url.searchParams.get('guest');
      const v = g && visitors().find((x) => x.id === g);
      if (g && !v) return res.writeHead(404).end();
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end(v ? page('pet.html', { identity: v.identity, guest: v.id, voice: { kind: 'none' } }) : page());
    }
    if (req.method === 'GET' && p === '/visitors')
      return json(200, visitors().map((v) => {
        if (!v.full) return { id: v.id, name: v.identity.name };
        const c = companion(v);
        let t = '';
        try {
          t = readFileSync(c.tokenFile, 'utf8').trim();
        } catch {}
        return { id: v.id, name: v.identity.name, url: c.url, token: t }; // no token yet: its daemon is still starting
      }));
    if (req.method === 'GET' && p === '/settings') {
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }).end(page('settings.html', { uiLang: uiLangOf(config, lang) }));
    }
    if (req.method === 'GET' && p === '/card') {
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end(page('card.html'));
    }
    // The card as a high-res PNG (card-shot.mjs: headless Chrome, so blend modes and 3D come out as on screen).
    if (req.method === 'GET' && p === '/card.png') {
      const q = new URLSearchParams({ shot: '1', token });
      for (const k of ['id', 'foil', '3d']) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k));
      try {
        const png = await cardShot(`http://127.0.0.1:${port}/card?${q}`, { scale: Math.min(8, Math.max(1, Number(url.searchParams.get('scale')) || 4)), gl: !!url.searchParams.get('3d'), timeout: url.searchParams.get('3d') ? 150000 : 45000 });
        return res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(png);
      } catch (e) {
        return json(e.status || 500, { error: e.message });
      }
    }
    if (req.method === 'GET' && p === '/config') return json(200, settingsView());
    if (req.method === 'GET' && p === '/senses') {
      const preview = url.searchParams.get('preview') === '1';
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }).end(page('senses.html', { senses: senses.pageConfig(), vendor: vendorStatus(), preview, uiLang: uiLangOf(config, lang) }));
    }
    if (req.method === 'GET' && p === '/senses/config') return json(200, { ...senses.pageConfig(), vendor: vendorStatus() });
    if (req.method === 'GET' && p === '/senses/status') return json(200, { ...senses.status(), vendor: vendorStatus(), wantCamera: senses.pageConfig().on && vendorStatus().ready });
    if (req.method === 'GET' && p === '/state') return json(200, { identity, state: view(pet), config: { voice: config.voice, pet: config.pet, brain: config.brain.kind } });
    if (req.method === 'GET' && p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ state: view(pet), ...(viewSet ? { view: viewSet } : {}), ...(senses.cameraOn() ? { senses: { camera: 'on' } } : {}) })}\n\n`);
      for (const [id, a] of asks) res.write(`data: ${JSON.stringify({ ask: { id, text: a.text } })}\n\n`); // still waiting for you
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'GET' && p === '/scenes') {
      // polled by the desktop shell's director: how often ots play scenes, which ones, and a pending "play now"
      const play = scenePlay;
      scenePlay = null;
      return json(200, { ...sceneConf(), play });
    }
    if (req.method === 'GET' && p === '/music') return json(200, { files: musicFiles(), dir: homeFile('music') });
    if (req.method === 'GET' && p.startsWith('/music/')) {
      let name = '';
      try {
        name = decodeURIComponent(p.slice(7));
      } catch {}
      if (!musicFiles().includes(name)) return res.writeHead(404).end();
      const f = homeFile(`music/${name}`);
      const type = MUSIC_TYPES[name.split('.').pop().toLowerCase()];
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': statSync(f).size, 'Cache-Control': 'no-cache' });
      return createReadStream(f).pipe(res);
    }
    if (req.method === 'GET' && p === '/inferences') {
      // this ot's calls plus those of the ots visiting this desktop (the host sees all), each tagged with its ot
      const n = Number(url.searchParams.get('n')) || 100;
      const me = { id: config.account?.otsId || 'local', name: identity.name || 'ot', character: identity.look?.character || null, self: true };
      const all = [...inferences.list(MAX_INF).map((r) => ({ ...r, ot: me })), ...otherInferences()].sort((a, b) => b.at - a.at);
      const ots = [...new Map(all.map((r) => [r.ot.id, r.ot])).values()];
      const want = url.searchParams.get('ot');
      const rows = (want ? all.filter((r) => r.ot.id === want) : all).slice(0, n).map(({ ot, ...r }) => ({ ...r, ot: { id: ot.id, name: ot.name } }));
      return json(200, { ots, inferences: rows });
    }
    if (req.method === 'GET' && p === '/memory') return json(200, { notes: assistant.notes, reminders: assistant.reminders, seen: watcher.seen, said: history, conversation: assistant.conversation, activity, pet: view(pet) });
    if (req.method === 'GET' && p === '/account') {
      const base = { url: SEVENOTS_URL, current: config.account || null, signedIn: signedIn() };
      if (!base.signedIn) return json(200, base);
      try {
        return json(200, { ...base, ...(await accountMe()) });
      } catch (e) {
        return json(200, { ...base, signedIn: signedIn(), error: e.message });
      }
    }
    if (req.method === 'GET' && p === '/processes')
      return json(200, {
        reminders: assistant.reminders,
        watchers: watchers.list,
        screen: { on: config.access.screen === true, every: config.screen.every, last: watcher.seen?.[0] || null },
        system: config.access.processes ? await processes({ n: 60 }) : null,
      });
    if (req.method === 'GET' && p === '/reminders') return json(200, { reminders: assistant.reminders, notes: assistant.notes });
    if (req.method === 'GET' && p === '/cloud') return json(200, await cloudStatus(config));
    const bm = /^\/byte(\/(?:games|status|play|stop|connect))?$/.exec(p);
    if (bm && (req.method === 'GET' || req.method === 'POST')) {
      try {
        let body;
        if (req.method === 'POST') {
          let raw = '';
          for await (const c of req) if ((raw += c).length > 4096) break;
          try {
            body = JSON.parse(raw || '{}');
          } catch {
            body = {};
          }
        }
        return json(200, await cloudByte(config, bm[1] || '', { method: req.method, body }));
      } catch (e) {
        return json(e.status === 401 ? 200 : 502, e.status === 401 ? { available: false } : { error: e.message });
      }
    }
    if (req.method === 'GET' && p === '/wallet') {
      try {
        return json(200, await cloudWallet(config));
      } catch (e) {
        return json(e.status === 401 ? 200 : 502, e.status === 401 ? { available: false } : { error: e.message });
      }
    }
    if (req.method === 'GET' && (p === '/orquesta/projects' || p === '/orquesta/prompt')) {
      const o = await import('./orquesta.mjs');
      if (!o.via()) return json(200, { connected: false });
      try {
        if (p === '/orquesta/projects') return json(200, { connected: true, via: o.via(), projects: await o.agentProjects() });
        return json(200, { connected: true, ...(await o.agentTask(String(url.searchParams.get('id') || '').slice(0, 80))) });
      } catch (e) {
        const off = [401, 409].includes(e.status); // no token / not connected on 7ots.com
        return json(off ? 200 : 502, { connected: !off, error: off ? undefined : e.message });
      }
    }
    if (req.method !== 'POST') return json(405, { error: 'method' });
    if (p === '/stt') {
      const chunks = [];
      let n = 0;
      for await (const c of req) {
        if ((n += c.length) > 8 * 1024 * 1024) return json(413, { error: 'too large' });
        chunks.push(c);
      }
      try {
        const t0 = Date.now();
        const { text, provider } = await transcribe({ audio: Buffer.concat(chunks), contentType: req.headers['content-type'], lang: '', env: env() }); // '' = detect the language spoken
        log(`stt: ${provider} ${Date.now() - t0}ms ${n}B → ${text.length} chars`);
        return json(200, { text });
      } catch (e) {
        log(`stt: ${e.message}`);
        return json(e.status || 502, { error: e.message });
      }
    }
    if (p === '/mods/upload') {
      // a .vrm/.glb for a full-body mod: stored in ~/.7ots/mods/<sha256-16>.<ext>
      const chunks = [];
      let n = 0;
      for await (const c of req) {
        if ((n += c.length) > 60 * 1024 * 1024) return json(413, { error: 'too large' });
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF') return json(400, { error: 'model' });
      const ext = url.searchParams.get('ext') === 'vrm' ? 'vrm' : 'glb';
      const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`;
      mkdirSync(homeFile('mods'), { recursive: true });
      writeFileSync(homeFile(`mods/${name}`), buf);
      log(`mods: model ${name} ${Math.round(buf.length / 1024)}KB`);
      return json(200, { ok: true, url: `/mods/${name}` });
    }
    let body = '';
    const max = p === '/senses/snap' ? 400 * 1024 : 64 * 1024; // a camera frame
    for await (const c of req) if ((body += c).length > max) return json(413, { error: 'too large' });
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      return json(400, { error: 'json' });
    }
    if (p.startsWith('/identity/') || p === '/config') syncLater(); // a local change goes up to 7ots.com
    if (p === '/event') {
      onEvent(data);
      savePet(pet);
      return json(200, { ok: true, state: view(pet) });
    }
    // what each page did with its audio (say, tts, play, cut, music): pet.log, to debug voices heard twice
    if (p === '/log') {
      log(`audio[${String(data.page || '?').slice(0, 8)}]: ${String(data.msg || '').replace(/\s+/g, ' ').slice(0, 200)}`);
      return json(200, { ok: true });
    }
    if (p === '/tts') {
      const kind = config.voice.kind;
      log(`audio: tts ${kind} «${String(data.text || '').slice(0, 60)}»`);
      if (['none', 'browser'].includes(kind)) return json(501, { error: 'browser voice' });
      try {
        if (kind === 'local') {
          const { audio, contentType } = await synthesizeLocal(stripSpeechTags(data.text).slice(0, 600), { lang });
          return res.writeHead(200, { 'Content-Type': contentType }).end(audio);
        }
        const { audio, contentType } = await voiceAudio(kind, String(data.text || '').slice(0, 600), voiceFor(kind));
        return res.writeHead(200, { 'Content-Type': contentType }).end(audio);
      } catch (e) {
        return json(e.status || 502, { error: e.message });
      }
    }
    if (p === '/voice/test') {
      // try a provider's voice before saving it: { kind, voiceId, model, style, text }
      const kind = String(data.kind || '');
      if (!VOICE_PROVIDERS.includes(kind)) return json(400, { error: 'kind' });
      try {
        const over = Object.fromEntries(['voiceId', 'model', 'style'].map((f) => [f, String(data[f] ?? '').trim().slice(0, 600)]));
        const text = String(data.text || '').trim().slice(0, 300) || ({ es: `Hola, soy ${identity.name}. ¿Así me quieres oír?`, pt: `Oi, eu sou ${identity.name}. Quer me ouvir assim?` }[lang] || `Hi, I'm ${identity.name}. Is this how you want me to sound?`);
        const { audio, contentType } = await voiceAudio(kind, text, { ...voiceFor(kind), ...over });
        return res.writeHead(200, { 'Content-Type': contentType }).end(audio);
      } catch (e) {
        return json(e.status || 502, { error: e.message });
      }
    }
    if (p === '/senses') return json(200, senses.ingest(data.events || data));
    if (p === '/senses/vendor') {
      // downloads the camera's models once (~13 MB, from jsDelivr and Google), checked by hash
      if (!vendorStatus().ready && !vendorStatus().busy) ensureVendor(log).catch((e) => log(`senses vendor: ${e.message}`));
      return json(200, vendorStatus());
    }
    if (p === '/senses/baseline') return json(200, { ok: senses.setBaseline(data.baseline ?? null) });
    if (p === '/senses/gestures') return json(200, senses.setGestures(data));
    if (p === '/senses/rules') {
      try {
        const id = String(data.id || '');
        if (data.action === 'add') return json(200, { rule: senses.addRule(data.rule || {}) });
        if (data.action === 'remove') return json(200, { ok: senses.removeRule(id) });
        if (['accept', 'reject', 'on', 'off'].includes(data.action)) return json(200, { rule: senses.setRule(id, { status: ['accept', 'on'].includes(data.action) ? 'active' : 'off' }) });
        if (data.action === 'set') return json(200, { rule: senses.setRule(id, data.rule || {}) });
        return json(400, { error: 'action' });
      } catch (e) {
        return json(400, { error: e.message });
      }
    }
    if (p === '/senses/forget') return json(200, { ok: senses.forget() });
    if (p === '/senses/pause') {
      if (data.resume) {
        const next = loadConfig();
        next.senses = { ...next.senses, pausedUntil: 0 };
        saveConfig(next);
        config = loadConfig();
        return json(200, { pausedUntil: 0 });
      }
      return json(200, { pausedUntil: senses.pause(data.min) });
    }
    if (p === '/senses/snap') {
      const done = snaps.get(String(data.id || ''));
      const ok = done && /^data:image\/jpeg;base64,[\w+/=]+$/.test(String(data.image || ''));
      if (ok) done(data.image);
      return json(200, { ok: Boolean(ok) });
    }
    if (p === '/senses/reflect') return json(200, (await senses.reflect({ force: true })) || { say: '', rule: null });
    if (p === '/ask') {
      const text = String(data.text || '').trim().slice(0, 800);
      if (!text) return json(400, { error: 'text' });
      chatUntil = Date.now() + CHAT_QUIET;
      broadcast({ thinking: true, activity: track({ type: 'prompt', text }) });
      const r = (await lookAt(text)) || (await assistant.ask(text));
      lastSpoke = Date.now();
      chatUntil = Date.now() + CHAT_QUIET;
      broadcast({ thinking: false, stir: pet.asleep, say: r.reply, photo: r.photo, gesture: r.actions.length ? 'nod' : null, point: r.actions.some((a) => a.type === 'open') ? 'browser' : null });
      const { photo, ...out } = r; // the frame went to the pet page only
      return json(200, out);
    }
    if (p === '/config') {
      const bad = applySettings(data);
      return bad ? json(400, { error: bad }) : json(200, settingsView());
    }
    if (p === '/config/test') {
      if (brain.kind === 'lines') return json(200, { ok: true, text: line('hello', lang, { name: identity.name, level: pet.level }), ms: 0 });
      const t0 = Date.now();
      try {
        const text = await brain.think({ purpose: 'test', system: petSystem(identity, { lang }), messages: [{ role: 'user', content: 'Your human is checking that your brain works. Say hi in one short line.' }], timeoutMs: 45000 });
        if (!text) throw new Error('empty answer');
        broadcast({ say: text, gesture: 'wave' });
        return json(200, { ok: true, text, ms: Date.now() - t0 });
      } catch (e) {
        return json(200, { ok: false, error: e.message, ms: Date.now() - t0 });
      }
    }
    if (p === '/screen/look') return json(200, { seen: config.access.screen ? await watcher.look({ force: true }) : null, enabled: config.access.screen });
    if (p === '/seen/forget') return watcher.forget(), json(200, { ok: true });
    if (p === '/account/login') {
      try {
        const { url, done } = await startLogin({ open: openUrl });
        done.then(() => broadcast({ account: true }), (e) => log(`account: ${e.message}`));
        return json(200, { url });
      } catch (e) {
        return json(502, { error: e.message });
      }
    }
    if (p === '/account/logout') return await accountLogout(), json(200, { ok: true });
    if (p === '/account/visitor') {
      const vid = String(data.id || '');
      if (!/^[a-z0-9_]{4,40}$/.test(vid)) return json(400, { error: 'id' });
      if (process.env.SEVENOTS_COMPANION) return json(400, { error: 'the second ot cannot invite more' });
      let list = visitors().filter((v) => v.id !== vid);
      if (data.on) {
        if (vid === config.account?.otsId) return json(400, { error: 'that one already lives here' });
        if (list.length >= MAX_FULL) return json(400, { error: `max ${MAX_FULL + 1} ots on this computer` });
        try {
          const { identity: vi } = await pullOt(vid);
          list.push({ id: vid, identity: defineIdentity(vi), full: true, at: Date.now() });
        } catch (e) {
          return json(e.status || 502, { error: e.message });
        }
      } else {
        const gone = visitors().find((v) => v.id === vid);
        if (gone?.full) quitCompanion(gone);
      }
      writeFileSync(VISITORS, JSON.stringify(list, null, 2));
      list.filter((v) => v.full).forEach((v) => startCompanion(v).catch((e) => log(`companion: ${e.message}`)));
      log(`visitors: ${list.map((v) => v.identity.name).join(', ') || 'none'}`);
      return json(200, { ok: true, visitors: list.map((v) => v.id) });
    }
    if (p === '/account/use') {
      if (!/^[a-z0-9_]{4,40}$/.test(String(data.id || ''))) return json(400, { error: 'id' });
      try {
        const r = await useOt(data.id);
        log(`account: now ${r.identity.name} (${data.id})`);
        json(200, { ok: true, name: r.identity.name });
      } catch (e) {
        return json(e.status || 502, { error: e.message });
      }
      return restart(); // identity, language and name are read once at start
    }
    if (p.startsWith('/community/')) {
      // the 7ots.com gallery (server/platform/mods.mjs): browse without an account; share, rate and report with one
      const act = p.slice('/community/'.length);
      try {
        if (act === 'list') return json(200, { signedIn: signedIn(), ...(await community.list(data)) });
        if (!signedIn() && act !== 'install') return json(401, { error: 'login' });
        if (act === 'mine') return json(200, await community.mine());
        if (act === 'install') {
          const mod = await community.install(data.id);
          const [status, out] = changeMods({ mod });
          return json(status, out);
        }
        if (act === 'rate') return json(200, await community.rate(data.id, data.stars));
        if (act === 'report') return json(200, await community.report(data.id, data.reason));
        if (act === 'remove') return json(200, await community.remove(data.id));
        if (act === 'share') {
          const mod = modLibrary().find((m) => m.id === data.id) || normalizeMods(identity.look?.character?.mods).find((m) => m.id === data.id);
          if (!mod) return json(404, { error: 'mod' });
          return json(200, await community.share(mod));
        }
      } catch (e) {
        log(`community ${act}: ${e.message}`);
        return json(e.status || 502, { error: e.message });
      }
      return json(404, { error: 'not found' });
    }
    if (p === '/identity/mods') {
      const [status, out] = changeMods(data);
      return json(status, out);
    }
    /** mods of the ot's look (a catalog one by id, or an imported .json); the pet reloads with them */
    function changeMods(data) {
      const { file } = loadIdentity();
      const raw = readJson(file) || {};
      const ch = raw.look?.character || {};
      let mods = normalizeMods(ch.mods);
      if (data.remove) mods = mods.filter((m) => m.id !== data.remove);
      if (data.add || data.mod) {
        const m = data.add ? MOD_CATALOG.find((c) => c.id === data.add) || modLibrary().find((c) => c.id === data.add) : data.mod; // catalog, or one imported earlier
        const n = m && normalizeMod(m);
        if (!n) return [400, { error: 'mod' }];
        if (!mods.some((x) => x.id === n.id) && mods.length >= MAX_MODS) return [400, { error: 'maxMods' }];
        // un muñeco completo reemplaza al ot entero: los accesorios 2D no se verían encima, así que
        // poner uno quita el otro (si no, «poner orc» sobre un modelo no cambiaba nada)
        mods = n.model ? [n] : [...mods.filter((x) => x.id !== n.id && !x.model), n];
        // los importados quedan en la biblioteca local aunque después se quiten (o los reemplace otro)
        if (data.mod) writeJson(homeFile('mods/library.json'), [...modLibrary().filter((x) => x.id !== n.id), n].slice(-60));
      }
      if (data.forget) writeJson(homeFile('mods/library.json'), modLibrary().filter((x) => x.id !== data.forget));
      const look = { ...raw.look, character: { ...ch, mods } };
      writeJson(file, { ...raw, look });
      identity.look = defineIdentity({ ...raw, look }).look;
      log(`identity: mods ${mods.map((m) => m.id).join(', ') || 'none'}`);
      setTimeout(() => broadcast({ reload: true }), 100);
      return [200, { ok: true, mods: mods.map((m) => m.id) }];
    }
    if (p === '/identity/lang') {
      // the language the ot itself speaks (bubbles, brain, meet), kept in its identity file
      if (!['en', 'es', 'pt'].includes(data.lang)) return json(400, { error: 'lang' });
      const { file } = loadIdentity();
      const raw = readJson(file) || {};
      writeJson(file, { ...raw, language: data.lang, voice: { ...raw.voice, lang: { es: 'es-ES', en: 'en-US', pt: 'pt-BR' }[data.lang] } });
      log(`identity: speaks ${data.lang}`);
      json(200, { ok: true });
      return restart();
    }
    if (p === '/inferences/clear') return inferences.clear(), json(200, { ok: true });
    if (p === '/conversation/forget') return json(200, { ok: assistant.forgetConversation() });
    if (p === '/notes/forget') return json(200, { ok: assistant.forget(data.at === 'all' ? 'all' : String(data.at ?? '')) });
    if (p === '/watchers/cancel') return json(200, { ok: watchers.cancel(String(data.id || '')) });
    if (p === '/reminders/cancel') return json(200, { ok: assistant.cancel(String(data.id || '')) });
    if (p === '/approve') {
      const a = asks.get(String(data.id || ''));
      if (!a) return json(404, { error: 'gone' });
      a.done(data.ok === true);
      return json(200, { ok: true });
    }
    if (p === '/integrations/test') {
      // a draft (not saved yet) is validated like a save, then tried once
      try {
        const [c] = normalizeIntegrations({ custom: [data.integration || {}] }).custom;
        return json(200, await testCustom(c));
      } catch (e) {
        return json(200, { ok: false, error: redact(e.message).slice(0, 300) });
      }
    }
    if (p === '/orquesta/connect') {
      const r = connectOrquesta();
      r.catch((e) => log(`orquesta: ${e.message}`));
      return json(200, { ok: true });
    }
    if (p === '/orquesta/send') {
      const projectId = String(data.projectId || '');
      const text = String(data.text || '').trim();
      if (!/^[\w-]{1,80}$/.test(projectId) || !text) return json(400, { error: 'projectId, text' });
      try {
        return json(200, await (await import('./orquesta.mjs')).sendToAgent(projectId, text));
      } catch (e) {
        return json(e.status === 400 ? 400 : 502, { error: e.message });
      }
    }
    if (p === '/voice/list') {
      // the voices a provider offers with the saved key (ElevenLabs: yours + saved from the library; Fish: your models)
      const kind = String(data.kind || '');
      const keys = env();
      try {
        if (kind === 'elevenlabs') {
          if (!keys.ELEVENLABS_API_KEY) return json(400, { error: 'key' });
          const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': keys.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) {
            const { providerError } = await import('../../server/tts.mjs');
            return json(502, { error: providerError('ElevenLabs', r.status, await r.text().catch(() => '')).message });
          }
          const j = await r.json();
          return json(200, { voices: (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name, note: [v.category, v.labels?.accent, v.labels?.gender, v.labels?.age].filter(Boolean).join(' · '), preview: v.preview_url || '' })) });
        }
        if (kind === 'fish') {
          if (!keys.FISH_API_KEY) return json(400, { error: 'key' });
          const r = await fetch('https://api.fish.audio/model?self=true&page_size=50', { headers: { Authorization: `Bearer ${keys.FISH_API_KEY}` }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) return json(502, { error: `Fish Audio ${r.status}` });
          const j = await r.json();
          return json(200, { voices: (j.items || []).map((v) => ({ id: v._id, name: v.title, note: (v.languages || []).join(', ') })) });
        }
        if (kind === 'openai') return json(200, { voices: OPENAI_VOICES.map((v) => ({ id: v, name: v })) });
        if (kind === 'grok') return json(200, { voices: GROK_VOICES.map((v) => ({ id: v, name: v })) });
        return json(200, { voices: [] });
      } catch (e) {
        return json(502, { error: e.message });
      }
    }
    if (p === '/character/draft') {
      // the brain drafts the character sheet from the identity (+ an optional idea); nothing is saved
      if (brain.kind === 'lines') return json(400, { error: 'brain' });
      const cur = config.character || {};
      const KEYS = ['backstory', 'style', 'quirks', 'scenario', 'greeting', 'examples'];
      const who = { name: identity.name, role: identity.role, tagline: identity.tagline, bio: identity.bio, tone: identity.personality?.tone, traits: identity.personality?.traits, look: (identity.look?.character?.mods || []).map((m) => m.id) };
      const L = ['es', 'en', 'pt'].includes(data.lang) ? data.lang : lang;
      const LN = { es: 'Spanish (español)', pt: 'Brazilian Portuguese (português)', en: 'English' }[L];
      const FIELDS = {
        backstory: 'backstory (4-6 sentences: where it comes from, what it wants, what it fears)',
        style: 'style (how it talks: rhythm, words it likes, what it never does)',
        quirks: 'quirks (5-8 short habits, one per line)',
        scenario: 'scenario (1-2 sentences: where it lives and what it does all day)',
        greeting: 'greeting (one short line)',
        examples: `examples (3-4 tiny exchanges, lines «Human: …» and «${identity.name}: …»)`,
      };
      const ask = (keys) => `Write a character sheet for a desktop pet called ${identity.name}.
LANGUAGE: write every field entirely in ${LN}, even if the profile below is in another language (translate it).
Who it is (from its profile): ${JSON.stringify(who)}
${KEYS.some((k) => cur[k]) ? `Current sheet (keep what is good, improve the rest): ${JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, cur[k] || ''])))}` : ''}
${data.idea ? `The owner's idea for it: «${String(data.idea).slice(0, 600)}»` : ''}
Make it varied and specific so it never gets stuck on one or two topics (it is a companion that comments on the owner's coding work, chats and keeps them company): many interests, opinions, running jokes, small habits.
Answer ONLY a flat JSON object with exactly these keys, each a non-empty string in ${LN}:
${keys.map((k) => FIELDS[k]).join('\n')}`;
      // models drift: other casing, arrays, nested objects or a wrapper ({ sheet: {…} })
      const textOf = (v) => (Array.isArray(v) ? v.map(textOf).join('\n') : v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => (typeof x === 'object' ? textOf(x) : /^(human|user|q|a|\d+)$/i.test(k) ? x : `${k}: ${x}`)).join('\n') : String(v ?? ''));
      const pick = (j) => {
        const o = j && typeof j === 'object' ? (Object.keys(j).length === 1 && typeof Object.values(j)[0] === 'object' && !Array.isArray(Object.values(j)[0]) ? Object.values(j)[0] : j) : {};
        const low = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ''), v]));
        const alias = { backstory: ['backstory', 'history', 'background', 'story', 'description'], style: ['style', 'speakingstyle', 'voice'], quirks: ['quirks', 'habits'], scenario: ['scenario', 'setting'], greeting: ['greeting', 'firstmessage', 'hello'], examples: ['examples', 'exampledialogue', 'dialogues', 'exchanges'] };
        return Object.fromEntries(KEYS.map((k) => [k, textOf(alias[k].map((a) => low[a]).find((v) => v != null && v !== '') ?? '').trim()]));
      };
      const run = async (keys) => {
        const raw = String(await brain.think({ purpose: 'character', system: `You are a character writer. You write in ${LN}. Output strict JSON only.`, messages: [{ role: 'user', content: ask(keys) }], timeoutMs: 120000, raw: true }));
        return pick(JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
      };
      try {
        const out = await run(KEYS);
        const missing = KEYS.filter((k) => !out[k]);
        if (missing.length) Object.assign(out, Object.fromEntries(Object.entries(await run(missing).catch(() => ({}))).filter(([k, v]) => missing.includes(k) && v)));
        const lim = { backstory: 3000, style: 1500, quirks: 1500, scenario: 1500, greeting: 600, examples: 4000 };
        return json(200, { lang: L, sheet: Object.fromEntries(KEYS.map((k) => [k, (out[k] || '').slice(0, lim[k])])) });
      } catch (e) {
        return json(502, { error: e.message });
      }
    }
    if (p === '/character/letta') {
      try {
        const r = await lettaSync(identity, config.character);
        if (r.created) {
          const next = loadConfig();
          next.character = { ...next.character, letta: { on: true, agentId: r.agentId } };
          saveConfig(next);
          config = loadConfig();
        }
        return json(200, r);
      } catch (e) {
        return json(e.status === 400 ? 400 : 502, { error: e.message });
      }
    }
    if (p === '/dance' || p === '/entrance') {
      const dance = musicFor(data);
      if (p === '/dance') broadcast({ dance });
      else {
        // { start: true } = the page just opened: only once per run, and only if the owner wants it
        const ec = { ...CONFIG_DEFAULTS.pet.entrance, ...config.pet.entrance };
        if (data.start && (entranceDone || !ec.onStart)) return json(200, { ok: false });
        entranceDone = true;
        const want = ENTRANCE_KINDS.includes(data.kind) ? data.kind : ENTRANCE_KINDS.includes(ec.kind) ? ec.kind : ENTRANCE_KINDS[Math.floor(Math.random() * ENTRANCE_KINDS.length)];
        const dn = DANCES.includes(data.name) ? data.name : DANCES.includes(ec.dance) ? ec.dance : '';
        broadcast({ entrance: { ...dance, dance: dn, kind: want, name: identity.name || 'ot' } });
      }
      log(`${p.slice(1)}: ${dance.name}${dance.music ? ` ♪ ${dance.music.file || dance.music.style}` : ''}`);
      return json(200, { ok: true, dance: dance.name, music: dance.music });
    }
    if (p === '/scenes/play') {
      scenePlay = { scene: SCENE_NAMES.includes(data.scene) ? data.scene : '', at: Date.now() };
      return json(200, { ok: true });
    }
    if (p === '/quit') {
      json(200, { ok: true });
      await Promise.all(fullOnes().map(quitCompanion)); // the second ot leaves with it (a restart keeps it)
      return stop();
    }
    return json(404, { error: 'not found' });
  });

  /** What the settings page shows. Keys only as present/absent, never their value. */
  function settingsView() {
    const keys = env();
    return {
      name: identity.name,
      lang,
      visitor: !!process.env.SEVENOTS_COMPANION, // a visiting ot: the host's settings rule shared things (scenes)
      config: { brain: config.brain, pet: { ...config.pet, scenes: sceneConf() }, access: config.access, voice: config.voice, screen: config.screen, memory: config.memory, senses: config.senses },
      brain: brainLabel(config.brain),
      clis: detectClis(),
      stt: sttProvider(keys),
      voice: config.voice,
      voices: { local: localVoices(), keys: { elevenlabs: Boolean(keys.ELEVENLABS_API_KEY), openai: Boolean(keys.OPENAI_API_KEY), apuchat: Boolean(keys.APUCHAT_VOICE_TOKEN), apuchatCloud: Boolean(keys.SEVENOTS_TOKEN && config.account?.otsId), grok: Boolean(keys.XAI_API_KEY), fish: Boolean(keys.FISH_API_KEY) } },
      uiLang: uiLangOf(config, lang),
      configLang: config.lang || '',
      otLook: identity.look?.character || null,
      // the catalog without its 3D models (the page only draws the 2D previews)
      modLibrary: modLibrary(),
      musicFiles: musicFiles(),
      dances: DANCES,
      ttsModels: TTS_MODELS,
      modCatalog: MOD_CATALOG.map((m) => normalizeMod(m)).map((m) => ({ ...m, parts: m.parts.map((x) => ({ ...x, glb: x.glb ? '3d' : '' })) })),
      integrations: config.integrations,
      character: config.character,
      account: config.account || null,
      screen: config.screen,
      vision: Boolean(brain.vision),
      allClis: Object.keys(AI_CLIS),
      keys: Object.fromEntries(SETTABLE_KEYS.map((k) => [k, Boolean(keys[k])])),
      home: { kind: config.home.kind, url: Boolean(config.home.url) },
      reminders: assistant.reminders,
      notes: assistant.notes,
      files: { config: homeFile('config.json'), memory: homeFile('memory.json'), reminders: homeFile('reminders.json') },
    };
  }

  /** Validates and saves a settings change, then applies it without restarting. Returns an error or null. */
  function applySettings(d) {
    const next = loadConfig();
    if (d.brain) {
      const b = d.brain;
      const model = String(b.model || '').trim();
      if (model && !/^[\w.:/@-]{1,80}$/.test(model)) return 'model';
      if (b.kind === 'lines') next.brain = { kind: 'lines' };
      else if (b.kind === 'cli') {
        if (!AI_CLIS[b.cli]) return 'cli'; // 'custom' (a shell command) stays CLI-only: 7ots setup
        next.brain = { kind: 'cli', cli: b.cli, ...(model ? { model } : {}) };
      } else if (b.kind === 'api') {
        if (!['anthropic', 'openai'].includes(b.provider)) return 'provider';
        const baseUrl = String(b.baseUrl || '').trim();
        if (baseUrl && !/^https?:\/\/[^\s"'<>]{1,200}$/i.test(baseUrl)) return 'baseUrl';
        next.brain = { kind: 'api', provider: b.provider, ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) };
      } else if (b.kind === 'batuta') next.brain = { kind: 'batuta', ...(model ? { model } : {}) };
      else if (b.kind === '7ots') {
        if (!next.home.url) return 'home';
        next.brain = { kind: '7ots' };
      } else return 'kind';
    }
    const viewWas = next.pet.view || '2d';
    const bdWas = next.pet.backdrop !== false;
    if (d.pet) {
      if (d.pet.annoy !== undefined) next.pet.annoy = Math.max(0, Math.min(3, Math.round(Number(d.pet.annoy)) || 0));
      if (['2d', '3d'].includes(d.pet.view)) next.pet.view = d.pet.view;
      if (d.pet.backdrop !== undefined) next.pet.backdrop = !!d.pet.backdrop;
      if (MUSIC_MODES.includes(d.pet.music)) next.pet.music = d.pet.music;
      if (d.pet.entrance && typeof d.pet.entrance === 'object') {
        const e = { ...CONFIG_DEFAULTS.pet.entrance, ...next.pet.entrance };
        if (d.pet.entrance.onStart !== undefined) e.onStart = !!d.pet.entrance.onStart;
        if ([...ENTRANCE_KINDS, 'random'].includes(d.pet.entrance.kind)) e.kind = d.pet.entrance.kind;
        if (d.pet.entrance.dance === '' || DANCES.includes(d.pet.entrance.dance)) e.dance = d.pet.entrance.dance;
        next.pet.entrance = e;
      }
      if (d.pet.musicVol !== undefined) next.pet.musicVol = Math.max(0, Math.min(1, Math.round(Number(d.pet.musicVol) * 100) / 100 || 0));
      if (d.pet.scenes) {
        const c = { ...sceneConf(next), ...d.pet.scenes };
        next.pet.scenes = {
          on: c.on !== false,
          every: SCENE_EVERY.includes(c.every) ? c.every : 'normal',
          list: Array.isArray(c.list) ? [...new Set(c.list.filter((n) => SCENE_NAMES.includes(n)))] : SCENE_NAMES,
        };
      }
    }
    if (d.access) for (const k of Object.keys(next.access)) if (typeof d.access[k] === 'boolean') next.access[k] = d.access[k];
    if (Array.isArray(d.access?.vmKinds)) next.access.vmKinds = [...new Set(d.access.vmKinds.filter((k) => VM_KINDS.includes(k)))];
    if (d.lang !== undefined) {
      if (!['', 'en', 'es', 'pt'].includes(d.lang)) return 'lang';
      next.lang = d.lang;
    }
    try {
      if (d.integrations) next.integrations = normalizeIntegrations(d.integrations, next.integrations);
      if (d.character) next.character = normalizeCharacter(d.character, next.character);
    } catch (e) {
      return e.message;
    }
    if (d.memory?.tokens !== undefined) {
      const n = Math.round(Number(d.memory.tokens)) || 0;
      next.memory.tokens = n <= 0 ? 0 : Math.max(2000, Math.min(200000, n));
    }
    if (d.senses && typeof d.senses === 'object') {
      const n = d.senses;
      if (typeof n.arm === 'boolean') next.senses.arm = n.arm;
      if (typeof n.reflect === 'boolean') next.senses.reflect = n.reflect;
      if (n.holdMs !== undefined) next.senses.holdMs = Math.max(200, Math.min(3000, Math.round(Number(n.holdMs)) || 600));
      if (n.fps !== undefined) next.senses.fps = Math.max(1, Math.min(15, Math.round(Number(n.fps)) || 5));
    }
    if (d.screen?.every !== undefined) next.screen.every = Math.max(1, Math.min(60, Math.round(Number(d.screen.every)) || 5));
    let reload = false;
    if (d.voice) {
      const vk = d.voice.kind ?? next.voice.kind;
      if (!['none', 'browser', 'local', 'elevenlabs', 'openai', 'apuchat', 'grok', 'fish'].includes(vk)) return 'voice';
      reload = vk !== next.voice.kind;
      next.voice = { ...next.voice, kind: vk };
      if (d.voice.expressive !== undefined) next.voice.expressive = !!d.voice.expressive;
      // each provider's own voice, model and style ({ elevenlabs: { voiceId, model }, openai: { voiceId, model, style } … })
      const pv = d.voice.providers;
      if (pv && typeof pv === 'object') {
        const providers = { ...(next.voice.providers || {}) };
        for (const [k, v] of Object.entries(pv)) {
          if (!VOICE_PROVIDERS.includes(k) || !v || typeof v !== 'object') continue;
          const clean = Object.fromEntries(['voiceId', 'model', 'style', 'name'].map((f) => [f, String(v[f] ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, f === 'style' ? 600 : 120)]).filter(([, x]) => x));
          if (Object.keys(clean).length) providers[k] = clean;
          else delete providers[k];
        }
        next.voice.providers = providers;
        reload = true;
      }
    }
    if (d.keys) {
      for (const [k, v] of Object.entries(d.keys)) {
        if (!SETTABLE_KEYS.includes(k) || typeof v !== 'string' || v.length > (k === 'SENSES_ICS_URL' ? 2000 : 400)) return 'key';
        saveKey(k, v.trim()); // '' removes it
      }
    }
    saveConfig(next);
    config = loadConfig();
    annoy = annoyOf(config);
    brainImpl = createBrain(config.brain, config.home);
    if (config.voice.kind === 'local') warmLocal();
    if (reload) setTimeout(() => broadcast({ reload: true }), 100); // the page reads its voice at load
    // 2D ↔ 3D: open pet windows switch now (the page, or the desktop shell when it needs the GPU back on).
    if ((config.pet.backdrop !== false) !== bdWas) setTimeout(() => broadcast({ backdrop: config.pet.backdrop !== false }), 100);
    else if ((config.pet.view || '2d') !== viewWas) (viewSet = config.pet.view), setTimeout(() => broadcast({ view: viewSet }), 100);
    log(`settings: brain ${brainLabel(config.brain)}`);
    return null;
  }

  /** A fresh daemon with the new identity; open pages wait for it and reload. */
  function restart() {
    broadcast({ restart: true });
    // Spawned by this process right before it exits (a timer after stop() never fired: exit came first).
    // The new one retries the port while this one lets go of it.
    stop(() => {
      const out = openSync(homeFile('pet.log'), 'a');
      spawn(process.execPath, [join(PKG_ROOT, 'cli', '7ots.mjs'), 'pet', '--daemon'], { detached: true, windowsHide: true, stdio: ['ignore', out, out], env: { ...process.env, SEVENOTS_PORT_WAIT: '1' } }).unref();
    });
  }

  function stop(then) {
    clearInterval(timer);
    clearInterval(syncTimer);
    clearTimeout(syncFirst);
    clearTimeout(syncSoon);
    assistant.stop();
    senses.stop();
    watchers.stop();
    stopWatch();
    savePet(pet);
    for (const c of clients) c.end();
    server.close();
    server.closeAllConnections?.();
    setTimeout(() => (then?.(), process.exit(0)), 200).unref();
  }

  return new Promise((resolve, reject) => {
    // After a restart the old daemon may hold the port a moment longer: keep trying for ~10 s.
    let tries = process.env.SEVENOTS_PORT_WAIT ? 40 : 0;
    server.on('error', (e) => (e.code === 'EADDRINUSE' && tries-- > 0 ? setTimeout(() => server.listen(port, '127.0.0.1'), 250) : reject(e)));
    server.listen(port, '127.0.0.1', () => {
      log(`pet ${identity.name} on http://127.0.0.1:${port}`);
      setTimeout(() => onEvent({ type: 'start' }), 1500);
      resolve({ port, token, identity, stop, onEvent });
    });
  });
}
