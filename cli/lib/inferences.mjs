/**
 * Inference history: every call to the brain, with exactly what was sent (system + messages, so you can see
 * the data it used) and what came back. Kept in ~/.7ots/inferences.jsonl (0600, last 300) and shown on /settings.
 */

import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync, chmodSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { HOME, homeFile, readJson } from './paths.mjs';

const MAX = 300;
const FILE = () => homeFile('inferences.jsonl');
const cut = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n)}…` : String(s ?? ''));

const readRows = (file) => {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).slice(-MAX).map((l) => JSON.parse(l)) : [];
  } catch {
    return [];
  }
};

/**
 * The history of the other ots on this computer: each visitor runs its own daemon with its home in
 * ~/.7ots/ots/<id>/ (SEVENOTS_HOME), so their rows are read from there, tagged with who made them.
 */
export function otherInferences() {
  // a visiting ot lives in <desktop home>/ots/<id>: it sees the host and its fellow visitors too
  const companion = basename(dirname(HOME)) === 'ots';
  const root = companion ? dirname(dirname(HOME)) : HOME;
  const dir = join(root, 'ots');
  let ids = [];
  try {
    ids = readdirSync(dir).filter((d) => /^ots_[a-z0-9]+$/.test(d) && join(dir, d) !== HOME);
  } catch {}
  const host = companion ? [{ home: root, id: readJson(join(root, 'config.json'))?.account?.otsId || 'local' }] : [];
  return [...host, ...ids.map((id) => ({ home: join(dir, id), id }))].flatMap(({ home, id }) => {
    const idy = readJson(join(home, 'identity.json'));
    const ot = { id, name: idy?.name || id, character: idy?.look?.character || null }; // its look: settings draws it on the filter
    return readRows(join(home, 'inferences.jsonl')).map((r) => ({ ...r, ot }));
  });
}

export function createInferenceLog() {
  let rows = readRows(FILE());
  let since = 0;
  const add = (row) => {
    rows.push(row);
    if (rows.length > MAX) rows.shift();
    try {
      if (++since > 50) {
        // compact now and then so the file stays small
        since = 0;
        writeFileSync(FILE(), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
      } else appendFileSync(FILE(), JSON.stringify(row) + '\n', { mode: 0o600 });
      chmodSync(FILE(), 0o600);
    } catch {}
  };

  /** Wraps a brain: think({ purpose, … }) is logged. `label()` names the brain (cli · claude · model). */
  function wrap(getBrain, label) {
    return {
      get kind() {
        return getBrain().kind;
      },
      get vision() {
        return Boolean(getBrain().vision);
      },
      async think(o) {
        const t0 = Date.now();
        const row = {
          at: t0,
          purpose: o.purpose || 'chat',
          brain: label(),
          system: cut(o.system, 6000),
          input: (o.messages || []).map((m) => ({ role: m.role, content: cut(typeof m.content === 'string' ? m.content : JSON.stringify(m.content), 8000) })),
          files: o.files || undefined,
        };
        try {
          let usage;
          const text = await getBrain().think({ ...o, onUsage: (u) => (usage = u) });
          add({ ...row, ok: true, output: cut(text, 4000), ms: Date.now() - t0, usage });
          return text;
        } catch (e) {
          add({ ...row, ok: false, error: cut(e.message, 300), ms: Date.now() - t0 });
          throw e;
        }
      },
      // long local work (only CLI brains have it); undefined otherwise so callers fall back to the cloud
      get work() {
        if (typeof getBrain().work !== 'function') return undefined;
        return async (prompt, o) => {
          const t0 = Date.now();
          const row = { at: t0, purpose: 'work', brain: label(), input: [{ role: 'user', content: cut(prompt, 8000) }] };
          try {
            const text = await getBrain().work(prompt, o);
            add({ ...row, ok: true, output: cut(text, 4000), ms: Date.now() - t0 });
            return text;
          } catch (e) {
            add({ ...row, ok: false, error: cut(e.message, 300), ms: Date.now() - t0 });
            throw e;
          }
        };
      },
    };
  }

  return {
    wrap,
    list: (n = 100) => rows.slice(-n).reverse(),
    clear() {
      rows = [];
      try {
        writeFileSync(FILE(), '', { mode: 0o600 });
      } catch {}
    },
  };
}
