/**
 * Personaje 2D paramétrico de 7ots (estilo Pou): una silueta de 16 puntos que se deforma
 * arrastrando, más ojos, cejas, boca, mejillas, patrón, acabado y accesorios de catálogo.
 *
 *   const spec = normalizeCharacter({ preset: 'pirate' });
 *   el.innerHTML = renderCharacter(spec);               // SVG estático (también en Node)
 *   const ch = createCharacter(el, spec);               // vivo: respira, parpadea, mira, habla
 *   ch.mood('happy');                                   // el ánimo se interpola (y lanza su efecto)
 *   ch.gesture('celebrate');                            // CHARACTER_GESTURES (+ alias de TalkingHead)
 *   ch.morph('wings', { ms: 3000 });                    // CHARACTER_MORPHS: alas, manos, pinchos, 'shape:heart'…
 *   ch.effect('hearts');                                // CHARACTER_EFFECTS: brillos, sudor, zzz, «!»…
 *   ch.speak('Hola, ¿qué tal?');                        // lip-sync por visemas a partir del texto
 *   const stop = ch.lipsync(analyserNode);              // …o del audio real (Web Audio)
 *   ch.mouth(0.7); ch.lookAt(0.5, -0.2); ch.update(otroSpec);
 *
 * La piel (textura de superficie: pelo, escamas, plumas…, `texture`) y la unión de las piezas
 * que crecen del cuerpo (pinchos, alas, brazos, orejas…) están en skin.js.
 *
 * Gestos, metamorfosis, efectos y visemas están en motion.js. Todo es temporal salvo que se
 * pida { hold: true }, y con prefers-reduced-motion el cuerpo no se mueve.
 *
 * Estilos artísticos (`style`: ukiyo-e, plastilina, vitral, Bauhaus, manuscrito, glitch, tinta)
 * en styles.js: remapean la paleta, añaden un filtro y una capa al cuerpo y un fondo a juego.
 *
 * Todo el SVG sale de catálogos propios; lo que llega del usuario se reduce a ids de catálogo,
 * colores #rrggbb y números acotados (normalizeCharacter), así que es seguro inyectarlo. Los mods
 * (`mods`, mods.js) traen SVG propio: se reescribe con una lista cerrada de etiquetas y atributos.
 */

import {
  BODY_POINTS, SHAPES, EYES, BROWS, MOUTHS, CHEEKS, PATTERNS, FINISHES, TEXTURES, ACCESSORIES, PRESETS, CATALOG_V1, shade, luminance,
} from './parts.js';
import { renderSkin, joinSVG } from './skin.js';
import { normalizeMods, applyMods, modPart } from './mods.js';
import { STYLE_IDS, stylizeSpec, styleLayers, styleSeed, backdropIn, backdropCSS } from './styles.js';
import { translator } from '../i18n/index.js';
import {
  GESTURES, GESTURE_ALIAS, MORPHS, EFFECTS, VISEMES, POSE0, EASE, clamp, lerp, approach, seeded,
  shapePoints, ptsBox, textToVisemes, babbleVisemes, drawLegs,
} from './motion.js';

export const CHARACTER_MOODS = ['neutral', 'happy', 'angry', 'sad', 'fear', 'disgust', 'love', 'sleep', 'surprised'];
export const CHARACTER_GESTURES = Object.keys(GESTURES);
/** Metamorfosis temporales del cuerpo (más 'shape:<id>' con cualquier forma de SHAPES). */
export const CHARACTER_MORPHS = Object.keys(MORPHS);
/** Efectos (partículas y símbolos) que acompañan a gestos y ánimos. */
export const CHARACTER_EFFECTS = Object.keys(EFFECTS);
export { VISEMES, textToVisemes, GESTURE_ALIAS as CHARACTER_GESTURE_ALIAS };

const MOOD = {
  neutral: { curve: 0.15, tilt: 0 },
  happy: { curve: 0.85, tilt: -0.25, squash: 0.85 },
  angry: { curve: -0.45, tilt: 1 },
  sad: { curve: -0.85, tilt: -1 },
  fear: { curve: -0.35, tilt: -0.8, eye: 1.15, open: 0.15 },
  disgust: { curve: -0.55, tilt: 0.6, squash: 0.8 },
  love: { curve: 0.75, tilt: -0.3 },
  sleep: { curve: 0, tilt: 0, closed: true },
  surprised: { curve: 0, tilt: -0.4, eye: 1.2, open: 0.45, lift: 4 },
};
const MOOD_BASE = { curve: 0, tilt: 0, squash: 1, eye: 1, open: 0, lift: 0 };
const MOOD_KEYS = Object.keys(MOOD_BASE);
/** Valores completos de un ánimo (para interpolar entre ánimos). */
const moodVals = (name) => ({ ...MOOD_BASE, ...(MOOD[name] || MOOD.neutral) });

// ───────────────────────────── spec ─────────────────────────────

const byId = (list) => Object.assign(Object.create(null), Object.fromEntries(list.map((p) => [p.id, p])));
const SHAPE = byId(SHAPES);
const EYE = byId(EYES);
const BROW = byId(BROWS);
const MOUTH = byId(MOUTHS);
const CHEEK = byId(CHEEKS);
const PATTERN = byId(PATTERNS);
const FINISH = byId(FINISHES);
const TEXTURE = byId(TEXTURES);
const ACC = byId(ACCESSORIES);
const PRESET = byId(PRESETS);

export const DEFAULT_CHARACTER = Object.freeze({
  v: 1,
  body: { shape: 'pou', points: null, color: '#a0714f', pattern: 'belly', patternColor: '#c9a27e' },
  finish: 'glossy',
  texture: 'auto',
  outline: 'auto',
  eyes: { type: 'round', size: 1, spacing: 1, y: 0, iris: '#3b82f6', white: '#ffffff', ink: '#1a1a24' },
  brows: { type: 'none', color: '' },
  mouth: { type: 'smile', size: 1, y: 0, color: '', lipColor: '#e11d48' },
  cheeks: { type: 'blush', color: '#ff6b8a' },
  accessories: [],
});

const hex = (v, def = '') => {
  const s = String(v ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase();
  return def;
};
const num = (v, def, min, max) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
};
const pickId = (map, v, def) => (typeof v === 'string' && Object.hasOwn(map, v) ? v : def);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Normaliza (y sanea) una especificación de personaje. Nunca lanza.
 * `preset: 'pirate'` parte de ese estilo; el resto de campos lo sobreescribe.
 */
export function normalizeCharacter(input = {}) {
  const i = isObj(input) ? input : {};
  const preset = typeof i.preset === 'string' && Object.hasOwn(PRESET, i.preset) ? PRESET[i.preset].spec : null;
  const d = DEFAULT_CHARACTER;
  const base = preset
    ? {
        ...d,
        ...preset,
        body: { ...d.body, pattern: 'none', ...preset.body },
        eyes: { ...d.eyes, ...preset.eyes },
        brows: { ...d.brows, ...preset.brows },
        mouth: { ...d.mouth, ...preset.mouth },
        cheeks: { ...d.cheeks, type: 'none', ...preset.cheeks },
        accessories: preset.accessories || [],
      }
    : d;
  const g = (k) => ({ ...base[k], ...(isObj(i[k]) ? i[k] : {}) });
  const body = g('body');
  const eyes = g('eyes');
  const brows = g('brows');
  const mouth = g('mouth');
  const cheeks = g('cheeks');

  let points = null;
  if (Array.isArray(body.points) && body.points.length === BODY_POINTS) {
    const p = body.points.map((pt) => (Array.isArray(pt) ? [num(pt[0], NaN, -40, 240), num(pt[1], NaN, -40, 240)] : [NaN, NaN]));
    if (p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) points = p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  const bodyColor = hex(body.color, d.body.color);
  const accIn = Array.isArray(i.accessories) ? i.accessories : base.accessories;

  return {
    v: 1,
    ...(preset ? { preset: i.preset } : typeof i.preset === 'string' && /^[\w-]{1,40}$/.test(i.preset) ? { preset: i.preset } : {}),
    body: {
      shape: pickId(SHAPE, body.shape, 'pou'),
      points,
      color: bodyColor,
      pattern: pickId(PATTERN, body.pattern, 'none'),
      patternColor: hex(body.patternColor, shade(bodyColor, 0.3)),
    },
    finish: pickId(FINISH, i.finish ?? base.finish, 'glossy'),
    // textura de superficie; 'auto' (o ausente, specs antiguas) la elige la propia spec (skin.js)
    texture: pickId(TEXTURE, i.texture ?? base.texture, 'auto'),
    outline: OUTLINES.includes(i.outline) ? i.outline : 'auto',
    // estilo artístico (styles.js); 'none' no se guarda: las specs de siempre no cambian
    ...(STYLE_IDS.includes(i.style ?? base.style) && (i.style ?? base.style) !== 'none' ? { style: i.style ?? base.style } : {}),
    eyes: {
      type: pickId(EYE, eyes.type, 'round'),
      size: num(eyes.size, 1, 0.4, 2.2),
      spacing: num(eyes.spacing, 1, 0.3, 2),
      y: num(eyes.y, 0, -50, 50),
      iris: hex(eyes.iris, d.eyes.iris),
      white: hex(eyes.white, d.eyes.white),
      ink: hex(eyes.ink, d.eyes.ink),
    },
    brows: { type: pickId(BROW, brows.type, 'none'), color: hex(brows.color, '') },
    mouth: {
      type: pickId(MOUTH, mouth.type, 'smile'),
      size: num(mouth.size, 1, 0.4, 2.2),
      y: num(mouth.y, 0, -50, 50),
      color: hex(mouth.color, ''),
      lipColor: hex(mouth.lipColor, d.mouth.lipColor),
    },
    cheeks: { type: pickId(CHEEK, cheeks.type, 'none'), color: hex(cheeks.color, d.cheeks.color) },
    accessories: accIn
      .filter((a) => isObj(a) && typeof a.id === 'string' && Object.hasOwn(ACC, a.id))
      .slice(0, 16)
      .map((a) => ({
        id: a.id,
        x: num(a.x, 0, -120, 120),
        y: num(a.y, 0, -120, 120),
        scale: num(a.scale, 1, 0.2, 3),
        rot: num(a.rot, 0, -180, 180),
        flip: !!a.flip,
        color: hex(a.color, ACC[a.id].color || '#1f2937'),
        color2: hex(a.color2, ACC[a.id].color2 || '#ffffff'),
      })),
    ...(Array.isArray(i.mods) && i.mods.length ? { mods: normalizeMods(i.mods) } : {}),
  };
}

/** La ficha que se pinta: la base con sus mods aplicados (mods.js). */
export function resolveCharacter(spec) {
  return applyMods(normalizeCharacter(spec), normalizeCharacter);
}

/** Aplica un estilo (preset) conservando lo que se indique en `keep` (p. ej. ['body']). */
export function applyPreset(spec, id, keep = []) {
  const next = normalizeCharacter({ preset: id });
  for (const k of keep) if (spec[k]) next[k] = structuredClone(spec[k]);
  return next;
}

/**
 * Personaje aleatorio (determinista con `seed`).
 * opts.legacy: sortea solo entre las piezas del catálogo 1 (CATALOG_V1), con la misma secuencia
 * que antes de 2026-10: las semillas antiguas siguen dando exactamente el mismo ot.
 */
export function randomCharacter(seed = Math.random() * 1e9, { legacy = false } = {}) {
  const v1 = (list, k) => (legacy ? list.slice(0, CATALOG_V1[k]) : list);
  let s = Math.floor(seed) >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const hue = Math.floor(rnd() * 360);
  const hsl = (h, sat, l) => {
    const a = (sat * Math.min(l, 1 - l)) / 1;
    const f = (k) => {
      const t = (k + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1))));
    };
    return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  const groups = new Map();
  // Los sombreros con `random: false` del catálogo 1 solo entran en el sorteo nuevo (no legacy).
  const accPool = legacy ? v1(ACCESSORIES, 'accessories').filter((a) => a.random !== false) : ACCESSORIES.filter((a, i) => a.random !== false || i < CATALOG_V1.accessories);
  for (const a of accPool) if (a.group !== 'extra') groups.set(a.group, [...(groups.get(a.group) || []), a]);
  const acc = [];
  for (const [, list] of groups) if (rnd() < 0.35) acc.push({ id: pick(list).id });
  return normalizeCharacter({
    body: { shape: pick(v1(SHAPES, 'shapes')).id, color: hsl(hue, 0.55, 0.62), pattern: rnd() < 0.5 ? 'none' : pick(v1(PATTERNS, 'patterns')).id, patternColor: hsl((hue + 30) % 360, 0.5, 0.75) },
    finish: pick(v1(FINISHES, 'finishes').filter((f) => f.id !== 'sketch' && f.random !== false)).id,
    eyes: { type: pick(v1(EYES, 'eyes')).id, iris: hsl(Math.floor(rnd() * 360), 0.7, 0.5), size: 0.85 + rnd() * 0.4, spacing: 0.85 + rnd() * 0.3 },
    brows: { type: rnd() < 0.5 ? 'none' : pick(v1(BROWS, 'brows')).id },
    mouth: { type: pick(v1(MOUTHS, 'mouths')).id },
    cheeks: { type: rnd() < 0.5 ? 'blush' : pick(v1(CHEEKS, 'cheeks')).id },
    accessories: acc,
  });
}

// ───────────────────────────── geometría ─────────────────────────────

export function bodyPoints(spec) {
  return spec.body.points || SHAPE[spec.body.shape]?.points || SHAPES[0].points;
}

/** Contorno cerrado Catmull-Rom → Bézier cúbicas. */
export function splinePath(pts, t = 1) {
  const N = pts.length;
  const P = (i) => pts[(i + N) % N];
  const r = (v) => Math.round(v * 100) / 100;
  let d = `M${r(P(0)[0])} ${r(P(0)[1])}`;
  for (let i = 0; i < N; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * t, p1[1] + ((p2[1] - p0[1]) / 6) * t];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * t, p2[1] - ((p3[1] - p1[1]) / 6) * t];
    d += `C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`;
  }
  return `${d}Z`;
}

/** Posiciones de la cara y anclas de accesorios para una spec (o para unos puntos deformados). */
export function layout(spec, points = null) {
  const pts = points || bodyPoints(spec);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys) };
  box.w = Math.max(...xs) - box.x;
  box.h = Math.max(...ys) - box.y;
  const cx = box.x + box.w / 2;
  const unit = Math.sqrt(box.w * box.h) / 125;
  const r = 12 * spec.eyes.size * unit;
  const sp = box.w * 0.2 * spec.eyes.spacing;
  const eyeY = box.y + box.h * 0.42 + spec.eyes.y;
  const mw = 16 * spec.mouth.size * unit;
  const mouthY = Math.max(eyeY + r * 1.2, box.y + box.h * 0.66 + spec.mouth.y);
  const top = pts[0];
  const bottom = pts[Math.round(BODY_POINTS / 2)];
  return {
    pts, box, cx, unit, r, sp, eyeY, mw, mouthY,
    anchors: {
      top: { x: top[0], y: top[1] + 4 },
      eyes: { x: cx, y: eyeY },
      nose: { x: cx, y: (eyeY + mouthY) / 2 + r * 0.25 },
      mouth: { x: cx, y: mouthY },
      neck: { x: cx, y: mouthY + (bottom[1] - mouthY) * 0.55 },
      center: { x: cx, y: box.y + box.h / 2 },
      bottom: { x: bottom[0], y: bottom[1] },
      shoulder: { x: cx + box.w * 0.4, y: box.y + box.h * 0.3 },
    },
  };
}

// ───────────────────────────── render ─────────────────────────────

let uidSeq = 0;
const R = (v) => Math.round(v * 100) / 100;

/** Contornos del cuerpo. 'tone': grueso, del color del cuerpo oscurecido; 'sticker': borde blanco de pegatina. */
export const OUTLINES = ['auto', 'none', 'thin', 'bold', 'tone', 'sticker'];

function palette(spec) {
  const body = spec.body.color;
  const dark = luminance(body) < 0.28;
  return {
    body,
    dark,
    line: dark ? shade(body, 0.55) : shade(body, -0.45),
    lip: spec.mouth.color || (dark ? shade(body, 0.6) : shade(body, -0.5)),
    brow: spec.brows.color || (dark ? shade(body, 0.6) : shade(body, -0.55)),
    lid: shade(body, -0.06),
  };
}

/**
 * Acabados del catálogo 2 (2026-10): degradado del cuerpo (stops [offset, color, opacidad?]) y
 * capa interior recortada al cuerpo (brillos, reflejos). Los 7 originales siguen en renderLayers.
 */
const FINISH2 = {
  pastel: {
    grad: (c) => ({ stops: [[0, shade(c, 0.4)], [1, shade(c, 0.12)]] }),
    inner: ({ d, box, col }) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${R(box.w * 0.05)}" opacity=".35"/><path d="${d}" fill="none" stroke="${shade(col, -0.2)}" stroke-width="${R(box.w * 0.035)}" opacity=".18" transform="translate(${R(box.w * 0.015)} ${R(box.h * 0.02)})"/>`,
  },
  metal: {
    grad: (c) => ({ x2: 0.25, stops: [[0, shade(c, 0.6)], [0.3, shade(c, 0.12)], [0.48, shade(c, -0.38)], [0.56, shade(c, 0.32)], [0.8, shade(c, 0.05)], [1, shade(c, -0.42)]] }),
    inner: ({ box }) => {
      const x = box.x + box.w * 0.24;
      const y = box.y + box.h * 0.3;
      return `<ellipse cx="${R(x)}" cy="${R(y)}" rx="${R(box.w * 0.05)}" ry="${R(box.h * 0.2)}" transform="rotate(14 ${R(x)} ${R(y)})" fill="#fff" opacity=".7"/><circle cx="${R(box.x + box.w * 0.36)}" cy="${R(box.y + box.h * 0.1)}" r="${R(box.w * 0.03)}" fill="#fff" opacity=".85"/><ellipse cx="${R(box.x + box.w * 0.78)}" cy="${R(box.y + box.h * 0.62)}" rx="${R(box.w * 0.025)}" ry="${R(box.h * 0.12)}" fill="#fff" opacity=".35"/>`;
    },
  },
  pearl: {
    grad: (c) => ({ radial: true, stops: [[0, shade(c, 0.62)], [0.6, shade(c, 0.18)], [1, shade(c, -0.18)]] }),
    defs: (id, c, box) => `<linearGradient id="${id}-iri" gradientUnits="userSpaceOnUse" x1="${R(box.x)}" y1="${R(box.y)}" x2="${R(box.x + box.w)}" y2="${R(box.y + box.h)}"><stop offset="0" stop-color="#f9a8d4"/><stop offset=".35" stop-color="#a5f3fc"/><stop offset=".65" stop-color="#fef08a"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient>`,
    inner: ({ id, d, box }) => `<path d="${d}" fill="url(#${id}-iri)" opacity=".26"/><ellipse cx="${R(box.x + box.w * 0.32)}" cy="${R(box.y + box.h * 0.22)}" rx="${R(box.w * 0.17)}" ry="${R(box.h * 0.09)}" transform="rotate(-30 ${R(box.x + box.w * 0.32)} ${R(box.y + box.h * 0.22)})" fill="#fff" opacity=".6"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${R(box.w * 0.04)}" opacity=".3"/>`,
  },
  glass: {
    grad: (c) => ({ radial: true, cx: 0.5, cy: 0.4, r: 0.7, stops: [[0, shade(c, 0.35), 0.5], [0.7, c, 0.66], [1, shade(c, -0.25), 0.88]] }),
    inner: ({ d, box, col }) => {
      const x = box.x + box.w * 0.2;
      const y = box.y + box.h * 0.38;
      return `<path d="${d}" fill="none" stroke="#fff" stroke-width="${R(box.w * 0.05)}" opacity=".45"/><ellipse cx="${R(box.x + box.w * 0.55)}" cy="${R(box.y + box.h * 0.95)}" rx="${R(box.w * 0.3)}" ry="${R(box.h * 0.1)}" fill="${shade(col, 0.6)}" opacity=".45"/><path d="M${R(x)} ${R(y + box.h * 0.12)}Q${R(x)} ${R(y - box.h * 0.12)} ${R(x + box.w * 0.16)} ${R(y - box.h * 0.22)}" stroke="#fff" stroke-width="${R(box.w * 0.045)}" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="${R(x + box.w * 0.25)}" cy="${R(y - box.h * 0.25)}" r="${R(box.w * 0.025)}" fill="#fff" opacity=".9"/>`;
    },
  },
  velvet: {
    grad: (c) => ({ radial: true, cx: 0.48, cy: 0.42, r: 0.62, stops: [[0, shade(c, 0.1)], [0.7, shade(c, -0.08)], [1, shade(c, -0.42)]] }),
    defs: (id) => `<filter id="${id}-vel" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .7 0"/></filter>`,
    inner: ({ id, d, box }) => `<rect x="${R(box.x - 5)}" y="${R(box.y - 5)}" width="${R(box.w + 10)}" height="${R(box.h + 10)}" filter="url(#${id}-vel)" opacity=".12"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${R(box.w * 0.025)}" opacity=".25" transform="translate(${R(-box.w * 0.012)} ${R(-box.h * 0.012)})"/>`,
  },
  holo: {
    grad: (c) => ({ radial: true, stops: [[0, shade(c, 0.45)], [0.55, shade(c, 0.1)], [1, shade(c, -0.22)]] }),
    defs: (id, c, box) => `<linearGradient id="${id}-holo" gradientUnits="userSpaceOnUse" x1="${R(box.x)}" y1="${R(box.y + box.h)}" x2="${R(box.x + box.w)}" y2="${R(box.y)}"><stop offset="0" stop-color="#ff7ad9"/><stop offset=".25" stop-color="#ffd36e"/><stop offset=".5" stop-color="#7affc8"/><stop offset=".75" stop-color="#7ab8ff"/><stop offset="1" stop-color="#c47aff"/></linearGradient>`,
    inner: ({ id, d, box }) => {
      let bands = '';
      for (let i = 0; i < 5; i++) {
        const x = box.x - box.w * 0.3 + i * box.w * 0.32;
        bands += `M${R(x)} ${R(box.y + box.h + 6)}L${R(x + box.w * 0.6)} ${R(box.y - 6)}`;
      }
      return `<path d="${d}" fill="url(#${id}-holo)" opacity=".42"/><path d="${bands}" stroke="#fff" stroke-width="${R(box.w * 0.05)}" opacity=".22"/><ellipse cx="${R(box.x + box.w * 0.3)}" cy="${R(box.y + box.h * 0.2)}" rx="${R(box.w * 0.14)}" ry="${R(box.h * 0.07)}" transform="rotate(-32 ${R(box.x + box.w * 0.3)} ${R(box.y + box.h * 0.2)})" fill="#fff" opacity=".6"/>`;
    },
  },
  vinyl: {
    grad: (c) => ({ stops: [[0, c], [1, c]] }),
    inner: ({ d, box, col }) => {
      const x = box.x + box.w * 0.3;
      const y = box.y + box.h * 0.2;
      return `<path d="${d}" fill="none" stroke="${shade(col, -0.18)}" stroke-width="${R(box.w * 0.09)}" transform="translate(${R(box.w * 0.035)} ${R(box.h * 0.035)})"/><ellipse cx="${R(x)}" cy="${R(y)}" rx="${R(box.w * 0.11)}" ry="${R(box.h * 0.055)}" transform="rotate(-30 ${R(x)} ${R(y)})" fill="#fff" opacity=".9"/><circle cx="${R(box.x + box.w * 0.44)}" cy="${R(box.y + box.h * 0.12)}" r="${R(box.w * 0.022)}" fill="#fff" opacity=".9"/>`;
    },
  },
};

function outlineOf(spec, pal) {
  const o = spec.outline;
  if (o === 'none') return null;
  // el estilo artístico manda en el trazo (lw 0: sin contorno, p. ej. plastilina)
  if (spec._style) return spec._style.lw ? { color: spec._style.ink, w: spec._style.lw } : null;
  if (o === 'tone') return { color: shade(spec.body.color, -0.55), w: 4 };
  if (o === 'sticker') return { color: '#ffffff', w: 6, under: { color: '#1f2937', w: 8.6 } };
  if (o === 'bold' || spec.finish === 'toon') return { color: '#1f2937', w: 4.5 };
  if (spec.finish === 'sketch') return { color: '#1f2937', w: 2.2 };
  if (spec.finish === 'neon') return { color: spec.body.color, w: 3.5 };
  // acabados del catálogo 2
  if (spec.finish === 'vinyl' && o === 'auto') return { color: shade(spec.body.color, -0.5), w: 3.2 };
  if (spec.finish === 'glass' && o === 'auto') return { color: shade(spec.body.color, -0.3), w: 2, op: 0.7 };
  if (spec.finish === 'metal' && o === 'auto') return { color: shade(spec.body.color, -0.6), w: 2.2, op: 0.8 };
  if (o === 'thin' || (o === 'auto' && spec.finish !== 'flat')) return { color: pal.line, w: 2.2, op: 0.55 };
  return null;
}

/** Ojos (con parpadeo/mirada/ánimo) centrados en el ancla de ojos. */
function eyesSVG(spec, L, st, pal) {
  const e = spec.eyes;
  const closed = st.closed ?? st.mood === 'sleep';
  const part = EYE[closed && !EYE[e.type].noBlink ? 'closed' : e.type];
  const m = st.m || moodVals(st.mood);
  const blink = part.noBlink ? 1 : Math.max(0.08, 1 - st.blink);
  const sy = blink * (m.squash || 1);
  const sc = m.eye || 1;
  const base = { r: L.r, lx: st.lx, ly: st.ly, iris: e.iris, ink: e.ink, white: e.white, lid: pal.lid, mood: st.mood };
  const one = (x, side) =>
    `<g transform="translate(${R(x)} ${R(L.eyeY)}) scale(${R(sc)} ${R(sc * sy)})">${part.draw({ ...base, side })}</g>`;
  return part.single ? one(L.cx, 1) : one(L.cx - L.sp, -1) + one(L.cx + L.sp, 1);
}

function browsSVG(spec, L, st, pal) {
  const part = BROW[spec.brows.type];
  if (!part || spec.brows.type === 'none') return '';
  const m = st.m || moodVals(st.mood);
  const y = L.eyeY - L.r * 1.65 * (m.eye || 1) - (m.lift || 0) - st.browLift;
  const p = { r: L.r, color: pal.brow, sp: L.sp };
  if (part.uni) return `<g transform="translate(${R(L.cx)} ${R(y)})">${part.draw({ ...p, side: 1 })}</g>`;
  return [-1, 1]
    .map((side) => `<g transform="translate(${R(L.cx + side * L.sp)} ${R(y)}) rotate(${R(side * m.tilt * 14)})">${part.draw({ ...p, side })}</g>`)
    .join('');
}

function mouthSVG(spec, L, st, pal) {
  const m = st.m || moodVals(st.mood);
  const open = Math.min(1, Math.max(0, st.open, m.open || 0));
  const msx = st.msx ?? 1;
  const p = {
    w: L.mw,
    open,
    curve: m.curve,
    ink: '#5b1a22',
    lip: pal.lip,
    tongue: '#ff7a8a',
    teeth: '#ffffff',
    lipColor: spec.mouth.lipColor,
  };
  const sc = Math.abs(msx - 1) > 0.01 ? ` scale(${R(msx)} 1)` : '';
  return `<g transform="translate(${R(L.cx)} ${R(L.mouthY)})${sc}">${MOUTH[spec.mouth.type].draw(p)}</g>`;
}

/** ¿Esta pieza crece del cuerpo? Solo si sigue cerca de su ancla (si el usuario la movió, va encima como antes). */
function growing(a, part) {
  return !!part.grow && !!part.shape && Math.abs(a.x) <= 24 && a.y <= 12 && a.y >= -40 && Math.abs(a.rot) <= 35 && a.scale >= 0.6;
}

/** Accesorio de catálogo o pieza de un mod. */
const accOf = (spec, id) => ACC[id] || modPart(spec, id, shade);

function accessorySVG(a, spec, L, pal, clipUrl, skin, key) {
  const part = accOf(spec, a.id);
  const at = L.anchors[part.anchor] || L.anchors.center;
  const grow = growing(a, part);
  const c = {
    k: L.box.w / 120,
    m: L.mw / 16,
    mw: L.mw,
    w: L.box.w,
    h: L.box.h,
    sp: L.sp,
    r: L.r,
    eyeDy: L.eyeY - L.box.y,
    mouthDy: L.mouthY - L.eyeY,
    color: a.color,
    color2: a.color2,
    body: pal.body,
    above: at.y - L.box.y,
    below: L.anchors.bottom.y - at.y,
    grow,
  };
  const tf = `translate(${R(at.x + a.x)} ${R(at.y + a.y)}) rotate(${R(a.rot)}) scale(${R(a.flip ? -a.scale : a.scale)} ${R(a.scale)})`;
  const main = `<g transform="${tf}">${part.draw(c)}</g>`;
  const extra = part.extra ? `<g transform="${tf}">${part.extra(c)}</g>` : '';
  const clip = (s) => (s ? `<g clip-path="${clipUrl}">${s}</g>` : '');
  if (grow) {
    // unida: luz del cuerpo (y su textura si es de piel, p. ej. orejas) + sombra de contacto
    const shapes = part.shape(c).map((sh) => ({ ...sh, tf: sh.tf ? `${tf} ${sh.tf}` : tf }));
    let over = '';
    for (const sh of shapes) {
      const T = ` transform="${sh.tf}"`;
      if (sh.sw) {
        if (skin.lit) over += `<path d="${sh.d}"${T} fill="none" stroke="${skin.lit}" stroke-width="${sh.sw}" stroke-linecap="round"/>`;
        continue;
      }
      if (skin.lit) over += `<path d="${sh.d}"${T} fill="${skin.lit}"/>`;
      if (part.grow === 'skin' && skin.tex) over += `<path d="${sh.d}"${T} fill="${skin.tex}"/>`;
    }
    const j = joinSVG(skin, shapes, key);
    return { svg: main + over + j.shadow + extra, mask: j.mask };
  }
  if (part.clip) return { svg: clip(main) + extra, mask: '' };
  if (part.clipExtra) return { svg: main + clip(extra), mask: '' };
  return { svg: main + extra, mask: '' };
}

/** Máscara del contorno del cuerpo: blanco salvo donde nacen las piezas unidas (en negro). */
export function outlineMask(uid, inner) {
  return `<mask id="${uid}-om" maskUnits="userSpaceOnUse" x="-600" y="-600" width="1400" height="1400"><rect x="-600" y="-600" width="1400" height="1400" fill="#fff"/>${inner}</mask>`;
}

/**
 * Piezas del SVG por capas (lo usa createCharacter para animar sin re-renderizar todo).
 * opts.pts: contorno deformado (metamorfosis) en lugar del de la spec.
 * opts.detail: 'full' | 'lite' (sin filtros en la textura) | 'off' (sin textura).
 * opts.live: la máscara del contorno la gestiona quien llama (outlineMask con `mask` + la de las metamorfosis).
 * opts.animate: animar los filtros del estilo (glitch); spec ya estilizada con stylizeSpec.
 * @returns {{ viewBox:string, defs:string, back:string, body:string, cheeks:string, eyes:string, brows:string, mouth:string, front:string, mask:string, filter:string, skin:object, L:object }}
 */
export function renderLayers(spec, state = {}, opts = {}) {
  const st = { open: 0, blink: 0, lx: 0, ly: 0, mood: 'neutral', browLift: 0, ...state };
  const L = layout(spec, opts.pts);
  const pal = palette(spec);
  const id = opts.uid || `otsc${(++uidSeq).toString(36)}`;
  const d = splinePath(L.pts);
  const { box } = L;
  const f = spec.finish;
  const col = spec.body.color;
  const ol = outlineOf(spec, pal);
  const clipUrl = `url(#${id}-clip)`;

  let defs = `<clipPath id="${id}-clip"><path d="${d}"/></clipPath>`;
  let fill = col;
  let stops = null;
  if (f === 'glossy' || f === 'soft3d' || f === 'clay') {
    const [a, b] = f === 'glossy' ? [0.38, -0.28] : f === 'soft3d' ? [0.22, -0.2] : [0.14, -0.22];
    stops = [[0, shade(col, a)], [0.55, col], [1, shade(col, b)]];
    // en espacio de usuario (con la caja del cuerpo): las piezas unidas que lo usan siguen la misma luz
    defs += `<radialGradient id="${id}-g" gradientUnits="userSpaceOnUse" cx=".36" cy=".28" r=".85" gradientTransform="translate(${R(box.x)} ${R(box.y)}) scale(${R(box.w)} ${R(box.h)})">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;
    // la misma luz, en translúcido, para piezas de otro color (cuernos, orejas…)
    defs += `<radialGradient id="${id}-lit" cx="32%" cy="24%" r="90%"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>`;
    fill = `url(#${id}-g)`;
  }
  if (f === 'soft3d') defs += `<filter id="${id}-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${R(box.w * 0.06)}"/></filter>`;
  if (f === 'clay') defs += `<filter id="${id}-noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 0"/></filter>`;
  if (f === 'neon') defs += `<filter id="${id}-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  if (f === 'sketch') {
    defs += `<filter id="${id}-rough"><feTurbulence type="turbulence" baseFrequency=".035" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>`;
    defs += `<pattern id="${id}-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0 0V7" stroke="${shade(col, -0.35)}" stroke-width="1.4" opacity=".45"/></pattern>`;
  }
  const f2 = FINISH2[f];
  if (f2) {
    const g = f2.grad(col);
    stops = g.stops;
    const st = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
    const T = `gradientUnits="userSpaceOnUse" gradientTransform="translate(${R(box.x)} ${R(box.y)}) scale(${R(box.w)} ${R(box.h)})"`;
    defs += g.radial ? `<radialGradient id="${id}-g" ${T} cx="${g.cx ?? 0.36}" cy="${g.cy ?? 0.28}" r="${g.r ?? 0.85}">${st}</radialGradient>` : `<linearGradient id="${id}-g" ${T} x1="0" y1="0" x2="${g.x2 ?? 0}" y2="1">${st}</linearGradient>`;
    defs += `<radialGradient id="${id}-lit" cx="32%" cy="24%" r="90%"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>`;
    defs += f2.defs ? f2.defs(id, col, box) : '';
    fill = `url(#${id}-g)`;
  }

  // Piel: textura de superficie y lo que comparten las piezas unidas (metamorfosis y accesorios)
  const bodyFill = f === 'neon' ? shade(col, -0.72) : fill;
  const sk = renderSkin(spec, L, opts.pts ? layout(spec) : L, { id, d, fill: bodyFill, col, line: ol, quality: opts.detail || 'full' });
  defs += sk.defs;
  const skin = {
    uid: id, d, box, clip: clipUrl, fill: bodyFill, stops: f === 'neon' ? null : stops, solid: bodyFill.startsWith('#') ? bodyFill : col,
    lit: stops ? `url(#${id}-lit)` : '', tex: sk.part, texture: sk.tex,
    line: ol ? ol.color : '', lw: ol ? R(Math.min(ol.w, 3.2)) : 0, lineOp: ol?.op || 0,
  };

  // Accesorios (los que crecen del cuerpo van detrás y recortan su contorno)
  let back = '';
  let front = '';
  let mask = '';
  spec.accessories.forEach((a, i) => {
    const part = accOf(spec, a.id);
    if (!part) return;
    const x = accessorySVG(a, spec, L, pal, clipUrl, skin, `a${i}`);
    if (part.layer === 'back' || growing(a, part)) back += x.svg;
    else front += x.svg;
    mask += x.mask;
  });
  const masked = opts.live || !!mask;
  if (mask && !opts.live) defs += outlineMask(id, mask);

  // Capa del cuerpo
  let body = '';
  if (f !== 'flat' && f !== 'neon') body += `<ellipse cx="${R(L.anchors.bottom.x)}" cy="${R(L.anchors.bottom.y + 5)}" rx="${R(box.w * 0.36)}" ry="${R(Math.max(4, box.h * 0.045))}" fill="#000" opacity=".13"/>`;
  body += `<path d="${d}" fill="${bodyFill}"${f === 'neon' ? ` filter="url(#${id}-glow)"` : ''}/>`;
  let inner = '';
  if (f === 'toon') inner += `<path d="${d}" fill="${shade(col, -0.2)}"/><path d="${d}" fill="${col}" transform="translate(${R(-box.w * 0.06)} ${R(-box.h * 0.07)})"/>`;
  if (spec.body.pattern !== 'none') inner += PATTERN[spec.body.pattern].draw({ box, color: spec.body.patternColor, eyeY: L.eyeY, r: L.r });
  inner += sk.inner;
  if (f === 'glossy') {
    inner += `<ellipse cx="${R(box.x + box.w * 0.3)}" cy="${R(box.y + box.h * 0.2)}" rx="${R(box.w * 0.15)}" ry="${R(box.h * 0.08)}" transform="rotate(-32 ${R(box.x + box.w * 0.3)} ${R(box.y + box.h * 0.2)})" fill="#fff" opacity=".5"/>`;
    inner += `<circle cx="${R(box.x + box.w * 0.44)}" cy="${R(box.y + box.h * 0.12)}" r="${R(box.w * 0.025)}" fill="#fff" opacity=".6"/>`;
    inner += `<path d="${d}" fill="none" stroke="${shade(col, -0.35)}" stroke-width="${R(box.w * 0.08)}" opacity=".18"/>`;
  }
  if (f === 'soft3d') {
    inner += `<ellipse cx="${R(L.cx + box.w * 0.1)}" cy="${R(box.y + box.h * 1.02)}" rx="${R(box.w * 0.6)}" ry="${R(box.h * 0.28)}" fill="${shade(col, -0.45)}" opacity=".35" filter="url(#${id}-soft)"/>`;
    inner += `<ellipse cx="${R(box.x + box.w * 0.34)}" cy="${R(box.y + box.h * 0.2)}" rx="${R(box.w * 0.2)}" ry="${R(box.h * 0.1)}" fill="#fff" opacity=".45" filter="url(#${id}-soft)"/>`;
  }
  if (f === 'clay') inner += `<rect x="${R(box.x - 5)}" y="${R(box.y - 5)}" width="${R(box.w + 10)}" height="${R(box.h + 10)}" filter="url(#${id}-noise)" opacity=".13"/>`;
  if (f === 'sketch') inner += `<path d="${d}" fill="url(#${id}-hatch)" transform="translate(${R(box.w * 0.05)} ${R(box.h * 0.06)})"/>`;
  if (f2) inner += f2.inner({ id, d, box, col, L });
  const sty = styleLayers(spec, L, { uid: id, d, quality: opts.detail || 'full', animate: opts.animate });
  defs += sty.defs;
  inner += sty.inner;
  if (inner) body += `<g clip-path="${clipUrl}">${inner}</g>`;
  if (ol?.under) body += `<path d="${d}" fill="none" stroke="${ol.under.color}" stroke-width="${ol.under.w}" stroke-linejoin="round"${masked ? ` mask="url(#${id}-om)"` : ''}/>`;
  if (ol) body += `<path d="${d}" fill="none" stroke="${ol.color}" stroke-width="${ol.w}" stroke-linejoin="round"${ol.op ? ` stroke-opacity="${ol.op}"` : ''}${f === 'sketch' ? ` filter="url(#${id}-rough)"` : ''}${f === 'neon' ? ` filter="url(#${id}-glow)"` : ''}${masked ? ` mask="url(#${id}-om)"` : ''}/>`;
  body += sk.rim;

  const cheeks = spec.cheeks.type === 'none' ? '' : `<g transform="translate(${R(L.cx)} ${R(L.eyeY)})">${CHEEK[spec.cheeks.type].draw({ sp: L.sp, r: L.r, color: spec.cheeks.color })}</g>`;

  return {
    L,
    uid: id,
    viewBox: opts.viewBox || '-20 -50 240 270',
    defs,
    back,
    body,
    cheeks,
    eyes: eyesSVG(spec, L, st, pal),
    brows: browsSVG(spec, L, st, pal),
    mouth: mouthSVG(spec, L, st, pal),
    front,
    mask,
    filter: sty.filter,
    skin,
  };
}

/**
 * SVG completo como string (sirve en Node, para miniaturas o para <img src="data:…">).
 * @param {object} spec  (se normaliza)
 * @param {{open?:number, blink?:number, lx?:number, ly?:number, mood?:string}} [state]
 * @param {{viewBox?:string, title?:string, backdrop?:boolean}} [opts]
 *   backdrop: con estilo artístico, pintar su fondo detrás (defecto true).
 */
export function renderCharacter(spec, state = {}, opts = {}) {
  const src = normalizeCharacter(spec);
  const s = stylizeSpec(applyMods(src, normalizeCharacter));
  const x = renderLayers(s, state, opts);
  const title = opts.title ? `<title>${String(opts.title).replace(/[<>&"]/g, '')}</title>` : '';
  const parts = `${x.back}${x.body}${x.cheeks}${x.eyes}${x.brows}${x.mouth}${x.front}`;
  const bd = src.style && opts.backdrop !== false ? backdropIn(src.style, styleSeed(src), x.viewBox, `${x.uid}-bd`) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.viewBox}" role="img"${opts.title ? '' : ' aria-hidden="true"'}>${title}<defs>${x.defs}</defs>${bd}${x.filter ? `<g filter="${x.filter}">${parts}</g>` : parts}</svg>`;
}

// ───────────────────────────── vivo ─────────────────────────────

// Respiración y balanceo en CSS (no gastan JS en reposo); gestos, boca y metamorfosis en un
// bucle rAF que solo corre mientras hay algo animándose.
const STYLE = `
.otsc-sway{animation:otsc-sway 5.3s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.otsc-breathe{animation:otsc-breathe 3.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.otsc-talk .otsc-breathe{animation-duration:2.2s}
@keyframes otsc-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.014,.982)}}
@keyframes otsc-sway{0%,100%{transform:rotate(-.6deg)}50%{transform:rotate(.6deg)}}
@media (prefers-reduced-motion:reduce){.otsc-breathe,.otsc-sway{animation:none!important}}
`;

/** Efectos y metamorfosis que acompañan a cada ánimo (solo al cambiar de ánimo). */
const MOOD_FX = {
  angry: [['spikes', { ms: 900 }], ['anger'], ['steam']],
  surprised: [['exclaim']],
  love: [['hearts'], ['blush']],
  happy: [['sparkles']],
  sad: [['tears']],
  fear: [['sweat']],
  disgust: [['squish', { ms: 700 }]],
  sleep: [['zzz', { hold: true, tag: 'mood' }]],
};

const MORPH_MS = 1800;
const MORPH_IN = 380;
const MORPH_OUT = 300;
const FX_OUT = 300;
const POSE_KEYS = Object.keys(POSE0);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const mixPts = (a, b, k) => a.map((p, i) => [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)]);

/**
 * Personaje animado dentro de `container`.
 * @param {HTMLElement} container
 * @param {object} spec
 * @param {{ idle?: boolean, fit?: 'all'|'body'|string, title?: string, locale?: string, moodFx?: boolean, zoom?: boolean }} [opts]
 *   title: nombre accesible (aria-label); sin él, «Avatar» en el idioma `locale` (defecto: el global).
 *   idle: respirar, parpadear y mirar alrededor solo (defecto true).
 *   moodFx: efectos al cambiar de ánimo (pinchos al enfadarse, zzz al dormir…; defecto true).
 *   zoom: alejar el encuadre cuando una metamorfosis no cabe (defecto true con fit 'all'/'body').
 *   backdrop: con estilo artístico, su fondo como background del <svg> (defecto true).
 */
export function createCharacter(container, spec, opts = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'otsc');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', opts.title || translator(opts.locale)('character.avatar'));
  svg.style.cssText = 'width:100%;height:100%;display:block;overflow:visible';
  container.appendChild(svg);

  const idle = opts.idle !== false;
  const moodFx = opts.moodFx !== false;
  const fitMode = opts.fit || 'all';
  const canZoom = opts.zoom !== false && (fitMode === 'all' || fitMode === 'body');
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // equipos modestos: textura sin filtros
  const lowEnd = typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2);

  // src: la spec tal cual (la que se devuelve); s: la que se pinta (con el estilo artístico aplicado)
  let src = normalizeCharacter(spec);
  let s = stylizeSpec(applyMods(src, normalizeCharacter));
  let uid = `otsc${(++uidSeq).toString(36)}`;
  let g = {};
  let L = layout(s);
  let L0 = L;
  let pal = palette(s);
  let alive = true;
  let raf = 0;
  let last = 0;
  let blinkT = 0;
  let fxSeq = 0;

  // estado animado
  let moodName = 'neutral';
  const mv = moodVals('neutral');
  let sleepK = 0;
  const look = { x: 0, y: 0, tx: 0, ty: 0, at: -1e9 };
  const mo = { open: 0, target: 0, msx: 1, tmsx: 1 };
  let blinkAt = -1e9;
  let gest = null;
  let legs = null; // patas de los bailes: { pose, dir, k, on, start }
  let pose = { ...POSE0 };
  const morphs = new Map();
  let fxs = [];
  let speech = null;
  let zoom = 1;
  let vb = null;
  let skin = null;
  let accMask = '';
  let morphMask = '';
  let px = 240;
  const keys = { body: '', eyes: '', brows: '', mouth: '', rig: '', legs: '', mback: '', mfront: '', fx: '', fxface: '', mask: '', detail: '' };

  /**
   * Nivel de detalle de la piel: sin textura si se ve diminuto; sin filtros mientras el contorno
   * se deforma (se repinta cada frame), con movimiento reducido o en equipos modestos.
   */
  function detail(key) {
    if (opts.detail === 'full' || opts.detail === 'lite' || opts.detail === 'off') return opts.detail;
    if (px < 56) return 'off';
    return key !== 'base' || lowEnd || reduced() ? 'lite' : 'full';
  }

  function build() {
    pal = palette(s);
    svg.innerHTML = `<style>${STYLE}</style><defs data-p="defs"></defs><defs data-p="mask"></defs><g data-p="styled"><g data-p="legs"></g><g class="otsc-rig"><g data-p="fxback"></g><g class="otsc-sway"><g class="otsc-breathe"><g data-p="mback"></g><g data-p="back"></g><g data-p="body"></g><g data-p="cheeks"></g><g data-p="fxface"></g><g data-p="eyes"></g><g data-p="brows"></g><g data-p="mouth"></g><g data-p="front"></g><g data-p="mfront"></g></g></g><g data-p="fx"></g></g></g>`;
    g = { rig: svg.querySelector('.otsc-rig') };
    for (const el of svg.querySelectorAll('[data-p]')) g[el.dataset.p] = el;
    if (!idle) {
      svg.querySelector('.otsc-breathe').setAttribute('class', '');
      svg.querySelector('.otsc-sway').setAttribute('class', '');
    }
    for (const k in keys) keys[k] = '';
    // fondo del estilo: imagen de fondo del <svg> (se rasteriza una vez, no se repinta al animar)
    const bd = src.style && opts.backdrop !== false ? backdropCSS(src.style, styleSeed(src)) : '';
    svg.style.backgroundImage = bd;
    svg.style.backgroundSize = bd ? 'cover' : '';
    svg.style.backgroundPosition = bd ? 'center bottom' : '';
    L0 = layout(s);
    paintBody(bodyPoints(s), 'base');
    paintFace(faceState());
    fit();
  }

  function paintBody(pts, key) {
    const dt = detail(key);
    const x = renderLayers(s, faceState(), { uid, pts, live: true, detail: dt, animate: !reduced() });
    L = x.L;
    if ((g.styled.getAttribute('filter') || '') !== x.filter) {
      if (x.filter) g.styled.setAttribute('filter', x.filter);
      else g.styled.removeAttribute('filter');
    }
    skin = x.skin;
    accMask = x.mask;
    g.defs.innerHTML = x.defs;
    g.back.innerHTML = x.back;
    g.body.innerHTML = x.body;
    g.cheeks.innerHTML = x.cheeks;
    g.front.innerHTML = x.front;
    keys.body = key;
    keys.detail = dt;
    keys.eyes = keys.brows = keys.mouth = '';
    paintMask();
  }

  /** Máscara del contorno: accesorios unidos + piezas de las metamorfosis activas. */
  function paintMask() {
    const m = accMask + morphMask;
    if (m === keys.mask && g.mask.firstChild) return;
    g.mask.innerHTML = outlineMask(uid, m);
    keys.mask = m;
  }

  /** Estado de cara de este frame: ánimo interpolado + retoques del gesto + boca + mirada. */
  function faceState() {
    const m = { ...mv };
    m.curve = clamp(m.curve + pose.curve, -1, 1);
    m.eye *= pose.eye;
    m.lift += pose.lift;
    const blink = Math.max(blinkValue(nowMs()), pose.blink, sleepK > 0.02 ? Math.min(1, sleepK * 1.1) : 0);
    return {
      m,
      mood: moodName,
      closed: sleepK > 0.85,
      blink: clamp(blink),
      open: clamp(mo.open + pose.open),
      msx: mo.msx * pose.msx,
      lx: clamp(look.x + pose.lx, -1, 1),
      ly: clamp(look.y + pose.ly, -1, 1),
      browLift: 0,
    };
  }

  function paintFace(st) {
    const r2 = (v) => Math.round(v * 100);
    const kE = `${keys.body}|${r2(st.lx)},${r2(st.ly)},${r2(st.blink)},${r2(st.m.squash)},${r2(st.m.eye)},${st.closed}`;
    if (kE !== keys.eyes) { g.eyes.innerHTML = eyesSVG(s, L, st, pal); keys.eyes = kE; }
    const kB = `${keys.body}|${r2(st.m.tilt)},${r2(st.m.eye)},${r2(st.m.lift)}`;
    if (kB !== keys.brows) { g.brows.innerHTML = browsSVG(s, L, st, pal); keys.brows = kB; }
    const kM = `${keys.body}|${Math.round(st.open * 200)},${r2(st.msx)},${r2(st.m.curve)},${r2(st.m.open)}`;
    if (kM !== keys.mouth) { g.mouth.innerHTML = mouthSVG(s, L, st, pal); keys.mouth = kM; }
  }

  // ── encuadre ──
  function fit() {
    if (fitMode !== 'all' && fitMode !== 'body') {
      vb = null;
      svg.setAttribute('viewBox', fitMode);
      return;
    }
    const pad = 8;
    let b = { x: L0.box.x, y: L0.box.y, width: L0.box.w, height: L0.box.h + 10 };
    if (fitMode === 'all') {
      // Solo cuerpo y accesorios: las metamorfosis y efectos se encuadran con el zoom.
      try {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const el of [g.back, g.body, g.front]) {
          const bb = el.getBBox();
          if (!bb.width && !bb.height) continue;
          x0 = Math.min(x0, bb.x);
          y0 = Math.min(y0, bb.y);
          x1 = Math.max(x1, bb.x + bb.width);
          y1 = Math.max(y1, bb.y + bb.height);
        }
        if (x1 > x0) b = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      } catch { /* sin layout (oculto): encuadre del cuerpo */ }
    }
    const size = Math.max(b.width, b.height) + pad * 2;
    vb = { cx: b.x + b.width / 2, cy: b.y + b.height / 2, size };
    applyViewBox();
  }
  function applyViewBox() {
    if (!vb) return;
    const size = vb.size * zoom;
    // se aleja anclado cerca de los pies: el personaje no «sube» al crecerle alas
    const pivot = vb.cy + vb.size * 0.3;
    svg.setAttribute('viewBox', `${R(vb.cx - size / 2)} ${R(pivot - size * 0.8)} ${R(size)} ${R(size)}`);
  }

  // ── bucle ──
  function wake() {
    if (raf || !alive) return;
    last = nowMs();
    raf = requestAnimationFrame(frame);
  }

  function blinkValue(t) {
    const bt = t - blinkAt;
    if (bt < 0 || bt >= 180) return 0;
    return bt < 70 ? EASE.in(bt / 70) ** 0.5 : 1 - EASE.out((bt - 70) / 110);
  }

  function frame(t) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(64, Math.max(0, t - last));
    last = t;
    const rm = reduced();
    let busy = false;
    const settle = (cur, tgt, eps = 0.004) => Math.abs(cur - tgt) > eps;

    // 1) voz → objetivo de boca
    if (speech) {
      busy = true;
      if (!speech.tick(t)) endSpeech();
    }
    // 2) boca con ataque rápido y relajación algo más lenta
    mo.open = approach(mo.open, mo.target, dt, mo.target > mo.open ? 35 : 70);
    mo.msx = approach(mo.msx, mo.tmsx, dt, 60);
    if (settle(mo.open, mo.target) || settle(mo.msx, mo.tmsx)) busy = true;
    else { mo.open = mo.target; mo.msx = mo.tmsx; }
    svg.classList.toggle('otsc-talk', mo.open > 0.08);

    // 3) mirada suavizada
    look.x = rm ? look.tx : approach(look.x, look.tx, dt, 70);
    look.y = rm ? look.ty : approach(look.y, look.ty, dt, 70);
    if (settle(look.x, look.tx) || settle(look.y, look.ty)) busy = true;

    // 4) ánimo interpolado
    const tgt = moodVals(moodName);
    for (const k of MOOD_KEYS) {
      mv[k] = rm ? tgt[k] : approach(mv[k], tgt[k], dt, 90);
      if (settle(mv[k], tgt[k], 0.003)) busy = true;
      else mv[k] = tgt[k];
    }
    const sk = moodName === 'sleep' ? 1 : 0;
    sleepK = rm ? sk : approach(sleepK, sk, dt, 260);
    if (settle(sleepK, sk, 0.002)) busy = true;
    else sleepK = sk;

    // 5) parpadeo
    if (blinkValue(t) > 0 || t - blinkAt < 180) busy = true;

    // 6) gesto
    pose = { ...POSE0 };
    if (gest) {
      busy = true;
      const age = t - gest.start;
      const tt = clamp(age / gest.ms);
      const p = gest.def.pose(tt, rm ? 0 : age, gest);
      for (const k in p) pose[k] = p[k];
      if (gest.dir < 0) { pose.x = -pose.x; pose.r = -pose.r; pose.lx = -pose.lx; }
      if (gest.from) {
        const w = EASE.out(clamp(age / 160));
        for (const k of POSE_KEYS) pose[k] = lerp(gest.from[k], pose[k], w);
      }
      for (const f of gest.def.fx || []) {
        if (tt >= f[0] && !gest.fired.has(f)) {
          gest.fired.add(f);
          effect(f[1], { dir: gest.dir, ...(f[2] || {}) });
        }
      }
      if (tt >= 1) endGesture();
    }
    if (rm) Object.assign(pose, { x: 0, y: 0, r: 0, sx: 1, sy: 1 });

    // 7) metamorfosis: envolventes, contorno y capas extra
    const base = bodyPoints(s);
    let pts = base;
    let room = 1;
    const drawn = [];
    for (const [slot, m] of morphs) {
      busy = true;
      if (m.phase !== 'out' && t >= m.until) { m.phase = 'out'; m.outAt = t; m.k0 = m.k; }
      if (m.phase === 'in') {
        const q = clamp((t - m.start) / MORPH_IN);
        m.k = rm ? 1 : (m.def.shape ? EASE.inOut(q) : EASE.backOut(q));
        if (q >= 1) m.phase = 'on';
      } else if (m.phase === 'on') m.k = 1;
      else {
        const q = clamp((t - m.outAt) / MORPH_OUT);
        m.k = rm ? 0 : m.k0 * (1 - EASE.inOut(q));
        if (q >= 1) { morphs.delete(slot); continue; }
      }
      if (m.phase !== 'out') room = Math.max(room, m.def.room || 1);
      const age = rm ? 0 : t - m.start;
      if (m.def.shape) {
        const b = m.prev ? EASE.inOut(clamp((t - m.bAt) / 420)) : 1;
        const target = b < 1 ? mixPts(m.prev, m.target, b) : m.target;
        pts = mixPts(pts, target, m.k);
      } else if (m.def.deform) pts = m.def.deform(pts, m.k, age, ptsBox(pts), rm);
      else {
        if (m.o.pose !== undefined) m.o.blend = clamp((t - (m.poseAt || 0)) / 220);
        drawn.push([m, age]);
      }
    }
    const bodyKey = pts === base ? 'base' : pts.map((p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`).join(' ');
    if (bodyKey !== keys.body || detail(bodyKey) !== keys.detail) paintBody(pts, bodyKey);

    let mback = '';
    let mfront = '';
    let mmask = '';
    if (drawn.length) {
      const ol = outlineOf(s, pal);
      const c = {
        pts: L.pts, cx: L.cx, top: L.box.y, W: L.box.w, H: L.box.h, mid: L.box.y + L.box.h * 0.55,
        eyeY: L.eyeY, mouthY: L.mouthY, sp: L.sp, r: L.r, mw: L.mw, pal,
        line: ol ? ol.color : pal.line, lw: ol ? R(Math.min(ol.w, 3.2)) : 1.8, fill: s.body.color,
        hr: Math.max(6, L.box.w * 0.1), skin,
      };
      c.aw = c.hr * 0.55;
      // orden: alas detrás de todo, luego pinchos, cuernos y brazos
      const order = ['wings', 'spikes', 'horns', 'hands'];
      drawn.sort((a, b) => order.indexOf(a[0].name) - order.indexOf(b[0].name));
      for (const [m, age] of drawn) {
        const [bk, fr, mk] = m.def.draw(c, m.k, age, { ...m.o, still: rm });
        mback += bk;
        mfront += fr;
        mmask += mk || '';
      }
    }
    if (mback !== keys.mback) { g.mback.innerHTML = mback; keys.mback = mback; }
    if (mfront !== keys.mfront) { g.mfront.innerHTML = mfront; keys.mfront = mfront; }
    if (mmask !== morphMask) { morphMask = mmask; paintMask(); }

    // 8) efectos
    let fxFront = '';
    let fxFace = '';
    if (fxs.length) {
      busy = true;
      const c = {
        cx: L.cx, top: L.box.y, W: L.box.w, H: L.box.h, eyeY: L.eyeY, mouthY: L.mouthY, sp: L.sp, r: L.r, mw: L.mw, pal,
      };
      fxs = fxs.filter((f) => {
        const age = t - f.start;
        let alpha = 1;
        let p;
        if (f.loop) {
          if (!f.hold && age >= f.ms && f.end == null) f.end = t;
          if (f.end != null) {
            alpha = 1 - clamp((t - f.end) / FX_OUT);
            if (alpha <= 0) return false;
          }
          p = rm ? 0.3 : (age % f.cycle) / f.cycle;
        } else {
          if (age >= f.ms) return false;
          if (f.end != null) {
            alpha = 1 - clamp((t - f.end) / FX_OUT);
            if (alpha <= 0) return false;
          }
          p = rm ? 0.5 : age / f.ms;
        }
        const out = f.def.draw({ ...c, dir: f.dir }, p, rm ? 0 : age, f.o, seeded(f.seed));
        const svgS = alpha < 1 ? `<g opacity="${R(alpha)}">${out}</g>` : out;
        if (f.def.layer === 'face') fxFace += svgS;
        else fxFront += svgS;
        return true;
      });
    }
    if (fxFront !== keys.fx) { g.fx.innerHTML = fxFront; keys.fx = fxFront; }
    if (fxFace !== keys.fxface) { g.fxface.innerHTML = fxFace; keys.fxface = fxFace; }

    // 8b) patas de los bailes: el cuerpo sube sobre ellas y los pies se quedan en el suelo
    let legLift = 0;
    let legSVG = '';
    if (legs) {
      busy = true;
      const lt = legs.on ? 1 : 0;
      legs.k = rm ? lt : approach(legs.k, lt, dt, 150);
      if (!legs.on && legs.k < 0.01) legs = null;
      else {
        const W = L0.box.w;
        const H = L0.box.h;
        const LL = H * 0.36;
        legLift = LL * legs.k;
        room = Math.max(room, 1 + 0.42 * legs.k);
        const ox = L0.cx;
        const oy = L0.box.y + H;
        const rr = ((pose.r + (rm ? 0 : look.x * 2)) * Math.PI) / 180;
        const hips = [-1, 1].map((sd) => {
          const lx = sd * W * 0.2 * pose.sx;
          const ly = -H * 0.1 * pose.sy;
          return { x: ox + pose.x * W + lx * Math.cos(rr) - ly * Math.sin(rr), y: oy + pose.y * H - legLift + lx * Math.sin(rr) + ly * Math.cos(rr) };
        });
        const ol = outlineOf(s, pal);
        const hr = Math.max(6, W * 0.1);
        legSVG = drawLegs({ hips, floor: oy, cx: ox, W, LL, hr, aw: hr * 0.55, fill: skin?.solid || s.body.color, line: ol ? ol.color : pal.line, lw: ol ? R(Math.min(ol.w, 3.2)) : 1.8 }, legs.k, rm ? 0 : t - legs.start, legs);
      }
    }
    if (legSVG !== keys.legs) { g.legs.innerHTML = legSVG; keys.legs = legSVG; }

    // 9) zoom del encuadre para que quepan alas, manos, pinchos…
    const zt = canZoom ? room : 1;
    if (zoom !== zt) {
      zoom = rm ? zt : approach(zoom, zt, dt, 180);
      if (!settle(zoom, zt, 0.002)) zoom = zt;
      else busy = true;
      applyViewBox();
    }

    // 10) cara y cuerpo
    paintFace(faceState());
    const talk = mo.open;
    const sx = pose.sx * (1 - 0.015 * talk);
    const sy = pose.sy * (1 + 0.03 * talk);
    const r = pose.r + (rm ? 0 : look.x * 2);
    const ox = L0.cx;
    const oy = L0.box.y + L0.box.h;
    const tf = `translate(${R(ox + pose.x * L0.box.w)} ${R(oy + pose.y * L0.box.h - legLift)}) rotate(${R(r)}) scale(${R(sx * 1000) / 1000} ${R(sy * 1000) / 1000}) translate(${R(-ox)} ${R(-oy)})`;
    if (tf !== keys.rig) { g.rig.setAttribute('transform', tf); keys.rig = tf; }

    if (busy) raf = requestAnimationFrame(frame);
  }

  // ── parpadeo y miradas espontáneas ──
  function blink() {
    if (!alive) return;
    blinkAt = nowMs();
    wake();
  }
  function idleTick() {
    clearTimeout(blinkT);
    if (!alive || !idle) return;
    blinkT = setTimeout(() => {
      if (moodName !== 'sleep' && !reduced()) {
        blink();
        if (Math.random() < 0.2) setTimeout(blink, 240);
        // si nadie le dice dónde mirar, mira alrededor de vez en cuando
        if (nowMs() - look.at > 3000 && Math.random() < 0.45) {
          const back = Math.abs(look.tx) + Math.abs(look.ty) > 0.1 && Math.random() < 0.6;
          look.tx = back ? 0 : (Math.random() - 0.5) * 0.9;
          look.ty = back ? 0 : (Math.random() - 0.5) * 0.5;
          wake();
        }
      }
      idleTick();
    }, 1800 + Math.random() * 3600);
  }

  // ── gestos ──
  function endGesture() {
    if (!gest) return;
    const old = gest;
    gest = null;
    g.rig?.setAttribute('class', 'otsc-rig');
    if (legs) legs.on = false;
    const hands = morphs.get('hands');
    if (old.def.hands && hands && !hands.byGesture && hands.userPose !== undefined) setPose(hands, hands.userPose);
    const wings = morphs.get('wings');
    if (old.def.wings && wings && !wings.byGesture) wings.o.flap = wings.userFlap;
  }

  function gesture(name, o = {}) {
    const gname = Object.hasOwn(GESTURES, name) ? name : GESTURE_ALIAS[name];
    if (!gname || !g.rig || !alive) return false;
    if (typeof o === 'number') o = { ms: o };
    const def = GESTURES[gname];
    const t = nowMs();
    const ms = clamp(Number(o.ms) || def.ms, 200, 60000);
    const dir = o.dir === -1 || o.mirror === true ? -1 : 1;
    const from = gest ? { ...pose } : null;
    if (gest) endGesture();
    gest = { name: gname, def, start: t, ms, dir, from, fired: new Set() };
    g.rig.setAttribute('class', `otsc-rig otsc-g-${gname}`);
    // patas: los bailes las sacan (si ya estaban, solo cambian de paso)
    if (def.legs && opts.legs !== false) legs = { pose: def.legs, dir, k: legs?.k || 0, on: true, start: legs?.start ?? t };
    // manos y alas que necesita el gesto (si ya estaban, solo cambian de postura)
    const hands = morphs.get('hands');
    if (def.hands) {
      if (hands && hands.phase !== 'out') {
        setPose(hands, def.hands);
        hands.o.dir = dir;
        if (hands.byGesture) hands.until = t + ms - MORPH_OUT;
      } else morph('hands', { pose: def.hands, dir, ms: ms - MORPH_OUT, byGesture: true });
    } else if (hands?.byGesture && hands.phase !== 'out') hands.until = t;
    const wings = morphs.get('wings');
    if (def.wings) {
      if (wings && wings.phase !== 'out') {
        wings.o.flap = def.wings;
        if (wings.byGesture) wings.until = t + ms - MORPH_OUT;
      } else morph('wings', { flap: def.wings, ms: ms - MORPH_OUT, byGesture: true });
    } else if (wings?.byGesture && wings.phase !== 'out') wings.until = t;
    wake();
    return true;
  }

  // ── metamorfosis ──
  function setPose(m, p) {
    if (m.o.pose === p) return;
    m.o.from = m.o.pose;
    m.o.pose = p;
    m.o.blend = 0;
    m.poseAt = nowMs();
  }

  function morph(name, o = {}) {
    if (typeof name !== 'string' || !alive) return false;
    if (o === false) return unmorph(name);
    if (typeof o === 'number') o = { ms: o };
    if (!Object.hasOwn(MORPHS, name) && Object.hasOwn(EFFECTS, name)) return effect(name, o);
    let def;
    let slot = name;
    let target = null;
    if (name.startsWith('shape:')) {
      target = shapePoints(name.slice(6));
      if (!target) return false;
      def = { room: 1.12, shape: true };
      slot = 'shape';
    } else if (Object.hasOwn(MORPHS, name)) def = MORPHS[name];
    else return false;
    const t = nowMs();
    const hold = o.hold === true || o.ms === Infinity;
    const ms = hold ? Infinity : clamp(Number(o.ms) || MORPH_MS, 200, 600000);
    const user = !o.byGesture;
    const ex = morphs.get(slot);
    if (ex) {
      if (ex.phase === 'out') { ex.phase = 'in'; ex.start = t - MORPH_IN * clamp(ex.k); }
      ex.until = Math.max(user ? 0 : ex.until, t + ms);
      if (user) ex.byGesture = false;
      if (slot === 'shape' && ex.target !== target) {
        const b = ex.prev ? EASE.inOut(clamp((t - ex.bAt) / 420)) : 1;
        ex.prev = b < 1 ? mixPts(ex.prev, ex.target, b) : ex.target;
        ex.target = target;
        ex.bAt = t;
      }
      if (o.pose) setPose(ex, o.pose);
      if (o.dir) ex.o.dir = o.dir;
      if (o.flap) ex.o.flap = o.flap;
      if (o.color) ex.o.color = o.color;
      if (user) { ex.userPose = ex.o.pose; ex.userFlap = ex.o.flap; }
    } else {
      const mo2 = { pose: name === 'hands' ? o.pose || 'rest' : undefined, dir: o.dir === -1 ? -1 : 1, flap: o.flap, color: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : undefined };
      morphs.set(slot, {
        name: slot, def, start: t, until: t + ms, phase: 'in', k: 0, o: mo2, target, prev: null, bAt: t,
        byGesture: !user, userPose: user ? mo2.pose : undefined, userFlap: user ? mo2.flap : undefined,
      });
    }
    wake();
    return true;
  }

  function unmorph(name) {
    const t = nowMs();
    const slot = typeof name === 'string' && name.startsWith('shape') ? 'shape' : name;
    for (const [k, m] of morphs) {
      if (slot && k !== slot) continue;
      if (m.phase !== 'out') { m.phase = 'out'; m.outAt = t; m.k0 = m.k; }
    }
    wake();
    return true;
  }

  // ── efectos ──
  function effect(name, o = {}) {
    if (typeof name !== 'string' || !alive) return false;
    if (typeof o === 'number') o = { ms: o };
    if (Object.hasOwn(MORPHS, name) || name.startsWith('shape:')) return morph(name, o);
    if (!Object.hasOwn(EFFECTS, name)) return false;
    const def = EFFECTS[name];
    const ms = clamp(Number(o.ms) || (def.loop ? def.ms * 1.5 : def.ms), 100, 600000);
    fxs.push({
      name, def, start: nowMs(), ms, cycle: def.ms, loop: !!def.loop || o.hold === true, hold: o.hold === true,
      dir: o.dir === -1 ? -1 : 1, o, tag: o.tag, seed: (++fxSeq * 7919) ^ uidSeq, end: null,
    });
    if (fxs.length > 24) fxs.shift();
    wake();
    return true;
  }
  function clearEffects(name) {
    const t = nowMs();
    for (const f of fxs) if (!name || f.name === name || f.tag === name) f.end ??= t;
    wake();
  }

  // ── voz / lip-sync ──
  function endSpeech() {
    const sp = speech;
    speech = null;
    mo.target = 0;
    mo.tmsx = 1;
    sp?.resolve?.();
    wake();
  }

  /** Recorre una secuencia de visemas en `dur` ms; devuelve la «voz» con tick/sync. */
  function visemeTrack(seq, dur) {
    let W = 0;
    for (const it of seq) { it.t0 = W; W += it.w; }
    const tr = {
      start: nowMs(),
      idx: 0,
      at(t) {
        const pos = (clamp((t - tr.start) / dur) * W);
        if (pos < seq[tr.idx].t0) tr.idx = 0;
        while (tr.idx < seq.length - 1 && seq[tr.idx + 1].t0 <= pos) tr.idx++;
        const it = seq[tr.idx];
        return { v: VISEMES[it.v] || VISEMES.X, local: clamp((pos - it.t0) / (it.w || 1)) };
      },
      done: (t) => t - tr.start >= dur,
      /** Realinea con el índice de carácter que se está pronunciando (evento boundary del TTS). */
      sync(charIndex) {
        const i = seq.findIndex((it) => it.c >= charIndex);
        if (i < 0) return;
        tr.start = nowMs() - (seq[i].t0 / W) * dur;
        tr.idx = 0;
      },
    };
    return tr;
  }

  function speak(input, o = {}) {
    stopSpeaking();
    let seq;
    let dur;
    if (typeof input === 'number') {
      dur = clamp(input, 0, 600000);
      seq = babbleVisemes(dur, Math.floor(Math.random() * 1e6));
    } else {
      const text = String(input ?? '');
      seq = textToVisemes(text);
      dur = Number(o.durationMs) || Math.max(300, (text.length / 14 / (Number(o.rate) || 1)) * 1000);
    }
    let resolve;
    const pr = new Promise((r) => { resolve = r; });
    if (!seq.length || !dur || !alive) {
      resolve();
      return Object.assign(pr, { stop() {}, sync() {} });
    }
    const gain = Number(o.gain) || 1;
    const tr = visemeTrack(seq, dur);
    const sp = {
      resolve,
      tick(t) {
        if (tr.done(t)) return false;
        const { v, local } = tr.at(t);
        mo.target = clamp(v.open * (0.82 + 0.18 * Math.sin(Math.PI * local)) * gain);
        mo.tmsx = v.w;
        return true;
      },
    };
    speech = sp;
    wake();
    return Object.assign(pr, {
      stop() { if (speech === sp) endSpeech(); },
      sync(i) { if (speech === sp) tr.sync(i); },
    });
  }

  function lipsync(analyser, o = {}) {
    stopSpeaking();
    if (!analyser || typeof analyser.getByteFrequencyData !== 'function' || !alive) return () => {};
    const n = analyser.fftSize || 512;
    const buf = new Float32Array(n);
    const bytes = new Uint8Array(n);
    const freq = new Uint8Array(analyser.frequencyBinCount || n / 2);
    const rate = analyser.context?.sampleRate || 48000;
    const binHz = rate / n;
    const maxBin = Math.min(freq.length, Math.ceil(4000 / binHz));
    const gain = Number(o.gain) || 1;
    const tr = o.text ? visemeTrack(textToVisemes(o.text), Number(o.durationMs) || Math.max(300, (String(o.text).length / 14) * 1000)) : null;
    let peak = 0.05;
    const sp = {
      tick(t) {
        if (analyser.context?.state === 'closed') return false;
        let rms = 0;
        if (typeof analyser.getFloatTimeDomainData === 'function') {
          analyser.getFloatTimeDomainData(buf);
          for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
        } else {
          analyser.getByteTimeDomainData(bytes);
          for (let i = 0; i < n; i++) { const v = (bytes[i] - 128) / 128; rms += v * v; }
        }
        rms = Math.sqrt(rms / n);
        // ganancia automática: lo que cuenta es el nivel relativo al pico reciente
        peak = Math.max(rms, peak * 0.995, 0.02);
        const lvl = clamp((rms - 0.006) / (peak * 0.7));
        const open = clamp(lvl ** 0.8 * gain);
        let w = 1;
        if (tr && !tr.done(t)) w = tr.at(t).v.w;
        else if (open > 0.05) {
          // timbre: centroide espectral bajo → boca redonda (o/u), alto → estirada (e/i)
          analyser.getByteFrequencyData(freq);
          let a = 0;
          let b = 0;
          for (let i = 1; i < maxBin; i++) { a += i * freq[i]; b += freq[i]; }
          const cHz = b ? (a / b) * binHz : 1000;
          w = clamp(0.6 + ((cHz - 500) / 1600) * 0.65, 0.6, 1.25);
        }
        mo.target = open;
        mo.tmsx = lerp(1, w, clamp(open * 2));
        return true;
      },
    };
    speech = sp;
    wake();
    return () => { if (speech === sp) endSpeech(); };
  }

  function stopSpeaking() {
    if (speech) endSpeech();
  }

  px = container.clientWidth || px;
  build();
  idleTick();
  // Si se montó oculto, reencuadrar al hacerse visible.
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      // tamaño en pantalla: decide si la textura se ve (ver detail)
      px = container.clientWidth || px;
      fit();
      if (detail(keys.body) !== keys.detail) wake();
    });
    ro.observe(container);
  }

  return {
    svg,
    get spec() { return structuredClone(src); },
    /** Lo que está pasando ahora: ánimo, gesto, metamorfosis y efectos activos. */
    get state() {
      return { mood: moodName, gesture: gest?.name || null, morphs: [...morphs.keys()].filter((k) => morphs.get(k).phase !== 'out'), effects: fxs.map((f) => f.name), speaking: !!speech };
    },
    /** Apertura de boca 0..1 (lip-sync manual); se suaviza con ataque y relajación. */
    mouth(v) {
      mo.target = clamp(Number(v) || 0);
      wake();
    },
    /** Forma de boca: visema 'A','E','I','O','U','M','F','S','C' o 'X' (con apertura opcional). */
    viseme(id, open) {
      const v = VISEMES[id] || VISEMES.X;
      mo.target = clamp(open ?? v.open);
      mo.tmsx = v.w;
      wake();
      return !!VISEMES[id];
    },
    speak,
    lipsync,
    stopSpeaking,
    blink,
    /** Mirada: x,y en -1..1. */
    lookAt(x, y) {
      look.tx = clamp(Number(x) || 0, -1, 1);
      look.ty = clamp(Number(y) || 0, -1, 1);
      look.at = nowMs();
      wake();
    },
    /** Mirar hacia un punto de la pantalla. */
    lookAtPoint(clientX, clientY) {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      this.lookAt((clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), (clientY - (r.top + r.height * 0.45)) / (window.innerHeight / 2));
    },
    /** Ánimo (se interpola); { fx: false } para no lanzar su efecto. */
    mood(name, o = {}) {
      if (!MOOD[name]) return false;
      if (name === moodName) return true;
      moodName = name;
      clearEffects('mood');
      if (moodFx && o.fx !== false) for (const [fx, fo] of MOOD_FX[name] || []) effect(fx, fo || {});
      wake();
      return true;
    },
    /** Gesto de CHARACTER_GESTURES (o alias). o: { ms, dir: 1|-1, mirror } */
    gesture,
    /** Metamorfosis temporal: 'spikes'|'wings'|'hands'|'horns'|'puff'|'squish'|'stretch'|'melt'|'jelly'|'shape:<id>'. */
    morph,
    unmorph,
    /** Efecto de CHARACTER_EFFECTS: 'sparkles','sweat','blush','hearts','zzz','exclaim'… o: { ms, hold, dir } */
    effect,
    clearEffects,
    update(next) {
      src = normalizeCharacter(next);
      s = stylizeSpec(applyMods(src, normalizeCharacter));
      uid = `otsc${(++uidSeq).toString(36)}`;
      morphMask = '';
      build();
      wake();
    },
    destroy() {
      alive = false;
      clearTimeout(blinkT);
      cancelAnimationFrame(raf);
      speech = null;
      ro?.disconnect();
      svg.remove();
    },
  };
}

export { SHAPES, EYES, BROWS, MOUTHS, CHEEKS, PATTERNS, FINISHES, TEXTURES, ACCESSORIES, PRESETS, BODY_POINTS };
export { ACCESSORY_GROUPS, partLabel } from './parts.js';
export { STYLES as CHARACTER_STYLES } from './styles.js';
export { normalizeMods, normalizeMod, sanitizeSvg, modName, MOD_ANCHORS, MAX_MODS } from './mods.js';
