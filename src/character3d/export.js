/**
 * Un ot como .glb: el MISMO Character3D de la vista 3D, horneado para cualquier visor glTF
 * (lo usa byte arena para que el ot juegue con su propio cuerpo; ver server/platform/model3d.mjs).
 *
 * Lo que vive en shaders de 7ots se hornea:
 *   - el cuerpo pasa a una esfera deformada CON uv (mismo mapeo de body.js) y su color sale de
 *     una textura: estampado, piel, mejillas y oclusión, la misma lógica que materials.js en JS;
 *   - toon/sketch/estilos: material sin luz (KHR_materials_unlit) con las 3 bandas de luz ya
 *     pintadas, desde la luz principal del escenario de 7ots;
 *   - contorno de dibujo animado: casco invertido real (geometría inflada con caras al revés);
 *   - parches (tirita, antifaz, tapabocas): superficie inflada + textura con alfa (MASK).
 * El pelo (capas instanciadas), la sombra, los efectos y las piezas SVG de mods se quedan fuera.
 *
 * Animación: clips muestreados del propio `tick()` del personaje, con propiedades disjuntas
 * para que el visor pueda mezclarlos:
 *   idle | win | lose | thinking | walk  — base (uno a la vez, con fundido): cuerpo, cejas, ojos (ánimo), manos…
 *   talk   — capa: sólo la boca (abrir/cerrar, cavidad)
 *   blink  — capa: sólo el parpadeo (escala del ojo)
 * La sonrisa/ceño (morph de la línea de la boca) va en los clips base; un nodo `head` marca la cara.
 * Los nodos ocultos en reposo (boca abierta, manos) van con escala ~0: glTF no tiene visibilidad.
 *
 * Isomórfico: corre en el navegador o en Node (con los shims de model3d.mjs). `encodePng` lo
 * pone quien llama (Node: zlib).
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Character3D } from './Character3D.js';

const TAU = Math.PI * 2;
const HIDDEN = 1e-4;
const fract = (x) => x - Math.floor(x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const toSrgb = (c) => Math.round(255 * clamp01(c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

// ───────────────────── materials.js (GLSL) → JS ─────────────────────

function h33(x, y, z) {
  const a = x * 127.1 + y * 311.7 + z * 74.7;
  const b = x * 269.5 + y * 183.3 + z * 246.1;
  const c = x * 113.5 + y * 271.9 + z * 124.6;
  return [fract(Math.sin(a) * 43758.5453123), fract(Math.sin(b) * 43758.5453123), fract(Math.sin(c) * 43758.5453123)];
}

function patMask(u, P) {
  const W = u.uDims.value.x, H = u.uDims.value.y;
  const t = u.uPatType.value;
  if (t === 1) {
    const qx = P.x / (W * 0.33), qy = (P.y - H * 0.33) / (H * 0.29);
    return (1 - sstep(0.9, 1.05, Math.hypot(qx, qy))) * sstep(-0.05, 0.12, P.z);
  }
  if (t === 2) return 1 - sstep(H * 0.4, H * 0.43, P.y);
  if (t === 3) {
    const k = 4.2 / W;
    const qx = P.x * k, qy = P.y * k, qz = P.z * k;
    const cx = Math.floor(qx), cy = Math.floor(qy), cz = Math.floor(qz);
    const r = h33(cx, cy, cz);
    if (r[0] <= 0.45) return 0;
    return 1 - sstep(0.2, 0.25, Math.hypot(qx - cx - (0.3 + 0.4 * r[0]), qy - cy - (0.3 + 0.4 * r[1]), qz - cz - (0.3 + 0.4 * r[2])));
  }
  if (t === 4) return Math.sin((P.y / H) * 38) >= 0.55 ? 1 : 0;
  if (t === 5) return (Math.sin((P.y / H) * 30 + Math.sin(P.x * 9) * 1.6) >= 0.45 ? 1 : 0) * sstep(0.15 * W, 0.4 * W, Math.abs(P.x) + 0.25 * W * (P.z >= 0 ? 0 : 1));
  if (t === 6) return (1 - sstep(u.uDims.value.w * 1.6, u.uDims.value.w * 1.8, Math.abs(P.y - u.uDims.value.z))) * sstep(-0.05, 0.1, P.z);
  return 0;
}

function skinTex(u, P, N) {
  const W = u.uDims.value.x, H = u.uDims.value.y;
  const t = u.uTex.value;
  if (t === 1) {
    const s = W * 0.085;
    const qx = (Math.atan2(P.x, P.z) * W * 0.42) / s, qy = P.y / s;
    let best = 0;
    for (let k = 0; k < 2; k++) {
      const row = Math.floor(qy) + k;
      const fx = qx + 0.5 * (((row % 2) + 2) % 2);
      const dx = fract(fx) - 0.5, dy = qy - row + 0.15;
      best = Math.max(best, 1 - Math.hypot(dx, dy * 1.25));
    }
    return mix(0.72, 1.08, sstep(0, 0.5, best));
  }
  if (t === 2) {
    const k = 13 / W;
    const qx = P.x * k, qy = P.y * k, qz = P.z * k;
    const cx = Math.floor(qx), cy = Math.floor(qy), cz = Math.floor(qz);
    const r = h33(cx + 3.1, cy + 3.1, cz + 3.1);
    const d = Math.hypot(qx - cx - (0.25 + 0.5 * r[0]), qy - cy - (0.25 + 0.5 * r[1]), qz - cz - (0.25 + 0.5 * r[2]));
    const sp = r[0] > 0.35 ? 1 - sstep(0.1, 0.16, d / (0.6 + r[2])) : 0;
    return mix(1, r[1] > 0.5 ? 0.62 : 1.22, sp);
  }
  if (t === 3) {
    const b = 0.5 + 0.5 * Math.sin((P.y / H) * TAU * 9);
    return mix(0.8, 1.04, sstep(0.15, 0.85, b) * 0.8);
  }
  if (t === 5) {
    const s = W * 0.3;
    const ax = Math.abs(N.x), ay = Math.abs(N.y), az = Math.abs(N.z);
    const [qa, qb] = az > ax && az > ay ? [P.x, P.y] : ax > ay ? [P.z, P.y] : [P.x, P.z];
    const fa = fract(qa / s + 0.5) - 0.5, fb = fract(qb / s + 0.5) - 0.5;
    const e = Math.min(0.5 - Math.abs(fa), 0.5 - Math.abs(fb)) * s;
    const groove = 1 - sstep(0, W * 0.012, e);
    const rivet = 1 - sstep(W * 0.01, W * 0.016, Math.hypot(Math.abs(fa) * s - (0.5 * s - W * 0.035), Math.abs(fb) * s - (0.5 * s - W * 0.035)));
    return mix(1, 0.7, groove) * mix(1, 1.15, rivet);
  }
  return 1;
}

function sdSeg(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
}
function sdHeart(px, py) {
  px = Math.abs(px);
  py += 0.6;
  if (py + px > 1) return Math.hypot(px - 0.25, py - 0.75) - 0.3536;
  const m = 0.5 * Math.max(px + py, 0);
  return Math.sqrt(Math.min(px * px + (py - 1) ** 2, (px - m) ** 2 + (py - m) ** 2)) * Math.sign(px - py);
}
function sdStar(px, py, r) {
  const k1x = 0.809016994375, k1y = -0.587785252292, k2x = -0.809016994375, k2y = -0.587785252292;
  px = Math.abs(px);
  let d = 2 * Math.max(k1x * px + k1y * py, 0);
  px -= d * k1x; py -= d * k1y;
  d = 2 * Math.max(k2x * px + k2y * py, 0);
  px -= d * k2x; py -= d * k2y;
  px = Math.abs(px);
  py -= r;
  const bax = 0.45 * -k1y - 0, bay = 0.45 * k1x - 1;
  const h = Math.min(Math.max((px * bax + py * bay) / (bax * bax + bay * bay), 0), r);
  return Math.hypot(px - bax * h, py - bay * h) * Math.sign(py * bax - px * bay);
}

/** Mejillas: [r, g, b, alfa] (lineal) o null. */
function cheekPaint(u, P) {
  if (u.uCheekOn.value < 0.5) return null;
  const r = u.uDims.value.w;
  const ch = u.uCheek.value;
  const qx = (Math.abs(P.x) - ch.x) / r, qy = (P.y - ch.y) / r;
  const front = sstep(-0.02, 0.06, P.z);
  if (!front) return null;
  const t = u.uCheekType.value;
  let a = 0;
  if (t === 1) { const cd = Math.hypot(Math.abs(P.x) - ch.x, P.y - ch.y, P.z - ch.z) / ch.w; a = 0.7 * Math.exp(-cd * cd * 2.2); }
  else if (t === 2) { let d = 9; for (let i = 0; i < 3; i++) { const bx = (i - 1) * 0.4 - 0.12, by = -0.25; d = Math.min(d, sdSeg(qx, qy, bx, by, bx + 0.25, by + 0.5)); } a = 1 - sstep(0.06, 0.1, d); }
  else if (t === 3) {
    const F = [[0, 0], [0.5, -0.3], [-0.4, -0.4], [0.2, -0.75], [-0.2, 0.1]];
    let d = 9;
    for (const [fx, fy] of F) d = Math.min(d, Math.hypot(qx - fx + 0.25, qy - fy - 0.1));
    a = 1 - sstep(0.08, 0.12, d);
  }
  else if (t === 4) { const d = Math.min(sdSeg(qx, qy, -0.65, 0.4, 0.95, 0.4), sdSeg(qx, qy, -0.65, -0.1, 0.95, -0.1)); a = (1 - sstep(0.1, 0.14, d)) * 0.95; }
  else if (t === 5) a = 1 - sstep(-0.02, 0.03, sdHeart((qx - 0.05) / 0.5, (qy + 0.1) / 0.5) * 0.5);
  else if (t === 6) a = 1 - sstep(-0.01, 0.03, sdStar(qx - 0.15, qy + 0.1, 0.42));
  a *= front;
  if (a <= 0) return null;
  const c = u.uCheekColor.value;
  return [c.r, c.g, c.b, a];
}

// luz del escenario de 7ots (stage.js makeScene), para hornear las bandas del toon
const LIN = (hex) => new THREE.Color(hex);
const LIGHTS = [
  { d: new THREE.Vector3(2.2, 3.4, 3.2).normalize(), c: LIN(0xfff1e0), i: 2.4 },
  { d: new THREE.Vector3(-2.6, 2.2, -3.0).normalize(), c: LIN(0xcfe0ff), i: 2.2 },
  { d: new THREE.Vector3(-3, 0.5, 2).normalize(), c: LIN(0xffe6f4), i: 0.5 },
];
const SKY = LIN(0xe8ecff);
const GROUND = LIN(0x40304e);
function irradiance(N) {
  const w = 0.5 * N.y + 0.5;
  const out = [0, 0, 0];
  const ch = ['r', 'g', 'b'];
  for (let k = 0; k < 3; k++) {
    let v = mix(GROUND[ch[k]], SKY[ch[k]], w) * 0.7;
    for (const l of LIGHTS) v += l.c[ch[k]] * l.i * Math.max(0, N.dot(l.d));
    out[k] = v / Math.PI + 0.45; // + entorno (RoomEnvironment × 0.75, aprox.)
  }
  return out;
}

// ───────────────────── geometría con uv ─────────────────────

/** Esfera deformada igual que body.js, pero con uv (mapeo equirectangular de la esfera). */
function uvBody(B) {
  const [ws, hs] = B.segments;
  const g = new THREE.SphereGeometry(1, ws, hs);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    B.surface(v.x, v.y, v.z, v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // normales continuas: las de la geometría soldada (misma posición → misma normal)
  const key = (x, y, z) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  const src = B.geometry.attributes;
  const nmap = new Map();
  for (let i = 0; i < src.position.count; i++) nmap.set(key(src.position.getX(i), src.position.getY(i), src.position.getZ(i)), i);
  const nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const j = nmap.get(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
    if (j !== undefined) nrm.setXYZ(i, src.normal.getX(j), src.normal.getY(j), src.normal.getZ(j));
  }
  // SphereGeometry: uv.y = 1 - θ/π (arriba = 1). En glTF la imagen empieza arriba (v = 0), así que
  // la fila r de la textura es v = (r + .5) / alto: la fila 0 es el polo de ARRIBA si invertimos.
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

/** Copia inflada a lo largo de la normal; `flip` invierte las caras (contorno de casco invertido). */
function inflated(geo, off, flip) {
  const g = geo.clone();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * off, p.getY(i) + n.getY(i) * off, p.getZ(i) + n.getZ(i) * off);
  if (flip) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.deleteAttribute('uv');
  }
  return g;
}

// ───────────────────── horneado ─────────────────────

/**
 * Textura del cuerpo (RGBA, sRGB) + una de alfa por parche. Cada texel se evalúa en la superficie
 * analítica (θ, φ de la esfera → body.surface), así no hay huecos ni costuras que rellenar.
 */
function bake(c, size, patches, geo) {
  const Wt = size, Ht = size / 2;
  const u = c.bodyU;
  const B = c.B;
  const s = c.spec;
  const toon = !!s._style || ((s.finish === 'toon' || s.finish === 'sketch') && !c.plush);
  const base = new THREE.Color(s.body.color);
  const pat = u.uPat.value;
  const H = c.H;
  const plush = c.plush;
  const dens = c.density || 0;
  const out = new Uint8Array(Wt * Ht * 4);
  const masks = patches.map(() => new Uint8Array(Wt * Ht * 4));
  const boxes = patches.map((p) => {
    const b = p.box;
    return { c: b.c, h: b.h, cr: Math.cos(b.rot || 0), sr: Math.sin(b.rot || 0), round: p.round || 0 };
  });
  // cada texel cae en una celda (ix, iy) de la malla con uv (SphereGeometry): su punto y normal son los
  // de ESE triángulo plano, no los de la superficie analítica — así las rayas siguen exactamente a la
  // malla que se dibuja (con la superficie analítica, la interpolación lineal de uv las dentaba)
  const [ws, hs] = B.segments;
  const pa = geo.attributes.position.array, na = geo.attributes.normal.array;
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  const tri = (out, arr, a, b, c, wa, wb, wc) => out.set(
    arr[a] * wa + arr[b] * wb + arr[c] * wc, arr[a + 1] * wa + arr[b + 1] * wb + arr[c + 1] * wc, arr[a + 2] * wa + arr[b + 2] * wb + arr[c + 2] * wc);
  // se evalúa en las ESQUINAS de los texels y cada texel promedia sus 4: antialias 2×2 al precio de 1×
  // (sin él, los bordes de rayas y parches quedan en escalera)
  const W1 = Wt + 1;
  const col = new Float32Array(W1 * (Ht + 1) * 3);
  const ins = boxes.map(() => new Uint8Array(W1 * (Ht + 1)));
  for (let r = 0; r <= Ht; r++) {
    const gy = (r / Ht) * hs; // fila 0 = arriba (ver uvBody)
    const iy = Math.min(hs - 1, Math.floor(gy)), fy = gy - iy;
    for (let i = 0; i <= Wt; i++) {
      const gx = (i / Wt) * ws;
      const ix = Math.min(ws - 1, Math.floor(gx)), fx = gx - ix;
      // SphereGeometry parte cada celda por la diagonal (ix, iy)–(ix+1, iy+1)
      const v00 = (iy * (ws + 1) + ix) * 3, v10 = v00 + 3, v01 = v00 + (ws + 1) * 3, v11 = v01 + 3;
      if (fx >= fy) { tri(P, pa, v00, v10, v11, 1 - fx, fx - fy, fy); tri(N, na, v00, v10, v11, 1 - fx, fx - fy, fy); }
      else { tri(P, pa, v00, v01, v11, 1 - fy, fy - fx, fx); tri(N, na, v00, v01, v11, 1 - fy, fy - fx, fx); }
      N.normalize();
      // color (lineal), como el fragment shader del cuerpo
      let cr = base.r, cg = base.g, cb = base.b;
      const m = patMask(u, P);
      if (m > 0) { cr = mix(cr, pat.r, m); cg = mix(cg, pat.g, m); cb = mix(cb, pat.b, m); }
      const k = skinTex(u, P, N);
      cr *= k; cg *= k; cb *= k;
      const ch = cheekPaint(u, P);
      if (ch) { cr = mix(cr, ch[0], ch[3]); cg = mix(cg, ch[1], ch[3]); cb = mix(cb, ch[2], ch[3]); }
      const ao = H < 0.01 ? 1 : mix(0.5, 1, sstep(0, 0.3 * H, P.y));
      cr *= ao; cg *= ao; cb *= ao;
      if (plush && dens) { // hebras: variación por celda como las capas de pelo
        const h = h33(Math.floor(P.x * dens), Math.floor(P.y * dens), Math.floor(P.z * dens));
        const f = 0.9 + 0.16 * h[0];
        cr *= f; cg *= f; cb *= f;
      }
      if (toon) {
        const L = irradiance(N);
        const lum = 0.299 * cr * L[0] + 0.587 * cg * L[1] + 0.114 * cb * L[2];
        const ql = (lum < 0.1 ? 0.55 : lum < 0.35 ? 0.8 : 1) * 0.95;
        cr *= ql; cg *= ql; cb *= ql;
      }
      const o = r * W1 + i;
      col[o * 3] = cr; col[o * 3 + 1] = cg; col[o * 3 + 2] = cb;
      for (let j = 0; j < boxes.length; j++) {
        const bx = boxes[j];
        const dx = P.x - bx.c[0], dy = P.y - bx.c[1], dz = P.z - bx.c[2];
        const rx = bx.cr * dx + bx.sr * dy, ry = -bx.sr * dx + bx.cr * dy;
        const ex = Math.abs(rx) - bx.h[0] + bx.round, ey = Math.abs(ry) - bx.h[1] + bx.round, ez = Math.abs(dz) - bx.h[2] + bx.round;
        ins[j][o] = Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) - bx.round > 0 || ez > bx.round ? 0 : 1;
      }
    }
  }
  for (let r = 0; r < Ht; r++) {
    for (let i = 0; i < Wt; i++) {
      const k0 = r * W1 + i, k1 = k0 + 1, k2 = k0 + W1, k3 = k2 + 1;
      const o = (r * Wt + i) * 4;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = toSrgb((col[k0 * 3 + ch] + col[k1 * 3 + ch] + col[k2 * 3 + ch] + col[k3 * 3 + ch]) * 0.25);
      out[o + 3] = 255;
      for (let j = 0; j < boxes.length; j++) {
        const m = ins[j], mk = masks[j];
        mk[o] = mk[o + 1] = mk[o + 2] = 255;
        mk[o + 3] = ((m[k0] + m[k1] + m[k2] + m[k3]) * 255) >> 2;
      }
    }
  }
  return { body: { rgba: out, w: Wt, h: Ht }, masks: masks.map((rgba) => ({ rgba, w: Wt, h: Ht })), toon };
}

// ───────────────────── animación ─────────────────────

function snap(o) {
  const vis = o.visible;
  const sc = vis ? o.scale.toArray() : [HIDDEN, HIDDEN, HIDDEN];
  return { p: o.position.toArray(), q: o.quaternion.toArray(), s: sc, w: o.morphTargetInfluences ? [...o.morphTargetInfluences] : null };
}

const near = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps);

/**
 * Muestrea `run(τ)` (que deja al personaje en su pose del instante τ) y devuelve, por objeto,
 * los fotogramas. `objs` es la lista fija de objetos que se registran.
 */
function sampleFrames(c, objs, dur, fps, run) {
  const n = Math.max(2, Math.round(dur * fps) + 1);
  const times = new Float32Array(n);
  const frames = objs.map(() => []);
  for (let f = 0; f < n; f++) {
    const tau = (f / (n - 1)) * dur;
    times[f] = tau;
    run(tau, f);
    objs.forEach((o, i) => frames[i].push(snap(o)));
  }
  return { times, frames };
}

/** Deja al personaje quieto, en neutral, sin gesto ni metamorfosis. */
function rest(c, t) {
  if (c.gest) c.endGesture();
  c.morphs.clear();
  c.mood('neutral');
  c.mo.open = c.mo.target = 0;
  c.mo.msx = c.mo.tmsx = 1;
  c.blinkAt = -1e9;
  c.look.x = c.look.y = c.look.tx = c.look.ty = 0;
  for (let i = 0; i < 90; i++) c.tick(t - (90 - i) * 33, 33);
}

/**
 * @param {object} spec look.character
 * @param {object} o { encodePng(rgba, w, h) → Uint8Array (obligatorio), rasterSvg(svg, w, h) → RGBA (piezas SVG de mods; sin él no van), textureSize = 2048, fps = 30, waitMs = 8000, quality }
 * @returns {Promise<{ glb: ArrayBuffer, info: object } | null>} null si el ot es un modelo completo de mod (VRM/GLB ajeno)
 */
export async function characterGlb(spec, o = {}) {
  if (typeof o.encodePng !== 'function') throw new Error('characterGlb: falta encodePng');
  const size = o.textureSize || 2048;
  const fps = o.fps || 30;
  const c = new Character3D(spec, { idle: false, moodFx: false, quality: o.quality || 'high' });
  if (c.modelMode) return null;
  // piezas glb de los mods (cargan en segundo plano)
  if (c.pending?.length) {
    await Promise.race([Promise.allSettled(c.pending), new Promise((r) => setTimeout(r, o.waitMs ?? 8000))]);
  }
  c.effect = () => true; // sin efectos (confeti, pensamientos…): no van en el glb
  const T0 = performance.now();
  rest(c, T0);

  // ── objetos que se exportan ──
  const drop = [];
  const planes = [];
  c.root.traverse((m) => {
    if (m.userData.modPlane && typeof o.rasterSvg === 'function') planes.push(m);
    else if (m.isInstancedMesh || m.userData.modPlane) drop.push(m);
  });
  drop.push(c.fxg, c.shadow);
  for (const m of drop) m.removeFromParent();

  const objs = [];
  c.rig.traverse((m) => objs.push(m));
  const restSnap = new Map(objs.map((m) => [m, snap(m)]));
  const mouth = new Set();
  c.mouthRig.g.traverse((m) => mouth.add(m));
  const line = c.mouthRig.line;
  const mains = new Set(c.eyes.map((e) => e.main));

  // ── clips ──
  const L = 6.8; // idle: 2 respiraciones y un balanceo
  const breathe = (tau, dur) => {
    const nb = Math.max(1, Math.round(dur / 3.4));
    const b = Math.sin((tau / dur) * TAU * nb);
    c.rig.scale.x *= 1 - 0.006 * b;
    c.rig.scale.z *= 1 - 0.006 * b;
    c.rig.scale.y *= 1 + 0.014 * b;
    c.rig.rotation.y += 0.04 * Math.sin((tau / dur) * TAU);
    c.rig.quaternion.setFromEuler(c.rig.rotation);
  };
  const ticker = (t0) => {
    let last = t0;
    return (t) => { c.tick(t, Math.max(1, t - last)); last = t; };
  };
  const base = (name, { mood = 'neutral', gesture, ms, dur, start = 0, pre = 1500 }) => {
    const t0 = performance.now() + 1e6 * (Object.keys(raw).length + 1); // cada clip en su tramo de tiempo
    rest(c, t0 - pre);
    c.mood(mood, { fx: false });
    const tk = ticker(t0 - pre);
    for (let t = t0 - pre; t < t0; t += 33) tk(t);
    if (gesture) {
      c.gesture(gesture, ms ? { ms } : {});
      c.gest.start = t0; // el gesto empieza en t0 (gesture() usa el reloj real)
      for (const m of c.morphs.values()) { m.start = t0; if (m.byGesture) m.until = t0 + (ms || c.gest.ms) - 300; }
    }
    raw[name] = sampleFrames(c, objs, dur, fps, (tau) => {
      tk(t0 + (start + tau) * 1000);
      breathe(tau, dur);
    });
    raw[name].kind = 'base';
  };
  const raw = {};
  base('idle', { dur: L });
  base('win', { mood: 'happy', gesture: 'celebrate', dur: 1.7 });
  base('lose', { mood: 'sad', dur: 3.4 });
  base('thinking', { gesture: 'think', ms: 8000, start: 1.2, dur: 2.5 });
  base('walk', { gesture: 'bounce', dur: 0.9 });
  // talk: sólo la boca
  {
    const t0 = performance.now() + 9e6;
    rest(c, t0);
    const tk = ticker(t0);
    const seq = [0, 0.75, 0.25, 0.9, 0.45, 0.1, 0.8, 0.35, 0.65, 0.15, 0.7, 0.3, 0];
    const wid = [1, 0.85, 1.1, 0.9, 1, 1.05, 0.8, 1, 1.1, 0.9, 1, 1, 1];
    const dur = 2.4;
    raw.talk = sampleFrames(c, objs, dur, fps, (tau) => {
      const k = Math.min(seq.length - 1, Math.floor((tau / dur) * (seq.length - 1) + 0.5));
      c.mo.target = tau > dur - 0.25 ? 0 : seq[k];
      c.mo.tmsx = tau > dur - 0.25 ? 1 : wid[k];
      tk(t0 + tau * 1000);
    });
    raw.talk.kind = 'talk';
  }
  // blink: sólo los ojos
  {
    const t0 = performance.now() + 1e7;
    rest(c, t0);
    c.blinkAt = t0;
    const tk = ticker(t0);
    raw.blink = sampleFrames(c, objs, 0.2, 60, (tau) => tk(t0 + tau * 1000));
    raw.blink.kind = 'blink';
  }
  rest(c, performance.now() + 2e7);

  // ── estructura de export: nombres, envoltorio del ojo (ánimo) y del parpadeo, cabeza ──
  let seq = 0;
  const used = new Set();
  const nameOf = (m, want) => {
    let n = (want || m.name || 'n').replace(/[^a-zA-Z0-9_]/g, '_');
    if (used.has(n) || !want) n = `${n}_${seq++}`;
    used.add(n);
    m.name = n;
    return n;
  };
  c.root.name = 'ot';
  used.add('ot');
  nameOf(c.rig, 'rig');
  const moodNode = new Map(); // ojo → envoltorio
  c.eyes.forEach((e, i) => {
    const mn = e.main;
    const w = new THREE.Group();
    w.position.copy(mn.position);
    w.quaternion.copy(mn.quaternion);
    w.scale.fromArray(restSnap.get(mn).s);
    const parent = mn.parent;
    parent.add(w);
    w.add(mn);
    mn.position.set(0, 0, 0);
    mn.quaternion.identity();
    mn.scale.set(1, 1, 1);
    mn.visible = true;
    nameOf(w, `eye${i}_mood`);
    nameOf(mn, `eye${i}`);
    moodNode.set(mn, w);
  });
  nameOf(c.mouthRig.g, 'mouth');
  if (line) nameOf(line, 'mouth_line');
  if (c.mouthRig.cav) nameOf(c.mouthRig.cav, 'mouth_open');
  c.brows.forEach((b, i) => nameOf(b.g, `brow${i}`));
  c.hands.forEach((h, i) => nameOf(h, `hand${i}`));
  const head = new THREE.Object3D();
  head.position.set(0, c.eyeY, 0);
  c.rig.add(head);
  nameOf(head, 'head');
  for (const m of objs) if (!m.name || !used.has(m.name)) nameOf(m);
  // ocultos en reposo → visibles con escala ~0
  for (const m of objs) {
    if (!m.visible && !mains.has(m)) { m.visible = true; m.scale.set(HIDDEN, HIDDEN, HIDDEN); }
  }

  // ── pistas ──
  const clips = [];
  for (const [name, r] of Object.entries(raw)) {
    const tracks = [];
    objs.forEach((m, i) => {
      const fr = r.frames[i];
      const rs = restSnap.get(m);
      const inMouth = mouth.has(m);
      const add = (prop, key, Track, target = m) => {
        if (fr.every((f) => near(f[key], rs[key]))) return;
        tracks.push(new Track(`${target.name}.${prop}`, r.times, fr.flatMap((f) => f[key])));
      };
      if (r.kind === 'blink') {
        if (!mains.has(m)) return;
        const s0 = rs.s;
        if (fr.every((f) => near(f.s, s0))) return;
        tracks.push(new THREE.VectorKeyframeTrack(`${m.name}.scale`, r.times, fr.flatMap((f) => [f.s[0] / s0[0], f.s[1] / s0[1], f.s[2] / s0[2]])));
        return;
      }
      if (r.kind === 'talk') {
        if (!inMouth) return;
        add('position', 'p', THREE.VectorKeyframeTrack);
        add('quaternion', 'q', THREE.QuaternionKeyframeTrack);
        add('scale', 's', THREE.VectorKeyframeTrack);
        return;
      }
      // base
      if (m === line && rs.w && !fr.every((f) => near(f.w, rs.w))) tracks.push(new THREE.NumberKeyframeTrack(`${m.name}.morphTargetInfluences`, r.times, fr.flatMap((f) => f.w)));
      if (inMouth) return;
      if (mains.has(m)) { add('scale', 's', THREE.VectorKeyframeTrack, moodNode.get(m)); return; }
      add('position', 'p', THREE.VectorKeyframeTrack);
      add('quaternion', 'q', THREE.QuaternionKeyframeTrack);
      add('scale', 's', THREE.VectorKeyframeTrack);
    });
    // una pista vacía no deja exportar el clip: idle quieto igual lleva el cuerpo
    if (!tracks.length) tracks.push(new THREE.VectorKeyframeTrack('rig.scale', [0, r.times[r.times.length - 1]], [1, 1, 1, 1, 1, 1]));
    clips.push(new THREE.AnimationClip(name, r.times[r.times.length - 1], tracks));
  }

  // ── materiales y geometría horneados ──
  const patches = [];
  const bodyMesh = c.bodyMeshes[0];
  const geo = uvBody(c.B);
  let outline = null;
  c.rig.traverse((m) => {
    if (!m.isMesh || m === bodyMesh) return;
    const sf = m.material?.userData?.surface;
    if (!sf) return;
    if (sf.outline) outline = m;
    else patches.push({ mesh: m, ...sf });
  });
  const baked = bake(c, size, patches, geo);
  const textures = new Map();
  const bm = c.bodyMat;
  let bodyMat;
  if (baked.toon) bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  else {
    bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: bm.roughness, metalness: 0, clearcoat: bm.clearcoat, clearcoatRoughness: bm.clearcoatRoughness,
      sheen: bm.sheen, sheenRoughness: bm.sheenRoughness, sheenColor: bm.sheenColor.clone(), emissive: bm.emissive.clone(),
    });
    if (c.bodyU.uTex.value === 4) bodyMat.emissive.copy(new THREE.Color(c.spec.body.color)).multiplyScalar(0.22);
  }
  bodyMat.name = 'ot_body';
  textures.set('ot_body', { png: o.encodePng(baked.body.rgba, baked.body.w, baked.body.h) });
  bodyMesh.geometry = geo;
  bodyMesh.material = bodyMat;
  nameOf(bodyMesh, 'body');
  if (outline) {
    outline.geometry = inflated(geo, outline.material.userData.surface.off, true);
    const om = new THREE.MeshBasicMaterial({ color: outline.material.color.clone() });
    om.name = 'ot_outline';
    outline.material = om;
    nameOf(outline, 'outline');
  }
  patches.forEach((p, i) => {
    const old = p.mesh.material;
    const pm = new THREE.MeshPhysicalMaterial({ color: old.color.clone(), roughness: old.roughness, clearcoat: old.clearcoat, sheen: old.sheen, sheenRoughness: old.sheenRoughness, sheenColor: old.sheenColor?.clone() });
    pm.name = `ot_patch${i}`;
    pm.alphaTest = 0.5;
    p.mesh.material = pm;
    p.mesh.geometry = inflated(geo, p.off, false);
    textures.set(pm.name, { png: o.encodePng(baked.masks[i].rgba, baked.masks[i].w, baked.masks[i].h), mask: true });
  });
  // piezas SVG de mods: el SVG rasterizado (o.rasterSvg) como textura del plano
  planes.forEach((m, i) => {
    const { svg, w, h } = m.userData.modPlane;
    let rgba = null;
    try { rgba = o.rasterSvg(svg, w, h); } catch {}
    if (!rgba) return m.removeFromParent();
    const flip = new Uint8Array(rgba.length); // filas de abajo hacia arriba: el v de PlaneGeometry crece hacia arriba
    for (let y = 0; y < h; y++) flip.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
    const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    pm.name = `ot_mod${i}`;
    m.material = pm;
    textures.set(pm.name, { png: o.encodePng(flip, w, h) });
  });
  // shaders propios (pelo de manos/pompones, toon) → materiales estándar
  const conv = new Map();
  c.rig.traverse((m) => {
    if (!m.isMesh || m === bodyMesh || m === outline) return;
    const old = m.material;
    if (!old || old.name?.startsWith('ot_')) return;
    if (conv.has(old)) { m.material = conv.get(old); return; }
    let nm = null;
    if (old.isMeshToonMaterial) nm = new THREE.MeshStandardMaterial({ color: old.color.clone(), roughness: 0.8 });
    else if (old.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) {
      nm = new THREE.MeshPhysicalMaterial({
        color: old.color.clone(), roughness: old.roughness, clearcoat: old.clearcoat, sheen: old.sheen, sheenRoughness: old.sheenRoughness,
        sheenColor: old.sheenColor?.clone(), emissive: old.emissive?.clone(),
      });
      if (old.defines && 'FUR' in old.defines) nm.color.multiplyScalar(0.92);
    }
    if (nm) { conv.set(old, nm); m.material = nm; }
  });

  // ── glTF ──
  c.root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(c.rig);
  const exporter = new GLTFExporter();
  const glb = await new Promise((res, rej) => exporter.parse(c.root, res, rej, { binary: true, animations: clips, onlyVisible: false, trs: true }));
  const out = withTextures(glb, textures);
  return {
    glb: out,
    info: {
      clips: clips.map((k) => k.name),
      toon: baked.toon,
      plush: c.plush,
      height: bbox.max.y - bbox.min.y,
      headY: c.eyeY,
      bytes: out.byteLength,
    },
  };
}

/** Mete las texturas horneadas (PNG) en el glb, en los materiales por nombre. */
function withTextures(glb, textures) {
  const dv = new DataView(glb);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen)));
  const binStart = 20 + jsonLen;
  const binLen = dv.getUint32(binStart, true);
  const parts = [new Uint8Array(glb, binStart + 8, binLen)];
  let len = binLen;
  const pad = () => { const p = (4 - (len % 4)) % 4; if (p) { parts.push(new Uint8Array(p)); len += p; } };
  json.images ||= [];
  json.textures ||= [];
  json.samplers ||= [];
  json.bufferViews ||= [];
  const sampler = json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }) - 1;
  for (const m of json.materials || []) {
    const t = textures.get(m.name);
    if (!t) continue;
    pad();
    const bv = json.bufferViews.push({ buffer: 0, byteOffset: len, byteLength: t.png.length }) - 1;
    parts.push(t.png);
    len += t.png.length;
    const img = json.images.push({ bufferView: bv, mimeType: 'image/png' }) - 1;
    const tex = json.textures.push({ sampler, source: img }) - 1;
    m.pbrMetallicRoughness ||= {};
    m.pbrMetallicRoughness.baseColorTexture = { index: tex };
    if (t.mask) { m.alphaMode = 'MASK'; m.alphaCutoff = 0.5; }
  }
  pad();
  json.buffers[0].byteLength = len;
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jp = (4 - (js.length % 4)) % 4;
  if (jp) { const j2 = new Uint8Array(js.length + jp).fill(0x20); j2.set(js); js = j2; }
  const total = 12 + 8 + js.length + 8 + len;
  const out = new Uint8Array(total);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, 0x46546c67, true);
  ov.setUint32(4, 2, true);
  ov.setUint32(8, total, true);
  ov.setUint32(12, js.length, true);
  ov.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  let off = 20 + js.length;
  ov.setUint32(off, len, true);
  ov.setUint32(off + 4, 0x004e4942, true);
  off += 8;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out.buffer;
}
