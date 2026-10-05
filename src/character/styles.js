/**
 * Estilos artísticos («mundos») del personaje 2D: el mismo ot redibujado como grabado ukiyo-e,
 * plastilina, vitral, Bauhaus, manuscrito iluminado, glitch, boceto a tinta, pop art, acuarela,
 * píxel 8 bits, synthwave, art nouveau, cubismo, crayones, plano técnico, puntillismo o xilografía,
 * con un fondo a juego.
 *
 *   const spec = normalizeCharacter({ ...ot, style: 'ukiyoe' });   // se guarda en spec.style
 *   el.innerHTML = renderCharacter(spec);                            // estilo + fondo
 *   createCharacter(el, spec);                                       // vivo: respira y parpadea igual
 *
 * Cada estilo aporta, todo procedural (SVG/CSS, sin dependencias):
 *   · paleta: remapea los colores de la spec (stylizeSpec) y fija acabado, textura y contorno;
 *   · capa interior: algo dibujado dentro del cuerpo (vetas, plomos del vitral, mitades Bauhaus…);
 *   · filtro: <filter> sobre todo el personaje (grano, posterizado, luz de plastilina, píxeles…);
 *   · fondo: escena en un marco fijo de 300×300 (el suelo empieza en y≈240), determinista con la
 *     semilla del ot (styleSeed): el mismo ot siempre tiene el mismo paisaje.
 *
 * 'none' (o ausente, specs antiguas) no cambia nada. Los filtros tienen versión 'lite' (sin ruido
 * ni luces) para cuando el contorno se anima, en equipos modestos o con movimiento reducido.
 */

import { luminance, hexToRgb } from './parts.js';
import { skinHash } from './skin.js';
import { seeded } from './motion.js';
import { addCatalog } from '../i18n/index.js';

const n = (v) => Math.round(v * 100) / 100;

export const STYLES = [
  { id: 'none', label: { es: 'Ninguno', en: 'None', pt: 'Nenhum' } },
  { id: 'ukiyoe', label: { es: 'Ukiyo-e', en: 'Ukiyo-e', pt: 'Ukiyo-e' } },
  { id: 'clay', label: { es: 'Plastilina', en: 'Claymation', pt: 'Massinha' } },
  { id: 'glass', label: { es: 'Vitral', en: 'Stained glass', pt: 'Vitral' } },
  { id: 'bauhaus', label: { es: 'Bauhaus', en: 'Bauhaus', pt: 'Bauhaus' } },
  { id: 'manuscript', label: { es: 'Manuscrito', en: 'Manuscript', pt: 'Iluminura' } },
  { id: 'glitch', label: { es: 'Glitch', en: 'Glitch', pt: 'Glitch' } },
  { id: 'ink', label: { es: 'Tinta', en: 'Ink sketch', pt: 'Nanquim' } },
  { id: 'pop', label: { es: 'Pop art', en: 'Pop art', pt: 'Pop art' } },
  { id: 'watercolor', label: { es: 'Acuarela', en: 'Watercolor', pt: 'Aquarela' } },
  { id: 'pixel', label: { es: 'Píxel 8 bits', en: '8-bit pixel', pt: 'Pixel 8 bits' } },
  { id: 'synthwave', label: { es: 'Synthwave', en: 'Synthwave', pt: 'Synthwave' } },
  { id: 'nouveau', label: { es: 'Art nouveau', en: 'Art nouveau', pt: 'Art nouveau' } },
  { id: 'cubism', label: { es: 'Cubismo', en: 'Cubism', pt: 'Cubismo' } },
  { id: 'crayon', label: { es: 'Crayones', en: 'Crayon', pt: 'Giz de cera' } },
  { id: 'blueprint', label: { es: 'Plano técnico', en: 'Blueprint', pt: 'Planta técnica' } },
  { id: 'pointillism', label: { es: 'Puntillismo', en: 'Pointillism', pt: 'Pontilhismo' } },
  { id: 'woodcut', label: { es: 'Xilografía', en: 'Woodcut', pt: 'Xilogravura' } },
  { id: 'riso', label: { es: 'Risografía', en: 'Riso print', pt: 'Risografia' } },
  { id: 'dotmatrix', label: { es: 'Matriz verde', en: 'Dot matrix', pt: 'Matriz verde' } },
  { id: 'chalk', label: { es: 'Tiza', en: 'Chalk', pt: 'Giz' } },
  { id: 'sticker', label: { es: 'Calcomanía', en: 'Sticker', pt: 'Adesivo' } },
  { id: 'felt', label: { es: 'Fieltro', en: 'Felt', pt: 'Feltro' } },
  { id: 'papercut', label: { es: 'Papel recortado', en: 'Papercut', pt: 'Papel recortado' } },
  { id: 'lowpoly', label: { es: 'Low poly', en: 'Low poly', pt: 'Low poly' } },
  { id: 'marble', label: { es: 'Mármol', en: 'Marble', pt: 'Mármore' } },
  { id: 'candy', label: { es: 'Gomita', en: 'Gummy', pt: 'Bala de goma' } },
  { id: 'holo', label: { es: 'Holográfico', en: 'Holographic', pt: 'Holográfico' } },
  { id: 'sumie', label: { es: 'Sumi-e', en: 'Sumi-e', pt: 'Sumi-e' } },
  { id: 'tarot', label: { es: 'Tarot', en: 'Tarot', pt: 'Tarô' } },
  { id: 'retro70', label: { es: 'Años 70', en: 'Seventies', pt: 'Anos 70' } },
  { id: 'mosaic', label: { es: 'Mosaico', en: 'Mosaic', pt: 'Mosaico' } },
  { id: 'neonsign', label: { es: 'Letrero de neón', en: 'Neon sign', pt: 'Letreiro neon' } },
  { id: 'graffiti', label: { es: 'Grafiti', en: 'Graffiti', pt: 'Grafite' } },
  { id: 'thermal', label: { es: 'Cámara térmica', en: 'Thermal', pt: 'Câmera térmica' } },
];
export const STYLE_IDS = STYLES.map((s) => s.id);

const lang = (l) => ({
  character: { styles: Object.fromEntries(STYLES.map((s) => [s.id, s.label[l]])) },
  editor: {
    artStyle: {
      es: { title: 'Estilo artístico', hint: 'Redibuja el mismo personaje en otro estilo, con un fondo a juego.' },
      en: { title: 'Art style', hint: 'Redraws the same character in another art style, with a matching backdrop.' },
      pt: { title: 'Estilo artístico', hint: 'Redesenha o mesmo personagem em outro estilo, com um fundo combinando.' },
    }[l],
  },
});
addCatalog({ es: lang('es'), en: lang('en'), pt: lang('pt') });

// ───────────────────────────── color ─────────────────────────────

const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

function toHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (k) => {
    const t = (k + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)));
  };
  return toHex([f(0), f(8), f(4)]);
}

/** Distancia «redmean» entre dos colores (barata y bastante perceptual). */
function dist(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rm = (r1 + r2) / 2;
  return (2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2;
}
const nearest = (hex, list, avoid = []) => {
  const pool = list.filter((c) => !avoid.includes(c));
  return pool.reduce((best, c) => (dist(hex, c) < dist(hex, best) ? c : best), pool[0]);
};
const grey = (hex, lo, hi) => {
  const v = Math.round(255 * (lo + luminance(hex) * (hi - lo)));
  return toHex([v, v, v]);
};

const PAL = {
  ukiyoe: ['#1f3a5f', '#3f6e8c', '#c0392b', '#d98e4a', '#e6c27a', '#7a9a6a', '#e9dcc0', '#d9a0a0', '#2b2b2b'],
  glass: ['#1e5aa8', '#b8222a', '#e2a52a', '#2f8a4a', '#6a2c8c', '#2aa0b8', '#d65a1f'],
  bauhaus: ['#d7262b', '#f2b705', '#1f4e9c'],
  manuscript: ['#1d3f8f', '#b3261e', '#2e6b3a', '#c99a2e', '#6b2c5a', '#e9d9b4'],
  pop: ['#ffd400', '#e4002b', '#0072ce', '#ff8ab4', '#00a651', '#ffffff', '#111111'],
  // subconjunto de la paleta de la NES
  pixel: ['#000000', '#fcfcfc', '#bcbcbc', '#7c7c7c', '#a81000', '#f83800', '#e45c10', '#fca044', '#f8b800', '#ac7c00', '#00a800', '#58d854', '#005800', '#0058f8', '#3cbcfc', '#6844fc', '#d800cc', '#f878f8', '#fcd8a8'],
  synthwave: ['#ff2bd6', '#2bf3ff', '#8a2bff', '#ff8a2b', '#ffe12b', '#ff2b6e', '#4b3bff'],
  nouveau: ['#8a9a6b', '#c98a7a', '#c9a24a', '#4f7a74', '#efe2c4', '#b5654a', '#6e4a5e', '#a8b48c', '#d9b98a'],
  cubism: ['#c8a046', '#7a5232', '#7c7a46', '#4e6a86', '#b5583a', '#e6d6b0', '#2e2a26', '#8aa0a8'],
  crayon: ['#e8352b', '#f58a1f', '#f6d32b', '#4caf3c', '#2f6fd6', '#8a4fc4', '#f27bb5', '#8b5a2b', '#5fc8e8', '#222222'],
  riso: ['#ff48b0', '#0078bf', '#ffe800', '#00a95c', '#ff6c2f', '#765ba7'],
  dotmatrix: ['#081820', '#346856', '#88c070', '#e0f8d0'],
  tarot: ['#1c2a5a', '#c9a23a', '#efe3c4', '#a3262e', '#2f7f7a', '#6b3a7a', '#e07a3a'],
  retro70: ['#e8762c', '#f2b33d', '#8a4b2a', '#c94f2c', '#d9c58a', '#6b7a3a', '#4a2c1e', '#3f7f7a'],
  mosaic: ['#b5452e', '#d98a3a', '#e6c26a', '#3f7a8a', '#2c4a6e', '#6a8a4a', '#efe4cc', '#7a3a4a', '#3a3530'],
  graffiti: ['#ff2e63', '#08d9d6', '#f9ed32', '#7cfc00', '#ff8c00', '#9b5de5', '#00bbf9', '#ffffff', '#111111'],
};

/** Mezcla lineal de dos colores (t=0 → a). */
const mix = (a, b, t) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
/** Mismo tono con saturación y luz acotadas. */
const clampHsl = (c, s0, s1, l0, l1) => {
  const [h, s, l] = toHsl(c);
  return fromHsl(h, Math.min(s1, Math.max(s0, s)), Math.min(l1, Math.max(l0, l)));
};

/** Tubo de neón del color: mismo tono a tope (los grises van a rosa). */
const neonTube = (c) => {
  const [h, s] = toHsl(c);
  return fromHsl(s < 0.15 ? 322 : h, 1, 0.62);
};
/** Trazado (M…Z) de una estrella de cinco puntas de radio `r`. */
function star5(x, y, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.42 : r;
    d += `${i ? 'L' : 'M'}${n(x + Math.cos(a) * k)} ${n(y + Math.sin(a) * k)}`;
  }
  return d + 'Z';
}

/** Primario Bauhaus de un color: por tono (los grises van a negro o crema). */
function bauhausOf(hex) {
  const [h, s, l] = toHsl(hex);
  if (s < 0.18) return l > 0.62 ? '#f1ead8' : '#151515';
  if (h < 22 || h >= 285) return '#d7262b';
  if (h < 150) return '#f2b705';
  return '#1f4e9c';
}

/**
 * Remapeo de paleta y ajustes de cada estilo. `ink`/`lw`: contorno propio del estilo (lw 0 = sin contorno).
 * `map(color, rol)` recibe el rol: 'body' | 'pattern' | 'iris' | 'cheek' | 'lip' | 'brow' | 'acc'.
 */
const LOOKS = {
  ukiyoe: {
    finish: 'flat', texture: 'none', ink: '#1b2233', lw: 3.4,
    eyes: { white: '#f3ead6', ink: '#1b1b1b', iris: '#1f3a5f' },
    map: (c, role) => (role === 'cheek' ? '#d9776a' : nearest(c, PAL.ukiyoe, role === 'pattern' ? [] : role === 'body' ? ['#2b2b2b', '#e9dcc0'] : ['#2b2b2b'])),
  },
  clay: {
    finish: 'clay', texture: 'none', ink: '', lw: 0,
    eyes: {},
    map: (c, role) => {
      if (role === 'iris') return c;
      const [h, s, l] = toHsl(c);
      return fromHsl(h, Math.min(0.72, Math.max(0.38, s)), Math.min(0.74, Math.max(0.46, l)));
    },
  },
  glass: {
    finish: 'flat', texture: 'none', ink: '#141014', lw: 5,
    eyes: { white: '#f3ecd0', ink: '#141014' },
    map: (c, role, spec) => (role === 'pattern' ? nearest(c, PAL.glass, [nearest(spec.body.color, PAL.glass)]) : nearest(c, PAL.glass)),
  },
  bauhaus: {
    finish: 'flat', texture: 'none', ink: '#151515', lw: 4.5,
    eyes: { white: '#ffffff', ink: '#151515', iris: '#151515' },
    map: (c, role, spec) => {
      if (role === 'cheek' || role === 'lip') return '#d7262b';
      const p = bauhausOf(c);
      if (role === 'pattern') {
        const b = bauhausOf(spec.body.color);
        return p === b ? PAL.bauhaus[(PAL.bauhaus.indexOf(b) + 1) % 3] || '#f2b705' : p;
      }
      return p;
    },
  },
  manuscript: {
    finish: 'flat', texture: 'none', ink: '#3b2412', lw: 3,
    eyes: { white: '#f5ead0', ink: '#2a1a0e' },
    map: (c, role) => (role === 'cheek' ? '#c8584a' : nearest(c, PAL.manuscript, role === 'body' ? ['#e9d9b4'] : [])),
  },
  glitch: {
    finish: 'flat', texture: 'none', ink: '#0b0b14', lw: 2.4,
    eyes: {},
    map: (c, role) => {
      if (role === 'iris') return c;
      const [h, s, l] = toHsl(c);
      return fromHsl(h, Math.max(0.78, s), Math.min(0.66, Math.max(0.46, l)));
    },
  },
  ink: {
    finish: 'sketch', texture: 'none', ink: '#222222', lw: 2.6,
    eyes: { white: '#ffffff', ink: '#1e1e1e', iris: '#3a3a3a' },
    map: (c, role) => {
      if (role === 'body') return grey(c, 0.88, 0.99);
      if (role === 'pattern') return '#ddd8cc';
      if (role === 'cheek' || role === 'lip') return '#b9b2a6';
      return grey(c, 0.3, 0.92);
    },
  },
  pop: {
    finish: 'flat', texture: 'none', ink: '#111111', lw: 5,
    eyes: { white: '#ffffff', ink: '#111111' },
    map: (c, role) => (role === 'cheek' || role === 'lip' ? '#e4002b' : nearest(c, PAL.pop, role === 'body' ? ['#ffffff', '#111111'] : role === 'brow' ? [] : ['#ffffff'])),
  },
  watercolor: {
    finish: 'flat', texture: 'none', ink: '#5b4a3c', lw: 1.3,
    eyes: { white: '#fffdf6', ink: '#3b3029' },
    map: (c, role) => (role === 'iris' || role === 'brow' ? clampHsl(c, 0.3, 0.6, 0.25, 0.5) : clampHsl(c, 0.42, 0.72, 0.5, 0.72)),
  },
  pixel: {
    finish: 'flat', texture: 'none', ink: '#000000', lw: 4.5,
    eyes: { white: '#fcfcfc', ink: '#000000' },
    map: (c, role) => nearest(c, PAL.pixel, role === 'body' ? ['#000000', '#7c7c7c'] : []),
  },
  synthwave: {
    finish: 'flat', texture: 'none', ink: '#fdf6ff', lw: 3.2,
    eyes: { white: '#fdf6ff', ink: '#1a0b33' },
    map: (c, role, spec) => {
      if (role === 'pattern') return nearest(c, PAL.synthwave, [nearest(spec.body.color, PAL.synthwave)]);
      if (role === 'brow') return '#1a0b33';
      return nearest(c, PAL.synthwave);
    },
  },
  nouveau: {
    finish: 'flat', texture: 'none', ink: '#4a3324', lw: 3,
    eyes: { white: '#f6ecd6', ink: '#3a281c' },
    map: (c, role) => (role === 'cheek' ? '#d08e7e' : nearest(c, PAL.nouveau, role === 'body' ? ['#efe2c4'] : [])),
  },
  cubism: {
    finish: 'flat', texture: 'none', ink: '#2e2a26', lw: 3.4,
    eyes: { white: '#efe4c8', ink: '#2e2a26' },
    map: (c, role) => nearest(c, PAL.cubism, role === 'body' ? ['#e6d6b0', '#2e2a26'] : []),
  },
  crayon: {
    finish: 'flat', texture: 'none', ink: '#2a2a2a', lw: 3,
    eyes: { white: '#ffffff', ink: '#222222' },
    map: (c, role) => (role === 'cheek' ? '#f27bb5' : nearest(c, PAL.crayon, role === 'body' ? ['#222222'] : [])),
  },
  blueprint: {
    finish: 'flat', texture: 'none', ink: '#eaf2ff', lw: 2.2,
    eyes: { white: '#3a70b8', ink: '#16386a', iris: '#eaf2ff' },
    map: (c, role) => {
      if (role === 'body') return '#2e64ad';
      if (role === 'pattern') return '#4a80c6';
      if (role === 'cheek') return '#5a8fd0';
      if (role === 'lip' || role === 'brow') return '#eaf2ff';
      return luminance(c) > 0.55 ? '#bcd3f0' : '#4a80c6';
    },
  },
  pointillism: {
    finish: 'flat', texture: 'none', ink: '', lw: 0,
    eyes: {},
    map: (c, role) => (role === 'iris' || role === 'brow' ? c : clampHsl(c, 0.45, 0.75, 0.5, 0.7)),
  },
  woodcut: {
    finish: 'flat', texture: 'none', ink: '#15120f', lw: 4.5,
    eyes: { white: '#f1e6cf', ink: '#15120f', iris: '#15120f' },
    map: (c, role) => {
      if (role === 'body') return '#ecdfc4';
      if (role === 'cheek' || role === 'lip') return '#b8352a';
      if (role === 'pattern' || role === 'brow') return '#15120f';
      return luminance(c) > 0.5 ? '#ecdfc4' : '#15120f';
    },
  },
  riso: {
    finish: 'flat', texture: 'none', ink: '#0078bf', lw: 2.6,
    eyes: { white: '#f7f1e3', ink: '#1d2a6b' },
    map: (c, role, spec) => {
      if (role === 'cheek' || role === 'lip') return '#ff48b0';
      if (role === 'brow') return '#0078bf';
      if (role === 'pattern') return nearest(c, PAL.riso, [nearest(spec.body.color, PAL.riso, ['#0078bf'])]);
      return nearest(c, PAL.riso, role === 'body' ? ['#0078bf'] : []);
    },
  },
  dotmatrix: {
    finish: 'flat', texture: 'none', ink: '#081820', lw: 4,
    eyes: { white: '#e0f8d0', ink: '#081820', iris: '#081820' },
    map: (c, role) => {
      if (role === 'body') return '#88c070';
      if (role === 'pattern' || role === 'cheek' || role === 'lip') return '#346856';
      if (role === 'brow' || role === 'iris') return '#081820';
      return PAL.dotmatrix[Math.min(3, Math.floor(luminance(c) * 4))];
    },
  },
  chalk: {
    finish: 'flat', texture: 'none', ink: '#f4f4ee', lw: 3,
    eyes: { white: '#f4f4ee', ink: '#22352b' },
    map: (c, role) => {
      if (role === 'brow' || role === 'lip') return '#f4f4ee';
      if (role === 'iris') return clampHsl(c, 0.3, 0.55, 0.35, 0.5);
      return clampHsl(c, 0.35, 0.65, 0.68, 0.8);
    },
  },
  sticker: {
    finish: 'flat', texture: 'none', ink: '#26222b', lw: 2.4,
    eyes: { white: '#ffffff', ink: '#1a1720' },
    map: (c, role) => (role === 'brow' ? '#1a1720' : role === 'cheek' ? '#ff6f9c' : clampHsl(c, 0.7, 0.95, 0.46, 0.62)),
  },
  felt: {
    finish: 'flat', texture: 'none', ink: '', lw: 0,
    eyes: { white: '#f6f1e6', ink: '#2a2420' },
    map: (c, role) => (role === 'brow' ? '#3a302a' : role === 'iris' ? clampHsl(c, 0.25, 0.5, 0.25, 0.42) : clampHsl(c, 0.28, 0.55, 0.42, 0.64)),
  },
  papercut: {
    finish: 'flat', texture: 'none', ink: '', lw: 0,
    eyes: { white: '#fffdf8', ink: '#3a3340' },
    map: (c, role) => (role === 'brow' ? '#3a3340' : role === 'iris' ? clampHsl(c, 0.3, 0.55, 0.3, 0.45) : clampHsl(c, 0.35, 0.62, 0.6, 0.78)),
  },
  lowpoly: {
    finish: 'flat', texture: 'none', ink: '', lw: 0,
    eyes: { white: '#f5f7fa', ink: '#1d2330' },
    map: (c, role) => (role === 'brow' ? '#1d2330' : clampHsl(c, 0.35, 0.75, 0.36, 0.6)),
  },
  marble: {
    finish: 'flat', texture: 'none', ink: '#8d877c', lw: 1.8,
    eyes: { white: '#f7f4ee', ink: '#4f4a43' },
    map: (c, role) => {
      if (role === 'body') return mix(grey(c, 0.86, 0.95), c, 0.08);
      if (role === 'pattern') return mix(grey(c, 0.7, 0.85), c, 0.1);
      if (role === 'iris') return grey(c, 0.35, 0.6);
      if (role === 'cheek') return '#e2c4b8';
      if (role === 'lip') return '#b4a69a';
      if (role === 'brow') return '#7a746a';
      return mix(c, '#c9a45a', 0.7); // lo que lleva puesto, dorado a la hoja
    },
  },
  candy: {
    finish: 'flat', texture: 'none', ink: (s) => mix(s.body.color, '#3a0a26', 0.45), lw: 2.4,
    eyes: { white: '#ffffff', ink: '#3a1530' },
    map: (c, role) => (role === 'brow' ? '#3a1530' : role === 'cheek' ? '#ff7fb0' : clampHsl(c, 0.72, 1, 0.56, 0.7)),
  },
  holo: {
    finish: 'flat', texture: 'none', ink: '#6f74a8', lw: 2,
    eyes: { white: '#fbfbff', ink: '#272a48' },
    map: (c, role) => (role === 'brow' ? '#272a48' : role === 'iris' ? clampHsl(c, 0.5, 0.8, 0.4, 0.55) : clampHsl(c, 0.25, 0.5, 0.74, 0.86)),
  },
  sumie: {
    finish: 'flat', texture: 'none', ink: '#1d1b19', lw: 3.6,
    eyes: { white: '#f3eee2', ink: '#1d1b19', iris: '#1d1b19' },
    map: (c, role) => {
      if (role === 'body') return grey(c, 0.62, 0.9);
      if (role === 'pattern') return grey(c, 0.3, 0.58);
      if (role === 'cheek') return '#c96b5c';
      if (role === 'lip' || role === 'brow') return '#1d1b19';
      return grey(c, 0.15, 0.85);
    },
  },
  tarot: {
    finish: 'flat', texture: 'none', ink: '#1a1430', lw: 3,
    eyes: { white: '#efe3c4', ink: '#1a1430' },
    map: (c, role) => {
      if (role === 'cheek') return '#d9877a';
      if (role === 'lip') return '#a3262e';
      if (role === 'brow') return '#1a1430';
      return nearest(c, PAL.tarot, role === 'body' ? ['#1c2a5a', '#efe3c4'] : []);
    },
  },
  retro70: {
    finish: 'flat', texture: 'none', ink: '#4a2c1e', lw: 3,
    eyes: { white: '#fbf1dc', ink: '#3a2216' },
    map: (c, role) => (role === 'cheek' ? '#e8762c' : role === 'brow' ? '#3a2216' : nearest(c, PAL.retro70, role === 'body' ? ['#4a2c1e', '#d9c58a'] : [])),
  },
  mosaic: {
    finish: 'flat', texture: 'none', ink: '#3a3530', lw: 4,
    eyes: { white: '#efe4cc', ink: '#2a2622' },
    map: (c, role) => (role === 'brow' ? '#2a2622' : nearest(c, PAL.mosaic, role === 'body' ? ['#efe4cc', '#3a3530'] : [])),
  },
  neonsign: {
    // cuerpo casi negro; el contorno es el tubo, del color del cuerpo original
    finish: 'flat', texture: 'none', ink: (s) => neonTube(s.body.color), lw: 3.4,
    eyes: { white: '#f8f0ff', ink: '#120f18' },
    map: (c, role, spec) => {
      if (role === 'body') return mix(c, '#0b0b0b', 0.82);
      if (role === 'pattern') return mix(c, '#0b0b0b', 0.62);
      if (role === 'brow' || role === 'lip') return neonTube(spec.body.color);
      if (role === 'cheek') return fromHsl((toHsl(neonTube(spec.body.color))[0] + 40) % 360, 1, 0.66);
      return neonTube(c);
    },
  },
  graffiti: {
    finish: 'flat', texture: 'none', ink: '#111111', lw: 5.5,
    eyes: { white: '#ffffff', ink: '#111111' },
    map: (c, role) => (role === 'brow' ? '#111111' : role === 'cheek' ? '#ff2e63' : nearest(c, PAL.graffiti, role === 'body' ? ['#ffffff', '#111111'] : [])),
  },
  thermal: {
    // el filtro pasa la luminancia a la paleta «ironbow»: claro = caliente, oscuro = frío
    finish: 'flat', texture: 'none', ink: '', lw: 0,
    eyes: { white: '#fffbe0', ink: '#0a0520', iris: '#8a1a8a' },
    map: (c, role) => {
      if (role === 'body') return '#ff7a1a';
      if (role === 'pattern' || role === 'lip') return '#ffb000';
      if (role === 'cheek') return '#ffe46a';
      if (role === 'brow') return '#2a0a6a';
      if (role === 'iris') return '#8a1a8a';
      return mix('#120838', '#4a2aa8', luminance(c)); // lo que lleva puesto está frío
    },
  },
};

/** Semilla del estilo para un ot: la misma que su piel (no cambia al arrastrar puntos). */
export function styleSeed(spec) {
  return skinHash(spec);
}

/**
 * Spec lista para pintar con su estilo: colores remapeados, acabado/textura del estilo y
 * `_style` ({ id, seed, ink, lw }) para el contorno. Sin estilo devuelve la misma spec.
 * Recibe una spec normalizada; el resultado no se guarda (normalizeCharacter descarta `_style`).
 */
export function stylizeSpec(spec) {
  const id = spec?.style;
  const look = LOOKS[id];
  if (!look) return spec;
  const s = structuredClone(spec);
  const keep = spec._modColors || {};
  const m = (c, role, path) => (c && !keep[path] ? look.map(c, role, spec) : c);
  s.body.color = m(spec.body.color, 'body', 'body.color');
  s.body.patternColor = m(spec.body.patternColor, 'pattern', 'body.patternColor');
  s.eyes.iris = m(spec.eyes.iris, 'iris', 'eyes.iris');
  Object.assign(s.eyes, look.eyes);
  s.cheeks.color = m(spec.cheeks.color, 'cheek', 'cheeks.color');
  s.mouth.lipColor = m(spec.mouth.lipColor, 'lip', 'mouth.lipColor');
  if (spec.mouth.color) s.mouth.color = m(spec.mouth.color, 'brow', 'mouth.color');
  if (spec.brows.color) s.brows.color = m(spec.brows.color, 'brow', 'brows.color');
  for (const a of s.accessories) {
    if (a.id.startsWith('mod:')) continue; // las piezas de un mod traen sus colores
    a.color = m(a.color, 'acc');
    a.color2 = m(a.color2, 'acc');
  }
  s.finish = look.finish;
  s.texture = look.texture;
  s._style = { id, seed: styleSeed(spec), ink: typeof look.ink === 'function' ? look.ink(s) : look.ink, lw: look.lw };
  return s;
}

// ───────────────────────────── geometría ─────────────────────────────

/** Recorta un polígono convexo al semiplano de los puntos más cerca de p que de q. */
function clipHalf(poly, p, q) {
  const nx = q[0] - p[0];
  const ny = q[1] - p[1];
  const c = (nx * (p[0] + q[0])) / 2 + (ny * (p[1] + q[1])) / 2;
  const f = (v) => nx * v[0] + ny * v[1] - c;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Celdas de Voronoi (polígonos) de unos puntos dentro de un rectángulo. O(n²), para n pequeño. */
export function voronoi(sites, x0, y0, x1, y1) {
  return sites.map((p, i) => {
    let poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let j = 0; j < sites.length && poly.length; j++) if (j !== i) poly = clipHalf(poly, p, sites[j]);
    return poly;
  });
}

/** Puntos en rejilla con jitter (celdas más parejas que el azar puro). */
function jitterGrid(rnd, x0, y0, w, h, cols, rows, j = 0.8) {
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push([x0 + ((c + 0.5 + (rnd() - 0.5) * j) * w) / cols, y0 + ((r + 0.5 + (rnd() - 0.5) * j) * h) / rows]);
    }
  }
  return pts;
}

const polyD = (poly) => (poly.length ? `M${poly.map((p) => `${n(p[0])} ${n(p[1])}`).join('L')}Z` : '');

// ───────────────────────────── filtros ─────────────────────────────

// Región fija en espacio de usuario: cabe el cuerpo con alas, manos y efectos (y no cambia al animar).
const REGION = 'filterUnits="userSpaceOnUse" x="-160" y="-200" width="560" height="580" color-interpolation-filters="sRGB"';

const posterize = (levels, inn = 'SourceGraphic', res = 'p') => {
  const tv = Array.from({ length: levels }, (_, i) => n(i / (levels - 1))).join(' ');
  return `<feComponentTransfer in="${inn}" result="${res}"><feFuncR type="discrete" tableValues="${tv}"/><feFuncG type="discrete" tableValues="${tv}"/><feFuncB type="discrete" tableValues="${tv}"/></feComponentTransfer>`;
};

/** Grano (motas de un color) recortado a la silueta → resultado `res`. */
const grain = (seed, rgb, k, freq = 0.9, res = 'gr') => {
  const [r, g, b] = hexToRgb(rgb).map((v) => n(v / 255));
  return `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed % 997}" result="${res}n"/><feColorMatrix in="${res}n" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  ${k} 0 0 0 ${n(-k * 0.56)}" result="${res}c"/><feComposite in="${res}c" in2="SourceAlpha" operator="in" result="${res}"/>`;
};

/** Temblor de trazo a mano. */
const wobble = (seed, inn, scale, freq = 0.045, res = 'wb') =>
  `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="1" seed="${(seed + 11) % 997}" result="${res}n"/><feDisplacementMap in="${inn}" in2="${res}n" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="${res}"/>`;

function filterBody(id, seed, q, animate) {
  const full = q === 'full';
  switch (id) {
    case 'ukiyoe':
      // grabado: grano de papel y borde de plancha (las tintas planas ya vienen de la paleta)
      return full ? grain(seed, '#5a3d1e', 1.6) + wobble(seed, 'SourceGraphic', 2.6) + '<feMerge><feMergeNode in="wb"/><feMergeNode in="gr"/></feMerge>' : '';
    case 'clay': {
      if (!full) return '';
      // plastilina: bultos (desplazamiento) + luz difusa y brillo sobre la silueta desenfocada
      const light = '<feDistantLight azimuth="235" elevation="52"/>';
      return `${wobble(seed, 'SourceGraphic', 5, 0.035, 'd')}<feGaussianBlur in="d" stdDeviation="5" result="b"/>`
        + `<feDiffuseLighting in="b" surfaceScale="4" diffuseConstant="1.18" lighting-color="#fff" result="dl">${light}</feDiffuseLighting>`
        + '<feComposite in="d" in2="dl" operator="arithmetic" k1="1" result="sh"/>'
        + `<feSpecularLighting in="b" surfaceScale="4" specularConstant=".5" specularExponent="20" lighting-color="#fff" result="sp">${light}</feSpecularLighting>`
        + '<feComposite in="sp" in2="d" operator="in" result="sp2"/><feComposite in="sh" in2="sp2" operator="arithmetic" k2="1" k3=".85"/>';
    }
    case 'glass':
      // vidrio: plomo grueso alrededor, color saturado y posterizado, manchas de luz
      return '<feMorphology in="SourceAlpha" operator="dilate" radius="2.6" result="dl"/><feFlood flood-color="#141014"/><feComposite in2="dl" operator="in" result="lead"/>'
        + '<feColorMatrix in="SourceGraphic" type="saturate" values="1.35" result="s"/>' + posterize(5, 's')
        + (full
          ? `<feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="${seed % 997}" result="ln"/><feColorMatrix in="ln" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 .92  .9 0 0 0 -.38" result="lc"/><feComposite in="lc" in2="SourceAlpha" operator="in" result="hi"/>`
            + '<feMerge><feMergeNode in="lead"/><feMergeNode in="p"/><feMergeNode in="hi"/></feMerge>'
          : '<feMerge><feMergeNode in="lead"/><feMergeNode in="p"/></feMerge>');
    case 'bauhaus':
      return full ? grain(seed, '#3a3226', 1.2, 1.1) + '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gr"/></feMerge>' : '';
    case 'manuscript':
      return full ? wobble(seed, 'SourceGraphic', 1.6, 0.06) + grain(seed, '#6b4a1e', 1.3) + '<feMerge><feMergeNode in="wb"/><feMergeNode in="gr"/></feMerge>' : '';
    case 'glitch': {
      // píxeles: una muestra de 2×2 cada 6 unidades, dilatada hasta tapar el bloque
      let f = '<feFlood x="-160" y="-200" width="2" height="2" flood-color="#000"/><feComposite width="6" height="6"/><feTile result="tile"/>'
        + '<feComposite in="SourceGraphic" in2="tile" operator="in"/><feMorphology operator="dilate" radius="2" result="px"/>';
      let src = 'px';
      if (full) {
        // desgarro: bandas horizontales que se desplazan a tirones
        const anim = animate ? '<animate attributeName="scale" values="0;0;0;0;16;0;0;0;-10;0;0;0;0;8;0" dur="3.4s" repeatCount="indefinite" calcMode="discrete"/>' : '';
        f += `<feTurbulence type="fractalNoise" baseFrequency="0 .09" numOctaves="1" seed="${seed % 997}" result="tn"/>`
          + '<feComponentTransfer in="tn" result="tb"><feFuncR type="discrete" tableValues=".5 .5 .5 .1 .5 .5 .5 .95 .5 .5"/><feFuncG type="linear" slope="0" intercept=".5"/></feComponentTransfer>'
          + `<feDisplacementMap in="px" in2="tb" scale="${animate ? 0 : 10}" xChannelSelector="R" yChannelSelector="G" result="tear">${anim}</feDisplacementMap>`;
        src = 'tear';
      }
      const dx = animate ? '<animate attributeName="dx" values="-2.5;-2.5;-2.5;-6;-2.5;-1;-2.5" dur="1.9s" repeatCount="indefinite" calcMode="discrete"/>' : '';
      // separación RGB: rojo a un lado, verde+azul al otro
      f += `<feColorMatrix in="${src}" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/><feOffset in="r" dx="-2.5" result="r2">${dx}</feOffset>`
        + `<feColorMatrix in="${src}" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/><feOffset in="gb" dx="2.5" result="gb2"/>`
        + '<feBlend in="r2" in2="gb2" mode="screen"/>';
      return f;
    }
    case 'ink':
      return '<feColorMatrix in="SourceGraphic" type="saturate" values="0" result="bw"/>' + (full ? wobble(seed, 'bw', 2.2, 0.05) : '');
    case 'pop':
      // viñeta: sombra negra dura desplazada (barata: vale también en lite)
      return '<feFlood flood-color="#111"/><feComposite in2="SourceAlpha" operator="in"/><feOffset dx="5" dy="5" result="sh"/>'
        + '<feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>';
    case 'watercolor':
      if (!full) return '';
      // borde que se corre, pigmento irregular (aguada + granulado), cerco oscuro donde se seca el agua, papel
      return `${wobble(seed, 'SourceGraphic', 5, 0.03, 'd')}`
        + `<feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="3" seed="${(seed + 5) % 997}" result="pn"/><feColorMatrix in="pn" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="pg"/>`
        + '<feComposite in="d" in2="pg" operator="arithmetic" k1="1.5" k2=".3" result="pig"/>'
        + '<feGaussianBlur in="d" stdDeviation="3" result="eb"/><feComposite in="d" in2="eb" operator="out" result="edge"/><feColorMatrix in="edge" values=".5 0 0 0 0  0 .5 0 0 0  0 0 .5 0 0  0 0 0 1 0" result="ed"/>'
        + grain(seed, '#3a2a40', 1.5, 0.55) + '<feMerge><feMergeNode in="pig"/><feMergeNode in="ed"/><feMergeNode in="gr"/></feMerge>'
        + '<feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .9 0"/>';
    case 'pixel':
      // bloques de 8: una muestra de 2×2 cada 8 unidades, dilatada; alfa a todo o nada (sin antialias)
      return '<feFlood x="-160" y="-200" width="2" height="2" flood-color="#000"/><feComposite width="8" height="8"/><feTile result="tile"/>'
        + '<feComposite in="SourceGraphic" in2="tile" operator="in"/><feMorphology operator="dilate" radius="3"/>'
        + '<feComponentTransfer><feFuncA type="discrete" tableValues="0 1 1"/></feComponentTransfer>';
    case 'synthwave':
      if (!full) return '';
      // tubo de neón: halo magenta alrededor de la silueta
      return '<feGaussianBlur in="SourceAlpha" stdDeviation="5" result="ga"/><feFlood flood-color="#ff2bd6"/><feComposite in2="ga" operator="in" result="glow"/>'
        + '<feMerge><feMergeNode in="glow"/><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>';
    case 'nouveau':
      return full ? wobble(seed, 'SourceGraphic', 1.4, 0.05) + grain(seed, '#6b5030', 1.1) + '<feMerge><feMergeNode in="wb"/><feMergeNode in="gr"/></feMerge>' : '';
    case 'cubism':
      if (!full) return '';
      // planos fracturados: ruido de baja frecuencia posterizado → cada zona se desplaza distinto
      return `<feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="1" seed="${seed % 997}" result="cn"/>`
        + '<feComponentTransfer in="cn" result="cd"><feFuncR type="discrete" tableValues=".32 .62 .44 .7 .5"/><feFuncG type="discrete" tableValues=".6 .38 .52 .66 .42"/></feComponentTransfer>'
        + '<feDisplacementMap in="SourceGraphic" in2="cd" scale="20" xChannelSelector="R" yChannelSelector="G" result="fr"/>'
        + grain(seed, '#3a2e22', 1.1) + '<feMerge><feMergeNode in="fr"/><feMergeNode in="gr"/></feMerge>';
    case 'crayon':
      if (!full) return '';
      // cera: trazo tembloroso y el diente del papel asomando en vetas
      return wobble(seed, 'SourceGraphic', 4, 0.06)
        + `<feTurbulence type="fractalNoise" baseFrequency=".9 .22" numOctaves="2" seed="${(seed + 3) % 997}" result="wx"/>`
        + '<feColorMatrix in="wx" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 2.35" result="wa"/><feComposite in="wb" in2="wa" operator="in"/>';
    case 'blueprint':
      return full ? grain(seed, '#ffffff', 0.9, 1.2) + '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gr"/></feMerge>' : '';
    case 'pointillism':
      if (!full) return '';
      // puntos: una muestra cada 5 unidades, difuminada y recortada en círculo, sobre una base tenue
      return '<feFlood x="-160" y="-200" width="2" height="2" flood-color="#000"/><feComposite width="5" height="5"/><feTile result="tile"/>'
        + '<feComposite in="SourceGraphic" in2="tile" operator="in"/><feGaussianBlur stdDeviation="1.15"/>'
        + '<feComponentTransfer result="dt"><feFuncA type="linear" slope="6" intercept="-.45"/></feComponentTransfer>'
        + wobble(seed, 'dt', 2.5, 0.25, 'dj')
        + '<feColorMatrix in="SourceGraphic" values=".8 0 0 0 .18  0 .8 0 0 .18  0 0 .8 0 .18  0 0 0 .8 0" result="un"/>'
        + '<feMerge><feMergeNode in="un"/><feMergeNode in="dj"/></feMerge>';
    case 'woodcut':
      return full ? wobble(seed, 'SourceGraphic', 2, 0.05) + grain(seed, '#efe4cc', 1.4, 0.7) + '<feMerge><feMergeNode in="wb"/><feMergeNode in="gr"/></feMerge>' : '';
    case 'riso': {
      // dos tambores: la tinta rosa sale corrida bajo el azul; papel sin entintar en motas
      const mis = '<feFlood flood-color="#ff48b0" flood-opacity=".8"/><feComposite in2="SourceAlpha" operator="in"/><feOffset dx="3.5" dy="-2.5" result="mis"/>';
      return full
        ? mis + grain(seed, '#f7f1e3', 1.5, 0.85) + '<feMerge><feMergeNode in="mis"/><feMergeNode in="SourceGraphic"/><feMergeNode in="gr"/></feMerge>'
        : mis + '<feMerge><feMergeNode in="mis"/><feMergeNode in="SourceGraphic"/></feMerge>';
    }
    case 'dotmatrix':
      // pantalla de 4 verdes: bloques de 6 y cada bloque al verde más cercano por luminancia
      return '<feFlood x="-160" y="-200" width="2" height="2" flood-color="#000"/><feComposite width="6" height="6"/><feTile result="tile"/>'
        + '<feComposite in="SourceGraphic" in2="tile" operator="in"/><feMorphology operator="dilate" radius="2"/>'
        + '<feComponentTransfer><feFuncA type="discrete" tableValues="0 1 1"/></feComponentTransfer>'
        + '<feColorMatrix values=".2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0"/>'
        + '<feComponentTransfer><feFuncR type="discrete" tableValues=".03 .2 .53 .88"/><feFuncG type="discrete" tableValues=".09 .41 .75 .97"/><feFuncB type="discrete" tableValues=".13 .34 .44 .82"/></feComponentTransfer>';
    case 'chalk':
      if (!full) return '';
      // tiza: trazo tembloroso, el pizarrón asomando entre los granos y polvo blanco alrededor
      return wobble(seed, 'SourceGraphic', 2.4, 0.05)
        + `<feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="${(seed + 7) % 997}" result="cn"/>`
        + '<feColorMatrix in="cn" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 0 0 0 3.6" result="ca"/><feComposite in="wb" in2="ca" operator="in" result="ch"/>'
        + '<feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="db"/><feFlood flood-color="#f4f4ee" flood-opacity=".2"/><feComposite in2="db" operator="in" result="dust"/>'
        + '<feMerge><feMergeNode in="dust"/><feMergeNode in="ch"/></feMerge>';
    case 'sticker': {
      // troquel: borde blanco redondeado (alfa difuminado y cortado) y, en full, la sombra de la pegatina
      const cut = '<feGaussianBlur in="SourceAlpha" stdDeviation="3.5"/><feComponentTransfer result="cut"><feFuncA type="linear" slope="14" intercept="-.7"/></feComponentTransfer>'
        + '<feFlood flood-color="#ffffff"/><feComposite in2="cut" operator="in" result="wh"/>';
      return full
        ? cut + '<feGaussianBlur in="cut" stdDeviation="2.4"/><feOffset dx="1.5" dy="3.5"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .08  0 0 0 0 .14  0 0 0 .38 0" result="sh"/>'
          + '<feMerge><feMergeNode in="sh"/><feMergeNode in="wh"/><feMergeNode in="SourceGraphic"/></feMerge>'
        : cut + '<feMerge><feMergeNode in="wh"/><feMergeNode in="SourceGraphic"/></feMerge>';
    }
    case 'felt':
      if (!full) return '';
      // fieltro: borde de fibras sueltas y pelusa clara y oscura
      return wobble(seed, 'SourceGraphic', 3, 0.45)
        + grain(seed, '#ffffff', 1.5, 1.3, 'gl') + grain(seed + 3, '#000000', 1.3, 0.9, 'gd')
        + '<feMerge><feMergeNode in="wb"/><feMergeNode in="gl"/><feMergeNode in="gd"/></feMerge>';
    case 'papercut': {
      // cartulina recortada que flota sobre el fondo: sombra suave (barata, también en lite)
      const sh = '<feGaussianBlur in="SourceAlpha" stdDeviation="2.6"/><feOffset dx="2" dy="4"/><feColorMatrix values="0 0 0 0 .12  0 0 0 0 .08  0 0 0 0 .18  0 0 0 .4 0" result="sh"/>';
      return full
        ? sh + grain(seed, '#ffffff', 1.1, 1.4) + '<feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/><feMergeNode in="gr"/></feMerge>'
        : sh + '<feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>';
    }
    case 'marble': {
      if (!full) return '';
      // vetas finas (pliegues de turbulencia estirada) y luz difusa de escultura
      const light = '<feDistantLight azimuth="225" elevation="58"/>';
      return `<feTurbulence type="turbulence" baseFrequency=".012 .03" numOctaves="4" seed="${seed % 997}" result="vn"/>`
        + '<feColorMatrix in="vn" values="0 0 0 0 .38  0 0 0 0 .36  0 0 0 0 .34  -5 0 0 0 .62" result="va"/><feComposite in="va" in2="SourceAlpha" operator="in" result="vein"/>'
        + '<feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b"/>'
        + `<feDiffuseLighting in="b" surfaceScale="5" diffuseConstant="1.1" lighting-color="#fff" result="dl">${light}</feDiffuseLighting>`
        + '<feComposite in="SourceGraphic" in2="dl" operator="arithmetic" k1=".7" k2=".34" result="sh"/>'
        + '<feMerge><feMergeNode in="sh"/><feMergeNode in="vein"/></feMerge>';
    }
    case 'candy': {
      if (!full) return '';
      // gomita: brillo especular de gelatina sobre la silueta redondeada y algo de transparencia
      const light = '<feDistantLight azimuth="235" elevation="50"/>';
      return '<feGaussianBlur in="SourceAlpha" stdDeviation="7" result="b"/>'
        + `<feSpecularLighting in="b" surfaceScale="7" specularConstant=".9" specularExponent="26" lighting-color="#fff" result="sp">${light}</feSpecularLighting>`
        + '<feComposite in="sp" in2="SourceAlpha" operator="in" result="sp2"/>'
        + '<feColorMatrix in="SourceGraphic" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .94 0" result="tr"/>'
        + '<feComposite in="tr" in2="sp2" operator="arithmetic" k2="1" k3=".85"/>';
    }
    case 'holo': {
      if (!full) return '';
      // tornasol: el tono gira solo (al animar) y destellos de purpurina
      const anim = animate ? '<animate attributeName="values" values="0;360" dur="7s" repeatCount="indefinite"/>' : '';
      return `<feColorMatrix in="SourceGraphic" type="hueRotate" values="0" result="hr">${anim}</feColorMatrix>`
        + `<feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="${seed % 997}" result="gn"/>`
        + '<feColorMatrix in="gn" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  9 0 0 0 -5.5" result="ga"/><feComposite in="ga" in2="SourceAlpha" operator="in" result="gl"/>'
        + '<feMerge><feMergeNode in="hr"/><feMergeNode in="gl"/></feMerge>';
    }
    case 'sumie':
      // tinta china: casi sin color; en full el trazo tiembla y se corre en el papel de arroz
      return '<feColorMatrix in="SourceGraphic" type="saturate" values=".15" result="bw"/>'
        + (full
          ? wobble(seed, 'bw', 2.6, 0.04) + '<feGaussianBlur in="wb" stdDeviation="1.8"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .5 0" result="bl"/>'
            + grain(seed, '#f3eee2', 1.3, 0.8) + '<feMerge><feMergeNode in="bl"/><feMergeNode in="wb"/><feMergeNode in="gr"/></feMerge>'
          : '');
    case 'tarot':
      return full ? wobble(seed, 'SourceGraphic', 1.2, 0.05) + grain(seed, '#5a4020', 1.2) + '<feMerge><feMergeNode in="wb"/><feMergeNode in="gr"/></feMerge>' : '';
    case 'retro70':
      // foto desteñida: negros levantados, tono cálido y grano
      return full
        ? '<feColorMatrix in="SourceGraphic" values=".9 .06 0 0 .07  0 .86 .02 0 .05  0 .04 .76 0 .04  0 0 0 1 0" result="fd"/>' + grain(seed, '#5a3a1e', 1.2) + '<feMerge><feMergeNode in="fd"/><feMergeNode in="gr"/></feMerge>'
        : '';
    case 'mosaic': {
      // teselas de 6 (5 + junta de mortero); en full cada tesela cambia de tono y queda puesta a mano
      let f = '<feFlood flood-color="#9a9282"/><feComposite in2="SourceAlpha" operator="in" result="gt"/>';
      let src = 'SourceGraphic';
      if (full) {
        f += `<feTurbulence type="fractalNoise" baseFrequency=".21" numOctaves="1" seed="${seed % 997}"/><feColorMatrix values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="tg"/>`
          + '<feComposite in="SourceGraphic" in2="tg" operator="arithmetic" k1=".6" k2=".72" result="tv"/>';
        src = 'tv';
      }
      f += '<feFlood x="-160" y="-200" width="2" height="2" flood-color="#000"/><feComposite width="6" height="6"/><feTile result="tile"/>'
        + `<feComposite in="${src}" in2="tile" operator="in"/><feMorphology operator="dilate" radius="1.6"/>`
        + '<feComponentTransfer result="ts"><feFuncA type="discrete" tableValues="0 1 1"/></feComponentTransfer>';
      return f + (full ? wobble(seed, 'ts', 1.8, 0.11) + '<feMerge><feMergeNode in="gt"/><feMergeNode in="wb"/></feMerge>' : '<feMerge><feMergeNode in="gt"/><feMergeNode in="ts"/></feMerge>');
    }
    case 'neonsign': {
      if (!full) return '';
      // resplandor solo de lo luminoso (el tubo); al animar, el halo parpadea como un letrero viejo
      const flick = animate ? '<animate attributeName="slope" values="1.5;1.5;1.5;.3;1.5;1.5;1.5;1.5;.6;1.5;.2;1.5" dur="5s" repeatCount="indefinite" calcMode="discrete"/>' : '';
      return '<feColorMatrix in="SourceGraphic" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .7 .7 .7 0 -.55" result="br"/>'
        + '<feGaussianBlur in="br" stdDeviation="3" result="g1"/><feGaussianBlur in="br" stdDeviation="9" result="g2"/>'
        + `<feComponentTransfer in="g2" result="g3"><feFuncA type="linear" slope="1.5">${flick}</feFuncA></feComponentTransfer>`
        + '<feMerge><feMergeNode in="g3"/><feMergeNode in="g1"/><feMergeNode in="SourceGraphic"/></feMerge>';
    }
    case 'graffiti':
      if (!full) return '';
      // espray: niebla de gotitas alrededor del trazo
      return '<feGaussianBlur in="SourceGraphic" stdDeviation="3.5"/><feComponentTransfer result="bl"><feFuncA type="linear" slope="2.2"/></feComponentTransfer>'
        + `<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="${seed % 997}" result="sn"/>`
        + '<feColorMatrix in="sn" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  12 0 0 0 -6.9" result="sm"/>'
        + '<feComposite in="bl" in2="sm" operator="in" result="spk"/>'
        + '<feMerge><feMergeNode in="spk"/><feMergeNode in="SourceGraphic"/></feMerge>';
    case 'thermal': {
      // cámara térmica: luminancia → paleta «ironbow» (barato: vale en lite); en full, desenfoque y ruido del sensor
      const ramp = '<feColorMatrix values=".2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0"/>'
        + '<feComponentTransfer result="rm"><feFuncR type="table" tableValues=".04 .16 .54 .91 1 1"/><feFuncG type="table" tableValues=".02 .04 .1 .25 .69 .98"/><feFuncB type="table" tableValues=".13 .42 .54 .11 0 .88"/></feComponentTransfer>';
      return full
        ? '<feGaussianBlur in="SourceGraphic" stdDeviation="1.2"/>' + ramp + grain(seed, '#ffffff', 0.8, 1.4) + '<feMerge><feMergeNode in="rm"/><feMergeNode in="gr"/></feMerge>'
        : ramp;
    }
    default:
      return '';
  }
}

// ───────────────────────────── capa interior ─────────────────────────────

/** Lo que el estilo dibuja dentro del cuerpo (recortado a su contorno por quien llama). */
function innerLayer(s, L, uid, d) {
  const sx = s._style;
  const b = L.box;
  const rnd = seeded(sx.seed ^ 0x5f3759df);
  let defs = '';
  let svg = '';
  switch (sx.id) {
    case 'ukiyoe': {
      // bokashi: degradado de tinta arriba y vetas de la plancha de madera
      defs += `<linearGradient id="${uid}-bk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2233" stop-opacity=".32"/><stop offset=".4" stop-color="#1b2233" stop-opacity="0"/></linearGradient>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-bk)"/>`;
      let grainD = '';
      for (let i = 0; i < 9; i++) {
        const y = b.y + b.h * (0.12 + i * 0.1 + rnd() * 0.04);
        const a = 2 + rnd() * 3;
        grainD += `M${n(b.x - 4)} ${n(y)}C${n(b.x + b.w * 0.3)} ${n(y - a)} ${n(b.x + b.w * 0.6)} ${n(y + a)} ${n(b.x + b.w + 4)} ${n(y)}`;
      }
      svg += `<path d="${grainD}" fill="none" stroke="#1b2233" stroke-width=".8" opacity=".14"/>`;
      break;
    }
    case 'clay': {
      // huellas: medias lunas de dedo apretado en la masa
      for (let i = 0; i < 4; i++) {
        const x = b.x + b.w * (0.2 + rnd() * 0.6);
        const y = b.y + b.h * (0.25 + rnd() * 0.6);
        const r = b.w * (0.05 + rnd() * 0.04);
        svg += `<path d="M${n(x - r)} ${n(y)}A${n(r)} ${n(r * 0.6)} 0 0 0 ${n(x + r)} ${n(y)}" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round" opacity=".1"/>`;
      }
      break;
    }
    case 'glass': {
      // cristales: celdas de Voronoi con tono variable y plomo oscuro
      const sites = jitterGrid(rnd, b.x, b.y, b.w, b.h, 3, 4, 0.9);
      const cells = voronoi(sites, b.x - 10, b.y - 10, b.x + b.w + 10, b.y + b.h + 10);
      let lead = '';
      cells.forEach((poly, i) => {
        const p = polyD(poly);
        const k = rnd();
        svg += `<path d="${p}" fill="${k < 0.5 ? '#000' : '#fff'}" opacity="${n(0.06 + (i % 3) * 0.06)}"/>`;
        lead += p;
      });
      svg += `<path d="${lead}" fill="none" stroke="#141014" stroke-width="3.2" stroke-linejoin="round"/>`;
      break;
    }
    case 'bauhaus': {
      // mitades de primarios y un círculo: el cuerpo se vuelve composición
      const c2 = s.body.patternColor;
      const c3 = PAL.bauhaus.find((c) => c !== s.body.color && c !== c2) || '#151515';
      const right = rnd() < 0.5;
      svg += `<rect x="${n(right ? L.cx : b.x - 6)}" y="${n(b.y - 6)}" width="${n(b.w / 2 + 6)}" height="${n(b.h + 12)}" fill="${c2}"/>`;
      svg += `<circle cx="${n(right ? b.x + b.w * 0.18 : b.x + b.w * 0.82)}" cy="${n(b.y + b.h * 0.92)}" r="${n(b.w * 0.26)}" fill="${c3}"/>`;
      svg += `<path d="M${n(L.cx)} ${n(b.y - 6)}V${n(b.y + b.h + 6)}" stroke="#151515" stroke-width="3"/>`;
      break;
    }
    case 'manuscript': {
      // pan de oro: punteado y filete dorado por dentro del contorno
      defs += `<pattern id="${uid}-gd" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4.5" cy="4.5" r="1.1" fill="#c99a2e"/></pattern>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-gd)" opacity=".55"/>`;
      svg += `<path d="${d}" fill="none" stroke="#c99a2e" stroke-width="7"/><path d="${d}" fill="none" stroke="#f3d27a" stroke-width="2" opacity=".8"/>`;
      break;
    }
    case 'glitch': {
      // líneas de barrido
      defs += `<pattern id="${uid}-sl" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="#000" opacity=".28"/></pattern>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-sl)"/>`;
      break;
    }
    case 'ink': {
      // sombreado cruzado suave en la parte de sombra
      defs += `<pattern id="${uid}-xh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0V6" stroke="#222" stroke-width=".8"/></pattern>`;
      svg += `<ellipse cx="${n(L.cx + b.w * 0.32)}" cy="${n(b.y + b.h * 0.78)}" rx="${n(b.w * 0.42)}" ry="${n(b.h * 0.36)}" fill="url(#${uid}-xh)" opacity=".35"/>`;
      break;
    }
    case 'pop': {
      // Ben-Day: trama de puntos claros en todo el cuerpo, oscuros en la sombra, y un brillo de cómic
      defs += `<pattern id="${uid}-bl" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3.5" cy="3.5" r="2" fill="#fff" opacity=".5"/></pattern>`;
      defs += `<pattern id="${uid}-bk" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3.5" cy="3.5" r="2.4" fill="#111" opacity=".42"/></pattern>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-bl)"/>`;
      svg += `<path d="${d}" fill="url(#${uid}-bk)" transform="translate(${n(b.w * 0.16)} ${n(b.h * 0.14)})"/>`;
      const gx = b.x + b.w * 0.24;
      const gy = b.y + b.h * 0.18;
      svg += `<path d="M${n(gx)} ${n(gy + 14)}Q${n(gx + 2)} ${n(gy)} ${n(gx + 16)} ${n(gy - 4)}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="${n(gx + 24)}" cy="${n(gy - 6)}" r="2.6" fill="#fff"/>`;
      break;
    }
    case 'watercolor': {
      // floraciones: manchas con el cerco más oscuro, y un hueco de papel sin pintar como brillo
      defs += `<radialGradient id="${uid}-wb"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".04"/><stop offset=".93" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
      defs += `<radialGradient id="${uid}-wh"><stop offset="0" stop-color="#fffdf6" stop-opacity=".85"/><stop offset=".6" stop-color="#fffdf6" stop-opacity=".5"/><stop offset="1" stop-color="#fffdf6" stop-opacity="0"/></radialGradient>`;
      for (let i = 0; i < 5; i++) {
        svg += `<circle cx="${n(b.x + b.w * (0.15 + rnd() * 0.7))}" cy="${n(b.y + b.h * (0.3 + rnd() * 0.65))}" r="${n(b.w * (0.12 + rnd() * 0.14))}" fill="url(#${uid}-wb)"/>`;
      }
      svg += `<ellipse cx="${n(b.x + b.w * 0.3)}" cy="${n(b.y + b.h * 0.22)}" rx="${n(b.w * 0.16)}" ry="${n(b.h * 0.1)}" fill="url(#${uid}-wh)"/>`;
      svg += `<path d="${d}" fill="#000" opacity=".1" transform="translate(${n(b.w * 0.12)} ${n(b.h * 0.16)})"/>`;
      break;
    }
    case 'pixel': {
      // sombreado de dos tonos (los píxeles del filtro lo escalonan)
      svg += `<path d="${d}" fill="#000" opacity=".26" transform="translate(${n(b.w * 0.14)} ${n(b.h * 0.14)})"/>`;
      svg += `<rect x="${n(b.x + b.w * 0.18)}" y="${n(b.y + b.h * 0.1)}" width="${n(b.w * 0.16)}" height="${n(b.h * 0.08)}" fill="#fff" opacity=".55"/>`;
      break;
    }
    case 'synthwave': {
      // atardecer en el cuerpo: violeta abajo, franjas cromadas y líneas de barrido
      defs += `<linearGradient id="${uid}-sw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#2a0857" stop-opacity=".6"/></linearGradient>`;
      defs += `<pattern id="${uid}-sl" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#1a0b33" opacity=".22"/></pattern>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-sw)"/><rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-sl)"/>`;
      let bars = '';
      for (let i = 0; i < 4; i++) bars += `<rect x="${n(b.x - 4)}" y="${n(b.y + b.h * (0.62 + i * 0.09))}" width="${n(b.w + 8)}" height="${n(1.5 + i * 1.3)}"/>`;
      svg += `<g fill="#1a0b33" opacity=".45">${bars}</g>`;
      break;
    }
    case 'nouveau': {
      // latigazos dorados que suben como tallos, con capullos
      let curves = '';
      let buds = '';
      for (let i = 0; i < 3; i++) {
        const x = b.x + b.w * (0.2 + i * 0.3 + (rnd() - 0.5) * 0.08);
        const y0 = b.y + b.h + 4;
        const y1 = b.y + b.h * (0.5 + rnd() * 0.15);
        const sw = (i % 2 ? 1 : -1) * b.w * 0.12;
        curves += `M${n(x)} ${n(y0)}C${n(x + sw)} ${n(y0 - (y0 - y1) * 0.4)} ${n(x - sw)} ${n(y1 + (y0 - y1) * 0.3)} ${n(x + sw * 0.4)} ${n(y1)}`;
        buds += `<circle cx="${n(x + sw * 0.4)}" cy="${n(y1 - 3)}" r="3.2"/>`;
      }
      svg += `<path d="${curves}" fill="none" stroke="#c9a24a" stroke-width="2.4" stroke-linecap="round" opacity=".8"/><g fill="#c9a24a" opacity=".85">${buds}</g>`;
      svg += `<path d="${d}" fill="none" stroke="#efe2c4" stroke-width="10" opacity=".25"/>`;
      break;
    }
    case 'cubism': {
      // facetas: celdas de Voronoi muy irregulares, cada una con su propia luz y algún plano de color
      defs += `<linearGradient id="${uid}-c0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>`;
      defs += `<linearGradient id="${uid}-c1" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>`;
      const sites = jitterGrid(rnd, b.x, b.y, b.w, b.h, 3, 3, 1.1);
      const cells = voronoi(sites, b.x - 10, b.y - 10, b.x + b.w + 10, b.y + b.h + 10);
      let lines = '';
      cells.forEach((poly, i) => {
        const p = polyD(poly);
        const k = rnd();
        if (k < 0.38) svg += `<path d="${p}" fill="${PAL.cubism[Math.floor(rnd() * 5)]}" opacity=".65"/>`;
        svg += `<path d="${p}" fill="url(#${uid}-c${i % 2})"/>`;
        lines += p;
      });
      svg += `<path d="${lines}" fill="none" stroke="#2e2a26" stroke-width="1.6" stroke-linejoin="miter" opacity=".75"/>`;
      break;
    }
    case 'crayon': {
      // relleno de niño: zigzag de cera que se sale de las líneas
      let z = '';
      const step = 5.5;
      let up = true;
      for (let x = b.x - 10; x < b.x + b.w + 10; x += step) {
        z += `${z ? 'L' : 'M'}${n(x + rnd() * 2)} ${n(up ? b.y - 6 + rnd() * 8 : b.y + b.h + 6 - rnd() * 8)}`;
        up = !up;
      }
      svg += `<path d="${z}" fill="none" stroke="#000" stroke-width="2.2" stroke-linejoin="round" opacity=".14" transform="rotate(14 ${n(L.cx)} ${n(b.y + b.h / 2)})"/>`;
      svg += `<path d="${d}" fill="none" stroke="#fff" stroke-width="7" opacity=".35"/>`;
      break;
    }
    case 'blueprint': {
      // cuadrícula fina y ejes de construcción (raya-punto) con un círculo guía
      defs += `<pattern id="${uid}-bg" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#eaf2ff" stroke-width=".5" opacity=".35"/></pattern>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-bg)"/>`;
      const cy = b.y + b.h * 0.55;
      svg += `<path d="M${n(L.cx)} ${n(b.y - 6)}V${n(b.y + b.h + 6)}M${n(b.x - 6)} ${n(cy)}H${n(b.x + b.w + 6)}" stroke="#eaf2ff" stroke-width=".9" stroke-dasharray="9 3 2 3" opacity=".75"/>`;
      svg += `<circle cx="${n(L.cx)}" cy="${n(cy)}" r="${n(Math.min(b.w, b.h) * 0.36)}" fill="none" stroke="#eaf2ff" stroke-width=".8" stroke-dasharray="4 3" opacity=".55"/>`;
      break;
    }
    case 'pointillism': {
      // toques de color: claros, complementarios y oscuros (en lite es lo único que queda del estilo)
      const [h] = toHsl(s.body.color);
      const comp = fromHsl((h + 180) % 360, 0.6, 0.6);
      const ana = fromHsl((h + 40) % 360, 0.7, 0.62);
      defs += `<pattern id="${uid}-pt" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="2" r="1.4" fill="#fff" opacity=".6"/><circle cx="6" cy="1.5" r="1.3" fill="${comp}" opacity=".7"/><circle cx="4" cy="6" r="1.4" fill="${ana}" opacity=".8"/><circle cx="8" cy="7" r="1.2" fill="#000" opacity=".22"/><circle cx="1" cy="7.5" r="1.1" fill="${comp}" opacity=".45"/></pattern>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-pt)"/>`;
      break;
    }
    case 'woodcut': {
      // tallas: el contorno repetido hacia dentro (líneas de gubia) y un sombreado de rayas
      const cx = L.cx;
      const cy = b.y + b.h * 0.58;
      let rings = '';
      [0.84, 0.7, 0.57, 0.45].forEach((k, i) => {
        rings += `<path d="${d}" transform="translate(${n(cx * (1 - k))} ${n(cy * (1 - k))}) scale(${k})" stroke-width="${n((2.6 - i * 0.45) / k)}"/>`;
      });
      svg += `<g fill="none" stroke="#15120f" opacity=".8">${rings}</g>`;
      defs += `<pattern id="${uid}-wh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><rect width="5" height="2.2" fill="#15120f"/></pattern>`;
      svg += `<path d="${d}" fill="url(#${uid}-wh)" transform="translate(${n(b.w * 0.22)} ${n(b.h * 0.2)})"/>`;
      break;
    }
    case 'riso': {
      // trama de medios tonos en la sombra (más gruesa cuanto más adentro) y papel sin tinta como brillo
      defs += `<pattern id="${uid}-h1" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(22)"><circle cx="2.5" cy="2.5" r="1" fill="#0078bf" opacity=".6"/></pattern>`;
      defs += `<pattern id="${uid}-h2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(22)"><circle cx="2.5" cy="2.5" r="1.9" fill="#0078bf" opacity=".6"/></pattern>`;
      svg += `<path d="${d}" fill="url(#${uid}-h1)" transform="translate(${n(b.w * 0.12)} ${n(b.h * 0.1)})"/>`;
      svg += `<path d="${d}" fill="url(#${uid}-h2)" transform="translate(${n(b.w * 0.3)} ${n(b.h * 0.26)})"/>`;
      svg += `<ellipse cx="${n(b.x + b.w * 0.3)}" cy="${n(b.y + b.h * 0.2)}" rx="${n(b.w * 0.13)}" ry="${n(b.h * 0.07)}" fill="#f7f1e3" opacity=".75" transform="rotate(-25 ${n(b.x + b.w * 0.3)} ${n(b.y + b.h * 0.2)})"/>`;
      break;
    }
    case 'dotmatrix': {
      // sombra tramada en damero y sombra llena, alineadas a los bloques de 6 del filtro
      const q6 = (v) => Math.round(v / 6) * 6;
      defs += `<pattern id="${uid}-dt" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#346856"/><rect x="6" y="6" width="6" height="6" fill="#346856"/></pattern>`;
      svg += `<path d="${d}" fill="url(#${uid}-dt)" transform="translate(${q6(b.w * 0.16)} ${q6(b.h * 0.14)})"/>`;
      svg += `<path d="${d}" fill="#346856" transform="translate(${q6(b.w * 0.34)} ${q6(b.h * 0.3)})"/>`;
      svg += `<rect x="${q6(b.x + b.w * 0.2)}" y="${q6(b.y + b.h * 0.12)}" width="12" height="6" fill="#e0f8d0"/><rect x="${q6(b.x + b.w * 0.2)}" y="${q6(b.y + b.h * 0.12) + 6}" width="6" height="6" fill="#e0f8d0"/>`;
      break;
    }
    case 'chalk': {
      // rayado de tiza: trazos claros en la luz y el pizarrón asomando en rayas en la sombra
      let lt = '';
      for (let i = 0; i < 12; i++) {
        const x = b.x + b.w * (0.08 + rnd() * 0.5);
        const y = b.y + b.h * (0.08 + rnd() * 0.45);
        const l = b.w * (0.08 + rnd() * 0.12);
        lt += `M${n(x)} ${n(y)}l${n(l)} ${n(-l * 0.5)}`;
      }
      svg += `<path d="${lt}" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".35"/>`;
      defs += `<pattern id="${uid}-ch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><rect width="6" height="2.2" fill="#22352b"/></pattern>`;
      svg += `<path d="${d}" fill="url(#${uid}-ch)" opacity=".55" transform="translate(${n(b.w * 0.2)} ${n(b.h * 0.18)})"/>`;
      break;
    }
    case 'sticker': {
      // vinilo brillante: dos franjas de reflejo en diagonal y un destello
      const x0 = b.x - 10;
      const y0 = b.y - 10;
      svg += `<path d="M${n(x0)} ${n(b.y + b.h * 0.42)}L${n(b.x + b.w * 0.5)} ${n(y0)}L${n(b.x + b.w * 0.72)} ${n(y0)}L${n(x0)} ${n(b.y + b.h * 0.6)}Z" fill="#fff" opacity=".3"/>`;
      svg += `<path d="M${n(x0)} ${n(b.y + b.h * 0.68)}L${n(b.x + b.w * 0.84)} ${n(y0)}L${n(b.x + b.w * 0.9)} ${n(y0)}L${n(x0)} ${n(b.y + b.h * 0.74)}Z" fill="#fff" opacity=".22"/>`;
      svg += `<path d="${d}" fill="#000" opacity=".08" transform="translate(${n(b.w * 0.1)} ${n(b.h * 0.12)})"/>`;
      break;
    }
    case 'felt': {
      // puntada corrida por dentro del borde en hilo de otro tono, relleno abullonado
      const k = Math.max(0.7, 1 - 18 / b.w);
      const cx = L.cx;
      const cy = b.y + b.h * 0.55;
      const thread = luminance(s.body.color) > 0.45 ? mix(s.body.color, '#2a2420', 0.55) : mix(s.body.color, '#fff8ec', 0.7);
      defs += `<radialGradient id="${uid}-fp" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-fp)"/>`;
      svg += `<path d="${d}" fill="none" stroke="${thread}" stroke-width="${n(2.4 / k)}" stroke-dasharray="${n(5.5 / k)} ${n(4 / k)}" stroke-linecap="round" transform="translate(${n(cx * (1 - k))} ${n(cy * (1 - k))}) scale(${n(k)})"/>`;
      break;
    }
    case 'papercut': {
      // capas de cartulina: el contorno repetido más chico, cada capa más clara y con su sombra
      defs += `<filter id="${uid}-ps" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1.2" dy="2.4" stdDeviation="1.6" flood-color="#2a1f3a" flood-opacity=".35"/></filter>`;
      const cx = L.cx;
      const cy = b.y + b.h * 0.78;
      [0.8, 0.6, 0.4].forEach((k, i) => {
        svg += `<path d="${d}" fill="${mix(s.body.color, '#ffffff', 0.16 * (i + 1))}" filter="url(#${uid}-ps)" transform="translate(${n(cx * (1 - k))} ${n(cy * (1 - k))}) scale(${k})"/>`;
      });
      break;
    }
    case 'lowpoly': {
      // facetas: rejilla con jitter partida en triángulos; cada uno con la luz de su normal sobre una cúpula
      const x0 = b.x - 8;
      const y0 = b.y - 8;
      const w = b.w + 16;
      const h = b.h + 16;
      const cols = 5;
      const rows = 6;
      const cy = b.y + b.h * 0.5;
      const P = [];
      for (let r = 0; r <= rows; r++) {
        const row = [];
        for (let c = 0; c <= cols; c++) {
          const edge = r === 0 || c === 0 || r === rows || c === cols;
          const x = x0 + (w * (c + (edge ? 0 : (rnd() - 0.5) * 0.7))) / cols;
          const y = y0 + (h * (r + (edge ? 0 : (rnd() - 0.5) * 0.7))) / rows;
          const u = (x - L.cx) / (w / 2);
          const v = (y - cy) / (h / 2);
          row.push([x, y, Math.sqrt(Math.max(0, 1 - u * u - v * v)) * Math.min(w, h) * 0.6 + rnd() * 5]);
        }
        P.push(row);
      }
      const Lv = [-0.48, -0.62, 0.62];
      const tri = (a, e, c) => {
        const ux = e[0] - a[0], uy = e[1] - a[1], uz = e[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        if (nz < 0) [nx, ny, nz] = [-nx, -ny, -nz];
        const sh = (nx * Lv[0] + ny * Lv[1] + nz * Lv[2]) / (Math.hypot(nx, ny, nz) || 1);
        const lit = sh > 0.62;
        const col = lit ? '#fff' : '#000';
        const op = Math.min(0.5, lit ? (sh - 0.62) * 1.2 : (0.62 - sh) * 0.6);
        return `<path d="M${n(a[0])} ${n(a[1])}L${n(e[0])} ${n(e[1])}L${n(c[0])} ${n(c[1])}Z" fill="${col}" stroke="${col}" stroke-width=".5" stroke-linejoin="round" opacity="${n(op)}"/>`;
      };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = P[r][c], e = P[r][c + 1], f = P[r + 1][c + 1], g = P[r + 1][c];
          svg += (r + c) % 2 ? tri(a, e, f) + tri(a, f, g) : tri(a, e, g) + tri(e, f, g);
        }
      }
      break;
    }
    case 'marble': {
      // modelado: luz cenital arriba a la izquierda, sombra tallada y alguna veta (también en lite)
      defs += `<radialGradient id="${uid}-ml" cx=".34" cy=".26" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#4a443c" stop-opacity=".22"/></radialGradient>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-ml)"/>`;
      let v = '';
      for (let i = 0; i < 3; i++) {
        const y = b.y + b.h * (0.2 + i * 0.28 + rnd() * 0.1);
        v += `M${n(b.x - 6)} ${n(y)}C${n(b.x + b.w * 0.3)} ${n(y - 14 + rnd() * 10)} ${n(b.x + b.w * 0.55)} ${n(y + 18 * rnd())} ${n(b.x + b.w + 6)} ${n(y - 20 + rnd() * 12)}`;
      }
      svg += `<path d="${v}" fill="none" stroke="#7d776d" stroke-width=".9" opacity=".35"/>`;
      break;
    }
    case 'candy': {
      // gomita azucarada: borde interior más intenso, cristalitos de azúcar y un brillo
      svg += `<path d="${d}" fill="none" stroke="${mix(s.body.color, '#000', 0.25)}" stroke-width="12" opacity=".3"/>`;
      let sug = '';
      for (let i = 0; i < 46; i++) {
        const x = b.x + rnd() * b.w;
        const y = b.y + rnd() * b.h;
        const z = 1.3 + rnd() * 1.6;
        sug += `<rect x="${n(x)}" y="${n(y)}" width="${n(z)}" height="${n(z)}" transform="rotate(${Math.floor(rnd() * 90)} ${n(x)} ${n(y)})" opacity="${n(0.45 + rnd() * 0.45)}"/>`;
      }
      svg += `<g fill="#fff">${sug}</g>`;
      svg += `<ellipse cx="${n(b.x + b.w * 0.3)}" cy="${n(b.y + b.h * 0.2)}" rx="${n(b.w * 0.12)}" ry="${n(b.h * 0.06)}" fill="#fff" opacity=".6" transform="rotate(-30 ${n(b.x + b.w * 0.3)} ${n(b.y + b.h * 0.2)})"/>`;
      break;
    }
    case 'holo': {
      // arcoíris tornasolado en diagonal, rayas de brillo y destellos
      defs += `<linearGradient id="${uid}-hg" gradientUnits="userSpaceOnUse" x1="${n(b.x)}" y1="${n(b.y)}" x2="${n(b.x + b.w * 0.55)}" y2="${n(b.y + b.h * 0.55)}" spreadMethod="reflect">`
        + '<stop offset="0" stop-color="#ff8fd0"/><stop offset=".22" stop-color="#ffe08a"/><stop offset=".42" stop-color="#8affc0"/><stop offset=".62" stop-color="#8ad0ff"/><stop offset=".82" stop-color="#b98aff"/><stop offset="1" stop-color="#ff8fd0"/></linearGradient>';
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-hg)" opacity=".62"/>`;
      let sh = '';
      for (let i = 0; i < 5; i++) {
        const o = b.w * (0.1 + i * 0.22 + rnd() * 0.05);
        sh += `M${n(b.x + o)} ${n(b.y - 6)}l${n(-b.h * 0.6)} ${n(b.h * 1.2)}`;
      }
      svg += `<path d="${sh}" stroke="#fff" stroke-width="1.4" opacity=".35"/>`;
      let sp = '';
      for (let i = 0; i < 3; i++) {
        const x = b.x + b.w * (0.15 + rnd() * 0.7);
        const y = b.y + b.h * (0.15 + rnd() * 0.7);
        const r = 3 + rnd() * 3;
        sp += `M${n(x)} ${n(y - r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + r)}Q${n(x)} ${n(y)} ${n(x - r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - r)}Z`;
      }
      svg += `<path d="${sp}" fill="#fff" opacity=".9"/>`;
      break;
    }
    case 'sumie': {
      // aguada: la tinta se junta abajo y una pincelada seca cruza el cuerpo
      defs += `<linearGradient id="${uid}-sw" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#1d1b19" stop-opacity="0"/><stop offset="1" stop-color="#1d1b19" stop-opacity=".4"/></linearGradient>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-sw)"/>`;
      const x0 = b.x + b.w * 0.12;
      const y0 = b.y + b.h * 0.95;
      let br = '';
      for (let i = 0; i < 5; i++) {
        const o = (i - 2) * b.w * 0.028;
        br += `<path d="M${n(x0 + o)} ${n(y0 + o)}C${n(b.x + b.w * 0.05 + o)} ${n(b.y + b.h * 0.5)} ${n(b.x + b.w * 0.3 + o)} ${n(b.y + b.h * 0.15)} ${n(b.x + b.w * 0.62 + o)} ${n(b.y + b.h * 0.08 + o)}" stroke-width="${n(2 + rnd() * 3)}" stroke-dasharray="${Math.floor(20 + rnd() * 40)} ${Math.floor(2 + rnd() * 6)} ${Math.floor(10 + rnd() * 30)} ${Math.floor(3 + rnd() * 5)}"/>`;
      }
      svg += `<g fill="none" stroke="#1d1b19" stroke-linecap="round" opacity=".2">${br}</g>`;
      break;
    }
    case 'tarot': {
      // cielo de carta: filete de puntos dorados por dentro del borde, estrellas y una luna
      const gold = s.body.color === '#c9a23a' ? '#efe3c4' : '#c9a23a';
      const k = Math.max(0.72, 1 - 16 / b.w);
      const cy = b.y + b.h * 0.55;
      svg += `<path d="${d}" fill="none" stroke="${gold}" stroke-width="${n(2.2 / k)}" stroke-dasharray="0 ${n(6 / k)}" stroke-linecap="round" transform="translate(${n(L.cx * (1 - k))} ${n(cy * (1 - k))}) scale(${n(k)})"/>`;
      let st = '';
      for (let i = 0; i < 5; i++) {
        const x = b.x + b.w * (0.15 + rnd() * 0.7);
        const y = b.y + b.h * (0.45 + rnd() * 0.45);
        const r = 2.2 + rnd() * 2.6;
        st += star5(x, y, r);
      }
      svg += `<path d="${st}" fill="${gold}"/>`;
      const mx = b.x + b.w * 0.78;
      const my = b.y + b.h * 0.3;
      svg += `<path d="M${n(mx)} ${n(my - 7)}A7 7 0 1 0 ${n(mx)} ${n(my + 7)}A5.4 5.4 0 1 1 ${n(mx)} ${n(my - 7)}Z" fill="${gold}"/>`;
      break;
    }
    case 'retro70': {
      // franjas setenteras que cruzan el cuerpo en curva
      const cols = ['#4a2c1e', '#c94f2c', '#e8762c', '#f2b33d', '#d9c58a'].filter((c) => c !== s.body.color).slice(1, 4);
      const x0 = b.x - 12;
      const x1 = b.x + b.w + 12;
      cols.forEach((c, i) => {
        const y = b.y + b.h * (0.7 + i * 0.085);
        svg += `<path d="M${n(x0)} ${n(y + 14)}C${n(b.x + b.w * 0.3)} ${n(y + 16)} ${n(b.x + b.w * 0.6)} ${n(y - 22)} ${n(x1)} ${n(y - 30)}" fill="none" stroke="${c}" stroke-width="${n(b.h * 0.075)}"/>`;
      });
      svg += `<path d="${d}" fill="#fff" opacity=".12" transform="translate(${n(-b.w * 0.08)} ${n(-b.h * 0.1)})"/>`;
      break;
    }
    case 'mosaic': {
      // opus vermiculatum: una fila de teselas de otro color siguiendo el borde, sombra y luz
      const k = Math.max(0.7, 1 - 20 / b.w);
      const cy = b.y + b.h * 0.55;
      svg += `<path d="${d}" fill="#000" opacity=".2" transform="translate(${n(b.w * 0.2)} ${n(b.h * 0.18)})"/>`;
      svg += `<path d="${d}" fill="none" stroke="${s.body.patternColor && s.body.patternColor !== s.body.color ? s.body.patternColor : '#efe4cc'}" stroke-width="${n(6 / k)}" opacity=".9" transform="translate(${n(L.cx * (1 - k))} ${n(cy * (1 - k))}) scale(${n(k)})"/>`;
      svg += `<ellipse cx="${n(b.x + b.w * 0.3)}" cy="${n(b.y + b.h * 0.22)}" rx="${n(b.w * 0.14)}" ry="${n(b.h * 0.08)}" fill="#fff" opacity=".35"/>`;
      break;
    }
    case 'neonsign': {
      // segundo tubo por dentro (con sus cortes) y el reflejo del vidrio
      const tube = neonTube(s.body.color);
      const k = Math.max(0.6, 1 - 26 / b.w);
      const cy = b.y + b.h * 0.55;
      svg += `<path d="${d}" fill="none" stroke="${tube}" stroke-width="${n(2.2 / k)}" stroke-dasharray="${n(70 / k)} ${n(9 / k)}" stroke-linecap="round" opacity=".75" transform="translate(${n(L.cx * (1 - k))} ${n(cy * (1 - k))}) scale(${n(k)})"/>`;
      defs += `<linearGradient id="${uid}-ng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tube}" stop-opacity=".22"/><stop offset=".5" stop-color="${tube}" stop-opacity="0"/></linearGradient>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-ng)"/>`;
      break;
    }
    case 'graffiti': {
      // relleno de espray: se funde a otro color abajo, burbujas de brillo y reflejo blanco
      const c2 = PAL.graffiti.filter((c) => c !== s.body.color && c !== '#ffffff' && c !== '#111111')[Math.floor(rnd() * 6)];
      defs += `<linearGradient id="${uid}-gf" x1="0" y1="0" x2="0" y2="1"><stop offset=".4" stop-color="${c2}" stop-opacity="0"/><stop offset=".85" stop-color="${c2}" stop-opacity=".95"/></linearGradient>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-gf)"/>`;
      let bub = '';
      for (let i = 0; i < 4; i++) bub += `<circle cx="${n(b.x + b.w * (0.15 + rnd() * 0.7))}" cy="${n(b.y + b.h * (0.35 + rnd() * 0.5))}" r="${n(2.5 + rnd() * 4)}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>`;
      svg += bub;
      const gx = b.x + b.w * 0.2;
      const gy = b.y + b.h * 0.3;
      svg += `<path d="M${n(gx)} ${n(gy + 16)}Q${n(gx)} ${n(gy)} ${n(gx + 14)} ${n(gy - 6)}" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="${n(gx + 22)}" cy="${n(gy - 8)}" r="2.4" fill="#fff"/>`;
      break;
    }
    case 'thermal': {
      // calor: el centro del cuerpo más caliente que los bordes
      defs += `<radialGradient id="${uid}-th" cx=".5" cy=".48" r=".62"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".45" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>`;
      svg += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="url(#${uid}-th)"/>`;
      break;
    }
  }
  return { defs, svg };
}

/**
 * Piezas del estilo para renderLayers: defs (filtro + patrones), capa interior del cuerpo y el
 * `url(#…)` del filtro que se aplica a todo el personaje ('' si no hay).
 * @param {object} s  spec ya estilizada (stylizeSpec)
 * @param {object} L  layout del cuerpo
 * @param {{ uid:string, d:string, quality?:'full'|'lite'|'off', animate?:boolean }} ctx
 */
export function styleLayers(s, L, ctx) {
  const sx = s?._style;
  if (!sx) return { defs: '', inner: '', filter: '' };
  const q = ctx.quality === 'off' ? 'lite' : ctx.quality || 'full';
  const fb = filterBody(sx.id, sx.seed, q, !!ctx.animate);
  const il = innerLayer(s, L, ctx.uid, ctx.d);
  const fid = `${ctx.uid}-sty`;
  return {
    defs: il.defs + (fb ? `<filter id="${fid}" ${REGION}>${fb}</filter>` : ''),
    inner: il.svg,
    filter: fb ? `url(#${fid})` : '',
  };
}

// ───────────────────────────── fondos ─────────────────────────────

// Marco fijo de 300×300; el suelo arranca hacia y=240 (los pies del ot caen ahí).
const W = 300;
const GROUND = 240;

/** Filtro de grano para un fondo: motas de un color (rgb 0..1) con la densidad de `a`/`b`. */
const bdGrain = (id, rnd, rgb, a = 1.4, b = -0.72, freq = 0.75) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  0 0 0 ${a} ${b}"/></filter>`;

/** Rejilla con jitter partida en triángulos que cubre el rectángulo; `color(x, y)` en el centroide. */
function facets(rnd, x0, y0, w, h, cols, rows, color) {
  const P = [];
  for (let r = 0; r <= rows; r++) {
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const ex = c === 0 || c === cols;
      const ey = r === 0 || r === rows;
      row.push([x0 + (w * (c + (ex ? 0 : (rnd() - 0.5) * 0.8))) / cols, y0 + (h * (r + (ey ? 0 : (rnd() - 0.5) * 0.8))) / rows]);
    }
    P.push(row);
  }
  let s = '';
  const t = (a, b, c) => {
    const col = color((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
    s += `<path d="M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(c[0])} ${n(c[1])}Z" fill="${col}" stroke="${col}" stroke-width=".7" stroke-linejoin="round"/>`;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = P[r][c], b = P[r][c + 1], e = P[r + 1][c + 1], d = P[r + 1][c];
      if ((r + c) % 2) {
        t(a, b, e);
        t(a, e, d);
      } else {
        t(a, b, d);
        t(b, e, d);
      }
    }
  }
  return s;
}

/** Celdas de una rejilla de `size` cuyo centro cae en el círculo (para dibujar en bloques). */
function blockDisc(cx, cy, r, size) {
  let d = '';
  for (let y = Math.floor((cy - r) / size) * size; y < cy + r; y += size) {
    for (let x = Math.floor((cx - r) / size) * size; x < cx + r; x += size) {
      if ((x + size / 2 - cx) ** 2 + (y + size / 2 - cy) ** 2 <= r * r) d += `M${x} ${y}h${size}v${size}h${-size}Z`;
    }
  }
  return d;
}

const BACKDROPS = {
  ukiyoe(p, rnd) {
    const sunX = 190 + rnd() * 50;
    let s = `<defs><filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .12  0 0 0 1.4 -.72"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#ece0c4"/>`;
    s += `<circle cx="${n(sunX)}" cy="62" r="34" fill="#c8402c"/>`;
    // Fuji con su capa de nieve dentada
    const fx = 150 + rnd() * 30;
    s += `<path d="M${n(fx - 95)} ${GROUND}L${n(fx - 16)} 128Q${n(fx)} 118 ${n(fx + 16)} 128L${n(fx + 95)} ${GROUND}Z" fill="#46688a"/>`;
    let snow = `M${n(fx - 16)} 128Q${n(fx)} 118 ${n(fx + 16)} 128L${n(fx + 32)} 152`;
    for (let i = 0; i < 6; i++) snow += `L${n(fx + 32 - (i + 0.5) * 10.7)} ${n(i % 2 ? 150 : 140 + rnd() * 6)}`;
    s += `<path d="${snow}L${n(fx - 32)} 152Z" fill="#f3ead6"/>`;
    // mar con escamas de olas
    s += `<rect y="214" width="${W}" height="${GROUND - 214}" fill="#2f5579"/>`;
    let sc = '';
    for (let y = 218; y < GROUND; y += 7) for (let x = (y % 14 ? 0 : 7); x < W; x += 14) sc += `M${x} ${y + 5}a7 7 0 0 1 14 0`;
    s += `<path d="${sc}" fill="none" stroke="#e9e0c8" stroke-width="1.1" opacity=".75"/>`;
    // la gran ola: lengua oscura, banda clara y garras de espuma
    s += '<path d="M0 240V150C8 92 70 56 124 78C146 88 152 108 140 122C132 102 106 98 96 116C88 132 100 152 124 162C96 178 70 204 78 240Z" fill="#1f3a5f"/>';
    s += '<path d="M8 236C4 170 40 112 92 100" fill="none" stroke="#5d86a8" stroke-width="9" opacity=".8"/><path d="M22 236C22 186 46 140 84 124" fill="none" stroke="#e9e0c8" stroke-width="1.4" opacity=".6"/><path d="M36 236C38 196 56 160 86 146" fill="none" stroke="#e9e0c8" stroke-width="1.4" opacity=".5"/>';
    let claws = '';
    const crest = [[124, 78], [134, 86], [141, 98], [142, 110], [140, 122], [128, 108], [116, 102], [104, 104]];
    for (const [x, y] of crest) claws += `<circle cx="${x}" cy="${y}" r="${n(3 + rnd() * 2.5)}" fill="#f3ead6"/>`;
    for (let i = 0; i < 14; i++) claws += `<circle cx="${n(100 + rnd() * 70)}" cy="${n(60 + rnd() * 60)}" r="${n(0.8 + rnd() * 1.6)}" fill="#f3ead6"/>`;
    s += claws;
    // suelo de madera: tablas, juntas y vetas
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#b98a55"/>`;
    let pl = '';
    for (const y of [254, 270, 287]) {
      pl += `M0 ${y}H${W}`;
      for (let x = rnd() * 60; x < W; x += 70 + rnd() * 50) pl += `M${n(x)} ${y}v${y === 287 ? 13 : y === 254 ? -14 : -16}`;
    }
    s += `<path d="M0 ${GROUND}H${W}" stroke="#6e4826" stroke-width="2"/><path d="${pl}" stroke="#8a5f34" stroke-width="1.2" fill="none"/>`;
    // sello vertical rojo con 七つ
    s += '<rect x="262" y="22" width="24" height="62" rx="2" fill="#b8322a"/><text x="274" y="48" font-size="19" text-anchor="middle" fill="#f3e6cc" font-family="\'Noto Serif CJK JP\',\'Hiragino Mincho ProN\',serif">七</text><text x="274" y="74" font-size="17" text-anchor="middle" fill="#f3e6cc" font-family="\'Noto Serif CJK JP\',\'Hiragino Mincho ProN\',serif">つ</text>';
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  clay(p, rnd) {
    const light = '<feDistantLight azimuth="235" elevation="50"/>';
    let s = `<defs><linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fcdf0"/><stop offset="1" stop-color="#dff3fb"/></linearGradient>`
      + `<filter id="${p}c" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feDisplacementMap in="SourceGraphic" scale="6" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="4" result="b"/><feDiffuseLighting in="b" surfaceScale="4" diffuseConstant="1.18" lighting-color="#fff" result="l">${light}</feDiffuseLighting><feComposite in="d" in2="l" operator="arithmetic" k1="1" result="sh"/><feSpecularLighting in="b" surfaceScale="4" specularConstant=".45" specularExponent="18" lighting-color="#fff" result="sp">${light}</feSpecularLighting><feComposite in="sp" in2="d" operator="in" result="sp2"/><feComposite in="sh" in2="sp2" operator="arithmetic" k2="1" k3=".8"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="url(#${p}sky)"/>`;
    const F = `filter="url(#${p}c)"`;
    // sol con rayos
    const sx = 228 + rnd() * 30;
    let rays = '';
    for (let i = 0; i < 12; i++) rays += `<rect x="-4" y="-50" width="8" height="16" rx="4" fill="#ffb52e" transform="translate(${n(sx)} 58) rotate(${i * 30 + rnd() * 6})"/>`;
    s += `<g ${F}>${rays}<circle cx="${n(sx)}" cy="58" r="26" fill="#ffcf3f"/></g>`;
    // nubes gorditas
    for (let k = 0; k < 2; k++) {
      const cx = 40 + k * 110 + rnd() * 30;
      const cy = 40 + rnd() * 40;
      s += `<g ${F} fill="#fbfbff"><circle cx="${n(cx)}" cy="${n(cy)}" r="16"/><circle cx="${n(cx + 18)}" cy="${n(cy - 8)}" r="20"/><circle cx="${n(cx + 38)}" cy="${n(cy)}" r="15"/><rect x="${n(cx)}" y="${n(cy)}" width="38" height="15" rx="7"/></g>`;
    }
    // colinas
    s += `<g ${F}><ellipse cx="60" cy="${GROUND + 8}" rx="120" ry="52" fill="#86c96a"/><ellipse cx="250" cy="${GROUND + 10}" rx="110" ry="44" fill="#9bd27a"/></g>`;
    // árbol robusto
    const tx = 40 + rnd() * 20;
    s += `<g ${F}><path d="M${n(tx - 9)} ${GROUND + 4}C${n(tx - 6)} 200 ${n(tx - 8)} 180 ${n(tx - 4)} 150H${n(tx + 6)}C${n(tx + 9)} 180 ${n(tx + 8)} 200 ${n(tx + 12)} ${GROUND + 4}Z" fill="#8a5a33"/></g>`;
    s += `<g ${F} fill="#4fae4a"><circle cx="${n(tx)}" cy="128" r="30"/><circle cx="${n(tx - 24)}" cy="148" r="20"/><circle cx="${n(tx + 24)}" cy="146" r="22"/><circle cx="${n(tx + 6)}" cy="104" r="20" fill="#5cc254"/></g>`;
    // tierra con borde grumoso y piedritas
    let top = `M-10 ${W}V${GROUND}`;
    for (let x = -10; x < W + 10; x += 22) top += `Q${n(x + 11)} ${n(GROUND - 5 - rnd() * 6)} ${x + 22} ${GROUND}`;
    s += `<g ${F}><path d="${top}V${W}Z" fill="#a8703f"/></g>`;
    let peb = '';
    for (let i = 0; i < 7; i++) peb += `<ellipse cx="${n(rnd() * W)}" cy="${n(GROUND + 14 + rnd() * 50)}" rx="${n(4 + rnd() * 5)}" ry="${n(3 + rnd() * 2)}" fill="${rnd() < 0.5 ? '#8a5730' : '#c08a58'}"/>`;
    s += `<g ${F}>${peb}</g>`;
    return s;
  },

  glass(p, rnd) {
    const arch = `M40 ${GROUND}V118A140 140 0 0 1 150 12A140 140 0 0 1 260 118V${GROUND}Z`;
    let s = `<defs><clipPath id="${p}a"><path d="${arch}"/></clipPath><radialGradient id="${p}gl" cx=".5" cy=".35" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#1c1622"/>`;
    // sillares de piedra
    let st = '';
    for (let y = 0; y < GROUND; y += 20) for (let x = (y / 20) % 2 ? -15 : 0; x < W; x += 30) st += `M${x} ${y}h30v20`;
    s += `<path d="${st}" fill="none" stroke="#2c2434" stroke-width="1.5"/>`;
    // ventana: cristales de Voronoi con plomo
    const sites = jitterGrid(rnd, 40, 12, 220, GROUND - 12, 6, 8, 0.95);
    const cells = voronoi(sites, 40, 0, 260, GROUND);
    let glass = '';
    let lead = '';
    cells.forEach((poly, i) => {
      const y = sites[i][1] / GROUND;
      // más azules arriba, más cálidos abajo
      const pool = y < 0.45 ? ['#1e5aa8', '#2aa0b8', '#6a2c8c', '#1e5aa8', '#e2a52a'] : ['#b8222a', '#e2a52a', '#2f8a4a', '#d65a1f', '#1e5aa8'];
      const d = polyD(poly);
      glass += `<path d="${d}" fill="${pool[Math.floor(rnd() * pool.length)]}"/>`;
      lead += d;
    });
    s += `<g clip-path="url(#${p}a)">${glass}<rect width="${W}" height="${W}" fill="url(#${p}gl)"/><path d="${lead}" fill="none" stroke="#141014" stroke-width="3.4" stroke-linejoin="round"/><path d="M150 12V${GROUND}M40 128H260" stroke="#141014" stroke-width="5"/><circle cx="150" cy="80" r="30" fill="none" stroke="#141014" stroke-width="5"/></g>`;
    s += `<path d="${arch}" fill="none" stroke="#3a3044" stroke-width="10"/><path d="${arch}" fill="none" stroke="#141014" stroke-width="4"/>`;
    // suelo de piedra con charcos de luz de colores
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#2a2230"/><rect y="${GROUND}" width="${W}" height="6" fill="#3a3044"/>`;
    const pools = ['#1e5aa8', '#b8222a', '#e2a52a', '#2f8a4a'];
    for (let i = 0; i < 4; i++) s += `<ellipse cx="${n(70 + i * 55 + rnd() * 15)}" cy="${n(GROUND + 26 + rnd() * 20)}" rx="${n(20 + rnd() * 12)}" ry="7" fill="${pools[i]}" opacity=".35"/>`;
    return s;
  },

  bauhaus(p, rnd) {
    let s = `<rect width="${W}" height="${W}" fill="#efe7d4"/>`;
    // tira de película arriba
    s += `<rect y="10" width="${W}" height="46" fill="#151515"/>`;
    let holes = '';
    for (let x = 4; x < W; x += 14) holes += `<rect x="${x}" y="14" width="7" height="5" rx="1" fill="#efe7d4"/><rect x="${x}" y="47" width="7" height="5" rx="1" fill="#efe7d4"/>`;
    s += holes;
    const icons = [
      (x) => `<circle cx="${x + 30}" cy="35" r="9" fill="#d7262b"/>`,
      (x) => `<rect x="${x + 21}" y="26" width="18" height="18" fill="#1f4e9c"/>`,
      (x) => `<path d="M${x + 20} 44L${x + 30} 26L${x + 40} 44Z" fill="#f2b705"/>`,
    ];
    for (let i = 0; i < 5; i++) {
      const x = -20 + i * 68 + (rnd() * 6);
      s += `<rect x="${n(x)}" y="22" width="60" height="25" fill="#2b2b2b"/>${icons[(i + Math.floor(rnd() * 3)) % 3](n(x))}`;
    }
    // composición: círculo rojo, rectángulo azul, triángulo amarillo, barras negras
    const left = rnd() < 0.5;
    s += `<circle cx="${left ? 92 : 208}" cy="148" r="64" fill="#d7262b"/>`;
    s += `<rect x="${left ? 196 : 26}" y="78" width="78" height="${GROUND - 78}" fill="#1f4e9c"/>`;
    s += `<path d="M${left ? 170 : 40} ${GROUND}L${left ? 290 : 160} ${GROUND}L${left ? 230 : 100} 132Z" fill="#f2b705"/>`;
    s += `<rect x="0" y="${n(96 + rnd() * 20)}" width="${W}" height="7" fill="#151515" transform="rotate(${left ? -14 : 14} 150 120)"/>`;
    s += '<text x="28" y="230" transform="rotate(-90 28 230)" font-family="Futura,\'Century Gothic\',\'Avenir Next\',\'Helvetica Neue\',Arial,sans-serif" font-weight="900" font-size="30" letter-spacing="2" fill="#151515">BAUHAUS</text>';
    s += `<text x="292" y="${GROUND - 8}" text-anchor="end" font-family="Futura,'Century Gothic','Helvetica Neue',Arial,sans-serif" font-weight="900" font-size="26" fill="#151515">1923</text>`;
    // suelo
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#e2d6bb"/><rect y="${GROUND}" width="${W}" height="5" fill="#151515"/><rect x="${left ? 220 : 20}" y="${GROUND + 20}" width="60" height="10" fill="#1f4e9c"/>`;
    return s;
  },

  manuscript(p, rnd) {
    const letters = 'OASMTE';
    const L = letters[Math.floor(rnd() * letters.length)];
    let s = `<defs><filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .32  0 0 0 0 .14  0 0 0 1.2 -.62"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#e9d6aa"/>`;
    // escena en mosaico de teselas (cielo, estrellas doradas, colinas)
    const x0 = 24;
    const y0 = 84;
    const T = 9;
    let mos = '';
    const hill = (x) => 196 + Math.sin(x / 38 + rnd() * 0.02) * 14 + Math.sin(x / 17) * 5;
    for (let y = y0; y < 276; y += T) {
      for (let x = x0; x < 276; x += T) {
        let c;
        if (y + T > 268) c = ['#7a4a26', '#8a5a30', '#6e4220'][Math.floor(rnd() * 3)];
        else if (y > hill(x)) c = ['#2e6b3a', '#3a7d44', '#25592f'][Math.floor(rnd() * 3)];
        else {
          const k = (y - y0) / 120;
          c = rnd() < 0.05 && k < 0.7 ? '#e0b64a' : k < 0.35 ? ['#1d3f8f', '#22489d', '#193780'][Math.floor(rnd() * 3)] : ['#3a64b0', '#4672bb', '#3159a3'][Math.floor(rnd() * 3)];
        }
        mos += `<rect x="${x + 0.6}" y="${y + 0.6}" width="${T - 1.2}" height="${T - 1.2}" fill="${c}"/>`;
      }
    }
    s += `<rect x="${x0 - 2}" y="${y0 - 2}" width="${276 - x0 + 4}" height="${276 - y0 + 2}" fill="#3b2412"/>${mos}`;
    s += `<rect x="${x0 - 3}" y="${y0 - 3}" width="${276 - x0 + 6}" height="${276 - y0 + 4}" fill="none" stroke="#c99a2e" stroke-width="3"/>`;
    // inicial capitular dorada
    s += '<rect x="22" y="20" width="52" height="54" fill="#1d3f8f" stroke="#c99a2e" stroke-width="3"/><path d="M26 70C40 56 30 38 46 30" fill="none" stroke="#2e6b3a" stroke-width="2"/><circle cx="46" cy="30" r="3" fill="#b3261e"/>';
    s += `<text x="48" y="64" text-anchor="middle" font-family="'Cinzel','Trajan Pro','Book Antiqua',Palatino,Georgia,serif" font-weight="700" font-size="44" fill="#e0b64a" stroke="#7a5a16" stroke-width=".8">${L}</text>`;
    // dos columnas de texto (renglones de «palabras»), la primera con rúbrica roja
    let txt = '';
    for (const [cx0, cx1] of [[84, 176], [186, 278]]) {
      for (let r = 0; r < 6; r++) {
        let x = cx0;
        const y = 24 + r * 9;
        while (x < cx1 - 6) {
          const w = Math.min(cx1 - x, 6 + rnd() * 16);
          txt += `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="2.6" rx="1" fill="${r === 0 && x === cx0 ? '#b3261e' : '#3b2412'}" opacity=".78"/>`;
          x += w + 3;
        }
      }
    }
    s += txt;
    // marco: oro, filete rojo y medallones en las esquinas
    s += `<rect x="6" y="6" width="${W - 12}" height="${W - 12}" fill="none" stroke="#c99a2e" stroke-width="6"/><rect x="13" y="13" width="${W - 26}" height="${W - 26}" fill="none" stroke="#b3261e" stroke-width="1.5"/>`;
    for (const [x, y] of [[9, 9], [291, 9], [9, 291], [291, 291]]) s += `<circle cx="${x}" cy="${y}" r="8" fill="#c99a2e"/><circle cx="${x}" cy="${y}" r="3.5" fill="#b3261e"/>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  glitch(p, rnd) {
    // degradado tramado: cada banda se cubre con 25/50/75 % de píxeles del color siguiente
    const cols = ['#120a2a', '#2a0f55', '#5a1478', '#a21a8a', '#ff2bd6'];
    const dens = [[[0, 0]], [[0, 0], [3, 3]], [[0, 0], [3, 3], [3, 0]]];
    let s = '<defs>';
    for (let i = 1; i < cols.length; i++) {
      dens.forEach((pts, k) => {
        s += `<pattern id="${p}d${i}${k}" width="6" height="6" patternUnits="userSpaceOnUse">${pts.map(([x, y]) => `<rect x="${x}" y="${y}" width="3" height="3" fill="${cols[i]}"/>`).join('')}</pattern>`;
      });
    }
    s += `<pattern id="${p}sl" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1.2" fill="#000" opacity=".35"/></pattern></defs>`;
    const band = GROUND / (cols.length - 1);
    for (let i = 0; i < cols.length - 1; i++) {
      const y = i * band;
      s += `<rect y="${n(y)}" width="${W}" height="${n(band + 1)}" fill="${cols[i]}"/>`;
      for (let k = 0; k < 3; k++) s += `<rect y="${n(y + (k * band) / 3)}" width="${W}" height="${n(band / 3 + 0.5)}" fill="url(#${p}d${i + 1}${k})"/>`;
    }
    // suelo: rejilla en perspectiva con aberración cromática
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#0b0b14"/>`;
    let grid = '';
    for (let i = 0; i <= 12; i++) grid += `M${150 + (i - 6) * 9} ${GROUND}L${150 + (i - 6) * 70} ${W}`;
    for (let j = 1; j < 6; j++) {
      const y = GROUND + (W - GROUND) * (j / 6) ** 1.7;
      grid += `M0 ${n(y)}H${W}`;
    }
    s += `<path d="${grid}" stroke="#ff2b5e" stroke-width="1" fill="none" opacity=".7" transform="translate(-1.5 0)"/><path d="${grid}" stroke="#2bf3ff" stroke-width="1" fill="none" opacity=".8" transform="translate(1.5 0)"/><path d="M0 ${GROUND}H${W}" stroke="#fff" stroke-width="1.5"/>`;
    // bloques de error
    let blocks = '';
    const bc = ['#2bf3ff', '#ff2bd6', '#ffffff', '#f2ff2b'];
    for (let i = 0; i < 9; i++) blocks += `<rect x="${n(rnd() * W - 30)}" y="${n(rnd() * GROUND)}" width="${n(20 + rnd() * 90)}" height="${n(2 + rnd() * 7)}" fill="${bc[Math.floor(rnd() * bc.length)]}" opacity="${n(0.25 + rnd() * 0.5)}"/>`;
    s += blocks;
    const ty = 40 + rnd() * 30;
    const font = 'font-family="\'Courier New\',ui-monospace,monospace" font-weight="700" font-size="22" letter-spacing="3"';
    s += `<text x="148" y="${n(ty)}" ${font} text-anchor="middle" fill="#ff2b5e" opacity=".85">7OTS.EXE</text><text x="152" y="${n(ty)}" ${font} text-anchor="middle" fill="#2bf3ff" opacity=".85">7OTS.EXE</text><text x="150" y="${n(ty)}" ${font} text-anchor="middle" fill="#fff">7OTS.EXE</text>`;
    s += `<rect width="${W}" height="${W}" fill="url(#${p}sl)"/>`;
    return s;
  },

  ink(p, rnd) {
    let s = `<defs><filter id="${p}w" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .38  0 0 0 0 .34  0 0 0 .9 -.52"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#f7f3ea"/>`;
    // montañas: dos crestas a línea, la lejana más tenue
    const ridge = (base, amp, k) => {
      let d = `M-10 ${base}`;
      for (let x = 0; x <= W + 10; x += 18 + rnd() * 14) d += `L${n(x)} ${n(base - amp * (0.3 + rnd() * 0.7) * (0.6 + 0.4 * Math.sin(x / (40 + k * 20))))}`;
      return d;
    };
    let lines = `<path d="${ridge(170, 70, 1)}" stroke="#b4ada0" stroke-width="1.2"/><path d="${ridge(205, 55, 2)}" stroke="#7d776c" stroke-width="1.6"/>`;
    // sol a línea y pájaros
    lines += `<circle cx="${n(215 + rnd() * 40)}" cy="${n(55 + rnd() * 15)}" r="20" stroke="#8d877c" stroke-width="1.3"/>`;
    for (let i = 0; i < 3; i++) {
      const x = 60 + rnd() * 120;
      const y = 40 + rnd() * 40;
      lines += `<path d="M${n(x - 6)} ${n(y)}q3 -4 6 0q3 -4 6 0" stroke="#5c574f" stroke-width="1.1"/>`;
    }
    // ola ligera
    lines += '<path d="M-5 238C20 206 60 192 92 204C110 211 112 228 98 232C90 220 76 222 76 232" stroke="#6f6a61" stroke-width="1.6"/><path d="M110 236C140 226 170 228 196 238M200 232C230 222 262 224 300 236" stroke="#9a948a" stroke-width="1.2"/>';
    // suelo: una línea y unos trazos de sombreado
    lines += `<path d="M0 ${GROUND + 2}H${W}" stroke="#3b3833" stroke-width="1.8"/>`;
    let hatch = '';
    for (let i = 0; i < 22; i++) {
      const x = rnd() * W;
      const y = GROUND + 10 + rnd() * 50;
      hatch += `M${n(x)} ${n(y)}l${n(10 + rnd() * 14)} -3`;
    }
    lines += `<path d="${hatch}" stroke="#8d877c" stroke-width="1"/>`;
    s += `<g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#${p}w)">${lines}</g>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  pop(p, rnd) {
    const word = ['POW!', 'WOW!', 'ZAP!', 'BAM!', 'WHAAM!'][Math.floor(rnd() * 5)];
    let s = `<defs><pattern id="${p}d" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="2.6" fill="#e4002b" opacity=".55"/></pattern>`
      + `<pattern id="${p}w" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4" cy="4" r="2.2" fill="#fff" opacity=".8"/></pattern></defs>`;
    // rayos amarillos alternos desde detrás del ot
    s += `<rect width="${W}" height="${W}" fill="#ffe14a"/>`;
    let rays = '';
    const cx = 150;
    const cy = 150;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2;
      const a1 = a0 + Math.PI / 16;
      rays += `M${cx} ${cy}L${n(cx + Math.cos(a0) * 320)} ${n(cy + Math.sin(a0) * 320)}L${n(cx + Math.cos(a1) * 320)} ${n(cy + Math.sin(a1) * 320)}Z`;
    }
    s += `<path d="${rays}" fill="#ffd400"/><rect width="${W}" height="${W}" fill="url(#${p}d)" opacity=".7"/>`;
    // estallido con la onomatopeya
    const bx = 68 + rnd() * 12;
    const by = 66;
    let burst = '';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = i % 2 ? 30 : 56 + rnd() * 10;
      burst += `${i ? 'L' : 'M'}${n(bx + Math.cos(a) * r * 1.25)} ${n(by + Math.sin(a) * r)}`;
    }
    s += `<path d="${burst}Z" fill="#e4002b" stroke="#111" stroke-width="4" stroke-linejoin="miter"/>`;
    s += `<path d="${burst}Z" fill="#fff36b" transform="translate(${n(bx * 0.38)} ${n(by * 0.38)}) scale(.62)"/>`;
    const fs = word.length > 4 ? 22 : 28;
    s += `<text x="${n(bx)}" y="${n(by + fs * 0.36)}" text-anchor="middle" transform="rotate(-10 ${n(bx)} ${n(by)})" font-family="Impact,'Arial Black','Helvetica Neue',sans-serif" font-weight="900" font-size="${fs}" fill="#0072ce" stroke="#111" stroke-width="1.6" paint-order="stroke">${word}</text>`;
    // globo de diálogo arriba a la derecha
    s += '<path d="M196 22H284Q292 22 292 30V58Q292 66 284 66H236L222 80L224 66H196Q188 66 188 58V30Q188 22 196 22Z" fill="#fff" stroke="#111" stroke-width="3"/>';
    s += '<text x="240" y="40" text-anchor="middle" font-family="\'Comic Sans MS\',\'Comic Neue\',\'Chalkboard SE\',sans-serif" font-weight="700" font-size="12" fill="#111">I\'M AN OT,</text><text x="240" y="56" text-anchor="middle" font-family="\'Comic Sans MS\',\'Comic Neue\',\'Chalkboard SE\',sans-serif" font-weight="700" font-size="12" fill="#111">DARLING!</text>';
    // suelo azul con trama blanca, y el marco de la viñeta
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#0072ce"/><rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="url(#${p}w)" opacity=".5"/><path d="M0 ${GROUND}H${W}" stroke="#111" stroke-width="4"/>`;
    s += `<rect x="3" y="3" width="${W - 6}" height="${W - 6}" fill="none" stroke="#111" stroke-width="6"/>`;
    return s;
  },

  watercolor(p, rnd) {
    const sd = () => Math.floor(rnd() * 900);
    let s = `<defs><filter id="${p}w" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="3" seed="${sd()}"/><feDisplacementMap in="SourceGraphic" scale="16" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.1" result="b"/><feGaussianBlur in="d" stdDeviation="3.5" result="eb"/><feComposite in="d" in2="eb" operator="out" result="e"/><feColorMatrix in="e" values=".6 0 0 0 0  0 .6 0 0 0  0 0 .6 0 0  0 0 0 .5 0" result="ed"/><feMerge><feMergeNode in="b"/><feMergeNode in="ed"/></feMerge></filter>`
      + `<filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" seed="${sd()}"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .38  0 0 0 0 .3  0 0 0 1.1 -.6"/></filter>`
      + `<linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fa3d6"/><stop offset=".7" stop-color="#a9cbe8"/><stop offset="1" stop-color="#a9cbe8" stop-opacity="0"/></linearGradient></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#fbf7ee"/>`;
    const F = `filter="url(#${p}w)"`;
    // aguadas: cielo, nubes sin pintar, sol corrido
    s += `<g ${F}><rect x="10" y="10" width="280" height="170" fill="url(#${p}sky)" opacity=".85"/></g>`;
    for (let k = 0; k < 3; k++) {
      const x = 30 + k * 90 + rnd() * 30;
      const y = 40 + rnd() * 50;
      s += `<g ${F} fill="#fbf7ee"><ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(22 + rnd() * 12)}" ry="11"/><ellipse cx="${n(x + 16)}" cy="${n(y - 8)}" rx="16" ry="12"/></g>`;
    }
    s += `<g ${F}><circle cx="${n(220 + rnd() * 40)}" cy="${n(54 + rnd() * 16)}" r="22" fill="#f4b860" opacity=".8"/></g>`;
    // colinas en capas (cada una más cálida y opaca)
    const hill = (base, amp, col, op) => {
      let d = `M0 ${W}V${base}`;
      for (let x = 0; x <= W; x += 30) d += `Q${x + 15} ${n(base - amp * (0.4 + rnd() * 0.6))} ${x + 30} ${n(base - rnd() * amp * 0.3)}`;
      return `<g ${F}><path d="${d}V${W}Z" fill="${col}" opacity="${op}"/></g>`;
    };
    s += hill(170, 40, '#7d8fc8', 0.7) + hill(205, 34, '#5fae7a', 0.72) + hill(GROUND, 18, '#a4c75a', 0.8);
    s += `<g ${F}><rect x="10" y="${GROUND + 4}" width="280" height="${W - GROUND - 14}" fill="#c49a66" opacity=".65"/></g>`;
    // salpicaduras
    const spl = ['#d35d6e', '#6fa3d6', '#e7a33e', '#7fb38a'];
    let sp = '';
    for (let i = 0; i < 12; i++) sp += `<circle cx="${n(rnd() * W)}" cy="${n(rnd() * W)}" r="${n(0.8 + rnd() * 2.6)}" fill="${spl[i % 4]}" opacity=".55"/>`;
    s += sp;
    // papel: grano y margen sin pintar
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)" opacity=".7"/>`;
    s += `<g ${F}><path d="M-20 -20H320V320H-20ZM12 12V288H288V12Z" fill="#fbf7ee" fill-rule="evenodd"/></g>`;
    return s;
  },

  pixel(p, rnd) {
    // sprites de texto: cada carácter es un color, '.' es transparente (se agrupan tiras horizontales)
    const sprite = (rows, x0, y0, k, cols) => {
      let o = '';
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length;) {
          const ch = row[x];
          let e = x + 1;
          while (e < row.length && row[e] === ch) e++;
          if (cols[ch]) o += `<rect x="${n(x0 + x * k)}" y="${n(y0 + y * k)}" width="${(e - x) * k}" height="${k}" fill="${cols[ch]}"/>`;
          x = e;
        }
      });
      return o;
    };
    let s = `<rect width="${W}" height="${W}" fill="#5c94fc"/>`;
    const cloud = ['.....wwww.......', '...wwwwwwww.....', '..wwwwwwwwwwww..', '.wwwwwwwwwwwwww.', 'wwwwwwwwwwwwwwww', 'wwwbwwwwwwwbwwww', '.wwbbbwwwwbbbww.', '..bbbbbbbbbbbb..'];
    for (let i = 0; i < 2; i++) s += sprite(cloud, Math.round((20 + i * 150 + rnd() * 40) / 4) * 4, 28 + Math.round(rnd() * 6) * 4, 4, { w: '#fcfcfc', b: '#3cbcfc' });
    // colina escalonada con su contorno
    const hx = 40 + Math.round(rnd() * 8) * 5;
    let hill = '';
    for (let x = -60; x <= 60; x += 6) {
      const h = Math.round(Math.sqrt(Math.max(0, 1 - (x / 64) ** 2)) * 70 / 6) * 6;
      hill += `<rect x="${hx + x}" y="${GROUND - h}" width="6" height="${h}" fill="#00a800"/><rect x="${hx + x}" y="${GROUND - h}" width="6" height="3" fill="#005800"/>`;
    }
    s += hill + `<rect x="${hx - 14}" y="${GROUND - 40}" width="4" height="10" fill="#005800"/><rect x="${hx + 10}" y="${GROUND - 50}" width="4" height="10" fill="#005800"/>`;
    // ladrillos y bloque «?»
    const qx = 170 + Math.round(rnd() * 4) * 20;
    const brick = (x, y) => `<rect x="${x}" y="${y}" width="20" height="20" fill="#c84c0c"/><path d="M${x} ${y + 1}H${x + 20}M${x} ${y + 10}H${x + 20}M${x + 10} ${y + 1}V${y + 10}M${x + 4} ${y + 10}V${y + 20}M${x + 16} ${y + 10}V${y + 20}" stroke="#000" stroke-width="2"/>`;
    s += brick(qx - 20, 150) + brick(qx + 20, 150);
    const q = ['..wwww..', '.ww..ww.', '.....ww.', '....ww..', '...ww...', '...ww...', '........', '...ww...'];
    s += `<rect x="${qx}" y="150" width="20" height="20" fill="#f8b800"/><rect x="${qx}" y="150" width="20" height="20" fill="none" stroke="#000" stroke-width="2"/>${sprite(q, qx + 2, 152, 2, { w: '#a81000' })}`;
    s += `<rect x="${qx + 1}" y="151" width="2" height="2" fill="#000"/><rect x="${qx + 17}" y="151" width="2" height="2" fill="#000"/><rect x="${qx + 1}" y="167" width="2" height="2" fill="#000"/><rect x="${qx + 17}" y="167" width="2" height="2" fill="#000"/>`;
    // moneda
    const coin = ['.yy.', 'yowy', 'yowy', 'yowy', 'yowy', '.yy.'];
    s += sprite(coin, qx + 6, 126, 2, { y: '#f8b800', o: '#ac7c00', w: '#fcfcfc' });
    // tubería verde
    const px = qx > 200 ? 18 : 246;
    s += `<rect x="${px + 4}" y="${GROUND - 34}" width="28" height="34" fill="#00a800"/><rect x="${px + 8}" y="${GROUND - 34}" width="5" height="34" fill="#58d854"/><rect x="${px + 26}" y="${GROUND - 34}" width="4" height="34" fill="#005800"/>`;
    s += `<rect x="${px}" y="${GROUND - 48}" width="36" height="14" fill="#00a800" stroke="#000" stroke-width="2"/><rect x="${px + 4}" y="${GROUND - 46}" width="5" height="10" fill="#58d854"/>`;
    // suelo de bloques
    let g = '';
    for (let y = GROUND; y < W; y += 20) {
      for (let x = 0; x < W; x += 20) {
        g += `<rect x="${x}" y="${y}" width="20" height="20" fill="#c84c0c"/><path d="M${x} ${y + 19}V${y}H${x + 19}" fill="none" stroke="#fcbcb0" stroke-width="2"/><path d="M${x + 1} ${y + 19}H${x + 19}V${y + 1}" fill="none" stroke="#000" stroke-width="2"/>`;
      }
    }
    s += g;
    // marcador
    const font = 'font-family="\'Press Start 2P\',\'Courier New\',ui-monospace,monospace" font-weight="700" font-size="11" fill="#fcfcfc"';
    s += `<text x="14" y="18" ${font}>OT×07</text><text x="150" y="18" text-anchor="middle" ${font}>${String(Math.floor(rnd() * 90 + 10) * 100).padStart(6, '0')}</text><text x="286" y="18" text-anchor="end" ${font}>WORLD 1-7</text>`;
    return s;
  },

  synthwave(p, rnd) {
    const HZ = 182;
    let s = `<defs><linearGradient id="${p}sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${HZ}"><stop offset="0" stop-color="#0d0221"/><stop offset=".55" stop-color="#3a0f6e"/><stop offset="1" stop-color="#c2187a"/></linearGradient>`
      + `<linearGradient id="${p}sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe12b"/><stop offset=".5" stop-color="#ff8a2b"/><stop offset="1" stop-color="#ff2b8a"/></linearGradient>`
      + `<linearGradient id="${p}chr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f6ff"/><stop offset=".48" stop-color="#7fb8ff"/><stop offset=".52" stop-color="#2a1050"/><stop offset="1" stop-color="#ff7ae0"/></linearGradient>`
      + `<filter id="${p}gl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    s += `<rect width="${W}" height="${HZ}" fill="url(#${p}sky)"/>`;
    let st = '';
    for (let i = 0; i < 34; i++) st += `<circle cx="${n(rnd() * W)}" cy="${n(rnd() * HZ * 0.6)}" r="${n(0.4 + rnd() * 1.1)}"/>`;
    s += `<g fill="#fff" opacity=".85">${st}</g>`;
    // sol retro con franjas recortadas (rellenas con el mismo cielo)
    const sx = 150;
    s += `<circle cx="${sx}" cy="${HZ - 30}" r="66" fill="url(#${p}sun)"/>`;
    let bars = '';
    for (let i = 0; i < 6; i++) bars += `<rect x="${sx - 70}" y="${n(HZ - 52 + i * 9.5)}" width="140" height="${n(1.5 + i * 1.1)}"/>`;
    s += `<g fill="url(#${p}sky)">${bars}</g>`;
    // montañas de alambre a los lados
    const mtn = (x0, x1, top) => {
      let d = `M${x0} ${HZ}`;
      const k = 6;
      for (let i = 1; i < k; i++) d += `L${n(x0 + ((x1 - x0) * i) / k)} ${n(HZ - (i % 2 ? top * (0.6 + rnd() * 0.4) : top * (0.2 + rnd() * 0.3)))}`;
      return `${d}L${x1} ${HZ}Z`;
    };
    const mt = mtn(-10, 110, 60) + mtn(190, 310, 54);
    s += `<path d="${mt}" fill="#1a0838" stroke="#2bf3ff" stroke-width="1.3" stroke-linejoin="round" filter="url(#${p}gl)"/>`;
    // suelo: rejilla magenta en perspectiva
    s += `<rect y="${HZ}" width="${W}" height="${W - HZ}" fill="#12002a"/>`;
    let grid = '';
    for (let i = -10; i <= 10; i++) grid += `M${150 + i * 14} ${HZ}L${150 + i * 90} ${W}`;
    for (let j = 1; j < 9; j++) grid += `M0 ${n(HZ + (W - HZ) * (j / 9) ** 1.8)}H${W}`;
    s += `<path d="${grid}" stroke="#ff2bd6" stroke-width="1.2" fill="none" filter="url(#${p}gl)"/><path d="M0 ${HZ}H${W}" stroke="#ffb3f2" stroke-width="2" filter="url(#${p}gl)"/>`;
    // palmeras en silueta
    const palm = (x, h, flip) => {
      const top = HZ + 6 - h;
      const lean = flip ? -14 : 14;
      let o = `<path d="M${x} ${HZ + 6}Q${x + lean * 0.3} ${n(top + h * 0.5)} ${x + lean} ${top}" fill="none" stroke="#0a0014" stroke-width="5" stroke-linecap="round"/>`;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI + (i / 5) * Math.PI + (rnd() - 0.5) * 0.3;
        const ex = x + lean + Math.cos(a) * 34;
        const ey = top + Math.sin(a) * 18 + 16;
        o += `<path d="M${x + lean} ${top}Q${n((x + lean + ex) / 2)} ${n(top - 12)} ${n(ex)} ${n(ey)}" fill="none" stroke="#0a0014" stroke-width="4" stroke-linecap="round"/>`;
      }
      return o;
    };
    s += palm(26, 120, false) + palm(278, 104, true);
    // rótulo cromado
    s += `<text x="150" y="40" text-anchor="middle" font-family="'Brush Script MT','Segoe Script',cursive" font-style="italic" font-weight="700" font-size="30" fill="#ff2bd6" filter="url(#${p}gl)" transform="rotate(-6 150 36)">Seven</text>`;
    s += `<text x="150" y="68" text-anchor="middle" font-family="Impact,'Arial Black',sans-serif" font-style="italic" font-size="26" letter-spacing="4" fill="url(#${p}chr)" stroke="#fff" stroke-width=".6">OTS·1987</text>`;
    return s;
  },

  nouveau(p, rnd) {
    let s = `<defs><filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .3  0 0 0 0 .18  0 0 0 1 -.6"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#e9dbb8"/>`;
    // panel arqueado salvia
    const arch = `M30 ${GROUND}V120A120 120 0 0 1 270 120V${GROUND}Z`;
    s += `<path d="${arch}" fill="#a8b48c"/>`;
    // halo de Mucha: anillos dorados, cuentas y radios
    const hx = 150;
    const hy = 104;
    s += `<circle cx="${hx}" cy="${hy}" r="98" fill="#d9b98a"/><circle cx="${hx}" cy="${hy}" r="88" fill="none" stroke="#c9a24a" stroke-width="4"/><circle cx="${hx}" cy="${hy}" r="74" fill="#efe2c4"/>`;
    let sp = '';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      sp += `M${n(hx + Math.cos(a) * 20)} ${n(hy + Math.sin(a) * 20)}L${n(hx + Math.cos(a) * 72)} ${n(hy + Math.sin(a) * 72)}`;
    }
    s += `<path d="${sp}" stroke="#c9a24a" stroke-width="1" opacity=".45"/>`;
    let beads = '';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      beads += `<circle cx="${n(hx + Math.cos(a) * 81)}" cy="${n(hy + Math.sin(a) * 81)}" r="${i % 2 ? 2.2 : 3.6}" fill="${i % 2 ? '#6e4a5e' : '#c9a24a'}"/>`;
    }
    s += beads + `<circle cx="${hx}" cy="${hy}" r="74" fill="none" stroke="#4a3324" stroke-width="1.5"/>`;
    // tallos en latigazo a ambos lados, con hojas y flores
    const vine = (sx) => {
      const m = sx < 150 ? 1 : -1;
      const x = sx;
      let o = `<path d="M${x} ${GROUND}C${x + 30 * m} 200 ${x - 22 * m} 150 ${x + 12 * m} 110S${x + 40 * m} 50 ${x + 6 * m} 28" fill="none" stroke="#4f7a74" stroke-width="3.2" stroke-linecap="round"/>`;
      for (const [lx, ly, a] of [[x + 14 * m, 200, 40], [x - 2 * m, 160, -30], [x + 20 * m, 120, 50], [x + 16 * m, 70, -40]]) {
        o += `<ellipse cx="${n(lx)}" cy="${ly}" rx="11" ry="4.5" fill="#8a9a6b" stroke="#4a3324" stroke-width="1" transform="rotate(${a * m} ${n(lx)} ${ly})"/>`;
      }
      for (const [fx, fy] of [[x + 6 * m, 28], [x + 26 * m, 96]]) {
        let pet = '';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + rnd() * 0.3;
          pet += `<circle cx="${n(fx + Math.cos(a) * 6)}" cy="${n(fy + Math.sin(a) * 6)}" r="5" fill="#c98a7a" stroke="#4a3324" stroke-width=".8"/>`;
        }
        o += `${pet}<circle cx="${n(fx)}" cy="${fy}" r="3.2" fill="#c9a24a"/>`;
      }
      return o;
    };
    s += vine(20) + vine(280);
    // marco doble de arco y friso de mosaico
    s += `<path d="${arch}" fill="none" stroke="#4a3324" stroke-width="3"/><path d="M36 ${GROUND}V121A114 114 0 0 1 264 121V${GROUND}" fill="none" stroke="#c9a24a" stroke-width="1.5"/>`;
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#8a9a6b"/><rect y="${GROUND}" width="${W}" height="4" fill="#4a3324"/>`;
    let tiles = '';
    for (let x = 6; x < W; x += 24) tiles += `<rect x="${x}" y="${GROUND + 14}" width="16" height="16" rx="3" fill="none" stroke="#c9a24a" stroke-width="1.6"/><circle cx="${x + 8}" cy="${GROUND + 22}" r="3" fill="#c98a7a"/>`;
    s += tiles + `<rect y="${GROUND + 40}" width="${W}" height="2" fill="#c9a24a"/>`;
    s += `<rect x="5" y="5" width="${W - 10}" height="${W - 10}" rx="10" fill="none" stroke="#4a3324" stroke-width="3"/><rect x="10" y="10" width="${W - 20}" height="${W - 20}" rx="7" fill="none" stroke="#c9a24a" stroke-width="1.2"/>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  cubism(p, rnd) {
    let s = `<defs><linearGradient id="${p}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient><linearGradient id="${p}b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient><linearGradient id="${p}c" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".6" stop-color="#000" stop-opacity="0"/></linearGradient>`
      + `<filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .24  0 0 0 0 .18  0 0 0 1 -.6"/></filter></defs>`;
    // planos facetados de Voronoi con su propia luz
    const sites = jitterGrid(rnd, 0, 0, W, W, 5, 5, 1.2);
    const cells = voronoi(sites, 0, 0, W, W);
    const pal = ['#c8a046', '#7a5232', '#7c7a46', '#4e6a86', '#b5583a', '#e6d6b0', '#8aa0a8', '#c8a046', '#e6d6b0'];
    let lines = '';
    cells.forEach((poly) => {
      const d = polyD(poly);
      s += `<path d="${d}" fill="${pal[Math.floor(rnd() * pal.length)]}"/><path d="${d}" fill="url(#${p}${'abc'[Math.floor(rnd() * 3)]})"/>`;
      lines += d;
    });
    s += `<path d="${lines}" fill="none" stroke="#2e2a26" stroke-width="2" stroke-linejoin="miter"/>`;
    // líneas de fuga que cruzan todo
    let cut = '';
    for (let i = 0; i < 4; i++) cut += `M${n(rnd() * W)} 0L${n(rnd() * W)} ${W}`;
    s += `<path d="${cut}" stroke="#2e2a26" stroke-width="1.4" opacity=".7"/>`;
    // guitarra fragmentada (mitad desplazada) y recorte de periódico
    const gx = 52;
    const gy = 120;
    const gtr = `M${gx} ${gy - 46}C${gx + 26} ${gy - 46} ${gx + 26} ${gy - 12} ${gx + 14} ${gy}C${gx + 34} ${gy + 14} ${gx + 30} ${gy + 56} ${gx} ${gy + 56}C${gx - 30} ${gy + 56} ${gx - 34} ${gy + 14} ${gx - 14} ${gy}C${gx - 26} ${gy - 12} ${gx - 26} ${gy - 46} ${gx} ${gy - 46}Z`;
    s += `<defs><clipPath id="${p}gl"><rect x="0" y="0" width="${gx}" height="${W}"/></clipPath><clipPath id="${p}gr"><rect x="${gx}" y="0" width="${W}" height="${W}"/></clipPath></defs>`;
    s += `<g clip-path="url(#${p}gl)"><path d="${gtr}" fill="#b07a3a" stroke="#2e2a26" stroke-width="2.4"/></g>`;
    s += `<g clip-path="url(#${p}gr)" transform="translate(6 -10)"><path d="${gtr}" fill="#7a5232" stroke="#2e2a26" stroke-width="2.4"/><path d="M${gx + 4} ${gy - 80}V${gy + 40}M${gx + 8} ${gy - 80}V${gy + 40}" stroke="#e6d6b0" stroke-width="1"/></g>`;
    s += `<circle cx="${gx}" cy="${gy + 16}" r="10" fill="#2e2a26"/><rect x="${gx - 5}" y="${gy - 110}" width="10" height="66" fill="#3a2e22"/>`;
    const rot = -12 + rnd() * 24;
    s += `<g transform="rotate(${n(rot)} 238 52)"><rect x="196" y="30" width="86" height="44" fill="#e9e1cc" stroke="#2e2a26" stroke-width="1.2"/><text x="239" y="54" text-anchor="middle" font-family="'Bodoni 72',Didot,'Times New Roman',serif" font-weight="700" font-size="20" fill="#2e2a26">JOUR</text><path d="M202 62H276M202 67H264" stroke="#2e2a26" stroke-width="1.6" opacity=".6"/></g>`;
    // mesa en escorzo
    s += `<path d="M-10 ${GROUND - 6}L310 ${GROUND + 6}L310 ${W}L-10 ${W}Z" fill="#7a5232"/><path d="M-10 ${GROUND - 6}L310 ${GROUND + 6}L310 ${W}L-10 ${W}Z" fill="url(#${p}c)"/>`;
    s += `<path d="M-10 ${GROUND + 14}L310 ${GROUND + 30}M-10 ${GROUND + 34}L310 ${GROUND + 54}M140 ${GROUND}L120 ${W}" stroke="#2e2a26" stroke-width="1.5" fill="none"/><path d="M-10 ${GROUND - 6}L310 ${GROUND + 6}" stroke="#2e2a26" stroke-width="3"/>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  crayon(p, rnd) {
    const sd = Math.floor(rnd() * 900);
    let s = `<defs><filter id="${p}w" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="${sd}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".9 .25" numOctaves="2" seed="${sd + 1}" result="wx"/><feColorMatrix in="wx" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 2.3" result="wa"/><feComposite in="d" in2="wa" operator="in"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#fffdf6"/>`;
    const zig = (x0, x1, y0, y1, step) => {
      let d = '';
      let up = true;
      for (let x = x0; x <= x1; x += step) {
        d += `${d ? 'L' : 'M'}${n(x + rnd() * 3)} ${n(up ? y0 + rnd() * 6 : y1 - rnd() * 6)}`;
        up = !up;
      }
      return d;
    };
    let g = '';
    // cielo: franja de zigzag azul arriba
    g += `<path d="${zig(-4, 304, -4, 44, 7)}" stroke="#5fa8e8" stroke-width="5"/>`;
    // sol con cara en la esquina
    g += '<circle cx="40" cy="44" r="22" fill="#f6d32b"/>';
    let ray = '';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      ray += `M${n(40 + Math.cos(a) * 28)} ${n(44 + Math.sin(a) * 28)}L${n(40 + Math.cos(a) * (40 + rnd() * 6))} ${n(44 + Math.sin(a) * (40 + rnd() * 6))}`;
    }
    g += `<path d="${ray}" stroke="#f58a1f" stroke-width="4"/><circle cx="33" cy="40" r="2.6" fill="#222"/><circle cx="47" cy="40" r="2.6" fill="#222"/><path d="M31 50Q40 58 49 50" stroke="#222" stroke-width="2.6"/>`;
    // nubes de borde ondulado, pájaros en M
    for (let k = 0; k < 2; k++) {
      const x = 120 + k * 90 + rnd() * 20;
      const y = 70 + rnd() * 20;
      g += `<path d="M${n(x)} ${n(y)}q6 -14 16 -6q8 -12 18 -2q12 -4 12 8q-2 8 -12 6h-30q-10 -2 -4 -6Z" fill="#fff" stroke="#2f6fd6" stroke-width="3"/>`;
    }
    for (let i = 0; i < 3; i++) {
      const x = 90 + rnd() * 140;
      const y = 108 + rnd() * 30;
      g += `<path d="M${n(x)} ${n(y)}q5 -7 9 0q4 -7 9 0" stroke="#222" stroke-width="2.4"/>`;
    }
    // casita (pared roja rellena a zigzag, techo marrón, puerta y ventana)
    const hx = 222 + rnd() * 18;
    g += `<rect x="${n(hx)}" y="172" width="56" height="${GROUND - 172}" fill="#ffd7cf"/><path d="${zig(hx, hx + 56, 174, GROUND - 2, 5)}" stroke="#e8352b" stroke-width="3" opacity=".75"/><rect x="${n(hx)}" y="172" width="56" height="${GROUND - 172}" stroke="#c22a20" stroke-width="3.5"/>`;
    g += `<path d="M${n(hx - 8)} 174L${n(hx + 28)} 138L${n(hx + 64)} 174Z" fill="#8b5a2b" stroke="#5a3a1a" stroke-width="3"/><rect x="${n(hx + 8)}" y="208" width="14" height="${GROUND - 208}" fill="#2f6fd6" stroke="#222" stroke-width="2.4"/><rect x="${n(hx + 32)}" y="186" width="16" height="16" fill="#f6d32b" stroke="#222" stroke-width="2.4"/><path d="M${n(hx + 40)} 186V202M${n(hx + 32)} 194H${n(hx + 48)}" stroke="#222" stroke-width="2"/>`;
    // pasto en zigzag verde y flores
    g += `<path d="${zig(-4, 304, GROUND - 10, GROUND + 4, 5)}" stroke="#4caf3c" stroke-width="3"/>`;
    g += `<path d="${zig(-4, 304, GROUND, W, 9)}" stroke="#7cc95a" stroke-width="5" opacity=".7"/>`;
    const fc = ['#e8352b', '#8a4fc4', '#f27bb5', '#f58a1f'];
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * 50 + rnd() * 20;
      const y = GROUND + 14 + rnd() * 30;
      g += `<path d="M${n(x)} ${n(y)}V${n(y + 22)}" stroke="#2e8a2e" stroke-width="3"/><circle cx="${n(x)}" cy="${n(y)}" r="7" fill="${fc[i]}"/><circle cx="${n(x)}" cy="${n(y)}" r="2.6" fill="#f6d32b"/>`;
    }
    s += `<g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#${p}w)">${g}</g>`;
    return s;
  },

  blueprint(p, rnd) {
    const line = '#eaf2ff';
    const mono = 'font-family="\'Courier New\',ui-monospace,monospace"';
    let s = `<defs><pattern id="${p}m" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="${line}" stroke-width=".4" opacity=".22"/></pattern>`
      + `<pattern id="${p}M" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="${line}" stroke-width=".8" opacity=".3"/></pattern>`
      + `<pattern id="${p}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="${line}" stroke-width="1"/></pattern>`
      + `<marker id="${p}ar" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L10 5L0 9Z" fill="${line}"/></marker>`
      + `<filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .5 0 0 0 -.18"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#1d4e89"/><rect width="${W}" height="${W}" filter="url(#${p}g)"/><rect width="${W}" height="${W}" fill="url(#${p}m)"/><rect width="${W}" height="${W}" fill="url(#${p}M)"/>`;
    s += `<rect x="8" y="8" width="${W - 16}" height="${W - 16}" fill="none" stroke="${line}" stroke-width="1.6"/><rect x="12" y="12" width="${W - 24}" height="${W - 24}" fill="none" stroke="${line}" stroke-width=".6"/>`;
    // cotas: ancho arriba y alto a la izquierda
    const w = 150 + Math.round(rnd() * 6) * 10;
    s += `<g stroke="${line}" stroke-width="1" fill="none"><path d="M${150 - 90} 46V60M${150 + 90} 46V60M30 60H44M30 ${GROUND}H44"/><path d="M${150 - 88} 52H${150 + 88}" marker-start="url(#${p}ar)" marker-end="url(#${p}ar)"/><path d="M36 62V${GROUND - 2}" marker-start="url(#${p}ar)" marker-end="url(#${p}ar)"/></g>`;
    s += `<text x="150" y="47" text-anchor="middle" ${mono} font-size="10" fill="${line}">${w} mm</text><text x="31" y="${(60 + GROUND) / 2}" text-anchor="middle" transform="rotate(-90 31 ${(60 + GROUND) / 2})" ${mono} font-size="10" fill="${line}">${w + 20 + Math.round(rnd() * 4) * 10} mm</text>`;
    // trazos de construcción: arcos de compás y una rosa de los vientos
    s += `<g stroke="${line}" fill="none" stroke-width=".8" opacity=".6" stroke-dasharray="5 3"><circle cx="150" cy="150" r="118"/><path d="M14 150H286M150 20V${GROUND}"/></g>`;
    s += `<g stroke="${line}" fill="none" stroke-width="1"><circle cx="258" cy="44" r="16"/><circle cx="258" cy="44" r="3"/><path d="M258 22V66M236 44H280"/></g><path d="M258 26L262 44H254Z" fill="${line}"/><text x="258" y="22" text-anchor="middle" ${mono} font-size="8" fill="${line}" dy="-2">N</text>`;
    // engranaje de detalle
    let gear = '';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      gear += `M${n(262 + Math.cos(a) * 14)} ${n(150 + Math.sin(a) * 14)}L${n(262 + Math.cos(a) * 19)} ${n(150 + Math.sin(a) * 19)}`;
    }
    s += `<g stroke="${line}" fill="none" stroke-width="1.2"><circle cx="262" cy="150" r="14"/><circle cx="262" cy="150" r="5"/><path d="${gear}" stroke-width="3"/><path d="M248 136L226 116H210" stroke-width=".8"/></g><text x="208" y="112" ${mono} font-size="8" fill="${line}">DET. A</text>`;
    // suelo en sección (rayado) y cajetín
    s += `<rect y="${GROUND}" width="${W}" height="12" fill="url(#${p}h)" opacity=".7"/><path d="M12 ${GROUND}H${W - 12}" stroke="${line}" stroke-width="1.8"/>`;
    s += `<g stroke="${line}" fill="none" stroke-width="1"><rect x="176" y="256" width="112" height="32"/><path d="M176 272H288M232 256V288"/></g>`;
    s += `<g ${mono} font-size="8" fill="${line}"><text x="180" y="267">7OTS</text><text x="236" y="267">OT-${String(Math.floor(rnd() * 900) + 100)}</text><text x="180" y="283">ESC 1:1</text><text x="236" y="283">HOJA 7/7</text></g>`;
    return s;
  },

  pointillism(p, rnd) {
    // cada color es una trama de toques: base clara + puntos del color, más claros, más oscuros y vecinos
    let defs = '';
    let k = 0;
    const dots = (base) => {
      const id = `${p}p${k++}`;
      const [h, s0, l] = toHsl(base);
      const cols = [base, base, fromHsl(h, s0, Math.min(0.92, l + 0.18)), fromHsl(h, s0, Math.max(0.12, l - 0.16)), fromHsl((h + 30) % 360, Math.min(1, s0 + 0.1), l), fromHsl((h + 330) % 360, s0, l), fromHsl((h + 180) % 360, 0.5, 0.7), '#fffaf0'];
      let c = '';
      // rejilla con jitter (sin huecos ni grumos) en una tesela grande: no se nota la repetición
      jitterGrid(rnd, 0, 0, 20, 20, 7, 7, 0.9).forEach(([x, y], i) => {
        const r = n(1.05 + rnd() * 0.6);
        const f = cols[(i * 5 + Math.floor(rnd() * 3)) % cols.length];
        // copias al otro lado de la tesela para los que asoman por el borde
        const wx = x < 2 ? 20 : x > 18 ? -20 : 0;
        const wy = y < 2 ? 20 : y > 18 ? -20 : 0;
        const at = [[0, 0], ...(wx ? [[wx, 0]] : []), ...(wy ? [[0, wy]] : []), ...(wx && wy ? [[wx, wy]] : [])];
        for (const [dx, dy] of at) c += `<circle cx="${n(x + dx)}" cy="${n(y + dy)}" r="${r}" fill="${f}"/>`;
      });
      defs += `<pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${mix(base, '#fffaf0', 0.5)}"/>${c}</pattern>`;
      return `url(#${id})`;
    };
    let s = '';
    // cielo, río, orilla lejana y árboles, pasto al sol y a la sombra (La Grande Jatte)
    s += `<rect width="${W}" height="140" fill="${dots('#9cc4e4')}"/>`;
    s += `<rect y="120" width="${W}" height="40" fill="${dots('#3f78b8')}"/>`;
    s += `<path d="M0 128Q60 112 120 124T240 118T300 122V134H0Z" fill="${dots('#5d8a4a')}"/>`;
    s += `<rect y="156" width="${W}" height="${W - 156}" fill="${dots('#7fb24a')}"/>`;
    s += `<path d="M0 ${W}V200Q90 ${GROUND - 20} 180 ${GROUND + 10}T${W} ${GROUND}V${W}Z" fill="${dots('#3c6e3a')}"/>`;
    const tx = rnd() < 0.5 ? 34 : 262;
    s += `<rect x="${tx - 6}" y="40" width="12" height="${GROUND - 34}" fill="${dots('#5a4030')}"/>`;
    s += `<ellipse cx="${tx}" cy="54" rx="58" ry="52" fill="${dots('#2f5a34')}"/>`;
    // velero y sombrilla en silueta
    const bx = 120 + rnd() * 60;
    s += `<path d="M${n(bx)} 132L${n(bx)} 92L${n(bx + 22)} 128Z" fill="${dots('#f3ead8')}"/><path d="M${n(bx - 10)} 132H${n(bx + 26)}L${n(bx + 20)} 138H${n(bx - 4)}Z" fill="${dots('#8a3a2a')}"/>`;
    const ux = tx < 150 ? 238 : 62;
    s += `<path d="M${ux - 26} 186Q${ux} 160 ${ux + 26} 186Z" fill="${dots('#c84a4a')}"/><path d="M${ux} 184V${GROUND - 6}" stroke="#3a2a20" stroke-width="2"/>`;
    // marco pintado de puntos (como hacía Seurat)
    s += `<path d="M0 0H${W}V${W}H0ZM10 10V${W - 10}H${W - 10}V10Z" fill-rule="evenodd" fill="${dots('#2a3f7a')}"/>`;
    return `<defs>${defs}</defs>${s}`;
  },

  woodcut(p, rnd) {
    const ink = '#15120f';
    const pap = '#ecdfc4';
    let s = `<defs><filter id="${p}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 .93  0 0 0 0 .87  0 0 0 0 .77  0 0 0 2.2 -1.25"/></filter>`
      + `<filter id="${p}r" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="${pap}"/>`;
    let g = `<rect x="10" y="10" width="${W - 20}" height="${W - 20}" fill="${ink}"/>`;
    // cielo negro con tallas onduladas
    let cuts = '';
    for (let y = 22; y < 180; y += 9) {
      let x = 12 + rnd() * 20;
      while (x < W - 30) {
        const len = 20 + rnd() * 50;
        const a = 1.5 + rnd() * 2;
        cuts += `M${n(x)} ${n(y)}q${n(len / 4)} ${n(-a)} ${n(len / 2)} 0t${n(len / 2)} 0`;
        x += len + 8 + rnd() * 14;
      }
    }
    g += `<path d="${cuts}" fill="none" stroke="${pap}" stroke-width="1.6" stroke-linecap="round"/>`;
    // sol rojo con anillos tallados y rayos en cuña
    const sx = 200 + rnd() * 50;
    const sy = 64;
    let rays = '';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const a1 = a + 0.06;
      rays += `M${n(sx + Math.cos(a) * 34)} ${n(sy + Math.sin(a) * 34)}L${n(sx + Math.cos(a - 0.06) * 58)} ${n(sy + Math.sin(a - 0.06) * 58)}L${n(sx + Math.cos(a1) * 58)} ${n(sy + Math.sin(a1) * 58)}Z`;
    }
    g += `<circle cx="${n(sx)}" cy="${sy}" r="58" fill="${ink}"/><path d="${rays}" fill="${pap}"/><circle cx="${n(sx)}" cy="${sy}" r="28" fill="#b8352a"/>`;
    g += `<circle cx="${n(sx)}" cy="${sy}" r="20" fill="none" stroke="${pap}" stroke-width="1.6"/><circle cx="${n(sx)}" cy="${sy}" r="12" fill="none" stroke="${pap}" stroke-width="1.4"/>`;
    // montañas claras con rayado negro siguiendo la ladera
    const ridge = (base, amp) => {
      const pts = [];
      for (let x = 0; x <= W; x += 30) pts.push([x, base - amp * (0.3 + rnd() * 0.7)]);
      return pts;
    };
    const pts = ridge(196, 70);
    const dOf = (dy) => `M0 ${n(pts[0][1] + dy)}${pts.map(([x, y]) => `L${x} ${n(y + dy)}`).join('')}`;
    g += `<path d="${dOf(0)}L${W} ${GROUND}L0 ${GROUND}Z" fill="${pap}"/>`;
    let hatch = '';
    for (let dy = 8; dy < 90; dy += 7) hatch += dOf(dy);
    g += `<path d="${hatch}" fill="none" stroke="${ink}" stroke-width="${n(2.2)}" stroke-linejoin="round"/>`;
    // pino tallado a un lado
    const tx = sx > 225 ? 46 : 254;
    let pine = '';
    for (let i = 0; i < 5; i++) {
      const y = 120 + i * 22;
      const w = 12 + i * 7;
      pine += `M${tx} ${y - 20}L${tx + w} ${y + 8}L${tx - w} ${y + 8}Z`;
    }
    g += `<path d="${pine}" fill="${ink}" stroke="${pap}" stroke-width="1.2"/><rect x="${tx - 4}" y="${GROUND - 14}" width="8" height="14" fill="${ink}"/>`;
    // suelo negro con golpes de gubia
    g += `<rect x="10" y="${GROUND}" width="${W - 20}" height="${W - GROUND - 10}" fill="${ink}"/>`;
    let gouge = '';
    for (let i = 0; i < 34; i++) {
      const x = 16 + rnd() * (W - 40);
      const y = GROUND + 8 + rnd() * 40;
      gouge += `M${n(x)} ${n(y)}l${n(8 + rnd() * 12)} ${n(-1 - rnd() * 2)}`;
    }
    g += `<path d="M10 ${GROUND + 2}H${W - 10}" stroke="${pap}" stroke-width="2"/><path d="${gouge}" stroke="${pap}" stroke-width="2" stroke-linecap="round"/>`;
    s += `<g filter="url(#${p}r)">${g}</g>`;
    // tinta desigual: motas de papel que asoman
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },
  riso(p, rnd) {
    const pk = '#ff48b0';
    const bl = '#0078bf';
    const yl = '#ffe800';
    const M = 'style="mix-blend-mode:multiply"';
    let s = `<defs>${bdGrain(`${p}g`, rnd, [0.97, 0.95, 0.9], 1.7, -0.95)}`
      + `<pattern id="${p}hb" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><circle cx="3" cy="3" r="1.7" fill="${bl}"/></pattern>`
      + `<pattern id="${p}hp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><circle cx="2.5" cy="2.5" r="1.4" fill="${pk}"/></pattern></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#f7f1e3"/>`;
    // sol amarillo con su doble rosa en trama, corrido
    const sx = 60 + rnd() * 180;
    s += `<circle cx="${n(sx)}" cy="80" r="46" fill="${yl}" ${M}/><circle cx="${n(sx + 10)}" cy="73" r="46" fill="url(#${p}hp)" ${M}/>`;
    // nubes de una sola tinta
    for (let i = 0; i < 2; i++) {
      const cx = 40 + rnd() * 220;
      const cy = 40 + rnd() * 50;
      s += `<rect x="${n(cx - 30)}" y="${n(cy)}" width="60" height="16" rx="8" fill="${bl}" opacity=".55" ${M}/>`;
    }
    // cerros: uno azul plano, otro rosa en trama, superpuestos (la mezcla hace el violeta)
    const hill = (y, a) => `M-10 ${GROUND}V${n(y)}Q${n(50 + rnd() * 40)} ${n(y - a)} ${n(120 + rnd() * 30)} ${n(y)}T${n(230 + rnd() * 20)} ${n(y + rnd() * 10)}T${W + 10} ${n(y - 10)}V${GROUND}Z`;
    s += `<path d="${hill(170, 50)}" fill="${bl}" opacity=".9" ${M}/>`;
    s += `<path d="${hill(196, 40)}" fill="url(#${p}hp)" ${M}/><path d="${hill(210, 30)}" fill="${pk}" opacity=".75" ${M}/>`;
    // suelo: amarillo con trama azul corrida
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="${yl}" ${M}/><rect x="3" y="${GROUND + 4}" width="${W}" height="${W - GROUND}" fill="url(#${p}hb)" opacity=".7" ${M}/>`;
    // flores de dos tintas
    for (let i = 0; i < 6; i++) {
      const x = rnd() < 0.5 ? 14 + rnd() * 70 : 216 + rnd() * 70;
      const y = GROUND + 14 + rnd() * 40;
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="5" fill="${pk}" ${M}/><circle cx="${n(x + 2)}" cy="${n(y - 1.5)}" r="2.2" fill="${bl}" ${M}/>`;
    }
    // marcas de registro en las esquinas
    let reg = '';
    for (const [x, y] of [[14, 14], [W - 14, 14], [14, W - 14], [W - 14, W - 14]]) reg += `<circle cx="${x}" cy="${y}" r="4.5"/><path d="M${x - 8} ${y}H${x + 8}M${x} ${y - 8}V${y + 8}"/>`;
    s += `<g fill="none" stroke="${bl}" stroke-width=".8">${reg}</g><g fill="none" stroke="${pk}" stroke-width=".8" transform="translate(1.5 -1)">${reg}</g>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  dotmatrix(p, rnd) {
    const [c0, c1, c2, c3] = PAL.dotmatrix;
    const B = 6;
    let s = `<defs><pattern id="${p}dt" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${c2}"/><rect x="6" y="6" width="6" height="6" fill="${c2}"/></pattern>`
      + `<pattern id="${p}px" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0H3M0 0V3" stroke="${c0}" stroke-width=".5" opacity=".12"/></pattern></defs>`;
    s += `<g shape-rendering="crispEdges"><rect width="${W}" height="${W}" fill="${c3}"/>`;
    // horizonte tramado
    s += `<rect y="132" width="${W}" height="36" fill="url(#${p}dt)"/><rect y="168" width="${W}" height="${GROUND - 168}" fill="${c2}"/>`;
    // sol y nubes en bloques
    const sx = 6 * Math.floor(30 + rnd() * 12);
    s += `<path d="${blockDisc(sx, 66, 28, B)}" fill="${c2}"/><path d="${blockDisc(sx, 66, 17, B)}" fill="${c3}"/>`;
    for (let i = 0; i < 3; i++) {
      const cx = 6 * Math.floor(4 + rnd() * 40);
      const cy = 6 * Math.floor(4 + rnd() * 10);
      s += `<path d="${blockDisc(cx, cy, 11, B)}${blockDisc(cx + 14, cy + 3, 9, B)}${blockDisc(cx - 13, cy + 4, 8, B)}" fill="${c2}"/>`;
    }
    // colinas escalonadas
    let hills = '';
    const ph = rnd() * 6;
    for (let x = 0; x < W; x += B) {
      const h = Math.round((Math.sin(x / 34 + ph) * 18 + Math.sin(x / 13) * 6 + 40) / B) * B;
      hills += `M${x} ${GROUND - h}h${B}V${GROUND}h${-B}Z`;
    }
    s += `<path d="${hills}" fill="${c1}"/>`;
    // árbol de bloques a un lado y tubería al otro
    const tx = rnd() < 0.5 ? 36 : 252;
    s += `<rect x="${tx - 3}" y="${GROUND - 42}" width="6" height="42" fill="${c0}"/><path d="${blockDisc(tx, GROUND - 54, 20, B)}" fill="${c0}"/><path d="${blockDisc(tx - 4, GROUND - 58, 11, B)}" fill="${c1}"/>`;
    const px = tx < 150 ? 246 : 30;
    s += `<rect x="${px - 15}" y="${GROUND - 36}" width="30" height="36" fill="${c1}"/><rect x="${px - 18}" y="${GROUND - 48}" width="36" height="12" fill="${c1}"/><path d="M${px - 18} ${GROUND - 48}h36v12h-36ZM${px - 15} ${GROUND - 36}V${GROUND}M${px + 15} ${GROUND - 36}V${GROUND}" fill="none" stroke="${c0}" stroke-width="3"/><rect x="${px - 12}" y="${GROUND - 45}" width="6" height="6" fill="${c3}"/>`;
    // monedas flotando
    for (let i = 0; i < 3; i++) {
      const cx = 6 * Math.floor(7 + i * 16 + rnd() * 4);
      s += `<path d="${blockDisc(cx, 114, 7, 3)}" fill="${c1}"/><rect x="${cx - 1.5}" y="108" width="3" height="12" fill="${c3}"/>`;
    }
    // suelo de ladrillos
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="${c1}"/>`;
    let br = '';
    for (let r = 0; r * 12 < W - GROUND; r++) {
      const y = GROUND + r * 12;
      br += `M0 ${y}H${W}`;
      for (let x = r % 2 ? 12 : 0; x < W; x += 24) br += `M${x} ${y}v12`;
    }
    s += `<path d="${br}" stroke="${c0}" stroke-width="2" fill="none"/><rect y="${GROUND}" width="${W}" height="3" fill="${c2}"/>`;
    // marcador
    s += `<text x="12" y="22" font-family="monospace" font-weight="bold" font-size="12" fill="${c0}">SCORE ${String(1000 + Math.floor(rnd() * 9000)).padStart(6, '0')}</text>`;
    let hearts = '';
    for (let i = 0; i < 3; i++) {
      const x = 246 + i * 15;
      hearts += `M${x} 12h3v3h-3ZM${x + 6} 12h3v3h-3ZM${x - 3} 15h15v3h-15ZM${x} 18h9v3h-9ZM${x + 3} 21h3v3h-3Z`;
    }
    s += `<path d="${hearts}" fill="${c0}"/></g>`;
    // rejilla de la pantalla LCD
    s += `<rect width="${W}" height="${W}" fill="url(#${p}px)"/>`;
    return s;
  },

  chalk(p, rnd) {
    const ch = '#f4f4ee';
    let s = `<defs><radialGradient id="${p}bd" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#3a5a4c"/><stop offset="1" stop-color="#1f342b"/></radialGradient>`
      + `<filter id="${p}c" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${Math.floor(rnd() * 900)}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.6 0 0 0 2.5" result="a"/><feComposite in="d" in2="a" operator="in"/></filter>`
      + `<filter id="${p}sm" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>`
      + `${bdGrain(`${p}g`, rnd, [0.95, 0.96, 0.93], 1.2, -0.66, 0.9)}</defs>`;
    s += `<rect width="${W}" height="${W}" fill="url(#${p}bd)"/>`;
    // borrones de mota
    let sm = '';
    for (let i = 0; i < 5; i++) sm += `<ellipse cx="${n(30 + rnd() * 240)}" cy="${n(30 + rnd() * 200)}" rx="${n(30 + rnd() * 40)}" ry="${n(10 + rnd() * 14)}" transform="rotate(${Math.floor(rnd() * 40 - 20)})"/>`;
    s += `<g fill="${ch}" opacity=".07" filter="url(#${p}sm)">${sm}</g>`;
    // dibujos de tiza
    let g = '';
    const sx = rnd() < 0.5 ? 58 : 242;
    let rays = '';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      rays += `M${n(sx + Math.cos(a) * 24)} ${n(62 + Math.sin(a) * 24)}L${n(sx + Math.cos(a) * 34)} ${n(62 + Math.sin(a) * 34)}`;
    }
    g += `<circle cx="${sx}" cy="62" r="17" fill="none" stroke="#f6e27a" stroke-width="3"/><path d="${rays}" stroke="#f6e27a" stroke-width="3" stroke-linecap="round"/>`;
    const ox = sx < 150 ? 236 : 62;
    g += `<text x="${ox}" y="56" text-anchor="middle" font-family="'Comic Sans MS','Chalkboard SE',cursive" font-size="17" fill="${ch}">a²+b²=c²</text>`;
    g += `<text x="${ox}" y="84" text-anchor="middle" font-family="'Comic Sans MS','Chalkboard SE',cursive" font-size="15" fill="#f6a5c0">7 + 3 = 10</text>`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += star5(20 + rnd() * 260, 110 + rnd() * 60, 4 + rnd() * 3);
    g += `<path d="${stars}" fill="none" stroke="${ch}" stroke-width="1.8" stroke-linejoin="round"/>`;
    g += `<path d="M${ox - 38} 104q16 -14 30 0t30 0" fill="none" stroke="#9fd8f0" stroke-width="2.6" stroke-linecap="round"/>`;
    // suelo: raya de tiza y pasto en trazos
    let grass = `M8 ${GROUND + 2}Q80 ${GROUND - 3} 150 ${GROUND + 1}T${W - 8} ${GROUND}`;
    for (let x = 14; x < W - 10; x += 9 + rnd() * 8) grass += `M${n(x)} ${GROUND + 1}l${n(-2 + rnd() * 4)} ${n(-6 - rnd() * 6)}`;
    g += `<path d="${grass}" fill="none" stroke="#b6e3a0" stroke-width="2.6" stroke-linecap="round"/>`;
    s += `<g filter="url(#${p}c)">${g}</g>`;
    // marco de madera y repisa con tizas y borrador
    s += `<path d="M0 0H${W}V${W}H0ZM9 9V${W - 9}H${W - 9}V9Z" fill-rule="evenodd" fill="#8a5a34"/><path d="M9 9H${W - 9}V${W - 9}H9Z" fill="none" stroke="#5e3b20" stroke-width="2"/>`;
    s += `<rect x="0" y="${W - 22}" width="${W}" height="22" fill="#9a6a40"/><rect x="0" y="${W - 22}" width="${W}" height="4" fill="#b8844f"/>`;
    s += `<rect x="40" y="${W - 28}" width="22" height="6" rx="3" fill="${ch}"/><rect x="70" y="${W - 28}" width="16" height="6" rx="3" fill="#f6a5c0"/>`;
    s += `<rect x="210" y="${W - 34}" width="46" height="12" rx="2" fill="#d8c7a8"/><rect x="210" y="${W - 26}" width="46" height="4" fill="#4a4a52"/>`;
    s += `<rect width="${W}" height="${W - 22}" filter="url(#${p}g)" opacity=".5"/>`;
    return s;
  },

  sticker(p, rnd) {
    let s = `<defs><filter id="${p}sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1.5" dy="3" stdDeviation="2" flood-color="#0b2a1e" flood-opacity=".45"/></filter></defs>`;
    // tapete de corte con su cuadrícula, guías a 45° y regla
    s += `<rect width="${W}" height="${W}" fill="#2f7d62"/>`;
    let minor = '';
    let major = '';
    for (let v = 10; v < W; v += 10) (v % 50 ? (minor += `M${v} 0V${W}M0 ${v}H${W}`) : (major += `M${v} 0V${W}M0 ${v}H${W}`));
    s += `<path d="${minor}" stroke="#fff" stroke-width=".5" opacity=".14"/><path d="${major}" stroke="#fff" stroke-width="1" opacity=".32"/>`;
    s += `<path d="M0 ${W}L${W} 0M0 150L150 0M150 ${W}L${W} 150" stroke="#f2d24a" stroke-width=".9" opacity=".45"/>`;
    let nums = '';
    for (let v = 50; v < W; v += 50) nums += `<text x="${v + 2}" y="9">${v / 10}</text><text x="2" y="${v - 2}">${v / 10}</text>`;
    s += `<g font-family="sans-serif" font-size="7" fill="#fff" opacity=".6">${nums}</g>`;
    // pegatinas sueltas: troquel blanco, color y brillo
    const shapes = [
      (c) => `<path d="${star5(0, 0, 18)}" fill="${c}"/>`,
      (c) => `<path d="M0 16C-24 0 -16 -18 0 -8C16 -18 24 0 0 16Z" fill="${c}"/>`,
      (c) => `<path d="M4 -20L-12 4H0L-4 20L12 -4H0Z" fill="${c}"/>`,
      (c) => `<circle r="16" fill="${c}"/><circle cx="-5.5" cy="-3" r="2.2" fill="#1a1720"/><circle cx="5.5" cy="-3" r="2.2" fill="#1a1720"/><path d="M-7 5Q0 11 7 5" fill="none" stroke="#1a1720" stroke-width="2" stroke-linecap="round"/>`,
      (c) => `<path d="M-22 -12H22V8H-4L-12 16V8H-22Z" fill="${c}"/><text y="3" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="12" fill="#1a1720">WOW</text>`,
      (c) => `<path d="M-20 8A20 20 0 0 1 20 8" fill="none" stroke="${c}" stroke-width="6"/><path d="M-14 8A14 14 0 0 1 14 8" fill="none" stroke="#ffd23f" stroke-width="6"/><path d="M-8 8A8 8 0 0 1 8 8" fill="none" stroke="#3ec1d3" stroke-width="6"/>`,
    ];
    const cols = ['#ff5d8f', '#ffd23f', '#3ec1d3', '#ff8c42', '#a77dff', '#7ed957'];
    const spots = [[44, 46], [256, 50], [36, 150], [264, 156], [46, 262], [254, 262]];
    const order = shapes.map((f, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    spots.forEach(([x, y], i) => {
      const art = shapes[order[i]](cols[(i + Math.floor(rnd() * 6)) % 6]);
      s += `<g transform="translate(${x} ${y}) rotate(${Math.floor(rnd() * 40 - 20)})" filter="url(#${p}sh)"><g stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">${art}</g>${art}<path d="M-14 -10L-6 -16" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/></g>`;
    });
    return s;
  },

  felt(p, rnd) {
    let s = `<defs><pattern id="${p}ln" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1H4M1 0V4" stroke="#8a7a60" stroke-width=".7" opacity=".22"/></pattern>`
      + `<radialGradient id="${p}vg" cx=".5" cy=".5" r=".7"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>`;
    // lino de fondo y la tela tensada dentro del bastidor
    s += `<rect width="${W}" height="${W}" fill="#cbbfa8"/><rect width="${W}" height="${W}" fill="url(#${p}ln)"/><rect width="${W}" height="${W}" fill="url(#${p}vg)"/>`;
    const R = 138;
    s += `<circle cx="150" cy="150" r="${R}" fill="#f3ecdc"/><circle cx="150" cy="150" r="${R}" fill="url(#${p}ln)"/>`;
    // bordado: sol de puntadas radiales, nubes en pespunte, flores margarita y pasto
    let g = '';
    const sx = rnd() < 0.5 ? 92 : 208;
    let sun = '';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      sun += `M${n(sx + Math.cos(a) * 3)} ${n(62 + Math.sin(a) * 3)}L${n(sx + Math.cos(a) * 15)} ${n(62 + Math.sin(a) * 15)}`;
    }
    g += `<path d="${sun}" stroke="#f2b33d" stroke-width="2.2" stroke-linecap="round"/>`;
    const cx = sx < 150 ? 206 : 94;
    g += `<path d="M${cx - 24} 74a10 10 0 0 1 8 -14a13 13 0 0 1 24 -2a10 10 0 0 1 16 16Z" fill="none" stroke="#7aa6c8" stroke-width="2" stroke-dasharray="4 2.5" stroke-linecap="round"/>`;
    const flower = (x, y, c) => {
      let pe = '';
      for (let i = 0; i < 6; i++) pe += `<ellipse cx="${x}" cy="${n(y - 6)}" rx="2.6" ry="5.5" transform="rotate(${i * 60} ${x} ${y})"/>`;
      return `<path d="M${x} ${y + 6}Q${x - 3} ${y + 20} ${x + 1} ${GROUND + 6}" fill="none" stroke="#5f8a4a" stroke-width="2"/><g fill="none" stroke="${c}" stroke-width="1.8">${pe}</g><circle cx="${x}" cy="${y}" r="2.6" fill="#f2b33d"/>`;
    };
    const fc = ['#d8708a', '#9a7ac8', '#e89a5a', '#6aa0c8'];
    for (let i = 0; i < 4; i++) {
      const x = i < 2 ? 40 + i * 28 + rnd() * 10 : 206 + (i - 2) * 30 + rnd() * 10;
      g += flower(n(x), n(GROUND - 30 - rnd() * 34), fc[Math.floor(rnd() * 4)]);
    }
    let grass = '';
    for (let x = 22; x < 280; x += 5 + rnd() * 4) grass += `M${n(x)} ${GROUND + 6}l${n(-2 + rnd() * 4)} ${n(-6 - rnd() * 7)}`;
    g += `<path d="${grass}" stroke="#6f9a52" stroke-width="1.8" stroke-linecap="round"/>`;
    g += `<path d="M14 ${GROUND + 6}Q150 ${GROUND - 2} 286 ${GROUND + 6}" fill="none" stroke="#4f7a3a" stroke-width="2.4" stroke-dasharray="6 4" stroke-linecap="round"/>`;
    // tierra en puntadas cruzadas
    let xs = '';
    for (let y = GROUND + 18; y < W - 20; y += 10) {
      for (let x = 30 + (y % 20 ? 5 : 0); x < 270; x += 10) {
        if ((x - 150) ** 2 + (y - 150) ** 2 < (R - 10) ** 2) xs += `M${x - 3} ${y - 3}l6 6M${x + 3} ${y - 3}l-6 6`;
      }
    }
    g += `<path d="${xs}" stroke="#b08a62" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>`;
    s += g;
    // bastidor de madera: aro doble y tornillo arriba
    s += `<circle cx="150" cy="150" r="${R + 2}" fill="none" stroke="#000" stroke-width="16" opacity=".12" transform="translate(2 4)"/>`;
    s += `<circle cx="150" cy="150" r="${R + 2}" fill="none" stroke="#c8995e" stroke-width="13"/><circle cx="150" cy="150" r="${R + 2}" fill="none" stroke="#a87a44" stroke-width="1.4"/><circle cx="150" cy="150" r="${R + 7}" fill="none" stroke="#e2bb84" stroke-width="1.2"/>`;
    s += `<rect x="138" y="0" width="24" height="12" rx="2" fill="#b88a50"/><rect x="132" y="2" width="36" height="5" rx="2" fill="#9a9aa2"/><circle cx="168" cy="4.5" r="4" fill="#bdbdc4"/>`;
    return s;
  },

  papercut(p, rnd) {
    const sets = [
      ['#fde8d7', '#f7b267', '#f4845f', '#f27059', '#c46a8a', '#8a5a8a', '#5a4a7a'],
      ['#e4f3ef', '#ffd6a5', '#b8e0d2', '#95c8b8', '#6aa89a', '#4f8a7e', '#3a6a62'],
    ];
    const pal = sets[Math.floor(rnd() * sets.length)];
    let s = `<defs><filter id="${p}s" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#2a1f3a" flood-opacity=".35"/></filter>${bdGrain(`${p}g`, rnd, [1, 1, 1], 1.1, -0.62, 1.1)}</defs>`;
    s += `<rect width="${W}" height="${W}" fill="${pal[0]}"/>`;
    const sx = 60 + rnd() * 180;
    s += `<circle cx="${n(sx)}" cy="70" r="30" fill="${pal[1]}" filter="url(#${p}s)"/><circle cx="${n(sx)}" cy="70" r="20" fill="#fff" opacity=".35"/>`;
    for (let i = 0; i < 2; i++) {
      const x = 40 + rnd() * 220;
      const y = 30 + rnd() * 40;
      s += `<path d="M${n(x - 26)} ${n(y + 8)}a10 10 0 0 1 12 -12a14 14 0 0 1 26 -2a10 10 0 0 1 14 14Z" fill="#fff" filter="url(#${p}s)"/>`;
    }
    // capas de cerros de cartulina, del fondo al frente
    for (let i = 0; i < 5; i++) {
      const y = 112 + i * 30;
      const a = 26 - i * 3;
      let d = `M-10 ${W}V${n(y)}`;
      const k = 4;
      for (let j = 0; j < k; j++) {
        const x1 = -10 + ((W + 20) * (j + 0.5)) / k;
        const x2 = -10 + ((W + 20) * (j + 1)) / k;
        d += `Q${n(x1)} ${n(y + (j % 2 ? a : -a) * (0.6 + rnd() * 0.6))} ${n(x2)} ${n(y + (rnd() - 0.5) * 10)}`;
      }
      if (i === 4) d = `M-10 ${W}V${GROUND + 4}Q80 ${GROUND - 8} 150 ${GROUND}T${W + 10} ${GROUND - 2}V${W}Z`;
      else d += `V${W}Z`;
      s += `<path d="${d}" fill="${pal[i + 2]}" filter="url(#${p}s)"/>`;
      if (i === 2 || i === 3) {
        // pinos de papel en la capa
        for (let t = 0; t < 2; t++) {
          const tx = rnd() < 0.5 ? 20 + rnd() * 70 : 210 + rnd() * 70;
          const ty = y + 8;
          s += `<path d="M${n(tx)} ${n(ty - 34)}L${n(tx + 12)} ${n(ty)}H${n(tx - 12)}Z" fill="${pal[i + 3] || pal[6]}" filter="url(#${p}s)"/>`;
        }
      }
    }
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  lowpoly(p, rnd) {
    const sky0 = '#3d5a80';
    const sky1 = '#f6bd60';
    const jit = (c) => mix(c, rnd() < 0.5 ? '#ffffff' : '#000000', rnd() * 0.07);
    let s = facets(rnd, 0, 0, W, 190, 6, 4, (x, y) => jit(mix(sky0, sky1, Math.min(1, y / 180))));
    // sol octogonal
    const sx = 60 + rnd() * 180;
    let sun = '';
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      sun += `<path d="M${n(sx)} 64L${n(sx + Math.cos(a0) * 24)} ${n(64 + Math.sin(a0) * 24)}L${n(sx + Math.cos(a1) * 24)} ${n(64 + Math.sin(a1) * 24)}Z" fill="${i % 2 ? '#fff1c1' : '#ffe39a'}" stroke="${i % 2 ? '#fff1c1' : '#ffe39a'}" stroke-width=".5"/>`;
    }
    s += sun;
    // montañas facetadas: lado iluminado y lado en sombra, con nieve
    const mount = (px, py, half, base, lit, dark) => {
      const P = [px, py];
      const BL = [px - half, base];
      const BR = [px + half * (0.9 + rnd() * 0.3), base];
      const L1 = [px - half * 0.5 + (rnd() - 0.5) * 10, (py + base) / 2 + (rnd() - 0.5) * 10];
      const R1 = [px + half * 0.5 + (rnd() - 0.5) * 10, (py + base) / 2 + (rnd() - 0.5) * 10];
      const C = [px + (rnd() - 0.5) * half * 0.3, base - (base - py) * 0.3];
      const T = (a, b, c, col) => `<path d="M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(c[0])} ${n(c[1])}Z" fill="${col}" stroke="${col}" stroke-width=".6" stroke-linejoin="round"/>`;
      const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return T(P, L1, C, lit) + T(L1, BL, C, mix(lit, dark, 0.3)) + T(P, C, R1, mix(lit, dark, 0.6)) + T(R1, C, BR, dark) + T(BL, BR, C, mix(lit, dark, 0.45))
        + T(P, at(P, L1, 0.38), at(P, C, 0.3), '#f4f6fb') + T(P, at(P, C, 0.3), at(P, R1, 0.38), '#c9d2e3');
    };
    s += mount(70 + rnd() * 30, 92, 90, 214, '#7d8fb3', '#46557a');
    s += mount(215 + rnd() * 30, 80, 100, 214, '#8a9cc0', '#4b5b82');
    s += mount(150, 126, 70, 214, '#6b7fa6', '#3a4870');
    // suelo de facetas verdes
    s += facets(rnd, 0, 206, W, W - 206, 6, 3, (x, y) => jit(mix('#8cc084', '#4f7d4a', (y - 206) / 94)));
    // pinos de dos caras
    for (let i = 0; i < 4; i++) {
      const tx = i < 2 ? 18 + i * 40 + rnd() * 14 : 214 + (i - 2) * 40 + rnd() * 14;
      const ty = GROUND - 8 + rnd() * 10;
      const h = 44 + rnd() * 20;
      s += `<path d="M${n(tx)} ${n(ty - h)}L${n(tx)} ${n(ty)}L${n(tx - 14)} ${n(ty)}Z" fill="#3f7a4f"/><path d="M${n(tx)} ${n(ty - h)}L${n(tx + 14)} ${n(ty)}L${n(tx)} ${n(ty)}Z" fill="#2a5a3a"/><path d="M${n(tx - 2)} ${n(ty)}h4v8h-4Z" fill="#5a3a2a"/>`;
    }
    return s;
  },

  marble(p, rnd) {
    let s = `<defs><linearGradient id="${p}wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfc6b6"/><stop offset="1" stop-color="#e4ddd0"/></linearGradient>`
      + `<radialGradient id="${p}sp" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fffaf0" stop-opacity=".75"/><stop offset=".6" stop-color="#fffaf0" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${p}cl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6d0c4"/><stop offset=".35" stop-color="#f6f2ea"/><stop offset="1" stop-color="#bfb7a8"/></linearGradient>`
      + `<filter id="${p}v" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency=".012 .04" numOctaves="4" seed="${Math.floor(rnd() * 900)}"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .4  0 0 0 0 .38  -5 0 0 0 .55"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="url(#${p}wl)"/>`;
    // hornacina en arco detrás del ot
    s += `<path d="M76 ${GROUND}V96A74 74 0 0 1 224 96V${GROUND}Z" fill="#bdb3a2"/><path d="M84 ${GROUND}V98A66 66 0 0 1 216 98V${GROUND}Z" fill="#c9c0b0"/>`;
    s += `<path d="M76 96A74 74 0 0 1 224 96" fill="none" stroke="#ece6da" stroke-width="3"/>`;
    // columnas estriadas con capitel jónico y basa
    const column = (x) => {
      let f = '';
      for (let i = 1; i < 5; i++) f += `M${x + i * 7} 46V${GROUND + 14}`;
      return `<rect x="${x}" y="46" width="35" height="${GROUND - 32}" fill="url(#${p}cl)"/><path d="${f}" stroke="#a89f90" stroke-width="1.2"/>`
        + `<rect x="${x - 6}" y="34" width="47" height="12" fill="#ece6da"/><circle cx="${x - 3}" cy="44" r="7" fill="#ece6da" stroke="#a89f90"/><circle cx="${x + 38}" cy="44" r="7" fill="#ece6da" stroke="#a89f90"/><circle cx="${x - 3}" cy="44" r="2.5" fill="#a89f90"/><circle cx="${x + 38}" cy="44" r="2.5" fill="#a89f90"/><rect x="${x - 8}" y="26" width="51" height="8" fill="#f2ede4"/>`
        + `<rect x="${x - 6}" y="${GROUND + 14}" width="47" height="8" fill="#ece6da"/><rect x="${x - 9}" y="${GROUND + 22}" width="53" height="6" fill="#d6cfc2"/>`;
    };
    s += column(16) + column(249);
    // foco cenital
    s += `<path d="M110 0H190L250 ${GROUND}H50Z" fill="url(#${p}sp)"/>`;
    // suelo de damero en perspectiva
    s += `<rect y="${GROUND + 28}" width="${W}" height="${W - GROUND - 28}" fill="#e8e2d6"/>`;
    let ck = '';
    for (let i = -6; i < 6; i++) ck += `M${150 + i * 30} ${GROUND + 28}L${150 + i * 46} ${W}`;
    s += `<path d="${ck}M0 ${GROUND + 40}H${W}" stroke="#8a8274" stroke-width="1" opacity=".5"/>`;
    // pedestal con placa
    s += `<rect x="72" y="${GROUND}" width="156" height="9" fill="#f4f0e8"/><rect x="82" y="${GROUND + 9}" width="136" height="${W - GROUND - 9}" fill="#e6e0d4"/><rect x="82" y="${GROUND + 9}" width="136" height="4" fill="#cfc7b8"/>`;
    s += `<rect x="72" y="${GROUND}" width="156" height="${W - GROUND}" filter="url(#${p}v)" opacity=".8"/>`;
    s += `<rect x="122" y="${GROUND + 24}" width="56" height="20" rx="1.5" fill="#b8923e"/><rect x="124" y="${GROUND + 26}" width="52" height="16" fill="none" stroke="#7a5e22" stroke-width=".8"/>`;
    s += `<text x="150" y="${GROUND + 37}" text-anchor="middle" font-family="Georgia,serif" font-size="8" letter-spacing="1" fill="#4a3810">MMXXVI</text>`;
    s += `<rect x="16" y="46" width="35" height="${GROUND - 32}" filter="url(#${p}v)" opacity=".6"/><rect x="249" y="46" width="35" height="${GROUND - 32}" filter="url(#${p}v)" opacity=".6"/>`;
    return s;
  },

  candy(p, rnd) {
    const sprinkle = ['#ff4f8b', '#ffd23f', '#3ec1d3', '#7ed957', '#a77dff', '#ffffff', '#ff8c42'];
    let s = `<defs><pattern id="${p}st" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#ffd6e8"/><rect width="9" height="22" fill="#ffc2dc"/></pattern>`
      + `<radialGradient id="${p}gl" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
    s += `<rect width="${W}" height="${W}" fill="url(#${p}st)"/>`;
    // chupetines espirales
    const lolly = (x, y, r, c) => {
      let sp = `M${x} ${y}`;
      for (let a = 0; a < Math.PI * 6; a += 0.3) sp += `L${n(x + Math.cos(a) * (a / (Math.PI * 6)) * r)} ${n(y + Math.sin(a) * (a / (Math.PI * 6)) * r)}`;
      return `<rect x="${x - 3}" y="${y}" width="6" height="${GROUND - y}" rx="3" fill="#fff" stroke="#e8b8cc" stroke-width="1"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`
        + `<path d="${sp}" fill="none" stroke="#fff" stroke-width="${n(r * 0.16)}" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${p}gl)"/>`;
    };
    const left = rnd() < 0.5;
    s += lolly(left ? 48 : 252, 92 + rnd() * 20, 32, '#ff6fa8');
    s += lolly(left ? 256 : 44, 130 + rnd() * 20, 24, '#7fd3e8');
    // caramelos envueltos flotando
    for (let i = 0; i < 2; i++) {
      const x = 90 + i * 120 + rnd() * 20;
      const y = 30 + rnd() * 30;
      const c = sprinkle[Math.floor(rnd() * 5)];
      s += `<g transform="rotate(${Math.floor(rnd() * 60 - 30)} ${n(x)} ${n(y)})"><path d="M${n(x - 12)} ${n(y)}l-10 -8v16Z M${n(x + 12)} ${n(y)}l10 -8v16Z" fill="${c}" opacity=".8"/><ellipse cx="${n(x)}" cy="${n(y)}" rx="13" ry="9" fill="${c}"/><ellipse cx="${n(x - 4)}" cy="${n(y - 3)}" rx="5" ry="2.5" fill="#fff" opacity=".6"/></g>`;
    }
    // pastel: bizcocho de chocolate con glaseado que chorrea
    s += `<rect y="${GROUND + 10}" width="${W}" height="${W - GROUND - 10}" fill="#8b5a3c"/><rect y="${GROUND + 40}" width="${W}" height="6" fill="#ffe0ec"/>`;
    let ic = `M0 ${GROUND - 4}H${W}V${GROUND + 12}`;
    for (let x = W; x > 0; x -= 20 + rnd() * 16) {
      const h = 6 + rnd() * 22;
      ic += `L${n(x - 4)} ${GROUND + 12}V${n(GROUND + 12 + h)}a5 5 0 0 1 -10 0V${GROUND + 12}`;
    }
    s += `<path d="${ic}L0 ${GROUND + 12}Z" fill="#ff9ec7"/><path d="M0 ${GROUND - 2}H${W}" stroke="#ffd0e4" stroke-width="3"/>`;
    // grageas en el aire y sobre el glaseado
    let sp = '';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W;
      const y = i < 40 ? rnd() * (GROUND - 10) : GROUND - 4 + rnd() * 14;
      sp += `<rect x="${n(x)}" y="${n(y)}" width="7" height="2.6" rx="1.3" fill="${sprinkle[Math.floor(rnd() * sprinkle.length)]}" transform="rotate(${Math.floor(rnd() * 180)} ${n(x)} ${n(y)})"/>`;
    }
    s += sp;
    return s;
  },

  holo(p, rnd) {
    const rb = ['#ff8fd0', '#ffe08a', '#8affc0', '#8ad0ff', '#b98aff'];
    let s = `<defs><linearGradient id="${p}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#140a2e"/><stop offset=".55" stop-color="#2a1458"/><stop offset="1" stop-color="#0d1a3a"/></linearGradient>`
      + `<linearGradient id="${p}rb" x1="0" y1="0" x2="1" y2="0">${rb.map((c, i) => `<stop offset="${n(i / (rb.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`
      + `<linearGradient id="${p}fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#0d0820" stop-opacity=".85"/></linearGradient>`
      + `<filter id="${p}gw" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    s += `<rect width="${W}" height="${W}" fill="url(#${p}bg)"/>`;
    // haces tornasolados en diagonal
    for (let i = 0; i < 3; i++) {
      const x = -60 + i * 120 + rnd() * 40;
      s += `<path d="M${n(x)} 0h${n(30 + rnd() * 30)}l120 ${GROUND}h${n(-40 - rnd() * 30)}Z" fill="url(#${p}rb)" opacity=".13"/>`;
    }
    // prismas flotando
    for (let i = 0; i < 3; i++) {
      const x = i === 1 ? 150 + (rnd() - 0.5) * 60 : i ? 250 + rnd() * 20 : 30 + rnd() * 20;
      const y = i === 1 ? 30 + rnd() * 10 : 90 + rnd() * 70;
      const r = 10 + rnd() * 8;
      s += `<path d="M${n(x)} ${n(y - r)}L${n(x + r * 0.7)} ${n(y)}L${n(x)} ${n(y + r * 1.2)}L${n(x - r * 0.7)} ${n(y)}Z" fill="url(#${p}rb)" opacity=".85"/><path d="M${n(x)} ${n(y - r)}L${n(x + r * 0.7)} ${n(y)}L${n(x)} ${n(y + r * 1.2)}Z" fill="#fff" opacity=".25"/>`;
    }
    // piso tornasol con rejilla en perspectiva
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="url(#${p}rb)" opacity=".75"/><rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="url(#${p}fl)"/>`;
    let grid = '';
    for (let i = -8; i <= 8; i++) grid += `M${150 + i * 18} ${GROUND}L${150 + i * 60} ${W}`;
    for (let j = 1; j < 6; j++) grid += `M0 ${n(GROUND + (W - GROUND) * (j / 6) ** 1.6)}H${W}`;
    s += `<path d="${grid}" stroke="#fff" stroke-width=".7" opacity=".35"/><path d="M0 ${GROUND}H${W}" stroke="#fff" stroke-width="1.5" opacity=".8"/>`;
    // purpurina y destellos
    let gl = '';
    for (let i = 0; i < 120; i++) gl += `<circle cx="${n(rnd() * W)}" cy="${n(rnd() * GROUND)}" r="${n(0.4 + rnd() * 1.1)}" fill="${rb[Math.floor(rnd() * rb.length)]}" opacity="${n(0.4 + rnd() * 0.6)}"/>`;
    s += gl;
    let sp = '';
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W;
      const y = rnd() * (GROUND - 20);
      const r = 3 + rnd() * 6;
      sp += `M${n(x)} ${n(y - r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + r)}Q${n(x)} ${n(y)} ${n(x - r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - r)}Z`;
    }
    s += `<path d="${sp}" fill="#fff" filter="url(#${p}gw)"/>`;
    return s;
  },

  sumie(p, rnd) {
    const ink = '#1d1b19';
    let s = `<defs>${bdGrain(`${p}g`, rnd, [0.55, 0.5, 0.42], 1.3, -0.74, 0.6)}<filter id="${p}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>`
      + `<filter id="${p}r" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="${Math.floor(rnd() * 900)}"/><feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>`
      + `<linearGradient id="${p}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ink}" stop-opacity=".45"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${p}m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ink}" stop-opacity=".2"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></linearGradient></defs>`;
    s += `<rect width="${W}" height="${W}" fill="#f3eee2"/>`;
    // montañas en aguada que se pierden en la niebla
    const range = (base, amp, fill) => {
      let d = `M-10 ${base + 40}`;
      for (let x = -10; x <= W + 10; x += 25) d += `L${x} ${n(base - amp * (0.3 + rnd() * 0.7) * (x % 50 ? 0.6 : 1))}`;
      return `<path d="${d}L${W + 10} ${base + 40}Z" fill="url(#${fill})" filter="url(#${p}b)"/>`;
    };
    s += range(120, 50, `${p}m2`) + range(170, 60, `${p}m`);
    // ensō detrás del ot
    const a0 = rnd() * Math.PI * 2;
    const R = 98;
    const end = a0 + Math.PI * 1.82;
    const pt = (a) => `${n(150 + Math.cos(a) * R)} ${n(140 + Math.sin(a) * R)}`;
    s += `<g filter="url(#${p}r)"><path d="M${pt(a0)}A${R} ${R} 0 1 1 ${pt(end)}" fill="none" stroke="${ink}" stroke-width="11" stroke-linecap="round" opacity=".82"/>`
      + `<path d="M${pt(a0 + 0.3)}A${R + 4} ${R + 4} 0 0 1 ${pt(a0 + 1.6)}" fill="none" stroke="#f3eee2" stroke-width="1.6" stroke-dasharray="14 6 30 4" opacity=".8"/></g>`;
    // bambú a un lado
    const bx = rnd() < 0.5 ? 30 : 262;
    let bam = '';
    for (let k = 0; k < 2; k++) {
      const x = bx + k * 14;
      for (let y = 10 + k * 30; y < GROUND; y += 34) bam += `<rect x="${x - 4}" y="${y}" width="8" height="31" rx="2"/>`;
    }
    let lv = '';
    for (let i = 0; i < 7; i++) {
      const x = bx + (rnd() - 0.3) * 20;
      const y = 30 + rnd() * 140;
      const dir = rnd() < 0.5 ? -1 : 1;
      lv += `<path d="M${n(x)} ${n(y)}q${n(dir * 14)} ${n(-4)} ${n(dir * 30)} ${n(6 + rnd() * 6)}q${n(-dir * 14)} ${n(2)} ${n(-dir * 30)} ${n(-6 - rnd() * 6)}Z"/>`;
    }
    s += `<g fill="${ink}" opacity=".78" filter="url(#${p}r)">${bam}${lv}</g>`;
    // pincelada del suelo y caligrafía vertical
    s += `<path d="M20 ${GROUND + 6}C80 ${GROUND - 4} 200 ${GROUND - 2} 286 ${GROUND + 4}L282 ${GROUND + 10}C200 ${GROUND + 6} 100 ${GROUND + 12} 24 ${GROUND + 12}Z" fill="${ink}" opacity=".7" filter="url(#${p}r)"/>`;
    const cx = bx < 150 ? 270 : 26;
    let cal = '';
    for (let i = 0; i < 4; i++) {
      const y = 26 + i * 22;
      cal += `M${cx - 6} ${y}h12M${cx} ${y - 5}v13M${cx - 5} ${y + 6}l${n(4 + rnd() * 4)} ${n(3 + rnd() * 3)}`;
    }
    s += `<path d="${cal}" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".75"/>`;
    // sello rojo
    s += `<g transform="rotate(-4 ${cx} 128)"><rect x="${cx - 10}" y="118" width="20" height="22" rx="2" fill="#b8352a"/><path d="M${cx - 6} 123h12M${cx} 123v13M${cx - 6} 129h12M${cx - 5} 136h10" stroke="#f3eee2" stroke-width="1.6" fill="none"/></g>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  tarot(p, rnd) {
    const navy = '#1c2a5a';
    const gold = '#c9a23a';
    const cream = '#efe3c4';
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
    let s = `<defs>${bdGrain(`${p}g`, rnd, [0.35, 0.25, 0.1], 1.2, -0.66)}</defs>`;
    s += `<rect width="${W}" height="${W}" fill="${cream}"/><rect x="12" y="12" width="${W - 24}" height="${W - 24}" rx="6" fill="${navy}"/>`;
    // estrellas
    let st = '';
    for (let i = 0; i < 40; i++) st += `<circle cx="${n(18 + rnd() * (W - 36))}" cy="${n(46 + rnd() * 180)}" r="${n(0.5 + rnd() * 0.9)}"/>`;
    s += `<g fill="${cream}" opacity=".8">${st}</g>`;
    let big = '';
    for (let i = 0; i < 7; i++) big += star5(24 + rnd() * (W - 48), 52 + rnd() * 150, 3 + rnd() * 3);
    s += `<path d="${big}" fill="${gold}"/>`;
    // anillos radiantes detrás del ot
    s += `<g fill="none" stroke="${gold}" opacity=".35"><circle cx="150" cy="150" r="74" stroke-width="1.2"/><circle cx="150" cy="150" r="86" stroke-width=".8" stroke-dasharray="2 5"/><circle cx="150" cy="150" r="100" stroke-width=".8"/></g>`;
    // luna creciente y sol con cara
    const left = rnd() < 0.5;
    const mx = left ? 58 : 242;
    const sx = left ? 242 : 58;
    s += `<path d="M${mx} 52A24 24 0 1 0 ${mx} 100A19 19 0 1 1 ${mx} 52Z" fill="${gold}" transform="rotate(${left ? -20 : 20} ${mx} 76)"/>`;
    let rays = '';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r1 = i % 2 ? 30 : 36;
      rays += `M${n(sx + Math.cos(a - 0.12) * 19)} ${n(76 + Math.sin(a - 0.12) * 19)}L${n(sx + Math.cos(a) * r1)} ${n(76 + Math.sin(a) * r1)}L${n(sx + Math.cos(a + 0.12) * 19)} ${n(76 + Math.sin(a + 0.12) * 19)}Z`;
    }
    s += `<path d="${rays}" fill="${gold}"/><circle cx="${sx}" cy="76" r="18" fill="${gold}" stroke="${navy}" stroke-width="1"/>`;
    s += `<circle cx="${sx - 6}" cy="73" r="1.8" fill="${navy}"/><circle cx="${sx + 6}" cy="73" r="1.8" fill="${navy}"/><path d="M${sx - 6} 82Q${sx} 87 ${sx + 6} 82" fill="none" stroke="${navy}" stroke-width="1.4" stroke-linecap="round"/>`;
    // tierra y agua estilizadas
    s += `<path d="M12 ${GROUND}Q80 ${GROUND - 16} 150 ${GROUND}T${W - 12} ${GROUND - 4}V${W - 40}H12Z" fill="#2f7f7a"/><path d="M12 ${GROUND}Q80 ${GROUND - 16} 150 ${GROUND}T${W - 12} ${GROUND - 4}" fill="none" stroke="${gold}" stroke-width="1.6"/>`;
    let wv = '';
    for (let y = GROUND + 12; y < W - 42; y += 8) wv += `M20 ${y}q10 -4 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0`;
    s += `<path d="${wv}" fill="none" stroke="${cream}" stroke-width="1" opacity=".35"/>`;
    // filete dorado doble, cartelas con número y ornamento
    s += `<rect x="18" y="18" width="${W - 36}" height="${W - 36}" rx="4" fill="none" stroke="${gold}" stroke-width="2.4"/><rect x="23" y="23" width="${W - 46}" height="${W - 46}" rx="3" fill="none" stroke="${gold}" stroke-width=".8"/>`;
    s += `<rect x="110" y="16" width="80" height="22" rx="2" fill="${cream}" stroke="${gold}" stroke-width="1.6"/>`;
    s += `<text x="150" y="33" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="15" letter-spacing="2" fill="${navy}">${ROMAN[Math.floor(rnd() * ROMAN.length)]}</text>`;
    s += `<rect x="70" y="${W - 40}" width="160" height="22" rx="2" fill="${cream}" stroke="${gold}" stroke-width="1.6"/><path d="${star5(150, W - 29, 5)}${star5(120, W - 29, 3)}${star5(180, W - 29, 3)}" fill="${navy}"/><path d="M84 ${W - 29}H108M192 ${W - 29}H216" stroke="${navy}" stroke-width="1"/>`;
    for (const [x, y] of [[18, 18], [W - 18, 18], [18, W - 18], [W - 18, W - 18]]) s += `<path d="M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z" fill="${gold}"/>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  retro70(p, rnd) {
    const cols = ['#4a2c1e', '#8a4b2a', '#c94f2c', '#e8762c', '#f2b33d'];
    let s = `<defs>${bdGrain(`${p}g`, rnd, [0.35, 0.22, 0.1], 1.3, -0.7)}</defs>`;
    s += `<rect width="${W}" height="${W}" fill="#f6e8c8"/>`;
    // rayos de sol desde el horizonte
    let rays = '';
    const ox = 150;
    for (let i = 0; i < 24; i += 2) {
      const a0 = Math.PI + (i / 24) * Math.PI;
      const a1 = Math.PI + ((i + 1) / 24) * Math.PI;
      rays += `M${ox} ${GROUND}L${n(ox + Math.cos(a0) * 400)} ${n(GROUND + Math.sin(a0) * 400)}L${n(ox + Math.cos(a1) * 400)} ${n(GROUND + Math.sin(a1) * 400)}Z`;
    }
    s += `<path d="${rays}" fill="#f2c46d" opacity=".55"/>`;
    // arcoíris setentero
    cols.forEach((c, i) => {
      const r = 132 - i * 17;
      s += `<path d="M${ox - r} ${GROUND}A${r} ${r} 0 0 1 ${ox + r} ${GROUND}" fill="none" stroke="${c}" stroke-width="14"/>`;
    });
    s += `<path d="M${ox - 48} ${GROUND}A48 48 0 0 1 ${ox + 48} ${GROUND}Z" fill="#f6e8c8"/>`;
    // nubes redondas en dos tonos
    for (let i = 0; i < 2; i++) {
      const x = i ? 238 + rnd() * 30 : 34 + rnd() * 30;
      const y = 40 + rnd() * 40;
      s += `<path d="M${n(x - 26)} ${n(y + 8)}a9 9 0 0 1 10 -12a13 13 0 0 1 24 -2a9 9 0 0 1 18 14Z" fill="#fff8e8" stroke="#8a4b2a" stroke-width="2"/>`;
    }
    // suelo con ondas
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#8a4b2a"/>`;
    ['#c94f2c', '#e8762c', '#f2b33d'].forEach((c, i) => {
      const y = GROUND + 12 + i * 12;
      s += `<path d="M-10 ${y}q20 -8 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0" fill="none" stroke="${c}" stroke-width="5"/>`;
    });
    // margaritas
    const daisy = (x, y, r) => {
      let pe = '';
      for (let i = 0; i < 8; i++) pe += `<ellipse cx="${n(x)}" cy="${n(y - r)}" rx="${n(r * 0.42)}" ry="${n(r * 0.75)}" transform="rotate(${i * 45} ${n(x)} ${n(y)})"/>`;
      return `<path d="M${n(x)} ${n(y)}V${GROUND + 4}" stroke="#6b7a3a" stroke-width="3"/><g fill="#fffaf0" stroke="#4a2c1e" stroke-width="1.2">${pe}</g><circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.45)}" fill="#f2b33d" stroke="#4a2c1e" stroke-width="1.2"/>`;
    };
    s += daisy(28 + rnd() * 12, GROUND - 28, 11) + daisy(64 + rnd() * 10, GROUND - 12, 8) + daisy(262 + rnd() * 12, GROUND - 32, 12) + daisy(228 + rnd() * 8, GROUND - 10, 7);
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  mosaic(p, rnd) {
    const T = 12;
    const BAND = 18;
    const sx = 60 + rnd() * 180;
    const sy = 64;
    const col = (x, y) => {
      if ((x - sx) ** 2 + (y - sy) ** 2 < 26 ** 2) return (x - sx) ** 2 + (y - sy) ** 2 < 14 ** 2 ? '#e6c26a' : '#d98a3a';
      const hill = GROUND - 30 + Math.sin(x / 40 + sx) * 14;
      if (y > GROUND) return rnd() < 0.5 ? '#b5452e' : '#a03c2a';
      if (y > hill) return rnd() < 0.5 ? '#6a8a4a' : '#5a7a3e';
      return mix('#2c4a6e', '#8ab0c0', Math.min(1, y / 200));
    };
    let s = `<rect width="${W}" height="${W}" fill="#b8ad98"/>`;
    let tiles = '';
    for (let y = BAND; y < W - BAND; y += T) {
      for (let x = BAND; x < W - BAND; x += T) {
        const c = mix(col(x + T / 2, y + T / 2), rnd() < 0.5 ? '#ffffff' : '#000000', rnd() * 0.12);
        const j = () => (rnd() - 0.5) * 1.6;
        tiles += `<rect x="${n(x + 1 + j())}" y="${n(y + 1 + j())}" width="${n(T - 2 + j() * 0.5)}" height="${n(T - 2 + j() * 0.5)}" fill="${c}" transform="rotate(${n((rnd() - 0.5) * 6)} ${x + T / 2} ${y + T / 2})"/>`;
      }
    }
    s += tiles;
    // greca en la cenefa
    s += `<path d="M0 0H${W}V${W}H0ZM${BAND} ${BAND}V${W - BAND}H${W - BAND}V${BAND}Z" fill-rule="evenodd" fill="#efe4cc"/>`;
    const key = (x) => `M${x} 14V4H${x + 12}V10H${x + 6}V8`;
    let k = '';
    for (let x = 2; x < W - 10; x += 16) k += key(x);
    const band = `<path d="${k}" fill="none" stroke="#3a3530" stroke-width="2.2"/>`;
    s += band + `<g transform="translate(0 ${W - 18})">${band}</g><g transform="translate(18 0) rotate(90)">${band}</g><g transform="translate(${W} 0) rotate(90)">${band}</g>`;
    s += `<path d="M${BAND} ${BAND}H${W - BAND}V${W - BAND}H${BAND}Z" fill="none" stroke="#3a3530" stroke-width="2"/>`;
    return s;
  },

  neonsign(p, rnd) {
    const tubes = ['#ff4fd8', '#3ef0ff', '#ffe14f', '#7dff6a', '#ff6a3d'];
    const t1 = tubes[Math.floor(rnd() * tubes.length)];
    const t2 = tubes.filter((c) => c !== t1)[Math.floor(rnd() * (tubes.length - 1))];
    let s = `<defs><pattern id="${p}br" width="32" height="18" patternUnits="userSpaceOnUse"><rect width="32" height="18" fill="#140c10"/><rect x="1" y="1" width="30" height="7.5" rx="1" fill="#2e1c22"/><rect x="-15" y="10" width="30" height="7.5" rx="1" fill="#2a191f"/><rect x="17" y="10" width="30" height="7.5" rx="1" fill="#33202a"/></pattern>`
      + `<radialGradient id="${p}vg" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="${t1}" stop-opacity=".22"/><stop offset=".55" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>`
      + `<filter id="${p}n" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.5" result="a"/><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      + `<filter id="${p}rf" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5 2"/></filter></defs>`;
    s += `<rect width="${W}" height="${GROUND}" fill="url(#${p}br)"/><rect width="${W}" height="${GROUND}" fill="url(#${p}vg)"/>`;
    // letrero principal con su cable
    s += `<path d="M110 0V22M190 0V22" stroke="#0a0608" stroke-width="1.5"/>`;
    const font = 'font-family="\'Brush Script MT\',\'Segoe Script\',\'URW Chancery L\',cursive" font-style="italic" font-weight="bold" font-size="46" text-anchor="middle"';
    s += `<g filter="url(#${p}n)"><text x="150" y="66" ${font} fill="none" stroke="${t1}" stroke-width="3.2" stroke-linejoin="round">7ots</text></g>`;
    s += `<text x="150" y="66" ${font} fill="none" stroke="#fff" stroke-width="1" opacity=".75">7ots</text>`;
    // corazón y flecha de neón a los lados
    const left = rnd() < 0.5;
    const hx = left ? 46 : 254;
    const ax = left ? 254 : 46;
    s += `<g filter="url(#${p}n)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M${hx} 138C${hx - 26} 120 ${hx - 16} 98 ${hx} 110C${hx + 16} 98 ${hx + 26} 120 ${hx} 138Z" stroke="${t2}" stroke-width="3"/>`
      + `<path d="M${ax + (left ? 22 : -22)} 150H${ax - (left ? 18 : -18)}M${ax - (left ? 6 : -6)} 140L${ax - (left ? 18 : -18)} 150L${ax - (left ? 6 : -6)} 160" stroke="${t1}" stroke-width="3"/></g>`;
    s += `<path d="M${hx} 138C${hx - 26} 120 ${hx - 16} 98 ${hx} 110C${hx + 16} 98 ${hx + 26} 120 ${hx} 138Z" fill="none" stroke="#fff" stroke-width=".9" opacity=".7"/>`;
    // vereda mojada con reflejos
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#0c0a10"/><path d="M0 ${GROUND}H${W}" stroke="#2a2030" stroke-width="2"/>`;
    s += `<g filter="url(#${p}rf)" opacity=".5"><rect x="110" y="${GROUND + 8}" width="80" height="34" fill="${t1}"/><rect x="${hx - 12}" y="${GROUND + 10}" width="24" height="26" fill="${t2}"/><rect x="${ax - 14}" y="${GROUND + 14}" width="28" height="18" fill="${t1}"/></g>`;
    let wet = '';
    for (let i = 0; i < 10; i++) wet += `M${n(rnd() * W)} ${n(GROUND + 8 + rnd() * 50)}h${n(10 + rnd() * 30)}`;
    s += `<path d="${wet}" stroke="#fff" stroke-width="1" opacity=".15"/>`;
    return s;
  },

  graffiti(p, rnd) {
    const cols = ['#ff2e63', '#08d9d6', '#f9ed32', '#7cfc00', '#ff8c00', '#9b5de5', '#00bbf9'];
    const pick = () => cols[Math.floor(rnd() * cols.length)];
    let s = `<defs>${bdGrain(`${p}g`, rnd, [0.3, 0.3, 0.3], 1.4, -0.72, 0.8)}<filter id="${p}sp" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="${Math.floor(rnd() * 900)}" result="n"/><feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b"/><feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  10 0 0 0 -5.6" result="m"/><feComposite in="b" in2="m" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    // muro de hormigón en paneles
    s += `<rect width="${W}" height="${GROUND}" fill="#b9b5ad"/><path d="M100 0V${GROUND}M200 0V${GROUND}M0 120H${W}" stroke="#8f8b84" stroke-width="2"/>`;
    // pieza de fondo: burbujas superpuestas con contorno negro, brillo y chorreones
    const c1 = pick();
    const c2 = cols.filter((c) => c !== c1)[Math.floor(rnd() * (cols.length - 1))];
    let blobs = '';
    const B = [[96, 112, 46], [150, 92, 54], [206, 116, 44]];
    for (const [x, y, r] of B) blobs += `<circle cx="${x}" cy="${y}" r="${r}"/>`;
    let drips = '';
    for (let i = 0; i < 7; i++) {
      const x = 70 + rnd() * 160;
      const h = 20 + rnd() * 60;
      drips += `M${n(x)} 140V${n(140 + h)}`;
    }
    s += `<g filter="url(#${p}sp)"><g fill="#111" transform="translate(5 5)">${blobs}</g><g fill="${c1}" stroke="#111" stroke-width="5">${blobs}</g><g fill="${c1}">${blobs}</g>`
      + `<path d="${drips}" stroke="${c1}" stroke-width="5" stroke-linecap="round"/>`
      + `<circle cx="150" cy="92" r="30" fill="${c2}" opacity=".85"/><path d="M80 96Q84 78 100 74M136 62Q144 50 160 50" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>`;
    // tags y una corona
    const tag = (x, y, c) => {
      let d = `M${n(x)} ${n(y)}`;
      for (let i = 0; i < 6; i++) d += `q${n(4 + rnd() * 8)} ${n(-12 - rnd() * 10)} ${n(10 + rnd() * 6)} ${n(-2 + rnd() * 4)}t${n(6 + rnd() * 6)} ${n(10 + rnd() * 6)}`;
      return `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    };
    s += tag(14, 40, '#111') + tag(196, 210, '#6a2c8c') + tag(16, 222, '#111');
    const kx = 238 + rnd() * 20;
    s += `<path d="M${n(kx - 20)} 50L${n(kx - 22)} 26L${n(kx - 10)} 38L${n(kx)} 20L${n(kx + 10)} 38L${n(kx + 22)} 26L${n(kx + 20)} 50Z" fill="none" stroke="${pick()}" stroke-width="3" stroke-linejoin="round"/>`;
    // salpicaduras
    let sp = '';
    for (let i = 0; i < 40; i++) sp += `<circle cx="${n(rnd() * W)}" cy="${n(rnd() * GROUND)}" r="${n(0.6 + rnd() * 1.8)}" fill="${pick()}" opacity=".8"/>`;
    s += sp;
    // asfalto con manchas de pintura y un aerosol tirado
    s += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#4a4a4e"/><path d="M0 ${GROUND}H${W}" stroke="#2e2e32" stroke-width="3"/>`;
    for (let i = 0; i < 3; i++) s += `<ellipse cx="${n(30 + rnd() * 240)}" cy="${n(GROUND + 20 + rnd() * 30)}" rx="${n(8 + rnd() * 14)}" ry="${n(3 + rnd() * 4)}" fill="${pick()}" opacity=".85"/>`;
    const cx = rnd() < 0.5 ? 40 : 250;
    const cc = pick();
    s += `<g transform="rotate(-12 ${cx} ${GROUND + 20})"><rect x="${cx - 9}" y="${GROUND - 14}" width="18" height="36" rx="4" fill="${cc}" stroke="#111" stroke-width="2"/><rect x="${cx - 9}" y="${GROUND - 2}" width="18" height="8" fill="#fff"/><rect x="${cx - 6}" y="${GROUND - 22}" width="12" height="9" rx="3" fill="#ddd" stroke="#111" stroke-width="2"/><rect x="${cx - 2}" y="${GROUND - 26}" width="4" height="5" fill="#111"/></g>`;
    s += `<rect width="${W}" height="${W}" filter="url(#${p}g)"/>`;
    return s;
  },

  thermal(p, rnd) {
    const ramp = ['#0a0520', '#2a0a6a', '#8a1a8a', '#e8401c', '#ffb000', '#fffbe0'];
    let s = `<defs><linearGradient id="${p}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07031a"/><stop offset="1" stop-color="#26105e"/></linearGradient>`
      + `<linearGradient id="${p}sc" x1="0" y1="1" x2="0" y2="0">${ramp.map((c, i) => `<stop offset="${n(i / (ramp.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`
      + `<radialGradient id="${p}hot"><stop offset="0" stop-color="#fffbe0"/><stop offset=".25" stop-color="#ffb000"/><stop offset=".55" stop-color="#e8401c" stop-opacity=".8"/><stop offset=".8" stop-color="#8a1a8a" stop-opacity=".4"/><stop offset="1" stop-color="#2a0a6a" stop-opacity="0"/></radialGradient>`
      + `<filter id="${p}bl" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.4"/></filter>${bdGrain(`${p}g`, rnd, [1, 1, 1], 0.9, -0.52, 1.2)}</defs>`;
    let g = `<rect width="${W}" height="${W}" fill="url(#${p}sk)"/>`;
    // edificios fríos con alguna ventana tibia
    let bld = '';
    let win = '';
    for (let x = -10; x < W; x += 34 + rnd() * 20) {
      const w = 30 + rnd() * 26;
      const h = 60 + rnd() * 90;
      bld += `<rect x="${n(x)}" y="${n(GROUND - h)}" width="${n(w)}" height="${n(h)}"/>`;
      for (let wy = GROUND - h + 10; wy < GROUND - 14; wy += 16) for (let wx = x + 6; wx < x + w - 10; wx += 12) if (rnd() < 0.3) win += `<rect x="${n(wx)}" y="${n(wy)}" width="6" height="8" fill="${rnd() < 0.3 ? '#e8401c' : '#8a1a8a'}"/>`;
    }
    g += `<g fill="#1a0848">${bld}</g>${win}`;
    // farol caliente (a la izquierda: la escala va a la derecha)
    const lx = 44 + rnd() * 10;
    g += `<rect x="${n(lx - 2)}" y="116" width="4" height="${GROUND - 116}" fill="#2a0a6a"/><circle cx="${n(lx)}" cy="112" r="30" fill="url(#${p}hot)"/>`;
    // suelo frío
    g += `<rect y="${GROUND}" width="${W}" height="${W - GROUND}" fill="#140838"/><path d="M0 ${GROUND}H${W}" stroke="#2a0a6a" stroke-width="3"/>`;
    g += `<ellipse cx="150" cy="${GROUND + 6}" rx="56" ry="7" fill="#8a1a8a" opacity=".55"/>`;
    let s2 = `${s}<g filter="url(#${p}bl)">${g}</g><rect width="${W}" height="${W}" filter="url(#${p}g)" opacity=".5"/>`;
    // HUD: esquinas, mira, escala de color y lecturas
    const hud = '#f4f0ff';
    s2 += `<g fill="none" stroke="${hud}" stroke-width="2" opacity=".85"><path d="M26 44V26H44M${W - 44} 26H${W - 26}V44M26 ${W - 44}V${W - 26}H44M${W - 44} ${W - 26}H${W - 26}V${W - 44}"/><path d="M150 132V142M150 158V168M132 150H142M158 150H168" stroke-width="1.4"/></g>`;
    s2 += `<rect x="${W - 46}" y="66" width="9" height="140" fill="url(#${p}sc)" stroke="${hud}" stroke-width=".8"/>`;
    const tmax = (36 + rnd() * 2).toFixed(1);
    const tmin = (8 + rnd() * 6).toFixed(1);
    s2 += `<g font-family="monospace" fill="${hud}"><text x="${W - 42}" y="61" font-size="8" text-anchor="middle">${tmax}°</text><text x="${W - 42}" y="216" font-size="8" text-anchor="middle">${tmin}°</text>`
      + `<text x="34" y="58" font-size="14" font-weight="bold">${(36.2 + rnd() * 0.8).toFixed(1)}°C</text><text x="34" y="70" font-size="7" opacity=".8">ε 0.95  ⌀ ${Math.floor(2 + rnd() * 3)}.${Math.floor(rnd() * 9)}m</text>`
      + `<text x="34" y="${W - 34}" font-size="8"><tspan fill="#ff4a3a">●</tspan> REC</text></g>`;
    return s2;
  },
};

/**
 * Contenido del fondo de un estilo en el marco 0 0 300 300 ('' sin estilo).
 * @param {string} style
 * @param {number} seed   styleSeed(spec)
 * @param {string} [prefix]  prefijo de ids (único si el fondo va dentro de otro SVG)
 */
export function styleBackdrop(style, seed, prefix = 'bd') {
  const f = BACKDROPS[style];
  return f ? f(`${prefix}-`, seeded((seed ^ 0x9e3779b9) >>> 0)) : '';
}

/** Fondo como documento SVG independiente (para background-image o un <img>). */
export function backdropSVG(style, seed) {
  const inner = styleBackdrop(style, seed);
  return inner ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" preserveAspectRatio="xMidYMax slice">${inner}</svg>` : '';
}

/** Fondo como url("data:…") para CSS (se rasteriza una vez: no cuesta nada al animar). */
export function backdropCSS(style, seed) {
  const svg = backdropSVG(style, seed);
  return svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : '';
}

/** Fondo anidado que cubre un viewBox 'x y w h' (para SVG estáticos). */
export function backdropIn(style, seed, viewBox, prefix) {
  const inner = styleBackdrop(style, seed, prefix);
  if (!inner) return '';
  const [x, y, w, h] = String(viewBox).split(/[\s,]+/).map(Number);
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${W} ${W}" preserveAspectRatio="xMidYMax slice" overflow="hidden">${inner}</svg>`;
}
