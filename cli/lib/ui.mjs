/**
 * Small terminal UI for the wizard: step headers, arrow-key menus that collapse into a ✔ line once
 * answered, text/secret inputs, cards and summaries. Plain numbered menus when there is no TTY raw mode.
 */

import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

const tty = Boolean(process.stdout.isTTY);
const truecolor = tty && /truecolor|24bit/i.test(process.env.COLORTERM || '');
const esc = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const bold = esc(1);
export const dim = esc(2);
export const green = esc(32);
export const red = esc(31);
export const yellow = esc(33);
export const cyan = esc(36);
export const gray = esc(90);

let ACCENT = '#6d5dfc';
export const setAccent = (hex) => /^#[0-9a-f]{6}$/i.test(hex || '') && (ACCENT = hex);
/** Text in the ot's color (24-bit when the terminal says so, else magenta). */
export const accent = (s) => {
  if (!tty) return String(s);
  if (!truecolor) return `\x1b[35m${s}\x1b[0m`;
  const n = parseInt(ACCENT.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${s}\x1b[0m`;
};

const ANSI = /\x1b\[[0-9;]*m/g;
export const width = (s) => [...String(s).replace(ANSI, '')].length;
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
const cols = () => Math.max(40, Math.min(process.stdout.columns || 80, 92));
const write = (s) => process.stdout.write(s);
const up = (n) => n > 0 && tty && write(`\x1b[${n}A\r\x1b[J`);
/** How many terminal rows a printed text takes (for collapsing it later). */
const rows = (text) => String(text).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(width(l) / (process.stdout.columns || 80))), 0);

const BAR = gray('│');
const S_DONE = green('✔');
const S_STEP = accent('◆');

// ── readline (text input), muted for secrets ──
let muted = false;
const out = new Writable({
  write(chunk, enc, cb) {
    if (!muted) process.stdout.write(chunk, enc);
    cb();
  },
});
let rl = null;
const io = () => (rl ||= createInterface({ input: process.stdin, output: out, terminal: tty }));
export function closeUi() {
  rl?.close();
  rl = null;
}

// ── layout ──

export function intro(title, subtitle = '') {
  const line = '─'.repeat(Math.max(4, cols() - width(title) - 8));
  console.log(`\n ${accent('▍')}${bold(title)} ${gray(line)}`);
  if (subtitle) console.log(` ${BAR} ${dim(subtitle)}`);
}

/** "◆ Brain ·········· 4/8" + dots. */
export function step(n, total, title) {
  const dots = Array.from({ length: total }, (_, i) => (i < n - 1 ? accent('●') : i === n - 1 ? accent('◉') : gray('○'))).join(' ');
  console.log(`\n ${S_STEP} ${bold(title)}  ${dots}  ${gray(`${n}/${total}`)}`);
}

export const note = (text) => console.log(String(text).split('\n').map((l) => ` ${BAR} ${dim(l)}`).join('\n'));
export const ok = (text) => console.log(` ${BAR} ${green('✓')} ${text}`);
export const warn = (text) => console.log(` ${BAR} ${yellow('!')} ${text}`);

/** Rounded box. lines: strings (may carry ANSI). */
export function card(lines, { title = '', color = gray } = {}) {
  const max = cols() - 6;
  lines = lines.map((l) => (width(l) > max - 2 ? clip(l, max - 2) : l));
  const inner = Math.min(max, Math.max(...lines.map(width), width(title) + 2) + 2);
  const rule = (n) => '─'.repeat(Math.max(0, n));
  console.log(title ? ` ${color('╭─')} ${bold(title)} ${color(`${rule(inner - width(title) - 3)}╮`)}` : ` ${color(`╭${rule(inner)}╮`)}`);
  for (const l of lines) console.log(` ${color('│')} ${pad(l, inner - 2)} ${color('│')}`);
  console.log(` ${color(`╰${'─'.repeat(inner)}╯`)}`);
  return lines.length + 2;
}

/** Keeps the start and the end of a too-long (plain) line: "~/a/very/…/file.json". */
function clip(l, n) {
  const plain = [...l.replace(ANSI, '')];
  const head = Math.ceil((n - 1) / 2);
  return `${plain.slice(0, head).join('')}…${plain.slice(plain.length - (n - 1 - head)).join('')}`;
}

/** Erases the last n printed rows. */
export const erase = (n) => up(n);

/** Two-column summary inside a card. */
export function summary(title, pairs) {
  const k = Math.max(...pairs.map(([a]) => width(a)));
  return card(pairs.map(([a, b]) => `${gray(pad(a, k))}  ${b}`), { title });
}

// ── inputs ──

function collapse(lines, question, answer) {
  up(lines);
  console.log(` ${S_DONE} ${question} ${gray('·')} ${accent(answer)}`);
}

/** Text input. Returns the answer or the default. */
export async function text(question, { def = '', hint = '', validate } = {}) {
  for (;;) {
    const head = ` ${S_STEP} ${bold(question)}${hint ? `  ${gray(hint)}` : ''}`;
    console.log(head);
    const a = (await io().question(` ${BAR} ${def !== '' ? gray(`(${def}) `) : ''}`)).trim() || String(def);
    const err = validate?.(a);
    if (!err) {
      collapse(rows(head) + 1, question, a === '' ? gray('—') : a);
      return a;
    }
    up(rows(head) + 1);
    console.log(` ${BAR} ${red(err)}`);
  }
}

/** Hidden input (keys): nothing is echoed. */
export async function secret(question) {
  console.log(` ${S_STEP} ${bold(question)}`);
  write(` ${BAR} ${gray('••••')} `);
  muted = true;
  let v;
  try {
    v = (await io().question('')).trim();
  } finally {
    muted = false;
    write('\n');
  }
  collapse(2, question, v ? '••••••••' : gray('—'));
  return v;
}

/**
 * Menu. options: [{ value, label, hint? }] or [[value, label, hint?]]. Returns the value.
 * ↑/↓ (or j/k) move, 1-9 jump, Enter picks, Ctrl-C quits.
 */
export async function select(question, options, def) {
  const opts = options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1], hint: o[2] } : o));
  let i = Math.max(0, opts.findIndex((o) => o.value === def));
  if (!tty || !process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return numbered(question, opts, i);

  closeUi(); // readline and raw keypresses must not share stdin
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  write('\x1b[?25l');
  let printed = 0;
  const draw = () => {
    up(printed);
    const lines = [` ${S_STEP} ${bold(question)}`];
    opts.forEach((o, k) => {
      const on = k === i;
      lines.push(` ${BAR} ${on ? accent('❯') : ' '} ${on ? bold(o.label) : o.label}${o.hint ? `  ${gray(o.hint)}` : ''}`);
    });
    lines.push(` ${BAR} ${gray('↑/↓ · enter')}`);
    const s = lines.join('\n');
    console.log(s);
    printed = rows(s);
  };
  draw();
  try {
    return await new Promise((resolve) => {
      const onKey = (str, key = {}) => {
        if (key.ctrl && key.name === 'c') {
          write('\x1b[?25h\n');
          process.exit(130);
        }
        if (key.name === 'up' || str === 'k') i = (i - 1 + opts.length) % opts.length;
        else if (key.name === 'down' || str === 'j' || key.name === 'tab') i = (i + 1) % opts.length;
        else if (/^[1-9]$/.test(str || '') && Number(str) <= opts.length) i = Number(str) - 1;
        else if (key.name === 'return' || key.name === 'enter') {
          process.stdin.off('keypress', onKey);
          return resolve(opts[i].value);
        } else return;
        draw();
      };
      process.stdin.on('keypress', onKey);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    write('\x1b[?25h');
    collapse(printed, question, opts[i].label);
  }
}

async function numbered(question, opts, i) {
  console.log(` ${S_STEP} ${bold(question)}`);
  opts.forEach((o, k) => console.log(` ${BAR} ${cyan(k + 1)}) ${o.label}${o.hint ? `  ${gray(o.hint)}` : ''}`));
  for (;;) {
    const a = (await io().question(` ${BAR} ${gray(`(${i + 1}) `)}`)).trim();
    if (!a) return opts[i].value;
    const n = Number(a);
    if (n >= 1 && n <= opts.length) return opts[n - 1].value;
    const byValue = opts.find((o) => o.value === a);
    if (byValue) return byValue.value;
  }
}

export async function confirm(question, def = true, [yes, no] = ['yes', 'no']) {
  return (await select(question, [[true, yes], [false, no]], def)) === true;
}

/** Spinner for slow steps (Orquesta login, etc.). Returns stop(finalText). */
export function spinner(textLine) {
  if (!tty) {
    console.log(` ${BAR} ${textLine}`);
    return (done) => done && console.log(` ${BAR} ${done}`);
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let f = 0;
  write('\x1b[?25l');
  const id = setInterval(() => write(`\r ${accent(frames[f++ % frames.length])} ${textLine}\x1b[K`), 80);
  return (done) => {
    clearInterval(id);
    write(`\r\x1b[K\x1b[?25h`);
    if (done) console.log(` ${S_DONE} ${done}`);
  };
}

export function outro(text) {
  console.log(` ${gray('└')} ${text}\n`);
}
