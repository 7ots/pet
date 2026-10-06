/**
 * Escenario 3D compartido de 7ots: UN solo WebGLRenderer (un único canvas fijo que cubre la
 * ventana, sin eventos de puntero) que dibuja todas las «vistas» de la página con scissor.
 *
 * Una vista = un elemento del DOM + su escena + su cámara + los personajes que contiene.
 * `createCharacter3D(el, spec)` crea una vista con un personaje; `createCrowd3D(el)` crea una
 * vista con muchos personajes en la misma escena (un solo render para todo el grupo).
 *
 * Rendimiento:
 *   - un contexto WebGL para toda la página (nunca uno por personaje);
 *   - devicePixelRatio con tope (`maxDpr`, 1.5 por defecto) y resolución adaptativa: si los FPS
 *     bajan de ~50 se reduce el DPR a pasos, y se recupera cuando sobra margen;
 *   - las vistas fuera de pantalla (IntersectionObserver) ni se animan ni se dibujan;
 *   - con la pestaña oculta el bucle se detiene del todo;
 *   - entorno (RoomEnvironment → PMREM) generado una vez y compartido por todas las escenas.
 *
 * Requisito: la página debe declarar el importmap de three (igual que src/avatar/AvatarStage.js):
 *   <script type="importmap">{ "imports": {
 *     "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
 *     "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }</script>
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const stages = new Map();

/**
 * Escenario compartido (se crea la primera vez). `opts.key` separa escenarios: el widget usa
 * el suyo ('overlay', con zIndex por encima de su panel) para no pelear con el de la página.
 */
export function getStage(opts = {}) {
  const k = opts.key || 'page';
  if (!stages.has(k)) stages.set(k, new Stage(opts));
  return stages.get(k);
}

class Stage {
  constructor(opts) {
    // supersample: render above the screen's own density (a small canvas, e.g. the desktop pet, looks
    // crisp at 2× on a 1× screen for little cost)
    this.maxDpr = opts.supersample ? opts.maxDpr || 2 : Math.min(opts.maxDpr || 1.5, window.devicePixelRatio || 1);
    this.minDpr = Math.min(opts.minDpr || 0.75, this.maxDpr);
    this.dpr = this.maxDpr;
    this.adaptive = opts.adaptive !== false;
    const canvas = document.createElement('canvas');
    canvas.className = 'ots3d-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:${opts.zIndex ?? 1};display:block`;
    (opts.parent || document.body).appendChild(canvas);
    this.canvas = canvas;

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(this.dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    r.info.autoReset = false;
    r.autoClear = false;
    this.renderer = r;

    const pm = new THREE.PMREMGenerator(r);
    this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    this.views = new Set();
    this.visible = new Set();
    this.raf = 0;
    this.last = 0;
    this.stats = { fps: 0, ms: 0, calls: 0, triangles: 0, dpr: this.dpr, views: 0, characters: 0 };
    this._frames = 0;
    this._acc = 0;
    this._statT = 0;
    this._good = 0;
    this._w = 0;
    this._h = 0;

    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target.__ots3dView;
        if (!v) continue;
        if (e.isIntersecting) this.visible.add(v);
        else this.visible.delete(v);
      }
      this.wake();
    }, { rootMargin: '64px' });
    this._vis = () => (document.hidden ? this.sleep() : this.wake());
    document.addEventListener('visibilitychange', this._vis);
  }

  /** Escena estándar de estudio: entorno compartido + luz principal cálida, contraluz frío y relleno. */
  makeScene() {
    const scene = new THREE.Scene();
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.75;
    scene.add(new THREE.HemisphereLight(0xe8ecff, 0x40304e, 0.7));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(2.2, 3.4, 3.2);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 2.2);
    rim.position.set(-2.6, 2.2, -3.0);
    const fill = new THREE.DirectionalLight(0xffe6f4, 0.5);
    fill.position.set(-3, 0.5, 2);
    scene.add(key, rim, fill);
    return scene;
  }

  addView(view) {
    this.views.add(view);
    view.el.__ots3dView = view;
    this.io.observe(view.el);
    this.wake();
  }

  removeView(view) {
    this.views.delete(view);
    this.visible.delete(view);
    this.io.unobserve(view.el);
    delete view.el.__ots3dView;
    if (!this.visible.size) this.clear();
  }

  /** Borra el canvas: sin vistas el bucle se duerme, y el último cuadro quedaría pegado encima de la página. */
  clear() {
    this.sleep();
    this.renderer.setScissorTest(false);
    this.renderer.clear();
  }

  wake() {
    if (this.raf || document.hidden || !this.visible.size) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  sleep() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = this.renderer;
    if (w !== this._w || h !== this._h || r.getPixelRatio() !== this.dpr) {
      this._w = w;
      this._h = h;
      r.setPixelRatio(this.dpr);
      r.setSize(w, h, false);
    }
  }

  frame(t) {
    this.raf = 0;
    if (document.hidden) return;
    // una vista cuyo elemento salió del DOM sin destroy() (la vista cambió por innerHTML) no se dibuja más
    for (const v of this.visible) if (!v.el.isConnected) this.visible.delete(v);
    if (!this.visible.size) return this.clear();
    const dt = Math.min(64, Math.max(0, t - this.last));
    this.last = t;
    const t0 = performance.now();
    this.resize();
    const r = this.renderer;
    r.info.reset();
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);
    let chars = 0;
    for (const v of this.visible) {
      const rect = v.el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > this._h || rect.right < 0 || rect.left > this._w || rect.width < 2 || rect.height < 2) continue;
      v.rect = rect;
      v.tick(t, dt);
      chars += v.characters.length;
      // bleed: draws past the element's box (the whole window with 'window') at the same scale, so effects
      // that rise above the head or fly to the sides aren't cut at the box's edge
      let e = rect;
      if (v.bleed) {
        const b = v.bleed === 'window' ? null : v.bleed;
        e = b == null ? { left: 0, top: 0, width: this._w, height: this._h } : { left: rect.left - b, top: rect.top - b, width: rect.width + 2 * b, height: rect.height + 2 * b };
        v.camera.setViewOffset(rect.width, rect.height, e.left - rect.left, e.top - rect.top, e.width, e.height);
      }
      v.vrect = e;
      const bottom = this._h - (e.top + e.height);
      r.setViewport(e.left, bottom, e.width, e.height);
      r.setScissor(e.left, bottom, e.width, e.height);
      r.render(v.scene, v.camera);
    }
    // estadísticas y resolución adaptativa
    this._frames++;
    this._acc += performance.now() - t0;
    if (t - this._statT > 1000) {
      const secs = (t - this._statT) / 1000;
      const fps = this._statT ? this._frames / secs : 60;
      Object.assign(this.stats, {
        fps: Math.round(fps), ms: Math.round((this._acc / this._frames) * 10) / 10, calls: r.info.render.calls,
        triangles: r.info.render.triangles, dpr: this.dpr, views: this.visible.size, characters: chars,
      });
      if (this.adaptive && this._statT) {
        if (fps < 48 && this.dpr > this.minDpr) { this.dpr = Math.max(this.minDpr, Math.round((this.dpr - 0.25) * 100) / 100); this._good = 0; }
        else if (fps > 57 && this.dpr < this.maxDpr && ++this._good >= 3) { this.dpr = Math.min(this.maxDpr, this.dpr + 0.25); this._good = 0; }
      }
      this._statT = t;
      this._frames = 0;
      this._acc = 0;
    }
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
  }
}
