/**
 * Base de datos de la plataforma 7ots.com (solo con PLATFORM=true).
 *
 * SQLite de Node (node:sqlite): sin dependencias ni servidor aparte. Un fichero,
 * PLATFORM_DB (defecto data/platform.db), en modo WAL.
 *
 *   accounts       cuentas (email y/o notlogin_sub)
 *   sessions       sesiones del dashboard (se guarda el hash del token, nunca el token)
 *   login_tokens   enlaces de acceso por email (hash, 15 min, un solo uso)
 *   ots            los agentes: identidad, widget y ajustes en JSON; claves cifradas aparte
 *   conversations  una por visitante y sesión del widget (o contacto de un canal)
 *   messages       lo que dijo cada uno (texto, sin el `raw` del proveedor)
 *   usage          contadores por ots, mes y tipo
 *   integrations   cuentas conectadas de cada cuenta (apuchat, Orquesta), cifradas
 *   platform_state valores de la plataforma (p. ej. el client_id de OAuth registrado en Orquesta)
 *   ots_tasks      tareas que un ots mandó a Orquesta: quién la pidió, por dónde y cómo acabó
 *   sites          sites/APIs/MCPs enrolled in Prowl.world so ots know how to use them (sites.mjs)
 *   devices        computers signed in with `7ots login` (the desktop pet): a bearer token, hashed
 *   ots_vms        the machine where an ot's assistant worker runs (one per ot; vm.mjs, docs/VM-PLAN.md):
 *                  provider 'byo' (the owner's own server, enrolled by hand), 'orquesta' (in the account's Orquesta
 *                  child org, paid through Orquesta's checkout) or 'orquesta_user' (in the owner's own Orquesta org)
 *   vm_jobs        work the desktop sends to that VM, and how it ended
 *   vm_job_events  what the worker reported while doing it (seq per job, for long-polls)
 */

import { lookPrint } from './look.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  notlogin_sub TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  via TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS login_tokens (
  hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS ots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'on',
  domains TEXT NOT NULL DEFAULT '[]',
  identity TEXT NOT NULL DEFAULT '{}',
  widget TEXT NOT NULL DEFAULT '{}',
  settings TEXT NOT NULL DEFAULT '{}',
  secrets TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ots_account ON ots(account_id);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  ots_id TEXT NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'web',
  visitor TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  messages INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_ots ON conversations(ots_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS usage (
  account_id TEXT NOT NULL,
  ots_id TEXT NOT NULL,
  month TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ots_id, month, kind)
);
CREATE INDEX IF NOT EXISTS usage_account ON usage(account_id, month);
CREATE TABLE IF NOT EXISTS integrations (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, kind)
);
CREATE TABLE IF NOT EXISTS platform_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_account ON devices(account_id);
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'site',
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  guide TEXT NOT NULL DEFAULT '',
  service_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  proof TEXT,
  created_at INTEGER NOT NULL,
  verified_at INTEGER
);
CREATE INDEX IF NOT EXISTS sites_account ON sites(account_id);
CREATE TABLE IF NOT EXISTS ots_tasks (
  id TEXT PRIMARY KEY,
  ots_id TEXT NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  who TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT '',
  task TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ots_tasks_ots ON ots_tasks(ots_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ots_payments (
  id TEXT PRIMARY KEY,
  ots_id TEXT NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  network TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  amount TEXT NOT NULL,
  asset TEXT NOT NULL DEFAULT 'USDC',
  reason TEXT NOT NULL DEFAULT '',
  who TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  intent_id TEXT,
  tx_hash TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ots_payments_ots ON ots_payments(ots_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ots_vms (
  ots_id TEXT PRIMARY KEY REFERENCES ots(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'byo',
  orq_project_id TEXT NOT NULL DEFAULT '',
  orq_vm_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  size TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  enroll_hash TEXT UNIQUE,
  enroll_exp INTEGER,
  agent_hash TEXT UNIQUE,
  agent_seen_at INTEGER,
  worker_version TEXT NOT NULL DEFAULT '',
  worker_info TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vm_jobs (
  id TEXT PRIMARY KEY,
  ots_id TEXT NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  result TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vm_jobs_ots ON vm_jobs(ots_id, created_at DESC);
CREATE TABLE IF NOT EXISTS vm_job_events (
  job_id TEXT NOT NULL REFERENCES vm_jobs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  PRIMARY KEY (job_id, seq)
);
`;

let db = null;

/** Carpeta de datos de la plataforma (junto a PLATFORM_DB): ahí van también los archivos subidos. */
export const dataDir = () => (process.env.PLATFORM_DB === ':memory:' ? resolve(ROOT, 'data') : dirname(resolve(ROOT, process.env.PLATFORM_DB || join('data', 'platform.db'))));

/** Abre (y crea si hace falta) la base de datos. Idempotente. */
export function openDb(path = process.env.PLATFORM_DB) {
  if (db) return db;
  const file = path === ':memory:' ? path : resolve(ROOT, path || join('data', 'platform.db'));
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  migrateLookPrints(db);
  // VMs paid by 7ots (provider 'orquesta') are opt-in per account; your own server never needs it (vm.mjs).
  if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'vm_enabled')) db.exec('ALTER TABLE accounts ADD COLUMN vm_enabled INTEGER NOT NULL DEFAULT 0');
  // VMs created through Orquesta: its last-seen VM status, when it was checked and the monthly price it quoted.
  const vmCols = db.prepare('PRAGMA table_info(ots_vms)').all().map((c) => c.name);
  if (!vmCols.includes('orq_status')) db.exec("ALTER TABLE ots_vms ADD COLUMN orq_status TEXT NOT NULL DEFAULT ''");
  if (!vmCols.includes('orq_checked_at')) db.exec('ALTER TABLE ots_vms ADD COLUMN orq_checked_at INTEGER');
  if (!vmCols.includes('price_cents')) db.exec('ALTER TABLE ots_vms ADD COLUMN price_cents INTEGER');
  // One Orquesta child org per 7ots account (partner orgs): the account's org id, and the org each VM lives in
  // ('' = the partner's own org, VMs made before child orgs). Provider 'orquesta_user' VMs live in the owner's org.
  if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'orq_org_id')) db.exec("ALTER TABLE accounts ADD COLUMN orq_org_id TEXT NOT NULL DEFAULT ''");
  if (!vmCols.includes('orq_org_id')) db.exec("ALTER TABLE ots_vms ADD COLUMN orq_org_id TEXT NOT NULL DEFAULT ''");
  return db;
}

export function getDb() {
  return db || openDb();
}

/**
 * Cada ot es único: huella del aspecto (ver look.mjs) con índice UNIQUE. Las bases viejas ganan la
 * columna y se rellenan; si ya había repetidos, el más antiguo se queda la huella y los demás quedan
 * sin ella (y se avisa) hasta que se les cambie la cara: guardarlos de nuevo exige una libre.
 */
function migrateLookPrints(d) {
  if (!d.prepare('PRAGMA table_info(ots)').all().some((c) => c.name === 'look_print')) d.exec('ALTER TABLE ots ADD COLUMN look_print TEXT');
  d.exec('CREATE UNIQUE INDEX IF NOT EXISTS ots_look ON ots(look_print)');
  const seen = new Set(d.prepare('SELECT look_print p FROM ots WHERE look_print IS NOT NULL').all().map((r) => r.p));
  const set = d.prepare('UPDATE ots SET look_print = ? WHERE id = ?');
  for (const row of d.prepare('SELECT id, identity FROM ots WHERE look_print IS NULL ORDER BY created_at').all()) {
    let p = null;
    try {
      p = lookPrint(JSON.parse(row.identity));
    } catch {
      /* identidad rota: sin huella */
    }
    if (!p) continue;
    if (seen.has(p)) console.warn(`[7ots] plataforma: ${row.id} repite la cara de otro ot; queda sin huella hasta que se le cambie`);
    else set.run(p, row.id), seen.add(p);
  }
}

/** Cierra la base de datos (tests). */
export function closeDb() {
  db?.close();
  db = null;
}

/** Varias escrituras como una sola. */
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const out = fn(d);
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/** Mes en curso (UTC) para los contadores: "2026-09". */
export const monthOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
