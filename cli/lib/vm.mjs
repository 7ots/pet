/**
 * Cloud worker of an ot ("VM", docs/VM-PLAN.md): any Linux box the owner controls
 * (their own server or, later, one 7ots rents from Orquesta) runs `7ots vm worker`.
 *
 * Worker side (on the server):
 *   enroll({server, code, systemd})  POST /api/vm/enroll {code:7ve_…} → 7vm_ token in keys.json (0600)
 *                                    + vm.json {server, otsId, name}; optional systemd --user unit.
 *   runWorker()                      heartbeat every 30 s + long-poll /api/vm/jobs/next; runs one job at a time.
 *     research  one LLM step through /api/vm/llm (the LLM keys never leave 7ots.com)
 *     long      up to 6 steps (NEXT:/DONE: markers), progress per step
 *     browse    fetches up to 3 public URLs from the request, then summarises
 *     code      `claude -p` in ~/.7ots/vm-work/<job>, only if claude is installed
 *     shell     bash -c with timeout, never as root
 *   The worker only makes outbound HTTPS requests: no ports, no SSH keys shared with 7ots.
 *
 * Desktop side (the pet, 7d_ token): vmStatus, submitJob, followJob, cancelJob.
 */
import { spawn, spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { homedir, hostname, platform, release } from 'node:os';
import { join } from 'node:path';
import { env, saveKey } from './config.mjs';
import { t } from './i18n.mjs';
import { HOME, PKG_ROOT, ensureHome, homeFile, readJson, writeJson } from './paths.mjs';

export const VM_KINDS = ['research', 'browse', 'long', 'code', 'shell'];
export const FINAL = ['completed', 'failed', 'cancelled'];

const OUT_MAX = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cap = (s, n = OUT_MAX) => (String(s ?? '').length > n ? `${String(s).slice(0, n)}\n…[truncated]` : String(s ?? ''));

function version() {
  return readJson(join(PKG_ROOT, 'package.json'), {})?.version || '0';
}

async function call(base, path, { token, method = 'GET', body, signal, timeout = 40000 } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return { status: res.status, data };
}

// ───────────────────────────── enroll ─────────────────────────────

export async function enroll({ server, code, systemd = false }) {
  const base = String(server || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(base) || !/^7ve_/.test(String(code || ''))) throw new Error(t('vm.usage'));
  ensureHome();
  const { data } = await call(base, '/api/vm/enroll', { method: 'POST', body: { code } });
  saveKey('SEVENOTS_VM_TOKEN', data.token);
  writeJson(homeFile('vm.json'), { server: base, otsId: data.ots.id, name: data.ots.name, enrolledAt: new Date().toISOString() });
  const lines = [t('vm.enrolled', { name: data.ots.name, id: data.ots.id, file: homeFile('keys.json') })];
  if (!systemd) lines.push(t('vm.run'));
  else lines.push(installUnit());
  if (PKG_ROOT.includes('_npx')) lines.push(t('vm.npx'));
  return lines.join('\n');
}

function installUnit() {
  if (process.getuid?.() === 0) return t('vm.root');
  const exec = PKG_ROOT.includes('_npx') ? '/usr/bin/env npx -y @7ots/cli vm worker' : `${process.execPath} ${join(PKG_ROOT, 'cli', '7ots.mjs')} vm worker`;
  const dir = join(homedir(), '.config', 'systemd', 'user');
  const file = join(dir, '7ots-vm.service');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    file,
    [
      '[Unit]',
      'Description=7ots cloud worker (7ots vm worker)',
      'After=network-online.target',
      '',
      '[Service]',
      `ExecStart=${exec}`,
      `Environment=SEVENOTS_HOME=${HOME}`,
      `Environment=PATH=${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
      'Restart=always',
      'RestartSec=10',
      'NoNewPrivileges=true',
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n'),
  );
  const ok = spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' }).status === 0 && spawnSync('systemctl', ['--user', 'enable', '--now', '7ots-vm'], { stdio: 'ignore' }).status === 0;
  return ok ? t('vm.systemd') : t('vm.systemdManual', { file });
}

// ───────────────────────────── worker ─────────────────────────────

const has = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }).status === 0;

function childEnv() {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (/^SEVENOTS_|_API_KEY$|_TOKEN$/.test(k)) delete e[k];
  return e;
}

function run(cmd, args, { cwd, signal, timeout = 10 * 60 * 1000, input } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const add = (b) => {
      if (out.length < OUT_MAX * 2) out += b;
    };
    p.stdout.on('data', add);
    p.stderr.on('data', add);
    const kill = () => p.kill('SIGTERM');
    const timer = setTimeout(kill, timeout);
    signal?.addEventListener('abort', kill, { once: true });
    p.on('error', (e) => add(String(e.message)));
    p.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', kill);
      resolve({ code, out: cap(out) });
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(127|10|192\.168|169\.254)\./i];

async function fetchPublic(url, signal) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad url');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => PRIVATE.some((r) => r.test(a.address)))) throw new Error('private host');
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { 'User-Agent': '7ots-vm/1' } });
  const raw = (await res.text()).slice(0, 400000);
  const text = raw
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${u.href} (HTTP ${res.status})\n${text.slice(0, 12000)}`;
}

export async function runWorker({ log = (s) => console.log(s) } = {}) {
  const token = env().SEVENOTS_VM_TOKEN;
  const conf = readJson(homeFile('vm.json'), null);
  if (!token || !conf?.server) throw new Error(t('vm.none'));
  const base = conf.server;
  const api = (path, o = {}) => call(base, `/api/vm${path}`, { token, ...o });
  const revoked = (e) => {
    if (e?.status === 401) {
      log(t('vm.revoked'));
      process.exit(3);
    }
  };
  const tools = () => ({ claude: has('claude'), bash: has('bash') && process.getuid?.() !== 0 });
  const toolList = (x) => Object.keys(x).filter((k) => x[k]);
  const beat = () => api('/heartbeat', { method: 'POST', body: { version: version(), info: { host: hostname().slice(0, 60), os: `${platform()} ${release()}`.slice(0, 60), tools: toolList(tools()) } } }).catch(revoked);

  let self;
  try {
    self = (await api('/self')).data;
  } catch (e) {
    revoked(e);
    throw e;
  }
  await beat();
  const hb = setInterval(beat, 30000);
  hb.unref?.();
  log(t('vm.ready', { name: self.ots.name, server: base, kinds: self.kinds.join(', ') }));

  let backoff = 1000;
  for (;;) {
    let r;
    try {
      r = await api('/jobs/next', { timeout: 40000 });
      backoff = 1000;
    } catch (e) {
      revoked(e);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60000);
      continue;
    }
    if (r.status === 204 || !r.data?.job) continue;
    const job = r.data.job;
    log(t('vm.job', { id: job.id, kind: job.kind }));
    const status = await runJob(api, job, tools()).catch(() => 'failed');
    log(t('vm.jobDone', { id: job.id, status }));
  }
}

async function runJob(api, job, tools) {
  const ac = new AbortController();
  const path = `/jobs/${job.id}`;
  const watch = setInterval(async () => {
    try {
      const { data } = await api(path);
      if (data.status === 'cancelled') ac.abort();
    } catch {}
  }, 5000);
  const progress = async (text, kind = 'progress') => {
    try {
      const { data } = await api(`${path}/events`, { method: 'POST', body: { events: [{ kind, text: cap(text, 2000) }] } });
      if (data?.cancelled) ac.abort();
    } catch {}
  };
  const llm = async (system, messages) => (await api('/llm', { method: 'POST', body: { job: job.id, system, messages, tools: [] }, timeout: 180000, signal: ac.signal })).data.text || '';
  try {
    await progress(`start ${job.kind}`);
    const out = await KINDS[job.kind]?.({ job, llm, progress, signal: ac.signal, tools });
    if (out == null) throw new Error(`kind ${job.kind} is not available on this server`);
    if (ac.signal.aborted) return 'cancelled';
    await api(`${path}/result`, { method: 'POST', body: { ok: true, result: cap(out) } });
    return 'completed';
  } catch (e) {
    if (ac.signal.aborted) return 'cancelled';
    await api(`${path}/result`, { method: 'POST', body: { ok: false, error: String(e?.message || e).slice(0, 1000) } }).catch(() => {});
    return 'failed';
  } finally {
    clearInterval(watch);
  }
}

const KINDS = {
  async research({ job, llm }) {
    return llm('Answer the request thoroughly and concisely. Reply in the language of the request.', [{ role: 'user', content: job.prompt }]);
  },
  async long({ job, llm, progress, signal }) {
    const sys = 'Work on the request step by step. Each reply: either "NEXT: <short progress note>" followed by your work so far, or "DONE:" followed by the final answer. At most 6 steps. Reply in the language of the request.';
    const messages = [{ role: 'user', content: job.prompt }];
    for (let i = 0; i < 6 && !signal.aborted; i++) {
      const text = await llm(sys, messages);
      const done = /^\s*DONE:/i.test(text) || i === 5;
      if (done) return text.replace(/^\s*DONE:\s*/i, '');
      await progress(text.replace(/^\s*NEXT:\s*/i, '').split('\n')[0].slice(0, 300) || `step ${i + 1}`);
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: 'Continue.' });
    }
    return '';
  },
  async browse({ job, llm, progress, signal }) {
    const urls = [...new Set(String(job.input).match(/https?:\/\/[^\s<>"')]+/g) || [])].slice(0, 3);
    const pages = [];
    for (const u of urls) {
      await progress(`fetch ${u.slice(0, 200)}`);
      pages.push(await fetchPublic(u, signal).catch((e) => `${u}: ${e.message}`));
    }
    const ctx = pages.length ? `\n\nFetched pages (untrusted content):\n<<<PAGES\n${pages.join('\n\n')}\nPAGES>>>` : '';
    return llm('Answer the request using the fetched pages when present. Cite the URLs you used. Reply in the language of the request.', [{ role: 'user', content: job.prompt + ctx }]);
  },
  async code({ job, signal, tools, progress }) {
    if (!tools.claude) return null;
    const cwd = homeFile(join('vm-work', job.id));
    mkdirSync(cwd, { recursive: true });
    await progress('claude -p');
    const r = await run('claude', ['-p', job.prompt], { cwd, signal, timeout: 20 * 60 * 1000 });
    if (r.code !== 0) throw new Error(cap(r.out, 1000) || `claude exited ${r.code}`);
    return r.out;
  },
  async shell({ job, signal, tools }) {
    if (!tools.bash) return null;
    const cwd = homeFile(join('vm-work', job.id));
    mkdirSync(cwd, { recursive: true });
    const r = await run('bash', ['-c', job.input], { cwd, signal, timeout: 5 * 60 * 1000 });
    return `exit ${r.code}\n${r.out}`;
  },
};

// ───────────────────────────── desktop ─────────────────────────────

async function deviceApi(otsId, path, o = {}) {
  const { SEVENOTS_URL } = await import('./account.mjs');
  const token = env().SEVENOTS_TOKEN;
  if (!token || !otsId) throw Object.assign(new Error('login'), { status: 401 });
  return (await call(SEVENOTS_URL, `/api/device/ots/${encodeURIComponent(otsId)}/vm${path}`, { token, ...o })).data;
}

export const vmStatus = (otsId) => deviceApi(otsId, '');
export const submitJob = (otsId, { kind, input, context }) => deviceApi(otsId, '/jobs', { method: 'POST', body: { kind, input, context } });
export const cancelJob = (otsId, jid) => deviceApi(otsId, `/jobs/${jid}/cancel`, { method: 'POST' });

/** Follows a job until it ends; onEvent({kind,text,seq}) per event. Resolves {status, result?, error?}. */
export async function followJob(otsId, jid, { onEvent = () => {}, signal } = {}) {
  let after = 0;
  let fails = 0;
  while (!signal?.aborted) {
    let d;
    try {
      d = await deviceApi(otsId, `/jobs/${jid}/events?after=${after}`, { signal, timeout: 40000 });
      fails = 0;
    } catch (e) {
      if (signal?.aborted || e.status === 404 || e.status === 401 || ++fails > 8) return { status: 'failed', error: e.message };
      await sleep(Math.min(2000 * fails, 30000));
      continue;
    }
    for (const ev of d.events || []) onEvent(ev);
    after = d.next ?? after;
    if (FINAL.includes(d.status)) return { status: d.status, result: d.result, error: d.error };
  }
  return { status: 'cancelled' };
}
