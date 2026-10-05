/**
 * Configuration written by the wizard (`7ots setup`) and the local keys.
 *
 * ~/.7ots/config.json
 *   lang   'en' | 'es' | 'pt'
 *   home   where the ot lives:   { kind: 'local' }
 *                                { kind: '7ots', url: 'https://7ots.com/api/o/<id>' }   hosted on 7ots.com
 *                                { kind: 'server', url: 'https://your.site/api/agent' } your own 7ots-server
 *                                { kind: 'orquesta', projectId, projectName }            a getorquesta.com project
 *   brain  who thinks:           { kind: 'lines' }                                       built-in phrases, no AI
 *                                { kind: 'cli', cli: 'claude'|'codex'|'gemini'|'ollama'|'custom', model?, command? }
 *                                { kind: 'api', provider: 'anthropic'|'openai', model?, baseUrl? }
 *                                { kind: '7ots' }                                        the home's /chat (7ots or own server)
 *                                { kind: 'batuta', model? }                              Orquesta's Batuta LLM
 *   voice  how it speaks:        { kind: 'none'|'browser'|'local'|'apuchat'|'elevenlabs'|'grok'|'fish'|'openai', voiceId? }
 *   pet    { mode: 'ask'|'desktop'|'terminal'|'browser', annoy: 0..3, view?: '2d'|'3d' }
 *   access what the pet may see and do (the settings page, /settings):
 *          { agent: true,   the details of your coding agent / terminal (prompts, commands, tools) go to the brain
 *            memory: true,  it keeps notes about you and uses them when answering
 *            open: true,    it may open sites in your browser (reminders, "open my mail")
 *            notify: true,  desktop notifications when a reminder fires
 *            sites: true,   for sites you mention, it reads their usage guide on Prowl.world (only the domain is sent; prowl.mjs)
 *            screen: false, it looks at the active window and, every screen.every minutes, a screenshot (screen.mjs)
 *            processes: false, it sees which programs run (name, cpu, memory) and can wait for one to finish
 *            logs: false,   it may read the logs of running processes (journal, pm2, docker, a log file) when asked
 *            inbox: false,  it may read your email (apumail inbox) when asked
            vm: false,     it may send long jobs to its worker on your own server (vm.mjs; context filtered by the above)
            vmKinds: ['research','browse','long'] }  which kinds (code and shell only if you add them)
 *   integrations { orquesta: { on, projectId?, projectName? }   talk to your Orquesta agents
 *                  apumail: { on, inbox }                         email (APUMAIL_TOKEN)
 *                  custom: [{ id, name, instructions, url?, command?, envVar?, on }] }  told to the brain
 *   character { backstory, style, quirks, examples, scenario, greeting,   the character sheet (chara_card_v2)
 *               letta?: { on, agentId } }                                   persona memory on Letta (LETTA_API_KEY)
 *   screen { every: 5 }  minutes between screenshots
 *
 * ~/.7ots/keys.json (0600) keeps the keys typed in the wizard under their usual env-var names
 * (and, on a server enrolled with `7ots vm enroll`, its worker token SEVENOTS_VM_TOKEN).
 * Variables already set in the environment always win over the file.
 */

import { homeFile, readJson, writeJson } from './paths.mjs';

export const KEY_NAMES = ['SEVENOTS_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ORQUESTA_TOKEN', 'APUCHAT_VOICE_TOKEN', 'ELEVENLABS_API_KEY', 'XAI_API_KEY', 'FISH_API_KEY', 'LETTA_API_KEY', 'APUMAIL_TOKEN', 'SEVENOTS_VM_TOKEN'];
export const ORQUESTA_URL = (process.env.ORQUESTA_URL || 'https://getorquesta.com').replace(/\/+$/, '');

export const CONFIG_DEFAULTS = Object.freeze({
  lang: '',
  home: { kind: 'local' },
  brain: { kind: 'lines' },
  voice: { kind: 'browser' },
  pet: { mode: 'ask', annoy: 2, music: 'synth', musicVol: 0.5, entrance: { onStart: false, kind: 'wwe', dance: '' } },
  access: { agent: true, memory: true, open: true, notify: true, sites: true, screen: false, processes: false, logs: false, inbox: false, vm: false, vmKinds: ['research', 'browse', 'long'] },
  screen: { every: 5 },
  // conversation memory: recent turns up to `tokens` (≈chars/4), older ones compacted into a summary; 0 = off
  memory: { tokens: 20000 },
  integrations: { orquesta: { on: false }, apumail: { on: false, inbox: '' }, custom: [] },
  character: {},
});

export function loadConfig() {
  const c = readJson(homeFile('config.json'), {}) || {};
  return {
    ...CONFIG_DEFAULTS,
    ...c,
    home: { ...CONFIG_DEFAULTS.home, ...c.home },
    brain: { ...CONFIG_DEFAULTS.brain, ...c.brain },
    voice: { ...CONFIG_DEFAULTS.voice, ...c.voice },
    pet: { ...CONFIG_DEFAULTS.pet, ...c.pet },
    access: { ...CONFIG_DEFAULTS.access, ...c.access },
    screen: { ...CONFIG_DEFAULTS.screen, ...c.screen },
    memory: { ...CONFIG_DEFAULTS.memory, ...c.memory },
    integrations: {
      orquesta: { ...CONFIG_DEFAULTS.integrations.orquesta, ...c.integrations?.orquesta },
      apumail: { ...CONFIG_DEFAULTS.integrations.apumail, ...c.integrations?.apumail },
      custom: Array.isArray(c.integrations?.custom) ? c.integrations.custom : [],
    },
    character: { ...(c.character && typeof c.character === 'object' ? c.character : {}) },
  };
}

export function saveConfig(config) {
  writeJson(homeFile('config.json'), config);
}

export function loadKeys() {
  return readJson(homeFile('keys.json'), {}) || {};
}

export function saveKey(name, value) {
  if (!KEY_NAMES.includes(name)) throw new Error(`unknown key ${name}`);
  const keys = loadKeys();
  if (value) keys[name] = String(value).trim();
  else delete keys[name];
  writeJson(homeFile('keys.json'), keys, { secret: true });
}

/** keys.json + process.env (the environment wins). Never print this object. */
export function env() {
  const out = { ...loadKeys() };
  for (const k of KEY_NAMES) if (process.env[k]) out[k] = process.env[k];
  return out;
}

export const hasKey = (name) => Boolean(env()[name]);
