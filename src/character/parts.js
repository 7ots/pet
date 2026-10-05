/**
 * Catálogo de piezas del personaje 2D de 7ots (arte vectorial propio, MIT).
 *
 * Sistema de coordenadas: viewBox 0 0 200 200. Cada pieza se dibuja centrada en su ancla
 * (0,0) y el renderizador la coloca: ojos y cejas en cada ojo, boca en la boca, accesorios
 * en su ancla (top · eyes · nose · mouth · neck · center · bottom · shoulder).
 *
 * Añadir piezas: push a EYES / MOUTHS / ACCESSORIES… con { id, label, … }. Las funciones
 * devuelven un string SVG; nunca incluyen datos del usuario sin pasar por el saneado de
 * Character.js (colores hex y números).
 *
 * Nombres visibles: el `label` de cada pieza es solo el respaldo en español; la interfaz usa
 * partLabel(t, tipo, id), que lee `character.<tipo>.<id>` del catálogo de i18n
 * (src/i18n/messages/character.js). Una pieza nueva debe añadir su texto en es/en/pt allí
 * (o con addMessages desde el sitio).
 */

import '../i18n/messages/character.js';
import { t as globalT, addCatalog } from '../i18n/index.js';
import moreEyes from './more/eyes.js';
import moreBrows from './more/brows.js';
import moreMouths from './more/mouths.js';
import moreCheeks from './more/cheeks.js';
import morePatterns from './more/patterns.js';
import moreAccHead from './more/acc-head.js';
import moreAccRest from './more/acc-rest.js';

const n = (v) => Math.round(v * 100) / 100;

/**
 * Nombre traducido de una pieza del catálogo.
 * @param {(key:string, vars?:object)=>string} [t]  traductor (translator(locale)); por defecto el global
 * @param {'shapes'|'eyes'|'brows'|'mouths'|'cheeks'|'patterns'|'finishes'|'textures'|'accessories'|'groups'|'presets'|'moods'|'gestures'|'morphs'|'effects'} kind
 * @param {string} id
 * @returns {string} el texto traducido, el `label` en español de la pieza o, en último caso, el id
 */
export function partLabel(t, kind, id) {
  const tr = t || globalT;
  const key = `character.${kind}.${id}`;
  const s = tr(key);
  if (s !== key) return s;
  const list = CATALOG[kind];
  const part = list?.find((x) => (Array.isArray(x) ? x[0] : x.id) === id);
  return (Array.isArray(part) ? part[1] : part?.label) || String(id);
}

// ───────────────────────────── color ─────────────────────────────

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
}
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** Mezcla con blanco (amt>0) o negro (amt<0). */
export function shade(hex, amt) {
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return toHex(hexToRgb(hex).map((v) => v + (t - v) * p));
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ───────────────────────────── formas del cuerpo ─────────────────────────────

/** Nº de puntos de control del contorno (editable arrastrando). Simétricos: i ↔ N-i. */
export const BODY_POINTS = 16;

/**
 * Superelipse asimétrica: medias anchuras/alturas distintas arriba y abajo, y "cuadratura" n.
 * @returns {number[][]} 16 puntos [x,y] empezando arriba y en sentido horario
 */
function superShape({ cx = 100, cy = 112, rxT = 60, rxB = 60, ryT = 66, ryB = 66, nT = 2, nB = 2, tweak } = {}) {
  const pts = [];
  for (let i = 0; i < BODY_POINTS; i++) {
    const a = -Math.PI / 2 + (i / BODY_POINTS) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const top = s < 0;
    const e = 2 / (top ? nT : nB);
    const rx = top ? rxT : rxB;
    const w = Math.abs(s) < 1e-9 ? rx : rx; // continuidad lateral
    let x = cx + w * Math.sign(c) * Math.abs(c) ** e;
    let y = cy + (top ? ryT : ryB) * Math.sign(s) * Math.abs(s) ** e;
    if (tweak) [x, y] = tweak(i, x, y);
    pts.push([n(x), n(y)]);
  }
  return pts;
}

export const SHAPES = [
  { id: 'pou', label: 'Pou', points: superShape({ rxT: 50, rxB: 66, ryT: 70, ryB: 56, nT: 2.1, nB: 2.6 }) },
  { id: 'round', label: 'Redondo', points: superShape({ rxT: 64, rxB: 64, ryT: 64, ryB: 64 }) },
  { id: 'egg', label: 'Huevo', points: superShape({ rxT: 50, rxB: 60, ryT: 76, ryB: 56 }) },
  { id: 'pear', label: 'Pera', points: superShape({ rxT: 40, rxB: 70, ryT: 72, ryB: 52, nB: 2.4 }) },
  { id: 'bean', label: 'Judía', points: superShape({ rxT: 56, rxB: 56, ryT: 74, ryB: 62, nT: 2.6, nB: 2.6 }) },
  { id: 'squircle', label: 'Cuadrado suave', points: superShape({ rxT: 62, rxB: 62, ryT: 64, ryB: 60, nT: 4, nB: 4 }) },
  { id: 'wide', label: 'Ancho', points: superShape({ rxT: 74, rxB: 78, ryT: 50, ryB: 50, nT: 2.4, nB: 3 }) },
  { id: 'tall', label: 'Alto', points: superShape({ rxT: 46, rxB: 50, ryT: 82, ryB: 70, nT: 2.4, nB: 2.8 }) },
  { id: 'drop', label: 'Gota', points: superShape({ rxT: 34, rxB: 62, ryT: 82, ryB: 56, nT: 1.3, nB: 2.2 }) },
  {
    id: 'ghost',
    label: 'Fantasma',
    points: superShape({
      rxT: 58, rxB: 62, ryT: 70, ryB: 64, nT: 2, nB: 5,
      tweak: (i, x, y) => (i >= 6 && i <= 10 ? [x, y + (i % 2 ? -10 : 6)] : [x, y]),
    }),
  },
  {
    id: 'cat',
    label: 'Orejas',
    points: superShape({
      rxT: 58, rxB: 64, ryT: 64, ryB: 58, nT: 2.4, nB: 2.6,
      tweak: (i, x, y) => (i === 2 || i === 14 ? [x + (i === 2 ? 6 : -6), y - 30] : i === 1 || i === 15 ? [x, y + 6] : [x, y]),
    }),
  },
  {
    id: 'cloud',
    label: 'Nube',
    points: superShape({ rxT: 66, rxB: 70, ryT: 58, ryB: 56, tweak: (i, x, y) => (i % 2 ? [100 + (x - 100) * 0.9, 112 + (y - 112) * 0.9] : [x, y]) }),
  },
  { id: 'blob', label: 'Blandito', points: superShape({ rxT: 58, rxB: 68, ryT: 66, ryB: 58, tweak: (i, x, y) => [x + Math.sin(i * 1.7) * 5, y + Math.cos(i * 2.3) * 4] }) },
  { id: 'robot', label: 'Robot', points: superShape({ rxT: 60, rxB: 60, ryT: 66, ryB: 62, nT: 7, nB: 7 }) },
  {
    id: 'heart',
    label: 'Corazón',
    points: superShape({
      rxT: 70, rxB: 64, ryT: 58, ryB: 70, nT: 2.4, nB: 1.6,
      tweak: (i, x, y) => (i === 0 ? [x, y + 22] : i === 1 || i === 15 ? [x, y + 4] : i === 8 ? [x, y + 6] : [x, y]),
    }),
  },
  { id: 'mushroom', label: 'Seta', points: superShape({ rxT: 78, rxB: 46, ryT: 62, ryB: 64, nT: 2.2, nB: 3.2 }) },
  // ── catálogo 2 (2026-10): añadidas al final; las semillas antiguas no las sacan (ver CATALOG_V1) ──
  {
    id: 'peanut',
    label: 'Cacahuete', en: 'Peanut', pt: 'Amendoim',
    points: superShape({ rxT: 56, rxB: 64, ryT: 72, ryB: 60, nT: 2.2, nB: 2.4, tweak: (i, x, y) => (i === 4 || i === 12 ? [100 + (x - 100) * 0.84, y + 4] : i === 3 || i === 13 ? [100 + (x - 100) * 1.04, y] : [x, y]) }),
  },
  { id: 'onigiri', label: 'Onigiri', en: 'Onigiri', pt: 'Onigiri', points: superShape({ rxT: 40, rxB: 72, ryT: 74, ryB: 54, nT: 1.5, nB: 3.4 }) },
  { id: 'bell', label: 'Campana', en: 'Bell', pt: 'Sino', points: superShape({ rxT: 48, rxB: 74, ryT: 72, ryB: 54, nT: 2.2, nB: 5.5 }) },
  { id: 'bun', label: 'Bollito', en: 'Bun', pt: 'Pãozinho', points: superShape({ rxT: 70, rxB: 74, ryT: 70, ryB: 40, nT: 2.1, nB: 5 }) },
  {
    id: 'bear',
    label: 'Osito', en: 'Teddy', pt: 'Ursinho',
    points: superShape({
      rxT: 60, rxB: 64, ryT: 62, ryB: 60, nT: 2.3, nB: 2.4,
      tweak: (i, x, y) => (i === 2 || i === 14 ? [x + (i === 2 ? 14 : -14), y - 16] : i === 1 || i === 15 ? [x, y + 6] : [x, y]),
    }),
  },
  { id: 'potato', label: 'Patata', en: 'Potato', pt: 'Batata', points: superShape({ rxT: 62, rxB: 66, ryT: 62, ryB: 58, nT: 2.3, nB: 2.5, tweak: (i, x, y) => [x + Math.sin(i * 2.9 + 1) * 6, y + Math.cos(i * 1.3 + 2) * 6] }) },
  { id: 'gem', label: 'Gema', en: 'Gem', pt: 'Gema', points: superShape({ rxT: 66, rxB: 66, ryT: 66, ryB: 70, nT: 1.35, nB: 1.35 }) },
  { id: 'chubby', label: 'Rechoncho', en: 'Chubby', pt: 'Fofinho', points: superShape({ rxT: 58, rxB: 82, ryT: 60, ryB: 46, nT: 2.2, nB: 3.2 }) },
  { id: 'capsule', label: 'Cápsula', en: 'Capsule', pt: 'Cápsula', points: superShape({ rxT: 48, rxB: 48, ryT: 78, ryB: 72, nT: 2.6, nB: 2.6 }) },
  { id: 'barrel', label: 'Tonel', en: 'Barrel', pt: 'Barril', points: superShape({ rxT: 64, rxB: 64, ryT: 64, ryB: 62, nT: 3, nB: 3, tweak: (i, x, y) => (i === 4 || i === 12 ? [100 + (x - 100) * 1.06, y] : [x, y]) }) },
  { id: 'flame', label: 'Llama', en: 'Flame', pt: 'Chama', points: superShape({ rxT: 40, rxB: 64, ryT: 80, ryB: 54, nT: 1.6, nB: 2.4, tweak: (i, x, y) => (i === 0 ? [x + 16, y + 4] : i === 1 ? [x + 6, y] : i === 15 ? [x + 8, y] : [x, y]) }) },
  {
    id: 'owl',
    label: 'Búho', en: 'Owl', pt: 'Coruja',
    points: superShape({
      rxT: 60, rxB: 64, ryT: 62, ryB: 60, nT: 3, nB: 2.4,
      tweak: (i, x, y) => (i === 2 || i === 14 ? [x + (i === 2 ? 4 : -4), y - 20] : i === 1 || i === 15 ? [x, y + 10] : i === 0 ? [x, y + 10] : [x, y]),
    }),
  },
  { id: 'slime', label: 'Slime', en: 'Slime', pt: 'Slime', points: superShape({ rxT: 56, rxB: 80, ryT: 78, ryB: 30, nT: 2, nB: 6, tweak: (i, x, y) => (i >= 6 && i <= 10 ? [x, y + (i % 2 ? 4 : -1)] : [x, y]) }) },
  { id: 'apple', label: 'Manzana', en: 'Apple', pt: 'Maçã', points: superShape({ rxT: 64, rxB: 60, ryT: 62, ryB: 62, nT: 2.4, nB: 2.2, tweak: (i, x, y) => (i === 0 ? [x, y + 12] : i === 1 || i === 15 ? [x, y + 2] : [x, y]) }) },
  { id: 'lemon', label: 'Limón', en: 'Lemon', pt: 'Limão', points: superShape({ rxT: 70, rxB: 70, ryT: 56, ryB: 56, nT: 2, nB: 2, tweak: (i, x, y) => (i === 4 || i === 12 ? [x + (i === 4 ? 12 : -12), y] : [x, y]) }) },
  { id: 'alien', label: 'Alien', en: 'Alien', pt: 'Alienígena', points: superShape({ rxT: 72, rxB: 44, ryT: 64, ryB: 66, nT: 2.3, nB: 1.7 }) },
];

// ───────────────────────────── ojos ─────────────────────────────
// p = { r, lx, ly (-1..1 mirada), side (-1 izq, 1 der), iris, ink, white, lid (color párpado), mood }

const shine = (x, y, r, o = 1) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#fff" opacity="${o}"/>`;
const star = (r, k = 0.45, pts = 5) => {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / pts;
    const rr = i % 2 ? r * k : r;
    d += `${i ? 'L' : 'M'}${n(Math.cos(a) * rr)} ${n(Math.sin(a) * rr)}`;
  }
  return `${d}Z`;
};
const heartPath = (r) => `M0 ${n(r * 0.9)}C${n(-r * 1.4)} ${n(-r * 0.1)} ${n(-r * 0.7)} ${n(-r * 1.05)} 0 ${n(-r * 0.35)}C${n(r * 0.7)} ${n(-r * 1.05)} ${n(r * 1.4)} ${n(-r * 0.1)} 0 ${n(r * 0.9)}Z`;
const look = (p, k) => [n(p.lx * p.r * k), n(p.ly * p.r * k)];
const pupil = (p, rr, k = 0.35, color = p.ink) => {
  const [x, y] = look(p, k);
  return `<circle cx="${x}" cy="${y}" r="${n(rr)}" fill="${color}"/>${shine(x - rr * 0.35, y - rr * 0.4, rr * 0.32)}`;
};

export const EYES = [
  { id: 'round', label: 'Redondos', draw: (p) => `<circle r="${p.r}" fill="${p.white}"/>${pupil(p, p.r * 0.55)}` },
  { id: 'dot', label: 'Puntitos', draw: (p) => { const [x, y] = look(p, 0.15); return `<ellipse cx="${x}" cy="${y}" rx="${n(p.r * 0.42)}" ry="${n(p.r * 0.58)}" fill="${p.ink}"/>${shine(x - p.r * 0.12, y - p.r * 0.22, p.r * 0.14)}`; } },
  { id: 'kawaii', label: 'Kawaii', draw: (p) => { const [x, y] = look(p, 0.1); return `<circle cx="${x}" cy="${y}" r="${n(p.r * 0.95)}" fill="${p.ink}"/>${shine(x - p.r * 0.32, y - p.r * 0.34, p.r * 0.34)}${shine(x + p.r * 0.34, y + p.r * 0.36, p.r * 0.16)}`; } },
  {
    id: 'anime',
    label: 'Anime',
    draw: (p) => {
      const [x, y] = look(p, 0.22);
      return `<ellipse rx="${n(p.r * 0.9)}" ry="${n(p.r * 1.2)}" fill="${p.white}"/>
        <ellipse cx="${x}" cy="${n(y + p.r * 0.1)}" rx="${n(p.r * 0.66)}" ry="${n(p.r * 0.92)}" fill="${p.iris}"/>
        <ellipse cx="${x}" cy="${n(y + p.r * 0.34)}" rx="${n(p.r * 0.5)}" ry="${n(p.r * 0.5)}" fill="${shade(p.iris, 0.35)}" opacity=".7"/>
        <ellipse cx="${x}" cy="${n(y + p.r * 0.05)}" rx="${n(p.r * 0.3)}" ry="${n(p.r * 0.46)}" fill="${p.ink}"/>
        ${shine(x - p.r * 0.26, y - p.r * 0.36, p.r * 0.24)}${shine(x + p.r * 0.24, y + p.r * 0.4, p.r * 0.1)}
        <path d="M${n(-p.r * 1.05)} ${n(-p.r * 0.7)}Q0 ${n(-p.r * 1.6)} ${n(p.r * 1.05)} ${n(-p.r * 0.7)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.28)}" fill="none" stroke-linecap="round"/>`;
    },
  },
  { id: 'cat', label: 'Gato', draw: (p) => { const [x, y] = look(p, 0.3); return `<ellipse rx="${n(p.r)}" ry="${n(p.r * 0.95)}" fill="${p.iris}"/><ellipse cx="${x}" cy="${y}" rx="${n(p.r * 0.16)}" ry="${n(p.r * 0.8)}" fill="${p.ink}"/>${shine(x - p.r * 0.4, y - p.r * 0.4, p.r * 0.16)}`; } },
  { id: 'sleepy', label: 'Dormilones', draw: (p) => `<circle r="${p.r}" fill="${p.white}"/>${pupil(p, p.r * 0.55, 0.3)}<path d="M${-p.r - 1} ${n(-p.r - 1)}H${p.r + 1}V${n(p.r * 0.05)}Q0 ${n(p.r * 0.35)} ${-p.r - 1} ${n(p.r * 0.05)}Z" fill="${p.lid}"/><path d="M${-p.r} ${n(p.r * 0.05)}Q0 ${n(p.r * 0.35)} ${p.r} ${n(p.r * 0.05)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.14)}" fill="none" stroke-linecap="round"/>` },
  { id: 'happy', label: 'Felices', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.9)} ${n(p.r * 0.3)}Q0 ${n(-p.r * 1.1)} ${n(p.r * 0.9)} ${n(p.r * 0.3)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.3)}" fill="none" stroke-linecap="round"/>` },
  { id: 'closed', label: 'Cerrados', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.9)} ${n(-p.r * 0.1)}Q0 ${n(p.r * 0.8)} ${n(p.r * 0.9)} ${n(-p.r * 0.1)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.26)}" fill="none" stroke-linecap="round"/>` },
  {
    id: 'wink',
    label: 'Guiño',
    draw: (p) =>
      p.side > 0
        ? `<path d="M${n(-p.r * 0.9)} 0Q0 ${n(-p.r * 0.9)} ${n(p.r * 0.9)} 0" stroke="${p.ink}" stroke-width="${n(p.r * 0.28)}" fill="none" stroke-linecap="round"/>`
        : `<circle r="${p.r}" fill="${p.white}"/>${pupil(p, p.r * 0.55)}`,
  },
  { id: 'star', label: 'Estrellas', draw: (p) => `<path d="${star(p.r * 1.1)}" fill="${p.iris}" stroke="${shade(p.iris, -0.35)}" stroke-width="${n(p.r * 0.12)}" stroke-linejoin="round"/>${shine(-p.r * 0.25, -p.r * 0.3, p.r * 0.16)}` },
  { id: 'heart', label: 'Corazones', draw: (p) => `<path d="${heartPath(p.r * 1.05)}" fill="#ef3b5d"/>${shine(-p.r * 0.4, -p.r * 0.3, p.r * 0.18)}` },
  { id: 'cross', label: 'K.O.', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.7)} ${n(-p.r * 0.7)}L${n(p.r * 0.7)} ${n(p.r * 0.7)}M${n(p.r * 0.7)} ${n(-p.r * 0.7)}L${n(-p.r * 0.7)} ${n(p.r * 0.7)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.28)}" stroke-linecap="round"/>` },
  {
    id: 'spiral',
    label: 'Mareado',
    noBlink: true,
    draw: (p) => {
      let d = '';
      for (let t = 0; t <= 14; t += 0.35) {
        const rr = (t / 14) * p.r;
        d += `${t ? 'L' : 'M'}${n(Math.cos(t * p.side) * rr)} ${n(Math.sin(t * p.side) * rr)}`;
      }
      return `<circle r="${p.r}" fill="${p.white}"/><path d="${d}" stroke="${p.ink}" stroke-width="${n(p.r * 0.14)}" fill="none" stroke-linecap="round"/>`;
    },
  },
  { id: 'angry', label: 'Enfadados', draw: (p) => `<circle r="${p.r}" fill="${p.white}"/>${pupil(p, p.r * 0.5, 0.3)}<path d="M${n(-p.r * 1.3 * p.side)} ${n(-p.r * 1.3)}L${n(p.r * 1.3 * p.side)} ${n(-p.r * 1.3)}L${n(p.r * 1.3 * p.side)} ${n(-p.r * 0.05)}Z" fill="${p.lid}"/><path d="M${n(-p.r * 1.1 * p.side)} ${n(-p.r * 0.75)}L${n(p.r * 1.1 * p.side)} ${n(-p.r * 0.05)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.2)}" stroke-linecap="round"/>` },
  { id: 'sad', label: 'Tristes', draw: (p) => `<circle r="${p.r}" fill="${p.white}"/>${pupil(p, p.r * 0.5, 0.3)}<path d="M${n(-p.r * 1.3 * p.side)} ${n(-p.r * 1.3)}L${n(p.r * 1.3 * p.side)} ${n(-p.r * 1.3)}L${n(p.r * 1.3 * p.side)} ${n(-p.r * 0.7)}L${n(-p.r * 1.3 * p.side)} ${n(-p.r * 0.05)}Z" fill="${p.lid}"/><path d="M${n(-p.r * 1.1 * p.side)} ${n(-p.r * 0.1)}L${n(p.r * 1.1 * p.side)} ${n(-p.r * 0.75)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.2)}" stroke-linecap="round"/>` },
  { id: 'wide', label: 'Asombrados', draw: (p) => `<circle r="${n(p.r * 1.15)}" fill="${p.white}" stroke="${p.ink}" stroke-width="${n(p.r * 0.08)}"/>${pupil(p, p.r * 0.28, 0.6)}` },
  { id: 'button', label: 'Botón', noBlink: true, draw: (p) => `<circle r="${p.r}" fill="${p.ink}"/><circle r="${n(p.r * 0.78)}" fill="none" stroke="${shade(p.ink, 0.25)}" stroke-width="${n(p.r * 0.1)}"/>${[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => `<circle cx="${n(a * p.r * 0.3)}" cy="${n(b * p.r * 0.3)}" r="${n(p.r * 0.14)}" fill="${shade(p.ink, 0.45)}"/>`).join('')}` },
  { id: 'robot', label: 'LED', draw: (p) => `<rect x="${n(-p.r)}" y="${n(-p.r * 0.8)}" width="${n(p.r * 2)}" height="${n(p.r * 1.6)}" rx="${n(p.r * 0.35)}" fill="#0b1220"/><rect x="${n(-p.r * 0.7 + p.lx * p.r * 0.25)}" y="${n(-p.r * 0.5 + p.ly * p.r * 0.2)}" width="${n(p.r * 1.4)}" height="${n(p.r)}" rx="${n(p.r * 0.2)}" fill="${p.iris}"/><rect x="${n(-p.r * 0.7)}" y="${n(-p.r * 0.05)}" width="${n(p.r * 1.4)}" height="${n(p.r * 0.1)}" fill="#0b1220" opacity=".4"/>` },
  { id: 'led', label: 'Barras', draw: (p) => `<rect x="${n(-p.r * 1.1)}" y="${n(-p.r * 0.32)}" width="${n(p.r * 2.2)}" height="${n(p.r * 0.64)}" rx="${n(p.r * 0.32)}" fill="${p.iris}"/><rect x="${n(-p.r * 0.9)}" y="${n(-p.r * 0.18)}" width="${n(p.r * 0.8)}" height="${n(p.r * 0.14)}" rx="1" fill="#fff" opacity=".7"/>` },
  { id: 'cyclops', label: 'Cíclope', single: true, draw: (p) => { const [x, y] = look(p, 0.3); return `<circle r="${n(p.r * 1.7)}" fill="${p.white}" stroke="${shade(p.lid, -0.2)}" stroke-width="${n(p.r * 0.1)}"/><circle cx="${x}" cy="${y}" r="${n(p.r * 0.95)}" fill="${p.iris}"/><circle cx="${x}" cy="${y}" r="${n(p.r * 0.5)}" fill="${p.ink}"/>${shine(x - p.r * 0.4, y - p.r * 0.45, p.r * 0.28)}`; } },
  {
    id: 'lashes',
    label: 'Pestañas',
    draw: (p) =>
      `<circle r="${p.r}" fill="${p.white}"/>${pupil(p, p.r * 0.58)}` +
      [0.15, 0.45, 0.75].map((t) => {
        const a = -Math.PI / 2 + t * p.side * 1.3;
        const x1 = Math.cos(a) * p.r;
        const y1 = Math.sin(a) * p.r;
        return `<path d="M${n(x1)} ${n(y1)}L${n(x1 * 1.45)} ${n(y1 * 1.45)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.16)}" stroke-linecap="round"/>`;
      }).join(''),
  },
  {
    id: 'almond',
    label: 'Realistas',
    draw: (p) => {
      const [x, y] = look(p, 0.3);
      const r = p.r;
      const shape = `M${n(-r * 1.25)} 0Q${n(-r * 0.3)} ${n(-r * 1.15)} ${n(r * 1.25)} ${n(-r * 0.1)}Q${n(r * 0.3)} ${n(r * 0.95)} ${n(-r * 1.25)} 0Z`;
      const id = `al${Math.round(Math.random() * 1e9)}`;
      return `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${shape}" fill="${p.white}"/>
        <g clip-path="url(#${id})"><circle cx="${x}" cy="${y}" r="${n(r * 0.72)}" fill="${p.iris}"/><circle cx="${x}" cy="${y}" r="${n(r * 0.72)}" fill="none" stroke="${shade(p.iris, -0.45)}" stroke-width="${n(r * 0.12)}"/><circle cx="${x}" cy="${y}" r="${n(r * 0.34)}" fill="${p.ink}"/>${shine(x - r * 0.26, y - r * 0.28, r * 0.16)}
        <path d="${shape}" fill="none" stroke="${shade(p.lid, -0.25)}" stroke-width="${n(r * 0.4)}" opacity=".35"/></g>
        <path d="M${n(-r * 1.3)} 0Q${n(-r * 0.3)} ${n(-r * 1.2)} ${n(r * 1.3)} ${n(-r * 0.1)}" stroke="${p.ink}" stroke-width="${n(r * 0.2)}" fill="none" stroke-linecap="round"/>`;
    },
  },
  { id: 'googly', label: 'Locos', draw: (p) => `<circle r="${n(p.r * 1.1)}" fill="#fff" stroke="${p.ink}" stroke-width="${n(p.r * 0.1)}"/><circle cx="${n(p.lx * p.r * 0.45)}" cy="${n(p.r * 0.35 + p.ly * p.r * 0.1)}" r="${n(p.r * 0.55)}" fill="${p.ink}"/>` },
  { id: 'sparkle', label: 'Brillantes', draw: (p) => { const [x, y] = look(p, 0.1); return `<circle cx="${x}" cy="${y}" r="${n(p.r)}" fill="${p.ink}"/><path d="${star(p.r * 0.5, 0.25, 4)}" transform="translate(${n(x - p.r * 0.3)} ${n(y - p.r * 0.3)})" fill="#fff"/><path d="${star(p.r * 0.25, 0.3, 4)}" transform="translate(${n(x + p.r * 0.4)} ${n(y + p.r * 0.35)})" fill="#fff"/>`; } },
  { id: 'dollar', label: 'Dólar', draw: (p) => `<circle r="${p.r}" fill="${p.white}"/><text y="${n(p.r * 0.45)}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${n(p.r * 1.5)}" fill="#16a34a">$</text>` },
  { id: 'pixel', label: 'Píxel', draw: (p) => { const s = p.r * 0.62; const [x, y] = look(p, 0.2); return `<rect x="${n(x - s)}" y="${n(y - s)}" width="${n(s * 2)}" height="${n(s * 2)}" fill="${p.ink}"/><rect x="${n(x - s)}" y="${n(y - s)}" width="${n(s * 0.7)}" height="${n(s * 0.7)}" fill="#fff"/>`; } },
  { id: 'bean', label: 'Alubia', draw: (p) => { const [x, y] = look(p, 0.12); return `<ellipse cx="${x}" cy="${y}" rx="${n(p.r * 0.5)}" ry="${n(p.r * 1.05)}" fill="${p.ink}"/>${shine(x - p.r * 0.15, y - p.r * 0.5, p.r * 0.16)}`; } },
  { id: 'tired', label: 'Cansados', draw: (p) => `<circle r="${p.r}" fill="${p.white}"/>${pupil(p, p.r * 0.5, 0.25)}<path d="M${-p.r - 1} ${n(-p.r - 1)}H${p.r + 1}V${n(-p.r * 0.2)}H${-p.r - 1}Z" fill="${p.lid}"/><path d="M${-p.r} ${n(-p.r * 0.2)}H${p.r}" stroke="${p.ink}" stroke-width="${n(p.r * 0.14)}" stroke-linecap="round"/><path d="M${n(-p.r * 0.8)} ${n(p.r * 1.25)}Q0 ${n(p.r * 1.6)} ${n(p.r * 0.8)} ${n(p.r * 1.25)}" stroke="${shade(p.lid, -0.3)}" stroke-width="${n(p.r * 0.12)}" fill="none" stroke-linecap="round"/>` },
  { id: 'villain', label: 'Villano', draw: (p) => { const [x, y] = look(p, 0.2); return `<path d="M${n(-p.r * 1.2 * p.side)} ${n(-p.r * 0.6)}L${n(p.r * 1.1 * p.side)} ${n(p.r * 0.1)}Q${n(p.r * 0.2 * p.side)} ${n(p.r * 0.9)} ${n(-p.r * 1.1 * p.side)} ${n(p.r * 0.2)}Z" fill="#fde047"/><ellipse cx="${x}" cy="${n(y + p.r * 0.15)}" rx="${n(p.r * 0.14)}" ry="${n(p.r * 0.45)}" fill="${p.ink}"/>`; } },
  { id: 'glow', label: 'Fantasmales', draw: (p) => `<circle r="${n(p.r * 1.25)}" fill="${p.iris}" opacity=".25"/><circle r="${n(p.r * 0.95)}" fill="${p.iris}" opacity=".5"/><ellipse rx="${n(p.r * 0.6)}" ry="${n(p.r * 0.85)}" fill="#fff"/>` },
  { id: 'teary', label: 'Llorosos', draw: (p) => { const [x, y] = look(p, 0.1); return `<circle cx="${x}" cy="${y}" r="${n(p.r * 0.95)}" fill="${p.ink}"/>${shine(x - p.r * 0.32, y - p.r * 0.34, p.r * 0.32)}${shine(x + p.r * 0.3, y + p.r * 0.34, p.r * 0.14)}<path d="M${n(p.r * 0.7 * p.side)} ${n(p.r * 0.9)}q${n(-p.r * 0.35)} ${n(p.r * 0.6)} 0 ${n(p.r * 0.8)}q${n(p.r * 0.35)} ${n(-p.r * 0.2)} 0 ${n(-p.r * 0.8)}Z" fill="#60a5fa"/>`; } },
  { id: 'hypno', label: 'Hipnosis', draw: (p) => `<circle r="${p.r}" fill="#fff"/>${[0.8, 0.55, 0.3].map((k, i) => `<circle r="${n(p.r * k)}" fill="none" stroke="${i % 2 ? p.iris : p.ink}" stroke-width="${n(p.r * 0.14)}"/>`).join('')}` },
  { id: 'focused', label: 'Decididos', draw: (p) => `<ellipse rx="${n(p.r)}" ry="${n(p.r * 0.7)}" fill="${p.white}"/>${pupil(p, p.r * 0.5, 0.3)}<path d="M${n(-p.r * 1.1)} ${n(-p.r * 0.55)}H${n(p.r * 1.1)}" stroke="${p.ink}" stroke-width="${n(p.r * 0.24)}" stroke-linecap="round"/>` },
  ...moreEyes({ n, shade, shine, star, heartPath, look, pupil }),
];

// ───────────────────────────── cejas ─────────────────────────────
// p = { r, side, color, tilt (-1 triste … 1 enfadado), lift }

const brow = (p, d, w = 0.22) => `<path d="${d}" stroke="${p.color}" stroke-width="${n(p.r * w)}" fill="none" stroke-linecap="round"/>`;
export const BROWS = [
  { id: 'none', label: 'Sin cejas', draw: () => '' },
  { id: 'soft', label: 'Suaves', draw: (p) => brow(p, `M${n(-p.r * 0.8)} 0Q0 ${n(-p.r * 0.45)} ${n(p.r * 0.8)} 0`) },
  { id: 'thick', label: 'Gruesas', draw: (p) => brow(p, `M${n(-p.r * 0.75)} 0L${n(p.r * 0.75)} 0`, 0.42) },
  { id: 'thin', label: 'Finas', draw: (p) => brow(p, `M${n(-p.r * 0.9)} ${n(p.r * 0.1)}Q0 ${n(-p.r * 0.5)} ${n(p.r * 0.9)} ${n(p.r * 0.1)}`, 0.12) },
  { id: 'arched', label: 'Arqueadas', draw: (p) => brow(p, `M${n(-p.r * 0.9 * p.side)} ${n(p.r * 0.25)}Q${n(p.r * 0.1 * p.side)} ${n(-p.r * 0.7)} ${n(p.r * 0.95 * p.side)} ${n(p.r * 0.05)}`, 0.18) },
  { id: 'bushy', label: 'Pobladas', draw: (p) => brow(p, `M${n(-p.r * 0.9)} ${n(p.r * 0.1)}q${n(p.r * 0.3)} ${n(-p.r * 0.45)} ${n(p.r * 0.6)} ${n(-p.r * 0.1)}q${n(p.r * 0.3)} ${n(-p.r * 0.45)} ${n(p.r * 0.6)} ${n(-p.r * 0.05)}q${n(p.r * 0.3)} ${n(-p.r * 0.3)} ${n(p.r * 0.6)} ${n(p.r * 0.1)}`, 0.34) },
  { id: 'dots', label: 'Maro', draw: (p) => `<ellipse rx="${n(p.r * 0.38)}" ry="${n(p.r * 0.24)}" fill="${p.color}"/>` },
  { id: 'unibrow', label: 'Uniceja', uni: true, draw: (p) => brow(p, `M${n(-p.sp - p.r * 0.9)} ${n(p.r * 0.1)}Q${n(-p.sp / 2)} ${n(-p.r * 0.45)} 0 ${n(p.r * 0.05)}Q${n(p.sp / 2)} ${n(-p.r * 0.45)} ${n(p.sp + p.r * 0.9)} ${n(p.r * 0.1)}`, 0.34) },
  { id: 'angled', label: 'Picudas', draw: (p) => brow(p, `M${n(-p.r * 0.9 * p.side)} ${n(p.r * 0.15)}L${n(p.r * 0.35 * p.side)} ${n(-p.r * 0.35)}L${n(p.r * 0.9 * p.side)} ${n(-p.r * 0.05)}`, 0.2) },
  ...moreBrows({ n, shade, brow, star, heartPath }),
];

// ───────────────────────────── bocas ─────────────────────────────
// p = { w (media anchura), open 0..1, curve -1..1 (ánimo), ink (boca), lip, tongue, teeth, color }

function mouthShape(w, h, curve) {
  const c = curve * w * 0.35;
  const top = `M${n(-w)} ${n(-c)}Q0 ${n(c * 0.6 - h * 0.15)} ${n(w)} ${n(-c)}`;
  return `${top}Q${n(w * 0.8)} ${n(h + c * 0.2)} 0 ${n(h + c * 0.4)}Q${n(-w * 0.8)} ${n(h + c * 0.2)} ${n(-w)} ${n(-c)}Z`;
}
function openMouth(p, { w = p.w, min = 0, max = 1, teeth = false, tongue = true, fangs = false, sharp = false, gap = false, braces = false } = {}) {
  const h = (min + (max - min) * p.open) * w * 1.1;
  const curve = p.curve;
  const id = `m${Math.round(Math.random() * 1e9)}`;
  const shape = mouthShape(w, Math.max(h, 1.5), curve);
  let inner = '';
  if (tongue && h > w * 0.35) inner += `<ellipse cx="0" cy="${n(h + curve * w * 0.35)}" rx="${n(w * 0.55)}" ry="${n(h * 0.45)}" fill="${p.tongue}"/>`;
  if (teeth) {
    const ty = -curve * w * 0.35;
    if (sharp) {
      let d = `M${n(-w)} ${n(ty - 2)}`;
      for (let i = 0; i <= 8; i++) d += `L${n(-w + (i * w) / 4)} ${n(ty + (i % 2 ? w * 0.28 : -1))}`;
      inner += `<path d="${d}V${n(ty - 4)}Z" fill="${p.teeth}"/>`;
    } else inner += `<rect x="${n(-w)}" y="${n(ty - 4)}" width="${n(w * 2)}" height="${n(Math.max(4, w * 0.3) + 4)}" fill="${p.teeth}"/>`;
    if (gap) inner += `<rect x="${n(-w * 0.12)}" y="${n(ty - 4)}" width="${n(w * 0.24)}" height="${n(w * 0.3 + 4)}" fill="${p.ink}"/>`;
    if (braces) inner += `<path d="M${n(-w)} ${n(ty + w * 0.18)}H${n(w)}" stroke="#a3a3a3" stroke-width="2"/>${[-0.6, -0.2, 0.2, 0.6].map((k) => `<rect x="${n(k * w - 1.5)}" y="${n(ty + w * 0.18 - 2)}" width="3" height="4" fill="#d4d4d4"/>`).join('')}`;
  }
  if (fangs) inner += `<path d="M${n(-w * 0.55)} ${n(-curve * w * 0.3 - 1)}l${n(w * 0.12)} ${n(w * 0.4)}l${n(w * 0.12)} ${n(-w * 0.4)}ZM${n(w * 0.31)} ${n(-curve * w * 0.3 - 1)}l${n(w * 0.12)} ${n(w * 0.4)}l${n(w * 0.12)} ${n(-w * 0.4)}Z" fill="${p.teeth}"/>`;
  return `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${shape}" fill="${p.ink}"/><g clip-path="url(#${id})">${inner}</g><path d="${shape}" fill="none" stroke="${p.lip}" stroke-width="${n(Math.max(1.4, w * 0.1))}" stroke-linejoin="round"/>`;
}
const line = (p, d, wd = 0.18) => `<path d="${d}" stroke="${p.lip}" stroke-width="${n(Math.max(2, p.w * wd))}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Bocas cerradas: al hablar se abren con una forma genérica. */
const closedOr = (fn) => (p) => (p.open > 0.12 ? openMouth(p, { w: p.w * 0.8, max: 0.8 }) : fn(p));

export const MOUTHS = [
  { id: 'smile', label: 'Sonrisa', draw: closedOr((p) => line(p, `M${n(-p.w)} ${n(-p.w * 0.1 - p.curve * 3)}Q0 ${n(p.w * 0.75 + p.curve * p.w * 0.4)} ${n(p.w)} ${n(-p.w * 0.1 - p.curve * 3)}`)) },
  { id: 'grin', label: 'Sonrisa amplia', draw: (p) => openMouth({ ...p, curve: Math.max(0.4, p.curve + 0.6) }, { min: 0.35, teeth: true }) },
  { id: 'laugh', label: 'Carcajada', draw: (p) => openMouth({ ...p, curve: Math.max(0.5, p.curve + 0.7) }, { min: 0.6, max: 1.1 }) },
  { id: 'open', label: 'Abierta', draw: (p) => `<ellipse cy="${n(p.w * 0.25)}" rx="${n(p.w * 0.55)}" ry="${n(p.w * (0.35 + p.open * 0.5))}" fill="${p.ink}" stroke="${p.lip}" stroke-width="2"/><ellipse cy="${n(p.w * (0.4 + p.open * 0.45))}" rx="${n(p.w * 0.35)}" ry="${n(p.w * 0.18)}" fill="${p.tongue}"/>` },
  { id: 'oh', label: 'Oh', draw: (p) => `<ellipse rx="${n(p.w * 0.3)}" ry="${n(p.w * (0.3 + p.open * 0.3))}" fill="${p.ink}" stroke="${p.lip}" stroke-width="2"/>` },
  { id: 'flat', label: 'Seria', draw: closedOr((p) => line(p, `M${n(-p.w * 0.8)} 0H${n(p.w * 0.8)}`)) },
  { id: 'frown', label: 'Triste', draw: closedOr((p) => line(p, `M${n(-p.w * 0.85)} ${n(p.w * 0.35)}Q0 ${n(-p.w * 0.45)} ${n(p.w * 0.85)} ${n(p.w * 0.35)}`)) },
  { id: 'smirk', label: 'Pícara', draw: closedOr((p) => line(p, `M${n(-p.w * 0.8)} ${n(p.w * 0.12)}Q${n(p.w * 0.2)} ${n(p.w * 0.35)} ${n(p.w * 0.9)} ${n(-p.w * 0.3)}`)) },
  { id: 'cat', label: 'Gatuna', draw: closedOr((p) => line(p, `M${n(-p.w * 0.9)} 0Q${n(-p.w * 0.45)} ${n(p.w * 0.6)} 0 0Q${n(p.w * 0.45)} ${n(p.w * 0.6)} ${n(p.w * 0.9)} 0`, 0.15)) },
  { id: 'tongue', label: 'Lengua fuera', draw: (p) => `<path d="M${n(-p.w * 0.35)} ${n(p.w * 0.12)}v${n(p.w * 0.35)}a${n(p.w * 0.35)} ${n(p.w * 0.35)} 0 0 0 ${n(p.w * 0.7)} 0v${n(-p.w * 0.35)}Z" fill="${p.tongue}" stroke="${shade(p.tongue, -0.3)}" stroke-width="1.5"/><path d="M0 ${n(p.w * 0.2)}v${n(p.w * 0.3)}" stroke="${shade(p.tongue, -0.3)}" stroke-width="1.2"/>${p.open > 0.12 ? openMouth(p, { w: p.w * 0.8, max: 0.7 }) : line(p, `M${n(-p.w)} ${n(-p.w * 0.1)}Q0 ${n(p.w * 0.45)} ${n(p.w)} ${n(-p.w * 0.1)}`)}` },
  { id: 'vampire', label: 'Colmillos', draw: (p) => openMouth({ ...p, curve: Math.max(0.3, p.curve + 0.5) }, { min: 0.25, fangs: true }) },
  { id: 'buck', label: 'Paletas', draw: (p) => `${openMouth({ ...p, curve: Math.max(0.3, p.curve + 0.5) }, { min: 0.12, max: 0.7, tongue: false })}<rect x="${n(-p.w * 0.3)}" y="${n(-p.w * 0.12)}" width="${n(p.w * 0.29)}" height="${n(p.w * 0.45)}" rx="2" fill="${p.teeth}" stroke="#d6d3d1"/><rect x="${n(p.w * 0.01)}" y="${n(-p.w * 0.12)}" width="${n(p.w * 0.29)}" height="${n(p.w * 0.45)}" rx="2" fill="${p.teeth}" stroke="#d6d3d1"/>` },
  { id: 'tiny', label: 'Pequeñita', draw: (p) => (p.open > 0.12 ? `<ellipse rx="${n(p.w * 0.3)}" ry="${n(p.w * p.open * 0.4 + 1)}" fill="${p.ink}"/>` : line(p, `M${n(-p.w * 0.35)} 0Q0 ${n(p.w * 0.35)} ${n(p.w * 0.35)} 0`, 0.14)) },
  { id: 'kiss', label: 'Beso', draw: (p) => (p.open > 0.2 ? `<ellipse rx="${n(p.w * 0.3)}" ry="${n(p.w * 0.35 + p.open * 3)}" fill="${p.ink}" stroke="#e11d48" stroke-width="3"/>` : `<path d="M${n(-p.w * 0.2)} ${n(-p.w * 0.3)}Q${n(p.w * 0.35)} ${n(-p.w * 0.2)} 0 0Q${n(p.w * 0.35)} ${n(p.w * 0.2)} ${n(-p.w * 0.2)} ${n(p.w * 0.3)}" stroke="#e11d48" stroke-width="${n(p.w * 0.2)}" fill="none" stroke-linecap="round"/>`) },
  { id: 'wavy', label: 'Nerviosa', draw: closedOr((p) => line(p, `M${n(-p.w)} 0q${n(p.w / 4)} ${n(-p.w * 0.25)} ${n(p.w / 2)} 0t${n(p.w / 2)} 0t${n(p.w / 2)} 0t${n(p.w / 2)} 0`, 0.14)) },
  {
    id: 'grit',
    label: 'Dientes apretados',
    draw: (p) => {
      const h = p.w * (0.5 + p.open * 0.5);
      return `<rect x="${n(-p.w)}" y="${n(-h / 2)}" width="${n(p.w * 2)}" height="${n(h)}" rx="${n(h * 0.3)}" fill="${p.teeth}" stroke="${p.lip}" stroke-width="2"/><path d="M${n(-p.w)} 0H${n(p.w)}${[-0.5, 0, 0.5].map((k) => `M${n(k * p.w)} ${n(-h / 2)}V${n(h / 2)}`).join('')}" stroke="${p.lip}" stroke-width="1.5"/>`;
    },
  },
  { id: 'beak', label: 'Pico', draw: (p) => { const o = p.open * p.w * 0.5; return `<path d="M${n(-p.w * 0.7)} 0Q0 ${n(-p.w * 0.5)} ${n(p.w * 0.7)} 0L0 ${n(p.w * 0.35)}Z" fill="#f59e0b" transform="translate(0 ${n(-o / 2)})"/><path d="M${n(-p.w * 0.6)} ${n(p.w * 0.05)}L${n(p.w * 0.6)} ${n(p.w * 0.05)}L0 ${n(p.w * 0.55)}Z" fill="#d97706" transform="translate(0 ${n(o / 2)})"/>`; } },
  { id: 'robot', label: 'Rejilla', draw: (p) => { const h = p.w * (0.35 + p.open * 0.6); return `<rect x="${n(-p.w)}" y="${n(-h / 2)}" width="${n(p.w * 2)}" height="${n(h)}" rx="3" fill="#0b1220" stroke="#94a3b8" stroke-width="2"/>${[-0.5, 0, 0.5].map((k) => `<rect x="${n(k * p.w - 1)}" y="${n(-h / 2 + 2)}" width="2" height="${n(h - 4)}" fill="#22d3ee" opacity="${n(0.3 + p.open * 0.7)}"/>`).join('')}`; } },
  { id: 'braces', label: 'Brackets', draw: (p) => openMouth({ ...p, curve: Math.max(0.4, p.curve + 0.6) }, { min: 0.35, teeth: true, braces: true }) },
  { id: 'monster', label: 'Monstruo', draw: (p) => openMouth({ ...p, w: p.w * 1.25, curve: Math.max(0.4, p.curve + 0.6) }, { min: 0.45, teeth: true, sharp: true }) },
  { id: 'gap', label: 'Mellada', draw: (p) => openMouth({ ...p, curve: Math.max(0.4, p.curve + 0.6) }, { min: 0.35, teeth: true, gap: true }) },
  {
    id: 'lips',
    label: 'Labios',
    draw: (p) => {
      const w = p.w;
      const o = p.open * w * 0.55;
      const c = p.curve * w * 0.15;
      return `<path d="M${n(-w)} ${n(-c)}Q${n(-w * 0.5)} ${n(-w * 0.45)} 0 ${n(-w * 0.22)}Q${n(w * 0.5)} ${n(-w * 0.45)} ${n(w)} ${n(-c)}Q0 ${n(-w * 0.05)} ${n(-w)} ${n(-c)}Z" fill="${p.lipColor}"/>
        ${o > 1 ? `<path d="M${n(-w * 0.85)} ${n(-c * 0.8)}Q0 ${n(o * 1.4)} ${n(w * 0.85)} ${n(-c * 0.8)}Z" fill="${p.ink}"/><rect x="${n(-w * 0.5)}" y="${n(-2)}" width="${n(w)}" height="${n(Math.min(o * 0.5, 4))}" fill="${p.teeth}"/>` : ''}
        <path d="M${n(-w)} ${n(-c)}Q0 ${n(w * 0.7 + o)} ${n(w)} ${n(-c)}Q0 ${n(o + 1)} ${n(-w)} ${n(-c)}Z" fill="${shade(p.lipColor, -0.1)}"/>
        <ellipse cx="${n(w * 0.25)}" cy="${n(w * 0.3 + o * 0.8)}" rx="${n(w * 0.22)}" ry="${n(w * 0.07)}" fill="#fff" opacity=".35"/>`;
    },
  },
  { id: 'pout', label: 'Puchero', draw: closedOr((p) => line(p, `M${n(-p.w * 0.45)} ${n(p.w * 0.2)}Q0 ${n(-p.w * 0.25)} ${n(p.w * 0.45)} ${n(p.w * 0.2)}`, 0.2)) },
  { id: 'toothless', label: 'Desdentada', draw: (p) => openMouth({ ...p, curve: Math.max(0.5, p.curve + 0.7) }, { min: 0.45 }) },
  { id: 'whistle', label: 'Silbando', draw: (p) => `<circle cx="${n(p.w * 0.35)}" r="${n(p.w * 0.22 + p.open * 3)}" fill="${p.ink}" stroke="${p.lip}" stroke-width="${n(p.w * 0.14)}"/>` },
  { id: 'drool', label: 'Babeando', draw: (p) => `${openMouth({ ...p, curve: Math.max(0.4, p.curve + 0.6) }, { min: 0.2 })}<path d="M${n(p.w * 0.6)} ${n(p.w * 0.1)}q${n(-p.w * 0.12)} ${n(p.w * 0.5)} 0 ${n(p.w * 0.65)}q${n(p.w * 0.12)} ${n(-p.w * 0.15)} 0 ${n(-p.w * 0.65)}Z" fill="#93c5fd"/>` },
  { id: 'square', label: 'Cuadrada', draw: (p) => { const h = p.w * (0.3 + p.open * 0.7); return `<rect x="${n(-p.w * 0.7)}" y="${n(-h / 2)}" width="${n(p.w * 1.4)}" height="${n(h)}" rx="2" fill="${p.ink}" stroke="${p.lip}" stroke-width="2"/>`; } },
  { id: 'mustachio', label: 'Sonrisa ladeada', draw: (p) => openMouth({ ...p, curve: p.curve + 0.3 }, { min: 0.1, max: 0.8, teeth: true }) },
  ...moreMouths({ n, shade, mouthShape, openMouth, line, closedOr, star, heartPath }),
];

// ───────────────────────────── mejillas y marcas ─────────────────────────────
// p = { sp (media distancia entre ojos), r (radio ojo), color }

export const CHEEKS = [
  { id: 'none', label: 'Nada', draw: () => '' },
  { id: 'blush', label: 'Rubor', draw: (p) => [-1, 1].map((s) => `<ellipse cx="${n(s * (p.sp + p.r * 0.4))}" cy="${n(p.r * 1.8)}" rx="${n(p.r * 0.8)}" ry="${n(p.r * 0.45)}" fill="${p.color}" opacity=".45"/>`).join('') },
  { id: 'lines', label: 'Rubor anime', draw: (p) => [-1, 1].map((s) => [0, 1, 2].map((i) => `<path d="M${n(s * (p.sp + p.r * 0.1) + (i - 1) * p.r * 0.4)} ${n(p.r * 2.1)}l${n(p.r * 0.25)} ${n(-p.r * 0.5)}" stroke="${p.color}" stroke-width="${n(p.r * 0.12)}" stroke-linecap="round"/>`).join('')).join('') },
  { id: 'freckles', label: 'Pecas', draw: (p) => [-1, 1].map((s) => [[0, 0], [0.5, 0.3], [-0.4, 0.4], [0.2, 0.75], [-0.2, -0.1]].map(([a, b]) => `<circle cx="${n(s * (p.sp + p.r * 0.2) + a * p.r)}" cy="${n(p.r * 1.7 + b * p.r)}" r="${n(p.r * 0.1)}" fill="${shade(p.color, -0.35)}"/>`).join('')).join('') },
  { id: 'hearts', label: 'Corazones', draw: (p) => [-1, 1].map((s) => `<path d="${heartPath(p.r * 0.35)}" transform="translate(${n(s * (p.sp + p.r * 0.5))} ${n(p.r * 1.9)})" fill="${p.color}"/>`).join('') },
  { id: 'whiskers', label: 'Bigotes de gato', draw: (p) => [-1, 1].map((s) => [-0.25, 0, 0.25].map((k) => `<path d="M${n(s * (p.sp * 0.7))} ${n(p.r * 2.4 + k * p.r * 2)}L${n(s * (p.sp + p.r * 2.6))} ${n(p.r * 2.2 + k * p.r * 3.2)}" stroke="#1f2937" stroke-width="${n(p.r * 0.1)}" stroke-linecap="round" opacity=".7"/>`).join('')).join('') },
  { id: 'stars', label: 'Estrellitas', draw: (p) => [-1, 1].map((s) => `<path d="${star(p.r * 0.4)}" transform="translate(${n(s * (p.sp + p.r * 0.6))} ${n(p.r * 1.9)})" fill="#facc15"/>`).join('') },
  { id: 'paint', label: 'Pintura de guerra', draw: (p) => [-1, 1].map((s) => `<path d="M${n(s * (p.sp - p.r * 0.2))} ${n(p.r * 1.4)}h${n(s * p.r * 1.6)}M${n(s * (p.sp - p.r * 0.2))} ${n(p.r * 1.9)}h${n(s * p.r * 1.6)}" stroke="${p.color}" stroke-width="${n(p.r * 0.25)}" stroke-linecap="round"/>`).join('') },
  ...moreCheeks({ n, shade, star, heartPath }),
];

// ───────────────────────────── patrones del cuerpo ─────────────────────────────
// p = { box {x,y,w,h}, color (patrón) } — se recortan con la silueta

export const PATTERNS = [
  { id: 'none', label: 'Liso', draw: () => '' },
  { id: 'belly', label: 'Barriga', draw: (p) => `<ellipse cx="${n(p.box.x + p.box.w / 2)}" cy="${n(p.box.y + p.box.h * 0.8)}" rx="${n(p.box.w * 0.34)}" ry="${n(p.box.h * 0.3)}" fill="${p.color}"/>` },
  { id: 'spots', label: 'Manchas', draw: (p) => [[0.2, 0.3, 0.09], [0.75, 0.25, 0.07], [0.82, 0.62, 0.1], [0.15, 0.72, 0.08], [0.5, 0.9, 0.07], [0.6, 0.12, 0.05]].map(([a, b, r]) => `<circle cx="${n(p.box.x + a * p.box.w)}" cy="${n(p.box.y + b * p.box.h)}" r="${n(r * p.box.w)}" fill="${p.color}"/>`).join('') },
  { id: 'stripes', label: 'Rayas', draw: (p) => Array.from({ length: 7 }, (_, i) => `<rect x="${n(p.box.x - 10)}" y="${n(p.box.y + (i + 0.5) * p.box.h / 7)}" width="${n(p.box.w + 20)}" height="${n(p.box.h / 16)}" fill="${p.color}"/>`).join('') },
  { id: 'tiger', label: 'Tigre', draw: (p) => [0.2, 0.4, 0.6, 0.8].map((b, i) => `<path d="M${n(p.box.x - 4)} ${n(p.box.y + b * p.box.h)}l${n(p.box.w * 0.22)} ${n(p.box.h * 0.04)}l${n(-p.box.w * 0.18)} ${n(p.box.h * 0.05)}ZM${n(p.box.x + p.box.w + 4)} ${n(p.box.y + b * p.box.h + i)}l${n(-p.box.w * 0.22)} ${n(p.box.h * 0.04)}l${n(p.box.w * 0.18)} ${n(p.box.h * 0.05)}Z" fill="${p.color}"/>`).join('') },
  { id: 'twotone', label: 'Dos tonos', draw: (p) => `<rect x="${n(p.box.x - 5)}" y="${n(p.box.y + p.box.h * 0.58)}" width="${n(p.box.w + 10)}" height="${n(p.box.h)}" fill="${p.color}"/>` },
  { id: 'mask', label: 'Antifaz', draw: (p) => `<rect x="${n(p.box.x - 5)}" y="${n(p.eyeY - p.r * 1.7)}" width="${n(p.box.w + 10)}" height="${n(p.r * 3.4)}" rx="${n(p.r)}" fill="${p.color}"/>` },
  { id: 'hearts', label: 'Corazones', draw: (p) => [[0.2, 0.35], [0.8, 0.3], [0.7, 0.75], [0.25, 0.8], [0.5, 0.95]].map(([a, b]) => `<path d="${heartPath(p.box.w * 0.06)}" transform="translate(${n(p.box.x + a * p.box.w)} ${n(p.box.y + b * p.box.h)})" fill="${p.color}"/>`).join('') },
  { id: 'stars', label: 'Estrellas', draw: (p) => [[0.18, 0.3], [0.82, 0.28], [0.75, 0.72], [0.22, 0.78], [0.5, 0.93]].map(([a, b]) => `<path d="${star(p.box.w * 0.06)}" transform="translate(${n(p.box.x + a * p.box.w)} ${n(p.box.y + b * p.box.h)})" fill="${p.color}"/>`).join('') },
  { id: 'circuit', label: 'Circuito', draw: (p) => [0.25, 0.5, 0.75].map((b, i) => `<path d="M${n(p.box.x)} ${n(p.box.y + b * p.box.h)}h${n(p.box.w * 0.18)}l${n(p.box.w * 0.06)} ${n(i % 2 ? 8 : -8)}h${n(p.box.w * 0.1)}M${n(p.box.x + p.box.w)} ${n(p.box.y + b * p.box.h + 6)}h${n(-p.box.w * 0.2)}" stroke="${p.color}" stroke-width="2" fill="none"/><circle cx="${n(p.box.x + p.box.w * 0.34)}" cy="${n(p.box.y + b * p.box.h + (i % 2 ? 8 : -8))}" r="2.5" fill="${p.color}"/>`).join('') },
  ...morePatterns({ n, shade, star, heartPath }),
];

// ───────────────────────────── acabados ─────────────────────────────

export const FINISHES = [
  { id: 'glossy', label: 'Brillante' },
  { id: 'soft3d', label: '3D suave' },
  { id: 'clay', label: 'Plastilina' },
  { id: 'flat', label: 'Plano' },
  { id: 'toon', label: 'Cómic' },
  { id: 'neon', label: 'Neón' },
  { id: 'sketch', label: 'Boceto' },
  // catálogo 2 (2026-10): se dibujan en Character.js (FINISH2)
  { id: 'pastel', label: 'Pastel', en: 'Pastel', pt: 'Pastel', as3d: 'soft3d' },
  { id: 'metal', label: 'Metálico', en: 'Metallic', pt: 'Metálico', as3d: 'glossy' },
  { id: 'pearl', label: 'Nácar', en: 'Pearl', pt: 'Madrepérola', as3d: 'glossy' },
  { id: 'glass', label: 'Cristal', en: 'Glass', pt: 'Vidro', as3d: 'glossy' },
  { id: 'velvet', label: 'Terciopelo', en: 'Velvet', pt: 'Veludo', as3d: 'clay' },
  { id: 'holo', label: 'Holográfico', en: 'Holographic', pt: 'Holográfico', as3d: 'glossy' },
  { id: 'vinyl', label: 'Vinilo', en: 'Vinyl toy', pt: 'Vinil', as3d: 'toon' },
];

// ───────────────────────────── texturas ─────────────────────────────
// Detalle de superficie (se dibuja en skin.js). 'auto' la elige según forma, color y acabado.

export const TEXTURES = [
  { id: 'auto', label: 'Automática' },
  { id: 'none', label: 'Lisa' },
  { id: 'fur', label: 'Pelo' },
  { id: 'fuzz', label: 'Pelusa' },
  { id: 'scales', label: 'Escamas' },
  { id: 'feathers', label: 'Plumas' },
  { id: 'speckles', label: 'Pecas' },
  { id: 'ridges', label: 'Anillos' },
  { id: 'gloss', label: 'Gelatina' },
  { id: 'panels', label: 'Paneles' },
  // catálogo 2 (2026-10): solo se eligen a mano ('auto' nunca las saca)
  { id: 'knit', label: 'Punto', en: 'Knit', pt: 'Tricô', as3d: 'fuzz' },
  { id: 'polka', label: 'Lunares', en: 'Polka dots', pt: 'Bolinhas', as3d: 'speckles' },
  { id: 'glitter', label: 'Purpurina', en: 'Glitter', pt: 'Purpurina', as3d: 'speckles' },
  { id: 'stone', label: 'Piedra', en: 'Stone', pt: 'Pedra', as3d: 'speckles' },
  { id: 'wood', label: 'Madera', en: 'Wood', pt: 'Madeira', as3d: 'ridges' },
  { id: 'bubbles', label: 'Burbujas', en: 'Bubbles', pt: 'Bolhas', as3d: 'gloss' },
  { id: 'stitches', label: 'Costuras', en: 'Stitches', pt: 'Costuras', as3d: 'fuzz' },
  { id: 'honeycomb', label: 'Panal', en: 'Honeycomb', pt: 'Favo de mel', as3d: 'scales' },
  { id: 'quilt', label: 'Acolchado', en: 'Quilted', pt: 'Acolchoado', as3d: 'fuzz' },
];

addCatalog({
  es: { character: { textures: Object.fromEntries(TEXTURES.map((x) => [x.id, x.label])) }, editor: { color: { texture: 'Textura' } } },
  en: { character: { textures: { auto: 'Auto', none: 'Smooth', fur: 'Fur', fuzz: 'Fuzz', scales: 'Scales', feathers: 'Feathers', speckles: 'Speckles', ridges: 'Ridges', gloss: 'Jelly', panels: 'Panels' } }, editor: { color: { texture: 'Texture' } } },
  pt: { character: { textures: { auto: 'Automática', none: 'Lisa', fur: 'Pelo', fuzz: 'Penugem', scales: 'Escamas', feathers: 'Penas', speckles: 'Sardas', ridges: 'Anéis', gloss: 'Gelatina', panels: 'Painéis' } }, editor: { color: { texture: 'Textura' } } },
});

// ───────────────────────────── accesorios ─────────────────────────────
// c = { k (escala por ancho de cabeza), w, h (caja del cuerpo), sp, r (ojos), color, color2, eyeDy, mouthDy, grow }
// Cada uno: { id, label, group, anchor, layer: 'back'|'front', color, color2, draw(c), grow?, shape?(c) }

const S = (w) => `stroke="#1f2937" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

// Piezas que «crecen» del cuerpo (grow: 'skin' lleva además la textura de la piel). Con c.grow
// van detrás del cuerpo con la base hundida en él; shape(c) da su silueta para la unión.
const ellD = (rx, ry, cy) => `M${-rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
const hornD = (s, grow) => (grow ? `M${31 * s} 28L${30 * s} 14Q${44 * s} -8 ${30 * s} -30Q${28 * s} -8 ${12 * s} 10L${10 * s} 26Z` : `M${30 * s} 14Q${44 * s} -8 ${30 * s} -30Q${28 * s} -8 ${12 * s} 10Z`);
const catEarD = (s, grow) => (grow ? `M${n(46.2 * s)} 28L${36 * s} -28L${n(1.4 * s)} 14Z` : `M${44 * s} 16L${36 * s} -28L${8 * s} 6Z`);
const tailD = (c) => `M${n(c.w * 0.3)} -12Q${n(c.w * 0.8)} 0 ${n(c.w * 0.62)} -40`;
const ANGEL_WING = 'M0 0Q30 -40 70 -30Q58 -18 66 -10Q50 -4 58 8Q36 10 40 22Q14 18 0 10Z';
const BAT_WING = 'M0 0L28 -36L70 -24Q60 -10 64 6Q50 -2 44 12Q34 2 24 16Q16 4 0 10Z';

export const ACCESSORY_GROUPS = [
  ['head', 'Cabeza'],
  ['eyes', 'Ojos'],
  ['face', 'Cara'],
  ['neck', 'Cuello'],
  ['back', 'Espalda'],
  ['extra', 'Extras'],
];

export const ACCESSORIES = [
  // ── cabeza ──
  {
    id: 'crown', label: 'Corona', group: 'head', anchor: 'top', color: '#facc15', color2: '#ef4444',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-32 8L-36 -26L-18 -10L0 -34L18 -10L36 -26L32 8Z" fill="${c.color}" ${S(2.5)}/><rect x="-33" y="2" width="66" height="10" rx="3" fill="${shade(c.color, -0.12)}" ${S(2.5)}/><circle cy="-8" r="5" fill="${c.color2}" stroke="#1f2937" stroke-width="2"/><circle cx="-20" cy="-2" r="3.5" fill="#3b82f6" stroke="#1f2937" stroke-width="1.5"/><circle cx="20" cy="-2" r="3.5" fill="#22c55e" stroke="#1f2937" stroke-width="1.5"/>${[-36, 0, 36].map((x, i) => `<circle cx="${x}" cy="${[-26, -34, -26][i]}" r="3.5" fill="#fff" stroke="#1f2937" stroke-width="1.5"/>`).join('')}<path d="M-26 -2l6 -12" stroke="#fff" stroke-width="2" opacity=".6"/></g>`,
  },
  {
    id: 'tiara', label: 'Tiara', group: 'head', anchor: 'top', color: '#e5e7eb', color2: '#ec4899',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-30 12Q0 -4 30 12" stroke="${c.color}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M-14 5L-8 -8L0 -18L8 -8L14 5Q0 0 -14 5Z" fill="${c.color}" ${S(2)}/><path d="${heartPath(6)}" transform="translate(0 -6)" fill="${c.color2}"/><circle cx="-22" cy="7" r="2.5" fill="${c.color2}"/><circle cx="22" cy="7" r="2.5" fill="${c.color2}"/></g>`,
  },
  {
    id: 'pirate', label: 'Sombrero pirata', group: 'head', anchor: 'top', color: '#1f2937', color2: '#f5f5f4',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-62 8Q-40 -14 -30 -30Q0 -48 30 -30Q40 -14 62 8Q30 -4 0 -2Q-30 -4 -62 8Z" fill="${c.color}" ${S(3)}/><path d="M-56 4Q0 -12 56 4" stroke="#facc15" stroke-width="3.5" fill="none"/><g transform="translate(0 -22)" fill="${c.color2}"><circle r="8"/><rect x="-5" y="4" width="10" height="6" rx="2"/><circle cx="-3" cy="-1" r="2.2" fill="${c.color}"/><circle cx="3" cy="-1" r="2.2" fill="${c.color}"/><path d="M-12 12L12 20M12 12L-12 20" stroke="${c.color2}" stroke-width="3" stroke-linecap="round"/></g></g>`,
  },
  {
    id: 'tophat', label: 'Chistera', group: 'head', anchor: 'top', color: '#111827', color2: '#dc2626',
    draw: (c) => `<g transform="scale(${n(c.k)})"><ellipse cy="6" rx="46" ry="10" fill="${c.color}" ${S(3)}/><path d="M-28 4V-50Q0 -56 28 -50V4Q0 10 -28 4Z" fill="${c.color}" ${S(3)}/><path d="M-28 -8Q0 -2 28 -8V-2Q0 4 -28 -2Z" fill="${c.color2}"/><path d="M-20 -46V-10" stroke="#fff" stroke-width="3" opacity=".18"/></g>`,
  },
  {
    id: 'beanie', label: 'Gorro de lana', group: 'head', anchor: 'top', color: '#ef4444', color2: '#fafafa',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-46 16Q-48 -34 0 -38Q48 -34 46 16Z" fill="${c.color}" ${S(3)}/>${[-30, -15, 0, 15, 30].map((x) => `<path d="M${x} -30V10" stroke="${shade(c.color, -0.2)}" stroke-width="3"/>`).join('')}<rect x="-50" y="4" width="100" height="18" rx="9" fill="${shade(c.color, -0.15)}" ${S(3)}/><circle cy="-42" r="12" fill="${c.color2}" ${S(3)}/></g>`,
  },
  {
    id: 'cap', label: 'Gorra', group: 'head', anchor: 'top', color: '#2563eb', color2: '#fafafa',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-44 14Q-46 -34 0 -36Q46 -34 44 14Z" fill="${c.color}" ${S(3)}/><path d="M20 8Q62 4 76 16Q50 24 18 18Z" fill="${shade(c.color, -0.2)}" ${S(3)}/><circle cy="-36" r="5" fill="${c.color2}" ${S(2)}/><path d="M-10 -10h20" stroke="${c.color2}" stroke-width="6" stroke-linecap="round"/></g>`,
  },
  {
    id: 'cowboy', label: 'Vaquero', group: 'head', anchor: 'top', color: '#a16207', color2: '#451a03',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-70 4Q-64 -10 -50 0Q0 18 50 0Q64 -10 70 4Q60 22 0 22Q-60 22 -70 4Z" fill="${c.color}" ${S(3)}/><path d="M-32 8Q-38 -30 -20 -38Q-6 -30 0 -38Q6 -30 20 -38Q38 -30 32 8Q0 16 -32 8Z" fill="${c.color}" ${S(3)}/><path d="M-32 0Q0 8 32 0V8Q0 16 -32 8Z" fill="${c.color2}"/></g>`,
  },
  {
    id: 'wizard', label: 'Mago', group: 'head', anchor: 'top', color: '#4338ca', color2: '#facc15',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-40 8Q-12 -30 8 -92Q18 -60 40 8Z" fill="${c.color}" ${S(3)}/><ellipse cy="10" rx="58" ry="12" fill="${c.color}" ${S(3)}/><path d="${star(8)}" transform="translate(-6 -30)" fill="${c.color2}"/><path d="${star(5)}" transform="translate(12 -52)" fill="${c.color2}"/><circle cx="-14" cy="-6" r="2.5" fill="${c.color2}"/><path d="M-6 -6a8 8 0 1 0 12 -8a6 6 0 1 1 -12 8" fill="${c.color2}"/></g>`,
  },
  {
    id: 'party', label: 'Fiesta', group: 'head', anchor: 'top', color: '#ec4899', color2: '#facc15',
    draw: (c) => `<g transform="scale(${n(c.k)}) rotate(12)"><path d="M-24 10L4 -60L28 10Z" fill="${c.color}" ${S(3)}/><path d="M-16 -10L20 -2M-8 -30L14 -24M-18 6L26 6" stroke="${c.color2}" stroke-width="5"/><circle cx="4" cy="-62" r="8" fill="${c.color2}" ${S(2.5)}/></g>`,
  },
  {
    id: 'chef', label: 'Chef', group: 'head', anchor: 'top', color: '#fafafa', color2: '#e5e7eb',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-30 12V-16Q-50 -24 -40 -44Q-30 -58 -14 -50Q-6 -66 10 -60Q24 -68 34 -52Q52 -42 34 -18V12Z" fill="${c.color}" ${S(3)}/><rect x="-32" y="-4" width="66" height="18" rx="4" fill="${c.color2}" ${S(3)}/></g>`,
  },
  {
    id: 'viking', label: 'Vikingo', group: 'head', anchor: 'top', color: '#9ca3af', color2: '#fef3c7',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-46 14Q-46 -34 0 -36Q46 -34 46 14Z" fill="${c.color}" ${S(3)}/><path d="M-46 8H46" stroke="${shade(c.color, -0.35)}" stroke-width="7"/><path d="M0 -36V12" stroke="${shade(c.color, -0.35)}" stroke-width="6"/>${[-38, -20, 20, 38].map((x) => `<circle cx="${x}" cy="8" r="2.2" fill="#e5e7eb"/>`).join('')}<path d="M-42 -6Q-72 -12 -70 -48Q-60 -24 -38 -22Z" fill="${c.color2}" ${S(3)}/><path d="M42 -6Q72 -12 70 -48Q60 -24 38 -22Z" fill="${c.color2}" ${S(3)}/></g>`,
  },
  {
    id: 'grad', label: 'Graduación', group: 'head', anchor: 'top', color: '#111827', color2: '#facc15',
    draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-28 -4V12Q0 20 28 12V-4Z" fill="${c.color}" ${S(3)}/><path d="M-56 -14L0 -34L56 -14L0 6Z" fill="${c.color}" ${S(3)}/><path d="M0 -14L36 -4V20" stroke="${c.color2}" stroke-width="3" fill="none"/><path d="M32 20h8l-2 12h-4Z" fill="${c.color2}"/></g>`,
  },
  {
    id: 'beret', label: 'Boina', group: 'head', anchor: 'top', color: '#b91c1c', color2: '#7f1d1d',
    draw: (c) => `<g transform="scale(${n(c.k)}) rotate(-10)"><path d="M-50 4Q-54 -30 -6 -30Q46 -30 48 0Q30 14 -50 4Z" fill="${c.color}" ${S(3)}/><path d="M-2 -30v-8" stroke="#1f2937" stroke-width="4" stroke-linecap="round"/></g>`,
  },
  {
    id: 'bow', label: 'Lazo', group: 'head', anchor: 'top', color: '#f472b6', color2: '#db2777',
    draw: (c) => `<g transform="scale(${n(c.k)}) translate(26 2) rotate(18)"><path d="M0 0Q-26 -24 -30 -4Q-28 16 0 0Z" fill="${c.color}" ${S(2.5)}/><path d="M0 0Q26 -24 30 -4Q28 16 0 0Z" fill="${c.color}" ${S(2.5)}/><circle r="7" fill="${c.color2}" ${S(2.5)}/></g>`,
  },
  {
    id: 'flower', label: 'Flor', group: 'head', anchor: 'top', color: '#fb7185', color2: '#fde047',
    draw: (c) => `<g transform="scale(${n(c.k)}) translate(-24 6)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-11" rx="8" ry="11" transform="rotate(${a})" fill="${c.color}" stroke="#1f2937" stroke-width="2"/>`).join('')}<circle r="7" fill="${c.color2}" stroke="#1f2937" stroke-width="2"/></g>`,
  },
  { id: 'halo', label: 'Aureola', group: 'head', anchor: 'top', color: '#fde047', draw: (c) => `<g transform="scale(${n(c.k)})"><ellipse cy="-22" rx="34" ry="9" fill="none" stroke="${c.color}" stroke-width="7"/><ellipse cy="-22" rx="34" ry="9" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/></g>` },
  { id: 'horns', label: 'Cuernos', group: 'head', anchor: 'top', color: '#dc2626', grow: 'part', shape: (c) => [-1, 1].map((s) => ({ d: hornD(s, c.grow), tf: `scale(${n(c.k)})` })), draw: (c) => `<g transform="scale(${n(c.k)})">${[-1, 1].map((s) => `<path d="${hornD(s, c.grow)}" fill="${c.color}" ${S(3)}/>`).join('')}</g>` },
  { id: 'antenna', label: 'Antenas', group: 'head', anchor: 'top', color: '#1f2937', color2: '#22d3ee', grow: 'part', shape: (c) => [-1, 1].map((s) => ({ d: `M${s * 14} ${c.grow ? 22 : 10}Q${s * 18} -14 ${s * 30} -28`, tf: `scale(${n(c.k)})`, sw: 3.5, sl: 16 })), draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-14 ${c.grow ? 22 : 10}Q-18 -14 -30 -28M14 ${c.grow ? 22 : 10}Q18 -14 30 -28" stroke="${c.color}" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="-30" cy="-30" r="7" fill="${c.color2}" ${S(2.5)}/><circle cx="30" cy="-30" r="7" fill="${c.color2}" ${S(2.5)}/></g>` },
  { id: 'bunny', label: 'Orejas de conejo', group: 'head', anchor: 'top', color: '#f5f5f4', color2: '#fbcfe8', grow: 'skin', shape: (c) => [[-18, -12], [18, 14]].map(([x, a]) => ({ d: ellD(12, 36, -34), tf: `scale(${n(c.k)}) translate(${x} 8) rotate(${a})` })), draw: (c) => `<g transform="scale(${n(c.k)})"><g transform="translate(-18 8) rotate(-12)"><ellipse cy="-34" rx="12" ry="36" fill="${c.color}" ${S(3)}/><ellipse cy="-32" rx="6" ry="26" fill="${c.color2}"/></g><g transform="translate(18 8) rotate(14)"><ellipse cy="-34" rx="12" ry="36" fill="${c.color}" ${S(3)}/><ellipse cy="-32" rx="6" ry="26" fill="${c.color2}"/></g></g>` },
  { id: 'catears', label: 'Orejas de gato', group: 'head', anchor: 'top', color: '#1f2937', color2: '#f9a8d4', grow: 'skin', shape: (c) => [-1, 1].map((s) => ({ d: catEarD(s, c.grow), tf: `scale(${n(c.k)})` })), draw: (c) => `<g transform="scale(${n(c.k)})"><path d="${catEarD(-1, c.grow)}" fill="${c.color}" ${S(3)}/><path d="M-36 6L-32 -14L-18 4Z" fill="${c.color2}"/><path d="${catEarD(1, c.grow)}" fill="${c.color}" ${S(3)}/><path d="M36 6L32 -14L18 4Z" fill="${c.color2}"/></g>` },
  { id: 'santa', label: 'Papá Noel', group: 'head', anchor: 'top', color: '#dc2626', color2: '#fafafa', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-42 10Q-30 -40 10 -44Q44 -44 56 -8Q40 -26 26 -20Q40 0 42 10Z" fill="${c.color}" ${S(3)}/><circle cx="56" cy="-6" r="10" fill="${c.color2}" ${S(2.5)}/><rect x="-48" y="2" width="96" height="18" rx="9" fill="${c.color2}" ${S(3)}/></g>` },
  { id: 'hardhat', label: 'Casco de obra', group: 'head', anchor: 'top', color: '#facc15', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-40 12Q-40 -34 0 -34Q40 -34 40 12Z" fill="${c.color}" ${S(3)}/><path d="M-56 12H56Q56 20 0 20Q-56 20 -56 12Z" fill="${shade(c.color, -0.1)}" ${S(3)}/><path d="M-8 -34V10M8 -34V10" stroke="${shade(c.color, -0.2)}" stroke-width="4"/></g>` },
  { id: 'headband', label: 'Cinta ninja', group: 'head', anchor: 'eyes', clip: true, color: '#dc2626', color2: '#9ca3af', draw: (c) => `<rect x="${n(-c.w)}" y="${n(-c.r * 3.4)}" width="${n(c.w * 2)}" height="${n(c.r * 1.4)}" fill="${c.color}"/><rect x="-9" y="${n(-c.r * 3.25)}" width="18" height="${n(c.r * 1.1)}" rx="2" fill="${c.color2}"/>`, extra: (c) => `<path d="M${n(c.w * 0.5)} ${n(-c.r * 2.7)}q18 4 26 16M${n(c.w * 0.5)} ${n(-c.r * 2.7)}q22 -2 30 8" stroke="${c.color}" stroke-width="5" fill="none" stroke-linecap="round"/>` },
  { id: 'bandana', label: 'Pañuelo pirata', group: 'head', anchor: 'top', color: '#dc2626', color2: '#fafafa', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-48 18Q-50 -30 0 -32Q50 -30 48 18Q0 6 -48 18Z" fill="${c.color}" ${S(3)}/>${[[-24, -14], [0, -20], [22, -8], [-8, 4], [30, 8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c.color2}"/>`).join('')}<path d="M44 12l20 14l-4 -18Z" fill="${c.color}" ${S(2.5)}/></g>` },
  { id: 'helmet', label: 'Casco espacial', group: 'head', anchor: 'center', color: '#e0f2fe', color2: '#94a3b8', draw: (c) => `<circle r="${n(Math.max(c.w, c.h) * 0.62)}" fill="${c.color}" fill-opacity=".22" stroke="${c.color2}" stroke-width="7"/><path d="M${n(-Math.max(c.w, c.h) * 0.4)} ${n(-Math.max(c.w, c.h) * 0.3)}a${n(Math.max(c.w, c.h) * 0.5)} ${n(Math.max(c.w, c.h) * 0.5)} 0 0 1 ${n(Math.max(c.w, c.h) * 0.3)} ${n(-Math.max(c.w, c.h) * 0.2)}" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>` },
  { id: 'headphones', label: 'Auriculares', group: 'head', anchor: 'eyes', color: '#111827', color2: '#ef4444', draw: (c) => `<path d="M${n(-c.w * 0.52)} 0Q${n(-c.w * 0.6)} ${n(-c.eyeDy - 16)} 0 ${n(-c.eyeDy - 16)}Q${n(c.w * 0.6)} ${n(-c.eyeDy - 16)} ${n(c.w * 0.52)} 0" stroke="${c.color}" stroke-width="8" fill="none" stroke-linecap="round"/>${[-1, 1].map((s) => `<rect x="${n(s * c.w * 0.52 - 11)}" y="-16" width="22" height="34" rx="10" fill="${c.color2}" ${S(3)}/>`).join('')}` },
  { id: 'hair', label: 'Tupé', group: 'head', anchor: 'top', color: '#78350f', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-30 14Q-40 -20 -6 -26Q-10 -40 14 -36Q40 -30 34 14Q24 -8 0 -4Q-18 -2 -30 14Z" fill="${c.color}" ${S(3)}/></g>` },
  { id: 'sprout', label: 'Brote', group: 'head', anchor: 'top', color: '#22c55e', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M0 6V-20" stroke="#15803d" stroke-width="4" stroke-linecap="round"/><path d="M0 -18Q-24 -34 -28 -14Q-10 -8 0 -18Z" fill="${c.color}" ${S(2.5)}/><path d="M0 -20Q20 -38 28 -20Q12 -10 0 -20Z" fill="${c.color}" ${S(2.5)}/></g>` },
  // Sombreros añadidos después: `random: false` los deja fuera de randomCharacter (si entraran en
  // la lista del grupo, cada semilla ya creada sacaría otro ot). Se eligen a mano en el editor.
  { id: 'fedora', label: 'Fedora', group: 'head', anchor: 'top', random: false, color: '#57534e', color2: '#1c1917', draw: (c) => `<g transform="scale(${n(c.k)}) rotate(-6)"><path d="M-64 8Q-58 -2 -40 2Q0 10 40 2Q58 -2 64 8Q42 20 0 20Q-42 20 -64 8Z" fill="${c.color}" ${S(3)}/><path d="M-34 6Q-38 -30 -20 -38Q-6 -30 0 -34Q6 -30 20 -38Q38 -30 34 6Q0 14 -34 6Z" fill="${c.color}" ${S(3)}/><path d="M-35 -4Q0 4 35 -4L35 5Q0 13 -35 5Z" fill="${c.color2}"/><path d="M-24 -30Q-28 -14 -26 -6" stroke="#fff" stroke-width="3" fill="none" opacity=".18" stroke-linecap="round"/></g>` },
  { id: 'bowler', label: 'Bombín', group: 'head', anchor: 'top', random: false, color: '#1f2937', color2: '#78350f', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-50 10Q-52 0 -42 3Q0 12 42 3Q52 0 50 10Q30 20 0 20Q-30 20 -50 10Z" fill="${c.color}" ${S(3)}/><path d="M-34 8Q-38 -44 0 -44Q38 -44 34 8Q0 15 -34 8Z" fill="${c.color}" ${S(3)}/><path d="M-35 -2Q0 6 35 -2L34 6Q0 13 -34 6Z" fill="${c.color2}"/><path d="M-20 -34Q-28 -20 -26 -8" stroke="#fff" stroke-width="3.5" fill="none" opacity=".2" stroke-linecap="round"/></g>` },
  { id: 'propeller', label: 'Gorra de hélice', group: 'head', anchor: 'top', random: false, color: '#3b82f6', color2: '#facc15', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-44 14Q-46 -32 0 -34Q46 -32 44 14Z" fill="${c.color}" ${S(3)}/><path d="M-15 13Q-17 -22 0 -34Q17 -22 15 13Z" fill="${c.color2}"/><path d="M-44 14Q-46 -32 0 -34Q46 -32 44 14Z" fill="none" ${S(3)}/><path d="M-48 12Q0 22 48 12" stroke="${shade(c.color, -0.25)}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M0 -34V-46" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="-17" cy="-48" rx="17" ry="5.5" fill="#ef4444" ${S(2)}/><ellipse cx="17" cy="-48" rx="17" ry="5.5" fill="#22c55e" ${S(2)}/><circle cy="-48" r="4.5" fill="${c.color2}" ${S(2)}/></g>` },
  { id: 'witch', label: 'Sombrero de bruja', group: 'head', anchor: 'top', random: false, color: '#312e81', color2: '#a855f7', draw: (c) => `<g transform="scale(${n(c.k)})"><ellipse cy="10" rx="62" ry="12" fill="${c.color}" ${S(3)}/><path d="M-34 8Q-22 -38 4 -66Q22 -86 46 -76Q22 -66 18 -40Q24 -12 34 8Q0 16 -34 8Z" fill="${c.color}" ${S(3)}/><path d="M-32 -2Q0 6 32 -2L34 8Q0 16 -34 8Z" fill="${c.color2}"/><rect x="-8" y="-2" width="16" height="12" rx="2" fill="none" stroke="#facc15" stroke-width="3"/></g>` },
  { id: 'fez', label: 'Fez', group: 'head', anchor: 'top', random: false, color: '#b91c1c', color2: '#111827', draw: (c) => `<g transform="scale(${n(c.k)}) rotate(6)"><path d="M-26 12L-20 -34Q0 -38 20 -34L26 12Q0 18 -26 12Z" fill="${c.color}" ${S(3)}/><ellipse cy="-34" rx="20" ry="5" fill="${shade(c.color, -0.18)}" ${S(2.5)}/><path d="M0 -36Q22 -38 26 -8" stroke="${c.color2}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M21 -10h10l3 16h-16Z" fill="${c.color2}"/><path d="M-14 -26V6" stroke="#fff" stroke-width="3" opacity=".15" stroke-linecap="round"/></g>` },
  { id: 'sombrero', label: 'Sombrero mexicano', group: 'head', anchor: 'top', random: false, color: '#eab308', color2: '#dc2626', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-84 10Q-80 -6 -56 2Q0 16 56 2Q80 -6 84 10Q60 30 0 30Q-60 30 -84 10Z" fill="${c.color}" ${S(3)}/><path d="M-26 8Q-30 -40 0 -44Q30 -40 26 8Q0 16 -26 8Z" fill="${c.color}" ${S(3)}/><path d="M-27 -4L-18 3L-9 -4L0 3L9 -4L18 3L27 -4" stroke="${c.color2}" stroke-width="4" fill="none" stroke-linejoin="round"/>${[-70, -48, -24, 0, 24, 48, 70].map((x) => `<circle cx="${x}" cy="${n(22 - Math.abs(x) * 0.12)}" r="3.5" fill="${c.color2}"/>`).join('')}</g>` },
  { id: 'bucket', label: 'Gorro pescador', group: 'head', anchor: 'top', random: false, color: '#a3a35a', color2: '#65662f', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-46 4Q0 14 46 4L60 20Q0 34 -60 20Z" fill="${shade(c.color, -0.08)}" ${S(3)}/><path d="M-36 -26Q0 -38 36 -26L44 6Q0 16 -44 6Z" fill="${c.color}" ${S(3)}/><path d="M-50 12Q0 24 50 12M-40 -1Q0 9 40 -1" stroke="${c.color2}" stroke-width="1.8" stroke-dasharray="4 3" fill="none"/></g>` },
  { id: 'jester', label: 'Bufón', group: 'head', anchor: 'top', random: false, color: '#7c3aed', color2: '#16a34a', draw: (c) => `<g transform="scale(${n(c.k)})"><path d="M-40 6Q-48 -28 -76 -26Q-56 -42 -26 -34Q-14 -20 -10 6Z" fill="${c.color}" ${S(3)}/><path d="M40 6Q48 -28 76 -26Q56 -42 26 -34Q14 -20 10 6Z" fill="${c.color}" ${S(3)}/><path d="M-16 6Q-18 -42 0 -64Q18 -42 16 6Z" fill="${c.color2}" ${S(3)}/>${[[-76, -26], [0, -64], [76, -26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="#facc15" ${S(2)}/>`).join('')}<rect x="-46" y="0" width="92" height="16" rx="8" fill="${shade(c.color, -0.2)}" ${S(3)}/></g>` },
  // ── ojos ──
  { id: 'glasses', label: 'Gafas redondas', group: 'eyes', anchor: 'eyes', color: '#1f2937', draw: (c) => `${[-1, 1].map((s) => `<circle cx="${n(s * c.sp)}" r="${n(c.r * 1.55)}" fill="#fff" fill-opacity=".12" stroke="${c.color}" stroke-width="3.5"/>`).join('')}<path d="M${n(-c.sp + c.r * 1.55)} -2Q0 -8 ${n(c.sp - c.r * 1.55)} -2" stroke="${c.color}" stroke-width="3" fill="none"/>` },
  { id: 'square', label: 'Gafas cuadradas', group: 'eyes', anchor: 'eyes', color: '#1f2937', draw: (c) => `${[-1, 1].map((s) => `<rect x="${n(s * c.sp - c.r * 1.7)}" y="${n(-c.r * 1.3)}" width="${n(c.r * 3.4)}" height="${n(c.r * 2.6)}" rx="4" fill="#fff" fill-opacity=".12" stroke="${c.color}" stroke-width="4"/>`).join('')}<path d="M${n(-c.sp + c.r * 1.7)} -3H${n(c.sp - c.r * 1.7)}" stroke="${c.color}" stroke-width="4"/>` },
  { id: 'nerd', label: 'Gafas empollón', group: 'eyes', anchor: 'eyes', color: '#111827', draw: (c) => `${[-1, 1].map((s) => `<rect x="${n(s * c.sp - c.r * 1.6)}" y="${n(-c.r * 1.4)}" width="${n(c.r * 3.2)}" height="${n(c.r * 2.8)}" rx="${n(c.r)}" fill="#fff" fill-opacity=".15" stroke="${c.color}" stroke-width="6"/>`).join('')}<rect x="-6" y="-7" width="12" height="9" fill="#fafafa" ${S(1.5)}/>` },
  { id: 'sunglasses', label: 'Gafas de sol', group: 'eyes', anchor: 'eyes', color: '#0f172a', draw: (c) => `<path d="M${n(-c.sp - c.r * 2)} ${n(-c.r * 1.1)}H${n(c.sp + c.r * 2)}" stroke="${c.color}" stroke-width="4"/>${[-1, 1].map((s) => `<path d="M${n(s * c.sp - c.r * 1.8)} ${n(-c.r * 1.2)}H${n(s * c.sp + c.r * 1.8)}Q${n(s * c.sp + c.r * 1.7)} ${n(c.r * 1.6)} ${n(s * c.sp)} ${n(c.r * 1.5)}Q${n(s * c.sp - c.r * 1.7)} ${n(c.r * 1.6)} ${n(s * c.sp - c.r * 1.8)} ${n(-c.r * 1.2)}Z" fill="${c.color}"/><path d="M${n(s * c.sp - c.r * 1.1)} ${n(-c.r * 0.5)}l${n(c.r * 0.7)} ${n(c.r * 0.9)}" stroke="#fff" stroke-width="2.5" opacity=".5" stroke-linecap="round"/>`).join('')}` },
  { id: 'aviator', label: 'Aviador', group: 'eyes', anchor: 'eyes', color: '#b45309', color2: '#7c2d12', draw: (c) => `${[-1, 1].map((s) => `<path d="M${n(s * c.sp - c.r * 1.8)} ${n(-c.r * 1.1)}H${n(s * c.sp + c.r * 1.8)}Q${n(s * c.sp + c.r * 2)} ${n(c.r * 1.9)} ${n(s * c.sp)} ${n(c.r * 1.7)}Q${n(s * c.sp - c.r * 2)} ${n(c.r * 1.9)} ${n(s * c.sp - c.r * 1.8)} ${n(-c.r * 1.1)}Z" fill="${c.color2}" fill-opacity=".75" stroke="${c.color}" stroke-width="2.5"/>`).join('')}<path d="M${n(-c.sp + c.r * 1.8)} ${n(-c.r * 1.1)}H${n(c.sp - c.r * 1.8)}M${n(-c.sp + c.r * 1.8)} ${n(-c.r * 0.5)}Q0 ${n(-c.r)} ${n(c.sp - c.r * 1.8)} ${n(-c.r * 0.5)}" stroke="${c.color}" stroke-width="2.5" fill="none"/>` },
  { id: 'heartglasses', label: 'Gafas corazón', group: 'eyes', anchor: 'eyes', color: '#ec4899', draw: (c) => `${[-1, 1].map((s) => `<path d="${heartPath(c.r * 1.7)}" transform="translate(${n(s * c.sp)} ${n(-c.r * 0.1)})" fill="${c.color}" fill-opacity=".8" stroke="${shade(c.color, -0.35)}" stroke-width="3"/>`).join('')}<path d="M${n(-c.sp + c.r * 1.5)} ${n(-c.r * 0.6)}H${n(c.sp - c.r * 1.5)}" stroke="${shade(c.color, -0.35)}" stroke-width="3"/>` },
  { id: 'starglasses', label: 'Gafas estrella', group: 'eyes', anchor: 'eyes', color: '#facc15', draw: (c) => `${[-1, 1].map((s) => `<path d="${star(c.r * 2)}" transform="translate(${n(s * c.sp)} 0)" fill="${c.color}" fill-opacity=".85" stroke="${shade(c.color, -0.4)}" stroke-width="2.5" stroke-linejoin="round"/>`).join('')}` },
  { id: '3d', label: 'Gafas 3D', group: 'eyes', anchor: 'eyes', color: '#fafafa', draw: (c) => `<rect x="${n(-c.sp - c.r * 2.2)}" y="${n(-c.r * 1.5)}" width="${n(c.sp * 2 + c.r * 4.4)}" height="${n(c.r * 3)}" rx="3" fill="${c.color}" ${S(2.5)}/><rect x="${n(-c.sp - c.r * 1.5)}" y="${n(-c.r)}" width="${n(c.r * 3)}" height="${n(c.r * 2)}" fill="#ef4444" opacity=".85"/><rect x="${n(c.sp - c.r * 1.5)}" y="${n(-c.r)}" width="${n(c.r * 3)}" height="${n(c.r * 2)}" fill="#06b6d4" opacity=".85"/>` },
  { id: 'monocle', label: 'Monóculo', group: 'eyes', anchor: 'eyes', color: '#ca8a04', draw: (c) => `<circle cx="${n(c.sp)}" r="${n(c.r * 1.6)}" fill="#fff" fill-opacity=".15" stroke="${c.color}" stroke-width="3.5"/><path d="M${n(c.sp + c.r * 1.2)} ${n(c.r * 1.1)}Q${n(c.sp + c.r * 2.6)} ${n(c.r * 4)} ${n(c.sp + c.r * 1.2)} ${n(c.r * 6.5)}" stroke="${c.color}" stroke-width="1.8" fill="none" stroke-dasharray="3 2"/>` },
  { id: 'eyepatch', label: 'Parche', group: 'eyes', anchor: 'eyes', color: '#111827', clipExtra: true, draw: (c) => `<path d="M${n(-c.sp - c.r * 1.6)} ${n(-c.r * 1.1)}Q${n(-c.sp)} ${n(-c.r * 1.9)} ${n(-c.sp + c.r * 1.6)} ${n(-c.r * 1.1)}Q${n(-c.sp + c.r * 1.6)} ${n(c.r * 1.8)} ${n(-c.sp)} ${n(c.r * 1.8)}Q${n(-c.sp - c.r * 1.6)} ${n(c.r * 1.8)} ${n(-c.sp - c.r * 1.6)} ${n(-c.r * 1.1)}Z" fill="${c.color}"/>`, extra: (c) => `<path d="M${n(-c.w * 0.55)} ${n(-c.r * 3)}L${n(c.w * 0.55)} ${n(c.r * 0.4)}" stroke="${c.color}" stroke-width="3"/>` },
  { id: 'goggles', label: 'Gafas de piloto', group: 'eyes', anchor: 'eyes', color: '#78350f', color2: '#7dd3fc', draw: (c) => `<path d="M${n(-c.w * 0.55)} 0H${n(c.w * 0.55)}" stroke="${c.color}" stroke-width="${n(c.r * 1.4)}"/>${[-1, 1].map((s) => `<circle cx="${n(s * c.sp)}" r="${n(c.r * 1.7)}" fill="${c.color2}" fill-opacity=".6" stroke="#a3a3a3" stroke-width="5"/><path d="M${n(s * c.sp - c.r * 0.8)} ${n(-c.r * 0.6)}a${n(c.r)} ${n(c.r)} 0 0 1 ${n(c.r)} ${n(-c.r * 0.4)}" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>`).join('')}` },
  { id: 'visor', label: 'Visor', group: 'eyes', anchor: 'eyes', color: '#0ea5e9', draw: (c) => `<rect x="${n(-c.sp - c.r * 2.4)}" y="${n(-c.r * 1.4)}" width="${n(c.sp * 2 + c.r * 4.8)}" height="${n(c.r * 2.8)}" rx="${n(c.r * 1.4)}" fill="${c.color}" fill-opacity=".55" stroke="#0f172a" stroke-width="3"/><path d="M${n(-c.sp - c.r * 1.6)} ${n(-c.r * 0.6)}H${n(-c.sp)}" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>` },
  // ── cara ──
  { id: 'mustache', label: 'Bigote', group: 'face', anchor: 'mouth', color: '#3f2a1d', draw: (c) => `<path d="M0 -9Q-10 -16 -20 -12Q-30 -8 -34 -14Q-32 -2 -20 -2Q-8 -2 0 -7Q8 -2 20 -2Q32 -2 34 -14Q30 -8 20 -12Q10 -16 0 -9Z" fill="${c.color}" transform="scale(${n(c.m)})"/>` },
  { id: 'handlebar', label: 'Bigote manillar', group: 'face', anchor: 'mouth', color: '#1f2937', draw: (c) => `<path d="M0 -8Q-14 -16 -26 -8Q-34 -2 -40 -12Q-44 -20 -36 -22Q-42 -14 -34 -10Q-26 -6 -18 -6Q-6 -6 0 -4Q6 -6 18 -6Q26 -6 34 -10Q42 -14 36 -22Q44 -20 40 -12Q34 -2 26 -8Q14 -16 0 -8Z" fill="${c.color}" transform="scale(${n(c.m)})"/>` },
  { id: 'beard', label: 'Barba', group: 'face', anchor: 'mouth', color: '#78350f', draw: (c) => `<path d="M${n(-c.w * 0.42)} -16Q${n(-c.w * 0.46)} 40 0 46Q${n(c.w * 0.46)} 40 ${n(c.w * 0.42)} -16Q${n(c.w * 0.3)} 10 16 8Q0 18 -16 8Q${n(-c.w * 0.3)} 10 ${n(-c.w * 0.42)} -16Z" fill="${c.color}"/><path d="M-14 -8Q0 -14 14 -8" stroke="${c.color}" stroke-width="6" fill="none" stroke-linecap="round"/>` },
  { id: 'wizardbeard', label: 'Barba de mago', group: 'face', anchor: 'mouth', color: '#f5f5f4', draw: (c) => `<path d="M${n(-c.w * 0.4)} -14Q${n(-c.w * 0.4)} 40 -6 78Q0 70 6 78Q${n(c.w * 0.4)} 40 ${n(c.w * 0.4)} -14Q16 10 0 10Q-16 10 ${n(-c.w * 0.4)} -14Z" fill="${c.color}" stroke="#d6d3d1" stroke-width="2"/><path d="M0 -10Q-18 -18 -30 -8Q-18 -2 0 -4Q18 -2 30 -8Q18 -18 0 -10Z" fill="${c.color}" stroke="#d6d3d1" stroke-width="2"/>` },
  { id: 'goatee', label: 'Perilla', group: 'face', anchor: 'mouth', color: '#3f2a1d', draw: (c) => `<path d="M-8 12Q0 34 8 12Z" fill="${c.color}" transform="scale(${n(c.m)})"/>` },
  { id: 'pipe', label: 'Pipa', group: 'face', anchor: 'mouth', color: '#7c2d12', draw: (c) => `<g transform="translate(${n(c.mw * 0.5)} 2) scale(${n(c.m)})"><path d="M0 0Q14 4 22 12" stroke="#1f2937" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M18 6h16v14q0 8 -8 8q-8 0 -8 -8Z" fill="${c.color}" ${S(2.5)}/><ellipse cx="26" cy="6" rx="8" ry="2.5" fill="#292524"/><path d="M28 0q-4 -8 2 -14q6 -6 0 -14" stroke="#d6d3d1" stroke-width="2.5" fill="none" opacity=".7" stroke-linecap="round"/></g>` },
  { id: 'lollipop', label: 'Piruleta', group: 'face', anchor: 'mouth', color: '#ec4899', draw: (c) => `<g transform="translate(${n(c.mw * 0.5)} 0) scale(${n(c.m)})"><path d="M0 0L26 -10" stroke="#fafafa" stroke-width="3" ${''}/><circle cx="32" cy="-13" r="11" fill="${c.color}" ${S(2)}/><path d="M32 -13m-7 0a7 7 0 0 1 14 0a5 5 0 0 1 -10 0a3 3 0 0 1 6 0" stroke="#fff" stroke-width="2" fill="none"/></g>` },
  { id: 'clownnose', label: 'Nariz de payaso', group: 'face', anchor: 'nose', color: '#ef4444', draw: (c) => `<circle r="${n(9 * c.m)}" fill="${c.color}" ${S(2)}/><circle cx="${n(-3 * c.m)}" cy="${n(-3 * c.m)}" r="${n(2.5 * c.m)}" fill="#fff" opacity=".7"/>` },
  { id: 'nose', label: 'Nariz', group: 'face', anchor: 'nose', color: '#000000', draw: (c) => `<ellipse rx="${n(5 * c.m)}" ry="${n(3.5 * c.m)}" fill="${c.body}" style="filter:brightness(.8)"/><ellipse cx="${n(-1.5 * c.m)}" cy="${n(-1.2 * c.m)}" rx="${n(1.6 * c.m)}" ry="1" fill="#fff" opacity=".5"/>` },
  { id: 'pignose', label: 'Nariz de cerdito', group: 'face', anchor: 'nose', color: '#f9a8d4', draw: (c) => `<ellipse rx="${n(10 * c.m)}" ry="${n(7 * c.m)}" fill="${c.color}" ${S(2)}/><ellipse cx="${n(-3.5 * c.m)}" rx="${n(1.8 * c.m)}" ry="${n(3 * c.m)}" fill="${shade(c.color, -0.45)}"/><ellipse cx="${n(3.5 * c.m)}" rx="${n(1.8 * c.m)}" ry="${n(3 * c.m)}" fill="${shade(c.color, -0.45)}"/>` },
  { id: 'bandaid', label: 'Tirita', group: 'face', anchor: 'eyes', color: '#fcd9b6', draw: (c) => `<g transform="translate(${n(c.sp + c.r * 0.4)} ${n(c.r * 2.4)}) rotate(-30)"><rect x="-12" y="-4.5" width="24" height="9" rx="4.5" fill="${c.color}" stroke="#d6a77a" stroke-width="1.5"/><rect x="-4" y="-4.5" width="8" height="9" fill="${shade(c.color, -0.1)}"/></g>` },
  { id: 'scar', label: 'Cicatriz', group: 'face', anchor: 'eyes', color: '#7f1d1d', draw: (c) => `<g transform="translate(${n(-c.sp)} 0)" stroke="${c.color}" stroke-width="2.5" stroke-linecap="round" opacity=".8"><path d="M-6 ${n(-c.r * 2.6)}L6 ${n(c.r * 2.4)}"/><path d="M-6 -8h8M-4 0h8M-2 8h8"/></g>` },
  { id: 'ninjamask', label: 'Máscara ninja', group: 'face', anchor: 'mouth', clip: true, color: '#111827', draw: (c) => `<rect x="${n(-c.w)}" y="${n(-c.mouthDy + c.r * 1.6)}" width="${n(c.w * 2)}" height="${n(c.h)}" fill="${c.color}"/>` },
  { id: 'facemask', label: 'Mascarilla', group: 'face', anchor: 'mouth', color: '#bae6fd', draw: (c) => `<path d="M${n(-c.mw - 12)} -12Q0 -18 ${n(c.mw + 12)} -12Q${n(c.mw + 10)} 18 0 22Q${n(-c.mw - 10)} 18 ${n(-c.mw - 12)} -12Z" fill="${c.color}" ${S(2)}/><path d="M${n(-c.mw)} -4H${n(c.mw)}M${n(-c.mw + 2)} 5H${n(c.mw - 2)}" stroke="${shade(c.color, -0.2)}" stroke-width="1.5"/>` },
  // ── cuello ──
  { id: 'bowtie', label: 'Pajarita', group: 'neck', anchor: 'neck', color: '#dc2626', draw: (c) => `<path d="M0 0L-22 -12V12Z" fill="${c.color}" ${S(2.5)}/><path d="M0 0L22 -12V12Z" fill="${c.color}" ${S(2.5)}/><rect x="-6" y="-6" width="12" height="12" rx="3" fill="${shade(c.color, -0.2)}" ${S(2.5)}/>` },
  { id: 'tie', label: 'Corbata', group: 'neck', anchor: 'neck', color: '#1d4ed8', draw: (c) => `<path d="M-7 -6H7L5 4H-5Z" fill="${shade(c.color, -0.2)}" ${S(2)}/><path d="M-5 4H5L10 40L0 50L-10 40Z" fill="${c.color}" ${S(2)}/><path d="M-6 16L8 12M-8 28L9 24" stroke="${shade(c.color, 0.35)}" stroke-width="2.5"/>` },
  { id: 'scarf', label: 'Bufanda', group: 'neck', anchor: 'neck', clip: true, color: '#16a34a', color2: '#fafafa', draw: (c) => `<rect x="${n(-c.w)}" y="-8" width="${n(c.w * 2)}" height="16" fill="${c.color}"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${n(-c.w + i * c.w * 0.2)}" y="-8" width="${n(c.w * 0.08)}" height="16" fill="${c.color2}" opacity=".6"/>`).join('')}`, extra: (c) => `<path d="M${n(c.w * 0.2)} 4v34h14v-30Z" fill="${c.color}" ${S(2)}/>` },
  { id: 'pearls', label: 'Collar de perlas', group: 'neck', anchor: 'neck', color: '#fafaf9', draw: (c) => Array.from({ length: 11 }, (_, i) => { const t = (i / 10) * Math.PI; return `<circle cx="${n(-Math.cos(t) * c.w * 0.32)}" cy="${n(Math.sin(t) * 12 - 6)}" r="4.5" fill="${c.color}" stroke="#d6d3d1" stroke-width="1.2"/>`; }).join('') },
  { id: 'medal', label: 'Medalla', group: 'neck', anchor: 'neck', color: '#facc15', color2: '#2563eb', draw: (c) => `<path d="M-14 -10L0 12L14 -10" stroke="${c.color2}" stroke-width="7" fill="none"/><circle cy="20" r="11" fill="${c.color}" ${S(2.5)}/><path d="${star(6)}" transform="translate(0 20)" fill="${shade(c.color, -0.25)}"/>` },
  { id: 'bell', label: 'Cascabel', group: 'neck', anchor: 'neck', color: '#facc15', color2: '#dc2626', clip: true, draw: (c) => `<rect x="${n(-c.w)}" y="-6" width="${n(c.w * 2)}" height="10" fill="${c.color2}"/>`, extra: () => `<circle cy="10" r="8" fill="#facc15" stroke="#1f2937" stroke-width="2"/><path d="M-6 10h12M0 10v6" stroke="#1f2937" stroke-width="1.8"/>` },
  { id: 'ruff', label: 'Gorguera real', group: 'neck', anchor: 'neck', color: '#fafafa', draw: (c) => `<path d="${Array.from({ length: 12 }, (_, i) => { const x = -c.w * 0.4 + (i * c.w * 0.8) / 11; return `${i ? 'L' : 'M'}${n(x)} ${i % 2 ? 10 : -6}`; }).join('')}L${n(c.w * 0.4)} 14L${n(-c.w * 0.4)} 14Z" fill="${c.color}" ${S(2)}/>` },
  // ── espalda ──
  {
    id: 'cape', label: 'Capa real', group: 'back', anchor: 'neck', layer: 'back', color: '#b91c1c', color2: '#fafafa',
    draw: (c) => `<path d="M${n(-c.w * 0.3)} ${n(-c.above * 0.7)}Q${n(-c.w * 0.62)} ${n(-c.above * 0.2)} ${n(-c.w * 0.62)} ${n(c.below)}H${n(c.w * 0.62)}Q${n(c.w * 0.62)} ${n(-c.above * 0.2)} ${n(c.w * 0.3)} ${n(-c.above * 0.7)}Z" fill="${c.color}" ${S(3)}/><path d="M${n(-c.w * 0.64)} ${n(c.below - 7)}H${n(c.w * 0.64)}V${n(c.below + 3)}H${n(-c.w * 0.64)}Z" fill="${c.color2}" ${S(2)}/>${[-0.5, -0.25, 0, 0.25, 0.5].map((k) => `<path d="M${n(k * c.w)} ${n(c.below - 4)}v5" stroke="#111" stroke-width="2.5"/>`).join('')}`,
  },
  { id: 'superhero', label: 'Capa de héroe', group: 'back', anchor: 'neck', layer: 'back', color: '#2563eb', draw: (c) => `<path d="M${n(-c.w * 0.3)} ${n(-c.above * 0.7)}Q${n(-c.w * 0.75)} ${n(0)} ${n(-c.w * 0.66)} ${n(c.below + 6)}Q0 ${n(c.below - 4)} ${n(c.w * 0.66)} ${n(c.below + 6)}Q${n(c.w * 0.75)} 0 ${n(c.w * 0.3)} ${n(-c.above * 0.7)}Z" fill="${c.color}" ${S(3)}/>` },
  { id: 'wings', label: 'Alas de ángel', group: 'back', anchor: 'center', layer: 'back', color: '#fafafa', grow: 'part', shape: (c) => [-1, 1].map((s) => ({ d: ANGEL_WING, tf: `translate(${n(s * c.w * 0.4)} -10) scale(${s} 1)` })), draw: (c) => [-1, 1].map((s) => `<g transform="translate(${n(s * c.w * 0.4)} -10) scale(${s} 1)"><path d="${ANGEL_WING}" fill="${c.color}" ${S(2.5)}/></g>`).join('') },
  { id: 'batwings', label: 'Alas de murciélago', group: 'back', anchor: 'center', layer: 'back', color: '#3b0764', grow: 'part', shape: (c) => [-1, 1].map((s) => ({ d: BAT_WING, tf: `translate(${n(s * c.w * 0.4)} -10) scale(${s} 1)` })), draw: (c) => [-1, 1].map((s) => `<g transform="translate(${n(s * c.w * 0.4)} -10) scale(${s} 1)"><path d="${BAT_WING}" fill="${c.color}" ${S(2.5)}/></g>`).join('') },
  { id: 'tail', label: 'Cola de diablillo', group: 'back', anchor: 'bottom', layer: 'back', color: '#dc2626', grow: 'part', shape: (c) => [{ d: tailD(c), sw: 5, sl: c.w * 0.3 }], draw: (c) => `<path d="${tailD(c)}" stroke="${c.color}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${n(c.w * 0.62)} -52L${n(c.w * 0.54)} -36L${n(c.w * 0.72)} -38Z" fill="${c.color}" ${S(2)}/>` },
  { id: 'jetpack', label: 'Mochila cohete', group: 'back', anchor: 'center', layer: 'back', color: '#94a3b8', draw: (c) => [-1, 1].map((s) => `<rect x="${n(s * c.w * 0.42 - 12)}" y="-30" width="24" height="56" rx="10" fill="${c.color}" ${S(2.5)}/><path d="M${n(s * c.w * 0.42 - 8)} 26L${n(s * c.w * 0.42)} 46L${n(s * c.w * 0.42 + 8)} 26Z" fill="#f97316"/>`).join('') },
  // ── extras ──
  { id: 'parrot', label: 'Loro', group: 'extra', anchor: 'shoulder', color: '#16a34a', color2: '#ef4444', draw: () => `<g transform="translate(0 -14)"><path d="M-4 16Q-14 -2 -2 -14Q12 -20 14 -4Q14 10 4 18Z" fill="#16a34a" stroke="#1f2937" stroke-width="2"/><path d="M-2 -14Q6 -24 14 -14" fill="#ef4444" stroke="#1f2937" stroke-width="2"/><circle cx="4" cy="-6" r="2.2" fill="#111"/><path d="M12 -6q8 2 4 8l-4 -2Z" fill="#facc15" stroke="#1f2937" stroke-width="1.5"/><path d="M-4 16l-6 12M2 18l-2 12" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round"/></g>` },
  { id: 'sparkles', label: 'Destellos', group: 'extra', anchor: 'center', color: '#facc15', draw: (c) => [[-0.75, -0.55, 9], [0.8, -0.35, 7], [0.7, 0.55, 6], [-0.8, 0.35, 5]].map(([a, b, r]) => `<path d="${star(r, 0.3, 4)}" transform="translate(${n(a * c.w)} ${n(b * c.h)})" fill="${c.color}"/>`).join('') },
  { id: 'hearts', label: 'Corazones', group: 'extra', anchor: 'top', color: '#f43f5e', draw: () => [[-40, -10, 7], [36, -18, 9], [8, -34, 6]].map(([x, y, r]) => `<path d="${heartPath(r)}" transform="translate(${x} ${y})" fill="#f43f5e"/>`).join('') },
  { id: 'zzz', label: 'Zzz', group: 'extra', anchor: 'top', color: '#60a5fa', draw: (c) => `<text x="30" y="-10" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="18" fill="${c.color}">Z</text><text x="46" y="-26" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="13" fill="${c.color}">z</text><text x="58" y="-38" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="10" fill="${c.color}">z</text>` },
  { id: 'sweat', label: 'Gota de sudor', group: 'extra', anchor: 'eyes', color: '#60a5fa', draw: (c) => `<path d="M${n(c.sp + c.r * 2.4)} ${n(-c.r * 2.4)}q-7 10 0 14q7 -4 0 -14Z" fill="${c.color}" stroke="#1e40af" stroke-width="1.5"/>` },
  ...moreAccHead({ n, shade, S, star, heartPath, ellD, hornD, catEarD, tailD, ANGEL_WING, BAT_WING }),
  ...moreAccRest({ n, shade, S, star, heartPath, ellD, hornD, catEarD, tailD, ANGEL_WING, BAT_WING }),
];

// ───────────────────────────── estilos (plantillas completas) ─────────────────────────────

const acc = (id, o = {}) => ({ id, x: 0, y: 0, scale: 1, rot: 0, ...o });

export const PRESETS = [
  { id: 'classic', label: 'Clásico', spec: { body: { shape: 'pou', color: '#a0714f', pattern: 'belly', patternColor: '#c9a27e' }, finish: 'glossy', eyes: { type: 'round' }, mouth: { type: 'smile' }, cheeks: { type: 'blush' } } },
  { id: 'pirate', label: 'Pirata', spec: { body: { shape: 'pou', color: '#e0a97e' }, finish: 'glossy', eyes: { type: 'focused' }, brows: { type: 'thick' }, mouth: { type: 'smirk' }, accessories: [acc('pirate'), acc('eyepatch'), acc('beard', { color: '#7c2d12' }), acc('parrot')] } },
  { id: 'king', label: 'Rey', spec: { body: { shape: 'pou', color: '#f1c27d' }, finish: 'glossy', eyes: { type: 'round' }, brows: { type: 'bushy', color: '#6b4423' }, mouth: { type: 'smile' }, accessories: [acc('cape'), acc('crown'), acc('handlebar', { color: '#6b4423' }), acc('ruff')] } },
  { id: 'queen', label: 'Reina', spec: { body: { shape: 'egg', color: '#f5d0b5' }, finish: 'soft3d', eyes: { type: 'lashes', iris: '#7c3aed' }, mouth: { type: 'lips' }, cheeks: { type: 'blush' }, accessories: [acc('cape', { color: '#7c3aed' }), acc('tiara'), acc('pearls')] } },
  { id: 'wizard', label: 'Mago', spec: { body: { shape: 'bean', color: '#c7d2fe' }, finish: 'soft3d', eyes: { type: 'round' }, brows: { type: 'bushy', color: '#e5e7eb' }, mouth: { type: 'smile' }, accessories: [acc('wizard'), acc('wizardbeard'), acc('sparkles')] } },
  { id: 'chef', label: 'Chef', spec: { body: { shape: 'round', color: '#fcd9b6' }, finish: 'glossy', eyes: { type: 'happy' }, mouth: { type: 'grin' }, cheeks: { type: 'blush' }, accessories: [acc('chef'), acc('mustache'), acc('bowtie')] } },
  { id: 'detective', label: 'Detective', spec: { body: { shape: 'pou', color: '#d6b48c' }, finish: 'clay', eyes: { type: 'focused' }, brows: { type: 'thick' }, mouth: { type: 'flat' }, accessories: [acc('cap', { color: '#78716c' }), acc('monocle'), acc('pipe'), acc('mustache', { color: '#44403c' })] } },
  { id: 'cowboy', label: 'Vaquero', spec: { body: { shape: 'pou', color: '#e8b98a' }, finish: 'clay', eyes: { type: 'focused' }, mouth: { type: 'smirk' }, accessories: [acc('cowboy'), acc('mustache', { color: '#78350f' }), acc('scarf', { color: '#dc2626' })] } },
  { id: 'astronaut', label: 'Astronauta', spec: { body: { shape: 'round', color: '#f5f5f4', pattern: 'twotone', patternColor: '#e2e8f0' }, finish: 'soft3d', eyes: { type: 'kawaii' }, mouth: { type: 'open' }, accessories: [acc('helmet'), acc('jetpack')] } },
  { id: 'robot', label: 'Robot', spec: { body: { shape: 'robot', color: '#94a3b8', pattern: 'circuit', patternColor: '#64748b' }, finish: 'soft3d', eyes: { type: 'robot', iris: '#22d3ee' }, mouth: { type: 'robot' }, accessories: [acc('antenna')] } },
  { id: 'viking', label: 'Vikingo', spec: { body: { shape: 'wide', color: '#f0c9a0' }, finish: 'clay', eyes: { type: 'angry' }, brows: { type: 'thick', color: '#b45309' }, mouth: { type: 'grin' }, accessories: [acc('viking'), acc('beard', { color: '#ea580c' })] } },
  { id: 'ninja', label: 'Ninja', spec: { body: { shape: 'bean', color: '#1f2937' }, finish: 'toon', eyes: { type: 'focused', white: '#ffffff' }, mouth: { type: 'flat' }, accessories: [acc('ninjamask'), acc('headband')] } },
  { id: 'ghost', label: 'Fantasma', spec: { body: { shape: 'ghost', color: '#f8fafc' }, finish: 'soft3d', eyes: { type: 'bean' }, mouth: { type: 'oh' }, cheeks: { type: 'blush' } } },
  { id: 'cat', label: 'Gatito', spec: { body: { shape: 'cat', color: '#f59e0b', pattern: 'tiger', patternColor: '#b45309' }, finish: 'glossy', eyes: { type: 'cat', iris: '#84cc16' }, mouth: { type: 'cat' }, cheeks: { type: 'whiskers' }, accessories: [acc('bell')] } },
  { id: 'devil', label: 'Diablillo', spec: { body: { shape: 'pou', color: '#ef4444' }, finish: 'glossy', eyes: { type: 'villain' }, mouth: { type: 'vampire' }, accessories: [acc('horns', { color: '#7f1d1d' }), acc('tail', { color: '#7f1d1d' }), acc('batwings', { color: '#450a0a' })] } },
  { id: 'angel', label: 'Ángel', spec: { body: { shape: 'round', color: '#fde7d4' }, finish: 'soft3d', eyes: { type: 'happy' }, mouth: { type: 'smile' }, cheeks: { type: 'blush' }, accessories: [acc('wings'), acc('halo')] } },
  { id: 'scientist', label: 'Científica', spec: { body: { shape: 'egg', color: '#e9d5ff' }, finish: 'glossy', eyes: { type: 'round' }, mouth: { type: 'grin' }, accessories: [acc('goggles'), acc('sweat')] } },
  { id: 'rocker', label: 'Rockero', spec: { body: { shape: 'pou', color: '#fbbf24' }, finish: 'toon', eyes: { type: 'round' }, mouth: { type: 'tongue' }, accessories: [acc('hair', { color: '#111827' }), acc('sunglasses'), acc('headphones')] } },
  { id: 'student', label: 'Graduada', spec: { body: { shape: 'pou', color: '#bfdbfe' }, finish: 'glossy', eyes: { type: 'kawaii' }, mouth: { type: 'laugh' }, cheeks: { type: 'blush' }, accessories: [acc('grad'), acc('medal')] } },
  { id: 'clown', label: 'Payaso', spec: { body: { shape: 'round', color: '#fafafa', pattern: 'spots', patternColor: '#f472b6' }, finish: 'glossy', eyes: { type: 'wide' }, mouth: { type: 'laugh' }, cheeks: { type: 'hearts' }, accessories: [acc('party'), acc('clownnose'), acc('ruff', { color: '#facc15' })] } },
  { id: 'monster', label: 'Monstruo', spec: { body: { shape: 'blob', color: '#84cc16', pattern: 'spots', patternColor: '#65a30d' }, finish: 'clay', eyes: { type: 'cyclops', iris: '#f97316' }, mouth: { type: 'monster' }, accessories: [acc('horns', { color: '#fef3c7' })] } },
  { id: 'nerd', label: 'Empollón', spec: { body: { shape: 'tall', color: '#fde68a' }, finish: 'flat', eyes: { type: 'round' }, mouth: { type: 'buck' }, cheeks: { type: 'freckles' }, accessories: [acc('nerd'), acc('bowtie', { color: '#2563eb' })] } },
  { id: 'hero', label: 'Superhéroe', spec: { body: { shape: 'pou', color: '#60a5fa' }, finish: 'toon', eyes: { type: 'focused' }, brows: { type: 'angled' }, mouth: { type: 'grin' }, body2: null, accessories: [acc('superhero', { color: '#dc2626' }), acc('visor', { color: '#dc2626' })] } },
  { id: 'neon', label: 'Neón', spec: { body: { shape: 'drop', color: '#a855f7' }, finish: 'neon', eyes: { type: 'glow', iris: '#22d3ee' }, mouth: { type: 'smile' } } },
  { id: 'santa', label: 'Navidad', spec: { body: { shape: 'round', color: '#fcd9b6' }, finish: 'glossy', eyes: { type: 'happy' }, mouth: { type: 'laugh' }, cheeks: { type: 'blush', color: '#ef4444' }, accessories: [acc('santa'), acc('wizardbeard')] } },
  { id: 'sprout', label: 'Brotecito', spec: { body: { shape: 'pear', color: '#86efac' }, finish: 'glossy', eyes: { type: 'kawaii' }, mouth: { type: 'tiny' }, cheeks: { type: 'blush' }, accessories: [acc('sprout')] } },
];

/**
 * Tamaño de cada lista en el catálogo 1 (antes de 2026-10). randomCharacter(seed, { legacy: true })
 * sortea solo entre estas primeras piezas para que las semillas antiguas sigan dando el mismo ot.
 * Las piezas nuevas van SIEMPRE al final de su lista.
 */
export const CATALOG_V1 = { shapes: 16, eyes: 33, brows: 9, mouths: 28, cheeks: 8, patterns: 10, finishes: 7, textures: 10, accessories: 80 };

/** Listas por tipo (para partLabel). Moods y gestos viven en Character.js y solo tienen catálogo. */
const CATALOG = { shapes: SHAPES, eyes: EYES, brows: BROWS, mouths: MOUTHS, cheeks: CHEEKS, patterns: PATTERNS, finishes: FINISHES, textures: TEXTURES, accessories: ACCESSORIES, groups: ACCESSORY_GROUPS, presets: PRESETS };

// Textos en/pt de las piezas del catálogo 2 (llevan `en` y `pt` junto al `label` en español).
{
  const by = { es: {}, en: {}, pt: {} };
  for (const [kind, list] of Object.entries(CATALOG)) {
    for (const x of list) {
      if (Array.isArray(x) || !x.en) continue;
      for (const l of ['es', 'en', 'pt']) (by[l][kind] ||= {})[x.id] = l === 'es' ? x.label : x[l];
    }
  }
  addCatalog({ es: { character: by.es }, en: { character: by.en }, pt: { character: by.pt } });
}

const ALIAS3D = Object.fromEntries(['eyes', 'brows', 'mouths', 'cheeks', 'patterns', 'accessories', 'finishes', 'textures'].map((k) => [k, Object.fromEntries(CATALOG[k].filter((x) => x.as3d).map((x) => [x.id, x.as3d]))]));
/** Id equivalente para el visor 3D (las piezas nuevas sin modelo propio usan la más parecida). */
export const as3d = (kind, id) => ALIAS3D[kind]?.[id] || id;
