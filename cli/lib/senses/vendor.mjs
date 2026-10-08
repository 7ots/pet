/**
 * MediaPipe Tasks Vision for the camera page (/senses), downloaded once on first use into ~/.7ots/senses/vendor
 * (≈35 MB: not shipped in the app) and served from the daemon, so the page never loads code from the internet.
 * Every file is pinned by version and sha256: a file that does not match is not kept.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeFile } from '../paths.mjs';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';

/** published name → { url, sha256, type } */
export const VENDOR = {
  'vision_bundle.mjs': { url: `${MP}/vision_bundle.mjs`, sha256: '55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe', type: 'text/javascript; charset=utf-8' },
  'vision_wasm_internal.js': { url: `${MP}/wasm/vision_wasm_internal.js`, sha256: 'e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c', type: 'text/javascript; charset=utf-8' },
  'vision_wasm_internal.wasm': { url: `${MP}/wasm/vision_wasm_internal.wasm`, sha256: '6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc', type: 'application/wasm' },
  'face_landmarker.task': { url: `${MODELS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff', type: 'application/octet-stream' },
  'gesture_recognizer.task': { url: `${MODELS}/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`, sha256: '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482', type: 'application/octet-stream' },
};

const dir = () => homeFile(join('senses', 'vendor'));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const okFile = new Map(); // name → mtime already checked

function present(name) {
  const f = join(dir(), name);
  if (!existsSync(f)) return false;
  const m = statSync(f).mtimeMs;
  if (okFile.get(name) === m) return true;
  const good = sha(readFileSync(f)) === VENDOR[name].sha256;
  if (good) okFile.set(name, m);
  return good;
}

let fetching = null;
let progress = { done: 0, total: Object.keys(VENDOR).length, error: '' };

/** { ready, done, total, error } */
export function vendorStatus() {
  const done = Object.keys(VENDOR).filter(present).length;
  return { ready: done === progress.total, done, total: progress.total, busy: !!fetching, error: progress.error };
}

/** Downloads what is missing (once at a time). Resolves with vendorStatus(). */
export function ensureVendor(log = () => {}) {
  if (vendorStatus().ready) return Promise.resolve(vendorStatus());
  fetching ||= (async () => {
    progress.error = '';
    mkdirSync(dir(), { recursive: true, mode: 0o700 });
    for (const [name, v] of Object.entries(VENDOR)) {
      if (present(name)) continue;
      log(`senses: downloading ${name}`);
      const r = await fetch(v.url, { signal: AbortSignal.timeout(180_000) });
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (sha(buf) !== v.sha256) throw new Error(`${name}: checksum mismatch`);
      const f = join(dir(), name);
      writeFileSync(`${f}.part`, buf);
      renameSync(`${f}.part`, f);
    }
    log('senses: camera models ready');
  })()
    .catch((e) => {
      progress.error = e.message;
      log(`senses: ${e.message}`);
    })
    .finally(() => (fetching = null));
  return fetching.then(vendorStatus);
}

/** The file to serve for /senses/vendor/<name>, or null. */
export function vendorFile(name) {
  if (!Object.hasOwn(VENDOR, name) || !present(name)) return null;
  return { file: join(dir(), name), type: VENDOR[name].type };
}
