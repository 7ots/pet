/**
 * Where the CLI keeps things.
 *
 *   ./.7ots/identity.json        the project's identity (`7ots new` / `7ots install`)
 *   ~/.7ots/identity.json        global identity (your pet's, when the project has none)
 *   ~/.7ots/config.json          what the wizard chose (`7ots setup`)
 *   ~/.7ots/keys.json            keys typed in the wizard (0600)
 *   ~/.7ots/pet.json             tamagotchi state (food, energy, fun, xp…)
 *   ~/.7ots/pet.token            local secret that protects the pet's POSTs (0600)
 *   ~/.7ots/apuchat.json         apuchat identity for meet (0600)
 *
 * SEVENOTS_HOME moves ~/.7ots (handy for tests).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HOME = process.env.SEVENOTS_HOME ? resolve(process.env.SEVENOTS_HOME) : join(homedir(), '.7ots');
export const PET_PORT = Number(process.env.SEVENOTS_PET_PORT) || 7717;

export const homeFile = (name) => join(HOME, name);
export const projectFile = (name, cwd = process.cwd()) => join(cwd, '.7ots', name);

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Atomic write (tmp + rename); `secret` leaves the file 0600. */
export function writeJson(file, data, { secret = false } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: secret ? 0o600 : 0o644 });
  renameSync(tmp, file);
  if (secret) chmodSync(file, 0o600);
}

export function ensureHome() {
  mkdirSync(HOME, { recursive: true });
  return HOME;
}

export { existsSync };
