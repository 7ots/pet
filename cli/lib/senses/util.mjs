/** Small helpers shared by the senses: durations, comparisons, a quiet child process, days on disk. */

import { execFile } from 'node:child_process';

export const run = (cmd, args, ms = 4000) =>
  new Promise((res) => execFile(cmd, args, { timeout: ms, windowsHide: true }, (e, out) => res(e ? null : String(out).trim())));

/** '90s' | '20m' | '2h' | 15 (minutes) → ms. Anything else → NaN. */
export function dur(v) {
  if (typeof v === 'number') return v * 60_000;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(s|m|h|d)?\s*$/i.exec(String(v ?? ''));
  if (!m) return NaN;
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(m[2] || 'm').toLowerCase()];
}

/** '>90m' / '<15' / '>=2h' → { op, v } (v in ms when it has a unit or `time`, else a number). */
export function cmpOf(s, time = true) {
  const m = /^\s*(>=|<=|>|<)\s*(.+)$/.exec(String(s ?? ''));
  if (!m) return null;
  const v = time ? dur(m[2]) : Number(m[2]);
  return Number.isFinite(v) ? { op: m[1], v } : null;
}
export function cmp(x, c) {
  if (!c || x == null || !Number.isFinite(x)) return false;
  return c.op === '>' ? x > c.v : c.op === '<' ? x < c.v : c.op === '>=' ? x >= c.v : x <= c.v;
}

/** 5_400_000 → '1h30', 600_000 → '10 min' */
export function human(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '?';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
