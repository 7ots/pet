/**
 * Speech to text for voice control: the pet page records a short clip (webm/opus) and POSTs it to /stt.
 * Local first: faster-whisper in the venv ~/.7ots/stt (free, the audio never leaves the machine):
 *   python3 -m venv ~/.7ots/stt && ~/.7ots/stt/bin/pip install faster-whisper
 * otherwise whichever key is configured: OpenAI (OPENAI_API_KEY), then ElevenLabs (ELEVENLABS_API_KEY).
 * Without any, voice control is off and the page says so.
 */

import { execFile } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homeFile } from './paths.mjs';

const LOCAL_PY = () => homeFile(join('stt', 'bin', 'python'));
const SCRIPT = new URL('./stt-local.py', import.meta.url).pathname;

const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

export function sttProvider(keys) {
  if (existsSync(LOCAL_PY())) return 'local';
  if (keys.OPENAI_API_KEY) return 'openai';
  if (keys.ELEVENLABS_API_KEY) return 'elevenlabs';
  return null;
}

/** → { text } ; throws with .status on provider errors. */
export async function transcribe({ audio, contentType = 'audio/webm', lang = '', env = {} }) {
  const provider = sttProvider(env);
  if (!provider) throw Object.assign(new Error('no speech-to-text key (OPENAI_API_KEY or ELEVENLABS_API_KEY)'), { status: 501 });
  const type = String(contentType).split(';')[0].trim();
  if (provider === 'local') {
    const f = join(tmpdir(), `7ots-voice-${process.pid}-${Date.now()}.${EXT[type] || 'webm'}`);
    writeFileSync(f, audio, { mode: 0o600 });
    try {
      const text = await new Promise((res, rej) =>
        execFile(LOCAL_PY(), [SCRIPT, f, lang || ''], { timeout: 60000, windowsHide: true }, (e, out) => (e ? rej(Object.assign(new Error(`local stt: ${e.message.split('\n')[0]}`), { status: 502 })) : res(String(out).trim()))),
      );
      return { text, provider };
    } finally {
      try {
        unlinkSync(f);
      } catch {}
    }
  }
  const file = new Blob([audio], { type });
  const name = `voice.${EXT[type] || 'webm'}`;
  const form = new FormData();
  let url;
  let headers;
  if (provider === 'openai') {
    url = 'https://api.openai.com/v1/audio/transcriptions';
    headers = { Authorization: `Bearer ${env.OPENAI_API_KEY}` };
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('file', file, name);
    if (lang) form.append('language', lang);
  } else {
    url = 'https://api.elevenlabs.io/v1/speech-to-text';
    headers = { 'xi-api-key': env.ELEVENLABS_API_KEY };
    form.append('model_id', 'scribe_v1');
    form.append('file', file, name);
    if (lang) form.append('language_code', lang);
  }
  const res = await fetch(url, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw Object.assign(new Error(`${provider} stt ${res.status}`), { status: 502 });
  const j = await res.json();
  return { text: String(j.text || '').trim(), provider };
}
