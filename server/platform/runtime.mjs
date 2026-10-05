/**
 * Runtime de cada ots en la plataforma: su entorno, su LLM, su voz y sus canales.
 *
 * Cada ots tiene un "entorno" propio (un objeto, nunca process.env) hecho de:
 *   1. lo que fija la plataforma (hub de apuchat, API de apumail, servicio de voz),
 *   2. sus ajustes y claves (solo las de OTS_KEYS),
 *   3. si no trae clave de IA o de voz, la de la plataforma, con cupo gratis por cuenta y mes:
 *        PLATFORM_LLM_PROVIDER (anthropic | openai, compatibles como DeepSeek) · PLATFORM_LLM_API_KEY
 *        PLATFORM_LLM_BASE_URL (openai compatibles) · PLATFORM_LLM_MODEL
 *        (PLATFORM_ANTHROPIC_API_KEY sigue valiendo: equivale a provider anthropic + esa clave)
 *        PLATFORM_FREE_MESSAGES       respuestas de IA gratis por cuenta y mes (defecto 100)
 *        PLATFORM_APUCHAT_VOICE_TOKEN · PLATFORM_FREE_TTS (audios gratis por cuenta y mes, defecto 100)
 * Así un ots nunca ve las claves del proceso ni las de otro ots.
 */

import { createLLM } from '../llm.mjs';
import { synthesize as synthesizeWith, ttsProvider, openaiTtsKey } from '../tts.mjs';
import { startAgentChannels } from '../channels/index.mjs';
import { apumailConfigFromEnv } from '../channels/apumail.mjs';
import { apuchatConfigFromEnv } from '../channels/apuchat.mjs';
import { i18nError } from '../i18n.mjs';
import { OTS_KEYS, accountUsage, addUsage, allLiveOts, getOts, logTurn } from './store.mjs';
import { orquestaTools } from './orquesta.mjs';

const penv = process.env;
const FIXED = ['APUCHAT_HUB', 'APUMAIL_API', 'APUCHAT_VOICE_URL'];
// Where tenants' tokens are sent: read once at boot, so nothing that writes process.env later can redirect them.
const BOOT_FIXED = Object.freeze(Object.fromEntries(FIXED.filter((k) => penv[k]).map((k) => [k, penv[k]])));
// Platform-paid calls in flight per account (counted with usage, so parallel requests can't overrun the quota).
const inflight = new Map(); // `${accountId}:${kind}` → n
const MAX_INFLIGHT = () => Number(penv.PLATFORM_MAX_INFLIGHT || 4);
const LLM_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
const TTS_KEYS = ['APUCHAT_VOICE_TOKEN', 'ELEVENLABS_API_KEY', 'XAI_API_KEY', 'FISH_API_KEY', 'OPENAI_API_KEY'];

/** IA de la plataforma, o null si no hay. Nunca se mezcla con ajustes del ots (ni base URL ni modelo). */
export function platformLlmEnv() {
  const key = penv.PLATFORM_LLM_API_KEY || penv.PLATFORM_ANTHROPIC_API_KEY;
  if (!key) return null;
  const provider = (penv.PLATFORM_LLM_PROVIDER || (penv.PLATFORM_LLM_API_KEY ? 'openai' : 'anthropic')).toLowerCase();
  const base = { LLM_EFFORT: 'low', LLM_MAX_TOKENS: '4000' };
  if (provider === 'openai') return { ...base, LLM_PROVIDER: 'openai', OPENAI_API_KEY: key, LLM_BASE_URL: penv.PLATFORM_LLM_BASE_URL || '', LLM_MODEL: penv.PLATFORM_LLM_MODEL || 'gpt-4.1-mini' };
  return { ...base, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: key, LLM_MODEL: penv.PLATFORM_LLM_MODEL || 'claude-sonnet-5-5' };
}

export const freeMessages = () => Number(penv.PLATFORM_FREE_MESSAGES ?? 100);
export const freeTts = () => Number(penv.PLATFORM_FREE_TTS ?? 100);

/**
 * Entorno del ots.
 * @returns {{ env: object, llmEnv: object, platformLlm: boolean, platformTts: boolean }}
 */
export function otsEnv(ots) {
  const env = {};
  Object.assign(env, BOOT_FIXED);
  for (const [k, meta] of Object.entries(OTS_KEYS)) {
    const v = meta.secret ? ots.secrets[k] : ots.settings[k];
    if (v == null || v === '') continue;
    env[k] = meta.max ? String(Math.min(meta.max, Math.max(0, Number(v) || 0))) : String(v);
  }

  // IA: la suya o la de la plataforma (modelo fijo para controlar el coste).
  let platformLlm = false;
  const provider = (env.LLM_PROVIDER || '').toLowerCase();
  const ownLlm = provider === 'openai' ? !!env.OPENAI_API_KEY : provider === 'anthropic' ? !!env.ANTHROPIC_API_KEY : LLM_KEYS.some((k) => env[k]);
  if (provider === 'mock') {
    // Modo de pruebas: sin IA real.
  } else if (!ownLlm && platformLlmEnv()) {
    platformLlm = true;
  } else if (!ownLlm) {
    env.LLM_PROVIDER = 'mock';
  }
  // The platform key lives only in llmEnv (never in env, which voice and channels see), and none of the
  // ot's own settings (provider, model, base URL) reach it.
  const llmEnv = platformLlm ? platformLlmEnv() : env;

  // Voz: la suya o la de apuchat de la plataforma.
  let platformTts = false;
  if (!TTS_KEYS.some((k) => (k === 'OPENAI_API_KEY' ? openaiTtsKey(env) : env[k])) && penv.PLATFORM_APUCHAT_VOICE_TOKEN && (!env.TTS_PROVIDER || env.TTS_PROVIDER === 'apuchat')) {
    platformTts = true;
    // On the platform's token the engine and model are the platform's, not the ot's.
    delete env.APUCHAT_VOICE_PROVIDER;
    delete env.APUCHAT_VOICE_MODEL;
    Object.assign(env, { TTS_PROVIDER: 'apuchat', APUCHAT_VOICE_TOKEN: penv.PLATFORM_APUCHAT_VOICE_TOKEN });
  }
  return { env, llmEnv, platformLlm, platformTts };
}

// ───────────────────────────── LLM con cupo ─────────────────────────────

const llms = new Map(); // ots.id → { stamp, llm }

/** LLM del ots (se rehace cuando cambia el ots). */
function rawLlm(ots) {
  const stamp = ots.updatedAt;
  const hit = llms.get(ots.id);
  if (hit?.stamp === stamp) return hit;
  const { llmEnv, platformLlm } = otsEnv(ots);
  const entry = { stamp, llm: createLLM(llmEnv), platformLlm };
  if (llms.size > 2000) llms.clear();
  llms.set(ots.id, entry);
  return entry;
}

/** ¿Le queda cupo gratis a la cuenta? */
export function llmAllowed(ots) {
  const { platformLlm } = rawLlm(ots);
  return !platformLlm || accountUsage(ots.accountId, 'llm_platform') < freeMessages();
}

/**
 * Takes one unit of the account's free quota before a platform-paid call (synchronous, so it is atomic in Node).
 * Returns release(spent): on success the unit becomes usage; on failure it is given back.
 */
function reserve(ots, kind, limit, errorKey) {
  const k = `${ots.accountId}:${kind}`;
  const n = inflight.get(k) || 0;
  if (accountUsage(ots.accountId, kind) + n >= limit) throw i18nError(402, errorKey);
  if (n >= MAX_INFLIGHT()) throw i18nError(429, 'server.http.rateLimited');
  inflight.set(k, n + 1);
  return (spent) => {
    const left = (inflight.get(k) || 1) - 1;
    if (left > 0) inflight.set(k, left);
    else inflight.delete(k);
    if (spent) addUsage(ots, kind);
  };
}

/**
 * Un paso de LLM para este ots, contando el uso.
 * Sin cupo lanza 402 con clave `platform.quota.llm` (la ruta lo convierte en una respuesta amable).
 */
export async function otsStep(ots, args) {
  const { llm, platformLlm } = rawLlm(ots);
  const release = platformLlm ? reserve(ots, 'llm_platform', freeMessages(), 'platform.quota.llm') : null;
  let out;
  try {
    out = await llm.step(args);
  } catch (e) {
    release?.(false);
    // The platform's provider errors stay in our logs (they can echo parts of the platform key).
    if (platformLlm) {
      console.error('[7ots] platform llm', e?.status || '', e?.message || e);
      throw i18nError(502, 'server.http.internal');
    }
    throw e;
  }
  release?.(true);
  addUsage(ots, 'llm');
  return out;
}

export function otsLlmInfo(ots) {
  const { llm, platformLlm } = rawLlm(ots);
  return { name: llm.name, model: llm.model, platform: platformLlm };
}

// ───────────────────────────── voz ─────────────────────────────

export async function otsSynthesize(ots, { text, voice = ots.identity.voice }) {
  const { env, platformTts } = otsEnv(ots);
  const release = platformTts ? reserve(ots, 'tts_platform', freeTts(), 'platform.quota.tts') : null;
  let out;
  try {
    out = await synthesizeWith({ text, voice: platformTts && voice && typeof voice === 'object' ? { ...voice, model: undefined } : voice, env });
  } catch (e) {
    release?.(false);
    throw e;
  }
  release?.(true);
  addUsage(ots, 'tts');
  return out;
}

export function otsTtsProvider(ots) {
  return ttsProvider(otsEnv(ots).env);
}

// ───────────────────────────── canales ─────────────────────────────

const channels = new Map(); // ots.id → { stamp, ch }
const NO_CHANNELS = {
  handle: async () => false,
  live: () => ({ email: false, apuchat: null, meet: false }),
  openCall: () => {
    throw i18nError(501, 'server.channels.noApuchat');
  },
  status: () => ({ apumail: false, apuchat: false }),
  stop: async () => {},
};

/** Clave que identifica la configuración de canales (si no cambia, no se reinician). */
function channelStamp(ots) {
  const { env } = otsEnv(ots);
  return JSON.stringify([ots.status, ...Object.keys(OTS_KEYS).filter((k) => OTS_KEYS[k].channels).map((k) => env[k] || '')]);
}

/** Canales del ots (apumail/apuchat), arrancándolos o reiniciándolos si hace falta. */
export function otsChannels(ots) {
  if (!ots || ots.status !== 'on') return NO_CHANNELS;
  const stamp = channelStamp(ots);
  const hit = channels.get(ots.id);
  if (hit?.stamp === stamp) return hit.ch;
  hit?.ch.stop().catch(() => {});
  const { env } = otsEnv(ots);
  const id = ots.id;
  // Siempre la versión vigente del ots: identidad e instrucciones cambian sin reiniciar.
  const current = () => getOts(id) || ots;
  const ch = startAgentChannels({
    llm: { get name() { return otsLlmInfo(current()).name; }, get model() { return otsLlmInfo(current()).model; }, step: (a) => otsStep(current(), a) },
    identity: () => current().identity,
    instructions: () => current().settings.SERVER_INSTRUCTIONS || '',
    config: { apumail: { ...apumailConfigFromEnv(env), webhookSecret: '' }, apuchat: apuchatConfigFromEnv(env) },
    log: (...a) => console.log(`[7ots:${id}]`, ...a),
    // Orquesta tasks: only for senders on the ot's own list (see orquesta.mjs), read on every message.
    tools: (ctx) => orquestaTools(current(), ctx),
    // mails and DMs go to its conversations (dashboard, and the desktop ot through /api/device/…/inbox)
    onTurn: ({ key, channel, user, reply }) => logTurn(current(), { key, channel: channel === 'dm' ? 'apuchat' : 'apumail', visitor: key.replace(/^\w+:/, ''), user, reply }),
  });
  channels.set(id, { stamp, ch });
  return ch;
}

/** Para los canales de un ots (al pausarlo o borrarlo). */
export async function stopOtsChannels(id) {
  const hit = channels.get(id);
  channels.delete(id);
  llms.delete(id);
  await hit?.ch.stop().catch(() => {});
}

/** Arranca los canales de todos los ots encendidos que los tengan configurados. */
export function startAllChannels() {
  for (const ots of allLiveOts()) {
    const s = ots.settings;
    const sec = ots.secrets;
    if ((s.APUMAIL_AGENT_INBOX && sec.APUMAIL_AGENT_TOKEN) || sec.APUCHAT_AGENT_IDENTITY_KEY) otsChannels(ots);
  }
}

export async function stopAllChannels() {
  await Promise.all([...channels.keys()].map(stopOtsChannels));
}
