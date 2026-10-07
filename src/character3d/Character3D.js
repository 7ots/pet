/**
 * Personaje 3D de 7ots a partir de la MISMA spec (look.character) que el 2D: silueta, colores,
 * estampado, ojos, cejas, boca, mejillas y accesorios salen de normalizeCharacter/layout, así
 * que cada ot es la versión «peluche» de sí mismo. Los gestos reutilizan las poses de
 * motion.js (GESTURES), los ánimos los mismos valores que Character.js y el habla los visemas.
 *
 * Esta clase solo construye y anima un THREE.Group (`root`); quién lo dibuja es una vista del
 * escenario compartido (stage.js / index.js).
 */

import * as THREE from 'three';
import { normalizeCharacter, layout, bodyPoints } from '../character/Character.js';
import { stylizeSpec } from '../character/styles.js';
import { applyMods, modPart } from '../character/mods.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Acabado 3D de cada estilo artístico (styles.js): la paleta sale de stylizeSpec y aquí se elige
 * el material. Los estilos sin entrada se deducen del acabado 2D (contorno → toon).
 */
const STYLE_FINISH = {
  ukiyoe: 'toon', glass: 'glossy', bauhaus: 'toon', manuscript: 'toon', glitch: 'neon', clay: 'clay', ink: 'sketch',
  pop: 'toon', watercolor: 'soft3d', pixel: 'toon', synthwave: 'neon', nouveau: 'toon', cubism: 'toon', crayon: 'sketch', blueprint: 'neon', pointillism: 'soft3d', woodcut: 'sketch',
  riso: 'toon', dotmatrix: 'toon', chalk: 'sketch', sticker: 'glossy', felt: 'clay', papercut: 'soft3d', lowpoly: 'toon', marble: 'soft3d', candy: 'glossy',
  holo: 'glossy', sumie: 'sketch', tarot: 'toon', retro70: 'toon', mosaic: 'toon', neonsign: 'neon', graffiti: 'toon', thermal: 'soft3d',
};
/** Piezas del catálogo 2 sin modelo 3D propio → la existente más parecida (campo `as3d` en parts.js). */
function alias3D(s) {
  s.eyes = { ...s.eyes, type: as3d('eyes', s.eyes.type) };
  s.brows = { ...s.brows, type: as3d('brows', s.brows.type) };
  s.mouth = { ...s.mouth, type: as3d('mouths', s.mouth.type) };
  s.cheeks = { ...s.cheeks, type: as3d('cheeks', s.cheeks.type) };
  s.body = { ...s.body, pattern: as3d('patterns', s.body.pattern) };
  s.finish = as3d('finishes', s.finish);
  s.accessories = s.accessories.map((a) => ({ ...a, id: as3d('accessories', a.id) }));
  return s;
}
function styled3D(spec) {
  const s = alias3D(stylizeSpec(spec));
  if (!s._style) return s;
  const f2 = s.finish;
  s.finish = STYLE_FINISH[s._style.id] || (f2 === 'clay' || f2 === 'sketch' ? f2 : s._style.lw > 0 ? 'toon' : f2 === 'flat' ? 'soft3d' : f2);
  return s;
}
import { shade, luminance, as3d } from '../character/parts.js';
import { textureOf } from '../character/skin.js';
import { GESTURES, GESTURE_ALIAS, VISEMES, EASE, clamp, lerp, approach, textToVisemes, babbleVisemes, HAND_POSES, MORPHS, EFFECTS, shapePoints, seeded } from '../character/motion.js';
import { U, bodyGeometry, surfaceProbe } from './body.js';
import { bodyMaterials, surfaceMaterial, mat, shadowTexture, CHEEK_IDS } from './materials.js';
import { FX3D, glyph, disposeFx } from './fx.js';
import { buildModel, tickModel, modelGesture } from './model.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const Z = new THREE.Vector3(0, 0, 1);
const DUMMY = new THREE.Object3D();

// Mismos valores que Character.js (MOOD)
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
const moodVals = (n) => ({ ...MOOD_BASE, ...(MOOD[n] || MOOD.neutral) });
export const MOODS_3D = Object.keys(MOOD);
export const GESTURES_3D = Object.keys(GESTURES);

const BEAD = new Set(['dot', 'kawaii', 'bean', 'sparkle', 'teary', 'button', 'pixel', 'villain']);
const SHINY = new Set(['kawaii', 'sparkle', 'teary']);
const LIDS = { sleepy: [0.5, 0], tired: [0.42, 0], angry: [0.42, 1], sad: [0.42, -1], focused: [0.33, 0] };
const OPEN_MIN = { grin: 0.35, laugh: 0.6, open: 0.35, vampire: 0.25, buck: 0.12, braces: 0.35, monster: 0.45, gap: 0.35, toothless: 0.45, drool: 0.2, mustachio: 0.1 };
const TEETH = new Set(['grin', 'braces', 'monster', 'gap', 'mustachio', 'vampire', 'buck']);
const ROUND = new Set(['oh', 'kiss', 'whistle']);
const CURVE_BIAS = { frown: -0.7, flat: -0.15, smile: 0.25, smirk: 0.2, pout: -0.5, cat: 0.3 };

// Efectos y metamorfosis que acompañan a cada ánimo (mismos que Character.js)
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
export const MORPHS_3D = Object.keys(MORPHS);
export const EFFECTS_3D = Object.keys(EFFECTS);
// escala del rig por metamorfosis de deformación: [x, y]
const SCALE_MORPH = {
  puff: (k) => [1 + 0.2 * k, 1 + 0.14 * k],
  squish: (k) => [1 + 0.22 * k, 1 - 0.22 * k],
  stretch: (k) => [1 - 0.12 * k, 1 + 0.26 * k],
  melt: (k) => [1 + 0.06 * k, 1 - 0.38 * k],
};

const nowMs = () => performance.now();
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const shared = (o) => { o.userData.shared = true; return o; };

// glb de los mods: uno por url, compartido entre ots (sus geometrías no se liberan con el rig)
const GLB = new Map();
function loadGlb(url) {
  if (!GLB.has(url)) {
    const p = new Promise((res, rej) => {
      const loader = new GLTFLoader();
      const done = (g) => res(g.scene);
      if (url.startsWith('data:')) {
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        loader.parse(buf.buffer, '', done, rej);
      } else loader.load(url, done, undefined, rej);
    });
    p.catch(() => GLB.delete(url));
    GLB.set(url, p);
  }
  return GLB.get(url);
}

/** Malla con posición/rotación/escala opcionales. */
function M(geo, material, p, r, s) {
  const m = new THREE.Mesh(geo, material);
  if (p) m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s) (typeof s === 'number' ? m.scale.setScalar(s) : m.scale.set(...s));
  return m;
}
const G = (...children) => { const g = new THREE.Group(); if (children.length) g.add(...children); return g; };

export class Character3D {
  /**
   * @param {object} spec look.character (se normaliza)
   * @param {object} [opts] { quality: 'high'|'low', material: 'plush'|'auto', idle: true }
   */
  constructor(spec, opts = {}) {
    this.opts = opts;
    this.quality = opts.quality || 'high';
    this.q = this.quality === 'high' ? 1 : 0.45;
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    this.yaw = 0;
    this.view = null;
    this.phase = Math.random() * TAU;
    this.moodName = 'neutral';
    this.mv = moodVals('neutral');
    this.sleepK = 0;
    this.look = { x: 0, y: 0, tx: 0, ty: 0, at: -1e9 };
    this.mo = { open: 0, target: 0, msx: 1, tmsx: 1 };
    this.blinkAt = -1e9;
    this.nextBlink = nowMs() + 600 + Math.random() * 3000;
    this.gest = null;
    this.speech = null;
    this.shells = 0;
    this.morphs = new Map();
    this.fxs = [];
    this.fxSeq = 0;
    this.fxg = new THREE.Group(); // efectos que no giran con el cuerpo
    this.root.add(this.fxg);
    this.build(spec);
  }

  // ───────────────────────────── construcción ─────────────────────────────

  build(spec) {
    this.disposeRig();
    this.clearMorphObjects();
    for (const f of this.fxs) disposeFx(f.obj);
    this.fxs = [];
    const s = (this.spec = styled3D(applyMods(normalizeCharacter(spec), normalizeCharacter)));
    this.modelMode = false;
    this.modelTok = null;
    if (s._model && s._model.url !== this.modelFailed) return this.buildModel(s); // mod de cuerpo completo (model.js)
    const st = s._style; // estilo artístico: sin pelo, con su paleta y su contorno
    const pts = bodyPoints(s);
    const L = (this.L = layout(s));
    const B = (this.B = bodyGeometry(pts, L.box, this.quality));
    const probe = surfaceProbe(B.geometry);
    const W = (this.W = L.box.w * U);
    const H = (this.H = L.box.h * U);
    this.depth = B.depth;
    const kk = (this.kk = Math.sqrt(W * H) / 1.25); // escala de accesorios (1 ≈ ot medio)
    const Y = (this.Y = (y) => (B.bottom - y) * U);
    const X = (this.X = (x) => (x - L.cx) * U);
    const tex = (this.tex = as3d('textures', textureOf(s)));
    const plush = (this.plush = !st && ((this.opts.material || 'plush') === 'plush' || ['fur', 'fuzz', 'feathers'].includes(tex)));
    const furLen = (this.furLen = plush ? (tex === 'fuzz' || tex === 'none' ? 0.05 : 0.065) * kk : 0);
    const density = (this.density = furLen ? (this.quality === 'high' ? 1 / (furLen * 0.2) : 1 / (furLen * 0.32)) : 0);
    this.maxShells = this.quality === 'high' ? 28 : 10;
    const body = s.body.color;
    const dark = luminance(body) < 0.28;
    const pal = (this.pal = {
      body,
      brow: s.brows.color || shade(body, dark ? 0.6 : -0.6),
      lip: s.mouth.color || shade(body, dark ? 0.6 : -0.55),
    });
    this.furs = [];
    this.pending = []; // glb de los mods que aún cargan (export.js los espera)
    this.parts = [];
    this.anims = [];
    this.bodyMeshes = [];
    this.zGrid = null;
    this.hideMouth = false;

    // cuerpo
    const bm = bodyMaterials({ color: body, patternColor: s.body.patternColor, pattern: s.body.pattern, finish: s.finish, plush, furLen, density, cheekColor: s.cheeks.color, texture: tex });
    this.bodyU = bm.uniforms;
    this.bodyMat = bm.base;
    const r3 = L.r * U;
    const eyeY = Y(L.eyeY);
    this.r3 = r3;
    this.eyeY = eyeY;
    bm.uniforms.uDims.value.set(W, H, eyeY, r3);
    bm.uniforms.uSp.value = L.sp * U;
    const bodyMesh = shared(new THREE.Mesh(B.geometry, bm.base));
    bodyMesh.userData.ownMaterial = true;
    this.rig.add(bodyMesh);
    this.bodyMeshes.push(bodyMesh);
    if (bm.shell) this.bodyMeshes.push(this.addShells(B.geometry, bm, this.rig));
    this.probe = probe;
    // contorno de dibujo animado (toon/sketch): casco invertido
    const lineW = st ? st.lw * 0.0042 : s.finish === 'toon' ? 0.016 : 0.009;
    if (s.finish === 'toon' || s.finish === 'sketch' || (st && st.lw > 0)) {
      const ol = new THREE.Mesh(B.geometry, surfaceMaterial(bm.uniforms, { outline: true, color: st?.ink || '#1f2937', off: furLen * 1.05 + lineW * kk, wobble: s.finish === 'sketch' ? 0.6 : 0 }));
      ol.userData.ownMaterial = true;
      ol.userData.noBounds = true;
      this.rig.add(ol);
      this.bodyMeshes.push(ol);
    }

    // ojos
    this.eyes = [];
    const single = s.eyes.type === 'cyclops';
    const xs = single ? [0] : [-L.sp * U, L.sp * U];
    xs.forEach((x, i) => {
      const side = single ? 1 : i ? 1 : -1;
      const hit = probe.front(x, eyeY);
      const eye = this.buildEye(s.eyes.type, single ? r3 * 1.7 : r3, side);
      eye.root.position.copy(hit.p);
      eye.root.quaternion.setFromUnitVectors(Z, hit.n.clone().lerp(Z, 0.5).normalize());
      this.rig.add(eye.root);
      this.eyes.push(eye);
      this.part(eye.root, true);
      if (bm.uniforms.uBald.value[i]) bm.uniforms.uBald.value[i].set(hit.p.x, hit.p.y, hit.p.z, (single ? r3 * 1.7 : r3) * 1.05);
    });

    // cejas
    this.brows = [];
    if (s.brows.type !== 'none') {
      const bt = s.brows.type;
      const w = { thick: 0.2, thin: 0.06, bushy: 0.16, dots: 0.18, soft: 0.09 }[bt] || 0.11;
      const uni = bt === 'unibrow';
      const list = uni ? [0] : xs.length === 1 ? [0] : xs;
      for (const x of list) {
        const side = x < 0 ? -1 : 1;
        const by = eyeY + r3 * 1.65 * (single ? 1.5 : 1);
        const hit = probe.front(x, by);
        const half = uni ? L.sp * U + r3 : r3 * 0.85;
        const V = (a, b) => new THREE.Vector3(a * r3 * side, b * r3, r3 * 0.06);
        let curve;
        if (bt === 'arched') curve = new THREE.QuadraticBezierCurve3(V(-0.9, -0.25), V(0.1, 0.7), V(0.95, -0.05));
        else if (bt === 'angled') { curve = new THREE.CurvePath(); curve.add(new THREE.LineCurve3(V(-0.9, -0.15), V(0.35, 0.35))); curve.add(new THREE.LineCurve3(V(0.35, 0.35), V(0.9, 0.05))); }
        else curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-half, 0, 0), new THREE.Vector3(0, r3 * (bt === 'soft' ? 0.45 : 0.35), r3 * 0.12), new THREE.Vector3(half, 0, 0));
        const geo = bt === 'dots' ? this.sph(r3 * 0.3, 16, 12).scale(1.3, 0.8, 0.6) : new THREE.TubeGeometry(curve, bt === 'angled' ? 24 : 16, r3 * w, 8, false);
        const m = M(geo, mat('felt', pal.brow));
        const g = G(m);
        g.position.copy(hit.p).addScaledVector(hit.n, furLen * 0.7 + r3 * 0.05);
        g.userData.base = g.position.y;
        this.rig.add(g);
        this.brows.push({ g, side: uni ? 0 : side });
        this.part(g, true);
      }
    }

    // boca
    this.buildMouth(s, probe, X(L.cx), Y(L.mouthY), L.mw * U, bm);
    this.part(this.mouthRig.g, true);

    // mejillas (en el shader: también tiñen el pelo); bigotes de gato en 3D
    const ct = s.cheeks.type;
    if (ct === 'whiskers') {
      const wm = mat('matte', '#1f2937');
      for (const sd of [-1, 1]) {
        for (const k of [-0.25, 0, 0.25]) {
          const x0 = sd * L.sp * U * 0.7;
          const y0 = eyeY - r3 * (2.4 + k * 2);
          const h0 = probe.front(x0, y0);
          if (!h0) continue;
          const a = h0.p.clone().addScaledVector(h0.n, furLen * 0.8 + 0.004);
          const b = new THREE.Vector3(sd * (L.sp * U + r3 * 2.6), eyeY - r3 * (2.2 + k * 3.2), a.z * 0.75 + furLen);
          const mid = a.clone().lerp(b, 0.5);
          mid.z += 0.02 * kk;
          const wg = G(M(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 8, Math.max(0.002, r3 * 0.05), 5), wm));
          this.rig.add(wg);
          this.part(wg, true);
        }
      }
    } else if (ct !== 'none') {
      const cx = L.sp * U + r3 * 0.45;
      const cy = eyeY - r3 * 1.8;
      const hit = probe.front(cx, cy);
      bm.uniforms.uCheek.value.set(cx, cy, hit ? hit.p.z : 0, r3 * (ct === 'blush' ? 1.0 : 0.7));
      bm.uniforms.uCheekOn.value = 1;
      bm.uniforms.uCheekType.value = CHEEK_IDS[ct] || 1;
      const cc = s.cheeks.color || '#ff6b8a';
      if (ct === 'stars') bm.uniforms.uCheekColor.value.set('#facc15');
      else if (ct === 'freckles') bm.uniforms.uCheekColor.value.set(shade(s.cheeks.color || shade(body, -0.25), -0.35));
      else if (ct === 'hearts') bm.uniforms.uCheekColor.value.set(s.cheeks.color || '#ff4d7a');
      else bm.uniforms.uCheekColor.value.set(cc);
    }

    // accesorios
    for (const a of s.accessories) {
      const o = this.buildAccessory(a, { L, X, Y, W, H, kk, probe, eyeY, r3, bm });
      if (!o) continue;
      // pivote en el centro del accesorio: escala/giro de la spec alrededor de sí mismo
      o.updateMatrixWorld(true);
      const c = o.userData.surface ? new THREE.Vector3() : o.userData.pivot ? o.userData.pivot.clone() : new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const piv = G(o);
      o.position.sub(c);
      piv.position.copy(c);
      if (!o.userData.surface) {
        piv.position.x += a.x * U;
        piv.position.y -= a.y * U;
        piv.rotation.z -= a.rot * DEG;
        piv.scale.multiplyScalar(a.scale);
        if (a.flip) piv.scale.x *= -1;
      }
      this.rig.add(piv);
      if (!o.userData.surface) this.part(piv, false);
    }
    if (this.hideMouth) this.mouthRig.g.visible = false;

    // manos (posturas de motion.js HAND_POSES; visibles con la metamorfosis «hands»)
    const hg = this.sph(0.1 * kk, 24, 16).scale(1, 1.1, 0.85);
    const fg = new THREE.CapsuleGeometry(0.032 * kk, 0.07 * kk, 4, 8).translate(0, 0.1 * kk, 0.02 * kk);
    this.hands = [-1, 1].map((side) => {
      const g = G();
      if (plush) this.addFur(hg, body, g, 0.7);
      else g.add(M(hg, bm.base));
      const finger = plush ? this.addFur(fg, body, G(), 0.5) : M(fg, bm.base);
      finger.visible = false;
      g.add(finger);
      g.userData.finger = finger;
      g.visible = false;
      this.rig.add(g);
      return g;
    });
    // contexto de los efectos; las lágrimas bajan por la mejilla pegadas a la superficie
    const tears = this.eyes.map((e) => {
      const x0 = e.root.position.x;
      const out = [];
      for (let i = 0; i <= 6; i++) {
        const h = probe.front(x0 + Math.sign(x0 || 1) * r3 * 0.05 * i, eyeY - r3 * (0.9 + i * 0.5));
        const p = h.p.clone().addScaledVector(h.n, furLen + 0.006 * kk);
        out.push([p.x, p.y, p.z]);
      }
      return out;
    });
    this.fxc = { W, H, D: B.depth, eyeY, r: r3, sp: L.sp * U, mouth: this.mouthRig.g.position, low: this.quality === 'low', tears };

    // sombra de contacto
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.002;
    sh.scale.set(W * 1.55, B.depth * 2.6, 1);
    sh.renderOrder = -1;
    this.shadow = sh;
    this.root.add(sh);

    // encuadre en reposo
    this.rig.updateMatrixWorld(true);
    // solo lo visible (la cavidad de la boca y las manos ocultas no cuentan)
    const bounds = (this.bounds = new THREE.Box3());
    const tmp = new THREE.Box3();
    this.rig.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.noBounds) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      bounds.union(tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
    bounds.expandByScalar(this.furLen);
    this.shells = -1;
    this.setShells(this.maxShells);
  }

  /** Registra una pieza que sigue a la silueta en shape:<id> (face: pegada a la superficie). */
  part(o, face) {
    this.parts.push({ o, p0: o.position.clone(), face, d: new THREE.Vector3() });
  }

  /** z de la cara frontal en (x, y) desde una rejilla perezosa (null fuera de la silueta). */
  frontZ(x, y) {
    const n = 12;
    const W = this.W;
    const H = this.H;
    if (!this.zGrid) {
      const gz = (this.zGrid = new Float32Array(n * n));
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) gz[j * n + i] = this.probe.front((i / (n - 1) - 0.5) * W, (j / (n - 1)) * H)?.p.z ?? NaN;
    }
    const fi = clamp((x / W + 0.5) * (n - 1), 0, n - 1);
    const fj = clamp((y / H) * (n - 1), 0, n - 1);
    const i = Math.min(n - 2, Math.floor(fi));
    const j = Math.min(n - 2, Math.floor(fj));
    const u = fi - i;
    const v = fj - j;
    const g = this.zGrid;
    const a = g[j * n + i], b = g[j * n + i + 1], c = g[(j + 1) * n + i], d = g[(j + 1) * n + i + 1];
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) {
      const near = g[Math.round(fj) * n + Math.round(fi)];
      return Number.isNaN(near) ? null : near;
    }
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  /** Geometrías con resolución según la calidad (la multitud usa menos segmentos). */
  sph(r, w = 32, h = 16, ...rest) {
    const q = this.q;
    return new THREE.SphereGeometry(r, Math.max(8, Math.round(w * q)), Math.max(6, Math.round(h * q)), ...rest);
  }

  tor(r, t, rs = 12, ts = 48, arc = TAU) {
    const q = this.q;
    return new THREE.TorusGeometry(r, t, Math.max(4, Math.round(rs * q)), Math.max(8, Math.round(ts * q)), arc);
  }

  /** Capas de pelo (InstancedMesh) para una geometría con materiales de bodyMaterials. */
  addShells(geo, bm, parent) {
    const inst = new THREE.InstancedMesh(geo, bm.shell, this.maxShells);
    inst.frustumCulled = false;
    inst.userData.ownMaterial = true;
    parent.add(inst);
    this.furs.push({ inst, u: bm.uniforms });
    return inst;
  }

  /** Pieza peluda (accesorio, mano, pompón): sólido + capas. */
  addFur(geo, color, parent, lenK = 0.8) {
    const bm = bodyMaterials({ color, patternColor: color, pattern: 'none', finish: 'clay', plush: true, furLen: this.furLen * lenK || 0.04, density: this.density || 60 });
    bm.uniforms.uDims.value.set(1, 1e-3, -9, 0.01);
    const base = new THREE.Mesh(geo, bm.base);
    base.userData.ownMaterial = true;
    parent.add(base);
    this.addShells(geo, bm, parent);
    return parent;
  }

  setShells(n) {
    n = Math.max(0, Math.min(this.maxShells, Math.round(n)));
    if (n === this.shells) return;
    this.shells = n;
    for (const f of this.furs) {
      f.inst.count = n;
      f.u.uShells.value = Math.max(1, n);
    }
  }

  buildEye(type, r, side) {
    const e = this.spec.eyes;
    const root = G();
    const main = G();
    const gaze = G();
    root.add(main);
    main.add(gaze);
    const ink = mat('gloss', e.ink);
    let t = type;
    if (t === 'wink') t = side > 0 ? 'happy' : 'round';
    let noBlink = false;
    if (BEAD.has(t)) {
      const k = t === 'kawaii' ? 1.15 : t === 'dot' ? 0.75 : t === 'button' ? 1 : 0.9;
      const sc = t === 'bean' ? [0.55, 1.2, 0.5] : t === 'dot' ? [0.8, 1.05, 0.6] : [0.92, 1, 0.6];
      gaze.add(M(this.sph(r * k, 32, 24), ink, [0, 0, -r * 0.18], null, sc));
      if (t === 'button') gaze.add(M(this.tor(r * 0.72, r * 0.07, 8, 32), mat('gloss', shade(e.ink, 0.25)), [0, 0, r * 0.45]));
      if (SHINY.has(t)) {
        gaze.add(M(this.sph(r * 0.2, 12, 8), mat('emissive', '#ffffff'), [-r * 0.32, r * 0.36, r * 0.38]));
        gaze.add(M(this.sph(r * 0.09, 10, 6), mat('emissive', '#ffffff'), [r * 0.34, -r * 0.34, r * 0.38]));
      }
    } else if (t === 'happy' || t === 'closed' || t === 'cross') {
      noBlink = true;
      if (t === 'cross') {
        for (const a of [45, -45]) main.add(M(new THREE.CapsuleGeometry(r * 0.13, r * 1.3, 4, 8), mat('felt', e.ink), [0, 0, r * 0.1], [0, 0, a * DEG]));
      } else {
        main.add(M(this.tor(r * 0.72, r * 0.14, 10, 24, Math.PI), mat('felt', e.ink), [0, t === 'happy' ? -r * 0.25 : r * 0.25, r * 0.08], [0, 0, t === 'happy' ? 0 : Math.PI]));
      }
    } else if (t === 'star' || t === 'heart') {
      const shp = new THREE.Shape();
      if (t === 'star') {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 ? r * 0.5 : r * 1.1;
          i ? shp.lineTo(Math.cos(a) * rr, -Math.sin(a) * rr) : shp.moveTo(Math.cos(a) * rr, -Math.sin(a) * rr);
        }
      } else {
        const q = r * 1.05;
        shp.moveTo(0, -q * 0.9);
        shp.bezierCurveTo(-q * 1.4, q * 0.1, -q * 0.7, q * 1.05, 0, q * 0.35);
        shp.bezierCurveTo(q * 0.7, q * 1.05, q * 1.4, q * 0.1, 0, -q * 0.9);
      }
      const geo = new THREE.ExtrudeGeometry(shp, { depth: r * 0.2, bevelEnabled: true, bevelThickness: r * 0.12, bevelSize: r * 0.1, bevelSegments: 3, curveSegments: 10 });
      gaze.add(M(geo, mat('gloss', t === 'heart' ? '#ef3b5d' : e.iris), [0, 0, -r * 0.05]));
    } else if (t === 'robot' || t === 'led' || t === 'glow' || t === 'pixel') {
      if (t === 'robot') {
        main.add(M(new THREE.BoxGeometry(r * 2, r * 1.6, r * 0.3), mat('plastic', '#0b1220'), [0, 0, 0]));
        gaze.add(M(new THREE.BoxGeometry(r * 1.3, r * 0.9, r * 0.1), mat('emissive', e.iris), [0, 0, r * 0.16]));
      } else if (t === 'led') gaze.add(M(new THREE.CapsuleGeometry(r * 0.3, r * 1.6, 4, 12), mat('emissive', e.iris), [0, 0, r * 0.05], [0, 0, Math.PI / 2]));
      else gaze.add(M(this.sph(r * 0.95, 24, 16), mat('emissive', e.iris), [0, 0, -r * 0.3], null, [1, 1, 0.6]));
    } else if (t === 'spiral' || t === 'dollar') {
      // globo blanco + espiral que gira / «$» verde
      main.add(M(this.sph(r, 32, 24), mat('gloss', '#ffffff'), [0, 0, -r * 0.2], null, [1, 1, 0.75]));
      const zf = r * 0.56;
      let geo;
      if (t === 'spiral') {
        const p = [];
        for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 5; const rr = r * (0.06 + 0.78 * (i / 48)); p.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, zf - (i / 48) * r * 0.12)); }
        geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 96, r * 0.07, 6, false);
      } else {
        const p = [[0.45, 0.5], [0, 0.66], [-0.45, 0.42], [-0.28, 0.1], [0.28, -0.1], [0.45, -0.42], [0, -0.66], [-0.45, -0.5]].map(([x, y]) => new THREE.Vector3(x * r * 0.6, y * r * 0.6, zf));
        geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 40, r * 0.09, 6, false);
      }
      const sp = M(geo, mat('gloss', t === 'spiral' ? e.ink : '#16a34a'));
      gaze.add(sp);
      if (t === 'dollar') gaze.add(M(new THREE.CapsuleGeometry(r * 0.07, r * 0.95, 3, 6), mat('gloss', '#16a34a'), [0, 0, zf]));
      else this.anims.push((sec) => { sp.rotation.z = -sec * 4 * side; });
    } else {
      // globo ocular: esclerótica + iris + pupila (+ párpado)
      const big = t === 'googly' ? 1.15 : t === 'wide' ? 1.12 : t === 'anime' ? 1.05 : 1;
      const R = r * big;
      const scl = M(this.sph(R, 32, 24), mat('gloss', t === 'googly' || t === 'hypno' ? '#ffffff' : e.white), [0, 0, -R * 0.2], null, t === 'anime' ? [0.9, 1.2, 0.75] : t === 'focused' ? [1, 0.75, 0.75] : t === 'almond' ? [1.15, 0.72, 0.75] : [1, 1, 0.75]);
      main.add(scl);
      gaze.position.z = -R * 0.2;
      if (t === 'almond') gaze.scale.set(1, 0.85, 1);
      if (t === 'lashes') {
        // tres pestañas arriba, hacia fuera
        for (let i = 0; i < 3; i++) {
          const ca = Math.cos(side > 0 ? (30 + i * 30) * DEG : (150 - i * 30) * DEG);
          const sa = Math.sin((30 + i * 30) * DEG);
          main.add(M(new THREE.CapsuleGeometry(R * 0.07, R * 0.32, 3, 6), mat('felt', e.ink), [ca * R * 1.05, sa * R * 1.05, R * 0.2], [0, 0, Math.atan2(sa, ca) - Math.PI / 2]));
        }
      }
      const irisR = t === 'cat' ? 0.92 : t === 'anime' ? 0.7 : t === 'almond' ? 0.72 : t === 'wide' || t === 'googly' ? 0 : 0.58;
      if (irisR) gaze.add(M(this.sph(R * irisR, 24, 16), mat('gloss', e.iris), [0, 0, R * 0.62], null, t === 'anime' ? [1, 1.3, 0.3] : [1, 1, 0.3]));
      const pr = t === 'wide' ? 0.3 : t === 'googly' ? 0.55 : t === 'cat' ? 0.5 : 0.32;
      gaze.add(M(this.sph(R * pr, 20, 12), ink, [0, 0, R * 0.68], null, t === 'cat' ? [0.3, 1.5, 0.3] : [1, 1, 0.32]));
      gaze.add(M(this.sph(R * 0.11, 10, 6), mat('emissive', '#ffffff'), [-R * 0.22, R * 0.26, R * 0.78]));
      const lid = LIDS[t];
      if (lid) {
        const lg = this.sph(R * 1.07, 32, 12, 0, TAU, 0, Math.PI * lid[0]);
        const lm = M(lg, mat('felt', shade(this.spec.body.color, -0.06)), [0, 0, -R * 0.2], [0, 0, lid[1] * side * 0.45], [1, 1, 0.8]);
        main.add(lm);
      }
    }
    // ojos cerrados (dormir): arco ∪
    const closed = M(this.tor(r * 0.72, r * 0.13, 10, 24, Math.PI), mat('felt', e.ink), [0, r * 0.25, r * 0.08], [0, 0, Math.PI]);
    closed.visible = false;
    root.add(closed);
    return { root, main, gaze, closed, noBlink };
  }

  buildMouth(s, probe, mx, my, mw, bm) {
    const type = s.mouth.type;
    const g = G();
    const hit = probe.front(mx, my);
    const lift = this.plush ? this.furLen * 0.55 : 0.006;
    g.position.copy(hit.p).addScaledVector(hit.n, lift);
    this.rig.add(g);
    if (bm.uniforms.uBald.value[2]) bm.uniforms.uBald.value[2].set(hit.p.x, hit.p.y, hit.p.z, mw * 1.1);
    const mouth = (this.mouthRig = { g, type, line: null, cav: null, min: OPEN_MIN[type] || 0, bias: CURVE_BIAS[type] || 0, mw, round: null });
    const lipM = mat('felt', this.pal.lip);

    // línea (sonrisa/ceño) con morph targets: base recta, +1 sonrisa, -1 ceño, ajustada a la superficie
    const custom = type === 'grit' || type === 'lips';
    if (!OPEN_MIN[type] && !ROUND.has(type) && type !== 'beak' && !custom) {
      const line = (curve) => {
        const p = [];
        for (let i = 0; i <= 8; i++) {
          const u = i / 4 - 1;
          const x = u * mw * (type === 'tiny' ? 0.5 : type === 'pout' ? 0.5 : 1);
          const y = curve * mw * 0.5 * (u * u - 0.45) + (type === 'smirk' ? u * mw * 0.12 : 0) + (type === 'wavy' ? Math.sin(u * Math.PI * 2) * mw * 0.12 : 0);
          const z = probe.front(mx + x, my + y).p.z - hit.p.z;
          p.push(new THREE.Vector3(x, y, z));
        }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 32, Math.max(0.006, mw * 0.085), 8, false);
      };
      const geo = line(0);
      const up = line(1);
      const dn = line(-1);
      geo.morphAttributes.position = [up.attributes.position, dn.attributes.position];
      geo.morphAttributes.normal = [up.attributes.normal, dn.attributes.normal];
      up.dispose();
      dn.dispose();
      mouth.line = M(geo, lipM);
      mouth.line.morphTargetInfluences = [0, 0];
      g.add(mouth.line);
      if (type === 'tongue') g.add(M(new THREE.CapsuleGeometry(mw * 0.32, mw * 0.3, 4, 12), mat('gloss', '#ff7a8a'), [mw * 0.1, -mw * 0.38, mw * 0.05], null, [1, 1, 0.45]));
    }
    if (ROUND.has(type)) {
      mouth.round = G(
        M(this.tor(mw * 0.32, mw * 0.1, 10, 24), type === 'kiss' ? mat('gloss', '#e11d48') : lipM),
        M(new THREE.CircleGeometry(mw * 0.3, 20), mat('matte', '#3a0d14'), [0, 0, -0.002]),
      );
      if (type === 'whistle') mouth.round.position.x = mw * 0.35;
      g.add(mouth.round);
    }
    if (type === 'beak') {
      g.add(M(new THREE.ConeGeometry(mw * 0.6, mw * 1.1, 24), mat('plastic', '#f59e0b'), [0, 0, mw * 0.4], [Math.PI / 2, 0, 0], [1, 1, 0.55]));
    }
    // cavidad (abierta) tipo aplique de fieltro: oscuro + lengua + dientes
    if (type === 'grit') {
      // dientes apretados: placa blanca con rayas oscuras (se abre en vertical al hablar)
      const gr = G(M(new THREE.BoxGeometry(mw * 2, mw * 0.5, mw * 0.12), mat('plastic', '#ffffff')));
      const lm = mat('matte', '#1f2937');
      gr.add(M(new THREE.BoxGeometry(mw * 2, mw * 0.05, mw * 0.02), lm, [0, 0, mw * 0.065]));
      for (let i = 1; i < 5; i++) gr.add(M(new THREE.BoxGeometry(mw * 0.05, mw * 0.5, mw * 0.02), lm, [(i / 5 - 0.5) * mw * 2, 0, mw * 0.065]));
      gr.add(M(this.tor(1, 0.06, 6, 4).rotateZ(Math.PI / 4).scale(mw * 1.45, mw * 0.36, mw * 0.2), lipM));
      mouth.grit = gr;
      g.add(gr);
    }
    if (type === 'lips') {
      // labios: arriba dos lóbulos (arco de cupido), abajo uno; se separan al abrir
      const lc = mat('gloss', s.mouth.color || '#e11d48');
      const up = G();
      for (const sx of [-1, 1]) up.add(M(this.sph(1, 20, 12), lc, [sx * mw * 0.42, 0, 0], [0, 0, sx * 0.25], [mw * 0.55, mw * 0.22, mw * 0.2]));
      const lo = M(this.sph(1, 24, 12), lc, [0, 0, 0], null, [mw * 0.85, mw * 0.28, mw * 0.22]);
      const hole = M(this.sph(1, 20, 10), mat('gloss', '#3a0d14'), [0, 0, -mw * 0.05], null, [mw * 0.7, 0.001, mw * 0.1]);
      mouth.lips = { up, lo, hole };
      g.add(up, lo, hole);
    }
    if (type !== 'beak' && !ROUND.has(type) && !custom) {
      const cav = G();
      const sq = type === 'robot' || type === 'square';
      cav.add(M(sq ? new THREE.BoxGeometry(2, 2, 1) : this.sph(1, 28, 16), mat('gloss', '#3a0d14'), [0, 0, 0], null, sq ? [1, 0.5, 0.5] : [1, 1, 1]));
      const tongue = M(this.sph(0.6, 20, 12), mat('felt', '#ff7a8a'), [0, -0.45, 0.35], null, [1, 0.55, 0.5]);
      cav.add(tongue);
      if (TEETH.has(type)) cav.add(M(new THREE.BoxGeometry(type === 'buck' ? 0.6 : 1.4, 0.3, 0.3), mat('plastic', '#ffffff'), [0, 0.68, 0.55]));
      if (type === 'vampire' || type === 'monster') for (const sx of [-0.5, 0.5]) cav.add(M(new THREE.ConeGeometry(0.14, 0.4, 8), mat('plastic', '#ffffff'), [sx, 0.62, 0.62], [Math.PI, 0, 0]));
      cav.add(M(this.tor(1, 0.09, 8, 32), lipM, [0, 0, 0.1], null, [1, 1, 1]));
      cav.visible = false;
      mouth.cav = cav;
      g.add(cav);
    }
  }

  /** Accesorios 3D (subconjunto del catálogo 2D); devuelve un Object3D ya en su ancla o null. */
  buildAccessory(a, c) {
    const { kk, probe, H, W, eyeY, r3, Y, X, L, bm } = c;
    const u2 = 0.01 * kk; // 1 px del dibujo 2D
    const col = a.color;
    const col2 = a.color2;
    const id = a.id;
    const top = probe.top(0, 0).p;
    const headAt = (dy) => { const s = probe.section(top.y - dy * kk); return s; };
    const fur = (geo, color, k = 0.8) => this.addFur(geo, color, G(), k);
    const g = G();
    const onTop = (o, sink = 0.05) => { g.position.set(top.x, top.y - sink * kk, 0); g.add(o); return g; };
    const capFor = (dy) => {
      const s = headAt(dy);
      return { w: s.w, d: s.d, y: top.y - dy * kk };
    };
    switch (id) {
      case 'crown': case 'tiara': {
        const m = mat('metal', col);
        const n = id === 'crown' ? 6 : 3;
        const R = 0.24 * kk;
        if (id === 'crown') g.add(M(new THREE.CylinderGeometry(R, R * 1.05, 0.12 * kk, 32, 1, true), m));
        else g.add(M(this.tor(R, 0.02 * kk, 8, 32, Math.PI), m, [0, 0, 0], [-Math.PI / 2 + 0.3, 0, 0]));
        for (let i = 0; i < n; i++) {
          const ang = id === 'crown' ? (i / n) * TAU : (i / (n - 1)) * Math.PI;
          const p = [Math.cos(ang) * R, 0.1 * kk, id === 'crown' ? Math.sin(ang) * R : Math.sin(ang) * R * 0.3 + 0.05 * kk];
          g.add(M(new THREE.ConeGeometry(0.05 * kk, 0.12 * kk, 12), m, p));
          g.add(M(this.sph(0.025 * kk, 12, 8), mat('gloss', id === 'crown' ? '#dc2626' : '#60a5fa'), [p[0], p[1] + 0.07 * kk, p[2]]));
        }
        return onTop(G(...g.children.splice(0)), 0.02);
      }
      case 'tophat': {
        const h = G(
          M(new THREE.CylinderGeometry(0.36 * kk, 0.36 * kk, 0.025 * kk, 40), mat('felt', col)),
          M(new THREE.CylinderGeometry(0.22 * kk, 0.24 * kk, 0.4 * kk, 40), mat('felt', col), [0, 0.2 * kk, 0]),
          M(new THREE.CylinderGeometry(0.245 * kk, 0.245 * kk, 0.07 * kk, 40), mat('felt', col2 === '#ffffff' ? '#dc2626' : col2), [0, 0.05 * kk, 0]),
        );
        h.rotation.z = -0.12;
        return onTop(h, 0.06);
      }
      case 'fedora': case 'bowler': {
        const fm = mat('felt', col);
        const fed = id === 'fedora';
        const h = G(
          // ala (fedora: algo más ancha y levantada atrás)
          M(new THREE.CylinderGeometry((fed ? 0.4 : 0.32) * kk, (fed ? 0.4 : 0.32) * kk, 0.022 * kk, 48), fm, null, fed ? [-0.08, 0, 0] : null),
          fed
            ? M(new THREE.CylinderGeometry(0.19 * kk, 0.23 * kk, 0.24 * kk, 40), fm, [0, 0.12 * kk, 0], null, [1, 1, 0.85])
            : M(this.sph(0.23 * kk, 40, 20, 0, TAU, 0, Math.PI / 2), fm, [0, 0.06 * kk, 0], null, [1, 1.05, 0.92]),
          M(new THREE.CylinderGeometry(0.235 * kk, 0.235 * kk, 0.05 * kk, 40), mat('felt', col2), [0, 0.045 * kk, 0], null, [1, 1, fed ? 0.88 : 0.93]),
        );
        if (!fed) h.add(M(new THREE.CylinderGeometry(0.23 * kk, 0.23 * kk, 0.06 * kk, 40), fm, [0, 0.03 * kk, 0], null, [1, 1, 0.92]));
        if (fed) h.add(M(this.sph(0.12 * kk, 24, 10), mat('felt', shade(col, -0.25)), [0, 0.24 * kk, 0], null, [1, 0.25, 0.6])); // pellizco de la copa
        h.rotation.z = fed ? -0.14 : -0.06;
        return onTop(h, 0.06);
      }
      case 'witch': {
        const fm = mat('felt', col);
        const o = G(M(new THREE.CylinderGeometry(0.46 * kk, 0.46 * kk, 0.02 * kk, 48), fm));
        // cono doblado: tres tramos cada vez más finos e inclinados
        let y = 0;
        let x = 0;
        const segs = [[0.25, 0.17, 0.3, 0], [0.17, 0.09, 0.22, -0.35], [0.09, 0.01, 0.2, -0.9]];
        for (const [r0, r1, h, rz] of segs) {
          const m = M(new THREE.CylinderGeometry(r1 * kk, r0 * kk, h * kk, 32), fm);
          m.geometry.translate(0, (h / 2) * kk, 0);
          m.position.set(x, y, 0);
          m.rotation.z = rz;
          o.add(m);
          x += -Math.sin(rz) * h * kk;
          y += Math.cos(rz) * h * kk;
        }
        o.add(M(new THREE.CylinderGeometry(0.245 * kk, 0.25 * kk, 0.06 * kk, 40), mat('felt', col2), [0, 0.04 * kk, 0]));
        o.add(M(new THREE.BoxGeometry(0.08 * kk, 0.06 * kk, 0.02 * kk), mat('metal', '#facc15'), [0, 0.04 * kk, 0.25 * kk]));
        o.rotation.z = 0.1;
        return onTop(o, 0.05);
      }
      case 'fez': {
        const o = G(
          M(new THREE.CylinderGeometry(0.16 * kk, 0.2 * kk, 0.3 * kk, 36), mat('felt', col), [0, 0.15 * kk, 0]),
          M(new THREE.CylinderGeometry(0.006 * kk, 0.006 * kk, 0.14 * kk, 6), mat('felt', col2), [0.07 * kk, 0.305 * kk, 0.02 * kk], [0, 0, Math.PI / 2]),
        );
        const tas = G(
          M(new THREE.CylinderGeometry(0.006 * kk, 0.006 * kk, 0.2 * kk, 6), mat('felt', col2), [0, -0.1 * kk, 0]),
          M(new THREE.ConeGeometry(0.035 * kk, 0.09 * kk, 12), mat('felt', col2), [0, -0.2 * kk, 0]),
        );
        tas.position.set(0.14 * kk, 0.3 * kk, 0.02 * kk);
        tas.rotation.z = 0.2;
        o.add(tas);
        this.anims.push((sec) => { tas.rotation.z = 0.2 + Math.sin(sec * 2.4) * 0.12; });
        o.rotation.z = -0.1;
        return onTop(o, 0.06);
      }
      case 'sombrero': {
        const fm = mat('felt', col);
        const o = G(
          M(this.tor(0.5 * kk, 0.035 * kk, 10, 56), fm, [0, 0.03 * kk, 0], [Math.PI / 2, 0, 0]),
          M(new THREE.CylinderGeometry(0.52 * kk, 0.52 * kk, 0.02 * kk, 56), fm),
          M(new THREE.CylinderGeometry(0.13 * kk, 0.21 * kk, 0.26 * kk, 36), fm, [0, 0.13 * kk, 0]),
          M(this.sph(0.13 * kk, 32, 12, 0, TAU, 0, Math.PI / 2), fm, [0, 0.26 * kk, 0], null, [1, 0.7, 1]),
          M(new THREE.CylinderGeometry(0.205 * kk, 0.215 * kk, 0.05 * kk, 36), mat('felt', col2), [0, 0.04 * kk, 0]),
        );
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          o.add(M(this.sph(0.025 * kk, 10, 8), mat('felt', col2), [Math.cos(a) * 0.53 * kk, 0.0, Math.sin(a) * 0.53 * kk]));
        }
        return onTop(o, 0.05);
      }
      case 'bucket': {
        const fm = mat('felt', col);
        const o = G(
          M(new THREE.CylinderGeometry(0.21 * kk, 0.26 * kk, 0.2 * kk, 40), fm, [0, 0.1 * kk, 0]),
          M(this.sph(0.21 * kk, 40, 10, 0, TAU, 0, Math.PI / 2), fm, [0, 0.2 * kk, 0], null, [1, 0.25, 1]),
          M(new THREE.CylinderGeometry(0.27 * kk, 0.37 * kk, 0.06 * kk, 48), mat('felt', shade(col, -0.08)), [0, -0.01 * kk, 0]),
        );
        return onTop(o, 0.08);
      }
      case 'jester': {
        const o = G(fur(new THREE.TorusGeometry(0.24 * kk, 0.04 * kk, 12, 40).rotateX(Math.PI / 2), shade(col, -0.2), 0.6));
        const cols = [col, col2, col];
        [-1, 0, 1].forEach((s, i) => {
          const len = s ? 0.42 : 0.5;
          const horn = G(M(new THREE.ConeGeometry(0.12 * kk, len * kk, 24), mat('felt', cols[i]), [0, (len / 2) * kk, 0]));
          horn.add(M(this.sph(0.04 * kk, 14, 10), mat('metal', '#facc15'), [0, len * kk, 0]));
          horn.position.set(s * 0.12 * kk, 0.02 * kk, 0);
          horn.rotation.z = -s * 0.95;
          o.add(horn);
          const ph = i * 1.7;
          this.anims.push((sec) => { horn.rotation.z = -s * 0.95 + Math.sin(sec * 1.8 + ph) * 0.06; });
        });
        return onTop(o, 0.05);
      }
      case 'beanie': case 'santa': case 'cap': case 'hardhat': case 'viking': case 'beret': case 'propeller': {
        const cp = capFor(id === 'beret' ? 0.14 : 0.24);
        const dome = this.sph(1, 40, 20, 0, TAU, 0, Math.PI / 2).scale(cp.w * 1.08, top.y - cp.y + 0.05 * kk, cp.d * 1.1);
        const o = G();
        if (id === 'beanie' || id === 'santa') {
          o.add(fur(dome, col, 0.7));
          o.add(fur(this.sph(0.09 * kk, 20, 14), id === 'santa' ? '#fafafa' : col2, 1));
          o.children[1].position.y = top.y - cp.y + 0.08 * kk;
          if (id === 'santa') o.add(fur(this.tor(1, 0.12, 12, 40).rotateX(Math.PI / 2).scale(cp.w * 1.08, kk * 0.5, cp.d * 1.1), '#fafafa', 0.9));
        } else if (id === 'beret') {
          o.add(M(dome, mat('felt', col), null, [0, 0, -0.25], [1.25, 0.45, 1.2]));
        } else {
          const m = id === 'viking' ? mat('metal', '#a3a3a3') : id === 'cap' || id === 'propeller' ? mat('felt', col) : mat('plastic', col);
          o.add(M(dome, m));
          if (id === 'propeller') {
            // gorra de hélice: gajo de color, varilla y hélice que gira despacio
            const hh = top.y - cp.y + 0.05 * kk;
            o.add(M(this.sph(1, 24, 12, Math.PI / 2 - 0.35, 0.7, 0, Math.PI / 2).scale(cp.w * 1.085, hh * 1.005, cp.d * 1.105), mat('felt', col2)));
            o.add(M(new THREE.CylinderGeometry(0.008 * kk, 0.008 * kk, 0.09 * kk, 8), mat('metal', '#9ca3af'), [0, hh + 0.04 * kk, 0]));
            const prop = G(M(this.sph(0.02 * kk, 12, 8), mat('plastic', col2)));
            for (const [sx, c2] of [[-1, '#ef4444'], [1, '#22c55e']]) prop.add(M(this.sph(1, 16, 8), mat('plastic', c2), [sx * 0.085 * kk, 0, 0], [sx * 0.3, 0, 0], [0.085 * kk, 0.008 * kk, 0.028 * kk]));
            prop.position.y = hh + 0.085 * kk;
            o.add(prop);
            this.anims.push((sec) => { prop.rotation.y = sec * 5; });
          }
          if (id === 'cap') o.add(M(new THREE.CylinderGeometry(cp.w * 0.75, cp.w * 0.75, 0.02 * kk, 32, 1, false, -Math.PI / 2, Math.PI), mat('felt', col2 === '#ffffff' ? shade(col, -0.2) : col2), [0, 0.01, cp.d * 0.9], null, [1, 1, 0.9]));
          if (id === 'hardhat') o.add(M(new THREE.CylinderGeometry(cp.w * 1.25, cp.w * 1.25, 0.02 * kk, 40), mat('plastic', col), [0, 0, 0.02]));
          if (id === 'viking') for (const sx of [-1, 1]) o.add(M(new THREE.ConeGeometry(0.06 * kk, 0.3 * kk, 16), mat('plastic', '#fef3c7'), [sx * cp.w * 1.05, (top.y - cp.y) * 0.5, 0], [0, 0, -sx * 1.0]));
        }
        o.position.y = cp.y;
        return o;
      }
      case 'hair': {
        const hg = this.sph(1, 36, 20).scale(0.3 * kk, 0.17 * kk, 0.26 * kk);
        const o = fur(hg, col, 1.3);
        o.position.set(0, top.y + 0.02 * kk, 0.04 * kk);
        o.rotation.x = 0.15;
        return o;
      }
      case 'party': case 'wizard': {
        const h = id === 'party' ? 0.42 : 0.62;
        const o = G(M(new THREE.ConeGeometry((id === 'party' ? 0.16 : 0.27) * kk, h * kk, 32), mat(id === 'party' ? 'plastic' : 'felt', col), [0, (h / 2) * kk, 0]));
        if (id === 'party') o.add(fur(this.sph(0.06 * kk, 16, 10), col2, 1));
        if (id === 'party') o.children[1].position.y = h * kk;
        if (id === 'wizard') o.add(M(new THREE.CylinderGeometry(0.42 * kk, 0.42 * kk, 0.02 * kk, 40), mat('felt', col)));
        o.rotation.z = -0.15;
        return onTop(o, 0.04);
      }
      case 'cowboy': {
        const o = G(
          M(this.sph(1, 40, 10, 0, TAU, Math.PI * 0.35, Math.PI * 0.3), mat('felt', col), [0, 0.05 * kk, 0], null, [0.55 * kk, 0.12 * kk, 0.45 * kk]),
          M(new THREE.CapsuleGeometry(0.2 * kk, 0.1 * kk, 6, 24), mat('felt', col), [0, 0.15 * kk, 0], null, [1, 1, 0.8]),
          M(new THREE.CylinderGeometry(0.205 * kk, 0.205 * kk, 0.04 * kk, 32), mat('felt', shade(col, -0.35)), [0, 0.1 * kk, 0]),
        );
        return onTop(o, 0.05);
      }
      case 'chef': {
        const o = G(M(new THREE.CylinderGeometry(0.2 * kk, 0.2 * kk, 0.14 * kk, 32), mat('felt', '#fafafa')));
        for (const [x, y, z, r] of [[0, 0.2, 0, 0.17], [-0.13, 0.15, 0, 0.12], [0.13, 0.15, 0, 0.12], [0, 0.15, 0.1, 0.12]]) o.add(M(this.sph(r * kk, 20, 14), mat('felt', '#fafafa'), [x * kk, y * kk, z * kk]));
        return onTop(o, 0.04);
      }
      case 'grad': {
        const o = G(
          M(new THREE.CylinderGeometry(0.17 * kk, 0.19 * kk, 0.1 * kk, 32), mat('felt', col)),
          M(new THREE.BoxGeometry(0.46 * kk, 0.025 * kk, 0.46 * kk), mat('felt', col), [0, 0.06 * kk, 0], [0, Math.PI / 4, 0]),
          M(new THREE.CylinderGeometry(0.008 * kk, 0.008 * kk, 0.16 * kk, 6), mat('felt', col2 === '#ffffff' ? '#facc15' : col2), [0.2 * kk, -0.01 * kk, 0]),
        );
        return onTop(o, 0.03);
      }
      case 'bow': case 'flower': {
        const o = G();
        if (id === 'bow') {
          for (const sx of [-1, 1]) o.add(M(new THREE.ConeGeometry(0.08 * kk, 0.15 * kk, 20), mat('plastic', col), [sx * 0.08 * kk, 0, 0], [0, 0, sx * Math.PI / 2], [1, 1, 0.5]));
          o.add(M(this.sph(0.04 * kk, 16, 10), mat('plastic', col)));
        } else {
          for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU; o.add(M(this.sph(0.055 * kk, 16, 10), mat('felt', col), [Math.cos(an) * 0.06 * kk, Math.sin(an) * 0.06 * kk, 0], null, [1, 1, 0.4])); }
          o.add(M(this.sph(0.04 * kk, 16, 10), mat('felt', '#facc15'), [0, 0, 0.01 * kk]));
        }
        o.position.set(0.14 * kk, top.y - 0.02 * kk, 0.06 * kk);
        o.rotation.z = -0.3;
        return o;
      }
      case 'halo': {
        const o = M(this.tor(0.22 * kk, 0.025 * kk, 12, 48), mat('emissive', col), null, [Math.PI / 2, 0, 0]);
        o.position.y = top.y + 0.14 * kk;
        return o;
      }
      case 'horns': case 'catears': case 'bunny': case 'antenna': case 'sprout': {
        for (const sx of id === 'sprout' ? [0] : [-1, 1]) {
          const s = G();
          if (id === 'horns') s.add(M(new THREE.ConeGeometry(0.06 * kk, 0.22 * kk, 20), mat('gloss', col), [0, 0.09 * kk, 0]));
          if (id === 'catears') s.add(fur(new THREE.ConeGeometry(0.12 * kk, 0.22 * kk, 24).scale(1, 1, 0.45).translate(0, 0.09 * kk, 0), col, 0.8));
          if (id === 'bunny') {
            s.add(fur(this.sph(1, 24, 16).scale(0.08 * kk, 0.26 * kk, 0.05 * kk).translate(0, 0.22 * kk, 0), col, 0.8));
            s.add(M(this.sph(1, 20, 12), mat('felt', col2), [0, 0.22 * kk, 0.035 * kk], null, [0.045 * kk, 0.18 * kk, 0.02 * kk]));
          }
          if (id === 'antenna') {
            s.add(M(new THREE.CylinderGeometry(0.01 * kk, 0.01 * kk, 0.22 * kk, 8), mat('plastic', col), [0, 0.11 * kk, 0]));
            s.add(M(this.sph(0.045 * kk, 16, 10), mat('emissive', col2), [0, 0.23 * kk, 0]));
          }
          if (id === 'sprout') {
            s.add(M(new THREE.CylinderGeometry(0.012 * kk, 0.015 * kk, 0.16 * kk, 8), mat('plastic', '#16a34a'), [0, 0.08 * kk, 0]));
            for (const lx of [-1, 1]) s.add(M(this.sph(1, 16, 10), mat('plastic', col), [lx * 0.07 * kk, 0.17 * kk, 0], [0, 0, lx * 0.5], [0.08 * kk, 0.035 * kk, 0.02 * kk]));
          }
          const x = sx * (id === 'antenna' ? 0.12 : 0.22) * kk;
          const t = probe.top(x, 0).p;
          s.position.set(x, t.y - 0.03 * kk, 0);
          s.rotation.z = -sx * (id === 'bunny' ? 0.15 : id === 'catears' ? 0.3 : 0.35);
          g.add(s);
        }
        return g;
      }
      case 'headphones': case 'headband': case 'bandana': {
        const y = id === 'bandana' ? top.y - 0.12 * kk : eyeY + (id === 'headband' ? r3 * 2.2 : 0);
        const s = probe.section(y);
        if (id === 'headphones') {
          const R = s.w + 0.04 * kk;
          g.add(M(this.tor(R, 0.025 * kk, 10, 40, Math.PI), mat('plastic', col), [0, y, 0], null, [1, (top.y - y + 0.06 * kk) / R, 1]));
          for (const sx of [-1, 1]) g.add(M(new THREE.CylinderGeometry(0.1 * kk, 0.1 * kk, 0.07 * kk, 28), mat('plastic', col2), [sx * R, y, 0], [0, 0, Math.PI / 2]));
          return g;
        }
        g.add(M(this.tor(1, 0.05, 10, 48), mat('felt', col), [0, y, 0], [Math.PI / 2, 0, 0], [s.w * 1.04, s.d * 1.06, kk * 0.9]));
        return g;
      }
      case 'glasses': case 'square': case 'nerd': case 'sunglasses': case 'aviator': case 'heartglasses': case 'starglasses': case '3d': case 'monocle': case 'goggles': case 'visor': case 'eyepatch': {
        const ez = Math.max(...this.eyes.map((e) => e.root.position.z)) + r3 * 0.55;
        const rr = r3 * (id === 'nerd' ? 1.7 : 1.5);
        const sides = id === 'monocle' ? [1] : id === 'eyepatch' ? [-1] : [-1, 1];
        const fm = mat(id === '3d' ? 'plastic' : 'gloss', col);
        for (const sx of sides) {
          const x = sx * L.sp * U;
          if (id === 'eyepatch') { g.add(M(this.sph(rr * 0.9, 24, 12), mat('felt', col), [x, eyeY, ez - rr * 0.5], null, [1, 0.85, 0.35])); continue; }
          if (id === 'visor') continue;
          const square = id === 'square' || id === 'nerd' || id === '3d';
          const ring = this.tor(rr, rr * 0.13, 8, square ? 4 : 32);
          g.add(M(ring, fm, [x, eyeY, ez], [0, 0, square ? Math.PI / 4 : 0], square ? [1.15, 0.85, 1] : [1, 1, 1]));
          const tint = id === 'sunglasses' || id === 'aviator' ? '#0f172a' : id === 'goggles' ? col2 : id === '3d' ? (sx < 0 ? '#ef4444' : '#22d3ee') : id === 'heartglasses' ? '#f9a8d4' : id === 'starglasses' ? '#fde68a' : null;
          if (tint) {
            const lens = M(new THREE.CircleGeometry(rr, square ? 4 : 32), new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.05, clearcoat: 1, transparent: true, opacity: id === 'sunglasses' ? 0.92 : 0.55 }), [x, eyeY, ez - 0.002], [0, 0, square ? Math.PI / 4 : 0], square ? [1.15, 0.85, 1] : [1, 1, 1]);
            g.add(lens);
          }
        }
        if (id === 'visor') g.add(M(new THREE.CapsuleGeometry(rr * 0.8, L.sp * U * 2.2, 6, 16), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.75 }), [0, eyeY, ez], [0, 0, Math.PI / 2], [1, 1, 0.3]));
        if (sides.length === 2 && id !== 'visor') g.add(M(new THREE.CylinderGeometry(rr * 0.1, rr * 0.1, L.sp * U * 2 - rr * 2, 8), fm, [0, eyeY + rr * 0.15, ez], [0, 0, Math.PI / 2]));
        if (id === 'eyepatch') { const s = probe.section(eyeY + r3); g.add(M(this.tor(1, 0.02, 6, 48), mat('felt', col), [0, eyeY + r3 * 0.4, 0], [Math.PI / 2, -0.35, 0], [s.w * 1.03, s.d * 1.05, kk])); }
        return g;
      }
      case 'mustache': case 'handlebar': case 'beard': case 'wizardbeard': case 'goatee': {
        const my = Y(L.mouthY);
        const hit = probe.front(0, my);
        if (id === 'mustache' || id === 'handlebar') {
          const o = G();
          for (const sx of [-1, 1]) o.add(fur(this.sph(1, 20, 12).scale(0.1 * kk, 0.04 * kk, 0.04 * kk).rotateZ(sx * (id === 'handlebar' ? -0.4 : 0.25)).translate(sx * 0.085 * kk, 0, 0), col, 0.6));
          o.position.copy(hit.p).add(new THREE.Vector3(0, L.mw * U * 0.5, this.furLen * 0.6));
          return o;
        }
        const long = id === 'wizardbeard' ? 1.8 : id === 'goatee' ? 0.6 : 1;
        const wB = id === 'goatee' ? 0.08 : 0.3;
        const o = fur(this.sph(1, 28, 18).scale(wB * kk, 0.16 * long * kk, 0.12 * kk), col, 1.1);
        o.position.set(0, my - 0.1 * long * kk, hit.p.z - 0.04 * kk);
        return o;
      }
      case 'clownnose': case 'nose': case 'pignose': {
        const ny = Y(L.anchors.nose.y);
        const hit = probe.front(0, ny);
        const o = G();
        if (id === 'clownnose') o.add(M(this.sph(0.075 * kk, 24, 16), mat('gloss', col)));
        else if (id === 'nose') o.add(M(this.sph(0.035 * kk, 20, 12), mat('gloss', col), null, null, [1.3, 0.9, 0.8]));
        else {
          o.add(M(new THREE.CylinderGeometry(0.08 * kk, 0.08 * kk, 0.05 * kk, 28), mat('felt', col), null, [Math.PI / 2, 0, 0], [1, 1, 0.75]));
          for (const sx of [-1, 1]) o.add(M(this.sph(0.018 * kk, 12, 8), mat('matte', shade(col, -0.5)), [sx * 0.03 * kk, 0, 0.026 * kk]));
        }
        o.position.copy(hit.p).addScaledVector(hit.n, this.furLen * 0.6 + 0.02 * kk);
        return o;
      }
      case 'bowtie': case 'tie': case 'medal': case 'bell': case 'scarf': case 'pearls': case 'ruff': {
        const ny = Y(L.anchors.neck.y);
        const s = probe.section(ny);
        const z = s.z + this.furLen * 0.6;
        if (id === 'scarf' || id === 'ruff') {
          g.add(fur(this.tor(1, 0.1, 14, 48).rotateX(Math.PI / 2).scale(s.w * 1.05, kk * (id === 'ruff' ? 0.9 : 0.75), s.d * 1.08), col, 0.9));
          if (id === 'scarf') g.add(fur(new THREE.BoxGeometry(0.1 * kk, 0.26 * kk, 0.04 * kk, 2, 6, 2).translate(0.12 * kk, -0.12 * kk, z + 0.02 * kk), col, 0.9));
          g.position.y = ny;
          return g;
        }
        if (id === 'pearls') {
          for (let i = 0; i <= 12; i++) { const an = Math.PI * (i / 12); g.add(M(this.sph(0.025 * kk, 12, 8), mat('gloss', col), [Math.cos(an) * s.w * 1.02, ny - Math.sin(an) * 0.03 * kk, Math.sin(an) * s.d * 1.05])); }
          return g;
        }
        const o = G();
        if (id === 'bowtie') {
          for (const sx of [-1, 1]) o.add(M(new THREE.ConeGeometry(0.07 * kk, 0.14 * kk, 20), mat('felt', col), [sx * 0.065 * kk, 0, 0], [0, 0, sx * Math.PI / 2], [1, 1, 0.5]));
          o.add(M(this.sph(0.035 * kk, 16, 10), mat('felt', shade(col, -0.2))));
        } else if (id === 'tie') {
          o.add(M(this.sph(0.035 * kk, 16, 10), mat('felt', shade(col, -0.2))));
          o.add(M(new THREE.ConeGeometry(0.06 * kk, 0.3 * kk, 4), mat('felt', col), [0, -0.17 * kk, 0], [Math.PI, Math.PI / 4, 0], [1, 1, 0.35]));
        } else if (id === 'medal') {
          o.add(M(new THREE.CylinderGeometry(0.06 * kk, 0.06 * kk, 0.015 * kk, 32), mat('metal', col), [0, -0.08 * kk, 0], [Math.PI / 2, 0, 0]));
          o.add(M(new THREE.BoxGeometry(0.04 * kk, 0.1 * kk, 0.005 * kk), mat('felt', col2), [0, -0.02 * kk, 0]));
        } else {
          o.add(M(this.sph(0.06 * kk, 20, 14), mat('metal', col), [0, -0.05 * kk, 0]));
          g.add(M(this.tor(1, 0.045, 10, 48), mat('felt', col2), [0, ny, 0], [Math.PI / 2, 0, 0], [s.w * 1.03, s.d * 1.05, kk]));
        }
        o.position.set(0, ny, z);
        g.add(o);
        return g;
      }
      case 'cape': case 'superhero': {
        const s = probe.section(H * 0.5);
        const geo = new THREE.CylinderGeometry(s.w * 1.02, s.w * 1.35, H * 0.75, 32, 1, true, Math.PI / 2 + 0.35, Math.PI - 0.7);
        geo.scale(1, 1, (s.d / s.w) * 1.1);
        const m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.6, sheen: 0.6, side: THREE.DoubleSide });
        g.add(M(geo, m, [0, H * 0.4, 0]));
        return g;
      }
      case 'wings': case 'batwings': {
        const s = probe.section(H * 0.5);
        for (const sx of [-1, 1]) {
          const w = G(M(this.sph(1, 24, 12), id === 'wings' ? mat('felt', col) : mat('plastic', col), [sx * 0.2 * kk, 0.08 * kk, 0], null, [0.24 * kk, 0.15 * kk, 0.03 * kk]));
          w.position.set(sx * s.w * 0.5, H * 0.55, -s.d * 0.85);
          w.rotation.set(0, sx * 0.5, sx * 0.35);
          g.add(w);
        }
        return g;
      }
      case 'tail': {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.12 * kk, -0.1), new THREE.Vector3(0.12 * kk, 0.1 * kk, -0.45 * kk), new THREE.Vector3(0.25 * kk, 0.32 * kk, -0.5 * kk)]);
        g.add(M(new THREE.TubeGeometry(curve, 24, 0.02 * kk, 8), mat('gloss', col)));
        g.add(M(new THREE.ConeGeometry(0.06 * kk, 0.1 * kk, 4), mat('gloss', col), [0.25 * kk, 0.36 * kk, -0.5 * kk], null, [1, 1, 0.4]));
        return g;
      }
      case 'jetpack': {
        const s = probe.section(H * 0.5);
        for (const sx of [-1, 1]) {
          g.add(M(new THREE.CapsuleGeometry(0.07 * kk, 0.22 * kk, 6, 16), mat('metal', col), [sx * 0.09 * kk, H * 0.5, -s.d - 0.04 * kk]));
          g.add(M(new THREE.ConeGeometry(0.05 * kk, 0.14 * kk, 16), mat('emissive', '#f97316'), [sx * 0.09 * kk, H * 0.5 - 0.22 * kk, -s.d - 0.04 * kk], [Math.PI, 0, 0]));
        }
        return g;
      }
      case 'pirate': {
        // tricornio: copa + tres alas levantadas + calavera
        const cp = capFor(0.2);
        const hh = top.y - cp.y + 0.06 * kk;
        const fm = mat('felt', col);
        const o = G(M(this.sph(1, 32, 16, 0, TAU, 0, Math.PI / 2), fm, null, null, [cp.w * 0.95, hh * 1.1, cp.d]));
        for (let i = 0; i < 3; i++) {
          const f = G(M(this.sph(1, 24, 10), fm, [0, 0, cp.d * 0.85], [-0.75, 0, 0], [cp.w * 0.95, 0.1 * kk, 0.07 * kk]));
          f.rotation.y = (i / 3) * TAU;
          f.position.y = hh * 0.12;
          o.add(f);
        }
        const bone = mat('felt', col2);
        const sk = G(M(this.sph(0.045 * kk, 16, 10), bone));
        for (const a of [0.7, -0.7]) sk.add(M(new THREE.CapsuleGeometry(0.012 * kk, 0.11 * kk, 3, 6), bone, [0, 0, -0.01 * kk], [0, 0, a]));
        for (const sx of [-1, 1]) sk.add(M(this.sph(0.011 * kk, 8, 6), mat('matte', '#111827'), [sx * 0.016 * kk, 0.005 * kk, 0.04 * kk]));
        sk.position.set(0, hh * 0.5, cp.d * 0.97);
        sk.rotation.x = -0.3;
        o.add(sk);
        o.position.y = cp.y;
        return o;
      }
      case 'pipe': case 'lollipop': {
        const my = Y(L.mouthY);
        const p0 = probe.front(L.mw * U * 0.5, my).p;
        const o = G();
        o.position.copy(p0);
        o.position.z += this.furLen * 0.5;
        const stick = (a, b, r, m) => {
          const d = b.clone().sub(a);
          const cy = M(new THREE.CylinderGeometry(r, r, d.length(), 8), m);
          cy.position.copy(a).addScaledVector(d, 0.5);
          cy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
          return cy;
        };
        const V = (x, y, z) => new THREE.Vector3(x * u2, y * u2, z * u2);
        if (id === 'pipe') {
          o.add(stick(V(0, 0, 0), V(22, -10, 14), 2 * u2, mat('gloss', '#1f2937')));
          const bowl = V(26, -16, 16);
          o.add(M(new THREE.CylinderGeometry(8 * u2, 7 * u2, 16 * u2, 20), mat('gloss', col), bowl.toArray()));
          o.add(M(new THREE.CircleGeometry(6.5 * u2, 16), mat('matte', '#292524'), [bowl.x, bowl.y + 8.05 * u2, bowl.z], [-Math.PI / 2, 0, 0]));
          const smoke = [0, 1, 2].map(() => M(this.sph(1, 10, 8), mat('felt', '#d6d3d1')));
          o.add(...smoke);
          this.anims.push((sec) => smoke.forEach((b, i) => {
            const q = (sec * 0.5 + i / 3) % 1;
            b.position.set(bowl.x + Math.sin(q * 7 + i) * 4 * u2, bowl.y + (10 + q * 40) * u2, bowl.z);
            b.scale.setScalar(Math.max(1e-4, (2 + q * 5) * u2 * Math.sin(Math.PI * q)));
          }));
        } else {
          o.add(stick(V(0, 0, 0), V(26, 10, 10), 1.6 * u2, mat('plastic', '#fafafa')));
          const cnd = G(M(new THREE.CylinderGeometry(11 * u2, 11 * u2, 4 * u2, 28), mat('gloss', col), null, [Math.PI / 2, 0, 0]));
          const sw = [];
          for (let i = 0; i <= 30; i++) { const a = (i / 30) * Math.PI * 4; const rr = (1 + 8 * (i / 30)) * u2; sw.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 2.2 * u2)); }
          cnd.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sw), 48, 1 * u2, 5), mat('plastic', '#ffffff')));
          cnd.position.copy(V(31, 13, 12));
          o.add(cnd);
        }
        return o;
      }
      case 'bandaid': case 'ninjamask': case 'facemask': {
        // parches pegados a la superficie: la geometría del cuerpo inflada y recortada por una caja
        const D = this.depth;
        const off = this.furLen * 1.02 + 0.004 * kk;
        const patch = (color, box, kind, round = 0, dOff = 0) => {
          const m = new THREE.Mesh(this.B.geometry, surfaceMaterial(bm.uniforms, { color, off: off + dOff, box, kind, round }));
          m.userData.ownMaterial = true;
          m.userData.noBounds = true;
          this.bodyMeshes.push(m);
          return m;
        };
        if (id === 'bandaid') {
          const x = L.sp * U + r3 * 0.4;
          const y = eyeY - r3 * 2.4;
          g.add(patch(col, { c: [x, y, D], h: [12 * u2, 4.5 * u2, D], rot: 30 * DEG }, 'plastic', 4.4 * u2));
          g.add(patch(shade(col, -0.1), { c: [x, y, D], h: [4 * u2, 4.6 * u2, D], rot: 30 * DEG }, 'plastic', 0, 0.002 * kk));
        } else if (id === 'ninjamask') {
          const y1 = eyeY - r3 * 1.6;
          g.add(patch(col, { c: [0, y1 / 2, 0], h: [9, y1 / 2, 9], rot: 0 }, 'felt'));
          this.hideMouth = true;
        } else {
          const my = Y(L.mouthY);
          const mw = L.mw * U;
          g.add(patch(col, { c: [0, my - 5 * u2, D], h: [mw + 12 * u2, 17 * u2, D], rot: 0 }, 'felt', 8 * u2));
          this.hideMouth = true;
        }
        g.userData.surface = true;
        return g;
      }
      case 'scar': {
        const x0 = -L.sp * U;
        const lift = this.furLen * 0.9 + 0.004 * kk;
        const on = (x, y) => { const h = probe.front(x, y); return h.p.clone().addScaledVector(h.n, lift); };
        const pts = [];
        for (let i = 0; i <= 8; i++) { const q = i / 8; pts.push(on(x0 + lerp(-6, 6, q) * u2, eyeY + r3 * lerp(2.6, -2.4, q))); }
        const sm = mat('felt', col);
        g.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 1.4 * u2, 5), sm));
        for (const dy of [-8, 0, 8]) {
          const yy = eyeY - dy * u2;
          const xs = x0 + (-dy / 8) * 2 * u2;
          g.add(M(new THREE.TubeGeometry(new THREE.LineCurve3(on(xs - 4 * u2, yy), on(xs + 4 * u2, yy)), 2, 1.1 * u2, 5), sm));
        }
        g.userData.surface = true;
        return g;
      }
      case 'parrot': {
        const x = X(L.anchors.shoulder.x);
        const t = probe.top(x, 0).p;
        const o = G();
        const k = kk * 1.1;
        o.add(M(this.sph(1, 20, 14), mat('felt', col), [0, 0.09 * k, 0], [0.2, 0, 0], [0.065 * k, 0.1 * k, 0.065 * k]));
        o.add(M(this.sph(0.055 * k, 18, 12), mat('felt', col), [0, 0.2 * k, 0.015 * k]));
        o.add(M(new THREE.ConeGeometry(0.03 * k, 0.07 * k, 10), mat('felt', col2), [0, 0.265 * k, -0.01 * k], [-0.4, 0, 0]));
        o.add(M(new THREE.ConeGeometry(0.02 * k, 0.05 * k, 10), mat('gloss', '#facc15'), [0, 0.19 * k, 0.07 * k], [Math.PI / 2 + 0.5, 0, 0]));
        for (const sx of [-1, 1]) o.add(M(this.sph(0.011 * k, 8, 6), mat('gloss', '#111111'), [sx * 0.035 * k, 0.21 * k, 0.04 * k]));
        o.add(M(new THREE.CapsuleGeometry(0.018 * k, 0.12 * k, 3, 8), mat('felt', '#2563eb'), [0, 0.02 * k, -0.06 * k], [-0.9, 0, 0]));
        for (const sx of [-1, 1]) o.add(M(this.sph(1, 14, 10), mat('felt', shade(col, -0.2)), [sx * 0.06 * k, 0.1 * k, -0.005 * k], [0.2, 0, sx * 0.15], [0.02 * k, 0.07 * k, 0.05 * k]));
        const y0 = t.y - 0.01 * kk;
        o.position.set(x, y0, 0);
        o.rotation.y = -0.4;
        const ph = Math.random() * TAU;
        this.anims.push((sec) => { o.rotation.x = Math.sin(sec * 2.2 + ph) * 0.08; o.position.y = y0 + Math.max(0, Math.sin(sec * 1.3 + ph)) * 0.01 * kk; });
        return G(o);
      }
      case 'sparkles': case 'hearts': case 'zzz': {
        // piezas de los efectos (geometría compartida) colocadas como en el dibujo 2D
        const list = id === 'sparkles'
          ? [[-0.75, -0.55, 9], [0.8, -0.35, 7], [0.7, 0.55, 6], [-0.8, 0.35, 5]].map(([a, b, r]) => [a * W * 0.62, H * 0.5 - b * H * 0.55, r * 1.3])
          : id === 'hearts'
            ? [[-40, -10, 7], [36, -18, 9], [8, -34, 6]].map(([x, y, r]) => [x * u2, top.y - y * u2, r])
            : [[30, -10, 9], [46, -26, 6.5], [58, -38, 5]].map(([x, y, r]) => [x * u2, top.y - y * u2, r]);
        const gm = mat('gloss', id === 'hearts' ? '#f43f5e' : col);
        const items = list.map(([x, y, r], i) => {
          const m = M(glyph(id === 'sparkles' ? 'star' : id === 'hearts' ? 'heart' : 'z'), gm, [x, y, this.depth * 0.5]);
          m.scale.setScalar(r * u2);
          m.userData.r = r * u2;
          m.userData.i = i;
          return m;
        });
        g.add(...items);
        this.anims.push((sec) => items.forEach((m) => {
          const i = m.userData.i;
          if (id === 'sparkles') { m.scale.setScalar(m.userData.r * (0.7 + 0.3 * Math.sin(sec * 3 + i * 1.7))); m.rotation.z = sec * 0.6 + i; }
          else m.rotation.y = Math.sin(sec * 1.5 + i) * 0.4;
        }));
        return g;
      }
      case 'sweat': {
        const h = probe.front(L.sp * U + r3 * 2.4, eyeY + r3 * 2.4);
        const m = M(glyph('drop'), mat('gloss', col), null, [0, 0, -0.15]);
        m.scale.setScalar(7 * u2);
        m.position.copy(h.p).addScaledVector(h.n, this.furLen + 6 * u2);
        g.add(m);
        return g;
      }
      case 'helmet': {
        // casco espacial: burbuja de cristal + aro
        const R = Math.max(W, H) * 0.62;
        const glass = M(this.sph(R, 48, 32), mat('glass', col), [0, H * 0.5, 0]);
        glass.renderOrder = 2;
        glass.userData.noBounds = true;
        g.add(glass);
        g.add(M(this.tor(R * 0.78, 0.035 * kk, 10, 48), mat('metal', col2), [0, H * 0.5 - R * 0.62, 0], [Math.PI / 2, 0, 0]));
        return g;
      }
      default:
        return this.spec._modParts?.[id] ? this.buildModPart(this.spec._modParts[id], a, c) : null;
    }
  }

  /**
   * Pieza de un mod: su glb (unidades del mod: 1 = 1 px de un ot de 120 de ancho, y hacia
   * arriba) o, si no trae, su SVG en un plano. Se carga en segundo plano; el pivote es el ancla.
   */
  buildModPart(p, a, c) {
    const { L, X, Y, probe } = c;
    const at = L.anchors[p.anchor] || L.anchors.center;
    const sc = (L.box.w / 120) * U;
    const x0 = X(at.x);
    const y0 = Y(at.y);
    const z0 = p.depth === 'center' ? 0 : (probe.front(x0, y0)?.p.z ?? 0) + this.furLen;
    const g = G();
    g.position.set(x0, y0, z0);
    g.userData.pivot = g.position.clone();
    const plane = () => this.modPlane(p, a, sc);
    if (!p.glb) return g.add(plane()), g;
    const holder = G();
    holder.scale.setScalar(sc);
    g.add(holder);
    const tint = p.tint === 'body' ? this.spec.body.color : p.tint === 'color' ? a.color : '';
    const job = loadGlb(p.glb).then((scene) => {
      const o = scene.clone(true);
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.userData.shared = true;
        if (tint) {
          m.material = m.material.clone();
          m.material.color?.set(tint);
          m.userData.ownMaterial = true;
        }
      });
      holder.add(o);
    }).catch(() => g.add(plane()));
    this.pending.push(job);
    return g;
  }

  /** SVG de una pieza de mod pintado en un plano (respaldo 3D de los mods sin glb). */
  modPlane(p, a, sc) {
    const [vx, vy, vw, vh] = p.view;
    const def = modPart(this.spec, a.id, shade);
    const inner = def ? def.draw({ k: 1, color: a.color, color2: a.color2, body: this.spec.body.color }) : '';
    const px = 256 / Math.max(vw, vh);
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(vw * px));
    cv.height = Math.max(2, Math.round(vh * px));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      tex.needsUpdate = true;
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${cv.width}" height="${cv.height}">${inner}</svg>`;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(vw * sc, vh * sc), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((vx + vw / 2) * sc, -(vy + vh / 2) * sc, p.layer === 'back' ? -0.01 : 0.01);
    m.userData.ownMaterial = true;
    m.userData.modPlane = { svg, w: cv.width, h: cv.height }; // export.js lo rasteriza con o.rasterSvg (si no, lo deja fuera)
    return m;
  }

  disposeRig() {
    this.rig.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.geometry.userData.shared) m.geometry.dispose();
      if (m.userData.ownMaterial) m.material.dispose();
    });
    this.model?.mixer?.stopAllAction();
    this.model = null;
    this.rig.clear();
    if (this.shadow) {
      this.shadow.material.dispose();
      this.shadow.geometry.dispose();
      this.root.remove(this.shadow);
      this.shadow = null;
    }
  }

  // ───────────────────────────── animación ─────────────────────────────

  blinkValue(t) {
    const bt = t - this.blinkAt;
    if (bt < 0 || bt >= 180) return 0;
    return bt < 70 ? EASE.in(bt / 70) ** 0.5 : 1 - EASE.out((bt - 70) / 110);
  }

  /** Avanza un frame. t: performance.now() ms; dt: ms. */
  tick(t, dt) {
    if (this.modelMode) return this.tickModel(t, dt);
    const rm = reducedMotion();
    const idle = this.opts.idle !== false;
    // parpadeo y miradas espontáneas
    if (idle && t >= this.nextBlink) {
      if (this.moodName !== 'sleep' && !rm) {
        this.blinkAt = t;
        if (Math.random() < 0.2) this.nextDouble = t + 240;
        if (t - this.look.at > 3000 && Math.random() < 0.45) {
          const back = Math.abs(this.look.tx) + Math.abs(this.look.ty) > 0.1 && Math.random() < 0.6;
          this.look.tx = back ? 0 : (Math.random() - 0.5) * 0.9;
          this.look.ty = back ? 0 : (Math.random() - 0.5) * 0.5;
        }
      }
      this.nextBlink = t + 1800 + Math.random() * 3600;
    }
    if (this.nextDouble && t >= this.nextDouble) { this.blinkAt = t; this.nextDouble = 0; }

    // voz → boca
    if (this.speech && !this.speech.tick(t)) this.endSpeech();
    const mo = this.mo;
    mo.open = approach(mo.open, mo.target, dt, mo.target > mo.open ? 35 : 70);
    mo.msx = approach(mo.msx, mo.tmsx, dt, 60);
    const look = this.look;
    look.x = rm ? look.tx : approach(look.x, look.tx, dt, 70);
    look.y = rm ? look.ty : approach(look.y, look.ty, dt, 70);
    const tgt = moodVals(this.moodName);
    for (const k in MOOD_BASE) this.mv[k] = rm ? tgt[k] : approach(this.mv[k], tgt[k], dt, 90);
    this.sleepK = approach(this.sleepK, this.moodName === 'sleep' ? 1 : 0, dt, rm ? 1 : 260);

    // gesto (poses de motion.js)
    const pose = { x: 0, y: 0, r: 0, sx: 1, sy: 1, lx: 0, ly: 0, blink: 0, eye: 1, lift: 0, open: 0, curve: 0, msx: 1 };
    let spin = 0;
    const gest = this.gest;
    if (gest) {
      const age = t - gest.start;
      const tt = clamp(age / gest.ms);
      Object.assign(pose, gest.def.pose(tt, rm ? 0 : age, gest));
      if (gest.dir < 0) { pose.x = -pose.x; pose.r = -pose.r; pose.lx = -pose.lx; }
      if (gest.name === 'spin') {
        spin = EASE.inOut(clamp((tt - 0.12) / 0.76)) * TAU;
        pose.sx = 1 + (pose.sy < 1 ? (1 - pose.sy) * 0.6 : 0);
      }
      for (const f of gest.def.fx || []) {
        if (tt >= f[0] && !gest.fired.has(f)) {
          gest.fired.add(f);
          this.effect(f[1], { dir: gest.dir, ...(f[2] || {}) });
        }
      }
      if (tt >= 1) this.endGesture();
    }
    if (rm) Object.assign(pose, { x: 0, y: 0, r: 0, sx: 1, sy: 1 });

    const { ksx, ksy, act } = this.tickMorphs(t, rm);
    if (act.shape && !act.shape.ready) this.startShape(act.shape);
    const shapeK = act.shape?.ready ? act.shape.k : 0;
    this.bodyU.uMorph.value.set(act.melt?.k || 0, rm ? 0 : act.jelly?.k || 0, shapeK, 0);

    // cuerpo
    const m = this.mv;
    const W = this.W;
    const H = this.H;
    const kk = this.kk;
    const sec = t / 1000;
    const breath = rm || !idle ? 0 : Math.sin(sec * TAU / 3.4 + this.phase);
    const talk = mo.open;
    const sx = pose.sx * (1 - 0.015 * talk) * (1 - 0.006 * breath) * ksx;
    const sy = pose.sy * (1 + 0.03 * talk) * (1 + 0.014 * breath) * ksy;
    const rig = this.rig;
    rig.position.set(pose.x * W, -pose.y * H, 0);
    rig.rotation.set(look.y * 0.12, this.yaw + look.x * 0.35 + spin + (rm || !idle ? 0 : Math.sin(sec * 0.7 + this.phase) * 0.04), -(pose.r + look.x * 2) * DEG);
    rig.scale.set(sx, sy, sx);
    const air = Math.max(0, -pose.y);
    this.shadow.scale.set(W * 1.55 * (1 - air * 0.9) * ksx, this.shadow.scale.y, 1);
    this.shadow.material.opacity = 1 - air * 1.5;

    // piezas que siguen a la silueta (shape:<id>)
    for (const p of this.parts) p.o.position.copy(p.p0).addScaledVector(p.d, shapeK);

    // ojos
    const blink = Math.max(this.blinkValue(t), pose.blink, this.sleepK > 0.02 ? Math.min(1, this.sleepK * 1.1) : 0);
    const closed = this.sleepK > 0.85;
    const lx = clamp(look.x + pose.lx, -1, 1);
    const ly = clamp(look.y + pose.ly, -1, 1);
    const esc = m.eye * pose.eye;
    for (const e of this.eyes) {
      e.main.visible = !closed;
      e.closed.visible = closed;
      e.gaze.rotation.set(ly * 0.4, lx * 0.5, 0);
      const k = e.noBlink ? 1 : Math.max(0.08, 1 - blink);
      e.main.scale.set(esc, esc * (m.squash || 1) * k, esc);
    }
    for (const b of this.brows) {
      b.g.position.y += (m.lift + pose.lift) * U + (m.eye * pose.eye - 1) * this.L.r * U * 1.65;
      b.g.rotation.z = -b.side * m.tilt * 14 * DEG;
    }

    // boca
    const mt = this.mouthRig;
    const curve = clamp(m.curve + pose.curve + mt.bias, -1, 1);
    const open = clamp(Math.max(mo.open + pose.open, m.open, mt.min));
    const msx = mo.msx * pose.msx;
    mt.g.scale.x = msx;
    if (mt.line) {
      mt.line.morphTargetInfluences[0] = Math.max(0, curve);
      mt.line.morphTargetInfluences[1] = Math.max(0, -curve);
      mt.line.visible = open <= 0.12;
    }
    if (mt.cav) {
      const show = open > 0.12;
      mt.cav.visible = show;
      if (show) {
        const w = mt.mw * (0.75 + Math.max(0, curve) * 0.15);
        const h = mt.mw * (0.12 + open * 0.75);
        mt.cav.scale.set(w, h, mt.mw * 0.18);
        mt.cav.position.y = -h * 0.55 + curve * mt.mw * 0.1;
      }
    }
    if (mt.round) mt.round.scale.setScalar(0.85 + open * 0.6);
    if (mt.grit) { mt.grit.scale.y = 1 + open * 1.6; mt.grit.position.y = curve * mt.mw * 0.08; }
    if (mt.lips) {
      const gap = open * mt.mw * 0.45;
      mt.lips.up.position.y = mt.mw * 0.16 + gap * 0.5 + curve * mt.mw * 0.05;
      mt.lips.lo.position.y = -mt.mw * 0.14 - gap * 0.5;
      mt.lips.hole.scale.y = Math.max(0.001, gap * 0.6);
    }

    // metamorfosis de dibujo: pinchos, cuernos, alas, manos
    const mob = this.mobj;
    const ms = act.spikes;
    if (ms) {
      const o = mob.spikes || (mob.spikes = this.makeSpikes(ms.o.color));
      o.visible = true;
      const list = o.userData.list;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const ki = Math.max(1e-4, EASE.backOut(clamp(ms.k * 1.5 - it.ord * 0.07)) * (ms.phase === 'out' ? ms.k : 1));
        DUMMY.position.copy(it.p);
        DUMMY.quaternion.copy(it.q);
        DUMMY.scale.set(ki, ki, ki);
        DUMMY.updateMatrix();
        o.setMatrixAt(i, DUMMY.matrix);
      }
      o.instanceMatrix.needsUpdate = true;
    } else if (mob.spikes) mob.spikes.visible = false;
    const mh = act.horns;
    if (mh) {
      const o = mob.horns || (mob.horns = this.makeHorns(mh.o.color));
      o.visible = true;
      for (const h of o.children) h.scale.setScalar(Math.max(1e-4, mh.k));
    } else if (mob.horns) mob.horns.visible = false;
    const mw = act.wings;
    if (mw) {
      const o = mob.wings || (mob.wings = this.makeWings(mw.o.color));
      o.visible = true;
      const fast = mw.o.flap === 'fast';
      const fl = rm ? 0 : Math.sin((t - mw.start) / 1000 * TAU * (fast ? 3.2 : 0.9)) * (fast ? 32 : 11) * DEG;
      for (const w of o.children) {
        const s = w.userData.side;
        w.rotation.set(0, s * (0.55 - fl), s * 0.25);
        w.scale.setScalar(Math.max(1e-4, mw.k));
      }
    } else if (mob.wings) mob.wings.visible = false;

    // manos (HAND_POSES en unidades del dibujo 2D → 3D)
    const mhd = act.hands;
    for (let i = 0; i < 2; i++) {
      const hnd = this.hands[i];
      hnd.visible = !!mhd;
      if (!mhd) { hnd.userData.on = false; continue; }
      const s = i ? 1 : -1;
      const L = this.L;
      const c2 = this.handCtx || (this.handCtx = { cx: L.cx, W: L.box.w, H: L.box.h, mid: L.box.y + L.box.h * 0.55, mouthY: L.mouthY, mw: L.mw, sp: L.sp, eyeY: L.eyeY, pts: L.pts });
      const p = (HAND_POSES[mhd.o.pose] || HAND_POSES.rest)(s, rm ? 0 : t - mhd.start, mhd.o.dir || 1, c2);
      const x = this.X(p.x ?? c2.cx + s * p.u * c2.W * 0.5);
      const y = this.Y(p.y ?? c2.mid + p.v * c2.H * 0.5);
      const fz = this.frontZ(x, y);
      const z = fz == null ? this.depth * 0.15 : fz + 0.06 * kk + this.furLen;
      const rz = -s * (p.ang || 0) * DEG;
      if (!hnd.userData.on || rm) { hnd.position.set(x, y, z); hnd.rotation.z = rz; hnd.userData.on = true; }
      else {
        hnd.position.set(approach(hnd.position.x, x, dt, 70), approach(hnd.position.y, y, dt, 70), approach(hnd.position.z, z, dt, 70));
        hnd.rotation.z = approach(hnd.rotation.z, rz, dt, 70);
      }
      const type = p.type || 'open';
      const fg = hnd.userData.finger;
      fg.visible = type === 'point' || type === 'thumb' || type === 'thumbdown';
      fg.rotation.z = type === 'thumbdown' ? Math.PI : 0;
      hnd.scale.setScalar(Math.max(0.01, mhd.k * (p.s || 1)) * (type === 'open' ? 1 : 0.9));
    }

    const blush = this.tickEffects(t, rm);
    this.bodyU.uBlush.value = blush;
    this.fxg.position.copy(rig.position);
    this.fxg.rotation.y = this.yaw;

    for (const f of this.furs) f.u.uTime.value = sec;
    for (const a of this.anims) a(rm ? 0 : sec);
  }

  /** Pinchos: conos instanciados en el contorno (sin la base) y en la espalda. */
  /** Fases de las metamorfosis como en 2D (entra con rebote, sale suave): { ksx, ksy, act }. */
  tickMorphs(t, rm) {
    let ksx = 1;
    let ksy = 1;
    const act = {};
    for (const [slot, mm] of this.morphs) {
      if (mm.phase !== 'out' && t >= mm.until) { mm.phase = 'out'; mm.outAt = t; mm.k0 = mm.k; }
      if (mm.phase === 'in') {
        const q = clamp((t - mm.start) / MORPH_IN);
        mm.k = rm ? 1 : mm.shape ? EASE.inOut(q) : EASE.backOut(q);
        if (q >= 1) mm.phase = 'on';
      } else if (mm.phase === 'on') mm.k = 1;
      else {
        const q = clamp((t - mm.outAt) / MORPH_OUT);
        mm.k = rm ? 0 : mm.k0 * (1 - EASE.inOut(q));
        if (q >= 1) { this.morphs.delete(slot); this.endMorph(slot); continue; }
      }
      act[slot] = mm;
      const sc = SCALE_MORPH[slot];
      if (sc) { const [a, b] = sc(mm.k); ksx *= a; ksy *= b; }
    }
    return { ksx, ksy, act };
  }

  /** Avanza los efectos; devuelve el rubor que piden. */
  tickEffects(t, rm) {
    let blush = 0;
    if (this.fxs.length) {
      const c = this.fxc;
      this.fxs = this.fxs.filter((f) => {
        const age = t - f.start;
        let alpha = 1;
        let p;
        if (f.loop) {
          if (!f.hold && age >= f.ms && f.end == null) f.end = t;
          p = rm ? 0.3 : (age % f.cycle) / f.cycle;
        } else {
          if (age >= f.ms) { disposeFx(f.obj); return false; }
          p = rm ? 0.5 : age / f.ms;
        }
        if (f.end != null) {
          alpha = 1 - clamp((t - f.end) / FX_OUT);
          if (alpha <= 0) { disposeFx(f.obj); return false; }
        }
        f.def.draw(c, f, p, rm ? 0 : age, alpha, seeded(f.seed));
        if (f.blush) blush = Math.max(blush, f.blush);
        return true;
      });
    }
    return blush;
  }

  makeSpikes(color) {
    const L = this.L;
    const list = [];
    const up = new THREE.Vector3(0, 1, 0);
    const ctr = new THREE.Vector3(0, this.H * 0.5, 0);
    L.pts.forEach(([px, py], i) => {
      if (i >= 6 && i <= 10) return;
      const p = new THREE.Vector3(this.X(px), this.Y(py), 0);
      const d = p.clone().sub(ctr).normalize();
      p.addScaledVector(d, -0.02 * this.kk);
      list.push({ p, q: new THREE.Quaternion().setFromUnitVectors(up, d), ord: Math.min(i, 16 - i) });
    });
    for (const f of [0.82, 0.62, 0.42]) {
      const y = this.H * f;
      const s = this.probe.section(y);
      list.push({ p: new THREE.Vector3(0, y, -s.d * 0.9), q: new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 0.4, -1).normalize()), ord: 3 + list.length * 0.1 });
    }
    const geo = new THREE.ConeGeometry(0.05 * this.kk, 0.16 * this.kk, Math.max(6, Math.round(12 * this.q))).translate(0, 0.08 * this.kk, 0);
    const o = new THREE.InstancedMesh(geo, mat(this.plush ? 'felt' : 'gloss', color || shade(this.spec.body.color, -0.12)), list.length);
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    o.frustumCulled = false;
    o.userData.list = list;
    o.userData.noBounds = true;
    this.rig.add(o);
    return o;
  }

  /** Cuernos de la metamorfosis: dos conos curvos arriba. */
  makeHorns(color) {
    const L = this.L;
    const g = G();
    const m = mat('gloss', color || '#f5f0e6');
    for (const i of [1, 15]) {
      const [px, py] = L.pts[i];
      const s = px > L.cx ? 1 : -1;
      const h = G(M(new THREE.ConeGeometry(0.06 * this.kk, 0.24 * this.kk, 16).translate(0, 0.12 * this.kk, 0), m));
      h.children[0].rotation.z = -s * 0.25;
      const x = this.X(px) * 0.8;
      h.position.set(x, this.probe.top(x, 0).p.y - 0.04 * this.kk, 0);
      h.rotation.z = -s * 0.45;
      g.add(h);
    }
    g.userData.noBounds = true;
    this.rig.add(g);
    return g;
  }

  /** Alas de la metamorfosis: abanico de plumas a la espalda. */
  makeWings(color) {
    const g = G();
    const kk = this.kk;
    const s0 = this.probe.section(this.H * 0.6);
    const m = mat(this.plush ? 'felt' : 'plastic', color || '#ffffff');
    for (const side of [-1, 1]) {
      const w = G();
      for (let i = 0; i < 3; i++) {
        const f = M(this.sph(1, 20, 12), m, [side * (0.16 + i * 0.05) * kk, (0.1 - i * 0.07) * kk, 0], [0, 0, side * (0.5 - i * 0.35)], [(0.2 - i * 0.03) * kk, 0.07 * kk, 0.025 * kk]);
        w.add(f);
      }
      w.position.set(side * s0.w * 0.45, this.H * 0.62, -s0.d * 0.7);
      w.userData.side = side;
      g.add(w);
    }
    g.userData.noBounds = true;
    this.rig.add(g);
    return g;
  }

  /** Prepara shape:<id>: atributos aShape/aShapeN en un clon de la geometría y desplazamientos de cara. */
  startShape(mm) {
    mm.ready = true;
    const pts2 = mm.target;
    const L2 = layout(this.spec, pts2);
    const B2 = bodyGeometry(pts2, L2.box, this.quality);
    const src = B2.geometry.attributes;
    if (src.position.count !== this.B.geometry.attributes.position.count) return;
    let cl = this.shapeGeo;
    if (!cl) {
      cl = this.shapeGeo = this.B.geometry.clone();
      cl.userData = {}; // copy() comparte userData: sin esto heredaría shared=true
      for (const b of this.bodyMeshes) b.geometry = cl;
    }
    cl.setAttribute('aShape', src.position.clone());
    cl.setAttribute('aShapeN', src.normal.clone());
    const kx = (L2.box.w * U) / this.W;
    const ky = (L2.box.h * U) / this.H;
    const pr2 = surfaceProbe(B2.geometry);
    for (const p of this.parts) {
      const { x, y } = p.p0;
      const x2 = x * kx;
      const y2 = y * ky;
      p.d.set(x2 - x, y2 - y, p.face ? pr2.front(x2, y2).p.z - this.probe.front(x, y).p.z : 0);
    }
  }

  /** Limpia lo que deja una metamorfosis al terminar. */
  endMorph(slot) {
    if (slot === 'shape' && this.B) {
      for (const b of this.bodyMeshes) b.geometry = this.B.geometry;
      this.shapeGeo?.dispose();
      this.shapeGeo = null;
      for (const p of this.parts) { p.d.set(0, 0, 0); p.o.position.copy(p.p0); }
    }
    if (slot === 'hands') this.handCtx = null;
  }

  /** Al reconstruir: las piezas de las metamorfosis se rehacen solas en el siguiente frame. */
  clearMorphObjects() {
    if (this.shapeGeo) { this.shapeGeo.dispose(); this.shapeGeo = null; }
    this.mobj = {};
    this.handCtx = null;
    for (const mm of this.morphs.values()) mm.ready = false;
  }

  /** LOD: capas de pelo según la altura en pantalla (px). */
  lod(px) {
    if (!this.plush) return;
    this.setShells(clamp(px / (this.quality === 'high' ? 14 : 20), 3, this.maxShells));
  }

  // ───────────────────────────── API ─────────────────────────────

  /** Ánimo (se interpola); lanza sus efectos (MOOD_FX) salvo { fx: false } u opts.moodFx === false. */
  mood(name, o = {}) {
    if (!MOOD[name]) return false;
    if (name === this.moodName) return true;
    this.moodName = name;
    this.clearEffects('mood');
    if (this.opts.moodFx !== false && o.fx !== false) for (const [fx, fo] of MOOD_FX[name] || []) this.effect(fx, fo || {});
    return true;
  }

  endGesture() {
    const old = this.gest;
    if (!old) return;
    this.gest = null;
    const hands = this.morphs.get('hands');
    if (old.def.hands && hands && !hands.byGesture && hands.userPose !== undefined) hands.o.pose = hands.userPose;
    const wings = this.morphs.get('wings');
    if (old.def.wings && wings && !wings.byGesture) wings.o.flap = wings.userFlap;
  }

  gesture(name, o = {}) {
    const gname = Object.hasOwn(GESTURES, name) ? name : GESTURE_ALIAS[name];
    if (!gname) return false;
    if (typeof o === 'number') o = { ms: o };
    const def = GESTURES[gname];
    const t = nowMs();
    const ms = clamp(Number(o.ms) || def.ms, 200, 60000);
    const dir = o.dir === -1 || o.mirror === true ? -1 : 1;
    if (this.gest) this.endGesture();
    this.gest = { name: gname, def, start: t, ms, dir, fired: new Set() };
    // manos y alas que pide el gesto (si ya estaban, solo cambian de postura)
    const hands = this.morphs.get('hands');
    if (def.hands) {
      if (hands && hands.phase !== 'out') {
        hands.o.pose = def.hands;
        hands.o.dir = dir;
        if (hands.byGesture) hands.until = t + ms - MORPH_OUT;
      } else this.morph('hands', { pose: def.hands, dir, ms: ms - MORPH_OUT, byGesture: true });
    } else if (hands?.byGesture && hands.phase !== 'out') hands.until = t;
    const wings = this.morphs.get('wings');
    if (def.wings) {
      if (wings && wings.phase !== 'out') {
        wings.o.flap = def.wings;
        if (wings.byGesture) wings.until = t + ms - MORPH_OUT;
      } else this.morph('wings', { flap: def.wings, ms: ms - MORPH_OUT, byGesture: true });
    } else if (wings?.byGesture && wings.phase !== 'out') wings.until = t;
    return true;
  }

  /** Metamorfosis temporal: spikes|wings|hands|horns|puff|squish|stretch|melt|jelly|shape:<id>. o: { ms, hold, pose, dir, flap, color } */
  morph(name, o = {}) {
    if (typeof name !== 'string') return false;
    if (o === false) return this.unmorph(name);
    if (typeof o === 'number') o = { ms: o };
    if (!Object.hasOwn(MORPHS, name) && Object.hasOwn(FX3D, name)) return this.effect(name, o);
    let slot = name;
    let target = null;
    if (name.startsWith('shape:')) {
      target = shapePoints(name.slice(6));
      if (!target) return false;
      slot = 'shape';
    } else if (!Object.hasOwn(MORPHS, name)) return false;
    const t = nowMs();
    const hold = o.hold === true || o.ms === Infinity;
    const ms = hold ? Infinity : clamp(Number(o.ms) || MORPH_MS, 200, 600000);
    const user = !o.byGesture;
    const color = /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : undefined;
    const ex = this.morphs.get(slot);
    if (ex) {
      if (ex.phase === 'out') { ex.phase = 'in'; ex.start = t - MORPH_IN * clamp(ex.k); }
      ex.until = Math.max(user ? 0 : ex.until, t + ms);
      if (user) ex.byGesture = false;
      if (slot === 'shape' && ex.target !== target) { ex.target = target; ex.ready = false; }
      if (o.pose) ex.o.pose = o.pose;
      if (o.dir) ex.o.dir = o.dir;
      if (o.flap) ex.o.flap = o.flap;
      if (user) { ex.userPose = ex.o.pose; ex.userFlap = ex.o.flap; }
    } else {
      const mo2 = { pose: name === 'hands' ? o.pose || 'rest' : undefined, dir: o.dir === -1 ? -1 : 1, flap: o.flap, color };
      this.morphs.set(slot, {
        name: slot, start: t, until: t + ms, phase: 'in', k: 0, o: mo2, target, shape: slot === 'shape', ready: false,
        byGesture: !user, userPose: user ? mo2.pose : undefined, userFlap: user ? mo2.flap : undefined,
      });
    }
    return true;
  }

  unmorph(name) {
    const t = nowMs();
    const slot = typeof name === 'string' && name.startsWith('shape') ? 'shape' : name;
    for (const [k, m] of this.morphs) {
      if (slot && k !== slot) continue;
      if (m.phase !== 'out') { m.phase = 'out'; m.outAt = t; m.k0 = m.k; }
    }
    return true;
  }

  /** Efecto de CHARACTER_EFFECTS (los 16 de motion.js). o: { ms, hold, dir, tag } */
  effect(name, o = {}) {
    if (typeof name !== 'string') return false;
    if (typeof o === 'number') o = { ms: o };
    if (Object.hasOwn(MORPHS, name) || name.startsWith('shape:')) return this.morph(name, o);
    if (!Object.hasOwn(FX3D, name)) return false;
    const def = FX3D[name];
    const f = {
      name, def, start: nowMs(), ms: clamp(Number(o.ms) || (def.loop ? def.ms * 1.5 : def.ms), 100, 600000), cycle: def.ms,
      loop: !!def.loop || o.hold === true, hold: o.hold === true, dir: o.dir === -1 ? -1 : 1, o, tag: o.tag,
      seed: (++this.fxSeq * 7919) ^ Math.floor(this.phase * 1e4), end: null, obj: null,
    };
    const obj = def.make(this.fxc, f);
    if (obj) {
      f.obj = obj;
      (def.rig ? this.rig : this.fxg).add(obj);
      def.draw(this.fxc, f, 0, 0, 1, seeded(f.seed));
    }
    this.fxs.push(f);
    if (this.fxs.length > 24) disposeFx(this.fxs.shift().obj);
    return true;
  }

  clearEffects(name) {
    const t = nowMs();
    for (const f of this.fxs) if (!name || f.name === name || f.tag === name) f.end ??= t;
  }

  blink() { this.blinkAt = nowMs(); }

  lookAt(x, y) {
    this.look.tx = clamp(Number(x) || 0, -1, 1);
    this.look.ty = clamp(Number(y) || 0, -1, 1);
    this.look.at = nowMs();
  }

  /** Mirar a un punto de la pantalla (coordenadas de cliente). */
  lookAtPoint(clientX, clientY) {
    const p = this.view?.screenOf(this);
    if (!p) return;
    this.lookAt((clientX - p.x) / (window.innerWidth / 2), (clientY - p.y) / (window.innerHeight / 2));
  }

  mouth(v) { this.mo.target = clamp(Number(v) || 0); }

  viseme(id, open) {
    const v = VISEMES[id] || VISEMES.X;
    this.mo.target = clamp(open ?? v.open);
    this.mo.tmsx = v.w;
    return !!VISEMES[id];
  }

  endSpeech() {
    const sp = this.speech;
    this.speech = null;
    this.mo.target = 0;
    this.mo.tmsx = 1;
    sp?.resolve?.();
  }

  /** Habla: texto (visemas) o duración en ms (balbuceo). Devuelve una promesa con stop(). */
  speak(input, o = {}) {
    if (this.speech) this.endSpeech();
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
    if (!seq.length || !dur) { resolve(); return Object.assign(pr, { stop() {} }); }
    let Wt = 0;
    for (const it of seq) { it.t0 = Wt; Wt += it.w; }
    const start = nowMs();
    let idx = 0;
    const gain = Number(o.gain) || 1;
    const sp = {
      resolve,
      tick: (t) => {
        if (t - start >= dur) return false;
        const pos = clamp((t - start) / dur) * Wt;
        while (idx < seq.length - 1 && seq[idx + 1].t0 <= pos) idx++;
        const it = seq[idx];
        const v = VISEMES[it.v] || VISEMES.X;
        const local = clamp((pos - it.t0) / (it.w || 1));
        this.mo.target = clamp(v.open * (0.82 + 0.18 * Math.sin(Math.PI * local)) * gain);
        this.mo.tmsx = v.w;
        return true;
      },
    };
    this.speech = sp;
    return Object.assign(pr, { stop: () => { if (this.speech === sp) this.endSpeech(); } });
  }

  stopSpeaking() { if (this.speech) this.endSpeech(); }

  /** Boca guiada por audio real (AnalyserNode): RMS con ganancia automática; o.text da la forma. Devuelve stop(). */
  lipsync(analyser, o = {}) {
    this.stopSpeaking();
    if (!analyser || typeof analyser.getByteTimeDomainData !== 'function') return () => {};
    const n = analyser.fftSize || 512;
    const bytes = new Uint8Array(n);
    const gain = Number(o.gain) || 1;
    const seq = o.text ? textToVisemes(String(o.text)) : [];
    let Wt = 0;
    for (const it of seq) { it.t0 = Wt; Wt += it.w; }
    const dur = Number(o.durationMs) || Math.max(300, (String(o.text || '').length / 14) * 1000);
    const start = nowMs();
    let idx = 0;
    let peak = 0.05;
    const sp = {
      tick: (t) => {
        if (analyser.context?.state === 'closed') return false;
        analyser.getByteTimeDomainData(bytes);
        let rms = 0;
        for (let i = 0; i < n; i++) { const v = (bytes[i] - 128) / 128; rms += v * v; }
        rms = Math.sqrt(rms / n);
        peak = Math.max(rms, peak * 0.995, 0.02);
        const open = clamp(clamp((rms - 0.006) / (peak * 0.7)) ** 0.8 * gain);
        let w = 1;
        if (seq.length && t - start < dur) {
          const pos = clamp((t - start) / dur) * Wt;
          while (idx < seq.length - 1 && seq[idx + 1].t0 <= pos) idx++;
          w = (VISEMES[seq[idx].v] || VISEMES.X).w;
        }
        this.mo.target = open;
        this.mo.tmsx = lerp(1, w, clamp(open * 2));
        return true;
      },
    };
    this.speech = sp;
    return () => { if (this.speech === sp) this.endSpeech(); };
  }

  update(next) {
    this.build(next);
  }

  get state() {
    return {
      mood: this.moodName, gesture: this.gest?.name || null, speaking: !!this.speech, shells: this.shells,
      morphs: [...this.morphs.keys()].filter((k) => this.morphs.get(k).phase !== 'out'), effects: this.fxs.map((f) => f.name),
    };
  }

  dispose() {
    for (const f of this.fxs) disposeFx(f.obj);
    this.fxs = [];
    this.disposeRig();
    this.root.removeFromParent();
  }
}

Object.assign(Character3D.prototype, { buildModel, tickModel, modelGesture });
