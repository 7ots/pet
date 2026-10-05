/**
 * `7ots install`: puts the current identity into the project.
 *
 *   html  → finds index.html (., public/, src/, static/) and inserts the widget before </body>,
 *           between <!-- 7ots --> markers (re-running replaces the block)
 *   self  → leaves the identity ready for your own 7ots server (absolute IDENTITY_FILE)
 *   print → only prints the snippet
 *
 * Where the widget talks to depends on the configured home: an ot on 7ots.com uses its embed.js,
 * your own server uses its endpoint, otherwise a local proxy at /api/agent.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { existsSync } from './paths.mjs';
import { loadConfig } from './config.mjs';

const CDN = 'https://cdn.jsdelivr.net/npm/@7ots/cli/dist/7ots.iife.js';
const START = '<!-- 7ots -->';
const END = '<!-- /7ots -->';

export const platformLink = (seed) => `https://7ots.com/app/#new${seed ? `?seed=${encodeURIComponent(seed)}` : ''}`;

export function findHtml(cwd = process.cwd()) {
  for (const dir of ['.', 'public', 'src', 'static', 'www', 'site']) {
    const f = join(cwd, dir, 'index.html');
    if (existsSync(f)) return f;
  }
  return null;
}

/**
 * What kind of project this is, to say where the snippet goes when there is no plain index.html.
 * @returns {{ kind: 'framework'|'web'|'none', name?: string, file?: string }}
 */
export function detectProject(cwd = process.cwd()) {
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  } catch {}
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const first = (files) => files.find((f) => existsSync(join(cwd, f)));
  const FRAMEWORKS = [
    ['next', 'Next.js', ['app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'pages/_document.tsx', 'pages/_document.js', 'src/pages/_document.tsx']],
    ['nuxt', 'Nuxt', ['app.vue', 'nuxt.config.ts', 'nuxt.config.js']],
    ['astro', 'Astro', ['src/layouts/Layout.astro', 'src/layouts/BaseLayout.astro']],
    ['@sveltejs/kit', 'SvelteKit', ['src/app.html']],
    ['@remix-run/react', 'Remix', ['app/root.tsx', 'app/root.jsx']],
    ['gatsby', 'Gatsby', ['src/html.js', 'gatsby-ssr.js']],
    ['vite', 'Vite', ['index.html']],
  ];
  // No layout file yet: name the usual one, so the user still knows where it goes.
  for (const [dep, name, files] of FRAMEWORKS) if (deps[dep]) return { kind: 'framework', name, file: first(files) || files[0] };
  const web = first(['templates/base.html', 'templates/layout.html', 'app/views/layouts/application.html.erb', 'resources/views/layouts/app.blade.php', 'layouts/_default/baseof.html', '_layouts/default.html']);
  if (web) return { kind: 'web', file: web };
  if (pkg && (deps.react || deps.vue || deps.svelte || deps['solid-js'] || deps.express || deps.fastify)) return { kind: 'web' };
  return { kind: 'none' };
}

/** The HTML block for this identity and home. */
export function snippet(identity, { home = loadConfig().home, identityUrl } = {}) {
  if (home?.kind === '7ots' && /\/api\/o\/[\w-]+\/?$/.test(home.url || '')) {
    return `${START}\n<script src="${home.url.replace(/\/$/, '')}/embed.js" defer></script>\n${END}`;
  }
  const endpoint = home?.kind === 'server' && home.url ? home.url.replace(/\/$/, '') : '/api/agent';
  // Own server or local proxy: they serve the identity at <endpoint>/identity, so `identity: true` is enough.
  // Without a proxy that knows it, the identity goes inline (it's public data: name, look, voice).
  const id = identityUrl ? JSON.stringify(identityUrl) : endpoint === '/api/agent' ? 'true' : JSON.stringify(inlineIdentity(identity));
  return `${START}
<script src="${CDN}" defer></script>
<script>
  addEventListener('DOMContentLoaded', () => SevenOts.init({ endpoint: ${JSON.stringify(endpoint)}, identity: ${id} }));
</script>
${END}`;
}

/** Everything but the private instructions (the page's HTML is public). */
function inlineIdentity(id) {
  const { personality = {}, ...rest } = id;
  return { ...rest, personality: { tone: personality.tone, traits: personality.traits } };
}

/** Inserts or replaces the block. Returns { file, updated }. */
export function installHtml(file, block) {
  const html = readFileSync(file, 'utf8');
  const re = new RegExp(`${escape(START)}[\\s\\S]*?${escape(END)}`);
  let out;
  let updated = false;
  if (re.test(html)) {
    out = html.replace(re, block);
    updated = true;
  } else if (/<\/body>/i.test(html)) {
    out = html.replace(/<\/body>/i, `${block}\n</body>`);
  } else {
    out = `${html.trimEnd()}\n${block}\n`;
  }
  writeFileSync(file, out);
  return { file, updated };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export const absolute = (file) => resolve(file);
export const pretty = (file, cwd = process.cwd()) => {
  const r = relative(cwd, file);
  return r && !r.startsWith('..') ? r : file;
};
