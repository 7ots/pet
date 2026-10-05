/**
 * The identity the CLI uses: the project's (./.7ots/identity.json) or else the global one
 * (~/.7ots/identity.json). Both keep the full identity and its seed, so it can always be
 * regenerated with `7ots new --seed <seed>`.
 */

import { defineIdentity, identityPrompt } from '../../src/identity/schema.js';
import { randomIdentity, newSeed, cleanSeed } from '../../src/identity/random.js';
import { existsSync, homeFile, projectFile, readJson, writeJson } from './paths.mjs';
import { cliLang } from './i18n.mjs';

export { identityPrompt, randomIdentity, newSeed, cleanSeed };

export function identityPath({ global = false, cwd } = {}) {
  return global ? homeFile('identity.json') : projectFile('identity.json', cwd);
}

/** The current identity and where it comes from: project → global → null. */
export function loadIdentity({ cwd } = {}) {
  for (const file of [identityPath({ cwd }), identityPath({ global: true })]) {
    if (!existsSync(file)) continue;
    const raw = readJson(file);
    if (raw) return { identity: defineIdentity(raw), file };
  }
  return { identity: null, file: null };
}

/** Creates (or recreates) a random identity and saves it. */
export function createIdentity({ seed, name, lang, global = false, force = false, cwd } = {}) {
  const file = identityPath({ global, cwd });
  const existed = existsSync(file);
  if (existed && !force) return { identity: defineIdentity(readJson(file) || {}), file, existed, kept: true };
  const identity = randomIdentity(cleanSeed(seed) || newSeed(), { lang: lang || guessLang(), name });
  writeJson(file, identity);
  return { identity, file, existed, kept: false };
}

/** en | es | pt from SEVENOTS_LANG / config / LANG (es_CL.UTF-8 → es). English by default. */
export const guessLang = cliLang;

/** Short card for the terminal. */
export function describe(id, color = (s) => s) {
  const p = id.personality || {};
  return [
    `${color(id.name)} — ${id.role}`,
    `  ${id.tagline}`,
    `  ${p.tone}${p.traits?.length ? ` · ${p.traits.join(', ')}` : ''}`,
    `  voice ${id.voice.lang} · meet ${id.look.meetAvatar}${id.look.meetScene ? ` @ ${id.look.meetScene}` : ''}`,
    `  seed ${id.seed || '—'}`,
  ].join('\n');
}
