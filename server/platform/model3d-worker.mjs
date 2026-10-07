/**
 * Worker of model3d.mjs: builds an ot's .glb with src/character3d/export.js, off the main thread.
 *
 * export.js is browser code (three.js). Node lacks a few browser APIs it touches while building —
 * none of them draws anything that ends up in the glb — so they are stubbed here:
 *   document.createElement('canvas') — the contact-shadow texture (not exported);
 *   Image — mod parts drawn from SVG (not exported);
 *   FileReader — GLTFExporter assembles the binary with it.
 * The baked textures are PNGs encoded with zlib. Mod parts stored on this server (/mods/<hash>.glb)
 * are read from disk (workerData.modsDir).
 */

import { parentPort, workerData } from 'node:worker_threads';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop: noop })), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
globalThis.Image ??= class { set src(v) {} };
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); this.onload?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.(); this.onload?.(); });
  }
};

// PNG (RGBA 8 bits, sin filtro)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

/** Mod parts on this server's disk → data: URLs (Node's fetch has no origin for '/mods/…'). */
function localMods(character) {
  const mods = Array.isArray(character.mods) ? character.mods : [];
  return {
    ...character,
    mods: mods.map((m) => ({
      ...m,
      parts: (m.parts || []).map((p) => {
        if (typeof p.glb !== 'string' || !/^\/mods\/[a-f0-9]+\.glb$/i.test(p.glb)) return p;
        try {
          return { ...p, glb: `data:model/gltf-binary;base64,${readFileSync(join(workerData?.modsDir || '.', p.glb.slice(6))).toString('base64')}` };
        } catch {
          return { ...p, glb: undefined };
        }
      }),
    })),
  };
}

let lib = null;
parentPort?.on('message', async ({ id, character }) => {
  try {
    lib ??= await import('../../src/character3d/export.js');
    const r = await lib.characterGlb(localMods(character), { encodePng, waitMs: 4000 });
    parentPort.postMessage({ id, glb: r ? new Uint8Array(r.glb) : null });
  } catch (e) {
    parentPort.postMessage({ id, error: String(e?.stack || e) });
  }
});
