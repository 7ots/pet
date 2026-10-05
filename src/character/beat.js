/**
 * Música para los bailes y las entradas del ot, sintetizada en el momento con Web Audio.
 *
 * Nada de audio con derechos: cada estilo es un patrón propio de 16 pasos (bombo, caja, hats, bajo,
 * acordes y una melodía) que suena al pulso de los bailes (DANCE_BPM), así un gesto de baile y su
 * música, arrancados juntos, caen en los mismos tiempos.
 *   hype   electrónica de cuatro en el piso      funk   bajo sincopado y guitarra rítmica
 *   chip   8 bits (cuadradas y triangular)       trap   808 largo, hats con redobles
 *   entrance  público que ruge, dos golpes con pirotecnia y un riff de rock (entradas tipo lucha libre)
 *
 * playBeat(style, { ms, volume }) → { stop(), done: Promise, analyser } (solo en el navegador).
 */

import { DANCE_BPM } from './motion.js';

export const BEAT_STYLES = ['hype', 'funk', 'chip', 'trap', 'entrance'];

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
let shared = null;
const noiseOf = (ctx) => {
  if (ctx.__noise) return ctx.__noise;
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 7;
  for (let i = 0; i < d.length; i++) d[i] = ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  return (ctx.__noise = b);
};

// ── instrumentos: cada golpe crea sus nodos y se desconecta solo al terminar ──
function env(ctx, out, t, peak, a, d) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(out);
  return g;
}
function osc(ctx, type, f, t, dur, dest) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
function noise(ctx, t, dur, dest) {
  const n = ctx.createBufferSource();
  n.buffer = noiseOf(ctx);
  n.loop = true;
  n.connect(dest);
  n.start(t, Math.random() * 0.5);
  n.stop(t + dur + 0.05);
  return n;
}
function filt(ctx, type, f, q, dest) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(dest);
  return b;
}
const I = {
  kick(ctx, out, t, v = 1, low = 45) {
    const g = env(ctx, out, t, 0.9 * v, 0.003, 0.32);
    const o = osc(ctx, 'sine', 150, t, 0.4, g);
    o.frequency.exponentialRampToValueAtTime(low, t + 0.12);
  },
  snare(ctx, out, t, v = 1) {
    noise(ctx, t, 0.2, filt(ctx, 'bandpass', 1900, 0.8, env(ctx, out, t, 0.5 * v, 0.002, 0.18)));
    osc(ctx, 'triangle', 190, t, 0.1, env(ctx, out, t, 0.25 * v, 0.002, 0.08));
  },
  clap(ctx, out, t, v = 1) {
    for (let i = 0; i < 3; i++) noise(ctx, t + i * 0.011, 0.12, filt(ctx, 'bandpass', 1300, 1.2, env(ctx, out, t + i * 0.011, 0.35 * v, 0.001, i === 2 ? 0.16 : 0.02)));
  },
  hat(ctx, out, t, v = 1, open = false) {
    noise(ctx, t, open ? 0.25 : 0.05, filt(ctx, 'highpass', 7500, 0.7, env(ctx, out, t, 0.16 * v, 0.001, open ? 0.2 : 0.035)));
  },
  bass(ctx, out, t, m, dur, v = 1, type = 'sawtooth') {
    const lp = filt(ctx, 'lowpass', 420, 6, env(ctx, out, t, 0.32 * v, 0.005, dur));
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    osc(ctx, type, hz(m), t, dur, lp);
  },
  sub(ctx, out, t, m, dur, v = 1, from = null) {
    const g = env(ctx, out, t, 0.55 * v, 0.004, dur);
    const o = osc(ctx, 'sine', hz(from ?? m), t, dur, g);
    if (from != null) o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.09);
  },
  lead(ctx, out, t, m, dur, v = 1, type = 'square') {
    const g = env(ctx, out, t, 0.11 * v, 0.004, dur);
    osc(ctx, type, hz(m), t, dur, type === 'square' ? filt(ctx, 'lowpass', 3200, 0.5, g) : g);
  },
  chord(ctx, out, t, ms, dur, v = 1, type = 'sawtooth') {
    const lp = filt(ctx, 'lowpass', 1500, 0.8, env(ctx, out, t, 0.07 * v, 0.02, dur));
    for (const m of ms) for (const det of [-7, 7]) osc(ctx, type, hz(m), t, dur, lp).detune.value = det;
  },
  power(ctx, out, t, m, dur, v = 1) {
    // acorde de quinta distorsionado (guitarra de rock)
    const ws = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / c.length) * 2 - 1;
      c[i] = Math.tanh(x * 6);
    }
    ws.curve = c;
    ws.connect(filt(ctx, 'lowpass', 2600, 0.7, env(ctx, out, t, 0.12 * v, 0.004, dur)));
    for (const k of [0, 7, 12]) osc(ctx, 'sawtooth', hz(m + k), t, dur, ws);
  },
  crowd(ctx, out, t, dur, v = 1) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * v, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    const bp = filt(ctx, 'bandpass', 700, 0.6, g);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    noise(ctx, t, dur, bp);
    // gritos sueltos del público
    for (let i = 0; i < 8; i++) {
      const s = t + Math.random() * dur * 0.8;
      const o = osc(ctx, 'sawtooth', 300 + Math.random() * 500, s, 0.35, filt(ctx, 'bandpass', 900, 3, env(ctx, out, s, 0.025 * v, 0.05, 0.3)));
      o.frequency.linearRampToValueAtTime(o.frequency.value * 1.3, s + 0.3);
    }
  },
  boom(ctx, out, t, v = 1) {
    I.kick(ctx, out, t, 1.2 * v, 30);
    noise(ctx, t, 1.4, filt(ctx, 'lowpass', 900, 0.5, env(ctx, out, t, 0.5 * v, 0.005, 1.3)));
    noise(ctx, t + 0.05, 0.6, filt(ctx, 'highpass', 4000, 0.5, env(ctx, out, t + 0.05, 0.12 * v, 0.01, 0.5))); // chispas
  },
};

// ── estilos: patrones de 16 pasos por compás, 4 compases (acordes en midi) ──
const on = (p, i) => p[i % p.length] === 'x';
const STYLES = {
  hype: {
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    step(ctx, out, t, i, bar, sd) {
      const ch = this.chords[bar % 4];
      if (i % 4 === 0) I.kick(ctx, out, t);
      if (i === 4 || i === 12) I.clap(ctx, out, t);
      if (i % 4 === 2) (I.hat(ctx, out, t, 1, true), I.bass(ctx, out, t, ch[0] - 24, sd * 1.6));
      else I.hat(ctx, out, t, 0.35);
      if (i === 0) I.chord(ctx, out, t, ch, sd * 14, 0.8);
      if (bar % 2 === 1 && i % 2 === 0) I.lead(ctx, out, t, ch[(i / 2) % 3] + 12 + (i >= 8 ? 12 : 0), sd * 0.9, 0.8);
    },
  },
  funk: {
    roots: [52, 52, 57, 55],
    line: [0, null, 12, null, 0, null, 10, 7, 0, null, 12, null, 3, 5, 7, 10],
    step(ctx, out, t, i, bar, sd) {
      const r = this.roots[bar % 4];
      if (on('x.....x.x.....x.', i)) I.kick(ctx, out, t);
      if (i === 4 || i === 12) I.snare(ctx, out, t);
      if (i === 15 && bar % 2) I.snare(ctx, out, t, 0.4);
      I.hat(ctx, out, t, i % 2 ? 0.25 : 0.55, i === 14);
      const n = this.line[i];
      if (n != null) I.bass(ctx, out, t, r - 24 + n, sd * 0.9, 1.1, 'square');
      if (on('..x...x..x..x.x.', i)) I.chord(ctx, out, t, [r + 7, r + 10, r + 14], sd * 0.5, 1.4, 'square');
    },
  },
  chip: {
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
    step(ctx, out, t, i, bar, sd) {
      const ch = this.chords[bar % 4];
      if (i % 8 === 0 || i === 10) I.kick(ctx, out, t, 0.8);
      if (i === 4 || i === 12) noise(ctx, t, 0.1, filt(ctx, 'highpass', 1500, 0.5, env(ctx, out, t, 0.25, 0.001, 0.09)));
      I.lead(ctx, out, t, ch[i % 3] + 12 + (Math.floor(i / 4) % 2) * 12, sd * 0.8, 0.9);
      if (i % 4 === 0) I.lead(ctx, out, t, ch[0] - 12, sd * 3, 2.2, 'triangle');
      if (bar % 4 === 3 && i >= 12) I.lead(ctx, out, t, ch[2] + 24 + (i - 12) * 2, sd * 0.8, 0.7);
    },
  },
  trap: {
    roots: [45, 45, 41, 43],
    step(ctx, out, t, i, bar, sd) {
      const r = this.roots[bar % 4];
      if (on('x.......x.x.....', i)) (I.kick(ctx, out, t), I.sub(ctx, out, t, r - 12, sd * (i === 0 ? 7 : 3), 1, i === 10 ? r : null));
      if (i === 8) I.clap(ctx, out, t, 1.1);
      // hats con redoble en el último tiempo
      if (i >= 12 && bar % 2) for (let k = 0; k < 3; k++) I.hat(ctx, out, t + (k * sd) / 3, 0.4 + k * 0.1);
      else if (i % 2 === 0) I.hat(ctx, out, t, 0.5);
      if (i === 0 && bar % 2 === 0) I.chord(ctx, out, t, [r + 12, r + 15, r + 19], sd * 30, 0.7, 'triangle');
    },
  },
  entrance: {
    intro: 2.2, // s de público y golpes antes del riff
    start(ctx, out, t) {
      I.crowd(ctx, out, t, 4.5);
      I.boom(ctx, out, t + 1.0);
      I.boom(ctx, out, t + 1.6, 0.8);
      I.power(ctx, out, t + 1.6, 40, 0.5, 1.2);
    },
    step(ctx, out, t, i, bar, sd) {
      const r = [40, 40, 43, 38][bar % 4];
      if (on('x.....x.x.......', i)) I.kick(ctx, out, t, 1.1);
      if (i === 4 || i === 12) I.snare(ctx, out, t, 1.2);
      if (i % 2 === 0) I.hat(ctx, out, t, 0.4, i === 14);
      if (on('x.x.xx..x.x.x..x', i)) I.power(ctx, out, t, r + (i === 15 ? 3 : 0), sd * 1.3);
      if (i === 0 && bar % 2 === 0) I.crowd(ctx, out, t, 2.5, 0.35);
    },
  },
};

/**
 * Toca un estilo durante `ms`. Devuelve { stop(), done, analyser } o null sin Web Audio.
 * `volume` 0..1. El primer paso cae en el instante en que se llama (con el gesto de baile).
 */
export function playBeat(style, { ms = 6000, volume = 0.5, bpm = DANCE_BPM, ctx = null } = {}) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx ||= shared ||= new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const S = STYLES[style] || STYLES.hype;
  const master = ctx.createGain();
  const vol = Math.max(0, Math.min(1, volume)) * 0.7;
  master.gain.value = vol;
  const comp = ctx.createDynamicsCompressor();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  master.connect(comp).connect(analyser).connect(ctx.destination);
  const sd = 60 / bpm / 4; // un paso = semicorchea
  const t0 = ctx.currentTime + 0.05;
  const end = t0 + ms / 1000;
  if (S.start) S.start(ctx, master, t0);
  let next = t0 + (S.intro || 0);
  let i = 0;
  let stopped = false;
  let resolve;
  const done = new Promise((r) => (resolve = r));
  const pump = () => {
    if (stopped) return;
    while (next < Math.min(end - 0.05, ctx.currentTime + 0.15)) {
      S.step(ctx, master, next, i % 16, Math.floor(i / 16), sd);
      next += sd;
      i++;
    }
    if (ctx.currentTime >= end) stop(0);
  };
  const timer = setInterval(pump, 25);
  pump();
  function stop(fade = 0.4) {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.05, fade));
    setTimeout(() => (master.disconnect(), resolve()), (Math.max(0.05, fade) + 1.5) * 1000);
  }
  // el final se desvanece en el último compás
  master.gain.setValueAtTime(vol, Math.max(t0, end - 0.8));
  master.gain.linearRampToValueAtTime(0.0001, end);
  return { stop, done, analyser, ctx };
}
