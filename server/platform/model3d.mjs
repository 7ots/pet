/**
 * The ot's own 3D body as a .glb (GET /api/o/<id>/model.glb), for byte arena and any glTF viewer.
 *
 * Built HERE, in Node, from the same Character3D the 3D page draws (src/character3d/export.js):
 * deterministic, no browser needed (byte_play from chat has no client), ~1 s of CPU. It runs in a
 * worker thread so the server never blocks, one job at a time.
 *
 * Cache: by hash of look.character (+ EXPORT_VERSION) in memory (LRU) and on disk
 * (<dataDir>/glb/<hash>.glb), so a restart does not rebuild. The hash is the URL's version
 * (?v=<hash>): a new look → a new URL → byte reloads it.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { dataDir } from './db.mjs';

/** Bump when export.js changes what it produces: every ot gets a new URL and a rebuild. */
export const EXPORT_VERSION = 1;
const MEM_KEEP = 24;

const mem = new Map(); // hash → Buffer (LRU)
const inflight = new Map(); // hash → Promise<Buffer|null>
let worker = null;
let seq = 0;
const waiting = new Map();

/** look.character of an identity, or null (no drawn character → no 3D body). */
export function characterOf(identity) {
  const c = identity?.look?.character;
  return c && typeof c === 'object' ? c : null;
}

/** A mod that swaps the whole body for an outside VRM/GLB: no own body to export. */
const outsideModel = (c) => (c.mods || []).some((m) => m && typeof m === 'object' && (m.model || m.vrm));

/** Version hash of a character's glb (12 hex), or null if it has no exportable body. */
export function modelHash(character) {
  if (!character || outsideModel(character)) return null;
  return createHash('sha256').update(`${EXPORT_VERSION}|${JSON.stringify(character)}`).digest('hex').slice(0, 12);
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./model3d-worker.mjs', import.meta.url), { workerData: { modsDir: join(dataDir(), 'mods') } });
  worker.unref();
  worker.on('message', ({ id, glb, error }) => {
    const w = waiting.get(id);
    if (!w) return;
    waiting.delete(id);
    if (error) w.reject(new Error(error));
    else w.resolve(glb ? Buffer.from(glb) : null);
  });
  const fail = (e) => {
    for (const w of waiting.values()) w.reject(e instanceof Error ? e : new Error(String(e)));
    waiting.clear();
    worker = null;
  };
  worker.on('error', fail);
  worker.on('exit', (code) => fail(new Error(`glb worker exited (${code})`)));
  return worker;
}

function build(character) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, character });
  });
}

const diskPath = (hash) => join(dataDir(), 'glb', `${hash}.glb`);

function remember(hash, buf) {
  mem.delete(hash);
  mem.set(hash, buf);
  while (mem.size > MEM_KEEP) mem.delete(mem.keys().next().value);
}

/** The glb of a character: { hash, glb: Buffer } or null (no exportable body). */
export async function modelGlb(character) {
  const hash = modelHash(character);
  if (!hash) return null;
  if (mem.has(hash)) {
    const buf = mem.get(hash);
    remember(hash, buf);
    return { hash, glb: buf };
  }
  const file = diskPath(hash);
  if (existsSync(file)) {
    const buf = readFileSync(file);
    remember(hash, buf);
    return { hash, glb: buf };
  }
  if (!inflight.has(hash)) {
    const p = build(character)
      .then((buf) => {
        if (!buf) return null;
        remember(hash, buf);
        try {
          mkdirSync(join(dataDir(), 'glb'), { recursive: true });
          writeFileSync(`${file}.tmp`, buf);
          renameSync(`${file}.tmp`, file);
        } catch (e) {
          console.error('[model3d] disk cache:', e.message);
        }
        return buf;
      })
      .finally(() => inflight.delete(hash));
    inflight.set(hash, p);
  }
  const glb = await inflight.get(hash);
  return glb ? { hash, glb } : null;
}
