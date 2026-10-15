/**
 * La habitación del ot: una pieza 3D (ventana con haz de luz, sofá, alfombra, cama, escritorio con la
 * plaza, planta) donde el ot vive solo — elige un lugar, camina, hace su cosa — o lo manejas tú
 * (WASD/flechas, clic en el suelo, cruceta en táctil, E para usar el lugar más cercano).
 *
 *   const room = createRoom3D(el, look.character, { name: 'Din', locale: 'es', onEdit: () => … });
 *   room.message('Hola!');   // corre al escritorio a «leerlo»
 *   room.react('plaza');     // revisa la plaza
 *   room.setTheme('gothic');  // otro tipo de casa (ROOM_THEMES), mismos lugares
 *   room.setSpec(spec); room.setName('Din'); room.say('…'); room.setMode('ctl'); room.destroy();
 *
 * Usa su propio renderer y canvas DENTRO de `el` (no el stage compartido, que es un canvas fijo encima
 * de la página): así el HUD queda sobre el 3D aunque el contenedor viva en otro contexto de apilamiento.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Character3D } from './Character3D.js';
import { buildRoom, ROOM_THEMES, DEFAULT_ROOM_THEME } from './room-themes.js';
import '../i18n/messages/creator.js';
import { translator } from '../i18n/index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const OT_H = 1.3;

// lugares de la pieza: dónde se para, hacia dónde mira y, si se sube, a qué altura
const POIS = {
  window: { at: [-1.2, -3.0], face: Math.PI },
  sofa: { at: [-3.2, 0.5], seat: [-4.15, 0.66, 0.5], face: Math.PI / 2 },
  rug: { at: [0.6, 0.9], face: 0.35 },
  bed: { at: [1.9, -2.2], seat: [3.55, 0.68, -2.3], face: 0.3 },
  desk: { at: [0.95, -2.75], face: Math.PI },
  plant: { at: [-3.5, -2.6], face: -2.3 },
  front: { at: [0.9, 2.0], face: 0.25 },
};
// obstáculos (cajas en el suelo) para cuando lo controlas tú
const BLOCKS = [[-5, -0.95, -3.7, 1.95], [-4.75, -1.85, -3.85, -1.05], [2.45, -4, 4.65, -0.95], [0, -4, 2.05, -3.0], [-4.8, -3.85, -3.9, -2.95]];
const BOUNDS = [-4.6, 4.6, -3.6, 3.6];
const RAD = 0.32;

const CSS = `
.otr{position:relative;overflow:hidden;border-radius:inherit;min-height:260px;background:#2a1f55;outline:none;--otr-glass:rgb(10 7 32 / .62);--otr-line:rgb(255 255 255 / .14);--otr-accent:#ffd23f;--otr-accent-ink:#1a1240;color:#f4f1ff}
.otr canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
.otr button{font:inherit;color:inherit;cursor:pointer}
.otr-hud{position:absolute;z-index:2;left:12px;right:12px;top:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;pointer-events:none}
.otr-hud>*{pointer-events:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.otr-btn{border:1px solid var(--otr-line);background:var(--otr-glass);backdrop-filter:blur(6px);border-radius:999px;padding:6px 12px;font-weight:600;font-size:13px}
.otr-btn:hover{background:rgb(40 30 90 / .75)}
.otr-who{padding:6px 12px;border-radius:999px;background:var(--otr-glass);backdrop-filter:blur(6px);color:rgb(244 241 255 / .7);font-size:13px}
.otr-who b{color:#fff}
.otr-seg{display:flex;padding:3px;border-radius:999px;background:var(--otr-glass);backdrop-filter:blur(6px);border:1px solid var(--otr-line)}
.otr-seg button{border:0;background:none;padding:5px 12px;border-radius:999px;color:rgb(244 241 255 / .7);font-weight:600;font-size:13px}
.otr-seg button[aria-pressed=true]{background:var(--otr-accent);color:var(--otr-accent-ink)}
.otr-bubble{position:absolute;z-index:3;transform:translate(-50%,-100%);max-width:min(240px,70%);padding:7px 12px;border-radius:16px;background:#fff;color:#1a1240;font-weight:600;font-size:13px;line-height:1.3;box-shadow:0 8px 24px rgb(0 0 0 / .3);pointer-events:none}
.otr-bubble::after{content:"";position:absolute;left:50%;bottom:-6px;width:12px;height:12px;background:#fff;transform:translateX(-50%) rotate(45deg)}
.otr-keys{position:absolute;z-index:2;left:50%;bottom:12px;transform:translateX(-50%);margin:0;padding:6px 12px;border-radius:999px;background:var(--otr-glass);color:rgb(244 241 255 / .75);font-size:12px;white-space:nowrap}
.otr-prompt{position:absolute;z-index:2;left:50%;bottom:52px;transform:translateX(-50%);margin:0;padding:6px 14px;border-radius:999px;background:var(--otr-accent);color:var(--otr-accent-ink);font-weight:700;font-size:13px;white-space:nowrap}
.otr-pad{pointer-events:auto;position:absolute;z-index:2;right:12px;bottom:12px;display:grid;grid-template:repeat(3,44px)/repeat(3,44px);gap:5px}
.otr-pad button{border-radius:12px;border:1px solid var(--otr-line);background:var(--otr-glass);font-size:16px;touch-action:none;user-select:none;-webkit-user-select:none}
.otr-pad button:active{background:rgb(139 123 255 / .45)}
.otr-pad [data-d=up]{grid-area:1/2}.otr-pad [data-d=left]{grid-area:2/1}.otr-pad [data-d=use]{grid-area:2/2;background:rgb(255 210 63 / .25)}.otr-pad [data-d=right]{grid-area:2/3}.otr-pad [data-d=down]{grid-area:3/2}
.otr [hidden]{display:none!important}
.otr.compact .otr-who,.otr.compact .otr-keys{display:none!important}
.otr.compact .otr-prompt{bottom:12px;left:12px;transform:none}
`;
let cssDone = false;
const injectCss = () => {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.dataset.ots = 'room3d';
  s.textContent = CSS;
  document.head.appendChild(s);
};

const disposeTree = (o) => o.traverse((m) => {
  m.geometry?.dispose?.();
  for (const mat of [].concat(m.material || [])) {
    for (const v of Object.values(mat)) if (v?.isTexture) v.dispose();
    mat.dispose?.();
  }
});

/**
 * @param {HTMLElement} el contenedor (se le da position:relative; el alto lo pone la página)
 * @param {object} spec look.character
 * @param {{ name?: string, locale?: string, controls?: boolean, compact?: boolean, demo?: boolean, onEdit?: ()=>void, maxDpr?: number, theme?: string }} [opts]
 *   controls=false: solo se mueve solo (sin HUD de modo). demo: botón «Mensaje» que simula uno.
 */
export { ROOM_THEMES, DEFAULT_ROOM_THEME };

export function createRoom3D(el, spec, opts = {}) {
  injectCss();
  const t = translator(opts.locale);
  let name = opts.name || 'ot';
  const controls = opts.controls !== false;
  const coarse = matchMedia('(hover: none)').matches;

  el.classList.add('otr');
  el.classList.toggle('compact', !!opts.compact);
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  box.innerHTML = `
    <div class="otr-bubble" data-bubble hidden></div>
    <div class="otr-hud">
      <div>${opts.onEdit ? `<button type="button" class="otr-btn" data-edit>✎ ${esc(t('room.edit'))}</button>` : ''}<span class="otr-who"><b data-name></b> <span data-doing>${esc(t('room.inRoom'))}</span></span></div>
      <div>${opts.demo ? `<button type="button" class="otr-btn" data-msg title="${esc(t('room.messageHint'))}">📩 ${esc(t('room.message'))}</button>` : ''}${controls ? `<div class="otr-seg" role="group"><button type="button" data-mode="auto" aria-pressed="true">🧠 ${esc(t('room.auto'))}</button><button type="button" data-mode="ctl" aria-pressed="false">🎮 ${esc(t('room.control'))}</button></div>` : ''}</div>
    </div>
    <p class="otr-keys" data-keys hidden>${esc(t('room.keys'))}</p>
    <p class="otr-prompt" data-prompt hidden></p>
    <div class="otr-pad" data-pad hidden>${['up', 'left', 'use', 'right', 'down'].map((d) => `<button type="button" data-d="${d}" aria-label="${esc(t(`room.pad.${d}`))}">${{ up: '▲', left: '◀', use: 'E', right: '▶', down: '▼' }[d]}</button>`).join('')}</div>`;
  const $ = (s) => box.querySelector(s);
  $('[data-name]').textContent = name;

  // renderer propio
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', t('room.inRoom'));
  el.append(canvas, box);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(opts.maxDpr || 1.5, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const pm = new THREE.PMREMGenerator(renderer);
  const envTarget = pm.fromScene(new RoomEnvironment(), 0.04);
  pm.dispose();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a1f55');
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.45;
  const hemi = new THREE.HemisphereLight(0xe8ecff, 0x40304e, 0.56);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.4 * 0.55);
  key.position.set(2.2, 3.4, 3.2);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 2.2 * 0.55);
  rim.position.set(-2.6, 2.2, -3.0);
  const fill = new THREE.DirectionalLight(0xffe6f4, 0.5 * 0.55);
  fill.position.set(-3, 0.5, 2);
  const amb = new THREE.AmbientLight('#ffe9d6', 0.25);
  scene.add(hemi, key, rim, fill, amb);
  let env = null;
  // el tipo de casa: rehace la pieza (mismos lugares y obstáculos) y descarta la anterior
  const applyTheme = (id) => {
    if (env) { scene.remove(env.group); disposeTree(env.group); }
    env = buildRoom(scene, id);
    const L = env.look;
    scene.background.set(L.bg);
    el.style.background = L.bg;
    scene.environmentIntensity = L.env;
    renderer.toneMappingExposure = L.exposure;
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    amb.color.set(L.amb[0]); amb.intensity = L.amb[1];
    key.intensity = 2.4 * 0.55 * L.key; rim.intensity = 2.2 * 0.55 * L.key; fill.intensity = 0.5 * 0.55 * L.key;
  };
  applyTheme(opts.theme || DEFAULT_ROOM_THEME);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);

  let ch = null;
  const pos = new THREE.Vector3(0.9, 0, 2.0);
  let heading = 0.2, wantHeading = 0.2, baseY = 0, bob = 0, walking = 0, speedK = 1;
  let nav = null, hop = null, seated = null;
  let mode = 'auto';
  const keys = new Set();
  const camT = new THREE.Vector3(-0.4, 0.6, -0.6);

  const bubble = $('[data-bubble]');
  let bubbleUntil = 0;
  const say = (text, ms = 2600) => { bubble.textContent = text; bubble.hidden = false; bubbleUntil = performance.now() + ms; };
  const doing = (s) => { $('[data-doing]').textContent = s; };

  const build = (s) => {
    if (ch) { scene.remove(ch.root); ch.dispose(); }
    ch = new Character3D(s, { quality: 'high', material: opts.material || 'plush' });
    ch.root.scale.setScalar(OT_H / ch.H);
    scene.add(ch.root);
  };

  // movimiento
  const angTo = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  const blocked = (x, z) => x < BOUNDS[0] || x > BOUNDS[1] || z < BOUNDS[2] || z > BOUNDS[3] || BLOCKS.some(([x0, z0, x1, z1]) => x > x0 - RAD && x < x1 + RAD && z > z0 - RAD && z < z1 + RAD);
  const walkTo = (x, z, sp = 1) => new Promise((res) => { nav = { x, z, sp, res }; });
  const hopTo = (to, ms = 520) => new Promise((res) => { hop = { from: new THREE.Vector3(pos.x, baseY, pos.z), to: new THREE.Vector3(...to), t0: performance.now(), ms, res }; });
  const leaveSeat = async () => {
    if (!seated) return;
    const p = seated;
    seated = null;
    if (ch.moodName === 'sleep') ch.mood('neutral'); // taken out of bed mid-nap: it wakes up (eyes open) before moving
    await hopTo([p.at[0], 0, p.at[1]]);
  };

  // piloto automático: elige un lugar, camina, hace su cosa, repite
  let job = 0;
  const timers = new Set();
  const wait = (ms) => new Promise((r) => { const id = setTimeout(() => { timers.delete(id); r(); }, ms); timers.add(id); });
  const run = (fn) => { const id = ++job; nav = null; fn(() => id !== job).catch(() => {}); };
  const guard = (dead) => async (p) => { const v = await p; if (dead()) throw 0; return v; };
  async function act(id, dead, { hurry = false, line = null } = {}) {
    const g = guard(dead);
    const p = POIS[id];
    await g(leaveSeat());
    ch.mood('neutral');
    doing(t(hurry ? 'room.run' : 'room.walk'));
    await g(walkTo(p.at[0], p.at[1], hurry ? 2.2 : 1));
    wantHeading = p.face;
    doing(t(`room.doing.${id}`));
    await g(wait(350));
    if (p.seat) { seated = p; await g(hopTo(p.seat)); wantHeading = p.face; }
    if (id === 'window') { ch.gesture('think'); say(t('room.say.window')); await g(wait(3200)); ch.effect('sparkles'); await g(wait(2400)); }
    else if (id === 'sofa') { ch.mood('happy'); await g(wait(2200)); ch.gesture('yawn'); say(t('room.say.sofa')); await g(wait(4200)); }
    else if (id === 'rug') { for (const m of ['dance', 'groove', 'disco'].sort(() => Math.random() - 0.5).slice(0, 2)) { ch.gesture(m); ch.effect('notes'); await g(wait(2600)); } }
    else if (id === 'bed') { ch.mood('sleep'); say('zzz…', 1800); for (let i = 0; i < 4; i++) { ch.effect('zzz'); await g(wait(2200)); } ch.mood('neutral'); ch.gesture('yawn'); await g(wait(1600)); }
    else if (id === 'desk') { ch.gesture('think'); ch.effect('thought'); say(line || t('room.say.desk')); await g(wait(3400)); ch.gesture('nod'); await g(wait(1600)); }
    else if (id === 'plant') { ch.gesture('point'); say(t('room.say.plant')); await g(wait(2800)); ch.effect('hearts'); await g(wait(1400)); }
    else if (id === 'front') { ch.gesture('wave'); say(t('room.say.hello', { name })); await g(wait(2600)); }
  }
  let last = 'front';
  const autopilot = (skipHello) => run(async (dead) => {
    const g = guard(dead);
    if (!skipHello) await g(act('front', dead));
    for (;;) {
      const o = Object.keys(POIS).filter((k) => k !== last);
      last = o[Math.floor(Math.random() * o.length)];
      await g(act(last, dead));
      ch.mood('neutral');
      await g(wait(600 + Math.random() * 1200));
    }
  });
  const resume = () => { if (mode === 'auto') autopilot(true); else doing(t('room.you')); };
  /** Le llega un mensaje: se sobresalta, corre al escritorio, lo «lee» y lo responde. */
  const message = (text) => run(async (dead) => {
    const g = guard(dead);
    ch.effect('exclaim');
    ch.gesture('surprise');
    say(t('room.say.gotMsg'), 2200);
    await g(wait(900));
    await g(act('desk', dead, { hurry: true, line: text ? `«${String(text).slice(0, 90)}»` : null }));
    ch.mood('happy');
    ch.gesture('thumbsup');
    say(t('room.say.replied'));
    await g(wait(2400));
    resume();
  });
  /** Reacciones a lo que pasa fuera: 'plaza' (actividad en la plaza), 'poke', o cualquier efecto 3D. */
  const react = (kind, text) => {
    if (kind === 'message') return message(text);
    if (kind === 'plaza') return run(async (dead) => { await guard(dead)(act('desk', dead, { line: text || null })); resume(); });
    if (kind === 'poke') { ch.gesture('wave'); ch.effect('hearts'); return say(text || t('room.say.hello', { name })); }
    ch.effect(kind);
    if (text) say(text);
  };

  // modo control
  const near = () => {
    let best = null, bd = 1.3;
    for (const [k, p] of Object.entries(POIS)) { const d = Math.hypot(pos.x - p.at[0], pos.z - p.at[1]); if (d < bd) { bd = d; best = k; } }
    return best;
  };
  const use = () => {
    if (mode !== 'ctl') return;
    if (seated) return run(async (dead) => { await guard(dead)(leaveSeat()); ch.mood('neutral'); });
    const k = near();
    if (k) run((dead) => act(k, dead));
    else ch.gesture('jump');
  };
  const setMode = (m) => {
    if (!controls && m === 'ctl') return;
    mode = m;
    box.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m));
    $('[data-keys]').hidden = m !== 'ctl' || coarse;
    $('[data-pad]').hidden = m !== 'ctl' || !(coarse || el.clientWidth < 640);
    if (m === 'auto') { $('[data-prompt]').hidden = true; autopilot(true); }
    else { job++; nav = null; doing(t('room.you')); say(t('room.say.takeMe'), 1600); el.focus({ preventScroll: true }); }
  };

  // teclado: solo con la pieza enfocada o el puntero encima, y nunca mientras se escribe
  const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  let hover = false;
  const onKey = (e) => {
    if (!controls) return;
    if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const d = KEYMAP[e.code];
    if (e.type === 'keyup') { if (d) keys.delete(d); return; }
    if (!(hover || el.contains(document.activeElement))) return;
    if (mode === 'auto' && (d || e.code === 'Space')) setMode('ctl');
    if (d) { e.preventDefault(); keys.add(d); }
    if (e.code === 'Space') { e.preventDefault(); ch.gesture('jump'); }
    if (e.code === 'KeyE') use();
  };
  const clearKeys = () => keys.clear();
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', clearKeys);
  el.addEventListener('pointerenter', () => { hover = true; });
  el.addEventListener('pointerleave', () => { hover = false; });
  const pad = $('[data-pad]');
  pad.addEventListener('pointerdown', (e) => { const d = e.target.closest('[data-d]')?.dataset.d; if (!d) return; e.preventDefault(); if (d === 'use') use(); else keys.add(d); });
  const padUp = (e) => { const d = e.target.closest?.('[data-d]')?.dataset.d; if (d) keys.delete(d); };
  pad.addEventListener('pointerup', padUp);
  pad.addEventListener('pointercancel', padUp);
  pad.addEventListener('pointerleave', clearKeys);

  // clic en el suelo: ir ahí (o, si cae en un mueble, al lugar de ese mueble)
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!controls) {
      // sin controles: tocarlo lo saluda
      if (ray.intersectObject(ch.root, true).length) react('poke');
      return;
    }
    const hit = ray.intersectObject(env.floor)[0];
    if (!hit) return;
    if (mode === 'auto') setMode('ctl');
    const { x, z } = hit.point;
    if (Math.hypot(x - pos.x, z - pos.z) < 0.25) { ch.gesture('jump'); return; }
    const k = Object.keys(POIS).find((kk) => { const p = POIS[kk]; return Math.hypot(x - (p.seat?.[0] ?? p.at[0]), z - (p.seat?.[2] ?? p.at[1])) < 0.9; });
    if (k && (POIS[k].seat || blocked(x, z))) return run((dead) => act(k, dead));
    if (blocked(x, z)) return;
    run(async (dead) => { await guard(dead)(leaveSeat()); doing(t('room.walk')); await guard(dead)(walkTo(x, z, 1.3)); doing(t('room.you')); });
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) setMode(b.dataset.mode);
    else if (b.dataset.msg != null) message();
    else if (b.dataset.edit != null) opts.onEdit?.();
  });

  // tamaño
  let W0 = 0, H0 = 0;
  const resize = () => {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    if (w === W0 && h === H0) return;
    W0 = w; H0 = h;
    renderer.setSize(w, h, false);
    const a = w / h;
    camera.aspect = a;
    camera.fov = a < 1 ? 50 : 36;
    camera.updateProjectionMatrix();
    if (mode === 'ctl') $('[data-pad]').hidden = !(coarse || w < 640);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3();
  const head = new THREE.Vector3();
  function frame(tm, dt) {
    const s = dt / 1000;
    const a = camera.aspect;
    env.tick(tm, dt);
    let moving = false;
    // controlado con teclas / cruceta (relativo a la cámara)
    if (mode === 'ctl' && keys.size && !hop) {
      if (seated) { run(async (dead) => { await guard(dead)(leaveSeat()); }); }
      else {
        camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        right.crossVectors(fwd, camera.up).normalize();
        tmp.set(0, 0, 0);
        if (keys.has('up')) tmp.add(fwd);
        if (keys.has('down')) tmp.sub(fwd);
        if (keys.has('right')) tmp.add(right);
        if (keys.has('left')) tmp.sub(right);
        if (tmp.lengthSq() > 0) {
          if (job && nav) { job++; nav = null; ch.mood('neutral'); doing(t('room.you')); }
          tmp.normalize().multiplyScalar(2.1 * s);
          if (!blocked(pos.x + tmp.x, pos.z)) pos.x += tmp.x;
          if (!blocked(pos.x, pos.z + tmp.z)) pos.z += tmp.z;
          wantHeading = Math.atan2(tmp.x, tmp.z);
          moving = true;
          speedK = 1.4;
        }
      }
    }
    if (hop) {
      const k = Math.min(1, (performance.now() - hop.t0) / hop.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      pos.x = THREE.MathUtils.lerp(hop.from.x, hop.to.x, e);
      pos.z = THREE.MathUtils.lerp(hop.from.z, hop.to.z, e);
      baseY = THREE.MathUtils.lerp(hop.from.y, hop.to.y, e) + Math.sin(Math.PI * k) * 0.55;
      if (k > 0.05 && k < 0.6) wantHeading = Math.atan2(hop.to.x - hop.from.x, hop.to.z - hop.from.z) || wantHeading;
      if (k >= 1) { const r = hop.res; baseY = hop.to.y; hop = null; r(); }
    } else if (nav && !moving) {
      const dx = nav.x - pos.x, dz = nav.z - pos.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, 1.5 * nav.sp * s);
      if (d < 0.04) { const r = nav.res; nav = null; r(); }
      else {
        pos.x += (dx / d) * step; pos.z += (dz / d) * step;
        wantHeading = Math.atan2(dx, dz);
        moving = true;
        speedK = nav.sp;
      }
    }
    walking += ((moving ? 1 : 0) - walking) * Math.min(1, s * 10);
    bob += s * 11 * speedK;
    heading = angTo(heading, wantHeading, Math.min(1, s * 9));
    const lift = Math.abs(Math.sin(bob)) * 0.08 * walking;
    ch.root.position.set(pos.x, baseY + lift, pos.z);
    ch.root.rotation.set(0, heading, Math.sin(bob) * 0.07 * walking);
    if (ch.shadow) { ch.shadow.position.y = 0.002 - lift / ch.root.scale.y; ch.shadow.material.opacity = 1 - Math.min(0.7, lift * 4); }
    ch.tick(tm, dt);
    ch.lod(Math.min(320, H0 * 0.35));
    // cámara: encuadra la pieza y sigue un poco al ot (más en vertical)
    const follow = a < 1 ? 0.75 : 0.3;
    const goal = tmp.set(THREE.MathUtils.lerp(-0.3, pos.x, follow), 0.5, THREE.MathUtils.lerp(-0.6, pos.z, follow));
    camT.lerp(goal, Math.min(1, s * 2.5));
    const dist = a < 1 ? 10.5 : opts.compact ? 11.4 : 12.6;
    camera.position.set(camT.x + dist * 0.42, camT.y + dist * 0.62, camT.z + dist * 0.66);
    camera.lookAt(camT);
    renderer.render(scene, camera);
    // burbuja sobre la cabeza
    if (!bubble.hidden) {
      if (performance.now() > bubbleUntil) bubble.hidden = true;
      head.set(0, ch.H * 1.12, 0).applyMatrix4(ch.root.matrixWorld).project(camera);
      bubble.style.left = `${((head.x + 1) / 2) * W0}px`;
      bubble.style.top = `${((1 - head.y) / 2) * H0}px`;
    }
    // a qué puedes jugar aquí (modo control)
    if (mode === 'ctl') {
      const k = !nav && !hop && near();
      const txt = seated ? t('room.getOff') : k ? t('room.use', { label: t(`room.places.${k}`) }) : '';
      const pr = $('[data-prompt]');
      if (pr.textContent !== txt) pr.textContent = txt;
      pr.hidden = !txt;
    }
  }

  // bucle: se duerme fuera de pantalla o con la pestaña oculta
  let raf = 0, lastT = 0, onScreen = true, dead = false;
  const loop = (tm) => {
    raf = 0;
    if (dead || !onScreen || document.hidden) return;
    const dt = Math.min(100, lastT ? tm - lastT : 16);
    lastT = tm;
    resize();
    frame(tm, dt);
    raf = requestAnimationFrame(loop);
  };
  const wake = () => { if (!raf && !dead && onScreen && !document.hidden) { lastT = 0; raf = requestAnimationFrame(loop); } };
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }, { rootMargin: '64px' });
  io.observe(el);
  document.addEventListener('visibilitychange', wake);

  build(spec);
  resize();
  autopilot(false);
  wake();

  return {
    el,
    say,
    message,
    react,
    setMode,
    get mode() { return mode; },
    setName(n) { name = n || 'ot'; $('[data-name]').textContent = name; },
    setSpec(s) { const m = ch.moodName; build(s); ch.mood(m || 'neutral'); ch.gesture('celebrate'); },
    /** Cambia el tipo de casa (ROOM_THEMES[].id); uno desconocido cae en 'cozy'. */
    setTheme(id) { if (dead) return; applyTheme(id); wake(); },
    get theme() { return env.id; },
    destroy() {
      dead = true;
      job++;
      cancelAnimationFrame(raf);
      for (const id of timers) clearTimeout(id);
      io.disconnect();
      ro.disconnect();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', wake);
      ch.dispose();
      scene.remove(ch.root);
      disposeTree(scene);
      envTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
      box.remove();
      el.classList.remove('otr', 'compact');
    },
  };
}
