/**
 * 7ots en 3D — API pública.
 *
 *   import { createCharacter3D, createCrowd3D } from '/src/character3d/index.js';
 *   const ot = createCharacter3D(el, look.character);   // misma spec que el 2D
 *   ot.gesture('wave'); ot.mood('happy'); ot.speak('Hello!'); ot.lookAtPoint(x, y);
 *
 * Todas las vistas comparten un único renderer/canvas (stage.js). Requiere el importmap de
 * three en la página (ver stage.js).
 */

import * as THREE from 'three';
import { getStage } from './stage.js';
import { Character3D, MOODS_3D, GESTURES_3D, MORPHS_3D, EFFECTS_3D } from './Character3D.js';
import { createCharacter } from '../character/Character.js';
import { backdropCSS, styleSeed } from '../character/styles.js';

export { getStage, Character3D, MOODS_3D, GESTURES_3D, MORPHS_3D, EFFECTS_3D };

/** ¿Hay WebGL? Sin él (GPU en lista negra, aceleración desactivada) se usa el ot 2D. */
let glOk = null;
export function webglAvailable() {
  if (glOk !== null) return glOk;
  try {
    const c = document.createElement('canvas');
    glOk = !!c.getContext('webgl2');
  } catch {
    glOk = false;
  }
  return glOk;
}

/** Plan B 2D con la misma API (createCharacter de Character.js). */
function fallback2D(el, spec) {
  const c = createCharacter(el, spec);
  c.fallback = true;
  return c;
}

const v3 = new THREE.Vector3();

/** Posición en pantalla (cliente) de la cara de un personaje en una vista. */
function screenOf(view, ch) {
  const r = view.vrect || view.rect || view.el.getBoundingClientRect(); // the projection spans the drawn area (bleed)
  ch.root.updateMatrixWorld();
  v3.set(0, ch.H * 0.6, 0).applyMatrix4(ch.root.matrixWorld).project(view.camera);
  return { x: r.left + ((v3.x + 1) / 2) * r.width, y: r.top + ((1 - v3.y) / 2) * r.height };
}

/** Altura en píxeles de un personaje (para el LOD del pelo). */
function pixelHeight(view, ch) {
  const r = view.rect;
  if (!r) return 300;
  const cam = view.camera;
  const d = Math.max(0.1, cam.position.distanceTo(ch.root.getWorldPosition(v3)));
  return ((ch.H * ch.root.scale.y) / d) * (r.height / 2 / Math.tan((cam.fov * Math.PI) / 360));
}

function api(view, ch, extra = {}) {
  return {
    character: ch,
    gesture: (name, o) => ch.gesture(name, o),
    mood: (name, o) => ch.mood(name, o),
    lookAt: (x, y) => ch.lookAt(x, y),
    lookAtPoint: (x, y) => ch.lookAtPoint(x, y),
    speak: (text, o) => ch.speak(text, o),
    lipsync: (analyser, o) => ch.lipsync(analyser, o),
    stopSpeaking: () => ch.stopSpeaking(),
    morph: (name, o) => ch.morph(name, o),
    unmorph: (name) => ch.unmorph(name),
    effect: (name, o) => ch.effect(name, o),
    clearEffects: (name) => ch.clearEffects(name),
    mouth: (v) => ch.mouth(v),
    viseme: (id, open) => ch.viseme(id, open),
    blink: () => ch.blink(),
    get spec() { return ch.spec; },
    get state() { return ch.state; },
    ...extra,
  };
}

/**
 * Una vista con un personaje que se encuadra solo en `el`.
 * @param {HTMLElement} el contenedor (define tamaño y posición en la página)
 * @param {object} spec look.character
 * @param {object} [opts] { material: 'plush'|'vinyl'|'auto', moodFx, quality: 'high'|'low', orbit: true, stage: {...} }
 */
export function createCharacter3D(el, spec, opts = {}) {
  if (!webglAvailable()) return fallback2D(el, spec);
  const stage = getStage(opts.stage);
  const scene = stage.makeScene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 28, 1, 0.05, 50);
  const ch = new Character3D(spec, { quality: opts.quality || 'high', material: opts.material || 'plush', moodFx: opts.moodFx });
  scene.add(ch.root);
  let aspect = 0;
  let rev = ch.boundsRev;
  const frame = () => {
    const b = ch.bounds;
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    const half = (camera.fov * Math.PI) / 360;
    const fitH = (size.y * 0.5 * 1.12) / Math.tan(half);
    const fitW = (Math.max(size.x, size.z) * 0.5 * 1.2) / (Math.tan(half) * camera.aspect);
    const dist = Math.max(fitH, fitW) + size.z * 0.5;
    camera.position.set(c.x, c.y + dist * 0.12, c.z + dist);
    camera.lookAt(c.x, c.y * 0.96, 0);
    camera.updateProjectionMatrix();
  };
  const view = {
    el,
    scene,
    camera,
    characters: [ch],
    rect: null,
    bleed: opts.bleed || 0,
    tick(t, dt) {
      const a = this.rect.width / this.rect.height;
      if (Math.abs(a - aspect) > 1e-3 || rev !== ch.boundsRev) {
        aspect = a;
        rev = ch.boundsRev; // un mod de cuerpo completo cambia la caja al cargar su modelo
        camera.aspect = a;
        frame();
      }
      if (!dragging) ch.yaw *= Math.exp(-dt / 900); // vuelve de frente al soltar
      ch.tick(t, dt);
      ch.lod(pixelHeight(this, ch));
    },
    screenOf: (c) => screenOf(view, c),
  };
  ch.view = view;
  stage.addView(view);

  // fondo del estilo artístico detrás del lienzo (el render es transparente), como en el 2D
  const bg0 = el.style.background;
  const backdrop = () => {
    if (opts.backdrop === false) return;
    const st = ch.spec.style;
    const url = st && st !== 'none' ? backdropCSS(st, styleSeed(ch.spec)) : '';
    el.style.background = url ? `${url} center bottom / cover no-repeat` : bg0;
  };
  backdrop();

  // arrastrar para girar
  let dragging = false;
  let lastX = 0;
  const down = (e) => { dragging = true; lastX = e.clientX; el.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (!dragging) return; ch.yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; };
  const up = () => { dragging = false; };
  if (opts.orbit !== false) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.style.touchAction = el.style.touchAction || 'pan-y';
    el.style.cursor = el.style.cursor || 'grab';
  }

  return api(view, ch, {
    stage,
    update(next, o = {}) {
      if (o.material) ch.opts.material = o.material;
      ch.update(next);
      backdrop();
      aspect = 0;
    },
    destroy() {
      stage.removeView(view);
      el.style.background = bg0;
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      ch.dispose();
    },
  });
}

/**
 * Muchos personajes en UNA escena y UNA cámara (un render para todo el grupo).
 * @param {HTMLElement} el
 * @param {object} [opts] { material, quality: 'low', fov, stage }
 */
export function createCrowd3D(el, opts = {}) {
  if (!webglAvailable()) {
    // plan B: rejilla de ots 2D
    el.style.display = 'flex';
    el.style.flexWrap = 'wrap';
    el.style.alignContent = 'center';
    el.style.justifyContent = 'center';
    const list = [];
    return {
      fallback: true,
      characters: list,
      add(spec) {
        const box = document.createElement('div');
        box.style.cssText = 'width:84px;height:84px';
        el.append(box);
        const c = createCharacter(box, spec);
        list.push(c);
        return c;
      },
      clear() { list.forEach((c) => c.destroy()); list.length = 0; el.textContent = ''; },
      lookAtPoint(x, y) { for (const c of list) c.lookAtPoint(x, y); },
      gesture(name, o) { list.forEach((c, i) => setTimeout(() => c.gesture(name, o), i * 25)); },
      mood(name) { for (const c of list) c.mood(name); },
      effect(name, o) { list.forEach((c, i) => setTimeout(() => c.effect(name, o), i * 25)); },
      morph(name, o) { list.forEach((c, i) => setTimeout(() => c.morph(name, o), i * 25)); },
      unmorph(name) { for (const c of list) c.unmorph(name); },
      refit() {},
      destroy() { this.clear(); },
    };
  }
  const stage = getStage(opts.stage);
  const scene = stage.makeScene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 32, 1, 0.1, 100);
  const chars = [];
  let aspect = 0;
  const target = new THREE.Vector3();
  const fit = () => {
    const box = new THREE.Box3();
    for (const c of chars) { c.root.updateMatrixWorld(); box.union(c.bounds.clone().applyMatrix4(c.root.matrixWorld)); }
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    box.getCenter(target);
    const half = (camera.fov * Math.PI) / 360;
    const dist = Math.max((size.y * 0.6) / Math.tan(half), (size.x * 0.58) / (Math.tan(half) * camera.aspect)) + size.z * 0.2;
    camera.position.set(target.x, target.y + dist * 0.42, target.z + dist * 0.92);
    camera.lookAt(target.x, target.y * 0.5, target.z + size.z * 0.08);
    camera.updateProjectionMatrix();
  };
  const view = {
    el,
    scene,
    camera,
    characters: chars,
    rect: null,
    tick(t, dt) {
      const a = this.rect.width / this.rect.height;
      if (Math.abs(a - aspect) > 1e-3) {
        aspect = a;
        camera.aspect = a;
        fit();
      }
      if (chars.some((c) => c.boundsRev !== c.seenRev)) {
        for (const c of chars) c.seenRev = c.boundsRev;
        fit();
      }
      for (const c of chars) {
        c.tick(t, dt);
        c.lod(pixelHeight(this, c));
      }
    },
    screenOf: (c) => screenOf(view, c),
  };
  stage.addView(view);
  return {
    stage,
    camera,
    characters: chars,
    /** Añade un personaje en (x, z) del suelo. */
    add(spec, p = {}) {
      const c = new Character3D(spec, { quality: opts.quality || 'low', material: opts.material || 'plush', moodFx: opts.moodFx });
      c.view = view;
      c.root.position.set(p.x || 0, 0, p.z || 0);
      c.root.rotation.y = p.rotY || 0;
      if (p.scale) c.root.scale.setScalar(p.scale);
      scene.add(c.root);
      chars.push(c);
      aspect = 0;
      return api(view, c);
    },
    clear() {
      for (const c of chars) c.dispose();
      chars.length = 0;
    },
    lookAtPoint(x, y) { for (const c of chars) c.lookAtPoint(x, y); },
    gesture(name, o) { chars.forEach((c, i) => setTimeout(() => c.gesture(name, o), i * 25)); },
    mood(name) { for (const c of chars) c.mood(name); },
    effect(name, o) { chars.forEach((c, i) => setTimeout(() => c.effect(name, o), i * 25)); },
    morph(name, o) { chars.forEach((c, i) => setTimeout(() => c.morph(name, o), i * 25)); },
    unmorph(name) { for (const c of chars) c.unmorph(name); },
    refit() { aspect = 0; },
    destroy() {
      stage.removeView(view);
      this.clear();
    },
  };
}
