/**
 * What tools work for this ot (access.prowl, off by default): the host of each remote MCP server or API
 * call, whether it worked and how long it took, summed in memory and sent every 10 minutes to the ot's
 * account on 7ots.com (POST /api/device/plaza/tools). That feeds the plaza's trending tools and Prowl's
 * ranking (server/platform/tooluse.mjs, docs/PLAZA-PROWL.md). Never the tool name, its arguments or its
 * result; local servers (stdio commands, localhost, private IPs) are not counted.
 */

import { env, loadConfig } from './config.mjs';
import { SEVENOTS_URL } from './account.mjs';

const buf = new Map();
let timer = null;

function hostOf(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    // the server drops private addresses too; this keeps them from leaving the computer at all
    if (!h.includes('.') || /^(127|10|0)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|\.(local|localhost|internal|lan)$/.test(h) || h.startsWith('[')) return '';
    return h;
  } catch {
    return '';
  }
}

/** One call to an integration. Never throws. */
export function recordUse(url, ok, ms) {
  try {
    if (loadConfig().access?.prowl !== true) return;
    const host = url ? hostOf(url) : '';
    if (!host) return;
    const r = buf.get(host) || { host, ok: 0, fail: 0, ms: 0 };
    r[ok ? 'ok' : 'fail']++;
    r.ms += Math.max(0, Math.round(ms) || 0);
    buf.set(host, r);
    if (!timer) (timer = setTimeout(flush, 10 * 60_000)), timer.unref?.();
  } catch {
    // counting never breaks the tool
  }
}

export async function flush() {
  timer = null;
  const c = loadConfig();
  const otsId = c.account?.otsId;
  const token = env().SEVENOTS_TOKEN;
  if (!buf.size || c.access?.prowl !== true || !otsId || !token) return buf.clear();
  const uses = [...buf.values()].map((r) => ({ host: r.host, ok: r.ok, fail: r.fail, ms: Math.round(r.ms / (r.ok + r.fail)) }));
  buf.clear();
  await fetch(`${SEVENOTS_URL}/api/device/plaza/tools`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ot: otsId, uses }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {});
}
