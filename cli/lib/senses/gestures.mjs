/**
 * Hand gestures → quick commands. ~/.7ots/gestures.json (edited from /settings → Senses):
 *
 *   { "map": { "thumb_up": { "type": "confirm" }, "victory": { "type": "media", "do": "play-pause" }, … },
 *     "commands": { "lock": { "label": "Lock the screen", "run": ["loginctl", "lock-session"], "approved": false } } }
 *
 * Gestures (MediaPipe's): thumb_up, thumb_down, open_palm, closed_fist, victory, pointing_up, iloveyou.
 * Action types:
 *   confirm / reject   answers the ot's pending question (Approve / Reject in its bubble)
 *   media              play-pause | next | prev | mute | up | down
 *   key                a key combo, xdotool syntax ("super+d", "ctrl+alt+Left"), Linux X11 only
 *   command            one of `commands` (an argv list, never a shell); it asks you once before the first run
 *   ask                says `text` to the ot as if you had typed it ("¿qué tengo hoy?")
 *   pause              camera off for `for` minutes (privacy), 15 by default
 *   react              the ot just reacts (a heart, a wave)
 * Commands (media, key, command, ask) only run after the attention gesture (`arm`, open palm by default) when
 * senses.arm is on, so a hand passing by does nothing. confirm / reject need no arming while it is asking.
 */

import { homeFile, readJson, writeJson } from '../paths.mjs';
import { clip, run } from './util.mjs';

export const GESTURES = ['thumb_up', 'thumb_down', 'open_palm', 'closed_fist', 'victory', 'pointing_up', 'iloveyou'];
export const MEDIA = ['play-pause', 'next', 'prev', 'mute', 'up', 'down'];
export const TYPES = ['confirm', 'reject', 'media', 'key', 'command', 'ask', 'pause', 'react', 'none'];
const KEYS_RE = /^[A-Za-z0-9_+\- ]{1,60}$/;
const COMMAND_ID = /^[a-z0-9_-]{1,30}$/;

const DEFAULT_COMMANDS = {
  linux: { lock: { label: 'Lock the screen', run: ['loginctl', 'lock-session'] }, shot: { label: 'Screenshot', run: ['gnome-screenshot', '-i'] } },
  darwin: { lock: { label: 'Lock the screen', run: ['pmset', 'displaysleepnow'] } },
  win32: { lock: { label: 'Lock the screen', run: ['rundll32.exe', 'user32.dll,LockWorkStation'] } },
}[process.platform] || {};

export const DEFAULT_GESTURES = {
  map: {
    thumb_up: { type: 'confirm' },
    thumb_down: { type: 'reject' },
    victory: { type: 'media', do: 'play-pause' },
    pointing_up: { type: 'media', do: 'next' },
    closed_fist: { type: 'pause', for: 15 },
    iloveyou: { type: 'react' },
  },
  commands: DEFAULT_COMMANDS,
};

/** Cleans one action; null if it makes no sense. */
export function normalizeAction(a) {
  if (!a || typeof a !== 'object' || !TYPES.includes(a.type)) return null;
  if (a.type === 'media') return MEDIA.includes(a.do) ? { type: 'media', do: a.do } : null;
  if (a.type === 'key') return KEYS_RE.test(String(a.keys || '')) ? { type: 'key', keys: String(a.keys).trim() } : null;
  if (a.type === 'command') return COMMAND_ID.test(String(a.id || '')) ? { type: 'command', id: a.id } : null;
  if (a.type === 'ask') return clip(a.text, 300) ? { type: 'ask', text: clip(a.text, 300) } : null;
  if (a.type === 'pause') return { type: 'pause', for: Math.max(1, Math.min(240, Math.round(Number(a.for)) || 15)) };
  return { type: a.type };
}

/** `prev` = what was saved (a change from settings): a command keeps its approval only if its argv is the same. */
export function normalizeGestures(d = {}, prev = null) {
  const map = {};
  const src = d.map && typeof d.map === 'object' ? d.map : prev?.map || {};
  for (const g of GESTURES) {
    const a = normalizeAction(src[g]);
    if (a && a.type !== 'none') map[g] = a;
  }
  const commands = {};
  const cs = d.commands && typeof d.commands === 'object' ? d.commands : prev?.commands || {};
  for (const [id, c] of Object.entries(cs).slice(0, 30)) {
    if (!COMMAND_ID.test(id) || !Array.isArray(c?.run) || !c.run.length || c.run.length > 12) continue;
    const argv = c.run.map((x) => String(x).slice(0, 300));
    if (!argv[0].trim() || argv.some((x) => /[\u0000]/.test(x))) continue;
    // a changed command line asks again before its first run
    const before = prev ? prev.commands?.[id] : c;
    const same = before && JSON.stringify(before.run) === JSON.stringify(argv);
    commands[id] = { label: clip(c.label, 60) || id, run: argv, approved: Boolean(same && before.approved) };
  }
  return { map, commands };
}

const FILE = () => homeFile('gestures.json');
export function loadGestures() {
  const raw = readJson(FILE(), null);
  return normalizeGestures(raw || DEFAULT_GESTURES);
}
export function saveGestures(g) {
  writeJson(FILE(), g);
}

const XMEDIA = { 'play-pause': 'XF86AudioPlay', next: 'XF86AudioNext', prev: 'XF86AudioPrev', mute: 'XF86AudioMute', up: 'XF86AudioRaiseVolume', down: 'XF86AudioLowerVolume' };
const WMEDIA = { 'play-pause': 179, next: 176, prev: 177, mute: 173, up: 175, down: 174 }; // virtual-key codes
const MACVOL = { mute: 'set volume output muted not (output muted of (get volume settings))', up: 'set volume output volume ((output volume of (get volume settings)) + 10)', down: 'set volume output volume ((output volume of (get volume settings)) - 10)' };

/** Presses a media key. → true if this platform could. */
export async function media(what) {
  if (process.platform === 'linux') {
    const pc = { 'play-pause': 'play-pause', next: 'next', prev: 'previous' }[what];
    if (pc && (await run('playerctl', [pc])) != null) return true; // MPRIS, when installed: works without a focused window
    return (await run('xdotool', ['key', XMEDIA[what]])) != null;
  }
  if (process.platform === 'win32') return (await run('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject WScript.Shell).SendKeys([char]${WMEDIA[what]})`])) != null;
  if (process.platform === 'darwin') {
    if (MACVOL[what]) return (await run('osascript', ['-e', MACVOL[what]])) != null;
    const verb = { 'play-pause': 'playpause', next: 'next track', prev: 'previous track' }[what];
    for (const appName of ['Spotify', 'Music']) {
      const up = await run('osascript', ['-e', `application "${appName}" is running`]);
      if (up === 'true') return (await run('osascript', ['-e', `tell application "${appName}" to ${verb}`])) != null;
    }
  }
  return false;
}

/** A key combo (xdotool syntax). Linux X11 only. */
export async function key(keys) {
  if (process.platform !== 'linux' || !process.env.DISPLAY || !KEYS_RE.test(keys)) return false;
  return (await run('xdotool', ['key', '--clearmodifiers', ...keys.split(/\s+/)])) != null;
}

/** A whitelisted command, argv only (no shell). */
export async function command(c) {
  return (await run(c.run[0], c.run.slice(1), 20_000)) != null;
}
