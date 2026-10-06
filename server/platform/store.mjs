/**
 * Datos de la plataforma: cuentas, sesiones, ots, conversaciones y uso.
 * Todo pasa por aquí; las rutas nunca escriben SQL.
 */

import { defineIdentity } from '../../src/identity/schema.js';
import { getDb, monthOf, tx } from './db.mjs';
import { lookPrint } from './look.mjs';
import { randomIdentity, newSeed } from '../../src/identity/random.js';
import { i18nError } from '../i18n.mjs';
import { newId, open, seal, sha256, token } from './crypto.mjs';

const now = () => Date.now();
const parse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export const SESSION_TTL = 30 * 24 * 3600_000;
export const MAX_OTS_PER_ACCOUNT = () => Number(process.env.PLATFORM_MAX_OTS || 7);

/**
 * Ajustes que cada ots puede cambiar. Lo que no está aquí lo fija la plataforma
 * (hub de apuchat, API de apumail, URL de la voz de apuchat, puertos…): así nadie puede
 * apuntar el servidor a direcciones internas.
 *   secret: se guarda cifrado y nunca se devuelve.
 *   max:    tope numérico.
 *   channels: al cambiar, se reinician los canales de ese ots.
 *   managed:  only the dashboard's own routes write it (apuchat identity, Orquesta panel);
 *             the backoffice's /server PUT ignores it and a duplicate doesn't copy it.
 */
export const OTS_KEYS = {
  LLM_PROVIDER: {}, LLM_MODEL: {}, LLM_EFFORT: {}, LLM_MAX_TOKENS: { max: 16000 },
  ANTHROPIC_API_KEY: { secret: true }, OPENAI_API_KEY: { secret: true },
  SERVER_INSTRUCTIONS: {},
  TTS_PROVIDER: {}, OPENAI_TTS_MODEL: {}, OPENAI_TTS_VOICE: {},
  ELEVENLABS_API_KEY: { secret: true }, ELEVENLABS_VOICE_ID: {}, ELEVENLABS_MODEL: {},
  APUCHAT_VOICE_TOKEN: { secret: true }, APUCHAT_VOICE_ID: {}, APUCHAT_VOICE_PROVIDER: {},
  XAI_API_KEY: { secret: true }, XAI_TTS_VOICE: {},
  FISH_API_KEY: { secret: true }, FISH_VOICE_ID: {}, FISH_MODEL: {},
  APUMAIL_INBOX: {}, APUMAIL_INBOX_TOKEN: { secret: true }, APUMAIL_TO: {},
  APUCHAT_NOTIFIER_IDENTITY_KEY: { secret: true }, APUCHAT_OPERATOR_HANDLE: {}, APUCHAT_TRANSCRIBE: {},
  APUMAIL_AGENT_INBOX: { channels: true }, APUMAIL_AGENT_TOKEN: { secret: true, channels: true },
  APUMAIL_AGENT_DAILY: { channels: true, max: 100 },
  APUCHAT_AGENT_IDENTITY_KEY: { secret: true, channels: true }, APUCHAT_AGENT_ALLOW: { channels: true },
  AGENT_MAX_CALLS: { channels: true, max: 3 }, AGENT_CALL_MAX_MINUTES: { channels: true, max: 30 }, AGENT_CALL_MAX_TURNS: { channels: true, max: 60 },
  // apuchat identity made from the dashboard: its @callsign, '1' while it is a free one, and who holds it
  // ('managed' = the platform's anonymous apuchat account for this 7ots account, 'linked' = the user's own).
  APUCHAT_AGENT_CALLSIGN: { managed: true }, APUCHAT_AGENT_FREE: { managed: true }, APUCHAT_AGENT_OWNER: { managed: true },
  // Orquesta tasks: project, on/off, who may ask outside the dashboard (explicit list, empty = nobody), daily cap.
  // Read on every message, so changing them never restarts the channels.
  ORQUESTA_PROJECT: { managed: true }, ORQUESTA_PROJECT_NAME: { managed: true }, ORQUESTA_TASKS: { managed: true },
  ORQUESTA_ALLOW: { managed: true }, ORQUESTA_DAILY: { managed: true, max: 200 },
  // The ot's own MCP servers and APIs (integrations.mjs): JSON list; their tokens live in secrets as INTEG_<id>.
  INTEGRATIONS: { managed: true },
  // Cloud VM (vm.mjs): which job kinds the desktop may send to this ot's worker (csv; default research,browse,long).
  VM_JOB_KINDS: {},
};

// ───────────────────────────── cuentas ─────────────────────────────

export function accountById(id) {
  return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) || null;
}

/**
 * Cuenta para un login. Con notlogin se busca por `sub`; si no existe y trae un email
 * verificado que ya tiene cuenta, se vincula a esa. Si no, se crea.
 */
export function upsertAccount({ email = null, notloginSub = null, name = '' }) {
  email = email ? String(email).trim().toLowerCase() : null;
  return tx((d) => {
    let acc = notloginSub ? d.prepare('SELECT * FROM accounts WHERE notlogin_sub = ?').get(notloginSub) : null;
    if (!acc && email) acc = d.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
    // An email account already tied to a different notlogin identity is not taken over.
    if (acc && notloginSub && acc.notlogin_sub && acc.notlogin_sub !== notloginSub) throw i18nError(409, 'platform.api.accountLinked');
    if (acc) {
      if (notloginSub && !acc.notlogin_sub) d.prepare('UPDATE accounts SET notlogin_sub = ? WHERE id = ?').run(notloginSub, acc.id);
      if (email && !acc.email && !d.prepare('SELECT 1 FROM accounts WHERE email = ?').get(email)) d.prepare('UPDATE accounts SET email = ? WHERE id = ?').run(email, acc.id);
      d.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now(), acc.id);
      return d.prepare('SELECT * FROM accounts WHERE id = ?').get(acc.id);
    }
    const id = newId('acc');
    d.prepare('INSERT INTO accounts (id, email, notlogin_sub, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, email, notloginSub, String(name || '').slice(0, 80), now(), now());
    return d.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  });
}

/** Ties a notlogin identity to an account that signed in another way ("Connect Notlogin"). */
export function linkNotlogin(accountId, notloginSub) {
  return tx((d) => {
    const acc = d.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!acc) throw i18nError(404, 'platform.api.notFound');
    if (acc.notlogin_sub === notloginSub) return acc;
    if (acc.notlogin_sub || d.prepare('SELECT 1 FROM accounts WHERE notlogin_sub = ?').get(notloginSub)) throw i18nError(409, 'platform.api.accountLinked');
    d.prepare('UPDATE accounts SET notlogin_sub = ? WHERE id = ?').run(notloginSub, accountId);
    return d.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  });
}

export function publicAccount(acc) {
  return { id: acc.id, email: acc.email, name: acc.name, plan: acc.plan, notlogin: !!acc.notlogin_sub, vmEnabled: acc.vm_enabled === 1, createdAt: acc.created_at };
}

// ───────────────────────────── sesiones ─────────────────────────────

/** Crea una sesión y devuelve el token en claro (solo va en la cookie). */
export function createSession(accountId, via) {
  const raw = token();
  getDb().prepare('INSERT INTO sessions (id, account_id, created_at, expires_at, via) VALUES (?, ?, ?, ?, ?)').run(sha256(raw), accountId, now(), now() + SESSION_TTL, via);
  return raw;
}

export function sessionAccount(raw) {
  if (!raw) return null;
  const row = getDb().prepare('SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = ? AND s.expires_at > ?').get(sha256(raw), now());
  return row || null;
}

export function deleteSession(raw) {
  if (raw) getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sha256(raw));
}

/** Closes every session of the account (sign out everywhere). */
export function deleteAccountSessions(accountId) {
  getDb().prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
}

/** Does a login (email or notlogin sub) already have an account? */
export function accountExists({ email = null, notloginSub = null }) {
  const d = getDb();
  return !!((notloginSub && d.prepare('SELECT 1 FROM accounts WHERE notlogin_sub = ?').get(notloginSub)) || (email && d.prepare('SELECT 1 FROM accounts WHERE email = ?').get(String(email).trim().toLowerCase())));
}

// ───────────────────────────── enlaces por email ─────────────────────────────

export const LOGIN_TOKEN_TTL = 15 * 60_000;

export function createLoginToken(email) {
  const raw = token();
  const d = getDb();
  d.prepare('DELETE FROM login_tokens WHERE expires_at < ?').run(now() - 24 * 3600_000);
  d.prepare('INSERT INTO login_tokens (hash, email, expires_at) VALUES (?, ?, ?)').run(sha256(raw), email, now() + LOGIN_TOKEN_TTL);
  return raw;
}

/** Enlaces pedidos para ese email en la última hora (límite anti-abuso). */
export function recentLoginTokens(email) {
  return getDb().prepare('SELECT COUNT(*) n FROM login_tokens WHERE email = ? AND expires_at > ?').get(email, now() + LOGIN_TOKEN_TTL - 3600_000).n;
}

/** Gasta un enlace: devuelve el email si era válido (una sola vez). */
export function consumeLoginToken(raw) {
  if (!raw) return null;
  return tx((d) => {
    const row = d.prepare('SELECT * FROM login_tokens WHERE hash = ?').get(sha256(raw));
    if (!row || row.used_at || row.expires_at < now()) return null;
    d.prepare('UPDATE login_tokens SET used_at = ? WHERE hash = ?').run(now(), row.hash);
    return row.email;
  });
}

// ───────────────────────────── ots ─────────────────────────────

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    status: row.status,
    domains: parse(row.domains, []),
    identity: defineIdentity(parse(row.identity, {})),
    widget: parse(row.widget, {}),
    settings: parse(row.settings, {}),
    secrets: open(row.secrets),
    lookPrint: row.look_print || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getOts(id) {
  return hydrate(getDb().prepare('SELECT * FROM ots WHERE id = ?').get(String(id || '')));
}

/** El ots solo si es de esa cuenta (si no, null: la ruta responde 404, no 403). */
export function getOwnOts(accountId, id) {
  const o = getOts(id);
  return o && o.accountId === accountId ? o : null;
}

export function listOts(accountId) {
  return getDb().prepare('SELECT * FROM ots WHERE account_id = ? ORDER BY created_at').all(accountId).map(hydrate);
}

export function countOts(accountId) {
  return getDb().prepare('SELECT COUNT(*) n FROM ots WHERE account_id = ?').get(accountId).n;
}

// Cada ot es único (ver look.mjs): la base rechaza una cara repetida con este error.
const isLookClash = (e) => /UNIQUE/i.test(e?.message || '') && /look_print/.test(e.message);
const lookTakenError = () => i18nError(409, 'platform.api.lookTaken');

/** ¿Esa cara ya la tiene otro ot? (`exceptId`: el propio, al guardarlo). */
export function lookTaken(identity, exceptId = '') {
  const p = lookPrint(defineIdentity(identity));
  return !!p && !!getDb().prepare('SELECT 1 FROM ots WHERE look_print = ? AND id != ?').get(p, String(exceptId));
}

/**
 * La misma identidad con una cara nueva que nadie tenga: la de la semilla `seed` si está libre y si no,
 * semillas al azar. Lo usan crear (un ot sin cara elegida) y duplicar.
 */
export function withFreeLook(identity, seed = null) {
  for (let i = 0; i < 40; i++) {
    const look = randomIdentity(i === 0 && seed ? seed : newSeed()).look;
    const next = { ...identity, look: { ...identity.look, kind: 'character', character: look.character } };
    if (!lookTaken(next)) return next;
  }
  throw lookTakenError();
}

export function createOts(accountId, { name, identity = {}, widget = {}, settings = {}, secrets = {}, domains = [] } = {}) {
  const id = newId('ots');
  const nm = cleanName(name) || 'Ots';
  const ident = defineIdentity({ ...identity, name: identity.name || nm });
  try {
    getDb()
      .prepare('INSERT INTO ots (id, account_id, name, status, domains, identity, widget, settings, secrets, look_print, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, accountId, nm, 'on', JSON.stringify(cleanDomains(domains)), JSON.stringify(ident), JSON.stringify(widget), JSON.stringify(settings), seal(secrets), lookPrint(ident), now(), now());
  } catch (e) {
    throw isLookClash(e) ? lookTakenError() : e;
  }
  return getOts(id);
}

/** Copia un ots (sin sus claves ni canales propios: un @handle no puede estar en dos ots) con otra cara: no hay dos iguales. */
export function duplicateOts(accountId, src) {
  const settings = { ...src.settings };
  for (const k of Object.keys(settings)) if (OTS_KEYS[k]?.channels || OTS_KEYS[k]?.managed) delete settings[k];
  return createOts(accountId, { name: `${src.name} (copia)`, identity: withFreeLook(src.identity), widget: src.widget, settings, domains: src.domains });
}

export function updateOts(id, patch) {
  const cur = getOts(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  // Un ot viejo que ya repetía cara (sin huella) se puede seguir guardando mientras no la cambie.
  let print = lookPrint(next.identity);
  if (!cur.lookPrint && print === lookPrint(cur.identity) && lookTaken(next.identity, id)) print = null;
  try {
    getDb()
      .prepare('UPDATE ots SET name = ?, status = ?, domains = ?, identity = ?, widget = ?, settings = ?, secrets = ?, look_print = ?, updated_at = ? WHERE id = ?')
      .run(cleanName(next.name) || cur.name, next.status === 'off' ? 'off' : 'on', JSON.stringify(cleanDomains(next.domains)), JSON.stringify(next.identity), JSON.stringify(next.widget), JSON.stringify(next.settings), seal(next.secrets), print, now(), id);
  } catch (e) {
    throw isLookClash(e) ? lookTakenError() : e;
  }
  return getOts(id);
}

export function deleteOts(id) {
  getDb().prepare('DELETE FROM ots WHERE id = ?').run(id);
}

/** Todos los ots encendidos (para arrancar sus canales). */
export function allLiveOts() {
  return getDb().prepare("SELECT * FROM ots WHERE status = 'on'").all().map(hydrate);
}

function cleanName(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * Dominios donde puede ir el widget: "tienda.com", "*.tienda.com" o "http://localhost:3000".
 * Se guardan como orígenes o comodines normalizados.
 */
export function cleanDomains(list) {
  const out = new Set();
  for (const raw of Array.isArray(list) ? list : String(list || '').split(/[\s,]+/)) {
    let s = String(raw || '').trim().toLowerCase().replace(/\/+$/, '');
    if (!s) continue;
    const wildcard = s.startsWith('*.');
    if (wildcard) s = s.slice(2);
    if (!/^https?:\/\//.test(s)) s = `https://${s}`;
    let u;
    try {
      u = new URL(s);
    } catch {
      continue;
    }
    if (!/^[a-z0-9.-]+$/.test(u.hostname) || u.pathname !== '/' || u.search || u.username) continue;
    out.add(wildcard ? `*.${u.hostname}` : u.origin);
    if (out.size >= 20) break;
  }
  return [...out];
}

/** ¿Puede este origen usar el ots? */
export function originAllowed(ots, origin) {
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  return ots.domains.some((d) => {
    if (d.startsWith('*.')) {
      const base = d.slice(2);
      return u.protocol === 'https:' && (u.hostname === base || u.hostname.endsWith(`.${base}`));
    }
    // "https://tienda.com" también admite www.tienda.com
    const a = new URL(d);
    return u.protocol === a.protocol && u.port === a.port && (u.hostname === a.hostname || u.hostname === `www.${a.hostname}`);
  });
}

// ───────────────────────────── conversaciones ─────────────────────────────

/**
 * Apunta un turno en la conversación (se crea la primera vez).
 * `key` la elige quien llama (sesión del widget, contacto del canal); el id se deriva de ella.
 * @returns {{ created: boolean }}
 */
/** `page`: URL concreta (actualiza la conversación); `origin`: solo si aún no hay página. */
export function logTurn(ots, { key, channel = 'web', visitor = '', page = '', origin = '', user = '', reply = '' }) {
  if (!key || (!user && !reply)) return { created: false };
  const id = `c_${sha256(`${ots.id}:${channel}:${key}`).slice(0, 22)}`;
  const t = now();
  return tx((d) => {
    const cur = d.prepare('SELECT id FROM conversations WHERE id = ?').get(id);
    if (!cur) {
      d.prepare('INSERT INTO conversations (id, ots_id, channel, visitor, page, title, messages, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').run(id, ots.id, channel, String(visitor).slice(0, 120), String(page || origin).slice(0, 500), String(user || reply).replace(/\s+/g, ' ').slice(0, 80), t, t);
    }
    let n = 0;
    if (user) {
      d.prepare('INSERT INTO messages (conversation_id, role, content, at) VALUES (?, ?, ?, ?)').run(id, 'user', String(user).slice(0, 8000), t);
      n++;
    }
    if (reply) {
      d.prepare('INSERT INTO messages (conversation_id, role, content, at) VALUES (?, ?, ?, ?)').run(id, 'assistant', String(reply).slice(0, 8000), t);
      n++;
    }
    d.prepare('UPDATE conversations SET messages = messages + ?, updated_at = ?, page = CASE WHEN ? != \'\' THEN ? ELSE page END WHERE id = ?').run(n, t, page, String(page).slice(0, 500), id);
    return { created: !cur };
  });
}

export function listConversations(otsId, { limit = 50, before = null } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const rows = before
    ? getDb().prepare('SELECT * FROM conversations WHERE ots_id = ? AND updated_at < ? ORDER BY updated_at DESC LIMIT ?').all(otsId, Number(before), lim)
    : getDb().prepare('SELECT * FROM conversations WHERE ots_id = ? ORDER BY updated_at DESC LIMIT ?').all(otsId, lim);
  return rows.map((r) => ({ id: r.id, channel: r.channel, visitor: r.visitor, page: r.page, title: r.title, messages: r.messages, startedAt: r.started_at, updatedAt: r.updated_at }));
}

export function getConversation(otsId, id) {
  const c = getDb().prepare('SELECT * FROM conversations WHERE id = ? AND ots_id = ?').get(id, otsId);
  if (!c) return null;
  const messages = getDb().prepare('SELECT role, content, at FROM messages WHERE conversation_id = ? ORDER BY id LIMIT 2000').all(id);
  return { id: c.id, channel: c.channel, visitor: c.visitor, page: c.page, title: c.title, startedAt: c.started_at, updatedAt: c.updated_at, messages };
}

export function deleteConversation(otsId, id) {
  return getDb().prepare('DELETE FROM conversations WHERE id = ? AND ots_id = ?').run(id, otsId).changes > 0;
}

// ───────────────────────────── uso ─────────────────────────────

/**
 * Tipos: llm (respuestas de IA), llm_platform (las pagadas por la plataforma),
 * tts / tts_platform (audios), call (videollamadas), conversation (conversaciones nuevas).
 */
export function addUsage(ots, kind, n = 1, period = monthOf()) {
  getDb()
    .prepare('INSERT INTO usage (account_id, ots_id, month, kind, count) VALUES (?, ?, ?, ?, ?) ON CONFLICT(ots_id, month, kind) DO UPDATE SET count = count + excluded.count')
    .run(ots.accountId, ots.id, period, kind, n);
}

/** Uso del mes de toda la cuenta de un tipo (para el cupo gratis). */
export function accountUsage(accountId, kind, month = monthOf()) {
  return getDb().prepare('SELECT COALESCE(SUM(count), 0) n FROM usage WHERE account_id = ? AND month = ? AND kind = ?').get(accountId, month, kind).n;
}

/** Uso del mes por ots: { [otsId]: { llm, llm_platform, … } } */
export function usageByOts(accountId, month = monthOf()) {
  const out = {};
  for (const r of getDb().prepare('SELECT ots_id, kind, count FROM usage WHERE account_id = ? AND month = ?').all(accountId, month)) {
    (out[r.ots_id] ||= {})[r.kind] = r.count;
  }
  return out;
}

/** Últimos meses de un ots: [{ month, llm, … }] */
export function usageHistory(otsId, months = 6) {
  // `month` también guarda días (YYYY-MM-DD, el cupo diario de byte): el historial es sólo de meses
  const rows = getDb().prepare('SELECT month, kind, count FROM usage WHERE ots_id = ? AND length(month) = 7 ORDER BY month DESC').all(otsId);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.month)) by.set(r.month, { month: r.month });
    by.get(r.month)[r.kind] = r.count;
  }
  return [...by.values()].slice(0, months);
}

// ───────────────────────────── integraciones ─────────────────────────────

/** Connected service of an account ('apuchat' | 'orquesta'): its tokens, decrypted. null if none. */
export function getIntegration(accountId, kind) {
  const row = getDb().prepare('SELECT data FROM integrations WHERE account_id = ? AND kind = ?').get(accountId, kind);
  return row ? open(row.data) : null;
}

/** Saves (sealed) or, with null, forgets an account's integration. */
export function setIntegration(accountId, kind, data) {
  if (data == null) return void getDb().prepare('DELETE FROM integrations WHERE account_id = ? AND kind = ?').run(accountId, kind);
  getDb()
    .prepare('INSERT INTO integrations (account_id, kind, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .run(accountId, kind, seal(data), now());
}

export function getPlatformState(key) {
  return getDb().prepare('SELECT value FROM platform_state WHERE key = ?').get(key)?.value ?? null;
}

export function setPlatformState(key, value) {
  getDb().prepare('INSERT INTO platform_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(key, String(value), now());
}

// ───────────────────────────── tareas de Orquesta ─────────────────────────────

const taskOf = (r) => r && { id: r.id, otsId: r.ots_id, projectId: r.project_id, who: r.who, channel: r.channel, task: r.task, status: r.status, result: r.result, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at };
export const TASK_FINAL = ['completed', 'failed', 'cancelled'];

export function addTask(ots, { id, projectId, who, channel, task, status = 'pending' }) {
  getDb()
    .prepare('INSERT INTO ots_tasks (id, ots_id, account_id, project_id, who, channel, task, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(String(id), ots.id, ots.accountId, String(projectId || ''), String(who).slice(0, 200), String(channel).slice(0, 20), String(task).slice(0, 8000), status, now(), now());
  return getTask(ots.id, id);
}

export function updateTask(id, { status, result, error }) {
  getDb()
    .prepare('UPDATE ots_tasks SET status = COALESCE(?, status), result = COALESCE(?, result), error = COALESCE(?, error), updated_at = ? WHERE id = ?')
    .run(status ?? null, result == null ? null : String(result).slice(0, 20000), error == null ? null : String(error).slice(0, 2000), now(), String(id));
}

/** The task only if it belongs to that ot. */
export function getTask(otsId, id) {
  return taskOf(getDb().prepare('SELECT * FROM ots_tasks WHERE id = ? AND ots_id = ?').get(String(id || ''), otsId)) || null;
}

export function listTasks(otsId, limit = 20) {
  return getDb().prepare('SELECT * FROM ots_tasks WHERE ots_id = ? ORDER BY created_at DESC LIMIT ?').all(otsId, Math.min(100, Math.max(1, Number(limit) || 20))).map(taskOf);
}

/** Tasks the ot sent in the last 24 h (its daily cap). */
export function tasksLastDay(otsId) {
  return getDb().prepare('SELECT COUNT(*) n FROM ots_tasks WHERE ots_id = ? AND created_at > ?').get(otsId, now() - 24 * 3600_000).n;
}

/** Tasks not finished yet (newest first). */
export function openTasks(otsId) {
  return getDb().prepare(`SELECT * FROM ots_tasks WHERE ots_id = ? AND status NOT IN (${TASK_FINAL.map(() => '?').join(', ')}) ORDER BY created_at DESC LIMIT 5`).all(otsId, ...TASK_FINAL).map(taskOf);
}
