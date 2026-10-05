/**
 * Efectos 3D de los ots: los mismos 16 de motion.js (EFFECTS) con las mismas posiciones
 * relativas, como piezas de volumen baratas. Cada efecto es UN InstancedMesh por tipo de pieza
 * (geometría unitaria y material compartidos), así una multitud entera cuesta pocos draws.
 * Las piezas «desaparecen» encogiéndose (sin transparencias que ordenar).
 *
 * Coordenadas: las del personaje 3D (origen en la base, y hacia arriba). En 2D y crece hacia
 * abajo desde la parte de arriba del cuerpo: y3 = H · (1 − fracción).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EASE, clamp, seeded } from '../character/motion.js';
import { mat } from './materials.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const pop = (q, a = 0.2) => EASE.backOut(clamp(q / a));
const fade = (q, b = 0.25) => clamp((1 - q) / b);

// ── geometrías unitarias compartidas (perezosas) ──
const geos = {};
const ext = (shp, d = 0.25) => new THREE.ExtrudeGeometry(shp, { depth: d, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2, curveSegments: 8 }).center();
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
const merge = (...gs) => mergeGeometries(gs.map((g) => clean(g.index ? g.toNonIndexed() : g)));
const MAKERS = {
  star: () => {
    const s = new THREE.Shape();
    s.moveTo(0, 1);
    for (const [cx, cy, x, y] of [[0, 0, 1, 0], [0, 0, 0, -1], [0, 0, -1, 0], [0, 0, 0, 1]]) s.quadraticCurveTo(cx, cy, x, y);
    return ext(s, 0.3);
  },
  heart: () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.9);
    s.bezierCurveTo(-1.4, 0.1, -0.7, 1.05, 0, 0.35);
    s.bezierCurveTo(0.7, 1.05, 1.4, 0.1, 0, -0.9);
    return ext(s, 0.35);
  },
  drop: () => {
    const p = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      const r = Math.sin(a) * (a > Math.PI / 2 ? 1 : 0.35 + 0.65 * Math.sin(a));
      p.push(new THREE.Vector2(Math.max(0.001, r * 0.8), Math.cos(a) * 1.2));
    }
    return new THREE.LatheGeometry(p, 14);
  },
  z: () => {
    const s = new THREE.Shape();
    s.moveTo(-1, 1); s.lineTo(1, 1); s.lineTo(1, 0.62); s.lineTo(-0.35, -0.62); s.lineTo(1, -0.62); s.lineTo(1, -1);
    s.lineTo(-1, -1); s.lineTo(-1, -0.62); s.lineTo(0.35, 0.62); s.lineTo(-1, 0.62); s.lineTo(-1, 1);
    return ext(s, 0.4);
  },
  note: () => merge(
    new THREE.SphereGeometry(0.42, 12, 8).scale(1.25, 0.95, 0.7).rotateZ(0.35).translate(-0.3, -0.75, 0),
    new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6).translate(0.18, 0, 0),
    new THREE.BoxGeometry(0.5, 0.18, 0.12).rotateZ(-0.5).translate(0.38, 0.6, 0),
  ),
  bang: () => merge(new THREE.CylinderGeometry(0.2, 0.12, 1.15, 12).translate(0, 0.62, 0), new THREE.SphereGeometry(0.17, 12, 8).translate(0, -0.12, 0)),
  ask: () => {
    const c = new THREE.CatmullRomCurve3([[-0.35, 0.75], [-0.25, 1.05], [0.15, 1.12], [0.42, 0.9], [0.35, 0.6], [0.05, 0.45], [0, 0.18]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
    return merge(new THREE.TubeGeometry(c, 24, 0.11, 8), new THREE.SphereGeometry(0.15, 12, 8).translate(0, -0.12, 0));
  },
  anger: () => {
    const gs = [];
    for (const [sx, sy] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
      const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.25 * sx, 0.9 * sy, 0), new THREE.Vector3(0.25 * sx, 0.25 * sy, 0), new THREE.Vector3(0.9 * sx, 0.25 * sy, 0));
      gs.push(new THREE.TubeGeometry(c, 10, 0.13, 6));
    }
    return merge(...gs);
  },
  cloud: () => merge(...[[0, 0, 0.55], [-0.5, -0.05, 0.4], [0.5, -0.02, 0.42], [-0.22, 0.28, 0.4], [0.25, 0.3, 0.38], [0, -0.2, 0.42]].map(([x, y, r]) => new THREE.SphereGeometry(r, 14, 10).scale(1, 1, 0.6).translate(x, y, 0))),
  ball: () => new THREE.SphereGeometry(1, 14, 10),
  ballHi: () => new THREE.SphereGeometry(1, 24, 16),
  chip: () => new THREE.BoxGeometry(1, 0.5, 0.12),
};
export function glyph(id) {
  let g = geos[id];
  if (!g) { g = geos[id] = MAKERS[id](); g.userData.shared = true; }
  return g;
}

let bubbleMat = null;
const bubble = () => bubbleMat || (bubbleMat = new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.4, depthWrite: false, envMapIntensity: 2, iridescence: 1 }));

const dummy = new THREE.Object3D();
/** InstancedMesh de una pieza; put() coloca la instancia i (escala 0 = oculta). */
function inst(geoId, material, n) {
  const m = new THREE.InstancedMesh(glyph(geoId), material, n);
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.userData.instFx = true;
  return m;
}
function put(m, i, x, y, z, s, rz = 0, rx = 0, ry = 0, sy = s) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rx, ry, rz);
  dummy.scale.set(s, sy, s);
  if (s <= 1e-4) dummy.scale.setScalar(1e-5);
  dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix);
}
const done = (...ms) => { for (const m of ms) m.instanceMatrix.needsUpdate = true; };

/**
 * Definiciones: { ms, loop?, rig? (va pegado a la cara), make(c, f) → Object3D, draw(c, f, p, age, a, rnd) }.
 * c: { W, H, D, eyeY, r, sp, mouth: Vector3, low, tears: [[[x,y,z]…] por lado] }
 */
export const FX3D = {
  sparkles: {
    ms: 1300,
    make: (c, f) => (f.m = inst('star', mat('gloss', '#ffd84d'), 6)),
    draw: (c, f, p, age, a, rnd) => {
      for (let i = 0; i < 6; i++) {
        const an = rnd() * TAU, d = 0.55 + rnd() * 0.25, zz = (rnd() - 0.3) * c.D;
        const q = clamp((p - i * 0.08) / 0.5);
        const s = c.W * 0.07 * (0.6 + rnd() * 0.6) * Math.sin(Math.PI * q) * a;
        put(f.m, i, Math.cos(an) * c.W * d, c.H * 0.55 - Math.sin(an) * c.H * d * 0.85, zz, s, -age * 0.08 * DEG);
      }
      done(f.m);
    },
  },
  sweat: {
    ms: 1800,
    make: (c, f) => (f.m = inst('drop', mat('gloss', '#8fd3ff'), 1)),
    draw: (c, f, p, age, a) => {
      put(f.m, 0, f.dir * c.W * 0.4, c.H * (0.8 - 0.08 * EASE.inOut(p)), c.D * 0.45, c.W * 0.05 * pop(p, 0.15) * Math.min(a, fade(p)), -f.dir * 12 * DEG);
      done(f.m);
    },
  },
  blush: {
    ms: 2000,
    make: () => null,
    draw: (c, f, p, age, a) => { f.blush = Math.min(clamp(p / 0.15), fade(p)) * a; },
  },
  hearts: {
    ms: 1900,
    make: (c, f) => (f.m = inst('heart', mat('gloss', '#ff4d7a'), 3)),
    draw: (c, f, p, age, a, rnd) => {
      for (let i = 0; i < 3; i++) {
        const q = clamp((p - i * 0.15) / 0.7);
        const s = q <= 0 ? 0 : c.W * (0.07 + rnd() * 0.03) * pop(q) * fade(q, 0.3) * a;
        put(f.m, i, (i - 1) * c.W * 0.28 + Math.sin(q * TAU + i) * c.W * 0.05, c.H * 0.88 + c.H * 0.5 * EASE.out(q), c.D * 0.3, s, Math.sin(q * 9 + i) * 0.25);
      }
      done(f.m);
    },
  },
  zzz: {
    ms: 2600,
    loop: true,
    make: (c, f) => (f.m = inst('z', mat('gloss', '#5b6ee1'), 3)),
    draw: (c, f, p, age, a) => {
      for (let i = 0; i < 3; i++) {
        const q = (p + i / 3) % 1;
        put(f.m, i, f.dir * (c.W * 0.32 + c.W * 0.25 * q), c.H * 0.88 + c.H * 0.45 * q, c.D * 0.2, c.W * (0.033 + 0.05 * q) * Math.sin(Math.PI * q) * a, f.dir * -0.2);
      }
      done(f.m);
    },
  },
  exclaim: {
    ms: 1100,
    make: (c, f) => (f.m = inst('bang', mat('gloss', '#ff3b30'), 1)),
    draw: (c, f, p, age, a) => {
      put(f.m, 0, f.dir * c.W * 0.36, c.H * 1.04, c.D * 0.2, c.W * 0.24 * pop(p, 0.18) * Math.min(a, fade(p, 0.2)), Math.sin(age / 60) * 6 * fade(p, 0.6) * DEG);
      done(f.m);
    },
  },
  question: {
    ms: 1500,
    make: (c, f) => (f.m = inst('ask', mat('gloss', '#4f7cff'), 1)),
    draw: (c, f, p, age, a) => {
      put(f.m, 0, f.dir * c.W * 0.4, c.H * 1.02 + Math.sin(age / 200) * c.H * 0.015, c.D * 0.2, c.W * 0.24 * pop(p) * Math.min(a, fade(p, 0.2)), -f.dir * 12 * DEG);
      done(f.m);
    },
  },
  anger: {
    ms: 1300,
    make: (c, f) => (f.m = inst('anger', mat('gloss', '#ff2d2d'), 1)),
    draw: (c, f, p, age, a) => {
      put(f.m, 0, f.dir * c.W * 0.33, c.H * 0.86, c.D * 0.55, c.W * 0.075 * pop(p, 0.15) * (1 + 0.12 * Math.sin(age / 70)) * Math.min(a, fade(p)), 0, 0, f.dir * 0.5);
      done(f.m);
    },
  },
  steam: {
    ms: 1500,
    make: (c, f) => (f.m = inst('ball', mat('felt', '#eef0f3'), 6)),
    draw: (c, f, p, age, a) => {
      let k = 0;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const q = clamp((p - i * 0.15) / 0.65);
          const r = q <= 0 || q >= 1 ? 0 : c.W * (0.04 + 0.07 * q) * Math.min(1, (1 - q) * 3) * a;
          put(f.m, k++, s * (c.W * 0.28 + c.W * 0.18 * q), c.H * 0.88 + c.H * 0.38 * q, 0, r);
        }
      }
      done(f.m);
    },
  },
  confetti: {
    ms: 1900,
    make: (c, f) => {
      const n = c.low ? 12 : 22;
      const m = (f.m = inst('chip', mat('plastic', '#ffffff'), n));
      const cols = ['#ff4d7a', '#ffd84d', '#4dd2ff', '#7cff6b', '#b18cff', '#ff9f43'];
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) m.setColorAt(i, col.set(cols[i % cols.length]));
      return m;
    },
    draw: (c, f, p, age, a, rnd) => {
      const tt = p * 1.9;
      const n = f.m.count;
      const s = c.W * 0.035 * Math.min(a, fade(p, 0.3));
      for (let i = 0; i < n; i++) {
        const an = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
        const v = c.H * (0.9 + rnd() * 0.8);
        const vz = (rnd() - 0.4) * v * 0.6;
        const sp = 0.3 + rnd() * 0.5;
        const y = Math.max(0.005, c.H * 0.95 - Math.sin(an) * v * tt - c.H * 1.1 * tt * tt);
        put(f.m, i, Math.cos(an) * v * tt * 0.7, y, vz * tt, s, age * sp * DEG + i, age * sp * 0.7 * DEG, i * 0.7);
      }
      done(f.m);
    },
  },
  tears: {
    ms: 2200,
    rig: true,
    make: (c, f) => (f.m = inst('drop', mat('gloss', '#8fd3ff'), 4)),
    draw: (c, f, p, age, a) => {
      let k = 0;
      for (const path of c.tears) {
        for (let i = 0; i < 2; i++) {
          const q = ((p * 2 + i * 0.5) % 1) * (p < 0.9 ? 1 : 0);
          const u = q * q * (path.length - 1);
          const j = Math.min(path.length - 2, Math.floor(u));
          const t = u - j;
          const A = path[j], B = path[j + 1];
          put(f.m, k++, A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, q <= 0 ? 0 : c.r * 0.28 * (1 - q) * a * 1.4);
        }
      }
      done(f.m);
    },
  },
  thought: {
    ms: 2200,
    make: (c, f) => {
      f.m = inst('ball', mat('felt', '#ffffff'), 2);
      f.c = inst('cloud', mat('felt', '#ffffff'), 1);
      f.d = inst('ball', mat('felt', '#64748b'), 3);
      const g = new THREE.Group();
      g.add(f.m, f.c, f.d);
      return g;
    },
    draw: (c, f, p, age, a) => {
      const e = Math.min(a, fade(p, 0.15));
      const pp = (q) => pop(clamp((p - q) / 0.4), 0.5);
      const x = f.dir * c.W * 0.55, y = c.H * 1.22, z = c.D * 0.15;
      put(f.m, 0, f.dir * c.W * 0.3, c.H * 0.98, z, c.W * 0.025 * pp(0) * e);
      put(f.m, 1, f.dir * c.W * 0.4, c.H * 1.08, z, c.W * 0.042 * pp(0.08) * e);
      const b = c.W * 0.36 * pp(0.16) * e;
      put(f.c, 0, x, y, z, b);
      for (let i = 0; i < 3; i++) put(f.d, i, x + (i - 1) * b * 0.32, y, z + b * 0.36, b * 0.07 * (0.6 + 0.6 * Math.max(0, Math.sin(age / 180 - i * 0.9))));
      done(f.m, f.c, f.d);
    },
  },
  notes: {
    ms: 2200,
    make: (c, f) => (f.m = inst('note', mat('gloss', '#8b5cf6'), 3)),
    draw: (c, f, p, age, a) => {
      for (let i = 0; i < 3; i++) {
        const q = clamp((p - i * 0.18) / 0.65);
        const s = i % 2 ? -1 : 1;
        put(f.m, i, s * c.W * (0.42 + 0.1 * q) + Math.sin(q * TAU) * c.W * 0.03, c.H * 0.75 + c.H * 0.5 * q, c.D * 0.25, q <= 0 || q >= 1 ? 0 : c.W * 0.11 * Math.sin(Math.PI * q) * a, -s * 10 * DEG);
      }
      done(f.m);
    },
  },
  sneeze: {
    ms: 700,
    make: (c, f) => (f.m = inst('ball', mat('gloss', '#9fd8ff'), c.low ? 6 : 10)),
    draw: (c, f, p, age, a, rnd) => {
      const q = EASE.out(p);
      const mo = c.mouth;
      for (let i = 0; i < f.m.count; i++) {
        const an = (rnd() - 0.5) * 1.1, el = (rnd() - 0.5) * 0.8;
        const d = c.W * (0.15 + rnd() * 0.45) * q;
        put(f.m, i, mo.x + f.dir * c.W * 0.05 + Math.sin(an) * d, mo.y + Math.sin(el) * d * 0.5 - c.H * 0.15 * q * q, mo.z + Math.cos(an) * d, c.W * (0.012 + rnd() * 0.015) * (1 - p) * a);
      }
      done(f.m);
    },
  },
  bubble: {
    ms: 1000,
    make: (c, f) => (f.m = inst('ballHi', bubble(), 1)),
    draw: (c, f, p, age, a) => {
      const q = EASE.out(clamp(p / 0.85));
      const burst = clamp((p - 0.85) / 0.15);
      const r = c.W * (0.03 + 0.05 * q) * (1 + burst * 0.4) * (1 - burst) * a;
      put(f.m, 0, c.mouth.x + f.dir * c.W * 0.06 + Math.sin(p * 9) * c.W * 0.02, c.mouth.y + c.H * 0.3 * q, c.mouth.z + c.W * 0.08, r);
      done(f.m);
    },
  },
  dizzy: {
    ms: 1600,
    loop: true,
    make: (c, f) => (f.m = inst('star', mat('gloss', '#ffd84d'), 3)),
    draw: (c, f, p, age, a) => {
      for (let i = 0; i < 3; i++) {
        const an = p * TAU + (i * TAU) / 3;
        put(f.m, i, Math.cos(an) * c.W * 0.42, c.H * 1.0 + Math.sin(an) * c.H * 0.04, Math.sin(an) * c.D * 1.1, c.W * 0.045 * a, age * 0.004, 0, an);
      }
      done(f.m);
    },
  },
};

/** Libera un efecto (los buffers de instancias; geometría y material son compartidos). */
export function disposeFx(o) {
  o?.traverse?.((m) => { if (m.isInstancedMesh) m.dispose(); });
  o?.removeFromParent();
}

export { seeded };
