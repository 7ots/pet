/**
 * Mods de un ot: paquetes que le cambian el aspecto (un orco, un robot…) sin tocar su ficha base.
 * Viven en `look.character.mods`; quitar un mod devuelve el ot a como era.
 *
 *   {
 *     id: 'orc', v: 1, name: { es: 'Orco', en: 'Orc' }, by: '7ots',
 *     character: { body: { color: '#7aa64a' }, brows: { type: 'angled' }, accessories: [{ id: 'horns' }] },
 *     parts: [{
 *       id: 'tusks', anchor: 'mouth', layer: 'front',
 *       svg: '<path d="…" fill="{color}"/>',  // 2D: coordenadas de un ot de 120 de ancho, origen en el ancla
 *       view: [-30, -20, 60, 30],             // caja del dibujo (para el respaldo 3D en plano)
 *       glb: 'data:model/gltf-binary;base64,…' | 'https://…/tusks.glb',  // 3D (opcional)
 *       tint: 'color' | 'body' | 'none',      // color del glb: el de la pieza, el de la piel o el suyo
 *       depth: 'front' | 'center',            // 3D: pegado a la cara o en el centro del cuerpo
 *       color, color2, x, y, scale, rot, flip,
 *     }],
 *   }
 *
 * Un mod puede traer además un cuerpo completo (3D) que reemplaza al ot procedural:
 *   model: { url: 'https://…/muneco.vrm' | '/mods/<hash>.vrm' | data:glb, scale, y, rot }
 * (VRM o GLB; ver src/character3d/model.js). En 2D se sigue viendo el ot con su parche.
 *
 * `character` es un parche de la ficha (normalizeCharacter lo sanea); sus `accessories` se suman a
 * los del ot. En el SVG valen {color} {color2} {body} {bodyDark} {bodyLight} {line}. El glb usa las
 * mismas unidades que el SVG (1 = 1 px de un ot de 120 de ancho) con y hacia arriba.
 *
 * Todo pasa por aquí antes de guardarse o pintarse: el SVG se reescribe con una lista cerrada de
 * etiquetas y atributos (sin scripts, eventos, enlaces ni estilos) y el glb solo puede ser https o
 * un data: de glb.
 */

export const MOD_ANCHORS = ['top', 'eyes', 'nose', 'mouth', 'neck', 'center', 'bottom', 'shoulder'];
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

function normalizePart(p, modId) {
  if (!isObj(p) || !/^[a-z0-9-]{1,24}$/.test(String(p.id))) return null;
  const view = Array.isArray(p.view) && p.view.length === 4 ? p.view.map((v, i) => num(v, 0, i < 2 ? -400 : 1, 400)) : [-60, -60, 120, 120];
  const part = {
    id: p.id,
    anchor: MOD_ANCHORS.includes(p.anchor) ? p.anchor : 'center',
    layer: p.layer === 'back' ? 'back' : 'front',
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
  return {
    id: m.id,
    v: 1,
    name: nameOf(m.name) || m.id,
    ...(m.by ? { by: str(m.by, 40) } : {}),
    character,
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
 * La ficha que se pinta: la base con los parches de sus mods (en orden) y sus piezas como
 * accesorios `mod:<mod>/<pieza>`. `normalize` es normalizeCharacter (sin dependencia circular).
 * La ficha devuelta lleva `_modParts` con los datos de esas piezas (los lee modPart).
 */
export function applyMods(spec, normalize) {
  const mods = spec?.mods;
  if (!Array.isArray(mods) || !mods.length) return spec;
  let s = spec;
  const extra = [];
  const parts = {};
  let model = null;
  for (const m of mods) {
    if (m.model) model = m.model; // el último cuerpo completo manda
    const { accessories, ...patch } = m.character || {};
    s = normalize({ ...merge(s, patch), accessories: [...s.accessories, ...(Array.isArray(accessories) ? accessories.filter((a) => !s.accessories.some((b) => b.id === a?.id)) : [])] });
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
