/**
 * Watchers: things the pet keeps an eye on until they happen, then it tells you (like a reminder, but on a
 * condition instead of a time).
 *
 *   price    "avísame si BTC llega a 85 mil"      { kind: 'price', coin: 'bitcoin', op: '>=', value: 85000, vs: 'usd' }
 *            CoinGecko's free simple-price API, every 60 s (all coins in one request).
 *   process  "avísame cuando termine el build"   { kind: 'process', match: 'npm run build', until: 'exit' | 'start' }
 *            the running processes (ps), every 5 s.
 *
 * State: ~/.7ots/watchers.json. Also: processes() = what runs on this computer right now (access.processes).
 */

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homeFile, readJson, writeJson } from './paths.mjs';

const COINS = {
  btc: 'bitcoin', bitcoin: 'bitcoin', eth: 'ethereum', ethereum: 'ethereum', sol: 'solana', solana: 'solana',
  xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', bnb: 'binancecoin', usdc: 'usd-coin', ton: 'the-open-network',
  avax: 'avalanche-2', dot: 'polkadot', link: 'chainlink', matic: 'matic-network', pol: 'matic-network', ltc: 'litecoin', xlm: 'stellar',
};
export const coinId = (s) => {
  const k = String(s || '').trim().toLowerCase();
  return COINS[k] || (/^[a-z0-9-]{2,60}$/.test(k) ? k : null);
};
const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b };

/** What runs on this computer: [{ pid, name, cmd, cpu, mem, since }], heaviest first. Linux/macOS (ps). */
export function processes({ n = 40 } = {}) {
  if (process.platform === 'win32') return Promise.resolve([]);
  return new Promise((resolve) =>
    execFile('ps', ['-eo', 'pid=,pcpu=,pmem=,etimes=,comm=,args='], { maxBuffer: 8 << 20, timeout: 4000 }, (err, out) => {
      if (err) return resolve([]);
      const rows = [];
      for (const line of String(out).split('\n')) {
        const m = line.trim().match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
        if (!m || Number(m[1]) === process.pid || m[5] === 'ps') continue;
        rows.push({ pid: +m[1], cpu: +m[2], mem: +m[3], since: Date.now() - m[4] * 1000, name: m[5], cmd: redactCmd(m[6]) });
      }
      rows.sort((a, b) => b.cpu - a.cpu || b.mem - a.mem);
      resolve(rows.slice(0, n));
    }),
  );
}

// Command lines can carry secrets (--token=…, URLs with passwords): those never leave this function.
const redactCmd = (s) =>
  String(s)
    .replace(/(--?[\w-]*(?:token|key|secret|pass(?:word)?|auth)[\w-]*[= ])\S+/gi, '$1***')
    .replace(/\b(sk|pk|ghp|gho|xox[bp]|7d|oek)[-_][A-Za-z0-9_-]{8,}/g, '$1_***')
    .replace(/(\/\/[^/\s:@]+:)[^@\s]+@/g, '$1***@')
    .slice(0, 300);

/** A short text for the brain: the busiest processes, no command arguments. */
export async function processSummary(n = 12) {
  const ps = await processes({ n });
  return ps.map((p) => `${p.name} (cpu ${p.cpu}%, mem ${p.mem}%)`).join(', ');
}

/**
 * @param {{ onFire: (w, now: { price?: number }) => void, log?: Function }} o
 */
export function createWatchers({ onFire, log = () => {} }) {
  const file = homeFile('watchers.json');
  let list = (readJson(file, []) || []).filter((w) => w && !w.done);
  const save = () => writeJson(file, list);
  const last = new Map(); // id → last value seen (price) or present (process), for the processes tab

  function add(w) {
    const x = { id: randomBytes(4).toString('hex'), created: Date.now(), ...w };
    list.push(x);
    save();
    return x;
  }
  function fire(w, now) {
    w.done = true;
    list = list.filter((x) => !x.done);
    save();
    onFire(w, now);
  }

  async function checkPrices() {
    const ws = list.filter((w) => w.kind === 'price');
    if (!ws.length) return;
    const ids = [...new Set(ws.map((w) => w.coin))].join(',');
    const vs = [...new Set(ws.map((w) => w.vs || 'usd'))].join(',');
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`coingecko ${r.status}`);
      const j = await r.json();
      for (const w of ws) {
        const price = j[w.coin]?.[w.vs || 'usd'];
        if (!Number.isFinite(price)) continue;
        last.set(w.id, { price, at: Date.now() });
        if (OPS[w.op]?.(price, w.value)) fire(w, { price });
      }
    } catch (e) {
      log(`watchers: ${e.message}`);
    }
  }

  async function checkProcesses() {
    const ws = list.filter((w) => w.kind === 'process');
    if (!ws.length) return;
    const ps = await processes({ n: 5000 });
    for (const w of ws) {
      const needle = w.match.toLowerCase();
      const hit = ps.find((p) => p.cmd.toLowerCase().includes(needle) || p.name.toLowerCase() === needle);
      const prev = last.get(w.id)?.present;
      last.set(w.id, { present: !!hit, pid: hit?.pid, at: Date.now() });
      // "until it ends": it has to have been seen running first (or be running when the watch starts)
      if (w.until === 'start' ? hit : prev === true && !hit) fire(w, {});
      else if (w.until !== 'start' && prev === undefined && !hit) w.notYet = true;
    }
  }

  const tPrice = setInterval(checkPrices, 60_000);
  const tProc = setInterval(checkProcesses, 5000);
  tPrice.unref?.();
  tProc.unref?.();
  setTimeout(checkPrices, 1500).unref?.();

  return {
    get list() {
      return list.map((w) => ({ ...w, last: last.get(w.id) || null }));
    },
    addPrice({ coin, op = '>=', value, vs = 'usd', text = '' }) {
      const id = coinId(coin);
      if (!id || !Number.isFinite(Number(value)) || !OPS[op]) return null;
      const w = add({ kind: 'price', coin: id, op, value: Number(value), vs: String(vs || 'usd').toLowerCase(), text: String(text).slice(0, 200) });
      checkPrices();
      return w;
    },
    addProcess({ match, until = 'exit', text = '' }) {
      if (!match || String(match).length < 2) return null;
      const w = add({ kind: 'process', match: String(match).slice(0, 120), until: until === 'start' ? 'start' : 'exit', text: String(text).slice(0, 200) });
      checkProcesses();
      return w;
    },
    cancel(id) {
      const n = list.length;
      list = id === 'all' ? [] : list.filter((w) => w.id !== id);
      save();
      return n !== list.length;
    },
    stop() {
      clearInterval(tPrice);
      clearInterval(tProc);
    },
  };
}
