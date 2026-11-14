/**
 * Plugins of an ot: small packs made by anyone that add a window beside the ot (a panel), tools for its
 * brain (an MCP server) and a few words that tell it when to use them. Shared by the pet (cli/lib/plugins.mjs)
 * and 7ots.com's catalog (server/platform/plugins.mjs). Guide for devs: docs/PLUGINS.md.
 *
 *   7ots-plugin.json
 *   {
 *     id: 'btc-price', name: 'BTC price', version: '1.0.0', icon: '₿',
 *     description: 'Bitcoin live, beside your ot',
 *     author: 'someone', homepage: 'https://…',
 *     instructions: 'When your human asks for the bitcoin price, open this panel.',   // for its brain
 *     panel: { file: 'panel.html', title: 'BTC', width: 300, height: 190 },            // optional
 *     net: ['api.coingecko.com'],          // hosts the panel may reach (https only); nothing else
 *     mcp: { url: 'https://…/mcp' } | { command: 'node server.mjs' },                // optional tools
 *     env: ['SOME_API_KEY'],               // keys the MCP server needs (settings → keys)
 *   }
 *
 * A bundle = { manifest, files: { 'panel.html': '<base64>', … } }: at most MAX_FILES files and MAX_BYTES in all,
 * only web files (FILE_TYPES). Panels run in their own sandboxed window and origin (ots-plugin://<id>/), with a
 * CSP that only lets them load their own files and talk to `net`. An MCP `command` runs code on the human's
 * computer: only plugins you load yourself (dev) may have one; the public catalog takes `url` only.
 */

export const PLUGIN_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;
export const MAX_FILES = 30;
export const MAX_BYTES = 512 * 1024;
export const FILE_TYPES = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  woff2: 'font/woff2',
};
const FILE_PATH = /^(?!.*\.\.)(?!\/)[\w.-]+(\/[\w.-]+){0,3}$/;
const HOST = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const int = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);

/** The type a plugin file is served with, or null when that kind of file is not allowed. */
export const fileType = (p) => FILE_TYPES[String(p).split('.').pop().toLowerCase()] || null;
export const okFilePath = (p) => typeof p === 'string' && FILE_PATH.test(p) && !!fileType(p);

/**
 * A raw manifest → a clean one, or throws Error(<field>).
 * @param {object} m
 * @param {{ catalog?: boolean }} [o]  catalog: what 7ots.com accepts (no MCP command)
 */
export function normalizeManifest(m, { catalog = false } = {}) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('manifest');
  const id = String(m.id || '').toLowerCase();
  if (!PLUGIN_ID.test(id)) throw new Error('id');
  const name = str(m.name, 40);
  if (!name) throw new Error('name');
  const version = str(m.version || '1.0.0', 20);
  if (!/^\d+\.\d+\.\d+([-.+][\w.-]+)?$/.test(version)) throw new Error('version');
  const out = { id, name, version, icon: [...str(m.icon || '🧩', 8)].slice(0, 2).join('') || '🧩', description: str(m.description, 200), author: str(m.author, 40) };
  const homepage = str(m.homepage, 300);
  if (homepage && /^https:\/\/[^\s"'<>]+$/i.test(homepage)) out.homepage = homepage;
  const instructions = str(m.instructions, 600);
  if (instructions) out.instructions = instructions;
  if (m.panel) {
    const file = String(m.panel.file || 'panel.html');
    if (!okFilePath(file) || !/\.html$/i.test(file)) throw new Error('panel');
    out.panel = { file, title: str(m.panel.title || name, 40), width: int(m.panel.width, 200, 900, 320), height: int(m.panel.height, 120, 900, 220) };
  }
  const net = Array.isArray(m.net) ? m.net.map((h) => String(h).toLowerCase().trim()) : [];
  if (net.length > 8 || net.some((h) => !HOST.test(h))) throw new Error('net');
  if (net.length) out.net = [...new Set(net)];
  if (m.mcp) {
    const url = str(m.mcp.url, 300);
    const command = str(m.mcp.command, 300);
    if (url) {
      if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) throw new Error('mcp');
      out.mcp = { url };
    } else if (command && !catalog) out.mcp = { command };
    else throw new Error('mcp');
  }
  const env = Array.isArray(m.env) ? m.env.map(String) : [];
  if (env.length > 5 || env.some((e) => !/^[A-Z][A-Z0-9_]{1,63}$/.test(e))) throw new Error('env');
  if (env.length) out.env = env;
  if (!out.panel && !out.mcp && !out.instructions) throw new Error('empty');
  return out;
}

/** base64 → byte length (without decoding). */
const b64len = (s) => Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);

/**
 * A raw bundle → { manifest, files } (files still base64), or throws Error(<field>).
 * @param {{ manifest: object, files: Record<string, string> }} b
 */
export function normalizeBundle(b, o = {}) {
  if (!b || typeof b !== 'object') throw new Error('bundle');
  const manifest = normalizeManifest(b.manifest, o);
  const files = {};
  let total = 0;
  const entries = Object.entries(b.files && typeof b.files === 'object' ? b.files : {});
  if (entries.length > MAX_FILES) throw new Error('files');
  for (const [p, data] of entries) {
    if (p === '7ots-plugin.json') continue;
    if (!okFilePath(p)) throw new Error(`file ${p}`);
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error(`file ${p}`);
    total += b64len(data);
    if (total > MAX_BYTES) throw new Error('size');
    files[p] = data;
  }
  if (manifest.panel && !files[manifest.panel.file]) throw new Error('panel');
  return { manifest, files };
}

/** The Content-Security-Policy a plugin's panel runs under: its own files, plus https to its `net` hosts. */
export function panelCsp(manifest) {
  const net = (manifest.net || []).map((h) => `https://${h}`).join(' ');
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${net ? ` ${net}` : ''}`,
    "font-src 'self'",
    `connect-src ${net || "'none'"}`,
    "media-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join('; ');
}
