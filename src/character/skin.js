/**
 * Piel del personaje 2D: texturas procedurales de superficie y uniones de las piezas que
 * «crecen» del cuerpo (pinchos, cuernos, alas, brazos, orejas, colas).
 *
 * Texturas (spec.texture, catálogo TEXTURES de parts.js): pelo, pelusa, escamas, plumas, pecas,
 * anillos, gelatina y paneles. 'auto' (o ausente) elige una según forma, patrón y acabado, y el
 * azar de cada textura sale de un hash de la spec: el mismo personaje (la misma semilla de
 * identidad) siempre tiene la misma piel, y las semillas antiguas no cambian de forma ni color.
 *
 * Todo es estático y barato: <pattern> en espacio de usuario (con la deformación del contorno
 * aplicada por patternTransform), trazos recortados al cuerpo y, solo en calidad 'full', un
 * grano feTurbulence que no se usa nunca mientras el contorno se anima. Calidades:
 *   full · todo  ·  lite · sin filtros  ·  off · sin textura
 *
 * Piezas unidas: comparten el relleno del cuerpo (degradado en espacio de usuario + textura),
 * van detrás del cuerpo con la base hundida en él y el contorno del cuerpo se recorta con una
 * máscara donde nacen (silueta única, con «filete» en la base), más una sombra de contacto.
 */

import { shade, hexToRgb } from './parts.js';

const n = (v) => Math.round(v * 100) / 100;

/** Azar determinista (mulberry32). */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash FNV-1a de lo que define el aspecto (no los puntos editados: arrastrar no cambia la piel). */
export function skinHash(spec) {
  const s = `${spec.body.shape}|${spec.body.color}|${spec.finish}|${spec.body.pattern}|${spec.body.patternColor}|${spec.eyes.type}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Candidatas para 'auto' por forma (se elige con el hash; las repetidas pesan más).
const AUTO = {
  ghost: ['gloss', 'gloss', 'speckles'],
  drop: ['gloss', 'gloss', 'scales'],
  blob: ['gloss', 'fuzz', 'speckles'],
  heart: ['gloss', 'fuzz'],
  mushroom: ['speckles', 'fuzz'],
  cloud: ['fuzz', 'fur'],
  wide: ['scales', 'ridges', 'fuzz', 'speckles'],
  tall: ['ridges', 'scales', 'fur', 'speckles'],
  squircle: ['scales', 'fuzz', 'speckles', 'panels'],
  // catálogo 2 (formas nuevas; las antiguas no cambian)
  bear: ['fur', 'fur', 'fuzz'],
  owl: ['feathers', 'feathers', 'fuzz'],
  slime: ['gloss', 'gloss', 'speckles'],
  gem: ['gloss', 'panels'],
  barrel: ['ridges', 'panels'],
  capsule: ['gloss', 'panels', 'none'],
  potato: ['speckles', 'speckles', 'fuzz'],
  apple: ['gloss', 'speckles'],
  lemon: ['speckles', 'gloss'],
  peanut: ['speckles', 'ridges'],
  bun: ['fuzz', 'speckles', 'none'],
  onigiri: ['none', 'speckles'],
  bell: ['gloss', 'none'],
  flame: ['gloss', 'fuzz'],
  alien: ['gloss', 'scales', 'speckles'],
  chubby: ['fur', 'fuzz', 'speckles'],
};
const AUTO_ANY = ['fur', 'fuzz', 'scales', 'feathers', 'speckles', 'ridges', 'gloss', 'fuzz', 'fur', 'none'];

/** Textura efectiva de una spec normalizada ('auto' → la que le va a ese personaje). */
export function textureOf(spec) {
  const t = spec.texture;
  if (t && t !== 'auto') return t;
  const f = spec.finish;
  const sh = spec.body.shape;
  if (f === 'neon' || f === 'sketch') return 'none';
  if (f === 'metal' || f === 'glass' || f === 'holo' || f === 'pearl') return 'none'; // acabados lisos del catálogo 2
  if (sh === 'robot' || spec.body.pattern === 'circuit') return 'panels';
  if (sh === 'cat' || spec.body.pattern === 'tiger' || spec.accessories.some((a) => a.id === 'catears' || a.id === 'bunny')) return 'fur';
  const h = skinHash(spec);
  if (f === 'clay') return h % 3 ? 'fuzz' : 'speckles';
  const pool = AUTO[sh] || AUTO_ANY;
  return pool[h % pool.length];
}

// ───────────────────────────── geometría del borde ─────────────────────────────

/**
 * Muestras sobre el contorno (la misma Catmull-Rom que splinePath): [x, y, nx, ny] con la
 * normal exterior. `per`: muestras por tramo.
 */
export function edgeSamples(pts, per) {
  const N = pts.length;
  const P = (i) => pts[(i + N) % N];
  const out = [];
  for (let i = 0; i < N; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let k = 0; k < per; k++) {
      const t = (k + 0.5) / per;
      const u = 1 - t;
      const x = u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0];
      const y = u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1];
      const dx = 3 * u * u * (c1[0] - p1[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p2[0] - c2[0]);
      const dy = 3 * u * u * (c1[1] - p1[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p2[1] - c2[1]);
      const l = Math.hypot(dx, dy) || 1;
      out.push([x, y, dy / l, -dx / l]);
    }
  }
  return out;
}

// ───────────────────────────── teselas ─────────────────────────────

/** Copias de un elemento (caja [x0,y0,x1,y1]) que caen dentro de la tesela W×H, para que no se corte. */
function wrap(b, W, H) {
  const out = [];
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      if (b[2] + dx < 0 || b[0] + dx > W || b[3] + dy < 0 || b[1] + dy > H) continue;
      out.push([dx, dy]);
    }
  }
  return out;
}
const dot = (x, y, r) => `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
const ink = (d, color, op, w) => (d ? `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${n(w)}" stroke-linecap="round"/>` : '');
const blot = (d, color, op) => (d ? `<path d="${d}" fill="${color}" fill-opacity="${op}"/>` : '');

/** Mechones cortos, peinados hacia abajo. */
function furTile(u, r) {
  const W = 16 * u;
  let dk = '';
  let lt = '';
  for (let i = 0; i < 11; i++) {
    const x = r() * W;
    const y = r() * W;
    const a = Math.PI / 2 + (r() - 0.5) * 0.9;
    const len = (3.5 + r() * 3.2) * u;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    const bend = (r() - 0.5) * 2.2 * u;
    const qx = dx / 2 - Math.sin(a) * bend;
    const qy = dy / 2 + Math.cos(a) * bend;
    for (const [ox, oy] of wrap([Math.min(x, x + dx) - u, Math.min(y, y + dy) - u, Math.max(x, x + dx) + u, Math.max(y, y + dy) + u], W, W)) {
      dk += `M${n(x + ox)} ${n(y + oy)}q${n(qx)} ${n(qy)} ${n(dx)} ${n(dy)}`;
      lt += `M${n(x + ox - 0.8 * u)} ${n(y + oy - 0.6 * u)}q${n(qx)} ${n(qy)} ${n(dx * 0.8)} ${n(dy * 0.8)}`;
    }
  }
  return { W, H: W, body: ink(dk, '#000', 0.2, 0.85 * u) + ink(lt, '#fff', 0.22, 0.6 * u) };
}

/** Punteado fino de dos tonos. */
function fuzzTile(u, r) {
  const W = 9 * u;
  let dk = '';
  let lt = '';
  for (let i = 0; i < 12; i++) {
    const x = r() * W;
    const y = r() * W;
    const rr = (0.35 + r() * 0.45) * u;
    for (const [ox, oy] of wrap([x - rr, y - rr, x + rr, y + rr], W, W)) {
      if (i % 2) lt += dot(x + ox, y + oy, rr);
      else dk += dot(x + ox, y + oy, rr);
    }
  }
  return { W, H: W, body: blot(dk, '#000', 0.14) + blot(lt, '#fff', 0.2) };
}

/** Escamas solapadas: medias lunas con brillo interior. */
function scalesTile(u) {
  const rr = 5 * u;
  const W = rr * 2;
  const H = rr * 1.6;
  let dk = '';
  let lt = '';
  for (const [cx, cy] of [[0, 0], [W, 0], [rr, H / 2]]) {
    for (const [ox, oy] of wrap([cx - rr, cy, cx + rr, cy + rr], W, H)) {
      const x = cx + ox;
      const y = cy + oy;
      dk += `M${n(x - rr)} ${n(y)}a${n(rr)} ${n(rr)} 0 0 0 ${n(rr * 2)} 0`;
      lt += `M${n(x - rr * 0.55)} ${n(y + rr * 0.3)}a${n(rr * 0.6)} ${n(rr * 0.5)} 0 0 0 ${n(rr * 1.1)} 0`;
    }
  }
  return { W, H, body: ink(dk, '#000', 0.2, 0.75 * u) + ink(lt, '#fff', 0.22, 0.6 * u) };
}

/** Plumas: U alargadas en filas alternas, con su cañón. */
function feathersTile(u) {
  const W = 12 * u;
  const H = 10 * u;
  const hw = 5.6 * u;
  const hh = 9 * u;
  let dk = '';
  let lt = '';
  for (const [cx, cy] of [[0, 0], [W, 0], [W / 2, H / 2]]) {
    for (const [ox, oy] of wrap([cx - hw, cy, cx + hw, cy + hh], W, H)) {
      const x = cx + ox;
      const y = cy + oy;
      dk += `M${n(x - hw)} ${n(y)}Q${n(x - hw)} ${n(y + hh * 0.9)} ${n(x)} ${n(y + hh)}Q${n(x + hw)} ${n(y + hh * 0.9)} ${n(x + hw)} ${n(y)}`;
      lt += `M${n(x)} ${n(y + u)}V${n(y + hh * 0.75)}`;
    }
  }
  return { W, H, body: ink(dk, '#000', 0.17, 0.8 * u) + ink(lt, '#fff', 0.24, 0.6 * u) };
}

/** Pecas sueltas (para piezas; el cuerpo las lleva repartidas a mano). */
function speckTile(u, r) {
  const W = 14 * u;
  let dk = '';
  for (let i = 0; i < 4; i++) {
    const x = r() * W;
    const y = r() * W;
    const rr = (0.5 + r() * 0.9) * u;
    for (const [ox, oy] of wrap([x - rr, y - rr, x + rr, y + rr], W, W)) dk += dot(x + ox, y + oy, rr);
  }
  return { W, H: W, body: blot(dk, '#000', 0.16) };
}

/** Punto de media: filas de uves. */
function knitTile(u) {
  const W = 7 * u;
  const H = 6 * u;
  let dk = '';
  let lt = '';
  for (const y of [-H, 0, H]) {
    dk += `M0 ${n(y)}L${n(W / 2)} ${n(y + H * 0.9)}L${n(W)} ${n(y)}`;
    lt += `M${n(0.9 * u)} ${n(y + 0.6 * u)}L${n(W / 2)} ${n(y + H * 0.6)}L${n(W - 0.9 * u)} ${n(y + 0.6 * u)}`;
  }
  return { W, H, body: ink(dk, '#000', 0.16, 1.1 * u) + ink(lt, '#fff', 0.22, 0.8 * u) };
}

/** Lunares regulares. */
function polkaTile(u) {
  const W = 14 * u;
  const rr = 2.3 * u;
  let lt = '';
  for (const [x, y] of [[W / 4, W / 4], [(3 * W) / 4, (3 * W) / 4]]) lt += dot(x, y, rr);
  return { W, H: W, body: blot(lt, '#fff', 0.5) };
}

/** Purpurina: destellos de cuatro puntas y motas. */
function glitterTile(u, r) {
  const W = 12 * u;
  const star = (x, y, s) =>
    `M${n(x)} ${n(y - s)}L${n(x + s * 0.22)} ${n(y - s * 0.22)}L${n(x + s)} ${n(y)}L${n(x + s * 0.22)} ${n(y + s * 0.22)}L${n(x)} ${n(y + s)}L${n(x - s * 0.22)} ${n(y + s * 0.22)}L${n(x - s)} ${n(y)}L${n(x - s * 0.22)} ${n(y - s * 0.22)}Z`;
  let lt = '';
  let dk = '';
  for (let i = 0; i < 9; i++) {
    const x = r() * W;
    const y = r() * W;
    const s = (i < 2 ? 1.8 : 0.4 + r() * 0.5) * u;
    for (const [ox, oy] of wrap([x - s, y - s, x + s, y + s], W, W)) {
      if (i < 2) lt += star(x + ox, y + oy, s);
      else if (i % 3) lt += dot(x + ox, y + oy, s);
      else dk += dot(x + ox, y + oy, s);
    }
  }
  return { W, H: W, body: blot(dk, '#000', 0.18) + blot(lt, '#fff', 0.75) };
}

/** Piedra: grietas finas y granitos. */
function stoneTile(u, r) {
  const W = 26 * u;
  const cl = (v) => Math.min(W, Math.max(0, v));
  let ck = '';
  let dk = '';
  let lt = '';
  for (let i = 0; i < 3; i++) {
    let x = r() * W;
    let y = r() * W;
    ck += `M${n(x)} ${n(y)}`;
    const a = r() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const b = a + (r() - 0.5) * 1.4;
      x = cl(x + Math.cos(b) * 4.2 * u);
      y = cl(y + Math.sin(b) * 4.2 * u);
      ck += `L${n(x)} ${n(y)}`;
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = r() * W;
    const y = r() * W;
    const rr = (0.3 + r() * 0.5) * u;
    for (const [ox, oy] of wrap([x - rr, y - rr, x + rr, y + rr], W, W)) {
      if (i % 2) dk += dot(x + ox, y + oy, rr);
      else lt += dot(x + ox, y + oy, rr);
    }
  }
  const lip = `<path d="${ck}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="${n(0.6 * u)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${n(0.6 * u)} ${n(0.6 * u)})"/>`;
  return { W, H: W, body: lip + ink(ck, '#000', 0.3, 0.8 * u) + blot(dk, '#000', 0.18) + blot(lt, '#fff', 0.3) };
}

/** Veta de madera: líneas onduladas verticales. */
function woodTile(u) {
  const W = 10 * u;
  const H = 40 * u;
  const vein = (x, a) => `M${n(x)} 0Q${n(x + a)} ${n(H / 4)} ${n(x)} ${n(H / 2)}Q${n(x - a)} ${n((3 * H) / 4)} ${n(x)} ${n(H)}`;
  return { W, H, body: ink(vein(W * 0.25, 1.8 * u) + vein(W * 0.7, -1.2 * u), '#000', 0.15, 0.9 * u) + ink(vein(W * 0.45, 1.4 * u), '#fff', 0.16, 0.7 * u) };
}

/** Burbujas: aros claros con un brillito. */
function bubblesTile(u, r) {
  const W = 26 * u;
  let ring = '';
  let shine = '';
  // una por cuadrante, desplazada al azar: repartidas sin amontonarse
  for (let i = 0; i < 4; i++) {
    const rr = (1.3 + r() * 2.2) * u;
    const x = ((i % 2) + 0.2 + r() * 0.6) * (W / 2);
    const y = ((i >> 1) + 0.2 + r() * 0.6) * (W / 2);
    for (const [ox, oy] of wrap([x - rr, y - rr, x + rr, y + rr], W, W)) {
      ring += dot(x + ox, y + oy, rr);
      shine += dot(x + ox - rr * 0.38, y + oy - rr * 0.38, rr * 0.28);
    }
  }
  return { W, H: W, body: `<path d="${ring}" fill="#fff" fill-opacity=".12" stroke="#fff" stroke-opacity=".5" stroke-width="${n(0.6 * u)}"/>${blot(shine, '#fff', 0.7)}` };
}

/** Costuras: retales unidos con pespunte. */
function stitchTile(u) {
  const W = 22 * u;
  const seam = `M0 ${n(W / 2)}H${n(W)}M${n(W / 2)} 0V${n(W)}`;
  const st = `M0 ${n(W / 2 + 1.5 * u)}H${n(W)}M${n(W / 2 + 1.5 * u)} 0V${n(W)}`;
  const dash = `<path d="${st}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="${n(0.7 * u)}" stroke-dasharray="${n(1.6 * u)} ${n(1.4 * u)}"/>`;
  return { W, H: W, body: ink(seam, '#000', 0.2, 0.9 * u) + dash };
}

/** Panal: rejilla hexagonal. */
function honeycombTile(u) {
  const s = 4.6 * u;
  const W = Math.sqrt(3) * s;
  const H = 3 * s;
  const hex = (x, y) => `M${n(x)} ${n(y - s)}L${n(x + W / 2)} ${n(y - s / 2)}L${n(x + W / 2)} ${n(y + s / 2)}L${n(x)} ${n(y + s)}L${n(x - W / 2)} ${n(y + s / 2)}L${n(x - W / 2)} ${n(y - s / 2)}Z`;
  let dk = '';
  for (const [x, y] of [[0, 0], [W, 0], [W / 2, H / 2], [0, H], [W, H]]) dk += hex(x, y);
  const edge = (c, op, w, t) => `<path d="${dk}" fill="none" stroke="${c}" stroke-opacity="${op}" stroke-width="${n(w)}" stroke-linejoin="round"${t ? ` transform="translate(0 ${n(t)})"` : ''}/>`;
  return { W, H, body: edge('#fff', 0.2, 0.7 * u, 0.8 * u) + edge('#000', 0.2, 0.9 * u, 0) };
}

/** Acolchado: rombos con botones. */
function quiltTile(u) {
  const W = 16 * u;
  const o = 1.1 * u;
  const dk = `M0 0L${n(W)} ${n(W)}M${n(W)} 0L0 ${n(W)}`;
  const lt = `M0 ${n(o)}L${n(W - o)} ${n(W)}M${n(W)} ${n(o)}L${n(o)} ${n(W)}`;
  let bt = '';
  for (const [x, y] of [[0, 0], [W, 0], [0, W], [W, W], [W / 2, W / 2]]) bt += dot(x, y, 1 * u);
  return { W, H: W, body: ink(lt, '#fff', 0.2, 1 * u) + ink(dk, '#000', 0.15, 1.1 * u) + blot(bt, '#000', 0.22) };
}

const TILES = {
  fur: furTile,
  fuzz: fuzzTile,
  scales: scalesTile,
  feathers: feathersTile,
  speckles: speckTile,
  knit: knitTile,
  polka: polkaTile,
  glitter: glitterTile,
  stone: stoneTile,
  wood: woodTile,
  bubbles: bubblesTile,
  stitches: stitchTile,
  honeycomb: honeycombTile,
  quilt: quiltTile,
};

// ───────────────────────────── piel del cuerpo ─────────────────────────────

/**
 * Textura de un cuerpo. L: layout actual (puede ir deformado); L0: el de reposo.
 * o = { id, d (contorno), fill (relleno del cuerpo), col, line, lw (contorno o null), quality }
 * @returns {{ tex:string, defs:string, inner:string, rim:string, part:string }}
 *   inner va recortado al cuerpo (bajo los brillos del acabado); rim, tras el contorno;
 *   part es el relleno de textura para piezas unidas ('' si esta textura no lleva).
 */
export function renderSkin(spec, L, L0, o) {
  const tex = textureOf(spec);
  const out = { tex, defs: '', inner: '', rim: '', part: '' };
  if (tex === 'none' || o.quality === 'off') return out;
  const r = rng(skinHash(spec) ^ 0x9e3779b9);
  const u = Math.max(0.6, L0.unit);
  const { box } = L0;
  // la piel se estira con el contorno (aplastar, estirar, gelatina…) en vez de deslizarse
  const sx = L.box.w / (box.w || 1);
  const sy = L.box.h / (box.h || 1);
  const by0 = box.y + box.h;
  const by = L.box.y + L.box.h;
  const same = Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 && Math.abs(L.cx - L0.cx) < 0.05 && Math.abs(by - by0) < 0.05;
  const tf = same ? '' : `translate(${n(L.cx)} ${n(by)}) scale(${n(sx * 1000) / 1000} ${n(sy * 1000) / 1000}) translate(${n(-L0.cx)} ${n(-by0)})`;
  const ptf = tf ? ` patternTransform="${tf}"` : '';
  const gtf = tf ? ` transform="${tf}"` : '';
  const lite = o.quality === 'lite';

  const tile = TILES[tex]?.(u, r);
  if (tile) {
    out.defs += `<pattern id="${o.id}-tx" width="${n(tile.W)}" height="${n(tile.H)}" patternUnits="userSpaceOnUse"${ptf}>${tile.body}</pattern>`;
    out.part = `url(#${o.id}-tx)`;
    if (tex !== 'speckles') out.inner += `<path d="${o.d}" fill="${out.part}"/>`;
  }
  const W = box.w;
  const H = box.h;
  const X = box.x;
  const Y = box.y;

  if (tex === 'speckles') {
    let dk = '';
    let lt = '';
    for (let i = 0; i < 34; i++) {
      const x = X + r() * W;
      const y = Y + r() ** 0.8 * H;
      const rr = (0.5 + r() ** 2 * 1.7) * u;
      if (i % 6 === 5) lt += dot(x, y, rr * 0.8);
      else dk += dot(x, y, rr);
    }
    out.inner += `<g${gtf}>${blot(dk, '#000', 0.17)}${blot(lt, '#fff', 0.3)}</g>`;
  }
  if (tex === 'ridges') {
    let dk = '';
    let lt = '';
    const k = 7;
    for (let i = 0; i < k; i++) {
      const y = Y + (H * (i + 0.75)) / (k + 0.5);
      const sag = H * 0.05 * (1 - Math.abs(i / (k - 1) - 0.5));
      dk += `M${n(X - 4)} ${n(y)}Q${n(X + W / 2)} ${n(y + sag * 2)} ${n(X + W + 4)} ${n(y)}`;
      lt += `M${n(X - 4)} ${n(y + 1.6 * u)}Q${n(X + W / 2)} ${n(y + 1.6 * u + sag * 2)} ${n(X + W + 4)} ${n(y + 1.6 * u)}`;
    }
    out.inner += `<g${gtf}>${ink(dk, '#000', 0.15, 1.5 * u)}${ink(lt, '#fff', 0.2, 1.1 * u)}</g>`;
    out.defs += `<pattern id="${o.id}-tx" width="${n(8 * u)}" height="${n(6 * u)}" patternUnits="userSpaceOnUse"${ptf}>${ink(`M0 ${n(3 * u)}H${n(8 * u)}`, '#000', 0.14, 1.2 * u)}</pattern>`;
    out.part = `url(#${o.id}-tx)`;
  }
  if (tex === 'panels') {
    const seam = (y) => `M${n(X - 4)} ${n(y)}H${n(X + W + 4)}`;
    out.inner += `<g${gtf}>${ink(seam(Y + H * 0.3) + seam(Y + H * 0.84), '#000', 0.18, 1.1 * u)}${ink(seam(Y + H * 0.3 + 1.3 * u) + seam(Y + H * 0.84 + 1.3 * u), '#fff', 0.25, 0.9 * u)}`;
    let rv = '';
    let hl = '';
    for (const [a, b] of [[0.13, 0.17], [0.87, 0.17], [0.1, 0.42], [0.9, 0.42], [0.1, 0.74], [0.9, 0.74]]) {
      rv += dot(X + a * W, Y + b * H, 1.7 * u);
      hl += dot(X + a * W - 0.5 * u, Y + b * H - 0.5 * u, 0.6 * u);
    }
    out.inner += `${blot(rv, '#000', 0.2)}${blot(hl, '#fff', 0.55)}</g>`;
  }
  if (tex === 'gloss') {
    // gelatina: luz interior en el borde, reflejo curvo y burbujitas dentro (sobre el contorno actual)
    const { box: b } = L;
    out.inner += `<path d="${o.d}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="${n(b.w * 0.07)}"/>`;
    out.inner += `<ellipse cx="${n(L.cx)}" cy="${n(b.y + b.h * 0.86)}" rx="${n(b.w * 0.3)}" ry="${n(b.h * 0.1)}" fill="${shade(o.col, 0.5)}" opacity=".3"/>`;
    out.inner += ink(`M${n(b.x + b.w * 0.16)} ${n(b.y + b.h * 0.5)}Q${n(b.x + b.w * 0.16)} ${n(b.y + b.h * 0.2)} ${n(b.x + b.w * 0.42)} ${n(b.y + b.h * 0.1)}`, '#fff', 0.55, 2.4 * u);
    let bub = '';
    let shine = '';
    for (let i = 0; i < 5; i++) {
      const x = b.x + b.w * (0.22 + r() * 0.56);
      const y = b.y + b.h * (0.62 + r() * 0.26);
      const rr = (1.4 + r() * 2.2) * u;
      bub += dot(x, y, rr);
      shine += dot(x - rr * 0.35, y - rr * 0.35, rr * 0.3);
    }
    out.inner += `<path d="${bub}" fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".38" stroke-width="${n(0.6 * u)}"/>${blot(shine, '#fff', 0.7)}`;
  }
  if (tex === 'fuzz' && !lite && spec.finish !== 'clay') {
    // grano fino (solo estático: en 'lite' y durante deformaciones no se pinta el filtro)
    out.defs += `<filter id="${o.id}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="${skinHash(spec) % 97}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .8 0"/></filter>`;
    out.inner += `<rect x="${n(L.box.x - 5)}" y="${n(L.box.y - 5)}" width="${n(L.box.w + 10)}" height="${n(L.box.h + 10)}" filter="url(#${o.id}-grain)" opacity=".09"/>`;
  }

  // borde: mechones de pelo o pelusa que rompen la silueta (abajo no: apoya en el suelo)
  if (tex === 'fur') {
    // mismo nº de muestras y de tiradas siempre: al deformarse, cada mechón sigue siendo el mismo
    const S = edgeSamples(L.pts, 3);
    let d = '';
    for (const [x, y, nx, ny] of S) {
      const len = (2.6 + r() * 3) * u;
      const tilt = (r() - 0.5) * 0.9 + 0.25 * Math.sign(nx || 1);
      if (ny > 0.55) continue;
      const bw = 2.3 * u;
      const tx = -ny;
      const ty = nx;
      const ix = x - nx * 1.2 * u;
      const iy = y - ny * 1.2 * u;
      d += `M${n(ix - tx * bw)} ${n(iy - ty * bw)}L${n(x + nx * len + tx * len * tilt)} ${n(y + ny * len + ty * len * tilt + len * 0.2)}L${n(ix + tx * bw)} ${n(iy + ty * bw)}`;
    }
    const st = o.line ? ` stroke="${o.line.color}" stroke-width="${n(Math.min(o.line.w, 2.4) * 0.75)}"${o.line.op ? ` stroke-opacity="${o.line.op}"` : ''} stroke-linejoin="round"` : '';
    out.rim = `<path d="${d}" fill="${o.fill}"${st}/>`;
    if (tile) out.rim += `<path d="${d}" fill="${out.part}"/>`;
  }
  if (tex === 'fuzz') {
    const S = edgeSamples(L.pts, 5);
    let d = '';
    for (const [x, y, nx, ny] of S) {
      const len = (1.2 + r() * 1.6) * u;
      const a = (r() - 0.5) * 0.8;
      if (ny > 0.6) continue;
      d += `M${n(x - nx * 0.6 * u)} ${n(y - ny * 0.6 * u)}l${n((nx - ny * a) * len)} ${n((ny + nx * a) * len)}`;
    }
    out.rim = ink(d, o.line ? o.line.color : shade(o.col, -0.35), o.line?.op ?? 0.5, 0.8 * u);
  }
  return out;
}

// ───────────────────────────── piezas unidas ─────────────────────────────

const mixHex = (a, b, k) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
};

/** Color del degradado del cuerpo en un punto (para piezas con transformación propia, p. ej. manos). */
export function skinAt(skin, x, y) {
  if (!skin?.stops) return skin?.solid || '#888888';
  const { box, stops } = skin;
  const u = (x - box.x) / (box.w || 1);
  const v = (y - box.y) / (box.h || 1);
  const t = Math.min(1, Math.hypot(u - 0.36, v - 0.28) / 0.85);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) return mixHex(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return stops[stops.length - 1][1];
}

/** Atributos de un trazo de silueta para piezas de piel (sin contorno si el cuerpo no lo tiene). */
export function skinStroke(skin, w = skin.lw) {
  return skin.line ? ` stroke="${skin.line}" stroke-width="${n(w)}" stroke-linejoin="round"${skin.lineOp ? ` stroke-opacity="${skin.lineOp}"` : ''}` : '';
}

/**
 * Una o varias siluetas (`d` en coordenadas del cuerpo) pintadas con la piel: relleno del cuerpo,
 * luz, textura y por último el trazo (doble de ancho: la mitad interior la tapa el cuerpo).
 */
export function skinPaths(skin, d, o = {}) {
  const fill = o.fill || skin.fill;
  let s = `<path d="${d}" fill="${fill}"/>`;
  if (o.lit !== false && skin.lit && o.fill) s += `<path d="${d}" fill="${skin.lit}"/>`;
  if (skin.tex && o.tex !== false) s += `<path d="${d}" fill="${skin.tex}"/>`;
  if (o.extra) s += o.extra;
  if (skin.line) s += `<path d="${d}" fill="none"${skinStroke(skin)}/>`;
  return s;
}

/**
 * Unión de piezas al cuerpo. shapes: [{ d, tf?, sw?, sl? }] (sw: pieza de trazo con ese ancho;
 * sl: largo de su raíz). Devuelve
 *   shadow · sombra de contacto sobre las piezas, junto al borde del cuerpo (va detrás del cuerpo)
 *   mask   · siluetas en negro que recortan el contorno del cuerpo donde nace cada pieza
 */
export function joinSVG(skin, shapes, key) {
  if (!shapes.length) return { shadow: '', mask: '' };
  const T = (s) => (s.tf ? ` transform="${s.tf}"` : '');
  let mask = '';
  let clip = '';
  let roots = '';
  for (const s of shapes) {
    if (s.sw) {
      mask += `<path d="${s.d}"${T(s)} fill="none" stroke="#000" stroke-width="${n(s.sw)}" stroke-linecap="round"/>`;
      if (s.sl) roots += `<path d="${s.d}"${T(s)} fill="none" stroke="#000" stroke-opacity=".2" stroke-width="${n(s.sw)}" stroke-dasharray="${n(s.sl)} 9999"/>`;
    } else {
      mask += `<path d="${s.d}"${T(s)} fill="#000"/>`;
      clip += `<path d="${s.d}"${T(s)}/>`;
    }
  }
  let shadow = roots;
  if (clip) {
    const w = skin.box.w;
    shadow += `<clipPath id="${skin.uid}-${key}">${clip}</clipPath><g clip-path="url(#${skin.uid}-${key})" fill="none" stroke="#000"><path d="${skin.d}" stroke-opacity=".1" stroke-width="${n(w * 0.16)}"/><path d="${skin.d}" stroke-opacity=".12" stroke-width="${n(w * 0.07)}"/></g>`;
  }
  return { shadow, mask };
}
