/**
 * An ot's own integrations on 7ots.com (dashboard → Assistant → Integrations): MCP servers and APIs it
 * can use when its owner asks it something in the dashboard ("Ask your ot").
 *
 *   settings.INTEGRATIONS   JSON [{ id, kind: 'mcp'|'api'|'note', name, instructions, url?, on }]  (managed, ≤ 10)
 *   secrets.INTEG_<id>      its token (Bearer), sealed like the other keys and never returned
 *
 * The server reaches these URLs itself, so only public https hosts: every address the name resolves to
 * must be public (no loopback, private, link-local or metadata ranges) and redirects are not followed.
 * Commands are desktop-only (the pet runs them on the user's own computer).
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mcpCall, mcpTools } from '../../cli/lib/mcp.mjs';

export const MAX_INTEGRATIONS = 10;
const KINDS = ['mcp', 'api', 'note'];
const MAX_OUT = 6000;
const str = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

const badUrl = (code) => Object.assign(new Error(code), { code });

/** The saved list (never with tokens). */
export function otIntegrations(ots) {
  try {
    const list = JSON.parse(ots?.settings?.INTEGRATIONS || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** What the dashboard sees: the list plus whether each one has a token. */
export function integrationsView(ots) {
  return otIntegrations(ots).map((c) => ({ ...c, hasToken: Boolean(ots.secrets?.[`INTEG_${c.id}`]) }));
}

/**
 * Validates the dashboard's list → { list, secrets } to save. `token` on an item replaces its token,
 * `token: ''` removes it, no `token` keeps the one saved.
 */
export function normalizeOtIntegrations(items, ots) {
  if (!Array.isArray(items)) throw badUrl('integList');
  if (items.length > MAX_INTEGRATIONS) throw badUrl('integMax');
  const secrets = { ...(ots.secrets || {}) };
  const list = items.map((c) => {
    const kind = KINDS.includes(c?.kind) ? c.kind : 'note';
    const name = str(c?.name, 60);
    if (!name) throw badUrl('integName');
    const url = kind === 'note' ? '' : str(c.url, 300);
    if (kind !== 'note' && !/^https:\/\/[^\s"'<>]+$/i.test(url)) throw badUrl('integUrl');
    const id = /^[a-z0-9]{6,16}$/.test(c.id || '') ? c.id : randomBytes(5).toString('hex');
    if (typeof c.token === 'string') {
      const tok = c.token.trim().slice(0, 2000);
      if (tok) secrets[`INTEG_${id}`] = tok;
      else delete secrets[`INTEG_${id}`];
    }
    return { id, kind, name, instructions: str(c.instructions, 1500), ...(url ? { url } : {}), on: c.on !== false };
  });
  // tokens of removed integrations go too
  const ids = new Set(list.map((c) => c.id));
  for (const k of Object.keys(secrets)) if (k.startsWith('INTEG_') && !ids.has(k.slice(6))) delete secrets[k];
  return { list, secrets };
}

// ── only public hosts ──

function privateIp(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

export async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw badUrl('integUrl');
  }
  if (u.protocol !== 'https:' || u.username || u.password) throw badUrl('integUrl');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw badUrl('integPrivate');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw badUrl('integDns');
  if (addrs.some((a) => privateIp(a.address))) throw badUrl('integPrivate');
  return u;
}

// ── running them ──

const tokenOf = (ots, c) => ots.secrets?.[`INTEG_${c.id}`] || '';
const redact = (s) => String(s ?? '').replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***');

/** Dashboard → "Connect and list tools" / "Try it" for one saved integration. */
export async function testIntegration(ots, c) {
  if (c.kind === 'note') return { ok: true, text: '' };
  await assertPublicUrl(c.url);
  if (c.kind === 'mcp') return { ok: true, tools: (await mcpTools(c, tokenOf(ots, c), { fresh: true })).map((x) => ({ name: x.name, description: x.description })) };
  return { ok: true, text: (await apiGet(ots, c, '')).slice(0, 1500) };
}

async function apiGet(ots, c, path) {
  const target = path && /^[/?][^\s"'<>]*$/.test(path) && !path.startsWith('//') ? c.url.replace(/\/+$/, '') + path : c.url;
  await assertPublicUrl(target);
  const tok = tokenOf(ots, c);
  const res = await fetch(target, { redirect: 'manual', headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.5', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, signal: AbortSignal.timeout(15000) });
  return redact(`HTTP ${res.status}\n${(await res.text()).slice(0, 20000)}`).slice(0, MAX_OUT);
}

const TOOLS = [
  {
    name: 'integration_tools',
    description: 'Lists the tools of one of your MCP integrations (see the list in your instructions).',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'Integration id' } }, required: ['id'] },
  },
  {
    name: 'integration_call',
    description: 'Calls a tool of one of your MCP integrations. Use the exact tool name from integration_tools.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, tool: { type: 'string' }, args: { type: 'object', description: 'The tool arguments' } }, required: ['id', 'tool'] },
  },
  {
    name: 'integration_get',
    description: 'Reads (HTTP GET) one of your API integrations, optionally with a sub-path or query appended to its URL.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, path: { type: 'string', description: 'Optional, starting with / or ?' } }, required: ['id'] },
  },
];

/**
 * Tools and prompt text for the owner's chat, or null when the ot has no integration turned on.
 * @returns {{ tools: object[], names: string[], run: Function, prompt: string } | null}
 */
export function integrationTools(ots) {
  const on = otIntegrations(ots).filter((c) => c.on !== false);
  if (!on.length) return null;
  const usable = on.filter((c) => c.kind !== 'note');
  const prompt = `Integrations your owner set up for you:\n${on.map((c) => `- ${c.name} (id ${c.id}, ${c.kind === 'mcp' ? 'MCP server' : c.kind === 'api' ? `API at ${c.url}` : 'instructions'})${c.instructions ? `: ${c.instructions}` : ''}`).join('\n')}\nOnly call a tool that changes something (creates, sends, deletes, updates) when your owner asked for exactly that.`;
  const find = (id, kind) => {
    const c = usable.find((x) => x.id === String(id || ''));
    if (!c || (kind && c.kind !== kind)) throw new Error(`No ${kind === 'mcp' ? 'MCP' : kind === 'api' ? 'API' : ''} integration with id ${id}`);
    return c;
  };
  const tools = TOOLS.filter((x) => (x.name === 'integration_get' ? usable.some((c) => c.kind === 'api') : usable.some((c) => c.kind === 'mcp')));
  return {
    prompt,
    tools,
    names: tools.map((x) => x.name),
    run: async (name, args = {}) => {
      if (name === 'integration_tools') {
        const c = find(args.id, 'mcp');
        await assertPublicUrl(c.url);
        return { ok: true, tools: await mcpTools(c, tokenOf(ots, c)) };
      }
      if (name === 'integration_call') {
        const c = find(args.id, 'mcp');
        await assertPublicUrl(c.url);
        return { ok: true, result: redact(await mcpCall(c, tokenOf(ots, c), String(args.tool || ''), args.args)).slice(0, MAX_OUT) };
      }
      if (name === 'integration_get') return { ok: true, result: await apiGet(ots, find(args.id, 'api'), String(args.path || '')) };
      throw new Error(`Unknown tool: ${name}`);
    },
  };
}
