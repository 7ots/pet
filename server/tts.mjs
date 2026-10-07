/**
 * Texto → voz en el servidor (las claves nunca llegan al navegador).
 * 7ots no aloja audio: solo se integra con tus propias cuentas, con las claves del entorno del proxy.
 *
 * TTS_PROVIDER (vacío = el primero configurado, en este orden):
 *   apuchat     → audio de apuchat (voice.apuchat.com, POST /speak).
 *                 APUCHAT_VOICE_TOKEN (cabecera X-Voice-Test-Token), APUCHAT_VOICE_URL (https://voice.apuchat.com),
 *                 APUCHAT_VOICE_ID (voz: narrator, es_locutor, adam, eve… o un id crudo), APUCHAT_VOICE_PROVIDER
 *                 (fish | elevenlabs | xai; vacío = el servidor elige y hace respaldo)
 *   elevenlabs  → ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL (eleven_multilingual_v2)
 *   grok        → xAI (POST https://api.x.ai/v1/tts). XAI_API_KEY, XAI_TTS_VOICE (eve, ara, leo, rex, sal o voz propia)
 *   fish        → Fish Audio (POST https://api.fish.audio/v1/tts). FISH_API_KEY, FISH_VOICE_ID (reference_id;
 *                 vacío = voz propia del modelo), FISH_MODEL (vacío = s2.1-pro; va en la cabecera `model`)
 *   openai      → (compatibilidad) OPENAI_API_KEY (solo si LLM_BASE_URL es OpenAI o está vacío; si no, OPENAI_TTS_API_KEY), OPENAI_TTS_MODEL (gpt-4o-mini-tts), OPENAI_TTS_VOICE (alloy)
 *   none        → 501: el widget usa la voz del navegador (speechSynthesis)
 *
 * La voz de la identidad del agente (server/identity.mjs → voice) manda sobre las variables:
 *   provider  'apuchat' | 'elevenlabs' | 'grok' | 'fish' | 'openai' fuerza ese proveedor
 *             ('auto' = el de TTS_PROVIDER; 'browser' = 501)
 *   voiceId   voz de apuchat, id de voz de ElevenLabs, voz de xAI, reference_id de Fish o voz de OpenAI
 *   model     modelo de TTS (ElevenLabs, Fish, OpenAI y apuchat; xAI tiene un único modelo)
 *   style     instrucciones de estilo (solo gpt-4o-mini-tts): "cálida, pausada, acento neutro"
 *   lang      idioma (xAI lo exige: es-ES, es-MX, pt-BR, en…; si no lo admite, 'auto')
 *   rate      velocidad (OpenAI: 0,25–4; ElevenLabs: 0,7–1,2; xAI: 0,7–1,5; Fish: 0,5–2)
 *
 * Devuelve { audio: Buffer, contentType } o lanza un Error con .status.
 */

import { OPENAI_VOICES } from './identity.mjs';
import { i18nError } from './i18n.mjs';
import { speechTagsFor } from '../src/voice/tags.js';

const PROVIDERS = ['apuchat', 'elevenlabs', 'grok', 'fish', 'openai'];
const TIMEOUT_MS = 20_000;

/** @param {Record<string,string|undefined>} [env]  configuración (defecto: process.env; en la plataforma, la del ots) */
export function ttsProvider(env = process.env) {
  if (env.TTS_PROVIDER) return env.TTS_PROVIDER.toLowerCase();
  if (env.APUCHAT_VOICE_TOKEN) return 'apuchat';
  if (env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (env.XAI_API_KEY) return 'grok';
  if (env.FISH_API_KEY) return 'fish';
  if (openaiTtsKey(env)) return 'openai';
  return 'none';
}

/**
 * ¿OPENAI_API_KEY sirve para la voz de OpenAI? No si el LLM apunta a otro servicio compatible
 * (LLM_BASE_URL = DeepSeek, Groq, OpenRouter…): esa clave es de ese servicio y OpenAI la rechazaría
 * (antes: auto-detección → 'openai' → 502 en cada frase). OPENAI_TTS_API_KEY la fuerza.
 */
export function openaiTtsKey(env = process.env) {
  if (env.OPENAI_TTS_API_KEY) return env.OPENAI_TTS_API_KEY;
  if (!env.OPENAI_API_KEY) return '';
  const base = String(env.LLM_BASE_URL || '').trim();
  return !base || /^https?:\/\/api\.openai\.com(\/|$)/i.test(base) ? env.OPENAI_API_KEY : '';
}

export async function synthesize({ text, voice = {}, env = process.env }) {
  const provider = PROVIDERS.includes(voice.provider) ? voice.provider : voice.provider === 'browser' ? 'none' : ttsProvider(env);
  const input = speechTagsFor(text, provider, voice.model || (provider === 'elevenlabs' ? env.ELEVENLABS_MODEL : '')).slice(0, 1500);
  if (!input) throw i18nError(400, 'server.tts.empty');

  if (provider === 'apuchat') {
    // Contrato real de voice.apuchat.com: POST /speak { text, voice?, provider?, model?, lang?, summarize? } → mp3.
    // Sin token el servicio responde 402 (pago x402 por llamada), que el proxy no hace.
    if (!env.APUCHAT_VOICE_TOKEN) throw i18nError(501, 'server.tts.noApuchatToken');
    const base = (env.APUCHAT_VOICE_URL || 'https://voice.apuchat.com').replace(/\/+$/, '');
    const engine = (env.APUCHAT_VOICE_PROVIDER || '').toLowerCase();
    const res = await post(`${base}/speak`, {
      headers: { 'X-Voice-Test-Token': env.APUCHAT_VOICE_TOKEN, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: {
        text: input,
        summarize: false, // decir el texto tal cual, sin resumirlo
        ...(voice.voiceId || env.APUCHAT_VOICE_ID ? { voice: voice.voiceId || env.APUCHAT_VOICE_ID } : {}),
        ...(['fish', 'elevenlabs', 'xai'].includes(engine) ? { provider: engine } : {}),
        ...(voice.model ? { model: voice.model } : {}),
        ...(voice.lang ? { lang: voice.lang } : {}),
      },
    }, 'apuchat');
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'audio/mpeg' };
  }

  if (provider === 'elevenlabs') {
    if (!env.ELEVENLABS_API_KEY) throw i18nError(501, 'server.tts.noKey', { provider: 'ElevenLabs', key: 'ELEVENLABS_API_KEY' });
    const voiceId = voice.voiceId || env.ELEVENLABS_VOICE_ID;
    if (!voiceId) throw i18nError(501, 'server.tts.noElevenVoice');
    const res = await post(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: {
        text: input,
        model_id: voice.model || env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
        ...(voice.rate && voice.rate !== 1 ? { voice_settings: { speed: clamp(voice.rate, 0.7, 1.2) } } : {}),
      },
    }, 'ElevenLabs');
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
  }

  if (provider === 'grok') {
    // xAI TTS: POST /v1/tts → bytes de audio (JSON en base64 solo con with_timestamps, que no usamos).
    if (!env.XAI_API_KEY) throw i18nError(501, 'server.tts.noKey', { provider: 'xAI (Grok)', key: 'XAI_API_KEY' });
    const res = await post('https://api.x.ai/v1/tts', {
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: {
        text: input,
        voice_id: String(voice.voiceId || env.XAI_TTS_VOICE || 'eve').toLowerCase(),
        language: xaiLanguage(voice.lang),
        output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
        ...(voice.rate && voice.rate !== 1 ? { speed: clamp(voice.rate, 0.7, 1.5) } : {}),
      },
    }, 'xAI');
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
  }

  if (provider === 'fish') {
    if (!env.FISH_API_KEY) throw i18nError(501, 'server.tts.noKey', { provider: 'Fish Audio', key: 'FISH_API_KEY' });
    const referenceId = voice.voiceId || env.FISH_VOICE_ID; // vacío = voz propia del modelo
    const res = await post('https://api.fish.audio/v1/tts', {
      headers: {
        Authorization: `Bearer ${env.FISH_API_KEY}`,
        'Content-Type': 'application/json',
        // el modelo va en la cabecera, no en el cuerpo; sin ella Fish usa su modelo por defecto (s2.1-pro)
        ...(voice.model || env.FISH_MODEL ? { model: voice.model || env.FISH_MODEL } : {}),
      },
      body: {
        text: input,
        format: 'mp3',
        ...(referenceId ? { reference_id: referenceId } : {}),
        ...(voice.rate && voice.rate !== 1 ? { prosody: { speed: clamp(voice.rate, 0.5, 2) } } : {}),
      },
    }, 'Fish Audio');
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
  }

  if (provider === 'openai') {
    const key = openaiTtsKey(env);
    if (!key) throw i18nError(501, 'server.tts.noKey', { provider: 'OpenAI', key: env.OPENAI_API_KEY ? 'OPENAI_TTS_API_KEY' : 'OPENAI_API_KEY' });
    const openai = await openaiClient(key); // TTS siempre contra OpenAI (no LLM_BASE_URL)
    const model = voice.model || env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
    const res = await openai.audio.speech.create({
      model,
      voice: (OPENAI_VOICES.includes(voice.voiceId) && voice.voiceId) || env.OPENAI_TTS_VOICE || 'alloy', // un id de otro proveedor aquí daría 400
      input,
      response_format: 'mp3',
      ...(voice.style && /gpt-4o/.test(model) ? { instructions: voice.style } : {}),
      ...(voice.rate && voice.rate !== 1 ? { speed: clamp(voice.rate, 0.25, 4) } : {}),
    });
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
  }

  throw i18nError(501, 'server.tts.notConfigured');
}

const openaiClients = new Map();
async function openaiClient(apiKey) {
  if (!openaiClients.has(apiKey)) {
    const { default: OpenAI } = await import('openai');
    if (openaiClients.size > 200) openaiClients.clear();
    openaiClients.set(apiKey, new OpenAI({ apiKey }));
  }
  return openaiClients.get(apiKey);
}

/**
 * POST JSON con tiempo límite. Si el proveedor falla, 502 con un motivo accionable: solo el código y el mensaje
 * corto del proveedor (sin correos ni ids de request), nunca su respuesta entera (podría llevar datos de la cuenta).
 */
async function post(url, { headers, body }, name) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw httpError(502, `${name} unreachable`);
  }
  if (!res.ok) throw providerError(name, res.status, await res.text().catch(() => ''));
  return res;
}

/**
 * Error de un proveedor de voz → mensaje que dice qué hacer. Formatos reales (2026-10-07):
 *   ElevenLabs  { detail: { code: 'paid_plan_required' | 'quota_exceeded' | 'unauthorized', status, message } }
 *   xAI         { code, error: 'Incorrect API key provided…' }  (¡clave inválida = 400, no 401!)
 *   apuchat     { code: 'invalid_token', reason }  401 · sin token 402 (x402)
 */
export function providerError(name, status, raw) {
  let j = {};
  try {
    j = JSON.parse(raw);
  } catch {}
  const d = j && typeof j.detail === 'object' && j.detail ? j.detail : j || {};
  const code = String(d.code || d.status || '').toLowerCase();
  const said = String((typeof d.message === 'string' && d.message) || (typeof j.error === 'string' && j.error) || (typeof j.error?.message === 'string' && j.error.message) || j.reason || (typeof j.detail === 'string' && j.detail) || '');
  const detail = said ? `: ${said.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]').replace(/\s+/g, ' ').trim().slice(0, 180)}` : '';
  const err = (key, vars = {}) => Object.assign(i18nError(502, `server.tts.${key}`, { provider: name, status, detail, ...vars }), { providerStatus: status });
  if (name === 'apuchat' && status === 401) return err('apuchatToken');
  if (name === 'apuchat' && status === 402) return err('apuchatPay');
  if (name === 'ElevenLabs' && (status === 402 || /paid_plan|payment_required/.test(code))) return err('elevenPaid');
  if (name === 'ElevenLabs' && /quota|credit/.test(code)) return err('elevenQuota');
  if (status === 401 || status === 403 || /api key|invalid_api_key|unauthorized|authentication/i.test(`${code} ${said}`)) return err('badKey');
  return err('failed');
}

// Idiomas que admite xAI TTS (docs.x.ai); el resto se deja en 'auto'.
const XAI_LANGS = ['en', 'ar-EG', 'ar-SA', 'ar-AE', 'bn', 'zh', 'fr', 'de', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'pt-PT', 'ru', 'es-MX', 'es-ES', 'tr', 'vi'];

function xaiLanguage(lang) {
  const l = String(lang || '').toLowerCase();
  if (!l) return 'auto';
  const exact = XAI_LANGS.find((x) => x.toLowerCase() === l);
  if (exact) return exact;
  const base = l.split('-')[0];
  if (XAI_LANGS.includes(base)) return base; // en-US → en, fr-FR → fr
  if (base === 'es') return 'es-ES';
  if (base === 'pt') return 'pt-BR';
  return 'auto';
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
