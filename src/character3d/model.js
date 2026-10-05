/**
 * Mod de cuerpo completo: un modelo 3D (VRM o GLB) en lugar del cuerpo procedural del ot.
 *
 * El modelo vive dentro del mismo `rig` de Character3D, así que gestos sin animación propia,
 * efectos, ánimos y el encuadre siguen funcionando. Lo que el modelo traiga se aprovecha:
 *   - VRM (0.x y 1.0): expresiones estándar (aa/ih/ou/ee/oh, blink, happy, angry, sad,
 *     relaxed, surprised) y el hueso de la cabeza para mirar.
 *   - GLB: morph targets por nombre (blink, jawOpen/mouthOpen, happy/smile, sad, angry,
 *     surprised) y un hueso «head» si lo hay.
 *   - Animaciones: «idle» en bucle; las que se llamen como un gesto (wave, dance, yes, no,
 *     jump, thumbsup…) sustituyen a la pose procedural de ese gesto.
 * Unidades: el modelo se escala a la altura de un ot (su caja), con y hacia arriba y de frente a +z
 * (los VRM 0.x miran a -z y se giran solos).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { layout } from '../character/Character.js';
import { EASE, clamp, approach, HAND_POSES } from '../character/motion.js';
import { U } from './body.js';
import { shadowTexture } from './materials.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Animación del modelo para cada gesto de 7ots (por nombre del clip). */
const CLIP_FOR = {
  wave: /wave|hello|greet|hi\b/i,
  dance: /dance/i,
  celebrate: /victory|celebrat|cheer|dance/i,
  jump: /jump/i,
  bounce: /jump|hop/i,
  nod: /\byes\b|nod/i,
  shake: /^no$|\bno\b|shake_?head/i,
  thumbsup: /thumbs?_?up|\byes\b/i,
  thumbsdown: /thumbs?_?down|\bno\b/i,
  bow: /bow/i,
  think: /think/i,
  clap: /clap/i,
  point: /point/i,
  laugh: /laugh/i,
  stomp: /stomp|punch/i,
  shrug: /shrug/i,
  dizzy: /dizz|death|die/i,
  yawn: /yawn|sit/i,
  fly: /fly/i,
  floss: /floss/i,
  robot: /robot/i,
  shuffle: /shuffle|running_?man/i,
  dab: /\bdab/i,
  groove: /groove|hip_?hop|default_?dance/i,
  armwave: /arm_?wave|wave_?arms/i,
  disco: /disco|boogie/i,
  moonwalk: /moonwalk|slide/i,
  routine: /routine|macarena/i,
};
const IDLE = /idle|breath|stand/i;

/** Nombre de expresión VRM 0.x → VRM 1.0. */
const VRM0 = { a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh', joy: 'happy', sorrow: 'sad', fun: 'relaxed', angry: 'angry', blink: 'blink', surprised: 'surprised' };
/** Morph targets de un GLB cualquiera → expresión. */
const MORPH_NAMES = [
  ['aa', /jaw_?open|mouth_?open|viseme_?aa|^v_?aa$|^aa$|^a$/i],
  ['oh', /viseme_?(oh|o|ou)$|^oh$|^o$|mouth_?(funnel|pucker)/i],
  ['blink', /^blink$|blink_?both|eyes?_?clos|^eyeblink$|^blink/i],
  ['happy', /happy|joy|smile/i],
  ['sad', /sad|sorrow/i],
  ['angry', /angry|anger|\bmad\b/i],
  ['surprised', /surpris|shock/i],
];
/** Ánimo de 7ots → expresiones del modelo (con su peso). */
const MOOD_EXPR = {
  happy: { happy: 0.8 },
  love: { happy: 0.7, relaxed: 0.3 },
  angry: { angry: 0.85 },
  disgust: { angry: 0.5 },
  sad: { sad: 0.85 },
  fear: { surprised: 0.5, sad: 0.3 },
  surprised: { surprised: 0.9 },
  sleep: { relaxed: 0.6 },
};

function loadGltf(url) {
  return new Promise((res, rej) => {
    const loader = new GLTFLoader();
    if (url.startsWith('data:')) {
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      loader.parse(buf.buffer, '', res, rej);
    } else loader.load(url, res, undefined, rej);
  });
}

const meshesUnder = (obj) => {
  const out = [];
  obj.traverse((o) => { if (o.isMesh && o.morphTargetInfluences) out.push(o); });
  return out;
};

/** Expresiones del modelo: { nombre: [{ mesh, index, w }] }. */
async function expressionsOf(gltf) {
  const ex = {};
  const add = (name, mesh, index, w) => { if (Number.isInteger(index)) (ex[name] ||= []).push({ mesh, index, w }); };
  const { parser } = gltf;
  const ext = parser.json.extensions || {};
  if (ext.VRMC_vrm) {
    const all = { ...ext.VRMC_vrm.expressions?.preset, ...ext.VRMC_vrm.expressions?.custom };
    for (const [name, e] of Object.entries(all)) {
      for (const b of e?.morphTargetBinds || []) {
        const node = await parser.getDependency('node', b.node).catch(() => null);
        if (node) for (const m of meshesUnder(node)) add(name, m, b.index, b.weight ?? 1);
      }
    }
  } else if (ext.VRM) {
    const byMesh = new Map();
    gltf.scene.traverse((o) => {
      const a = parser.associations.get(o);
      if (o.isMesh && a?.meshes != null) (byMesh.get(a.meshes) || byMesh.set(a.meshes, []).get(a.meshes)).push(o);
    });
    for (const g of ext.VRM.blendShapeMaster?.blendShapeGroups || []) {
      const name = VRM0[String(g.presetName || '').toLowerCase()];
      if (!name) continue;
      for (const b of g.binds || []) for (const m of byMesh.get(b.mesh) || []) add(name, m, b.index, (b.weight ?? 100) / 100);
    }
  } else {
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.morphTargetDictionary) return;
      for (const [key, index] of Object.entries(o.morphTargetDictionary)) {
        const hit = MORPH_NAMES.find(([, re]) => re.test(key));
        if (hit) add(hit[0], o, index, 1);
      }
    });
  }
  return ex;
}

/** Hueso de la cabeza (VRM humanoid, o el primer hueso «head»). */
async function headOf(gltf) {
  const { parser } = gltf;
  const ext = parser.json.extensions || {};
  const idx = ext.VRMC_vrm?.humanoid?.humanBones?.head?.node ?? ext.VRM?.humanoid?.humanBones?.find((b) => b.bone === 'head')?.node;
  if (idx != null) return parser.getDependency('node', idx).catch(() => null);
  let head = null;
  const re = /^(mixamorig:?)?head$|^head[_\d]*$/i;
  gltf.scene.traverse((o) => { if (!head && o.isBone && re.test(o.name)) head = o; });
  // sin esqueleto: un nodo «head» rígido (modelos hechos por partes) también sirve
  if (!head) gltf.scene.traverse((o) => { if (!head && !o.isMesh && re.test(o.name)) head = o; });
  return head;
}

/** Brazos humanoides { s: lado en pantalla (+1 derecha), up, low, end, q0 } (VRM o nombres tipo Mixamo). */
async function armsOf(gltf) {
  const { parser } = gltf;
  const ext = parser.json.extensions || {};
  const v1 = ext.VRMC_vrm?.humanoid?.humanBones;
  const v0 = ext.VRM?.humanoid?.humanBones;
  const byVrm = (b) => {
    const idx = v1 ? v1[b]?.node : v0?.find((x) => x.bone === b)?.node;
    return idx == null ? null : parser.getDependency('node', idx).catch(() => null);
  };
  const bones = [];
  gltf.scene.traverse((o) => { if (o.isBone) bones.push(o); });
  // sin esqueleto: nodos rígidos (modelos hechos por partes) con los mismos nombres
  if (!bones.length) gltf.scene.traverse((o) => { if (!o.isMesh) bones.push(o); });
  const byName = (side, part) => {
    const L = side === 'left' ? 'l(eft)?' : 'r(ight)?';
    const re = {
      up: new RegExp(`^(mixamorig\\d*:?)?(${L}[_.]?(upper_?)?arm|(upper_?)?arm[_.]?${L})$`, 'i'),
      low: new RegExp(`^(mixamorig\\d*:?)?(${L}[_.]?(fore_?arm|lower_?arm)|(fore_?arm|lower_?arm)[_.]?${L})$`, 'i'),
      end: new RegExp(`^(mixamorig\\d*:?)?(${L}[_.]?hand|hand[_.]?${L})$`, 'i'),
    }[part];
    return bones.find((b) => re.test(b.name.replace(/\s+/g, ''))) || null;
  };
  const out = [];
  for (const side of ['left', 'right']) {
    const C = side[0].toUpperCase() + side.slice(1);
    let [up, low, end] = await Promise.all(['UpperArm', 'LowerArm', 'Hand'].map((p) => (v1 || v0 ? byVrm(side + p) : null)));
    up ||= byName(side, 'up');
    low ||= byName(side, 'low');
    end ||= byName(side, 'end');
    if (!up || !low || !end || low.parent !== up) continue;
    out.push({ side: C, up, low, end, q0: [up.quaternion.clone(), low.quaternion.clone()] });
  }
  return out.length === 2 ? out : [];
}

const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
// HAND_POSES en unidades del ot (centro = 0, medio ancho/alto = 1, y hacia abajo)
const HCTX = { cx: 0, W: 2, H: 2, mid: 0, mouthY: -0.4, eyeY: -0.7, mw: 0.2, sp: 0.3, pts: null };

/** Gira `bone` (en el espacio del mundo) para que su eje hacia `child` apunte a `dir`, con peso w. */
function aim(bone, child, dir, w) {
  const a = bone.getWorldPosition(_v[0]);
  const cur = child.getWorldPosition(_v[1]).sub(a).normalize();
  const q = _q[0].setFromUnitVectors(cur, dir);
  if (w < 1) q.slerp(_q[2].identity(), 1 - w);
  const pw = bone.parent.getWorldQuaternion(_q[1]);
  bone.quaternion.premultiply(pw.clone().invert().multiply(q).multiply(pw));
  bone.updateMatrixWorld(true);
}

/** Brazos del modelo siguiendo la postura de manos del gesto (sólo si el modelo no trae la animación). */
function tickArms(md, rig, gest, t, rm) {
  const def = gest.def;
  const age = rm ? 0 : t - gest.start;
  const w = EASE.inOut(clamp(Math.min(age / 250, (gest.ms - age) / 300)));
  if (!(w > 0)) return;
  const pose = HAND_POSES[def.hands] || HAND_POSES.rest;
  const rq = rig.getWorldQuaternion(_q[2]).clone();
  rig.updateMatrixWorld(true);
  for (const arm of md.arms) {
    // lado en pantalla: x del hombro en el espacio del ot
    const sx = rig.worldToLocal(arm.up.getWorldPosition(new THREE.Vector3())).x;
    const s = sx >= 0 ? 1 : -1;
    const p = pose(s, age, gest.dir || 1, HCTX);
    const hx = p.x ?? s * p.u;
    const hy = -(p.y ?? p.v);
    const up = new THREE.Vector3(hx - s * 0.55, hy - 0.3, 0.35).normalize().applyQuaternion(rq);
    aim(arm.up, arm.low, up, w);
    const ang = (p.ang || 0) * DEG;
    const low = new THREE.Vector3(s * Math.sin(ang), Math.cos(ang), 0.3).normalize().applyQuaternion(rq);
    aim(arm.low, arm.end, low, w);
  }
}

/**
 * Construye el ot como modelo (llamado desde Character3D.build con la ficha ya resuelta).
 * `this` es la instancia de Character3D.
 */
export function buildModel(s) {
  const m = s._model;
  const L = (this.L = layout(s));
  const W = (this.W = L.box.w * U);
  const H = (this.H = Math.max(L.box.h * U, W) * 1.2);
  this.modelMode = true;
  this.kk = Math.sqrt(W * H) / 1.25;
  this.depth = W * 0.6;
  this.furLen = 0;
  this.plush = false;
  this.maxShells = 0;
  this.pal = { body: s.body.color };
  this.furs = [];
  this.parts = [];
  this.anims = [];
  this.bodyMeshes = [];
  this.eyes = [];
  this.brows = [];
  this.hands = [];
  this.eyeY = H * 0.86;
  this.r3 = W * 0.07;
  this.model = { ex: {}, w: {}, head: null, q0: null, mixer: null, clips: [], idle: null, act: null, ready: false };
  this.fxc = { W, H, D: this.depth, eyeY: this.eyeY, r: this.r3, sp: W * 0.12, mouth: new THREE.Vector3(0, H * 0.78, this.depth * 0.5), low: this.quality === 'low', tears: [] };

  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.002;
  sh.scale.set(W * 1.2, this.depth * 2, 1);
  sh.renderOrder = -1;
  this.shadow = sh;
  this.root.add(sh);

  // caja provisional mientras carga (el encuadre se rehace al llegar el modelo)
  this.bounds = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -this.depth / 2), new THREE.Vector3(W / 2, H, this.depth / 2));
  this.boundsRev = (this.boundsRev || 0) + 1;

  const tok = (this.modelTok = {});
  loadGltf(m.url)
    .then(async (gltf) => {
      if (this.modelTok !== tok) return;
      const scene = gltf.scene;
      const ext = gltf.parser.json.extensions || {};
      if (ext.VRM) scene.rotation.y = Math.PI; // VRM 0.x mira a -z
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        if (!Array.isArray(o.material)) o.userData.ownMaterial = true;
      });
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      if (!(size.y > 0)) throw new Error('empty model');
      scene.position.set(-c.x, -box.min.y, -c.z);
      const holder = new THREE.Group();
      holder.add(scene);
      const k = (H / size.y) * m.scale;
      holder.scale.setScalar(k);
      holder.rotation.y = m.rot * DEG;
      holder.position.y = m.y * H;
      this.rig.add(holder);

      const md = this.model;
      md.ex = await expressionsOf(gltf);
      md.head = await headOf(gltf);
      if (this.modelTok !== tok) return;
      if (md.head) md.q0 = md.head.quaternion.clone();
      md.arms = await armsOf(gltf);
      if (this.modelTok !== tok) return;
      if (gltf.animations.length) {
        md.mixer = new THREE.AnimationMixer(scene);
        md.clips = gltf.animations;
        const idle = md.clips.find((a) => IDLE.test(a.name));
        if (idle) {
          md.idle = md.mixer.clipAction(idle);
          md.idle.play();
        }
        md.mixer.addEventListener('finished', (e) => {
          if (e.action !== md.act) return;
          md.act = null;
          e.action.fadeOut(0.25);
          md.idle?.reset().fadeIn(0.25).play();
        });
      }
      md.ready = true;

      // encuadre y puntos de los efectos con el modelo real
      this.rig.updateMatrixWorld(true);
      const rb = new THREE.Box3().setFromObject(holder);
      this.bounds = rb;
      this.depth = Math.max(0.05, rb.max.z - rb.min.z);
      this.W = Math.max(0.05, rb.max.x - rb.min.x);
      this.shadow.scale.set(this.W * 1.1, this.depth * 1.6, 1);
      if (md.head) {
        const hp = md.head.getWorldPosition(new THREE.Vector3());
        this.rig.worldToLocal(hp);
        this.eyeY = this.fxc.eyeY = hp.y + H * 0.04;
        this.fxc.mouth.set(hp.x, hp.y - H * 0.01, rb.max.z * 0.6);
      }
      this.fxc.W = this.W;
      this.fxc.D = this.depth;
      this.boundsRev++;
    })
    .catch((e) => {
      if (this.modelTok !== tok) return;
      console.warn('[7ots] modelo 3D del mod no disponible:', e?.message || e);
      // sin modelo: un ot normal (la ficha sin el modelo)
      const { _model, ...rest } = s;
      this.modelFailed = m.url;
      this.build({ ...rest, mods: (rest.mods || []).filter((x) => !x.model) });
    });
}

/** Gesto con la animación propia del modelo, si la trae. Devuelve true si la usó. */
export function modelGesture(name) {
  const md = this.model;
  if (!md?.mixer) return false;
  const re = CLIP_FOR[name];
  const clip = re && md.clips.find((a) => re.test(a.name) && !IDLE.test(a.name));
  if (!clip) return false;
  const a = md.mixer.clipAction(clip);
  if (md.act && md.act !== a) md.act.fadeOut(0.2);
  a.reset();
  a.setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = false;
  a.fadeIn(0.2).play();
  md.idle?.fadeOut(0.2);
  md.act = a;
  return true;
}

/** Un frame del ot-modelo (equivale a Character3D.tick). */
export function tickModel(t, dt) {
  const rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const idle = this.opts.idle !== false;
  const md = this.model;
  if (idle && t >= this.nextBlink) {
    if (this.moodName !== 'sleep' && !rm) {
      this.blinkAt = t;
      if (t - this.look.at > 3000 && Math.random() < 0.45) {
        this.look.tx = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 0.9;
        this.look.ty = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 0.5;
      }
    }
    this.nextBlink = t + 1800 + Math.random() * 3600;
  }
  if (this.speech && !this.speech.tick(t)) this.endSpeech();
  const mo = this.mo;
  mo.open = approach(mo.open, mo.target, dt, mo.target > mo.open ? 35 : 70);
  mo.msx = approach(mo.msx, mo.tmsx, dt, 60);
  const look = this.look;
  look.x = rm ? look.tx : approach(look.x, look.tx, dt, 70);
  look.y = rm ? look.ty : approach(look.y, look.ty, dt, 70);
  this.sleepK = approach(this.sleepK, this.moodName === 'sleep' ? 1 : 0, dt, rm ? 1 : 260);

  // gesto: la animación del modelo, o la pose procedural sobre todo el cuerpo
  const pose = { x: 0, y: 0, r: 0, sx: 1, sy: 1, blink: 0 };
  let spin = 0;
  const gest = this.gest;
  if (gest) {
    const age = t - gest.start;
    const tt = clamp(age / gest.ms);
    if (gest.clip === undefined) gest.clip = md.ready && this.modelGesture(gest.name);
    if (!gest.clip) {
      Object.assign(pose, gest.def.pose(tt, rm ? 0 : age, gest));
      if (gest.dir < 0) { pose.x = -pose.x; pose.r = -pose.r; }
      pose.sx = 1 + (pose.sx - 1) * 0.4; // un muñeco se aplasta menos que un ot
      pose.sy = 1 + (pose.sy - 1) * 0.4;
      if (gest.name === 'spin') spin = EASE.inOut(clamp((tt - 0.12) / 0.76)) * TAU;
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
  const { ksx, ksy } = this.tickMorphs(t, rm);

  const W = this.W;
  const H = this.H;
  const sec = t / 1000;
  const breath = rm || !idle || md.idle ? 0 : Math.sin(sec * TAU / 3.4 + this.phase);
  const rig = this.rig;
  rig.position.set(pose.x * W, -pose.y * H, 0);
  rig.rotation.set(md.head ? 0 : look.y * 0.1, this.yaw + look.x * (md.head ? 0.12 : 0.3) + spin + (rm || !idle ? 0 : Math.sin(sec * 0.7 + this.phase) * 0.03), -(pose.r + look.x * 1.5) * DEG);
  rig.scale.set(pose.sx * ksx * (1 - 0.004 * breath), pose.sy * ksy * (1 + 0.01 * breath), pose.sx * ksx);
  const air = Math.max(0, -pose.y);
  this.shadow.material.opacity = 1 - air * 1.5;

  // animaciones y cabeza
  if (md.head && md.q0) md.head.quaternion.copy(md.q0);
  for (const a of md.arms || []) { a.up.quaternion.copy(a.q0[0]); a.low.quaternion.copy(a.q0[1]); }
  md.mixer?.update(rm ? 0 : dt / 1000);
  if (gest && !gest.clip && gest.def.hands && md.arms?.length) tickArms(md, rig, gest, t, rm);
  if (md.head && md.head.parent) {
    const pw = md.head.parent.getWorldQuaternion(new THREE.Quaternion());
    const rw = rig.getWorldQuaternion(new THREE.Quaternion());
    const d = new THREE.Quaternion().setFromEuler(new THREE.Euler(look.y * 0.35, look.x * 0.55, 0, 'YXZ'));
    d.premultiply(rw).multiply(rw.clone().invert()); // giro en el espacio del ot
    md.head.quaternion.premultiply(pw.clone().invert().multiply(d).multiply(pw));
  }

  // expresiones
  const blink = Math.max(this.blinkValue(t), pose.blink, this.sleepK > 0.02 ? Math.min(1, this.sleepK * 1.1) : 0);
  const round = clamp((1 - mo.msx) / 0.35);
  const want = { ...(MOOD_EXPR[this.moodName] || {}) };
  for (const k in md.w) if (!(k in want)) want[k] = 0;
  for (const k in want) md.w[k] = rm ? want[k] : approach(md.w[k] || 0, want[k], dt, 120);
  const val = { ...md.w, blink: Math.max(blink, md.w.blink || 0), aa: mo.open * (md.ex.oh ? 1 - round : 1), oh: mo.open * round };
  if (val.happy > 0.3) val.blink = Math.max(val.blink * (1 - val.happy), 0); // VRM: happy ya entrecierra los ojos
  const touched = new Set();
  for (const name in md.ex) for (const b of md.ex[name]) if (!touched.has(b)) { b.mesh.morphTargetInfluences[b.index] = 0; touched.add(b); }
  for (const name in md.ex) {
    const v = val[name] || 0;
    if (!v) continue;
    for (const b of md.ex[name]) b.mesh.morphTargetInfluences[b.index] = Math.min(1, b.mesh.morphTargetInfluences[b.index] + v * b.w);
  }

  this.tickEffects(t, rm);
  this.fxg.position.copy(rig.position);
  this.fxg.rotation.y = this.yaw;
}
