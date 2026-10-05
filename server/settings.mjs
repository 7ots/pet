/**
 * Configuración editable desde el backoffice de 7ots.
 *
 *   data/config.json   { widget: {...}, server: { CLAVE: valor } }   — sin secretos
 *   data/secrets.json  { CLAVE: valor }                              — permisos 0600, nunca sale por la API
 *
 * `server` y los secretos se aplican encima de process.env: lo guardado en el backoffice
 * manda sobre .env y sobre el entorno. Quitar un valor devuelve el del entorno.
 * Las rutas cambian con CONFIG_FILE / SECRETS_FILE.
 *
 * El widget recibe `widget` tal cual (GET /api/agent/config y /api/agent/embed.js): no
 * pongas ahí nada privado.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { i18nError } from './i18n.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

/**
 * Variables del servidor que el backoffice puede cambiar.
 * secret: solo escritura. restart: no se aplica hasta reiniciar el proceso.
 * channels: al cambiar, se reinician los canales del agente (apumail/apuchat).
 */
export const SERVER_KEYS = {
  // LLM
  LLM_PROVIDER: {}, LLM_MODEL: {}, LLM_BASE_URL: {}, LLM_EFFORT: {}, LLM_MAX_TOKENS: {}, LLM_FALLBACKS: {},
  ANTHROPIC_API_KEY: { secret: true }, OPENAI_API_KEY: { secret: true },
  SERVER_INSTRUCTIONS: {},
  // Voz
  TTS_PROVIDER: {}, OPENAI_TTS_MODEL: {}, OPENAI_TTS_VOICE: {},
  ELEVENLABS_API_KEY: { secret: true }, ELEVENLABS_VOICE_ID: {}, ELEVENLABS_MODEL: {},
  APUCHAT_VOICE_URL: {}, APUCHAT_VOICE_TOKEN: { secret: true }, APUCHAT_VOICE_ID: {}, APUCHAT_VOICE_PROVIDER: {},
  XAI_API_KEY: { secret: true }, XAI_TTS_VOICE: {},
  FISH_API_KEY: { secret: true }, FISH_VOICE_ID: {}, FISH_MODEL: {},
  // Contacto desde el widget
  APUMAIL_API: {}, APUMAIL_INBOX: {}, APUMAIL_INBOX_TOKEN: { secret: true }, APUMAIL_TO: {},
  APUCHAT_HUB: { channels: true }, APUCHAT_NOTIFIER_IDENTITY_KEY: { secret: true }, APUCHAT_OPERATOR_HANDLE: {}, APUCHAT_TRANSCRIBE: {},
  // El agente fuera de la web
  APUMAIL_AGENT_INBOX: { channels: true }, APUMAIL_AGENT_TOKEN: { secret: true, channels: true },
  APUMAIL_AGENT_WEBHOOK_SECRET: { secret: true, channels: true }, APUMAIL_AGENT_DAILY: { channels: true },
  APUCHAT_AGENT_IDENTITY_KEY: { secret: true, channels: true }, APUCHAT_AGENT_ALLOW: { channels: true },
  AGENT_MAX_CALLS: { channels: true }, AGENT_CALL_MAX_MINUTES: { channels: true }, AGENT_CALL_MAX_TURNS: { channels: true },
  // Seguridad
  ALLOWED_ORIGINS: {}, SITE_KEYS: {}, RATE_LIMIT_PER_MIN: {}, TRUST_PROXY: { restart: true },
  // Proceso
  PORT: { restart: true }, SERVE_STATIC: { restart: true }, DEMO: { restart: true }, LOG_LEVEL: {},
  // Idioma del servidor (es/en/pt): avisos al equipo y consola. Vacío = el de la identidad.
  LOCALE: {},
};

const fileOf = (name, def) => resolve(ROOT, env[name] || join('data', def));
export const configFile = () => fileOf('CONFIG_FILE', 'config.json');
export const secretsFile = () => fileOf('SECRETS_FILE', 'secrets.json');

let config = { widget: {}, server: {} };
let secrets = {};
/** Valor que tenía cada clave en el entorno antes de aplicar el backoffice. */
const original = {};

function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.warn('[7ots] no se pudo leer', path, e.message);
    return fallback;
  }
}

function writeJsonFile(path, data, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), mode ? { mode } : undefined);
  if (mode) chmodSync(tmp, mode);
  renameSync(tmp, path);
}

/** Lee data/config.json y data/secrets.json y los aplica sobre process.env. Llamar al arrancar. */
export function loadSettings() {
  for (const k of Object.keys(SERVER_KEYS)) if (!(k in original)) original[k] = env[k];
  const c = readJsonFile(configFile(), {});
  config = { widget: isObj(c.widget) ? c.widget : {}, server: isObj(c.server) ? clean(c.server, false) : {} };
  secrets = clean(readJsonFile(secretsFile(), {}), true);
  for (const k of Object.keys(SERVER_KEYS)) apply(k);
}

function clean(obj, secret) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (SERVER_KEYS[k] && !!SERVER_KEYS[k].secret === secret && v != null) out[k] = String(v);
  }
  return out;
}

function apply(k) {
  const v = SERVER_KEYS[k].secret ? secrets[k] : config.server[k];
  if (v !== undefined) env[k] = v;
  else if (original[k] === undefined) delete env[k];
  else env[k] = original[k];
}

// ───────────────────────────── widget ─────────────────────────────

/** Configuración pública del widget (la que se inyecta en la página). */
export function widgetConfig() {
  return structuredClone(config.widget);
}

export function saveWidget(widget) {
  if (!isObj(widget)) throw i18nError(400, 'server.admin.invalidWidget');
  config.widget = sanitizeWidget(widget);
  writeJsonFile(configFile(), config);
  return widgetConfig();
}

/** Solo datos: fuera funciones, claves internas y lo que no puede venir del servidor. */
function sanitizeWidget(w) {
  const out = JSON.parse(JSON.stringify(w)); // descarta funciones/undefined
  for (const k of ['endpoint', 'llm', 'auth', 'templates', 'actions', 'identity']) delete out[k];
  return out;
}

// ───────────────────────────── servidor ─────────────────────────────

/** Vista para el backoffice: valores (no secretos) y de dónde salen; de los secretos, solo si están. */
export function serverView() {
  const values = {};
  const secretState = {};
  for (const [k, meta] of Object.entries(SERVER_KEYS)) {
    const source = (meta.secret ? secrets[k] : config.server[k]) !== undefined ? 'backoffice' : original[k] !== undefined && original[k] !== '' ? 'entorno' : null;
    if (meta.secret) secretState[k] = { set: !!env[k], source, restart: !!meta.restart };
    else values[k] = { value: env[k] ?? '', source, restart: !!meta.restart };
  }
  return { values, secrets: secretState };
}

/**
 * Cambia variables del servidor.
 * @param {Record<string, string|null>} values   null = quitar del backoffice (vuelve la del entorno)
 * @param {Record<string, string|null>} secretValues  '' se ignora (no cambia); null la borra
 * @returns {{ changed: string[], channels: boolean, restart: string[] }}
 */
export function saveServer(values = {}, secretValues = {}) {
  const changed = [];
  for (const [k, v] of Object.entries(values || {})) {
    const meta = SERVER_KEYS[k];
    if (!meta || meta.secret) continue;
    if (v === null) delete config.server[k];
    else config.server[k] = String(v).slice(0, 20000);
    changed.push(k);
  }
  for (const [k, v] of Object.entries(secretValues || {})) {
    const meta = SERVER_KEYS[k];
    if (!meta?.secret || v === '') continue;
    if (v === null) delete secrets[k];
    else secrets[k] = String(v).trim().slice(0, 4000);
    changed.push(k);
  }
  const before = Object.fromEntries(changed.map((k) => [k, env[k]]));
  writeJsonFile(configFile(), config);
  writeJsonFile(secretsFile(), secrets, 0o600);
  for (const k of changed) apply(k);
  const real = changed.filter((k) => before[k] !== env[k]);
  return {
    changed: real,
    channels: real.some((k) => SERVER_KEYS[k].channels),
    restart: real.filter((k) => SERVER_KEYS[k].restart),
  };
}

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
