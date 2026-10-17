/**
 * Speech to text for voice control: the pet page records a short clip (webm/opus) and POSTs it to /stt.
 * Local first: faster-whisper in the venv ~/.7ots/stt (free, the audio never leaves the machine), one worker kept loaded:
 *   python3 -m venv ~/.7ots/stt && ~/.7ots/stt/bin/pip install faster-whisper
 * otherwise whichever key is configured: OpenAI (OPENAI_API_KEY), then ElevenLabs (ELEVENLABS_API_KEY).
 * Without any, voice control is off and the page says so.
 */

import { spawn } from 'node:child_process';
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

// One Whisper worker, started on first use (or by warmStt) and kept: jobs go one at a time.
let worker = null;
let queue = Promise.resolve();
function startWorker() {
  const p = spawn(LOCAL_PY(), [SCRIPT, process.env.SEVENOTS_STT_MODEL || ''], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const w = { p, buf: '', waiting: null };
  p.stdout.on('data', (d) => {
    w.buf += d;
    let i;
    while ((i = w.buf.indexOf('\n')) >= 0) {
      const line = w.buf.slice(0, i);
      w.buf = w.buf.slice(i + 1);
      let m = {};
      try {
        m = JSON.parse(line);
      } catch {}
      if (!m.ready) w.waiting?.(m);
    }
  });
  p.on('exit', () => {
    if (worker === w) worker = null;
    w.waiting?.({ error: 'worker exited' });
  });
  p.unref();
  return w;
}
function local(file, lang) {
  const job = queue.then(
    () =>
      new Promise((res, rej) => {
        worker ||= startWorker();
        const w = worker;
        const timer = setTimeout(() => (w.p.kill(), rej(Object.assign(new Error('local stt: timeout'), { status: 504 }))), 90000);
        w.waiting = (m) => {
          clearTimeout(timer);
          w.waiting = null;
          m.error === undefined ? res(String(m.text || '').trim()) : rej(Object.assign(new Error(`local stt: ${m.error}`), { status: 502 }));
        };
        w.p.stdin.write(JSON.stringify({ file, lang }) + '\n');
      }),
  );
  queue = job.catch(() => {});
  return job;
}

/** Loads the local model ahead of the first clip (the voice button, the wake word). */
export function warmStt() {
  if (existsSync(LOCAL_PY())) worker ||= startWorker();
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
      return { text: await local(f, lang), provider };
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
