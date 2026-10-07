/**
 * Mods de un ot: paquetes que le cambian el aspecto (un orco, un robot…) sin tocar su ficha base.
 * Viven en `look.character.mods`; quitar un mod devuelve el ot a como era.
 *
 *   {
 *     id: 'orc', v: 1, name: { es: 'Orco', en: 'Orc' }, by: '7ots',
 *     character: { body: { color: '#7aa64a' }, brows: { type: 'angled' }, accessories: [{ id: 'horns' }] },
 *     face: { jaw: 0.5, forehead: -0.3 },  // rasgos relativos a la cara del ot (ver abajo)
 *     replaces: ['eyes'],                  // huecos que vacía aunque no traiga nada para ellos
 *     parts: [{
 *       id: 'tusks', anchor: 'mouth', layer: 'front',
 *       slot: 'face',                         // hueco que ocupa (ver abajo); sin él se deduce del ancla
 *       svg: '<path d="…" fill="{color}"/>',  // 2D: coordenadas de un ot de 120 de ancho, origen en el ancla
 *       view: [-30, -20, 60, 30],             // caja del dibujo (para el respaldo 3D en plano)
 *       glb: 'data:model/gltf-binary;base64,…' | 'https://…/tusks.glb',  // 3D (opcional)
 *       tint: 'color' | 'body' | 'none',      // color del glb: el de la pieza, el de la piel o el suyo
 *       depth: 'front' | 'center',            // 3D: pegado a la cara o en el centro del cuerpo
 *       color, color2, x, y, scale, rot, flip,
 *     }],
 *   }
 *
 * Huecos (MOD_SLOTS: los grupos de accesorios de parts.js más 'body'): head (sombreros, pelo,
 * orejas…), eyes (gafas, antifaces), face (bigotes, barbas, narices, colmillos), neck, back, body
 * (ropa sobre el cuerpo; no hay accesorios de catálogo ahí) y extra. Un mod REEMPLAZA lo que el ot
 * (o un mod anterior) lleva en cada hueco que ocupa: el de sus piezas, el de los accesorios de
 * catálogo de su `character.accessories` y los de `replaces` ('all' = todos). Así un mod con
 * sombrero le quita al ot el suyo en vez de ponerle otro encima. Una pieza con slot 'none' se suma
 * sin quitar nada. Las piezas sin `slot` (mods de antes) lo deducen de su ancla y su capa: delante,
 * top → head, eyes → eyes, nose/mouth → face, neck → neck; detrás, top → head y neck/center/
 * bottom/shoulder → back; lo demás, 'none'.
 *
 * `face`: cambios físicos relativos a la cara del ot, cada uno de -1 a 1 (0 = como está), para
 * parecerse a quien imita sin dejar de ser ese ot. Deforman su silueta (y con ella el cuerpo 3D,
 * que sale de los mismos puntos) y mueven ojos y boca:
 *   width, height     cara más ancha/estrecha, más alta/baja (los pies se quedan en el suelo)
 *   jaw               mandíbula: + ancha y cuadrada, − fina
 *   chin              barbilla: + marcada hacia abajo, − plana
 *   forehead          frente: + alta (despejada, con entradas), − baja
 *   cheekbones        pómulos: + marcados, − hundidos
 *   eyeSize, eyeSpacing, eyeHeight, mouthSize, mouthHeight
 * Los rasgos absolutos (tono de piel = body.color, forma = body.shape o body.points, tipo y color
 * de ojos, cejas y boca, mejillas, textura) van en `character`; si el mod fija body.shape sin
 * body.points, la silueta dibujada a mano del ot deja paso a esa forma.
 *
 * Un mod puede traer además un cuerpo completo (3D) que reemplaza al ot procedural:
 *   model: { url: 'https://…/muneco.vrm' | '/mods/<hash>.vrm' | data:glb, scale, y, rot }
 * (VRM o GLB; ver src/character3d/model.js). En 2D se sigue viendo el ot con su parche.
 *
 * `character` es un parche de la ficha (normalizeCharacter lo sanea); sus `accessories` ocupan el
 * hueco de su grupo. En el SVG valen {color} {color2} {body} {bodyDark} {bodyLight} {line}. El glb
 * usa las mismas unidades que el SVG (1 = 1 px de un ot de 120 de ancho) con y hacia arriba.
 *
 * Todo pasa por aquí antes de guardarse o pintarse: el SVG se reescribe con una lista cerrada de
 * etiquetas y atributos (sin scripts, eventos, enlaces ni estilos) y el glb solo puede ser https o
 * un data: de glb.
 */

import { ACCESSORIES, SHAPES } from './parts.js';

export const MOD_ANCHORS = ['top', 'eyes', 'nose', 'mouth', 'neck', 'center', 'bottom', 'shoulder'];
export const MOD_SLOTS = ['head', 'eyes', 'face', 'neck', 'back', 'body', 'extra'];
export const MOD_FACE = ['width', 'height', 'jaw', 'chin', 'forehead', 'cheekbones', 'eyeSize', 'eyeSpacing', 'eyeHeight', 'mouthSize', 'mouthHeight'];
export const MAX_MODS = 4;
const MAX_PARTS = 8;
const MAX_SVG = 20000;
const MAX_GLB = 1_500_000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, def, min, max) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
};
const hex = (v, def) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v).toLowerCase() : def);
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

// ── SVG ──
const TAGS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop']);
const CASE = { lineargradient: 'linearGradient', radialgradient: 'radialGradient' };
const ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
  'id', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'fx', 'fy',
]);
const ATTR_CASE = Object.fromEntries([...ATTRS].map((a) => [a.toLowerCase(), a]));
const SAFE_VALUE = /^[\w\s#.,%+\-{}()]*$/;

/**
 * SVG de una pieza, reescrito desde cero: solo formas, grupos y degradados, con atributos de la
 * lista; los ids (y sus url(#…)) llevan el prefijo del mod para no chocar con los de la página.
 */
export function sanitizeSvg(svg, prefix = 'm') {
  const src = String(svg ?? '').slice(0, MAX_SVG);
  const pre = String(prefix).replace(/[^\w-]/g, '');
  const out = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[a-zA-Z][\w:-]*\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(src))) {
    const [, close, rawTag, attrs, self] = m;
    const tag = rawTag.toLowerCase();
    if (!TAGS.has(tag)) continue;
    const name = CASE[tag] || tag;
    if (close) {
      const i = stack.lastIndexOf(name);
      if (i < 0) continue;
      while (stack.length > i) out.push(`</${stack.pop()}>`);
      continue;
    }
    let a = '';
    const ar = /([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let x;
    while ((x = ar.exec(attrs))) {
      const an = ATTR_CASE[x[1].toLowerCase()];
      let v = (x[2] ?? x[3] ?? '').trim();
      if (!an || v.length > 4000) continue;
      const urls = v.match(/url\(([^)]*)\)/gi) || [];
      if (urls.some((u) => !/^url\(#[\w-]+\)$/i.test(u))) continue;
      if (!SAFE_VALUE.test(v) || /(javascript|expression|data)\s*:/i.test(v)) continue;
      v = v.replace(/url\(#([\w-]+)\)/gi, `url(#${pre}-$1)`);
      if (an === 'id') v = `${pre}-${v.replace(/[^\w-]/g, '')}`;
      a += ` ${an}="${v}"`;
    }
    if (self) out.push(`<${name}${a}/>`);
    else {
      out.push(`<${name}${a}>`);
      stack.push(name);
    }
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
}

// ── mods ──
const glbUrl = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^data:model\/gltf-binary;base64,[A-Za-z0-9+/=]+$/.test(s)) return s.length <= MAX_GLB ? s : '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && s.length <= 2000 ? u.href : '';
  } catch {
    return '';
  }
};

/** Cuerpo completo: https, data: de glb, o un archivo subido al pet (/mods/<hash>.vrm|glb). */
const modelOf = (v) => {
  if (!isObj(v)) return null;
  const s = String(v.url ?? '').trim();
  const url = /^\/mods\/[a-f0-9]{8,64}\.(vrm|glb)$/.test(s) ? s : glbUrl(s);
  if (!url) return null;
  return { url, scale: num(v.scale, 1, 0.2, 3), y: num(v.y, 0, -1, 1), rot: num(v.rot, 0, -180, 180) };
};

const nameOf = (v) => {
  if (isObj(v)) {
    const o = {};
    for (const k of ['en', 'es', 'pt']) if (v[k]) o[k] = str(v[k], 40);
    return Object.keys(o).length ? o : '';
  }
  return str(v, 40);
};

const PATCH_KEYS = ['body', 'eyes', 'brows', 'mouth', 'cheeks', 'finish', 'texture', 'outline', 'accessories'];
/** Hueco de cada accesorio de catálogo: su grupo. */
const GROUP = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a.group]));
const ANCHOR_SLOT = {
  front: { top: 'head', eyes: 'eyes', nose: 'face', mouth: 'face', neck: 'neck' },
  // detrás del cuerpo no hay gafas ni bigotes (las orejas del orco van en 'eyes' por detrás)
  back: { top: 'head', neck: 'back', center: 'back', bottom: 'back', shoulder: 'back' },
};
/** Hueco de una pieza: el que declara, o el de su ancla (mods de antes de los huecos). */
const slotOf = (slot, anchor, layer) => (slot === 'none' || MOD_SLOTS.includes(slot) ? slot : ANCHOR_SLOT[layer][anchor] || 'none');

function normalizePart(p, modId) {
  if (!isObj(p) || !/^[a-z0-9-]{1,24}$/.test(String(p.id))) return null;
  const view = Array.isArray(p.view) && p.view.length === 4 ? p.view.map((v, i) => num(v, 0, i < 2 ? -400 : 1, 400)) : [-60, -60, 120, 120];
  const anchor = MOD_ANCHORS.includes(p.anchor) ? p.anchor : 'center';
  const layer = p.layer === 'back' ? 'back' : 'front';
  const part = {
    id: p.id,
    anchor,
    layer,
    slot: slotOf(p.slot, anchor, layer),
    svg: sanitizeSvg(p.svg, `m-${modId}-${p.id}`),
    view,
    glb: glbUrl(p.glb),
    tint: ['color', 'body', 'none'].includes(p.tint) ? p.tint : 'none',
    depth: p.depth === 'center' ? 'center' : 'front',
    color: hex(p.color, '#1f2937'),
    color2: hex(p.color2, '#ffffff'),
    x: num(p.x, 0, -120, 120),
    y: num(p.y, 0, -120, 120),
    scale: num(p.scale, 1, 0.2, 3),
    rot: num(p.rot, 0, -180, 180),
    flip: !!p.flip,
  };
  return part.svg || part.glb ? part : null;
}

/** Un mod saneado, o null si no sirve. */
export function normalizeMod(m) {
  if (!isObj(m) || !/^[a-z0-9-]{1,32}$/.test(String(m.id))) return null;
  const patch = {};
  if (isObj(m.character)) for (const k of PATCH_KEYS) if (m.character[k] !== undefined) patch[k] = m.character[k];
  // el parche se sanea al aplicarse (normalizeCharacter); aquí solo se acota su tamaño
  const character = JSON.stringify(patch).length <= 4000 ? JSON.parse(JSON.stringify(patch)) : {};
  const parts = (Array.isArray(m.parts) ? m.parts : []).slice(0, MAX_PARTS).map((p) => normalizePart(p, m.id)).filter(Boolean);
  const seen = new Set();
  const model = modelOf(m.model);
  const face = {};
  if (isObj(m.face)) for (const k of MOD_FACE) if (num(m.face[k], 0, -1, 1)) face[k] = Math.round(num(m.face[k], 0, -1, 1) * 100) / 100;
  const replaces = Array.isArray(m.replaces) ? [...new Set(m.replaces.filter((x) => x === 'all' || MOD_SLOTS.includes(x)))] : [];
  return {
    id: m.id,
    v: 1,
    name: nameOf(m.name) || m.id,
    ...(m.by ? { by: str(m.by, 40) } : {}),
    character,
    ...(Object.keys(face).length ? { face } : {}),
    ...(replaces.length ? { replaces } : {}),
    parts: parts.filter((p) => !seen.has(p.id) && seen.add(p.id)),
    ...(model ? { model } : {}),
  };
}

/** Lista de mods saneada (sin repetidos, como mucho MAX_MODS). */
export function normalizeMods(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const n = normalizeMod(m);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    if (out.length >= MAX_MODS) break;
  }
  return out;
}

/** Nombre del mod en un idioma. */
export const modName = (m, lang = 'en') => (isObj(m.name) ? m.name[lang] || m.name.en || m.name.es || Object.values(m.name)[0] : m.name) || m.id;

const merge = (a, b) => {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = merge(a[k], v);
  return o;
};

/**
 * Rasgos de `face` sobre una ficha ya normalizada: deforma su silueta (16 puntos simétricos) y
 * mueve ojos y boca. Todo relativo a la caja del cuerpo, con los pies donde estaban.
 */
function applyFace(s, f) {
  const pts = s.body.points || SHAPES.find((x) => x.id === s.body.shape)?.points || SHAPES[0].points;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const hw = (Math.max(...xs) - Math.min(...xs)) / 2 || 1;
  const hh = (Math.max(...ys) - Math.min(...ys)) / 2 || 1;
  const foot = Math.max(...ys);
  const v = (k) => f[k] || 0;
  const points = pts.map(([x, y]) => {
    const u = (x - cx) / hw; // -1 izquierda … 1 derecha
    const t = (y - cy) / hh; // -1 arriba … 1 abajo
    const low = Math.max(0, t);
    const up = Math.max(0, -t);
    let sx = 1 + 0.22 * v('width');
    sx *= 1 + 0.3 * v('jaw') * low ** 0.8; // mandíbula: la mitad de abajo
    sx *= 1 + 0.16 * v('cheekbones') * Math.max(0, 1 - ((t + 0.1) / 0.75) ** 2); // pómulos: algo por encima del centro (suave: son 16 puntos)
    let ny = y - hh * 0.18 * v('forehead') * up ** 2; // frente: sube la parte de arriba
    ny += hh * 0.2 * v('chin') * Math.max(0, 1 - Math.abs(u) / 0.6) * low ** 2; // barbilla: solo el centro de abajo
    ny = foot - (foot - ny) * (1 + 0.18 * v('height'));
    return [cx + (x - cx) * sx, ny];
  });
  return {
    ...s,
    body: { ...s.body, points },
    eyes: { ...s.eyes, size: s.eyes.size * (1 + 0.35 * v('eyeSize')), spacing: s.eyes.spacing * (1 + 0.35 * v('eyeSpacing')), y: s.eyes.y - 14 * v('eyeHeight') },
    mouth: { ...s.mouth, size: s.mouth.size * (1 + 0.35 * v('mouthSize')), y: s.mouth.y - 12 * v('mouthHeight') },
  };
}

/**
 * La ficha que se pinta: la base con los parches de sus mods (en orden) y sus piezas como
 * accesorios `mod:<mod>/<pieza>`. Cada mod vacía antes los huecos que ocupa (MOD_SLOTS): lo que
 * el ot o un mod anterior llevaba ahí se quita en vez de quedar debajo. `normalize` es
 * normalizeCharacter (sin dependencia circular). La ficha devuelta lleva `_modParts` con los
 * datos de esas piezas (los lee modPart).
 */
export function applyMods(spec, normalize) {
  const mods = spec?.mods;
  if (!Array.isArray(mods) || !mods.length) return spec;
  let s = spec;
  let extra = [];
  const parts = {};
  let model = null;
  const slotIn = (a) => (a.id.startsWith('mod:') ? parts[a.id]?.slot : GROUP[a.id]);
  for (const m of mods) {
    if (m.model) model = m.model; // el último cuerpo completo manda
    const { accessories, ...patch } = m.character || {};
    const add = (Array.isArray(accessories) ? accessories : []).filter((a, i, l) => isObj(a) && GROUP[a.id] && l.findIndex((b) => b?.id === a.id) === i);
    const slots = new Set(m.replaces || []);
    for (const a of add) slots.add(GROUP[a.id]);
    for (const p of m.parts) if (p.slot !== 'none') slots.add(p.slot);
    const free = (a) => !slots.has('all') && !slots.has(slotIn(a));
    // una forma nueva manda sobre la silueta dibujada a mano del ot (si el mod no trae la suya)
    const base = isObj(patch.body) && patch.body.shape && !patch.body.points ? { ...s, body: { ...s.body, points: null } } : s;
    s = normalize({ ...merge(base, patch), accessories: [...s.accessories.filter(free), ...add] });
    if (m.face) s = normalize(applyFace(s, m.face));
    extra = extra.filter(free);
    for (const p of m.parts) {
      const id = `mod:${m.id}/${p.id}`;
      parts[id] = p;
      extra.push({ id, x: p.x, y: p.y, scale: p.scale, rot: p.rot, flip: p.flip, color: p.color, color2: p.color2 });
    }
  }
  // colores que fija un mod: el estilo artístico no los remapea (si no, un orco Bauhaus queda azul y amarillo)
  const keep = {};
  for (const m of mods) for (const [k, v] of Object.entries(m.character || {})) if (v && typeof v === 'object') for (const f of Object.keys(v)) if (/color|iris/i.test(f)) keep[`${k}.${f}`] = true;
  return { ...s, mods, accessories: [...s.accessories, ...extra], _modParts: parts, _modColors: keep, ...(model ? { _model: model } : {}) };
}

/**
 * Definición de accesorio (como las de parts.js) para una pieza de mod, o undefined.
 * shade: la función de parts.js (para los tonos de la piel).
 */
export function modPart(spec, id, shade) {
  const p = spec._modParts?.[id];
  if (!p) return undefined;
  return {
    id,
    anchor: p.anchor,
    layer: p.layer,
    mod: p,
    draw: (c) => {
      const body = c.body || '#888888';
      const vars = { color: c.color, color2: c.color2, body, bodyDark: shade(body, -0.22), bodyLight: shade(body, 0.25), line: shade(body, -0.5) };
      return `<g transform="scale(${Math.round(c.k * 1000) / 1000})">${p.svg.replace(/\{(color2?|body|bodyDark|bodyLight|line)\}/g, (_, k) => vars[k])}</g>`;
    },
  };
}
