/**
 * Activity (access.activity): which app and site you are on and whether you are at the keyboard, every 15 s.
 *  · Linux X11: xdotool + xprop (the active window), xprintidle when installed, else "the mouse or window moved".
 *  · macOS: the frontmost app (osascript) and HIDIdleTime (ioreg). No window titles (they need Accessibility).
 *  · Elsewhere: nothing (the camera, when on, still says whether you are there).
 * Only the app and a site label leave this file; the window title stays in memory for the current reading.
 */

import { run } from '../util.mjs';

const BROWSER = /firefox|chrom|brave|edge|opera|vivaldi|safari|librewolf/i;
const SUFFIX = /\s[-—–|]\s(Mozilla Firefox|Firefox|Google Chrome|Chromium|Brave|Microsoft Edge|Opera|Vivaldi|LibreWolf|Zen Browser|Safari)\s*$/i;

/** A browser window's title → the site it shows ("Video - YouTube — Mozilla Firefox" → "YouTube"). */
export function siteOf(title = '') {
  const t = String(title).replace(SUFFIX, '').replace(/^\(\d+\)\s*/, '').trim();
  if (!t) return '';
  const dom = t.match(/\b([a-z0-9-]+\.)+(com|org|net|io|dev|app|ai|cl|ar|br|es|co|me|tv|gg|xyz)\b/i);
  if (dom) return dom[0].toLowerCase().replace(/^www\./, '');
  const parts = t.split(/\s[-—–|·]\s/).map((s) => s.trim()).filter(Boolean);
  const last = parts.at(-1) || '';
  return last.length <= 32 ? last : '';
}

export function createActivity({ enabled, log = () => {} }) {
  const x11 = process.platform === 'linux' && process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
  let hasIdle = null; // xprintidle installed?
  let lastInput = Date.now();
  let lastMouse = '';
  let lastKey = '';
  let now = null; // { app, site, title, idleMs, at }

  async function idleMs() {
    if (process.platform === 'darwin') {
      const out = await run('ioreg', ['-c', 'IOHIDSystem', '-d', '4']);
      const ns = Number(out?.match(/"HIDIdleTime"\s*=\s*(\d+)/)?.[1]);
      return Number.isFinite(ns) ? ns / 1e6 : null;
    }
    if (!x11) return null;
    if (hasIdle !== false) {
      const out = await run('xprintidle', []);
      hasIdle = out != null;
      if (hasIdle) return Number(out) || 0;
    }
    const mouse = (await run('xdotool', ['getmouselocation'])) || '';
    if (mouse !== lastMouse) (lastMouse = mouse), (lastInput = Date.now());
    return Date.now() - lastInput;
  }

  async function window() {
    if (process.platform === 'darwin') {
      const app = await run('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true']);
      return app ? { app, title: '' } : null;
    }
    if (!x11) return null;
    const id = await run('xdotool', ['getactivewindow']);
    if (!id) return null;
    const [title, cls] = await Promise.all([run('xdotool', ['getwindowname', id]), run('xprop', ['-id', id, 'WM_CLASS'])]);
    const app = String(cls || '').match(/"([^"]*)"\s*$/)?.[1] || '';
    return { app, title: String(title || '').slice(0, 200) };
  }

  async function tick() {
    if (!enabled()) return (now = null);
    try {
      const [w, idle] = await Promise.all([window(), idleMs()]);
      const key = `${w?.app}|${w?.title}`;
      if (key !== lastKey) (lastKey = key), hasIdle === false && (lastInput = Date.now()); // switching windows is input too
      const ownWindow = /7ots/i.test(w?.title || '') || /^7ots/i.test(w?.app || '');
      now = {
        app: ownWindow ? now?.app || '' : String(w?.app || '').slice(0, 60),
        site: ownWindow ? now?.site || '' : BROWSER.test(w?.app || '') ? siteOf(w?.title).slice(0, 60) : '',
        title: ownWindow ? now?.title || '' : w?.title || '',
        idleMs: idle,
        at: Date.now(),
      };
    } catch (e) {
      log(`activity: ${e.message}`);
    }
    return now;
  }

  return {
    id: 'activity',
    tick,
    get now() {
      return now && Date.now() - now.at < 60_000 ? now : null;
    },
    available: Boolean(x11 || process.platform === 'darwin'),
  };
}
