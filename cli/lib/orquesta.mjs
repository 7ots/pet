/**
 * getorquesta.com as the ot's home.
 *
 *   login()      browser login like orquesta-cli: opens /cli/auth?session=<uuid>, you press
 *                Authorize, and we poll ws.getorquesta.com/auth/result/<uuid> for an oclt_ token
 *                (saved as ORQUESTA_TOKEN in ~/.7ots/keys.json, 0600).
 *   projects()   GET /api/orquesta-cli/projects
 *   watchLogs()  polls GET /api/v1/logs?projectId= so the pet can comment on what the project's
 *                agent is doing (there is no `since`: we drop ids already seen).
 *   agentProjects() · sendToAgent() · agentTask()   talk to the projects' agents (integrations.mjs)
 *                With no ORQUESTA_TOKEN here but this computer signed in to 7ots.com, they go through
 *                the ot on 7ots.com (/api/device/ots/:id/orquesta, see server/platform/device.mjs):
 *                Orquesta connected in the dashboard works here and its token never leaves 7ots.com.
 *   via()        'token' | '7ots' | null   which of the two is in use
 *   cloudOrquesta()  { connected, project, projectName, projects } of the ot on 7ots.com
 *   Batuta (the brain) is OpenAI-compatible at /api/v1 with the same token (see brain.mjs).
 */

import { randomUUID } from 'node:crypto';
import { env, loadConfig, ORQUESTA_URL, saveKey } from './config.mjs';
import { SEVENOTS_URL } from './account.mjs';

const WS_URL = (process.env.ORQUESTA_WS_URL || 'https://ws.getorquesta.com').replace(/\/+$/, '');

async function api(path, { token = env().ORQUESTA_TOKEN, method = 'GET', body } = {}) {
  const res = await fetch(`${ORQUESTA_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

const cloudId = () => (env().SEVENOTS_TOKEN && loadConfig().account?.otsId) || null;
export const via = () => (env().ORQUESTA_TOKEN ? 'token' : cloudId() ? '7ots' : null);

async function cloud(path = '', { method = 'GET', body, timeoutMs = 15000 } = {}) {
  const id = cloudId();
  if (!id) throw Object.assign(new Error('not signed in to 7ots.com'), { status: 401 });
  const res = await fetch(`${SEVENOTS_URL}/api/device/ots/${encodeURIComponent(id)}/orquesta${path}`, {
    method,
    headers: { Authorization: `Bearer ${env().SEVENOTS_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const cloudOrquesta = () => cloud();

/** Browser login. `open(url)` shows the page; resolves { organizationName } once authorized. */
export async function login({ open, onWaiting = () => {}, timeoutMs = 5 * 60_000 } = {}) {
  const session = randomUUID();
  const url = `${ORQUESTA_URL}/cli/auth?session=${session}`;
  onWaiting(url);
  open?.(url);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 2000));
    let data;
    try {
      const res = await fetch(`${WS_URL}/auth/result/${session}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }
    if (data?.token) {
      saveKey('ORQUESTA_TOKEN', data.token);
      return { organizationName: data.organizationName || '', organizationId: data.organizationId || '' };
    }
  }
  throw new Error('login timed out');
}

export async function projects() {
  const data = await api('/api/orquesta-cli/projects');
  return { organization: data.organization, projects: data.projects || [] };
}

/**
 * Watches a project's logs and calls onLog(row) for each new one (oldest first).
 * The first poll only remembers what is already there. Returns stop().
 */
export function watchLogs(projectId, onLog, { everyMs = 30_000, onError = () => {} } = {}) {
  const seen = new Set();
  let first = true;
  let stopped = false;
  const poll = async () => {
    if (stopped) return;
    try {
      const { logs = [] } = await api(`/api/v1/logs?projectId=${encodeURIComponent(projectId)}&limit=50`);
      const fresh = logs.filter((l) => !seen.has(l.id)).reverse();
      for (const l of logs) seen.add(l.id);
      if (!first) for (const l of fresh) onLog(l);
      first = false;
      if (seen.size > 2000) for (const id of [...seen].slice(0, 1000)) seen.delete(id);
    } catch (e) {
      onError(e);
    }
    if (!stopped) setTimeout(poll, everyMs).unref?.();
  };
  poll();
  return () => (stopped = true);
}

// ── talking to the user's Orquesta agents (the same /api/v1 the 7ots.com platform uses) ──
//   GET  /api/v1/projects → { projects: [{ id, name, agentOnline, agentLastSeen }] }   (oclt_ CLI tokens: /api/orquesta-cli/projects)
//   POST /api/v1/prompts { projectId, content, context, tags, source:'api' } → 201 { prompt: { id } }
//        400 AGENT_NOT_CONFIGURED when the project has no agent
//   GET  /api/v1/prompts/:id → { prompt: { status, result?, error } }
//   GET  /api/v1/logs?promptId=&afterSequence= → { logs: [{ category, message, sequence }] }  (text in 'output')

const FINAL = ['completed', 'failed', 'cancelled'];

/** Projects the token reaches, with whether their agent is online. */
export async function agentProjects() {
  if (via() === '7ots') {
    const c = await cloud();
    if (!c.connected) throw Object.assign(new Error(c.error || 'Orquesta is not connected on 7ots.com'), { status: 409 });
    return c.projects.map((p) => ({ id: p.id, name: p.name, online: p.online == null ? null : !!p.online }));
  }
  let data;
  try {
    data = await api('/api/v1/projects');
  } catch (e) {
    if (![401, 403, 404].includes(e.status)) throw e;
    data = await api('/api/orquesta-cli/projects');
  }
  return (data.projects || []).slice(0, 200).map((p) => ({ id: String(p.id), name: String(p.name || p.slug || p.id).slice(0, 120), online: p.agentOnline == null ? null : !!p.agentOnline }));
}

/** Hands a message to a project's agent. Returns { id }. */
export async function sendToAgent(projectId, content, { context = '7ots desktop ot' } = {}) {
  if (via() === '7ots') {
    // 7ots.com waits a little for the agent's answer before replying
    const r = await cloud('/tasks', { method: 'POST', body: { projectId, text: String(content).slice(0, 4000) }, timeoutMs: 90_000 });
    if (!r.id) throw Object.assign(new Error(r.error || 'not sent'), { status: 400 });
    return { id: String(r.id) };
  }
  try {
    const data = await api('/api/v1/prompts', { method: 'POST', body: { projectId, content: String(content).slice(0, 4000), context: String(context).slice(0, 500), tags: ['7ots', 'desktop'], source: 'api' } });
    const id = data.prompt?.id;
    if (!id) throw new Error('no prompt id');
    return { id: String(id) };
  } catch (e) {
    if (/AGENT_NOT_CONFIGURED/i.test(e.message)) throw Object.assign(new Error('this project has no agent connected'), { status: 400 });
    throw e;
  }
}

/** Where a message to an agent is: { status, result?, error? } (the agent's output once it finished). */
export async function agentTask(id) {
  if (via() === '7ots') {
    const r = await cloud(`/tasks/${encodeURIComponent(id)}`);
    if (r.ok === false) throw new Error(r.error || 'unknown task');
    const status = String(r.status || 'pending');
    if (!FINAL.includes(status)) return { status };
    return status === 'completed' ? { status, result: String(r.result || '').slice(0, 8000) } : { status, error: String(r.error || status).slice(0, 500) };
  }
  const { prompt: p = {} } = await api(`/api/v1/prompts/${encodeURIComponent(id)}`);
  const status = String(p.status || 'pending');
  if (!FINAL.includes(status)) return { status };
  if (status !== 'completed') return { status, error: String(p.error || status).slice(0, 500) };
  if (typeof p.result === 'string' && p.result.trim()) return { status, result: p.result.trim().slice(0, 8000) };
  const out = [];
  let after = null;
  for (let page = 0; page < 5; page++) {
    const { logs = [] } = await api(`/api/v1/logs?${new URLSearchParams({ promptId: id, ...(after != null ? { afterSequence: String(after) } : {}) })}`).catch(() => ({}));
    for (const l of logs) if (l.category === 'output' && l.message) out.push(String(l.message));
    if (logs.length < 50) break;
    after = logs.at(-1).sequence;
  }
  return { status, result: out.join('\n').trim().slice(-8000) };
}
