/**
 * Identidad del agente: quién es, cómo se ve, cómo suena y cómo se le contacta.
 *
 * Una sola ficha declarativa que usan todas las piezas de 7ots:
 *   - el widget web (nombre, colores, avatar 3D/2D, voz),
 *   - los canales (persona en correo/chat/llamada, avatar de meet, firma),
 *   - el TTS del proxy (proveedor, voz y estilo),
 *   - la tarjeta pública (GET /api/agent/identity, vCard, /.well-known/7ots-agent.json).
 *
 * Orden de carga (lo de la derecha gana):  valores por defecto ← variables de entorno ← data/identity.json
 * El backoffice escribe data/identity.json; IDENTITY_FILE cambia la ruta.
 *
 * La identidad NUNCA contiene secretos: las claves de apumail/apuchat/TTS siguen en el entorno.
 * Aun así, publicIdentity() construye la tarjeta con una lista blanca de campos.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineIdentity } from '../src/identity/schema.js';

export * from '../src/identity/schema.js';
export * from '../src/identity/random.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Identidad a partir de las variables de entorno de siempre (AGENT_*, APUCHAT_AGENT_*, TTS). */
export function identityFromEnv(env = process.env) {
  const provider = (env.TTS_PROVIDER || '').toLowerCase();
  return defineIdentity({
    name: env.AGENT_NAME || undefined,
    role: env.AGENT_ROLE || undefined,
    language: env.AGENT_LANG || undefined,
    personality: { instructions: env.AGENT_INSTRUCTIONS || '' },
    look: { meetAvatar: env.APUCHAT_AGENT_AVATAR || undefined, meetScene: env.APUCHAT_AGENT_SCENE || '' },
    voice: {
      voiceId:
        {
          apuchat: env.APUCHAT_VOICE_ID,
          elevenlabs: env.ELEVENLABS_VOICE_ID,
          grok: env.XAI_TTS_VOICE,
          fish: env.FISH_VOICE_ID,
          openai: env.OPENAI_TTS_VOICE,
        }[provider] || '',
    },
    contact: { site: env.AGENT_SITE_URL || '', email: env.APUMAIL_AGENT_INBOX || '' },
  });
}

// ───────────────────────────── almacén en disco ─────────────────────────────

let current = null;
const listeners = new Set();

export function identityFile(env = process.env) {
  return resolve(ROOT, env.IDENTITY_FILE || join('data', 'identity.json'));
}

/** Identidad vigente (entorno + fichero). Se cachea; setIdentity() la actualiza en caliente. */
export function getIdentity() {
  if (current) return current;
  const base = identityFromEnv();
  let file = {};
  const path = identityFile();
  if (existsSync(path)) {
    try {
      file = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      console.warn('[7ots] identidad: no se pudo leer', path, e.message);
    }
  }
  current = defineIdentity(file, base);
  return current;
}

/**
 * Mezcla un cambio (parcial o completo) con la identidad vigente, lo guarda en
 * data/identity.json y lo aplica ya (los canales y el TTS leen siempre la vigente).
 */
export function setIdentity(patch) {
  const next = defineIdentity(patch, getIdentity());
  const path = identityFile();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, path); // escritura atómica
  current = next;
  for (const fn of listeners) fn(next);
  return next;
}

/** Usa esta identidad en memoria (SDK sin fichero). */
export function useIdentity(identity) {
  current = Object.defineProperty(defineIdentity(identity), '__custom', { value: true });
  for (const fn of listeners) fn(current);
  return current;
}

/** ¿Hay identidad propia (fichero o AGENT_NAME)? Si no, el proxy no toca el prompt del widget. */
export function identityConfigured(env = process.env) {
  return !!current?.__custom || existsSync(identityFile(env)) || !!env.AGENT_NAME;
}

export function onIdentityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

