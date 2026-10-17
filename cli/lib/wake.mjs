/**
 * Wake word: "oye <name>" ("hey" / "ei") opens the mic like the 🎙️ button (voice.wake in config, off by default).
 * Vosk in the venv ~/.7ots/stt (wake-local.py) reads the default microphone on this computer and only looks for the
 * trigger: no audio is kept or sent. The first time it is turned on it adds vosk + sounddevice to the venv and the
 * small model of the ot's language (~40-60 MB from alphacephei.com) into ~/.7ots/stt/vosk-<lang>.
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homeFile } from './paths.mjs';

const PY = () => homeFile(join('stt', 'bin', 'python'));
const SCRIPT = new URL('./wake-local.py', import.meta.url).pathname;
const MODELS = { es: 'vosk-model-small-es-0.42', en: 'vosk-model-small-en-us-0.15', pt: 'vosk-model-small-pt-0.3' };
const modelDir = (lang) => homeFile(join('stt', `vosk-${lang}`));

const run = (args, timeout) =>
  new Promise((res, rej) => execFile(PY(), args, { timeout, windowsHide: true }, (e, out, err) => (e ? rej(new Error(String(err || e.message).trim().split('\n').pop())) : res(String(out)))));

/** → { set({ on, name, lang }), status(), stop() }; onWake() each time it hears the trigger. */
export function createWake({ log = () => {}, onWake = () => {}, onState = () => {} } = {}) {
  let want = { on: false };
  let proc = null;
  let state = 'off';
  let error = '';
  let busy = null;
  let fails = 0;
  let retry = null;
  const status = () => ({ on: want.on, state, ...(error ? { error } : {}) });
  const to = (s, e = '') => (state !== s || error !== e) && ((state = s), (error = e), onState(status()));

  async function ready(lang) {
    if (!existsSync(PY())) throw new Error('no local voice venv (~/.7ots/stt)');
    try {
      await run(['-c', 'import vosk, sounddevice'], 20000);
    } catch {
      log('wake: installing vosk + sounddevice in the venv');
      await run(['-m', 'pip', 'install', '-q', 'vosk', 'sounddevice'], 600000);
    }
    if (!existsSync(join(modelDir(lang), 'conf'))) {
      log(`wake: downloading ${MODELS[lang]}`);
      await run([SCRIPT, '--setup', modelDir(lang), `https://alphacephei.com/vosk/models/${MODELS[lang]}.zip`], 600000);
    }
  }

  function kill() {
    clearTimeout(retry);
    if (proc) proc.removeAllListeners('exit'), proc.kill();
    proc = null;
  }

  async function start() {
    const { name, lang } = want;
    to('setup');
    busy = ready(lang);
    try {
      await busy;
    } catch (e) {
      busy = null;
      return log(`wake: ${e.message}`), to('error', e.message);
    }
    busy = null;
    if (!want.on || want.name !== name || want.lang !== lang) return want.on ? start() : to('off'); // changed meanwhile
    const p = (proc = spawn(PY(), [SCRIPT, modelDir(lang), lang, name], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
    let tail = '';
    p.stderr.on('data', (d) => (tail = (tail + d).slice(-400)));
    p.stdout.on('data', (d) => {
      for (const line of String(d).split('\n')) {
        if (line === 'ready') (fails = 0), to('on'), log(`wake: listening for "${name}" (${lang})`);
        if (line === 'wake') log('wake: heard it'), onWake();
      }
    });
    p.on('exit', (code) => {
      proc = null;
      const why = tail.trim().split('\n').pop() || `exit ${code}`;
      log(`wake: stopped (${why})`);
      if (!want.on) return to('off');
      // a mic that went away, a crash: try again a few times, slower each time
      if (++fails > 4) return to('error', why);
      to('error', why);
      retry = setTimeout(() => want.on && !proc && !busy && start(), 5000 * fails);
    });
  }

  return {
    set({ on, name, lang }) {
      const next = { on: !!on && !!String(name || '').trim(), name: String(name || '').trim().slice(0, 40), lang: MODELS[lang] ? lang : 'en' };
      if (next.on === want.on && next.name === want.name && next.lang === want.lang) return;
      want = next;
      kill();
      fails = 0;
      if (!want.on) return to('off');
      if (!busy) start();
    },
    status,
    stop() {
      want = { on: false };
      kill();
    },
  };
}
