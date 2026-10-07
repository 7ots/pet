/**
 * Cuerpo 3D a partir del MISMO contorno de 16 puntos del personaje 2D.
 *
 * El contorno (Catmull-Rom, igual que splinePath) se pasa a una tabla polar R(θ) alrededor del
 * centro del cuerpo. Una esfera unitaria se deforma así: una dirección (dx,dy,dz) va a
 * (dx·R(θ), cy + dy·R(θ), dz·D) con θ = ángulo de (dx,dy). En el ecuador (dz=0) la silueta
 * frontal es exactamente el contorno 2D; hacia delante y atrás se redondea como un peluche.
 * La profundidad D se suaviza hacia el centro de la cara para que no haya pliegues ahí, y se
 * limita en las puntas (orejas de gato, picos) para que sean más planas.
 *
 * Unidades: 1 unidad 3D = 100 unidades del viewBox 2D. El origen está en la base del cuerpo.
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const U = 1 / 100;
const NB = 360; // muestras angulares de la tabla polar

/** Contorno denso (mismas Bézier que splinePath en Character.js). */
export function densify(pts, per = 12) {
  const N = pts.length;
  const P = (i) => pts[(i + N) % N];
  const out = [];
  for (let i = 0; i < N; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
      out.push([a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]]);
    }
  }
  return out;
}

/** Tabla polar: distancia máxima del centro al contorno para NB ángulos (coordenadas 2D, y hacia abajo). */
function polarTable(poly, cx, cy) {
  const R = new Float32Array(NB);
  const n = poly.length;
  for (let k = 0; k < NB; k++) {
    const a = (k / NB) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % n];
      const ex = x2 - x1, ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const qx = x1 - cx, qy = y1 - cy;
      const t = (qx * ey - qy * ex) / den; // a lo largo del rayo
      const u = (qx * dy - qy * dx) / den; // a lo largo del segmento
      if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
    }
    R[k] = best;
  }
  // suavizado circular ligero (quita escalones de la poligonal)
  const S = new Float32Array(NB);
  for (let k = 0; k < NB; k++) S[k] = (R[(k + NB - 1) % NB] + 2 * R[k] + R[(k + 1) % NB]) / 4;
  return S;
}

const sampleTable = (T, ang) => {
  let f = ((ang / (Math.PI * 2)) % 1 + 1) % 1 * NB;
  const i = Math.floor(f);
  f -= i;
  return T[i % NB] * (1 - f) + T[(i + 1) % NB] * f;
};

const cache = new Map();

/**
 * Geometría del cuerpo (cacheada por contorno y resolución).
 * @param {number[][]} pts 16 puntos 2D
 * @param {{w:number,h:number,x:number,y:number}} box caja 2D del contorno
 * @param {'high'|'low'} quality
 */
export function bodyGeometry(pts, box, quality = 'high') {
  const key = `${quality}|${pts.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`).join(' ')}`;
  if (cache.has(key)) return cache.get(key);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h * 0.54;
  const bottom = box.y + box.h;
  const T = polarTable(densify(pts), cx, cy);
  let mean = 0;
  for (let k = 0; k < NB; k++) mean += T[k];
  mean /= NB;
  const depthK = 0.86;
  const Dc = depthK * mean;

  const [ws, hs] = quality === 'high' ? [96, 64] : [40, 26];
  /** Dirección unitaria de la esfera → punto de la superficie (out). También la usa export.js para hornear. */
  const surface = (x, y, z, out = new THREE.Vector3()) => {
    const s2 = x * x + y * y;
    const ang = Math.atan2(-y, x); // a coordenadas 2D (y hacia abajo)
    const R = sampleTable(T, ang);
    const Dt = depthK * Math.min(R, mean * 1.05);
    const D = Dc + (Dt - Dc) * s2;
    let py = (bottom - cy) * U + y * R * U;
    if (py < 0.03) py = 0.03 + (py - 0.03) * 0.35; // asiento: aplana un poco la base para que «se apoye» en el suelo
    return out.set(x * R * U, py, z * D * U);
  };
  let g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5); // sin costura: normales continuas
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    surface(v.x, v.y, v.z, v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.shared = true; // cacheada: no se libera con el personaje
  const out = { geometry: g, table: T, cx, cy, bottom, mean, depth: Dc * U, surface, segments: [ws, hs] };
  cache.set(key, out);
  if (cache.size > 160) cache.delete(cache.keys().next().value);
  return out;
}

/** Proyector a la superficie: (x,y) 3D → punto y normal en la cara frontal (o desde arriba). */
export function surfaceProbe(geometry) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  const hit = (ox, oy, oz, dx, dy, dz) => {
    o.set(ox, oy, oz);
    d.set(dx, dy, dz).normalize();
    ray.set(o, d);
    const h = ray.intersectObject(mesh, false)[0];
    return h ? { p: h.point.clone(), n: h.face.normal.clone() } : null;
  };
  return {
    /** Punto frontal en (x,y). */
    front(x, y) {
      return hit(x, y, 10, 0, 0, -1) || { p: new THREE.Vector3(x, y, 0), n: new THREE.Vector3(0, 0, 1) };
    },
    /** Punto superior en (x,z). */
    top(x, z = 0) {
      return hit(x, 10, z, 0, -1, 0) || { p: new THREE.Vector3(x, 1, z), n: new THREE.Vector3(0, 1, 0) };
    },
    /** Semianchura y semiprofundidad a la altura y. */
    section(y) {
      const r = hit(10, y, 0, -1, 0, 0);
      const f = hit(0, y, 10, 0, 0, -1);
      return { w: r ? Math.abs(r.p.x) : 0.5, d: f ? Math.abs(f.p.z) : 0.4, z: f ? f.p.z : 0.4 };
    },
  };
}
