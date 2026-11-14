/**
 * Plugins on this computer (src/plugins.js has the format; docs/PLUGINS.md the guide for devs).
 *
 *   ~/.7ots/plugins.json          { [id]: { on, source: 'catalog' | 'local', dir?, sha?, at } }
 *   ~/.7ots/plugins/<id>/         a catalog plugin's files (downloaded from 7ots.com, reviewed there)
 *   local plugins                 read live from your own folder (`7ots plugin add ./my-plugin`): for devs
 *
 * The catalog (7ots.com/api/plugins) only lists plugins an admin approved. A panel opens in its own sandboxed
 * window beside the ot (electron/main.cjs, ots-plugin://<id>/…); an MCP server becomes one more integration
 * of the brain (integrations.mjs); `instructions` tell the brain when to open the panel or use the tools.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { MAX_BYTES, MAX_FILES, PLUGIN_ID, normalizeBundle, normalizeManifest, okFilePath } from '../../src/plugins.js';
import { SEVENOTS_URL, api, signedIn } from './account.mjs';
import { homeFile, readJson, writeJson } from './paths.mjs';

const STATE = () => homeFile('plugins.json');
const MANIFEST = '7ots-plugin.json';
const state = () => readJson(STATE(), {}) || {};
const save = (s) => writeJson(STATE(), s);
export const pluginDir = (id, s = state()) => (s[id]?.source === 'local' ? s[id].dir : homeFile(join('plugins', id)));

function readManifest(dir, o) {
  return normalizeManifest(JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8')), o);
}

/** Installed plugins: [{ id, on, source, manifest, dir, sha? , error? }] */
export function listPlugins() {
  const s = state();
  return Object.entries(s).map(([id, e]) => {
    const dir = pluginDir(id, s);
    try {
      return { id, on: e.on !== false, source: e.source, dir, sha: e.sha || null, at: e.at, manifest: readManifest(dir, { catalog: e.source === 'catalog' }) };
    } catch (err) {
      return { id, on: false, source: e.source, dir, at: e.at, error: err.code === 'ENOENT' ? 'missing' : err.message };
    }
  });
}
export const getPlugin = (id) => listPlugins().find((p) => p.id === id && !p.error) || null;
export const activePlugins = () => listPlugins().filter((p) => p.on && !p.error);

/** A file of a plugin, or null (path checked, served type from src/plugins.js). */
export function pluginFile(id, path) {
  const p = getPlugin(id);
  if (!p || !okFilePath(path)) return null;
  const file = resolve(p.dir, path);
  if (!file.startsWith(resolve(p.dir) + sep) || !existsSync(file)) return null;
  return { plugin: p, file, body: readFileSync(file) };
}

/** A folder → bundle { manifest, files (base64) } as 7ots.com takes it. */
export function bundleOf(dir, { catalog = true } = {}) {
  dir = resolve(dir);
  const manifest = readManifest(dir, { catalog });
  const files = {};
  let n = 0;
  const walk = (d, depth = 0) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.') || name === 'node_modules' || name === MANIFEST || (d === dir && name === 'README.md')) continue;
      const f = join(d, name);
      if (statSync(f).isDirectory()) {
        if (depth < 3) walk(f, depth + 1);
        continue;
      }
      const rel = relative(dir, f).split(sep).join('/');
      if (!okFilePath(rel)) continue; // only web files go up (src/plugins.js FILE_TYPES)
      if (++n > MAX_FILES) throw new Error(`more than ${MAX_FILES} files`);
      files[rel] = readFileSync(f).toString('base64');
    }
  };
  walk(dir);
  return normalizeBundle({ manifest, files }, { catalog });
}

export const bundleSha = (b) => createHash('sha256').update(JSON.stringify({ manifest: b.manifest, files: b.files })).digest('hex');

/** Adds a plugin from a folder of yours (dev): read live from there, not reviewed by anyone. */
export function addLocal(dir) {
  dir = resolve(dir);
  if (!existsSync(join(dir, MANIFEST))) throw new Error(`no ${MANIFEST} in ${dir}`);
  const manifest = readManifest(dir, { catalog: false });
  const s = state();
  if (s[manifest.id]?.source === 'catalog') rmSync(homeFile(join('plugins', manifest.id)), { recursive: true, force: true });
  s[manifest.id] = { on: true, source: 'local', dir, at: Date.now() };
  save(s);
  return getPlugin(manifest.id);
}

// ── the catalog (7ots.com) ──

const pub = async (path) => {
  const r = await fetch(`${SEVENOTS_URL}/api/plugins${path}`, { signal: AbortSignal.timeout(20000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
};

/** Approved plugins on 7ots.com, with what is installed here. */
export async function catalog({ q = '' } = {}) {
  const { plugins = [] } = await pub(`?q=${encodeURIComponent(q)}`);
  const here = new Map(listPlugins().map((p) => [p.id, p]));
  return plugins.map((v) => ({ ...v, installed: here.has(v.id), update: here.get(v.id)?.source === 'catalog' && here.get(v.id)?.sha !== v.sha }));
}

/** Downloads an approved plugin into ~/.7ots/plugins/<id> (what was reviewed: checked by its sha256). */
export async function installFromCatalog(id) {
  if (!PLUGIN_ID.test(String(id))) throw new Error('id');
  const b = await pub(`/${id}/bundle`);
  const bundle = normalizeBundle(b, { catalog: true });
  if (b.sha && bundleSha(bundle) !== b.sha) throw new Error('bundle changed on the way (sha256)');
  const dir = homeFile(join('plugins', id));
  rmSync(dir, { recursive: true, force: true });
  for (const [p, data] of Object.entries(bundle.files)) {
    const f = join(dir, ...p.split('/'));
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, Buffer.from(data, 'base64'));
  }
  writeFileSync(join(dir, MANIFEST), JSON.stringify(bundle.manifest, null, 2) + '\n');
  const s = state();
  s[id] = { on: true, source: 'catalog', sha: bundleSha(bundle), at: Date.now() };
  save(s);
  if (signedIn()) api(`/plugins/${id}/install`, { method: 'POST', body: {} }).catch(() => {}); // counts it once per account
  return getPlugin(id);
}

export function removePlugin(id) {
  const s = state();
  if (!s[id]) return false;
  if (s[id].source === 'catalog') rmSync(homeFile(join('plugins', id)), { recursive: true, force: true });
  delete s[id];
  save(s);
  return true;
}

export function setPluginOn(id, on) {
  const s = state();
  if (!s[id]) return false;
  s[id].on = !!on;
  save(s);
  return true;
}

/** Sends a plugin folder to 7ots.com for review (signed in): it is public once an admin approves it. */
export async function publishPlugin(dir) {
  if (!signedIn()) throw Object.assign(new Error('sign in to 7ots.com first (7ots login)'), { status: 401 });
  const bundle = bundleOf(dir, { catalog: true });
  return api('/plugins', { method: 'POST', body: bundle });
}
export const myPlugins = () => api('/plugins/mine');

// ── for the brain ──

/** Plugins with an MCP server, as custom integrations (integrations.mjs). */
export function pluginIntegrations() {
  return activePlugins()
    .filter((p) => p.manifest.mcp)
    .map((p) => ({
      id: `plugin-${p.id}`,
      kind: 'mcp',
      name: p.manifest.name,
      instructions: p.manifest.instructions || p.manifest.description,
      ...(p.manifest.mcp.url ? { url: p.manifest.mcp.url } : { command: `cd ${JSON.stringify(p.dir)} && ${p.manifest.mcp.command}` }),
      ...(p.manifest.env?.[0] ? { envVar: p.manifest.env[0] } : {}),
      on: true,
    }));
}

/** Action docs for the assistant: open a plugin's panel. */
export function pluginsPrompt() {
  const ps = activePlugins().filter((p) => p.manifest.panel);
  if (!ps.length) return '';
  return ps.map((p) => `{"type":"plugin","id":"${p.id}"} (open the "${p.manifest.name}" panel beside you${p.manifest.instructions ? `: ${p.manifest.instructions}` : p.manifest.description ? ` — ${p.manifest.description}` : ''})`).join('\n');
}

// ── a new plugin (`7ots plugin new`, settings → Plugins → Create) ──

export function scaffold(dir, { id, name } = {}) {
  dir = resolve(dir);
  id = String(id || dir.split(sep).pop()).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  if (!PLUGIN_ID.test(id)) throw new Error('id: 2-32 of a-z, 0-9 and -');
  if (existsSync(join(dir, MANIFEST))) throw new Error(`${dir} already has a plugin`);
  mkdirSync(dir, { recursive: true });
  const nm = String(name || id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())).slice(0, 40);
  const files = {
    [MANIFEST]: JSON.stringify({
      id, name: nm, version: '0.1.0', icon: '🧩',
      description: 'What it does, in one line.',
      instructions: `When your human asks for ${nm}, open this panel.`,
      panel: { file: 'panel.html', title: nm, width: 320, height: 220 },
      net: [],
    }, null, 2) + '\n',
    'panel.html': `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${nm}</title>\n<link rel="stylesheet" href="panel.css">\n</head>\n<body>\n  <h1>${nm}</h1>\n  <p id="out">Hello from your plugin 👋</p>\n  <script src="panel.js"></script>\n</body>\n</html>\n`,
    'panel.css': 'html, body { margin: 0; height: 100%; background: #0b0b12; color: #e8e8f0; font: 13px/1.4 system-ui, sans-serif; }\nbody { padding: 12px; }\nh1 { font-size: 15px; margin: 0 0 8px; }\n',
    'panel.js': "// Runs in its own sandboxed window. fetch() only reaches the hosts in 7ots-plugin.json \"net\" (https).\ndocument.getElementById('out').textContent += ` · ${new Date().toLocaleTimeString()}`;\n",
    'README.md': `# ${nm}\n\nA 7ots plugin. Try it: \`7ots plugin add .\` then \`7ots plugin open ${id}\`.\nPublish it for review: \`7ots plugin publish .\` (guide: https://7ots.com/docs/plugins).\n`,
  };
  for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, f), body);
  return { dir, id };
}

export { MAX_BYTES, MAX_FILES };
