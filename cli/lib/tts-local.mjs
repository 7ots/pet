/**
 * Local voice: Piper (https://github.com/rhasspy/piper) in the venv ~/.7ots/stt, voices in ~/.7ots/voices.
 * Free and offline; the text never leaves the machine. Set up with:
 *   ~/.7ots/stt/bin/pip install piper-tts
 *   ~/.7ots/stt/bin/python -m piper.download_voices es_MX-claude-high en_US-lessac-medium --download-dir ~/.7ots/voices
 * The voice follows the language of each line (a Spanish line gets a Spanish voice), a bit higher-pitched for an ot.
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homeFile } from './paths.mjs';

const PY = () => homeFile(join('stt', 'bin', 'python'));
const DIR = () => homeFile('voices');

export function localVoices() {
  if (!existsSync(PY()) || !existsSync(DIR())) return [];
  return readdirSync(DIR()).filter((f) => f.endsWith('.onnx')).map((f) => f.slice(0, -5));
}

const ES = /[ñ¿¡áéíóú]|\b(que|el|la|los|las|de|es|por|para|con|una?|hola|estoy|tienes|aquí|qué|cómo|ya|pero|muy)\b/gi;
const PT = /[ãõç]|\b(você|não|está|obrigad[oa]|olá|muito|tudo)\b/gi;
function guessLang(text, fallback) {
  const es = (text.match(ES) || []).length;
  const pt = (text.match(PT) || []).length;
  const words = text.split(/\s+/).length;
  if (pt >= 2 && pt >= es / 2) return 'pt';
  if (es >= Math.max(2, words * 0.2)) return 'es';
  return /^(es|pt)$/.test(fallback) && es + pt > 0 ? fallback : 'en';
}

// One worker with the voices loaded, started on first use; jobs go one at a time.
let worker = null;
let queue = Promise.resolve();
function startWorker() {
  const p = spawn(PY(), [new URL('./tts-local.py', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const w = { p, buf: '', waiting: null };
  p.stdout.on('data', (d) => {
    w.buf += d;
    let i;
    while ((i = w.buf.indexOf('\n')) >= 0) {
      const line = w.buf.slice(0, i);
      w.buf = w.buf.slice(i + 1);
      w.waiting?.(line);
    }
  });
  p.on('exit', () => {
    if (worker === w) worker = null;
    w.waiting?.('error: worker exited');
  });
  p.unref();
  return w;
}
function say(voice, text, out) {
  const job = queue.then(
    () =>
      new Promise((res, rej) => {
        worker ||= startWorker();
        const w = worker;
        const timer = setTimeout(() => (w.p.kill(), rej(Object.assign(new Error('piper timeout'), { status: 504 }))), 30000);
        w.waiting = (line) => {
          clearTimeout(timer);
          w.waiting = null;
          line === 'ok' ? res() : rej(Object.assign(new Error(`piper ${line}`), { status: 502 }));
        };
        w.p.stdin.write(JSON.stringify({ voice, text, out }) + '\n');
      }),
  );
  queue = job.catch(() => {});
  return job;
}

/** → { audio: Buffer (wav), contentType } */
export async function synthesizeLocal(text, { lang = 'en', pitch = 1.12 } = {}) {
  const voices = localVoices();
  if (!voices.length) throw Object.assign(new Error('no local voice (see tts-local.mjs)'), { status: 501 });
  const l = guessLang(text, lang);
  const voice = voices.find((v) => v.startsWith(`${l}_`)) || voices.find((v) => v.startsWith('en_')) || voices[0];
  const out = join(tmpdir(), `7ots-tts-${process.pid}-${Date.now()}.wav`);
  try {
    await say(join(DIR(), `${voice}.onnx`), text.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ''), out);
    if (Math.abs(pitch - 1) < 0.01) return { audio: readFileSync(out), contentType: 'audio/wav' };
    // higher voice, same speed: resample up, then stretch the tempo back
    const audio = await new Promise((res, rej) =>
      execFile('ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', out, '-af', `asetrate=22050*${pitch},aresample=22050,atempo=${(1 / pitch).toFixed(4)}`, '-f', 'wav', '-'], { encoding: 'buffer', maxBuffer: 32 << 20 }, (e, stdout) =>
        {
          if (!e) return res(stdout);
          // ffmpeg failed: the plain voice, if there is one (a throw here would take the whole pet down)
          try {
            res(readFileSync(out));
          } catch (err) {
            rej(err);
          }
        },
      ),
    );
    return { audio, contentType: 'audio/wav' };
  } finally {
    try {
      unlinkSync(out);
    } catch {}
  }
}

/** Loads the voices ahead of time, so the first line isn't seconds late. */
export function warmLocal() {
  for (const v of localVoices()) say(join(DIR(), `${v}.onnx`), '.', join(tmpdir(), `7ots-warm-${process.pid}.wav`)).catch(() => {});
}
