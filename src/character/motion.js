/**
 * Movimiento del personaje 2D de 7ots: gestos, metamorfosis del cuerpo, efectos y visemas.
 *
 * - GESTURES: gestos con anticipación, squash & stretch y follow-through. Cada uno es una
 *   función del tiempo normalizado t (0..1) y la edad en ms → pose { x, y, r, sx, sy } del
 *   cuerpo (x/y en fracciones del cuerpo, r en grados, origen abajo al centro) más retoques
 *   de cara { lx, ly, blink, eye, lift, open, curve, msx }. Pueden sacar manos, alas y efectos.
 * - MORPHS: transformaciones temporales del cuerpo (pinchos, alas, manos, cuernos, inflarse,
 *   aplastarse, estirarse, derretirse, gelatina y cambio de forma «shape:<id>»).
 * - EFFECTS: brillos, sudor, rubor, corazones, zzz, «!», «?», enfado, vapor, confeti,
 *   lágrimas, bocadillo de pensar, notas, estornudo, burbuja y mareo.
 * - VISEMES / textToVisemes: formas de boca para el lip-sync (abierta, ancha, redonda…).
 *
 * Todo son funciones puras: Character.js las evalúa en su bucle de animación y pinta el SVG.
 * Aquí no se toca el DOM y todo lo que se pinta sale de números y colores ya saneados.
 */

import { BODY_POINTS, SHAPES } from './parts.js';
import { skinPaths, skinAt, joinSVG } from './skin.js';

const R = (v) => Math.round(v * 100) / 100;
const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;

export const EASE = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  backOut: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
  elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

/** Acerca `cur` a `target` con constante de tiempo `tau` (ms), igual a cualquier framerate. */
export const approach = (cur, target, dt, tau) => target + (cur - target) * Math.exp(-dt / Math.max(1, tau));

/** Aleatorio determinista (mulberry32): las partículas de un efecto no «saltan» entre frames. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Onda senoidal sobre la edad en ms. */
const S = (age, hz, ph = 0) => Math.sin((age / 1000) * TAU * hz + ph);
/** Envolvente: sube en la fracción `a` inicial y baja en la `b` final. */
const env = (t, a = 0.15, b = 0.15) => Math.min(EASE.inOut(clamp(t / a)), EASE.inOut(clamp((1 - t) / b)));

// ───────────────────────────── gestos ─────────────────────────────

/** Pulso de los bailes: 120 bpm (2 tiempos por segundo). */
export const DANCE_BPM = 120;
const BEAT = DANCE_BPM / 60;
/** Onda más «cuadrada» (llega y se queda en los extremos), para golpes de baile. */
const snap = (v) => Math.sign(v) * Math.abs(v) ** 0.55;
/** Tiempo de compás: [índice del tiempo, avance 0..1 con llegada rápida] para moverse a golpes. */
const beatStep = (age, hz = BEAT) => {
  const b = (age / 1000) * hz;
  const i = Math.floor(b);
  return [i, EASE.out(clamp((b - i) / 0.22))];
};



/** Pose neutra: cuerpo sin transformar y cara sin retoques. */
export const POSE0 = Object.freeze({ x: 0, y: 0, r: 0, sx: 1, sy: 1, lx: 0, ly: 0, blink: 0, eye: 1, lift: 0, open: 0, curve: 0, msx: 1 });

/** Fotogramas clave [[t, {campos}, easing?], …] → función t → pose (los campos que faltan vuelven a POSE0). */
function keys(list) {
  return (t) => {
    let i = 1;
    while (i < list.length - 1 && t > list[i][0]) i++;
    const [t0, a] = list[i - 1];
    const [t1, b, e = 'inOut'] = list[i];
    const k = EASE[e](clamp((t - t0) / (t1 - t0 || 1)));
    const out = {};
    for (const f in a) out[f] = lerp(a[f], f in b ? b[f] : POSE0[f], k);
    for (const f in b) if (!(f in a)) out[f] = lerp(POSE0[f], b[f], k);
    return out;
  };
}

/**
 * Gestos. { ms (duración por defecto), pose(t, ageMs) → pose, hands?: postura de manos,
 * legs?: postura de patas (LEG_POSES), wings?: 'slow'|'fast', fx?: [[t, efecto|metamorfosis, opts?]], hold?: se puede alargar con {ms} }.
 * Se diseñan mirando a la derecha; con { dir: -1 } se reflejan x, r, lx y la mano activa.
 */
const DAB = keys([[0, {}], [0.15, { sy: 0.9, sx: 1.06, y: 0.01, r: 4 }], [0.25, { r: -14, x: -0.03, sy: 1.02, ly: 0.7, lx: -0.5, blink: 0.4, curve: 0.5 }, 'out'], [0.85, { r: -14, x: -0.03, sy: 1.01, ly: 0.7, lx: -0.5, blink: 0.4, curve: 0.5 }], [1, {}]]);

export const GESTURES = {
  jump: {
    ms: 800,
    pose: keys([[0, {}], [0.2, { sy: 0.8, sx: 1.16, lift: -1 }], [0.42, { y: -0.24, sy: 1.14, sx: 0.9, lift: 3, eye: 1.08 }, 'out'], [0.56, { y: -0.27, lift: 3 }], [0.74, { y: 0, sy: 1.1, sx: 0.93 }, 'in'], [0.84, { sy: 0.86, sx: 1.12 }], [1, {}]]),
  },
  bounce: {
    ms: 900,
    pose: keys([[0, {}], [0.12, { sy: 0.88, sx: 1.08 }], [0.3, { y: -0.12, sy: 1.06, sx: 0.95 }, 'out'], [0.46, { y: 0, sy: 0.9, sx: 1.08 }, 'in'], [0.6, { y: -0.05, sy: 1.03 }, 'out'], [0.74, { y: 0, sy: 0.95, sx: 1.04 }, 'in'], [1, {}, 'out']]),
  },
  wiggle: {
    ms: 900,
    pose: (t) => {
      const e = (1 - t) ** 1.5 * EASE.out(clamp(t / 0.1));
      const w = Math.sin(t * TAU * 3);
      return { r: w * 10 * e, x: Math.sin(t * TAU * 3 - 0.6) * 0.02 * e, sx: 1 + 0.03 * e * Math.abs(w), lx: -Math.sin(t * TAU * 3 - 1) * 0.4 * e };
    },
  },
  nod: {
    ms: 800,
    pose: keys([[0, {}], [0.18, { sy: 1.03, ly: -0.2, lift: 2 }], [0.36, { sy: 0.92, sx: 1.04, y: 0.01, ly: 0.6, lift: -1, curve: 0.2 }, 'in'], [0.54, { sy: 1.02, ly: -0.1, curve: 0.2 }], [0.72, { sy: 0.95, sx: 1.02, ly: 0.4, curve: 0.2 }, 'in'], [1, {}, 'out']]),
  },
  shake: {
    ms: 900,
    pose: (t) => {
      const e = Math.sin(Math.PI * clamp(t * 1.05));
      const w = Math.sin(t * TAU * 3);
      return { x: w * 0.05 * e, r: -w * 3 * e, lx: -Math.sin(t * TAU * 3 - 0.8) * 0.7 * e, curve: -0.25 * e, sx: 1 - 0.02 * e };
    },
  },
  spin: {
    ms: 1000,
    pose: (t) => {
      const a = t < 0.12 ? Math.sin((Math.PI * t) / 0.12) : 0;
      const k = EASE.inOut(clamp((t - 0.12) / 0.76));
      return { sx: Math.cos(k * TAU) * (1 + 0.1 * a), sy: 1 - 0.12 * a + 0.05 * Math.sin(Math.PI * k), y: -0.12 * Math.sin(Math.PI * k) };
    },
  },
  wave: {
    ms: 1600,
    hold: true,
    hands: 'wave',
    pose: (t, age) => {
      const e = env(t, 0.15, 0.2);
      return { r: (2.5 + S(age, 1.5) * 1.2) * e, curve: 0.35 * e, lift: 2 * e, lx: 0.15 * e };
    },
  },
  think: {
    ms: 2200,
    hold: true,
    hands: 'chin',
    fx: [[0.15, 'thought']],
    pose: (t, age) => {
      const e = env(t, 0.12, 0.15);
      return { r: -3 * e, lx: (0.55 + S(age, 0.4) * 0.1) * e, ly: -0.55 * e, lift: 3 * e, curve: -0.25 * e, msx: 1 - 0.25 * e };
    },
  },
  celebrate: {
    ms: 1700,
    hands: 'up',
    fx: [[0.12, 'confetti'], [0.3, 'sparkles']],
    pose: (t, age) => {
      const e = env(t, 0.08, 0.15);
      const hop = Math.abs(Math.sin(t * TAU * 1.5));
      return { y: -0.16 * hop * e, sy: 1 + (0.08 * hop - 0.04) * e, sx: 1 - (0.05 * hop - 0.02) * e, r: S(age, 1.5) * 4 * e, curve: 0.7 * e, open: 0.45 * e, eye: 1 + 0.08 * e };
    },
  },
  surprise: {
    ms: 1200,
    fx: [[0.04, 'exclaim']],
    pose: keys([[0, {}], [0.1, { sy: 1.16, sx: 0.88, y: -0.05, eye: 1.3, open: 0.55, lift: 7, msx: 0.7 }, 'out'], [0.3, { sy: 0.97, sx: 1.03, eye: 1.25, open: 0.5, lift: 6, msx: 0.7 }], [0.45, { sy: 1.02, eye: 1.22, open: 0.45, lift: 5, msx: 0.72 }], [0.8, { eye: 1.15, open: 0.3, lift: 4, msx: 0.8 }], [1, {}]]),
  },
  shrug: {
    ms: 1500,
    hold: true,
    hands: 'shrug',
    fx: [[0.2, 'question']],
    pose: keys([[0, {}], [0.2, { sy: 1.05, sx: 0.97, y: -0.02, r: -3, lift: 5, curve: -0.15, lx: -0.2, ly: -0.15 }, 'out'], [0.75, { sy: 1.04, sx: 0.97, y: -0.02, r: -3, lift: 5, curve: -0.15, lx: -0.2, ly: -0.15 }], [0.88, { sy: 0.97, sx: 1.02 }], [1, {}]]),
  },
  sneeze: {
    ms: 1700,
    fx: [[0.58, 'sneeze']],
    pose: keys([[0, {}], [0.15, { r: -3, sy: 1.03, lift: 3, blink: 0.3, open: 0.25, msx: 0.9 }], [0.3, { r: -2, sy: 1.01, lift: 2, blink: 0.1, open: 0.15 }], [0.52, { r: -7, sy: 1.1, sx: 0.95, y: -0.02, lift: 6, blink: 0.65, open: 0.4, msx: 0.8 }, 'in'], [0.6, { r: 9, sy: 0.8, sx: 1.15, x: 0.05, blink: 1, open: 0.95, lift: -3, msx: 1.15 }, 'out'], [0.72, { r: 5, sy: 0.9, sx: 1.06, x: 0.03, blink: 1, open: 0.2 }], [1, {}, 'out']]),
  },
  hiccup: {
    ms: 800,
    fx: [[0.1, 'bubble']],
    pose: keys([[0, {}], [0.08, { y: -0.07, sy: 1.12, sx: 0.92, eye: 1.18, open: 0.3, lift: 4, msx: 0.7 }, 'out'], [0.22, { y: 0, sy: 0.94, sx: 1.04, eye: 1.08, lift: 2 }, 'in'], [0.36, { sy: 1.02 }], [1, {}, 'out']]),
  },
  laugh: {
    ms: 1500,
    hold: true,
    fx: [[0.1, 'sparkles']],
    pose: (t, age) => {
      const e = env(t, 0.1, 0.2);
      const b = Math.abs(S(age, 4.5));
      return { y: -0.035 * b * e, sy: 1 + (0.05 * b - 0.02) * e, sx: 1 - 0.03 * b * e, r: S(age, 1.3) * 3 * e, open: (0.35 + 0.45 * b) * e, curve: 0.9 * e, blink: 0.55 * e, lift: 2 * e };
    },
  },
  dance: {
    ms: 2600,
    hold: true,
    dance: 'funk',
    legs: 'stomp',
    hands: 'dance',
    fx: [[0.05, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.08, 0.12);
      const beat = S(age, 1);
      const hop = Math.abs(S(age, 2));
      return { r: beat * 9 * e, x: beat * 0.04 * e, y: -0.06 * hop * e, sy: 1 + (0.06 * hop - 0.03) * e, sx: 1 - (0.04 * hop - 0.02) * e, curve: 0.6 * e, lx: beat * 0.3 * e };
    },
  },
  // ── bailes (al pulso de DANCE_BPM: la música de beat.js arranca con el gesto y cae en los mismos tiempos) ──
  floss: {
    ms: 6000,
    hold: true,
    dance: 'hype',
    legs: 'floss',
    hands: 'floss',
    fx: [[0.04, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const sw = snap(S(age, BEAT / 2));
      const hop = Math.abs(S(age, BEAT));
      return { x: -sw * 0.05 * e, r: sw * 6 * e, y: -0.02 * hop * e, sy: 1 + 0.03 * hop * e, sx: 1 - 0.02 * hop * e, curve: 0.7 * e, lx: sw * 0.4 * e, open: 0.15 * e };
    },
  },
  robot: {
    ms: 6000,
    hold: true,
    dance: 'chip',
    legs: 'robot',
    hands: 'robot',
    fx: [[0.04, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.05, 0.08);
      const [i, k] = beatStep(age);
      const at = (n) => [[0, 0], [-6, -0.025], [0, 0], [6, 0.025]][((n % 4) + 4) % 4];
      const a = at(i - 1);
      const b = at(i);
      const r = lerp(a[0], b[0], k);
      return { r: r * e, x: lerp(a[1], b[1], k) * e, sy: 1 + 0.02 * (1 - k) * e, lx: (r / 6) * 0.6 * e, eye: 1 + 0.06 * e, msx: 1 + 0.2 * e, curve: 0.1 * e };
    },
  },
  shuffle: {
    ms: 6000,
    hold: true,
    dance: 'hype',
    legs: 'shuffle',
    hands: 'pump',
    fx: [[0.04, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const hop = Math.abs(S(age, BEAT));
      const land = 1 - hop;
      const side = S(age, BEAT / 2);
      return { y: -0.06 * hop * e, x: side * 0.035 * e, r: -side * 4 * e, sy: 1 + (0.05 * hop - 0.05 * land * land) * e, sx: 1 - (0.03 * hop - 0.04 * land * land) * e, curve: 0.8 * e, open: 0.25 * hop * e };
    },
  },
  dab: {
    ms: 4000,
    hold: true,
    dance: 'trap',
    legs: 'wide',
    hands: 'dab',
    fx: [[0.08, 'sparkles']],
    // un golpe cada dos segundos (4 tiempos): se prepara, clava el dab y lo sostiene
    pose: (t, age) => {
      const e = env(t, 0.05, 0.1);
      const p = DAB((age % 2000) / 2000);
      const out = {};
      for (const f in p) out[f] = POSE0[f] + (p[f] - POSE0[f]) * e;
      return out;
    },
  },
  groove: {
    ms: 6000,
    hold: true,
    dance: 'funk',
    legs: 'kick',
    hands: 'groove',
    fx: [[0.04, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const bob = Math.abs(S(age, BEAT));
      const step = S(age, BEAT / 4);
      return { x: step * 0.05 * e, y: -0.025 * bob * e, sy: 1 + (0.04 * bob - 0.02) * e, sx: 1 - (0.03 * bob - 0.015) * e, r: S(age, BEAT / 2) * 5 * e, curve: 0.8 * e, lx: step * 0.3 * e, open: 0.2 * e };
    },
  },
  armwave: {
    ms: 6000,
    hold: true,
    dance: 'chip',
    legs: 'stomp',
    hands: 'armwave',
    fx: [[0.04, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const w = S(age, BEAT / 2, Math.PI / 2);
      return { y: -0.03 * Math.max(0, S(age, BEAT / 2)) * e, r: w * 5 * e, x: w * 0.02 * e, sy: 1 + 0.03 * S(age, BEAT / 2) * e, curve: 0.6 * e, lx: w * 0.5 * e, blink: 0.3 * e };
    },
  },
  disco: {
    ms: 6000,
    hold: true,
    dance: 'funk',
    legs: 'disco',
    hands: 'disco',
    fx: [[0.04, 'notes'], [0.04, 'sparkles']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const [i, k] = beatStep(age);
      const at = (n) => (n % 2 ? -1 : 1);
      const p = lerp(at(i - 1), at(i), k);
      return { x: p * 0.03 * e, r: p * 7 * e, y: -0.02 * (1 - k) * e, ly: -p * 0.4 * e, lx: 0.5 * e, curve: 0.8 * e, lift: 2 * e };
    },
  },
  moonwalk: {
    ms: 6000,
    hold: true,
    dance: 'funk',
    legs: 'moonwalk',
    hands: 'swing',
    fx: [[0.04, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      // se desliza hacia atrás (inclinado hacia delante) y vuelve de un paso al compás
      const f = ((age / 1000) * (BEAT / 2)) % 1;
      const back = f < 0.8 ? f / 0.8 : 1 - EASE.inOut((f - 0.8) / 0.2);
      return { x: (0.04 - back * 0.09) * e, r: 6 * e, y: -0.012 * Math.abs(S(age, BEAT)) * e, sy: 1 - 0.02 * e, curve: 0.5 * e, lx: 0.4 * e, blink: 0.35 * e };
    },
  },
  routine: {
    ms: 8000,
    hold: true,
    dance: 'hype',
    legs: 'stomp',
    hands: 'routine',
    fx: [[0.04, 'notes']],
    pose: (t, age) => {
      const e = env(t, 0.05, 0.08);
      const b = Math.floor((age / 1000) * BEAT) % 8;
      const wig = b >= 6 ? S(age, BEAT * 2) : 0;
      const bob = Math.abs(S(age, BEAT));
      return { r: wig * 7 * e, x: wig * 0.02 * e, y: -0.015 * bob * e, sy: 1 + 0.02 * bob * e, curve: 0.7 * e, open: (b >= 6 ? 0.3 : 0.1) * e };
    },
  },
  yawn: {
    ms: 2000,
    pose: keys([[0, {}], [0.25, { sy: 1.1, sx: 0.95, y: -0.01, open: 0.5, blink: 0.6, lift: 4, msx: 0.8 }], [0.55, { sy: 1.12, sx: 0.94, y: -0.015, open: 1, blink: 0.85, lift: 5, msx: 0.75 }], [0.75, { sy: 0.95, sx: 1.03, open: 0.1, blink: 0.7 }], [1, {}]]),
  },
  shiver: {
    ms: 1300,
    hold: true,
    pose: (t, age) => {
      const e = env(t, 0.1, 0.15);
      return { x: S(age, 14) * 0.012 * e, r: S(age, 11, 1) * 1.2 * e, sx: 1 - 0.03 * e, sy: 1 - 0.04 * e, curve: -0.3 * e, eye: 1 + 0.08 * e, lift: 3 * e, open: (0.08 + 0.04 * S(age, 16)) * e, msx: 1 + 0.15 * e };
    },
  },
  clap: {
    ms: 1500,
    hold: true,
    hands: 'clap',
    fx: [[0.2, 'sparkles']],
    pose: (t, age) => {
      const e = env(t, 0.1, 0.15);
      const b = Math.max(0, S(age, 3.2));
      return { sy: 1 + 0.025 * b * e, y: -0.015 * b * e, curve: 0.6 * e, open: 0.2 * e };
    },
  },
  thumbsup: {
    ms: 1400,
    hands: 'thumb',
    fx: [[0.25, 'sparkles']],
    pose: keys([[0, {}], [0.15, { sy: 0.92, sx: 1.05 }], [0.3, { y: -0.05, sy: 1.05, sx: 0.97, curve: 0.7, lift: 2, r: 3 }, 'out'], [0.8, { curve: 0.7, lift: 2, r: 3, sy: 1.01 }], [1, {}]]),
  },
  thumbsdown: {
    ms: 1400,
    hands: 'thumbdown',
    pose: keys([[0, {}], [0.25, { sy: 0.93, sx: 1.04, curve: -0.6, lift: -1, r: -2 }], [0.8, { sy: 0.94, sx: 1.03, curve: -0.6, lift: -1, r: -2 }], [1, {}]]),
  },
  point: {
    ms: 1500,
    hold: true,
    hands: 'point',
    pose: keys([[0, {}], [0.15, { r: -3, sy: 0.97 }], [0.32, { r: 5, x: 0.02, sy: 1.02, lx: 0.85, ly: -0.05, lift: 2 }, 'out'], [0.8, { r: 4, x: 0.02, lx: 0.85, lift: 2 }], [1, {}]]),
  },
  bow: {
    ms: 1600,
    hands: 'namaste',
    pose: keys([[0, {}], [0.3, { sy: 0.84, sx: 1.06, y: 0.02, ly: 0.7, blink: 0.5, curve: 0.3 }], [0.65, { sy: 0.84, sx: 1.06, y: 0.02, ly: 0.7, blink: 0.6, curve: 0.3 }], [0.85, { sy: 1.03, sx: 0.98 }, 'out'], [1, {}]]),
  },
  fly: {
    ms: 2600,
    hold: true,
    wings: 'fast',
    pose: (t, age) => {
      const e = env(t, 0.18, 0.22);
      const f = S(age, 3.2);
      return { y: (-0.22 + f * 0.03) * e, sy: 1 + f * 0.03 * e, sx: 1 - f * 0.02 * e, r: S(age, 0.6) * 4 * e, curve: 0.4 * e, ly: 0.2 * e };
    },
  },
  stomp: {
    ms: 1000,
    hands: 'hips',
    fx: [[0.38, 'anger'], [0.38, 'spikes', { ms: 600 }]],
    pose: keys([[0, {}], [0.25, { y: -0.08, sy: 1.1, sx: 0.93, r: -3, curve: -0.5, lift: -3 }, 'out'], [0.38, { y: 0, sy: 0.78, sx: 1.2, curve: -0.5, lift: -3 }, 'in'], [0.5, { sy: 1.04, sx: 0.97, x: 0.01, curve: -0.5, lift: -3 }], [0.6, { x: -0.01, sy: 0.98, curve: -0.5, lift: -3 }], [1, {}, 'out']]),
  },
  dizzy: {
    ms: 2200,
    hold: true,
    fx: [[0.05, 'dizzy']],
    pose: (t, age) => {
      const e = env(t, 0.12, 0.15);
      return { r: S(age, 0.9) * 7 * e, x: S(age, 0.9, 1.2) * 0.03 * e, lx: S(age, 1.4) * 0.8 * e, ly: Math.cos((age / 1000) * TAU * 1.4) * 0.6 * e, curve: -0.1 * e, open: 0.15 * e, msx: 1 - 0.2 * e };
    },
  },
  // ── farmeo de aura: poses de meme que suman aura. No son bailes: van aparte (`7ots aura`, su botón, su contador)
  // y `aura` es su música (phonk o montagem de beat.js) ──
  // six-seven: las palmas arriba, una sube y la otra baja, al compás, con cara de nada
  sixseven: {
    ms: 6000,
    hold: true,
    aura: 'montagem',
    legs: 'wide',
    hands: 'sixseven',
    fx: [[0.04, 'aura'], [0.5, 'aura']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const w = snap(S(age, BEAT / 2));
      return { r: w * 4 * e, x: w * 0.015 * e, y: -0.015 * Math.abs(S(age, BEAT)) * e, blink: 0.35 * e, curve: 0.15 * e, msx: 1 - 0.15 * e, lx: 0.2 * e };
    },
  },
  // mirada sigma (mewing): quieto, mentón arriba, ojos a media asta, boca apretada; mira de reojo y vuelve a ti
  mewing: {
    ms: 6000,
    hold: true,
    aura: 'phonk',
    legs: 'wide',
    hands: 'hips',
    fx: [[0.05, 'aura'], [0.55, 'aura']],
    pose: (t, age) => {
      const e = env(t, 0.12, 0.1);
      const side = ((age / 1000) * (BEAT / 8)) % 1 < 0.5 ? 0.6 : 0;
      return { r: -3 * e, y: -0.01 * e, sy: 1 + 0.02 * e, sx: 1 - 0.01 * e, blink: 0.45 * e, eye: 1 - 0.08 * e, lx: side * e, ly: -0.15 * e, curve: -0.05 * e, msx: 1 - 0.35 * e, lift: -1.5 * e };
    },
  },
  // paso tikio: una mano arriba de reloj y la otra le marca la hora a golpes, mientras da una vuelta entera
  tikio: {
    ms: 6000,
    hold: true,
    aura: 'montagem',
    legs: 'stomp',
    hands: 'tikio',
    fx: [[0.04, 'aura']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const f = ((age / 1000) * (BEAT / 8)) % 1; // una vuelta cada 8 tiempos
      const turn = f > 0.5 ? EASE.inOut((f - 0.5) / 0.5) : 0;
      const tick = Math.abs(S(age, BEAT));
      return { sx: lerp(1, Math.cos(turn * TAU), e) * (1 - 0.02 * tick * e), sy: 1 + 0.02 * tick * e, y: -0.015 * tick * e, curve: 0.3 * e, blink: 0.3 * e };
    },
  },
  // la garza: en una pata, las manos en triángulo sobre la cabeza, mirando con sospecha
  garza: {
    ms: 6000,
    hold: true,
    aura: 'phonk',
    legs: 'garza',
    hands: 'garza',
    fx: [[0.05, 'aura'], [0.55, 'aura']],
    pose: (t, age) => {
      const e = env(t, 0.1, 0.08);
      const wob = S(age, 0.7) * 0.6 + S(age, 1.9) * 0.4; // se balancea para no caerse
      const look = ((age / 1000) * (BEAT / 4)) % 1 < 0.5 ? 0.7 : -0.7;
      return { r: wob * 3 * e, x: wob * 0.01 * e, y: -0.02 * e, sy: 1 + 0.03 * e, blink: 0.5 * e, lx: look * e, curve: -0.25 * e, lift: -2 * e, msx: 1 - 0.25 * e };
    },
  },
  // paso deal: pies rápidos coordinados y los codos que entran y salen juntos
  deal: {
    ms: 6000,
    hold: true,
    aura: 'montagem',
    legs: 'deal',
    hands: 'deal',
    fx: [[0.04, 'aura']],
    pose: (t, age) => {
      const e = env(t, 0.06, 0.08);
      const hop = Math.abs(S(age, BEAT * 2));
      const side = snap(S(age, BEAT / 2));
      return { x: side * 0.03 * e, r: -side * 3 * e, y: -0.025 * hop * e, sy: 1 + 0.03 * hop * e, curve: 0.4 * e, blink: 0.25 * e };
    },
  },
  // festejo de futbolista: carrera, salto con giro y el «¡siuuu!» con los brazos abiertos; después, el dedo al cielo
  siu: {
    ms: 6000,
    hold: true,
    aura: 'phonk',
    legs: 'siu',
    hands: 'siu',
    fx: [[0.3, 'aura'], [0.32, 'confetti']],
    pose: (t, age) => {
      const e = env(t, 0.04, 0.08);
      const f = (age % 4000) / 4000;
      if (f < 0.2) return { x: lerp(-0.05, 0.03, f / 0.2) * e, y: -0.02 * Math.abs(S(age, BEAT * 2)) * e, r: 6 * e, curve: 0.6 * e }; // corre
      if (f < 0.4) {
        const k = (f - 0.2) / 0.2; // salta y gira en el aire
        return { x: 0.03 * e, y: -0.16 * Math.sin(Math.PI * k) * e, sx: lerp(1, Math.cos(EASE.inOut(k) * TAU), e), sy: 1 + 0.06 * Math.sin(Math.PI * k) * e, curve: 0.5 * e };
      }
      if (f < 0.75) {
        const k = clamp((f - 0.4) / 0.06); // cae abierto: ¡siuuu!
        return { x: 0.03 * e, sy: 1 - 0.08 * (1 - k) * e, sx: 1 + 0.06 * e, open: 0.85 * k * e, msx: 1 - 0.45 * e, curve: 0.1 * e, blink: 0.2 * e, lift: 2 * e };
      }
      return { x: 0.03 * e, ly: -0.8 * e, curve: 0.7 * e, lift: 1.5 * e, open: 0.1 * e }; // el dedo al cielo
    },
  },
};

/** Nombres alternativos (incluidos los gestos del avatar 3D de TalkingHead). */
export const GESTURE_ALIAS = {
  handup: 'wave', hi: 'wave', hello: 'wave', index: 'point', ok: 'nod', yes: 'nod', no: 'shake',
  thumbup: 'thumbsup', thumbdown: 'thumbsdown', side: 'wiggle', namaste: 'bow', hop: 'jump', cheer: 'celebrate',
  default: 'groove', runningman: 'shuffle', robotdance: 'robot', macarena: 'routine', wavearms: 'armwave', slide: 'moonwalk', boogie: 'disco',
};

/** Los gestos que son bailes (llevan `dance`: el estilo de música que les va). */
export const DANCES = Object.keys(GESTURES).filter((k) => GESTURES[k].dance);
/** Baile → estilo de música (beat.js). */
export const DANCE_STYLE = Object.fromEntries(DANCES.map((k) => [k, GESTURES[k].dance]));
/** El farmeo de aura (six-seven, mewing, tikio, garza, deal, siu): gestos con `aura`, aparte de los bailes. */
export const AURA_MOVES = Object.keys(GESTURES).filter((k) => GESTURES[k].aura);
/** Farmeo → su música (phonk o montagem, beat.js). */
export const AURA_STYLE = Object.fromEntries(AURA_MOVES.map((k) => [k, GESTURES[k].aura]));
/** Lo que suma cada farmeo (el número que flota: +67, +6.700…). */
export const AURA_POINTS = [67, 100, 420, 1000, 6700];

// ───────────────────────────── manos ─────────────────────────────

/**
 * Posturas de manos. (side, ageMs, dir, c) → { u, v } en semiejes del cuerpo desde su centro
 * (o { x, y } absolutos), `ang` hacia dónde apuntan los dedos (0 arriba, 90 hacia fuera)
 * y `type`: 'open' | 'fist' | 'thumb' | 'thumbdown' | 'point'. Diseñadas para la mano derecha.
 */
const REST = { u: 1.08, v: 0.55, ang: 160, type: 'open' };
export const HAND_POSES = {
  rest: () => REST,
  wave: (s, a, dir) => (s === dir ? { u: 1.28, v: -0.6, ang: 18 + S(a, 2.4) * 26, type: 'open' } : REST),
  up: (s, a) => ({ u: 1.08, v: -1.02, ang: 12 + S(a, 3, s) * 10, type: 'open' }),
  shrug: () => ({ u: 1.42, v: -0.12, ang: 75, type: 'open' }),
  clap: (s, a) => ({ u: 0.2 + 0.32 * (1 - Math.max(0, S(a, 3.2))), v: 0.35, ang: 8, type: 'open' }),
  thumb: (s, a, dir) => (s === dir ? { u: 1.22, v: -0.2, ang: 0, type: 'thumb' } : REST),
  thumbdown: (s, a, dir) => (s === dir ? { u: 1.22, v: 0.12, ang: 0, type: 'thumbdown' } : REST),
  point: (s, a, dir) => (s === dir ? { u: 1.5, v: -0.08, ang: 90, type: 'point' } : REST),
  chin: (s, a, dir, c) => (s === dir ? { x: c.cx + s * c.W * 0.17, y: c.mouthY + c.mw * 0.95, ang: 5, type: 'fist' } : REST),
  namaste: (s, a, dir, c) => ({ x: c.cx + s * c.W * 0.06, y: c.mouthY + c.H * 0.2, ang: 0, type: 'open' }),
  dance: (s, a) => ({ u: 1.15, v: -0.25 + s * S(a, 1) * 0.6, ang: 30 + s * S(a, 1) * 25, type: 'open' }),
  hips: () => ({ u: 0.98, v: 0.28, ang: 200, type: 'fist' }),
  // bailes
  floss: (s, a) => {
    const sw = snap(S(a, BEAT / 2));
    return { u: 0.75 + s * sw * 0.85, v: 0.42, ang: 180 - sw * 35, type: 'fist', s: 1 + 0.12 * S(a, BEAT / 2, Math.PI / 2) * s };
  },
  robot: (s, a) => {
    const [i, k] = beatStep(a);
    const up = (n) => ((n + (s > 0 ? 0 : 1)) % 2 ? 1 : 0);
    const u0 = up(i - 1);
    const u1 = up(i);
    const q = lerp(u0, u1, k);
    return { u: 1.22, v: lerp(0.25, -0.4, q), ang: lerp(90, 0, q), type: 'open' };
  },
  pump: (s, a) => ({ u: 1.12, v: 0.08 + s * S(a, BEAT / 2) * 0.32, ang: 25 + s * S(a, BEAT / 2) * 30, type: 'fist' }),
  dab: (s, a, dir, c) => (s === dir ? { u: 1.55, v: -0.78, ang: 52, type: 'open' } : { x: c.cx + dir * c.W * 0.1, y: c.eyeY - c.H * 0.02, ang: -75, type: 'open' }),
  groove: (s, a) => {
    const w = S(a, BEAT / 2) * s;
    return { u: 1.1 - 0.3 * Math.max(0, w), v: -0.1 - w * 0.5, ang: 35 + w * 35, type: 'fist' };
  },
  armwave: (s, a) => ({ u: 1.42, v: -0.32 - 0.3 * S(a, BEAT / 2, s * 1.3), ang: 90 - 45 * S(a, BEAT / 2, s * 1.3 + 0.7), type: 'open' }),
  disco: (s, a, dir) => {
    if (s !== dir) return { u: 0.98, v: 0.28, ang: 200, type: 'fist' };
    const [i, k] = beatStep(a);
    const P = [{ u: 1.45, v: -1.0, ang: 35 }, { u: -0.35, v: 0.6, ang: 215 }];
    const p0 = P[((i - 1) % 2 + 2) % 2];
    const p1 = P[i % 2];
    return { u: lerp(p0.u, p1.u, k), v: lerp(p0.v, p1.v, k), ang: lerp(p0.ang, p1.ang, k), type: 'point' };
  },
  swing: (s, a) => ({ u: 1.1, v: 0.42 + s * S(a, BEAT / 2) * 0.12, ang: 165 + s * S(a, BEAT / 2) * 15, type: 'open' }),
  routine: (s, a) => {
    // 8 tiempos: brazo afuera, palma arriba, al hombro contrario, a la nuca (uno y otro, alternados)
    const P = [REST, { u: 1.5, v: -0.12, ang: 90 }, { u: 1.48, v: -0.2, ang: 80 }, { u: -0.3, v: -0.35, ang: -60 }, { u: 0.45, v: -1.05, ang: -30 }];
    const stage = (n) => {
      const b = ((n % 8) + 8) % 8;
      return s > 0 ? Math.floor((b + 2) / 2) : Math.floor((b + 1) / 2);
    };
    const [i, k] = beatStep(a);
    const p0 = P[stage(i - 1)];
    const p1 = P[stage(i)];
    return { u: lerp(p0.u, p1.u, k), v: lerp(p0.v, p1.v, k), ang: lerp(p0.ang, p1.ang, k), type: 'open' };
  },
  cover: (s, a, dir, c) => ({ x: c.cx + s * c.sp, y: c.eyeY, ang: -8, type: 'open', s: 1.3 }),
  // farmeo de aura
  sixseven: (s, a) => {
    const w = snap(S(a, BEAT / 2)) * s; // una palma sube mientras la otra baja
    return { u: 1.32, v: -0.05 - w * 0.32, ang: 90, type: 'open', s: 1.05 };
  },
  tikio: (s, a, dir) => {
    if (s !== dir) return { u: 0.35, v: -1.0, ang: s * 10, type: 'open' }; // el reloj, arriba
    const k = Math.max(0, S(a, BEAT)) ** 1.5; // la otra le golpea la palma a cada tiempo
    return { u: lerp(0.95, -0.15, k), v: lerp(-0.7, -0.95, k), ang: lerp(-20, -80, k), type: 'open' };
  },
  garza: (s, a) => ({ u: 0.28, v: -1.3 + 0.03 * S(a, 0.7), ang: -s * 38, type: 'open' }), // las puntas de los dedos se tocan sobre la cabeza
  deal: (s, a) => {
    const k = Math.max(0, S(a, BEAT * 2)) ** 1.2; // los dos codos a la vez, rápido
    return { u: lerp(0.95, 1.3, k), v: lerp(0.2, 0.0, k), ang: lerp(150, 100, k), type: 'fist' };
  },
  siu: (s, a, dir) => {
    const f = (a % 4000) / 4000;
    if (f < 0.2) return { u: 1.1, v: 0.2 + s * S(a, BEAT * 2) * 0.25, ang: 160, type: 'fist' };
    if (f < 0.4) return { u: 1.0, v: -0.6, ang: 20, type: 'open' };
    if (f < 0.75) return { u: 1.45, v: 0.55, ang: 140, type: 'open' }; // brazos abiertos hacia abajo
    return s === dir ? { u: 0.9, v: -1.25, ang: 0, type: 'point' } : { u: 1.0, v: 0.45, ang: 170, type: 'open' };
  },
};

function handPos(pose, s, age, dir, c) {
  const p = (HAND_POSES[pose] || HAND_POSES.rest)(s, age, dir, c);
  const x = p.x ?? c.cx + s * p.u * c.W * 0.5;
  const y = p.y ?? c.mid + p.v * c.H * 0.5;
  return { x, y, ang: p.ang || 0, type: p.type || 'open', s: p.s || 1 };
}

/** Mezcla dos posturas (el tipo de mano cambia a mitad). */
function mixHand(a, b, k) {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), ang: lerp(a.ang, b.ang, k), s: lerp(a.s, b.s, k), type: k < 0.5 ? a.type : b.type };
}

function shoulder(c, s) {
  const p = c.pts;
  const [a, b] = s > 0 ? [p[4], p[5]] : [p[12], p[11]];
  const x = lerp(a[0], b[0], 0.3);
  const y = lerp(a[1], b[1], 0.3);
  return { x: lerp(x, c.cx, 0.14), y };
}

/**
 * Piel con la que se pintan las piezas (la da Character.js en c.skin). Sin ella (llamadas
 * antiguas) se pinta con el color plano del cuerpo y sin unión.
 */
function skinOf(c) {
  return c.skin || { fill: c.fill, solid: c.fill, stops: null, tex: '', lit: '', line: c.line, lw: c.lw, lineOp: 0, box: { x: c.cx - c.W / 2, y: c.top, w: c.W, h: c.H }, d: '', uid: '' };
}
const join = (sk, shapes, key) => (sk.uid ? joinSVG(sk, shapes, key) : { shadow: '', mask: '' });

function handSVG(h, s, c) {
  const hr = c.hr * h.s;
  const sk = skinOf(c);
  // la mano toma el color del degradado del cuerpo en su sitio (y su textura)
  const fill = sk.stops ? skinAt(sk, h.x, h.y) : sk.solid;
  const st = `fill="${fill}" stroke="${c.line}" stroke-width="${c.lw}" stroke-linejoin="round"`;
  const groove = (d) => `<path d="${d}" stroke="${c.line}" stroke-width="${R(c.lw * 0.8)}" fill="none" stroke-linecap="round" opacity=".55"/>`;
  let rot = h.ang;
  let shapes = '';
  let grooves = '';
  const mk = (a) => {
    if (h.type === 'open') {
      return `<ellipse cx="${R(-0.78 * hr)}" cy="${R(0.15 * hr)}" rx="${R(0.3 * hr)}" ry="${R(0.52 * hr)}" transform="rotate(-38 ${R(-0.78 * hr)} ${R(0.15 * hr)})" ${a}/><ellipse rx="${R(0.88 * hr)}" ry="${R(1.05 * hr)}" ${a}/>`;
    }
    const fist = `<circle r="${R(0.82 * hr)}" ${a}/>`;
    if (h.type === 'point') return `<rect x="${R(-0.24 * hr)}" y="${R(-1.95 * hr)}" width="${R(0.48 * hr)}" height="${R(1.5 * hr)}" rx="${R(0.24 * hr)}" ${a}/>${fist}`;
    if (h.type === 'thumb' || h.type === 'thumbdown') {
      const up = h.type === 'thumb' ? -1 : 1;
      return `<rect x="${R(-0.22 * hr)}" y="${R(up < 0 ? -1.75 * hr : 0.25 * hr)}" width="${R(0.44 * hr)}" height="${R(1.5 * hr)}" rx="${R(0.22 * hr)}" ${a}/>${fist}`;
    }
    return fist;
  };
  if (h.type === 'open') grooves = groove(`M${R(-0.28 * hr)} ${R(-0.98 * hr)}V${R(-0.45 * hr)}M${R(0.28 * hr)} ${R(-0.98 * hr)}V${R(-0.45 * hr)}`);
  else grooves = groove(`M${R(-0.5 * hr)} ${R(-0.2 * hr)}Q0 ${R(0.15 * hr)} ${R(0.5 * hr)} ${R(-0.2 * hr)}`);
  if (h.type === 'thumb' || h.type === 'thumbdown') rot = 0;
  shapes = mk(st) + (sk.tex ? mk(`fill="${sk.tex}"`) : '');
  // sombra de contacto: solo cae sobre el cuerpo (recortada a él)
  const shadow = sk.clip && hr > 1 ? `<ellipse cx="${R(h.x + hr * 0.12)}" cy="${R(h.y + hr * 0.4)}" rx="${R(hr * 0.95)}" ry="${R(hr * 0.85)}" fill="#000" opacity=".14" clip-path="${sk.clip}"/>` : '';
  return `${shadow}<g transform="translate(${R(h.x)} ${R(h.y)}) scale(${s} 1) rotate(${R(rot)})">${shapes}${grooves}</g>`;
}

/** Brazo de goma: nace dentro del cuerpo (detrás), con su piel, y corta el contorno al salir. */
function armSVG(sh, h, s, c) {
  const dx = h.x - sh.x;
  const dy = h.y - sh.y;
  const d = Math.hypot(dx, dy) || 1;
  const sk = skinOf(c);
  // codo hacia fuera y abajo (brazo de goma)
  const ex = (sh.x + h.x) / 2 + s * d * 0.16;
  const ey = (sh.y + h.y) / 2 + d * 0.12;
  const path = `M${R(sh.x)} ${R(sh.y)}Q${R(ex)} ${R(ey)} ${R(h.x)} ${R(h.y)}`;
  const w = R(c.aw);
  let out = `<path d="${path}" stroke="${c.line}" stroke-width="${R(c.aw + c.lw * 2)}" fill="none" stroke-linecap="round"/><path d="${path}" stroke="${sk.fill}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  if (sk.tex) out += `<path d="${path}" stroke="${sk.tex}" stroke-width="${w}" fill="none"/>`;
  const j = join(sk, [{ d: path, sw: c.aw, sl: c.W * 0.12 }], 'arm');
  return [out + j.shadow, j.mask];
}

function drawHands(c, k, age, o) {
  const dir = o.dir || 1;
  const kk = clamp(k, 0, 1.15);
  let back = '';
  let front = '';
  let mask = '';
  for (const s of [-1, 1]) {
    const sh = shoulder(c, s);
    let h = handPos(o.pose || 'rest', s, age, dir, c);
    if (o.from && o.blend < 1) h = mixHand(handPos(o.from, s, age, dir, c), h, EASE.inOut(o.blend));
    // al aparecer, la mano sale del hombro
    const hh = { ...h, x: lerp(sh.x, h.x, Math.min(1, kk)), y: lerp(sh.y, h.y, Math.min(1, kk)), s: h.s * Math.max(0.01, kk) };
    const [arm, am] = armSVG(sh, hh, s, { ...c, aw: c.aw * Math.min(1, kk) });
    back += arm;
    mask += am;
    front += handSVG(hh, s, c);
  }
  return [back, front, mask];
}

// ───────────────────────────── patas ─────────────────────────────

/**
 * Patas de los bailes: le salen por debajo, el cuerpo sube y los pies se quedan en el suelo,
 * así cada salto, giro o vaivén las estira y dobla (de goma). (side, ageMs, dir) → { dx en
 * anchos de cuerpo desde su sitio, lift en largos de pata, ang de la punta en grados }.
 */
const FOOT_REST = { dx: 0, lift: 0, ang: 0 };
const tap = (a, hz, ph) => Math.max(0, S(a, hz, ph)) ** 1.5;
export const LEG_POSES = {
  rest: () => FOOT_REST,
  // pisa al compás, un pie y el otro
  stomp: (s, a) => ({ dx: 0, lift: 0.38 * tap(a, BEAT / 2, s > 0 ? 0 : Math.PI), ang: -12 * tap(a, BEAT / 2, s > 0 ? 0 : Math.PI) }),
  // running man: un pie adelante y el otro atrás, levantando la rodilla
  shuffle: (s, a) => {
    const ph = s > 0 ? 0 : Math.PI;
    return { dx: 0.14 * S(a, BEAT / 2, ph), lift: 0.45 * tap(a, BEAT / 2, ph + Math.PI / 2), ang: -18 * tap(a, BEAT / 2, ph + Math.PI / 2) };
  },
  // a golpes: levanta un pie recto y lo planta
  robot: (s, a) => {
    const [i, k] = beatStep(a);
    const up = (n) => ((n + (s > 0 ? 0 : 1)) % 2 ? 1 : 0);
    const q = lerp(up(i - 1), up(i), k);
    return { dx: 0.04 * q * s, lift: 0.3 * q, ang: 0 };
  },
  // las caderas van y vienen, los pies quietos y juntos: las patas se cruzan
  floss: (s) => ({ dx: -s * 0.06, lift: 0, ang: 0 }),
  // patada al costado cada cuatro tiempos
  kick: (s, a, dir) => {
    const b = ((a / 1000) * BEAT) % 4;
    const kick = s === dir && b >= 2 && b < 3 ? Math.sin((b - 2) * Math.PI) : 0;
    const bob = s !== dir ? 0 : 0.12 * tap(a, BEAT, 0) * (b < 2 ? 1 : 0);
    return { dx: 0.3 * kick, lift: 0.9 * kick + bob, ang: -40 * kick };
  },
  // se desliza hacia atrás con un talón arriba (alternando)
  moonwalk: (s, a) => {
    const f = ((a / 1000) * (BEAT / 2)) % 1;
    const which = Math.floor((a / 1000) * BEAT) % 2 ? 1 : -1;
    const heel = s === which ? 0.22 : 0;
    return { dx: -0.06 * Math.sin(f * TAU), lift: heel, ang: s === which ? 35 : 0 };
  },
  // marca el tiempo con la punta del pie de adelante
  disco: (s, a, dir) => (s === dir ? { dx: 0.12, lift: 0.22 * tap(a, BEAT, 0), ang: -25 * tap(a, BEAT, 0) } : { dx: -0.03, lift: 0, ang: 0 }),
  // bien abiertas y firmes
  wide: (s) => ({ dx: s * 0.1, lift: 0, ang: 0 }),
  // en una pata: la otra recogida a la altura de la rodilla
  garza: (s, a, dir) => (s === dir ? { dx: -0.06, lift: 0.85, ang: -70 } : { dx: 0.02, lift: 0, ang: 0 }),
  // pasos cortos y rápidos, cruzando y abriendo
  deal: (s, a) => {
    const ph = s > 0 ? 0 : Math.PI;
    return { dx: 0.08 * snap(S(a, BEAT, ph)), lift: 0.25 * tap(a, BEAT * 2, ph), ang: -10 * tap(a, BEAT * 2, ph) };
  },
  // corre, salta con las dos y cae abierto
  siu: (s, a) => {
    const f = (a % 4000) / 4000;
    if (f < 0.2) return { dx: 0.1 * S(a, BEAT * 2, s > 0 ? 0 : Math.PI), lift: 0.4 * tap(a, BEAT * 2, s > 0 ? 0 : Math.PI), ang: -15 };
    if (f < 0.4) return { dx: 0, lift: 0.5 * Math.sin(Math.PI * ((f - 0.2) / 0.2)), ang: -20 };
    return { dx: s * 0.14, lift: 0, ang: 0 };
  },
};

/**
 * Patas en coordenadas del mundo (no del cuerpo: los pies no siguen al cuerpo, se quedan en el
 * suelo). c: { hips: [{x,y} izq, der], floor, cx, W, LL (largo), hr, aw, fill, line, lw }.
 */
export function drawLegs(c, k, age, o = {}) {
  if (k <= 0.01) return '';
  const dir = o.dir || 1;
  const fn = LEG_POSES[o.pose] || LEG_POSES.stomp;
  let out = '';
  for (const s of [-1, 1]) {
    const p = fn(s, age, dir);
    const hip = c.hips[s > 0 ? 1 : 0];
    const fr = c.hr * 0.62;
    const ax = c.cx + s * c.W * 0.17 + p.dx * c.W;
    const ay = c.floor - fr * 0.9 - p.lift * c.LL;
    const dx = ax - hip.x;
    const dy = ay - hip.y;
    const d = Math.hypot(dx, dy) || 1;
    // rodilla de goma: cuanto más corta queda la pata, más se dobla hacia fuera
    const bend = Math.sqrt(Math.max(0, c.LL * c.LL - d * d)) * 0.55 + d * 0.06;
    const kx = (hip.x + ax) / 2 + s * bend;
    const ky = (hip.y + ay) / 2;
    const path = `M${R(hip.x)} ${R(hip.y)}Q${R(kx)} ${R(ky)} ${R(ax)} ${R(ay)}`;
    const w = c.aw * 1.15 * Math.min(1, k);
    out += `<path d="${path}" stroke="${c.line}" stroke-width="${R(w + c.lw * 2)}" fill="none" stroke-linecap="round"/><path d="${path}" stroke="${c.fill}" stroke-width="${R(w)}" fill="none" stroke-linecap="round"/>`;
    // pie: zapatito redondo con la punta hacia fuera
    const sc = Math.max(0.01, Math.min(1, k));
    out += `<g transform="translate(${R(ax)} ${R(ay)}) scale(${R(s * sc)} ${R(sc)}) rotate(${R(p.ang)})"><ellipse cx="${R(c.hr * 0.45)}" cy="${R(fr * 0.35)}" rx="${R(c.hr * 1.05)}" ry="${R(fr)}" fill="${c.fill}" stroke="${c.line}" stroke-width="${c.lw}"/><path d="M${R(-c.hr * 0.45)} ${R(fr * 0.95)}H${R(c.hr * 1.3)}" stroke="${c.line}" stroke-width="${R(c.lw * 0.9)}" stroke-linecap="round" opacity=".5"/><ellipse cx="${R(c.hr * 0.85)}" cy="${R(-fr * 0.05)}" rx="${R(c.hr * 0.28)}" ry="${R(fr * 0.28)}" fill="#fff" opacity=".35"/></g>`;
  }
  return out;
}

// ───────────────────────────── alas, pinchos, cuernos ─────────────────────────────

const WING = 'M0 0C18 -36 64 -56 96 -44C88 -32 82 -28 72 -25C74 -14 66 -8 54 -8C54 3 42 8 30 6C20 11 7 9 0 0Z';
const WING_LINES = 'M8 -4C30 -20 52 -30 76 -36M10 0C28 -10 42 -16 58 -20';
/** Aplica f(x, y) a cada par de coordenadas de un path absoluto (M/C/L/Q). */
const mapPath = (d, f) => d.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (_, a, b) => f(+a, +b).map(R).join(' '));

function drawWings(c, k, age, o) {
  const fast = o.flap === 'fast';
  const amp = o.still ? 0 : fast ? 32 : 11;
  const hz = fast ? 3.2 : 0.9;
  const sc = (c.W / 120) * 0.95 * Math.max(0.01, k);
  const sk = skinOf(c);
  let out = '';
  const shapes = [];
  for (const s of [-1, 1]) {
    const p = c.pts;
    const [a, b] = s > 0 ? [p[3], p[4]] : [p[13], p[12]];
    const x = lerp(lerp(a[0], b[0], 0.5), c.cx, 0.16);
    const y = lerp(a[1], b[1], 0.5);
    const flap = ((-12 + S(age, hz) * amp) * Math.PI) / 180;
    const cs = Math.cos(flap) * sc;
    const sn = Math.sin(flap) * sc;
    // en coordenadas del cuerpo (no en un <g> transformado): así comparte degradado y textura
    const f = (px, py) => [x + s * (px * cs - py * sn), y + px * sn + py * cs];
    const d = mapPath(WING, f);
    shapes.push({ d });
    out += skinPaths(sk, d, { extra: `<path d="${d}" fill="#fff" fill-opacity=".14"/>` });
    out += `<path d="${mapPath(WING_LINES, f)}" stroke="${sk.line || c.line}" stroke-width="${R(c.lw * 0.8)}" fill="none" stroke-linecap="round" opacity=".45"/>`;
  }
  const j = join(sk, shapes, 'wg');
  return [out + j.shadow, '', j.mask];
}

/** Normal exterior del punto i del contorno (los puntos van en sentido horario desde arriba). */
function normalAt(pts, i) {
  const N = pts.length;
  const a = pts[(i - 1 + N) % N];
  const b = pts[(i + 1) % N];
  const tx = b[0] - a[0];
  const ty = b[1] - a[1];
  const l = Math.hypot(tx, ty) || 1;
  return [ty / l, -tx / l, tx / l, ty / l];
}

function drawSpikes(c, k, age, o) {
  const pts = c.pts;
  const sk = skinOf(c);
  let d = '';
  for (let i = 0; i < BODY_POINTS; i++) {
    if (i >= 6 && i <= 10) continue; // abajo no: apoya en el suelo
    const order = Math.min(i, BODY_POINTS - i);
    const ki = EASE.backOut(clamp(k * 1.5 - order * 0.07));
    if (ki <= 0.01) continue;
    const [nx, ny, tx, ty] = normalAt(pts, i);
    const [x, y] = pts[i];
    const len = c.W * (0.17 + (order % 2) * 0.05) * ki * (1 + (o.still ? 0 : S(age, 2.5, i) * 0.06));
    const hb = c.W * 0.075;
    // base hundida en el cuerpo y ensanchada (filete): los flancos cóncavos se funden con él
    const sink = Math.max(4, hb * 0.8);
    const fl = hb * (0.6 + 0.9 * Math.min(1, ki));
    const bx = x - nx * sink;
    const by = y - ny * sink;
    const qx = x + nx * len * 0.3;
    const qy = y + ny * len * 0.3;
    const qw = hb * 0.42;
    d += `M${R(bx - tx * fl)} ${R(by - ty * fl)}Q${R(qx - tx * qw)} ${R(qy - ty * qw)} ${R(x + nx * len)} ${R(y + ny * len)}Q${R(qx + tx * qw)} ${R(qy + ty * qw)} ${R(bx + tx * fl)} ${R(by + ty * fl)}Z`;
  }
  if (!d) return ['', '', ''];
  const j = join(sk, [{ d }], 'sp');
  return [skinPaths(sk, d) + j.shadow, '', j.mask];
}

function drawHorns(c, k, age, o) {
  const pts = c.pts;
  const sk = skinOf(c);
  const h = c.H * 0.24 * EASE.backOut(clamp(k));
  const w = c.W * 0.075;
  let d = '';
  let rings = '';
  for (const s of [-1, 1]) {
    const [x, y] = pts[s > 0 ? 1 : 15];
    const xx = lerp(x, c.cx, 0.1);
    const yb = y + Math.max(6, w * 1.3);
    const tip = [xx + s * w * 1.1, y - h];
    // base acampanada y hundida en la cabeza
    d += `M${R(xx - w * 1.7)} ${R(yb)}Q${R(xx - w * 1.05)} ${R(y)} ${R(xx - w * 0.85)} ${R(y - h * 0.12)}Q${R(xx - w * 0.4)} ${R(y - h * 0.55)} ${R(tip[0])} ${R(tip[1])}Q${R(xx + w * 0.3)} ${R(y - h * 0.4)} ${R(xx + w * 0.85)} ${R(y - h * 0.1)}Q${R(xx + w * 1.05)} ${R(y)} ${R(xx + w * 1.7)} ${R(yb)}Z`;
    // anillos del cuerno
    for (const t of [0.28, 0.5]) {
      const l = [lerp(xx - w * 0.85, tip[0], t), lerp(y - h * 0.12, tip[1], t)];
      const r = [lerp(xx + w * 0.85, tip[0], t), lerp(y - h * 0.1, tip[1], t)];
      rings += `M${R(l[0])} ${R(l[1])}Q${R((l[0] + r[0]) / 2)} ${R((l[1] + r[1]) / 2 + w * 0.35)} ${R(r[0])} ${R(r[1])}`;
    }
  }
  const furry = ['fur', 'fuzz', 'feathers'].includes(sk.texture);
  const extra = h > 2 ? `<path d="${rings}" fill="none" stroke="${sk.line || c.line}" stroke-width="${R(c.lw * 0.7)}" stroke-linecap="round" opacity=".35"/>` : '';
  const j = join(sk, [{ d }], 'hn');
  return [skinPaths(sk, d, { fill: o.color, tex: !furry && !o.color, extra }) + j.shadow, '', j.mask];
}

// ───────────────────────────── deformaciones del contorno ─────────────────────────────

function scaleAbout(pts, ox, oy, sx, sy) {
  return pts.map(([x, y]) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);
}

/** Métricas de un contorno (para deformar sin depender de layout). */
export function ptsBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, bottom: y1 };
}

/**
 * Metamorfosis. Las de dibujo devuelven [detrás, delante, máscara] (la máscara, siluetas en
 * negro que recortan el contorno del cuerpo donde nace la pieza); las de deformación transforman
 * los 16 puntos del contorno (y con él cara y accesorios). `room`: cuánto alejar el encuadre.
 */
export const MORPHS = {
  spikes: { room: 1.32, draw: drawSpikes },
  wings: { room: 1.6, draw: drawWings },
  hands: { room: 1.35, draw: drawHands },
  horns: { room: 1.2, draw: drawHorns },
  puff: { room: 1.2, deform: (pts, k, age, b) => scaleAbout(pts, b.cx, b.bottom, 1 + 0.2 * k, 1 + 0.14 * k) },
  squish: { room: 1.15, deform: (pts, k, age, b) => scaleAbout(pts, b.cx, b.bottom, 1 + 0.22 * k, 1 - 0.22 * k) },
  stretch: { room: 1.25, deform: (pts, k, age, b) => scaleAbout(pts, b.cx, b.bottom, 1 - 0.12 * k, 1 + 0.26 * k) },
  melt: {
    room: 1.3,
    deform: (pts, k, age, b, still) =>
      pts.map(([x, y], i) => {
        const ny = clamp((y - b.y) / (b.h || 1));
        const drip = ny > 0.6 && !still ? Math.sin(i * 2.1 + age / 300) * 3 * k : 0;
        return [b.cx + (x - b.cx) * (1 + 0.45 * k * ny * ny), b.bottom - (b.bottom - y) * (1 - 0.38 * k) + drip];
      }),
  },
  jelly: {
    room: 1.12,
    deform: (pts, k, age, b, still) => {
      if (still) return pts;
      return pts.map((p, i) => {
        const [nx, ny] = normalAt(pts, i);
        const a = b.w * 0.05 * k * Math.sin((age / 1000) * TAU * 2.6 + i * 1.3);
        return [p[0] + nx * a, p[1] + ny * a];
      });
    },
  },
};

const SHAPE_PTS = Object.fromEntries(SHAPES.map((s) => [s.id, s.points]));
/** Puntos de una forma del catálogo (para «shape:<id>»). */
export const shapePoints = (id) => SHAPE_PTS[id] || null;

// ───────────────────────────── efectos ─────────────────────────────

const star4 = (r) => `M0 ${R(-r)}Q0 0 ${R(r)} 0Q0 0 0 ${R(r)}Q0 0 ${R(-r)} 0Q0 0 0 ${R(-r)}Z`;
const heart = (r) => `M0 ${R(r * 0.9)}C${R(-r * 1.4)} ${R(-r * 0.1)} ${R(-r * 0.7)} ${R(-r * 1.05)} 0 ${R(-r * 0.35)}C${R(r * 0.7)} ${R(-r * 1.05)} ${R(r * 1.4)} ${R(-r * 0.1)} 0 ${R(r * 0.9)}Z`;
const drop = (r) => `M0 ${R(-1.4 * r)}C${R(0.9 * r)} ${R(-0.2 * r)} ${R(r)} ${R(0.5 * r)} 0 ${R(r)}C${R(-r)} ${R(0.5 * r)} ${R(-0.9 * r)} ${R(-0.2 * r)} 0 ${R(-1.4 * r)}Z`;
const pop = (q, a = 0.2) => EASE.backOut(clamp(q / a));
const fade = (q, b = 0.25) => clamp((1 - q) / b);
const at = (x, y, inner, extra = '') => `<g transform="translate(${R(x)} ${R(y)})${extra}">${inner}</g>`;

/** Efectos: { ms, loop?, layer: 'face'|'front', draw(c, p 0..1, ageMs, o, rnd) }. */
export const EFFECTS = {
  // farmeo de aura: un halo que sube en llamitas violetas y el «+aura» flotando
  aura: {
    ms: 2600,
    draw: (c, p, age, o, rnd) => {
      const e = Math.min(clamp(p / 0.15), fade(p, 0.3));
      let out = `<ellipse cx="${R(c.cx)}" cy="${R(c.top + c.H * 0.55)}" rx="${R(c.W * 0.62)}" ry="${R(c.H * 0.6)}" fill="none" stroke="#a78bfa" stroke-width="${R(c.W * 0.03)}" opacity="${R(0.35 * e)}"/>`;
      for (let i = 0; i < 7; i++) {
        const a = rnd() * TAU;
        const q = ((p * 1.6 + i / 7) % 1);
        const x = c.cx + Math.cos(a) * c.W * (0.45 + 0.1 * rnd());
        const y = c.top + c.H * (0.9 - 0.9 * q);
        const sz = c.W * 0.05 * Math.sin(Math.PI * q);
        if (sz > 0.3) out += at(x, y, `<path d="M0 ${R(-sz * 2)}Q${R(sz)} 0 0 ${R(sz)}Q${R(-sz)} 0 0 ${R(-sz * 2)}Z" fill="#c4b5fd" opacity="${R(0.85 * e)}"/>`);
      }
      const k = c.W / 120;
      const q = clamp(p / 0.8);
      // el «+N aura» solo si te lo pasan (o.aura): el pet lo muestra él, encima del ot en 2D y en 3D
      if (typeof o.aura === 'number') out += `<g opacity="${R(Math.min(clamp(p / 0.1), fade(p, 0.35)))}">${at(c.cx + c.dir * c.W * 0.5, c.top - c.H * 0.1 - c.H * 0.25 * EASE.out(q), `<text text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="15" fill="#7c3aed" stroke="#fff" stroke-width="3" paint-order="stroke">+${o.aura.toLocaleString('en-US')} aura</text>`, ` scale(${R(k)})`)}</g>`;
      return out;
    },
  },
  sparkles: {
    ms: 1300,
    draw: (c, p, age, o, rnd) => {
      let out = '';
      for (let i = 0; i < 6; i++) {
        const a = rnd() * TAU;
        const d = 0.55 + rnd() * 0.25;
        const q = clamp((p - i * 0.08) / 0.5);
        const sz = c.W * 0.07 * (0.6 + rnd() * 0.6) * Math.sin(Math.PI * q);
        if (sz <= 0.2) continue;
        out += at(c.cx + Math.cos(a) * c.W * d, c.top + c.H * 0.45 + Math.sin(a) * c.H * d * 0.85, `<path d="${star4(sz)}" fill="#ffd84d" stroke="#f59e0b" stroke-width=".8"/><circle r="${R(sz * 0.22)}" fill="#fff"/>`, ` rotate(${R(age * 0.08)})`);
      }
      return out;
    },
  },
  sweat: {
    ms: 1800,
    draw: (c, p) => {
      const s = (c.W / 120) * 6 * pop(p, 0.15);
      const g = at(c.cx + c.dir * c.W * 0.4, c.top + c.H * (0.2 + 0.08 * EASE.inOut(p)), `<path d="${drop(s)}" fill="#8fd3ff" stroke="#3b9ae0" stroke-width="1.2"/><ellipse cx="${R(-s * 0.3)}" cy="${R(-s * 0.1)}" rx="${R(s * 0.18)}" ry="${R(s * 0.32)}" fill="#fff" opacity=".8"/>`, ` rotate(${R(c.dir * 12)})`);
      return `<g opacity="${R(fade(p, 0.25))}">${g}</g>`;
    },
  },
  blush: {
    ms: 2000,
    layer: 'face',
    draw: (c, p) => {
      const e = Math.min(clamp(p / 0.15), fade(p, 0.25));
      return [-1, 1]
        .map((s) => {
          const x = c.cx + s * (c.sp + c.r * 0.35);
          const y = c.eyeY + c.r * 1.8;
          const lines = [0, 1, 2].map((i) => `<path d="M${R(x + (i - 1) * c.r * 0.4)} ${R(y + c.r * 0.25)}l${R(c.r * 0.22)} ${R(-c.r * 0.45)}" stroke="#ff3b6e" stroke-width="${R(c.r * 0.1)}" stroke-linecap="round"/>`).join('');
          return `<g opacity="${R(e)}"><ellipse cx="${R(x)}" cy="${R(y)}" rx="${R(c.r * 0.95)}" ry="${R(c.r * 0.5)}" fill="#ff5d8f" opacity=".55"/>${lines}</g>`;
        })
        .join('');
    },
  },
  hearts: {
    ms: 1900,
    draw: (c, p, age, o, rnd) => {
      let out = '';
      for (let i = 0; i < 3; i++) {
        const q = clamp((p - i * 0.15) / 0.7);
        if (q <= 0) continue;
        const sz = c.W * (0.07 + rnd() * 0.03) * pop(q, 0.2);
        const x = c.cx + (i - 1) * c.W * 0.28 + Math.sin(q * TAU + i) * c.W * 0.05;
        const y = c.top + c.H * 0.12 - c.H * 0.5 * EASE.out(q);
        out += `<g opacity="${R(fade(q, 0.3))}">${at(x, y, `<path d="${heart(sz)}" fill="#ff4d7a" stroke="#c81e4f" stroke-width="1"/>`)}</g>`;
      }
      return out;
    },
  },
  zzz: {
    ms: 2600,
    loop: true,
    draw: (c, p) => {
      let out = '';
      for (let i = 0; i < 3; i++) {
        const q = (p + i / 3) % 1;
        const s = (c.W / 120) * (4 + q * 6);
        const x = c.cx + c.dir * (c.W * 0.32 + c.W * 0.25 * q);
        const y = c.top + c.H * 0.12 - c.H * 0.45 * q;
        const d = `M${R(-s)} ${R(-s)}H${R(s)}L${R(-s)} ${R(s)}H${R(s)}`;
        out += `<g opacity="${R(Math.sin(Math.PI * q))}">${at(x, y, `<path d="${d}" stroke="#fff" stroke-width="${R(s * 0.75)}" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity=".7"/><path d="${d}" stroke="#5b6ee1" stroke-width="${R(s * 0.38)}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`)}</g>`;
      }
      return out;
    },
  },
  exclaim: {
    ms: 1100,
    draw: (c, p, age) => {
      const k = (c.W / 120) * pop(p, 0.18);
      const w = Math.sin(age / 60) * 6 * fade(p, 0.6);
      const g = `<path d="M-4 -24h8l-1.6 18h-4.8z" fill="#ff3b30" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cy="3" r="3.6" fill="#ff3b30" stroke="#fff" stroke-width="2"/><path d="M-12 -22l-5 -5M12 -22l5 -5M-15 -8h-7M15 -8h7" stroke="#ff9f0a" stroke-width="2.4" stroke-linecap="round"/>`;
      return `<g opacity="${R(fade(p, 0.2))}">${at(c.cx + c.dir * c.W * 0.36, c.top - c.H * 0.02, g, ` rotate(${R(w)}) scale(${R(k)})`)}</g>`;
    },
  },
  question: {
    ms: 1500,
    draw: (c, p, age) => {
      const k = (c.W / 120) * pop(p, 0.2);
      const g = `<path d="M-6 -16Q-6 -24 1 -24Q8 -24 8 -17Q8 -12 2 -9Q0 -8 0 -3" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M-6 -16Q-6 -24 1 -24Q8 -24 8 -17Q8 -12 2 -9Q0 -8 0 -3" stroke="#4f7cff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cy="4" r="3.4" fill="#4f7cff" stroke="#fff" stroke-width="1.6"/>`;
      return `<g opacity="${R(fade(p, 0.2))}">${at(c.cx + c.dir * c.W * 0.4, c.top + Math.sin(age / 200) * 2, g, ` rotate(${R(c.dir * 12)}) scale(${R(k)})`)}</g>`;
    },
  },
  anger: {
    ms: 1300,
    draw: (c, p, age) => {
      const k = (c.W / 120) * pop(p, 0.15) * (1 + 0.12 * Math.sin(age / 70));
      let d = '';
      for (let q = 0; q < 4; q++) {
        const [sx, sy] = [[1, -1], [1, 1], [-1, 1], [-1, -1]][q];
        d += `M${2.5 * sx} ${9 * sy}Q${2.5 * sx} ${2.5 * sy} ${9 * sx} ${2.5 * sy}`;
      }
      return `<g opacity="${R(fade(p, 0.25))}">${at(c.cx + c.dir * c.W * 0.33, c.top + c.H * 0.14, `<path d="${d}" stroke="#fff" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#ff2d2d" stroke-width="3" fill="none" stroke-linecap="round"/>`, ` scale(${R(k)})`)}</g>`;
    },
  },
  steam: {
    ms: 1500,
    draw: (c, p) => {
      let out = '';
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const q = clamp((p - i * 0.15) / 0.65);
          if (q <= 0 || q >= 1) continue;
          const r = c.W * (0.04 + 0.07 * q);
          out += `<circle cx="${R(c.cx + s * (c.W * 0.28 + c.W * 0.18 * q))}" cy="${R(c.top + c.H * 0.12 - c.H * 0.38 * q)}" r="${R(r)}" fill="#eef0f3" stroke="#9ca3af" stroke-width="1" opacity="${R((1 - q) * 0.85)}"/>`;
        }
      }
      return out;
    },
  },
  confetti: {
    ms: 1900,
    draw: (c, p, age, o, rnd) => {
      const cols = ['#ff4d7a', '#ffd84d', '#4dd2ff', '#7cff6b', '#b18cff', '#ff9f43'];
      const x0 = c.cx;
      const y0 = c.top + c.H * 0.05;
      const tt = p * 1.9;
      let out = '';
      for (let i = 0; i < 22; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
        const v = c.H * (0.9 + rnd() * 0.8);
        const x = x0 + Math.cos(a) * v * tt * 0.7;
        const y = y0 + Math.sin(a) * v * tt + c.H * 1.1 * tt * tt;
        const w = c.W * 0.035;
        out += `<rect x="${R(x - w / 2)}" y="${R(y - w / 4)}" width="${R(w)}" height="${R(w / 2)}" fill="${cols[i % cols.length]}" transform="rotate(${R(age * (0.3 + rnd() * 0.5) + i * 40)} ${R(x)} ${R(y)})"/>`;
      }
      return `<g opacity="${R(fade(p, 0.3))}">${out}</g>`;
    },
  },
  tears: {
    ms: 2200,
    layer: 'face',
    draw: (c, p) => {
      let out = '';
      for (const s of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          const q = ((p * 2 + i * 0.5) % 1) * (p < 0.9 ? 1 : 0);
          if (q <= 0) continue;
          const sz = c.r * 0.28;
          out += `<g opacity="${R(1 - q)}">${at(c.cx + s * (c.sp + c.r * 0.55), c.eyeY + c.r * 0.7 + c.H * 0.3 * q * q, `<path d="${drop(sz)}" fill="#8fd3ff" stroke="#3b9ae0" stroke-width=".8"/>`)}</g>`;
        }
      }
      return out;
    },
  },
  thought: {
    ms: 2200,
    draw: (c, p, age) => {
      const e = fade(p, 0.15);
      const k = c.W / 120;
      const bx = c.cx + c.dir * c.W * 0.55;
      const by = c.top - c.H * 0.2;
      const pp = (q) => pop(clamp((p - q) / 0.4), 0.5);
      const st = 'fill="#fff" stroke="#cbd5e1" stroke-width="1.5"';
      let out = `<circle cx="${R(c.cx + c.dir * c.W * 0.3)}" cy="${R(c.top + c.H * 0.03)}" r="${R(3 * k * pp(0))}" ${st}/>`;
      out += `<circle cx="${R(c.cx + c.dir * c.W * 0.4)}" cy="${R(c.top - c.H * 0.07)}" r="${R(5 * k * pp(0.08))}" ${st}/>`;
      const b = pp(0.16);
      out += at(bx, by, `<path d="M-20 4C-28 4 -28 -8 -19 -9C-19 -18 -6 -20 -2 -13C2 -21 16 -19 16 -10C26 -11 28 3 18 4C16 11 -16 11 -20 4Z" ${st}/>${[-8, 0, 8].map((x, i) => `<circle cx="${x}" cy="-3" r="2.4" fill="#64748b" opacity="${R(0.35 + 0.65 * Math.max(0, Math.sin(age / 180 - i * 0.9)))}"/>`).join('')}`, ` scale(${R(k * b)})`);
      return `<g opacity="${R(e)}">${out}</g>`;
    },
  },
  notes: {
    ms: 2200,
    draw: (c, p) => {
      let out = '';
      const k = c.W / 120;
      for (let i = 0; i < 3; i++) {
        const q = clamp((p - i * 0.18) / 0.65);
        if (q <= 0 || q >= 1) continue;
        const s = i % 2 ? -1 : 1;
        const x = c.cx + s * c.W * (0.42 + 0.1 * q) + Math.sin(q * TAU) * 4;
        const y = c.top + c.H * 0.25 - c.H * 0.5 * q;
        out += `<g opacity="${R(Math.sin(Math.PI * q))}">${at(x, y, '<ellipse cx="-3" cy="6" rx="4.2" ry="3.2" transform="rotate(-20 -3 6)" fill="#8b5cf6"/><path d="M0.8 5V-12Q5 -9 8 -6" stroke="#8b5cf6" stroke-width="2" fill="none" stroke-linecap="round"/>', ` scale(${R(k)}) rotate(${R(s * 10)})`)}</g>`;
      }
      return out;
    },
  },
  sneeze: {
    ms: 700,
    draw: (c, p, age, o, rnd) => {
      let out = '';
      const q = EASE.out(p);
      for (let i = 0; i < 10; i++) {
        const a = (rnd() - 0.5) * 1.1;
        const d = c.W * (0.15 + rnd() * 0.45) * q;
        const x = c.cx + c.dir * (c.mw * 0.8 + Math.cos(a) * d);
        const y = c.mouthY + Math.sin(a) * d + c.H * 0.15 * q * q;
        out += `<circle cx="${R(x)}" cy="${R(y)}" r="${R(c.W * (0.012 + rnd() * 0.015))}" fill="#9fd8ff" stroke="#3b9ae0" stroke-width=".6"/>`;
      }
      return `<g opacity="${R(1 - p)}">${out}</g>`;
    },
  },
  bubble: {
    ms: 1000,
    draw: (c, p) => {
      const q = EASE.out(clamp(p / 0.85));
      const burst = clamp((p - 0.85) / 0.15);
      const r = c.W * (0.03 + 0.05 * q) * (1 + burst * 0.4);
      const x = c.cx + c.dir * c.mw * 0.5 + Math.sin(p * 9) * 3;
      const y = c.mouthY - c.H * 0.3 * q;
      const lines = burst > 0 ? [0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * TAU; return `<path d="M${R(Math.cos(a) * r * 1.1)} ${R(Math.sin(a) * r * 1.1)}L${R(Math.cos(a) * r * 1.5)} ${R(Math.sin(a) * r * 1.5)}" stroke="#7cc4ff" stroke-width="1.4" stroke-linecap="round"/>`; }).join('') : '';
      return `<g opacity="${R(1 - burst)}">${at(x, y, `<circle r="${R(r)}" fill="#bfe9ff" fill-opacity=".45" stroke="#7cc4ff" stroke-width="1.4"/><ellipse cx="${R(-r * 0.35)}" cy="${R(-r * 0.35)}" rx="${R(r * 0.22)}" ry="${R(r * 0.14)}" transform="rotate(-40 ${R(-r * 0.35)} ${R(-r * 0.35)})" fill="#fff"/>${lines}`)}</g>`;
    },
  },
  dizzy: {
    ms: 1600,
    loop: true,
    draw: (c, p) => {
      let out = '';
      for (let i = 0; i < 3; i++) {
        const a = p * TAU + (i * TAU) / 3;
        const z = Math.sin(a);
        const s = (c.W / 120) * (5 + z * 1.5);
        out += `<g opacity="${R(0.65 + z * 0.35)}">${at(c.cx + Math.cos(a) * c.W * 0.4, c.top + c.H * 0.02 + z * c.H * 0.07, `<path d="${star4(s)}" fill="#ffd84d" stroke="#f59e0b" stroke-width="1"/>`)}</g>`;
      }
      return out;
    },
  },
};

// ───────────────────────────── visemas (lip-sync) ─────────────────────────────

/**
 * Formas de boca: open = apertura 0..1, w = anchura relativa (≈1 normal, >1 estirada, <1 redonda).
 * X silencio · A abierta · E/I estiradas · O/U redondas · M labios cerrados (m, b, p)
 * · F labio-dental (f, v) · S sibilantes · C resto de consonantes.
 */
export const VISEMES = Object.freeze({
  X: { open: 0, w: 1 },
  A: { open: 0.85, w: 1.05 },
  E: { open: 0.5, w: 1.18 },
  I: { open: 0.3, w: 1.25 },
  O: { open: 0.7, w: 0.72 },
  U: { open: 0.4, w: 0.6 },
  M: { open: 0, w: 0.92 },
  F: { open: 0.15, w: 1.05 },
  S: { open: 0.2, w: 1.15 },
  C: { open: 0.3, w: 1 },
});

const LETTER = { a: 'A', e: 'E', i: 'I', y: 'I', o: 'O', u: 'U', w: 'U', m: 'M', b: 'M', p: 'M', f: 'F', v: 'F', s: 'S', z: 'S', x: 'S', c: 'S', j: 'S', h: '' };
const WEIGHT = { A: 1, E: 1, I: 0.9, O: 1, U: 0.9, M: 0.7, F: 0.6, S: 0.6, C: 0.55 };

/**
 * Texto → secuencia de visemas [{ v, w (peso ≈ duración relativa), c (índice del carácter) }].
 * Funciona con español, inglés y portugués de forma aproximada (letra a letra, sin fonética).
 */
export function textToVisemes(text) {
  const out = [];
  const s = String(text ?? '');
  const push = (v, w, c) => {
    const last = out[out.length - 1];
    if (last && last.v === v && (v === 'X' || v === 'C' || v === 'S')) last.w = Math.min(last.w + w * 0.6, 3);
    else out.push({ v, w, c });
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i].normalize('NFD')[0].toLowerCase();
    if (/\p{L}/u.test(ch)) {
      // «qu»/«gu» + e/i: la u no suena
      if (ch === 'u' && /[qg]/i.test(s[i - 1] || '') && /[eiéí]/i.test(s[i + 1] || '')) continue;
      let v = LETTER[ch];
      if (v === '') continue; // h muda
      if (v === undefined) v = 'C';
      push(v, WEIGHT[v], i);
    } else if (/\d/.test(ch)) {
      push('C', 0.6, i);
      push('A', 0.6, i);
    }
    else if (/[.!?…;:]/.test(ch)) push('X', /[;:]/.test(ch) ? 1.6 : 2.6, i);
    else if (/[,—–-]/.test(ch)) push('X', 1.6, i);
    else if (/\s/.test(ch)) push('X', 0.35, i);
  }
  while (out.length && out[out.length - 1].v === 'X') out.pop();
  while (out.length && out[0].v === 'X') out.shift();
  return out;
}

/** Secuencia genérica de sílabas para hablar «sin texto» durante `ms` (determinista con `seed`). */
export function babbleVisemes(ms, seed = 7) {
  const rnd = seeded(seed);
  const vowels = ['A', 'E', 'O', 'A', 'I', 'U', 'E', 'A'];
  const cons = ['M', 'C', 'S', 'C', 'F', 'C'];
  const out = [];
  let t = 0;
  while (t < ms) {
    out.push({ v: cons[Math.floor(rnd() * cons.length)], w: 0.55, c: -1 });
    out.push({ v: vowels[Math.floor(rnd() * vowels.length)], w: 0.8 + rnd() * 0.6, c: -1 });
    if (rnd() < 0.12) out.push({ v: 'X', w: 0.8, c: -1 });
    t += 150;
  }
  return out;
}
