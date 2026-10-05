/**
 * Screen awareness (access.screen, off by default): so the pet knows what you are doing.
 *  · every 20 s: the active window's title and app (xdotool, X11) → "apps lately"
 *  · every N minutes (config.screen.every, default 5), if you are at the computer and something changed:
 *    a screenshot (scaled down, ~/.7ots/screen/now.jpg, 0600) that the brain looks at and sums up in one line,
 *    then the file is deleted. Brains that can't see images (or no screenshot tool) get the window titles instead.
 * What it saw is kept in ~/.7ots/seen.json (last 60) and shown on /settings → Memory; it feeds the pet's comments.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homeFile, readJson, writeJson } from './paths.mjs';

const run = (cmd, args, ms = 4000) => new Promise((res) => execFile(cmd, args, { timeout: ms }, (e, out) => res(e ? '' : String(out).trim())));
const MAX = 60;

export function createScreenWatcher({ brain, enabled, every = () => 5, lang = 'en', log = () => {}, onSeen = () => {} }) {
  const file = homeFile('seen.json');
  const seen = readJson(file, null) || { looks: [], windows: [] };
  const save = () => writeJson(file, seen, { secret: true });
  let lastWin = '';
  let lastMouse = '';
  let lastLook = 0;
  let changed = false;
  let busy = false;
  const x11 = process.platform === 'linux' && process.env.DISPLAY;

  async function activeWindow() {
    if (!x11) return null;
    const id = await run('xdotool', ['getactivewindow']);
    if (!id) return null;
    const [title, cls] = await Promise.all([run('xdotool', ['getwindowname', id]), run('xprop', ['-id', id, 'WM_CLASS'])]);
    const app = cls.match(/"([^"]*)"\s*$/)?.[1] || '';
    if (/7ots/i.test(title)) return null;
    return { title: title.slice(0, 160), app };
  }

  async function tickWindows() {
    if (!enabled()) return;
    const w = await activeWindow();
    const mouse = x11 ? await run('xdotool', ['getmouselocation']) : '';
    if (mouse !== lastMouse) (changed = true), (lastMouse = mouse);
    if (!w) return;
    const key = `${w.app}|${w.title}`;
    if (key === lastWin) return;
    lastWin = key;
    changed = true;
    seen.windows.push({ at: Date.now(), ...w });
    if (seen.windows.length > MAX) seen.windows.shift();
    save();
  }

  async function screenshot() {
    const dir = homeFile('screen');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const f = join(dir, 'now.jpg');
    if (process.platform === 'darwin') await run('screencapture', ['-x', '-t', 'jpg', f]);
    else if (x11) await run('import', ['-silent', '-window', 'root', '-resize', '1280x1280>', '-quality', '70', f], 8000);
    return existsSync(f) ? f : null;
  }

  async function look({ force = false } = {}) {
    if (!enabled() || busy || brain.kind === 'lines') return null;
    if (!force && (!changed || Date.now() - lastLook < every() * 60_000)) return null;
    busy = true;
    changed = false;
    lastLook = Date.now();
    let f = null;
    try {
      f = brain.vision ? await screenshot() : null;
      const recent = seen.windows.slice(-8).map((w) => `${w.app}: ${w.title}`).join('\n');
      const ask = f
        ? `This is a screenshot of your human's screen right now (file ${f}). Recently active windows:\n${recent}`
        : `You can't see the screen, only the recently active windows (app: title):\n${recent || '(none)'}`;
      const raw = await brain.think({
        purpose: 'screen',
        system: `You quietly keep track of what your human is doing on their computer, to help them later. Never transcribe private content (passwords, messages, personal data): summarize the activity.`,
        messages: [{ role: 'user', content: `${ask}\n\nAnswer ONLY with JSON: {"doing": "one short line: the app and the task they are on, in ${lang}", "say": "optional: one short, useful or playful remark to them in ${lang} if something deserves it (an error on screen, a long session, a tip); else empty"}` }],
        files: f ? [f] : null,
        timeoutMs: 90000,
        raw: true,
      });
      const j = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || '{}');
      if (!j.doing) return null;
      const row = { at: Date.now(), doing: String(j.doing).slice(0, 200), say: String(j.say || '').slice(0, 200), how: f ? 'screenshot' : 'windows' };
      seen.looks.push(row);
      if (seen.looks.length > MAX) seen.looks.shift();
      save();
      onSeen(row);
      return row;
    } catch (e) {
      log(`screen: ${e.message}`);
      return null;
    } finally {
      busy = false;
      if (f) {
        try {
          unlinkSync(f);
        } catch {}
      }
    }
  }

  const t1 = setInterval(tickWindows, 20_000);
  const t2 = setInterval(() => look(), 60_000);
  t1.unref?.();
  t2.unref?.();
  return {
    look,
    get seen() {
      return seen;
    },
    now: () => seen.looks.at(-1) || null,
    forget() {
      seen.looks = [];
      seen.windows = [];
      save();
    },
    stop() {
      clearInterval(t1);
      clearInterval(t2);
    },
  };
}
