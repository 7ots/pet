/**
 * A minimal MCP client for custom integrations of kind 'mcp' (settings → Permissions → Integrations).
 *
 *   url      Streamable HTTP: JSON-RPC POSTs, the answer as JSON or one SSE stream; Mcp-Session-Id kept per call
 *   command  stdio: the server is started for each call (/bin/sh -c), newline-delimited JSON-RPC, killed after
 *
 * Only tools: tools/list (cached 10 min) and tools/call. A token (Bearer, HTTP) comes from an env var;
 * stdio servers get it in their environment under the same name.
 */

import { spawn } from 'node:child_process';

const PROTOCOL = '2025-03-26';
const CLIENT = { name: '7ots', version: '1' };
const TIMEOUT = 30_000;
const cache = new Map(); // key → { at, tools }

const rpc = (id, method, params) => ({ jsonrpc: '2.0', ...(id != null ? { id } : {}), method, ...(params ? { params } : {}) });

function fail(r) {
  if (r?.error) throw new Error(['MCP', r.error.code, r.error.message || 'error'].filter((x) => x != null && x !== '').join(' '));
  return r?.result;
}

// ── Streamable HTTP ──
async function httpSession(url, token) {
  let session = '';
  let next = 1;
  const post = async (msg) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL, ...(session ? { 'Mcp-Session-Id': session } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(msg),
      redirect: 'error', // the cloud checked this host is public: a redirect could point anywhere
      signal: AbortSignal.timeout(TIMEOUT),
    });
    session = res.headers.get('mcp-session-id') || session;
    if (msg.id == null) return null;
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!type.includes('text/event-stream')) return JSON.parse(text);
    // the first SSE message that answers this id
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try {
        const m = JSON.parse(data);
        if (m.id === msg.id) return m;
      } catch {}
    }
    throw new Error('MCP: no answer in the stream');
  };
  fail(await post(rpc(next++, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT })));
  await post(rpc(null, 'notifications/initialized'));
  return {
    call: async (method, params) => fail(await post(rpc(next++, method, params))),
    close: () => (session ? fetch(url, { method: 'DELETE', headers: { 'Mcp-Session-Id': session, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(5000) }).catch(() => {}) : null),
  };
}

// ── stdio ──
async function stdioSession(command, extraEnv) {
  const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, ...extraEnv } });
  const waiting = new Map();
  let buf = '';
  let dead = null;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const m = JSON.parse(line);
        if (m.id != null && waiting.has(m.id)) waiting.get(m.id)(m);
      } catch {}
    }
  });
  const die = (e) => {
    dead = e;
    for (const r of waiting.values()) r({ error: { message: e.message } });
    waiting.clear();
  };
  child.on('error', die);
  child.stdin.on('error', () => {}); // EPIPE when it already died: the exit handler answers
  child.on('exit', (code) => die(new Error(`the MCP server exited (${code})`)));
  let next = 1;
  const send = (msg) => {
    if (dead) return Promise.resolve({ error: { message: dead.message } });
    child.stdin.write(`${JSON.stringify(msg)}\n`);
    if (msg.id == null) return Promise.resolve(null);
    return new Promise((res) => {
      const t = setTimeout(() => (waiting.delete(msg.id), res({ error: { message: 'MCP timeout' } })), TIMEOUT);
      waiting.set(msg.id, (m) => (clearTimeout(t), waiting.delete(msg.id), res(m)));
    });
  };
  const close = () => {
    try {
      child.stdin.end();
      child.kill();
    } catch {}
  };
  try {
    fail(await send(rpc(next++, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT })));
  } catch (e) {
    close();
    throw e;
  }
  await send(rpc(null, 'notifications/initialized'));
  return { call: async (method, params) => fail(await send(rpc(next++, method, params))), close };
}

async function withSession(c, token, fn) {
  const s = c.url ? await httpSession(c.url, token) : await stdioSession(c.command, c.envVar && token ? { [c.envVar]: token } : {});
  try {
    return await fn(s);
  } finally {
    s.close();
  }
}

const key = (c) => `${c.url || ''}|${c.command || ''}|${c.envVar || ''}`;

/** The server's tools: [{ name, description, params }] (params: "a, b?" from the input schema). */
export async function mcpTools(c, token, { fresh = false } = {}) {
  const hit = cache.get(key(c));
  if (!fresh && hit && Date.now() - hit.at < 10 * 60_000) return hit.tools;
  const tools = await withSession(c, token, async (s) => {
    const all = [];
    let cursor;
    for (let i = 0; i < 5; i++) {
      const r = await s.call('tools/list', cursor ? { cursor } : {});
      all.push(...(r?.tools || []));
      if (!(cursor = r?.nextCursor)) break;
    }
    return all;
  });
  const out = tools.slice(0, 60).map((t) => {
    const props = t.inputSchema?.properties || {};
    const req = new Set(t.inputSchema?.required || []);
    return { name: String(t.name).slice(0, 80), description: String(t.description || '').replace(/\s+/g, ' ').slice(0, 200), params: Object.keys(props).slice(0, 12).map((p) => (req.has(p) ? p : `${p}?`)).join(', ') };
  });
  cache.set(key(c), { at: Date.now(), tools: out });
  return out;
}

/** Cached tools without a round trip (null when not fetched yet). */
export function mcpToolsCached(c) {
  return cache.get(key(c))?.tools || null;
}

/** Calls one tool → its text content. */
export async function mcpCall(c, token, tool, args = {}) {
  const r = await withSession(c, token, (s) => s.call('tools/call', { name: tool, arguments: args && typeof args === 'object' ? args : {} }));
  const text = (r?.content || []).map((p) => (p.type === 'text' ? p.text : p.type === 'resource' ? p.resource?.text || '' : `[${p.type}]`)).join('\n');
  return `${r?.isError ? 'ERROR: ' : ''}${text || JSON.stringify(r?.structuredContent ?? '')}`;
}
