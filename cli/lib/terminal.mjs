/**
 * Terminal mode: the pet drawn with ANSI in the current terminal, fed by the daemon's SSE.
 * Keys: f feed · p play · s sleep/wake · q quit (the daemon keeps running if --detach started it).
 * Only redraws when the frame changes, line by line (no full clears: no flicker, fine inside tmux).
 * compact: a few narrow lines for a small tmux pane.
 */

import { PET_PORT } from './paths.mjs';
import { petToken, postPet } from './pet-server.mjs';
import { t } from './i18n.mjs';

export const FACES = {
  happy: ['◕', '‿', '◕'],
  neutral: ['•', 'ᴗ', '•'],
  sad: ['╥', '﹏', '╥'],
  disgust: ['¬', '_', '¬'],
  angry: ['ಠ', '益', 'ಠ'],
  sleep: ['-', '‿', '-'],
  love: ['♥', '‿', '♥'],
  fear: ['°', 'o', '°'],
};

const rgb = (hex) => {
  const n = parseInt(String(hex || '#6d5dfc').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const fg = (hex) => `\x1b[38;2;${rgb(hex).join(';')}m`;
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function wrap(text, width) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > width) {
      if (cur) out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

function bar(v, width = 16) {
  const n = Math.round((v / 100) * width);
  const color = v < 25 ? '\x1b[31m' : v < 50 ? '\x1b[33m' : '\x1b[32m';
  return `${color}${'█'.repeat(n)}${DIM}${'░'.repeat(width - n)}${RESET} ${String(v).padStart(3)}`;
}

export async function runTerminal({ identity, lang, port = PET_PORT, bell = false, compact = false }) {
  const out = process.stdout;
  const color = identity.look.color;
  let state = null;
  let bubble = '';
  let bubbleUntil = 0;
  let thinking = false;
  let blink = false;
  let hop = 0;
  let last = '';

  const frame = () => {
    const [l, m, r] = FACES[state.mood] || FACES.neutral;
    const eyesL = blink && !state.asleep ? '-' : l;
    const eyesR = blink && !state.asleep ? '-' : r;
    const c = fg(color);
    const lines = [];
    const now = Date.now();
    if (compact) {
      const say = bubble && now < bubbleUntil ? bubble : thinking ? '…' : '';
      const w = Math.max(16, (out.columns || 28) - 2);
      lines.push(`${c}(${RESET}${BOLD}${eyesL}${RESET}${m}${BOLD}${eyesR}${RESET}${c})${RESET} ${BOLD}${identity.name}${RESET}${state.asleep ? `${DIM} zz${RESET}` : ''}`);
      lines.push(`${t('pet.food', lang).slice(0, 3)} ${bar(state.food, 6)}`);
      lines.push(`${t('pet.energy', lang).slice(0, 3)} ${bar(state.energy, 6)}`);
      lines.push(`${t('pet.fun', lang).slice(0, 3)} ${bar(state.fun, 6)}`);
      for (const x of wrap(say, w).slice(0, 4)) lines.push(`${DIM}${x}${RESET}`);
      lines.push(`${DIM}f p s q${RESET}`);
      return lines;
    }
    if (bubble && now < bubbleUntil) {
      const w = wrap(bubble, 38);
      const width = Math.max(...w.map((x) => x.length));
      lines.push(`  ╭${'─'.repeat(width + 2)}╮`);
      for (const x of w) lines.push(`  │ ${x.padEnd(width)} │`);
      lines.push(`  ╰─┬${'─'.repeat(width)}╯`);
      lines.push('    ╵');
    } else lines.push('', '', '', thinking ? `  ${DIM}…${RESET}` : '');
    const pad = ' '.repeat(hop ? 1 : 3);
    lines.push(`${pad}${c}  ╭───────╮${RESET}`);
    lines.push(`${pad}${c}  │ ${RESET}${BOLD}${eyesL}${RESET} ${m} ${BOLD}${eyesR}${RESET}${c} │${RESET}${state.asleep ? `${DIM} z z${RESET}` : ''}`);
    lines.push(`${pad}${c}  ╰─┬───┬─╯${RESET}`);
    lines.push(`${pad}${c}    ╹   ╹${RESET}`);
    lines.push('');
    lines.push(`  ${BOLD}${identity.name}${RESET} ${DIM}· ${identity.role}${RESET}`);
    lines.push(`  ${t('pet.food', lang).padEnd(10)} ${bar(state.food)}`);
    lines.push(`  ${t('pet.energy', lang).padEnd(10)} ${bar(state.energy)}`);
    lines.push(`  ${t('pet.fun', lang).padEnd(10)} ${bar(state.fun)}`);
    lines.push(`  ${DIM}${t('pet.level', lang, { level: state.level, xp: state.xp, next: state.next })}${RESET}`);
    lines.push('');
    lines.push(`  ${DIM}${t('pet.keys', lang)}${RESET}`);
    return lines;
  };

  const draw = (force = false) => {
    if (!state) return;
    const f = frame().map((x) => x + '\x1b[K').join('\r\n');
    if (f === last && !force) return;
    last = f;
    out.write('\x1b[H' + f + '\x1b[J');
  };

  out.write('\x1b[?1049h\x1b[?25l');
  const restore = () => out.write('\x1b[?25h\x1b[?1049l');
  process.on('exit', restore);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (d) => {
      const k = d.toString();
      if (k === 'q' || k === '\x03') process.exit(0);
      if (k === 'f') postPet('/event', { type: 'feed' }, port);
      if (k === 'p') postPet('/event', { type: 'play' }, port);
      if (k === 's') postPet('/event', { type: state?.asleep ? 'wake' : 'sleep' }, port);
    });
  }
  out.on('resize', () => draw(true));
  setInterval(() => {
    blink = Math.random() < 0.08;
    if (hop) hop--;
    draw(); // no-op unless something visible changed (blink, hop, bubble expiring)
  }, 500);

  // SSE over fetch (Node has no EventSource without flags).
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/events?token=${encodeURIComponent(petToken())}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = chunk.split('\n').filter((x) => x.startsWith('data: ')).map((x) => x.slice(6)).join('');
          if (!data) continue;
          const msg = JSON.parse(data);
          if (msg.state) state = msg.state;
          thinking = !!msg.thinking;
          if (msg.gesture) hop = 4;
          if (msg.say) {
            bubble = msg.say;
            bubbleUntil = Date.now() + Math.max(5000, msg.say.length * 100);
            if (bell) out.write('\x07'); // annoy level 3: a tiny bell
          }
          draw();
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000)); // daemon restarted or gone: retry
  }
}
