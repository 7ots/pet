/**
 * Los «tipos de casa» de la habitación del ot (src/character3d/room.js): cada tema cambia paleta,
 * materiales, ventana, muebles y adornos, pero NUNCA dónde están los lugares (ventana, sofá, cama,
 * escritorio, planta, alfombra) ni sus huecos en el suelo: POIS/BLOCKS/BOUNDS de room.js valen para todos.
 *
 *   const env = buildRoom(scene, 'gothic');   // { group, floor, look, tick(t, dt) }
 *
 * Todo es procedural (primitivas de three + texturas en canvas). Dentro de un build se reutilizan
 * geometrías y materiales iguales; al cambiar de tema room.js descarta el grupo entero (disposeTree).
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const W = 10, D = 8; // x ∈ [-5, 5], z ∈ [-4, 4]; pared del fondo en z = -4, pared izquierda en x = -5
const WALL_H = 4.2;
const BZ = -D / 2, LX = -W / 2;
const WX = -1.2, WY0 = 1.6, WY1 = 3.1, WW = 2; // la ventana (su haz de luz cae sobre el mismo lugar en todos los temas)

// ───────────────────────────── utilidades ─────────────────────────────

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const grad = (c, w, h, stops) => {
  const gr = c.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
};
const disc = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
const halo = (c, x, y, r, col) => {
  const gr = c.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
};
const stars = (c, w, h, n, a = 0.9) => {
  for (let i = 0; i < n; i++) { const s = Math.random() < 0.12 ? 2 : 1; c.fillStyle = `rgba(255,255,255,${rnd(0.25, a)})`; c.fillRect(rnd(0, w), rnd(0, h), s, s); }
};
const ridge = (c, w, h, col, pts) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); for (const [x, y] of pts) c.lineTo(x, y); c.lineTo(w, h); c.fill(); };
const pine = (c, x, yb, s, col, snow) => {
  c.fillStyle = col;
  for (let i = 0; i < 3; i++) { const y = yb - i * s * 0.55; c.beginPath(); c.moveTo(x - s * (0.55 - i * 0.12), y); c.lineTo(x, y - s * 0.75); c.lineTo(x + s * (0.55 - i * 0.12), y); c.fill(); }
  if (snow) { c.fillStyle = snow; c.beginPath(); c.moveTo(x - s * 0.13, yb - s * 1.6); c.lineTo(x, yb - s * 1.85); c.lineTo(x + s * 0.13, yb - s * 1.6); c.fill(); }
};
const noise = (c, w, h, n, col, s = [1, 3]) => { for (let i = 0; i < n; i++) { c.fillStyle = col.replace('$', rnd(0.02, 0.09).toFixed(3)); const z = rnd(s[0], s[1]); c.fillRect(rnd(0, w), rnd(0, h), z, z); } };

// ───────────────────────────── pintores: suelos y paredes ─────────────────────────────

const planks = ({ base, a, b, seam, grain, n = 8 }) => (c, w, h) => {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const y = (i * h) / n;
    c.fillStyle = i % 2 ? a : b;
    c.fillRect(0, y, w, h / n - 3);
    c.fillStyle = seam;
    c.fillRect(((i * 197) % w), y, 3, h / n);
    for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(${grain},${0.05 + Math.random() * 0.05})`; c.fillRect(Math.random() * w, y + Math.random() * (h / n), 40 + Math.random() * 80, 2); }
  }
};
const veins = (c, w, h, col, n = 14) => {
  c.strokeStyle = col;
  for (let i = 0; i < n; i++) {
    c.globalAlpha = rnd(0.12, 0.4); c.lineWidth = rnd(0.6, 2.2);
    let x = rnd(0, w), y = rnd(-40, h);
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += rnd(-50, 50); y += rnd(10, 50); c.lineTo(x, y); }
    c.stroke();
  }
  c.globalAlpha = 1;
};
const checker = ({ a, b, n = 4, vein, grout }) => (c, w, h) => {
  const s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(i * s, j * s, s, s); }
  if (vein) veins(c, w, h, vein, 18);
  if (grout) { c.fillStyle = grout; for (let i = 0; i <= n; i++) { c.fillRect(i * s - 1, 0, 2, h); c.fillRect(0, i * s - 1, w, 2); } }
};
const marble = (base, vein) => (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); noise(c, w, h, 300, 'rgba(120,100,80,$)'); veins(c, w, h, vein, 16); };
const stones = ({ cols, grout, rows = 6, minW = 60, maxW = 140 }) => (c, w, h) => {
  c.fillStyle = grout; c.fillRect(0, 0, w, h);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -maxW / 2 : 0;
    while (x < w) {
      const bw = Math.min(rnd(minW, maxW), w - x + maxW);
      c.fillStyle = pick(cols); c.fillRect(x + 3, r * rh + 3, bw - 6, rh - 6);
      for (let k = 0; k < 10; k++) { c.fillStyle = `rgba(0,0,0,${rnd(0.03, 0.12).toFixed(3)})`; c.fillRect(rnd(x, x + bw - 8), rnd(r * rh + 3, r * rh + rh - 8), rnd(2, 9), rnd(2, 6)); }
      c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(x + 3, r * rh + 3, bw - 6, 3);
      x += bw;
    }
  }
};
const tatami = (c, w, h) => {
  const mat = (x, y, mw, mh, vert) => {
    c.fillStyle = '#cfc58c'; c.fillRect(x, y, mw, mh);
    c.fillStyle = 'rgba(110,100,40,.16)';
    if (vert) for (let i = 0; i < mw; i += 4) c.fillRect(x + i, y, 1, mh); else for (let i = 0; i < mh; i += 4) c.fillRect(x, y + i, mw, 1);
    c.fillStyle = '#2f3b2c';
    if (vert) { c.fillRect(x, y, 9, mh); c.fillRect(x + mw - 9, y, 9, mh); } else { c.fillRect(x, y, mw, 9); c.fillRect(x, y + mh - 9, mw, 9); }
    c.fillStyle = 'rgba(40,30,10,.35)'; c.fillRect(x, y, mw, 1); c.fillRect(x, y, 1, mh);
  };
  mat(0, 0, w, h / 2, false); mat(0, h / 2, w / 2, h / 2, true); mat(w / 2, h / 2, w / 2, h / 2, true);
};
const metalPlates = ({ base, light, seam, rivet }) => (c, w, h) => {
  const s = w / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const gr = c.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
    gr.addColorStop(0, light); gr.addColorStop(1, base);
    c.fillStyle = gr; c.fillRect(i * s, j * s, s, s);
    c.fillStyle = seam; c.fillRect(i * s, j * s, s, 4); c.fillRect(i * s, j * s, 4, s);
    c.fillStyle = rivet;
    for (const [dx, dy] of [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]]) { c.beginPath(); c.arc(i * s + dx, j * s + dy, 5, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.12)';
    for (let k = 0; k < 6; k++) c.fillRect(i * s + 40, j * s + 50 + k * 28, s - 80, 6);
  }
};
const neonGrid = (c, w, h) => {
  c.fillStyle = '#140d2a'; c.fillRect(0, 0, w, h);
  noise(c, w, h, 600, 'rgba(255,255,255,$)');
  c.fillStyle = 'rgba(0,240,255,.35)';
  for (let i = 0; i < 4; i++) { c.fillRect(i * (w / 4), 0, 2, h); c.fillRect(0, i * (h / 4), w, 2); }
  c.fillStyle = 'rgba(255,60,200,.22)'; c.fillRect(w / 8, 0, 1, h); c.fillRect(0, h / 8 * 5, w, 1);
};
const logs = ({ cols, n = 7 }) => (c, w, h) => {
  const lh = h / n;
  for (let i = 0; i < n; i++) {
    const y = i * lh, col = cols[i % cols.length];
    const gr = c.createLinearGradient(0, y, 0, y + lh);
    gr.addColorStop(0, 'rgba(20,10,0,.55)'); gr.addColorStop(0.18, col); gr.addColorStop(0.6, col); gr.addColorStop(1, 'rgba(20,10,0,.65)');
    c.fillStyle = col; c.fillRect(0, y, w, lh);
    c.fillStyle = gr; c.fillRect(0, y, w, lh);
    for (let k = 0; k < 10; k++) { c.fillStyle = `rgba(50,25,5,${rnd(0.08, 0.2).toFixed(3)})`; c.fillRect(rnd(0, w), y + rnd(lh * 0.25, lh * 0.75), rnd(30, 110), 2); }
    for (let k = 0; k < 2; k++) { c.fillStyle = 'rgba(40,20,5,.35)'; c.beginPath(); c.ellipse(rnd(0, w), y + lh / 2, 6, 4, 0, 0, 7); c.fill(); }
  }
};
const beadboard = (base, line) => (c, w, h) => {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { c.fillStyle = line; c.fillRect(x, 0, 3, h); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 3, 0, 2, h); }
  noise(c, w, h, 200, 'rgba(120,100,70,$)');
};
const panels = ({ base, line, dark }) => (c, w, h) => {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (const [x, y, pw, ph] of [[0, 0, w / 2, h / 3], [w / 2, 0, w / 2, h / 3], [0, h / 3, w, h / 3], [0, (h / 3) * 2, w / 3, h / 3], [w / 3, (h / 3) * 2, (w / 3) * 2, h / 3]]) {
    c.fillStyle = line; c.fillRect(x, y, pw, 3); c.fillRect(x, y, 3, ph);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 3, y + 3, pw - 6, 2);
    c.fillStyle = dark; c.fillRect(x + 14, y + ph - 24, 40, 8);
  }
};
const concrete = (base) => (c, w, h) => {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  noise(c, w, h, 1400, 'rgba(255,255,255,$)', [1, 4]);
  noise(c, w, h, 900, 'rgba(0,0,0,$)', [2, 6]);
  c.fillStyle = 'rgba(0,0,0,.25)';
  for (let x = 0; x <= w; x += w / 2) c.fillRect(x, 0, 3, h);
  c.fillRect(0, h / 2, w, 3);
};
const plaster = (base) => (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); noise(c, w, h, 900, 'rgba(110,90,60,$)', [1, 5]); };

// bandas pintadas (zócalos)
const meander = (bg, ink) => (c, w, h) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = ink;
  c.fillRect(0, 6, w, 5); c.fillRect(0, h - 11, w, 5);
  const s = (h - 34) / 4, y0 = 17;
  for (let x = 0; x < w; x += s * 5) {
    c.fillRect(x, y0, s, s * 4); c.fillRect(x, y0, s * 4, s); c.fillRect(x + s * 3, y0, s, s * 3); c.fillRect(x + s * 2, y0 + s * 2, s * 2, s); c.fillRect(x + s * 2, y0 + s * 2, s, s * 2 - 0); c.fillRect(x, y0 + s * 3, s * 5, s);
  }
};

// ───────────────────────────── pintores: cielos (la vista por la ventana) ─────────────────────────────

const SKY = {
  cozy: (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#7cc4ff'); gr.addColorStop(0.65, '#ffd9a8'); gr.addColorStop(1, '#ffb88a');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (const [x, y, r] of [[60, 70, 22], [85, 64, 28], [112, 72, 20], [180, 120, 16], [198, 114, 22]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#8d6fd1'; c.beginPath(); c.moveTo(0, h); c.lineTo(70, 180); c.lineTo(130, 215); c.lineTo(200, 170); c.lineTo(w, 200); c.lineTo(w, h); c.fill();
  },
  gothic: (c, w, h) => {
    grad(c, w, h, [[0, '#0d0626'], [0.6, '#341a5c'], [1, '#6d2350']]);
    stars(c, w, h * 0.7, 90);
    halo(c, 172, 74, 70, 'rgba(255,240,210,.35)');
    disc(c, 172, 74, 30, '#f3ead0'); disc(c, 162, 66, 6, 'rgba(180,170,150,.5)'); disc(c, 182, 84, 4, 'rgba(180,170,150,.5)');
    c.fillStyle = '#0a0518';
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, 200); c.lineTo(40, 196); c.lineTo(40, 150); c.lineTo(52, 110); c.lineTo(64, 150); c.lineTo(64, 190); c.lineTo(110, 186);
    c.lineTo(110, 160); c.lineTo(118, 140); c.lineTo(126, 160); c.lineTo(126, 184); c.lineTo(200, 188); c.lineTo(200, 130); c.lineTo(214, 84); c.lineTo(228, 130); c.lineTo(228, 192); c.lineTo(w, 198); c.lineTo(w, h); c.fill();
    c.strokeStyle = '#0a0518'; c.lineWidth = 2;
    for (const [x, y] of [[90, 60], [120, 84], [70, 96]]) { c.beginPath(); c.moveTo(x - 7, y - 3); c.quadraticCurveTo(x - 3, y, x, y + 2); c.quadraticCurveTo(x + 3, y, x + 7, y - 3); c.stroke(); }
  },
  roman: (c, w, h) => {
    grad(c, w, h, [[0, '#5fb3f0'], [0.7, '#cfe8f5'], [1, '#f6e3c0']]);
    halo(c, 200, 50, 60, 'rgba(255,250,220,.7)'); disc(c, 200, 50, 16, '#fffbe8');
    ridge(c, w, h, '#a7b07a', [[0, 190], [60, 170], [140, 182], [210, 166], [w, 178]]);
    ridge(c, w, h, '#7d8a4f', [[0, 215], [90, 200], [170, 212], [w, 204]]);
    // un templete en la colina
    c.fillStyle = '#f2ecdf'; c.fillRect(120, 160, 46, 4); c.beginPath(); c.moveTo(118, 160); c.lineTo(143, 148); c.lineTo(168, 160); c.fill();
    for (let i = 0; i < 5; i++) c.fillRect(122 + i * 10, 164, 3, 16);
    c.fillRect(118, 180, 50, 3);
    c.fillStyle = '#2f4a26';
    for (const [x, s] of [[30, 1], [44, 0.8], [226, 1.1], [240, 0.85]]) { c.beginPath(); c.ellipse(x, 205 - 34 * s, 7 * s, 36 * s, 0, 0, 7); c.fill(); }
  },
  japanese: (c, w, h) => {
    grad(c, w, h, [[0, '#ffb3c7'], [0.55, '#ffd2b0'], [1, '#ffe9c9']]);
    disc(c, 70, 90, 22, '#ff6b5b');
    c.fillStyle = '#7a86b8'; c.beginPath(); c.moveTo(20, 230); c.lineTo(110, 120); c.lineTo(146, 120); c.lineTo(236, 230); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(92, 142); c.lineTo(110, 120); c.lineTo(146, 120); c.lineTo(164, 142); c.lineTo(150, 136); c.lineTo(138, 146); c.lineTo(126, 136); c.lineTo(112, 146); c.lineTo(102, 136); c.fill();
    ridge(c, w, h, '#4d5a7c', [[0, 220], [80, 214], [180, 222], [w, 212]]);
    c.strokeStyle = '#4a2a20'; c.lineWidth = 4; c.beginPath(); c.moveTo(w, 20); c.quadraticCurveTo(200, 30, 160, 10); c.stroke();
    for (let i = 0; i < 26; i++) disc(c, rnd(150, w), rnd(0, 50), rnd(4, 9), pick(['#ffc0d4', '#ff9fbe', '#ffe0ea']));
  },
  scandi: (c, w, h) => {
    grad(c, w, h, [[0, '#a9c4dc'], [0.7, '#dfe8ef'], [1, '#f4f6f8']]);
    ridge(c, w, h, '#eef2f5', [[0, 190], [70, 176], [150, 186], [w, 172]]);
    for (const [x, y, s] of [[26, 200, 30], [58, 196, 22], [190, 194, 34], [228, 200, 26], [120, 206, 18]]) pine(c, x, y, s, '#3e5a4f', '#ffffff');
    ridge(c, w, h, '#ffffff', [[0, 214], [120, 208], [w, 216]]);
    for (let i = 0; i < 40; i++) disc(c, rnd(0, w), rnd(0, h), rnd(1, 2.4), 'rgba(255,255,255,.85)');
  },
  cyberpunk: (c, w, h) => {
    grad(c, w, h, [[0, '#0a0620'], [0.55, '#2a0b4a'], [1, '#ff2fa0']]);
    for (let i = 0; i < 18; i++) {
      const bw = rnd(16, 34), bh = rnd(60, 190), x = rnd(-10, w), y = h - bh;
      c.fillStyle = pick(['#120a2a', '#1a0f38', '#0e0822']); c.fillRect(x, y, bw, bh);
      for (let yy = y + 6; yy < h - 4; yy += 8) for (let xx = x + 3; xx < x + bw - 3; xx += 6) if (Math.random() < 0.35) { c.fillStyle = pick(['#ffe36b', '#00f0ff', '#ff4fd8', '#9b7bff']); c.fillRect(xx, yy, 3, 3); }
    }
    c.fillStyle = '#00f0ff'; c.fillRect(30, 120, 34, 6); c.fillStyle = '#ff4fd8'; c.fillRect(180, 96, 8, 30);
    c.strokeStyle = 'rgba(160,200,255,.35)'; c.lineWidth = 1;
    for (let i = 0; i < 90; i++) { const x = rnd(0, w), y = rnd(0, h); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 12); c.stroke(); }
  },
  beach: (c, w, h) => {
    grad(c, w, h, [[0, '#4fb6f2'], [0.55, '#bfe9ff'], [0.62, '#bfe9ff']]);
    halo(c, 190, 70, 60, 'rgba(255,250,200,.7)'); disc(c, 190, 70, 18, '#fff6c8');
    c.fillStyle = 'rgba(255,255,255,.9)';
    for (const [x, y, r] of [[50, 50, 14], [68, 46, 18], [86, 52, 12]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    const sea = c.createLinearGradient(0, 150, 0, 205); sea.addColorStop(0, '#1ba3c6'); sea.addColorStop(1, '#5fe0d6');
    c.fillStyle = sea; c.fillRect(0, 150, w, 60);
    c.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 14; i++) c.fillRect(rnd(0, w), rnd(156, 200), rnd(10, 26), 2);
    ridge(c, w, h, '#f5deb0', [[0, 212], [100, 204], [w, 214]]);
    c.strokeStyle = '#5a3d22'; c.lineWidth = 6; c.beginPath(); c.moveTo(40, h); c.quadraticCurveTo(30, 170, 56, 120); c.stroke();
    c.fillStyle = '#2f8a4a';
    for (const a of [-2.6, -2, -1.2, -0.5, 0.2]) { c.beginPath(); c.ellipse(56 + Math.cos(a) * 26, 120 + Math.sin(a) * 12 + 8, 30, 7, a, 0, 7); c.fill(); }
  },
  cabin: (c, w, h) => {
    grad(c, w, h, [[0, '#2c2a5a'], [0.5, '#a85a7a'], [1, '#ffb27a']]);
    stars(c, w, h * 0.35, 30, 0.7);
    ridge(c, w, h, '#6a6aa0', [[0, 170], [50, 120], [96, 160], [150, 104], [210, 158], [w, 136]]);
    c.fillStyle = '#ffffff';
    for (const [x, y] of [[50, 120], [150, 104]]) { c.beginPath(); c.moveTo(x - 16, y + 18); c.lineTo(x, y); c.lineTo(x + 18, y + 20); c.fill(); }
    ridge(c, w, h, '#eef0ff', [[0, 210], [130, 202], [w, 212]]);
    for (const [x, y, s] of [[20, 214, 36], [62, 206, 28], [200, 210, 40], [236, 214, 30], [130, 216, 22]]) pine(c, x, y, s, '#1d3330', '#e8ecff');
  },
  space: (c, w, h) => {
    c.fillStyle = '#04030c'; c.fillRect(0, 0, w, h);
    halo(c, 80, 170, 120, 'rgba(120,60,200,.35)'); halo(c, 190, 60, 80, 'rgba(40,140,220,.25)');
    stars(c, w, h, 220);
    for (let i = 0; i < 8; i++) { const x = rnd(0, w), y = rnd(0, h); halo(c, x, y, 5, 'rgba(255,255,255,.8)'); }
    const pl = c.createRadialGradient(150, 140, 6, 166, 156, 56); pl.addColorStop(0, '#ffd2a0'); pl.addColorStop(0.6, '#e0743c'); pl.addColorStop(1, '#5a1e2a');
    c.fillStyle = pl; c.beginPath(); c.arc(166, 156, 52, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,220,180,.75)'; c.lineWidth = 4; c.beginPath(); c.ellipse(166, 156, 90, 18, -0.3, 0, 7); c.stroke();
  },
  castle: (c, w, h) => {
    grad(c, w, h, [[0, '#5aa8e8'], [0.75, '#cde9f7'], [1, '#e8f4e0']]);
    c.fillStyle = 'rgba(255,255,255,.9)';
    for (const [x, y, r] of [[40, 60, 16], [60, 54, 22], [84, 62, 15], [190, 40, 14], [206, 36, 18]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    ridge(c, w, h, '#86b860', [[0, 180], [70, 164], [140, 178], [w, 160]]);
    c.fillStyle = '#9a9aa6'; c.fillRect(170, 112, 26, 56); c.fillRect(200, 130, 30, 38);
    for (let i = 0; i < 3; i++) c.fillRect(170 + i * 10, 106, 6, 6);
    c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(166, 112); c.lineTo(183, 86); c.lineTo(200, 112); c.fill();
    c.fillStyle = '#3a3a4a'; c.fillRect(181, 130, 4, 8);
    ridge(c, w, h, '#5f9a44', [[0, 210], [110, 196], [w, 206]]);
    c.fillStyle = '#e8c35a'; c.fillRect(182, 72, 2, 16); c.beginPath(); c.moveTo(184, 72); c.lineTo(196, 76); c.lineTo(184, 80); c.fill();
  },
};

// la pantalla del escritorio: siempre la plaza, con los colores del tema
const plaza = ({ bg, ink, dots, line = 'rgba(255,255,255,.55)', font = 'bold 22px sans-serif' }) => (c, w, h) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = ink; c.font = font; c.fillText('plaza', 14, 32);
  for (let i = 0; i < 4; i++) { c.fillStyle = dots[i]; c.beginPath(); c.arc(28, 60 + i * 26, 9, 0, 7); c.fill(); c.fillStyle = line; c.fillRect(46, 54 + i * 26, 80 + ((i * 53) % 110), 10); }
};
const rugRect = ({ a, b, c: c3 = b, pattern = 'border' }) => (c, w, h) => {
  c.fillStyle = a; c.fillRect(0, 0, w, h);
  c.fillStyle = b; c.fillRect(14, 14, w - 28, 10); c.fillRect(14, h - 24, w - 28, 10); c.fillRect(14, 14, 10, h - 28); c.fillRect(w - 24, 14, 10, h - 28);
  c.fillStyle = c3;
  if (pattern === 'diamond') { for (let x = 60; x < w - 40; x += 64) for (let y = 60; y < h - 40; y += 64) { c.beginPath(); c.moveTo(x, y - 18); c.lineTo(x + 18, y); c.lineTo(x, y + 18); c.lineTo(x - 18, y); c.closePath(); c.lineWidth = 4; c.strokeStyle = c3; c.stroke(); } }
  else if (pattern === 'stripes') { for (let y = 40; y < h - 40; y += 36) c.fillRect(30, y, w - 60, 14); }
  else if (pattern === 'medallion') { c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.22, h * 0.26, 0, 0, 7); c.fill(); c.fillStyle = a; c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.12, h * 0.14, 0, 0, 7); c.fill(); }
  else if (pattern === 'glow') { c.fillStyle = 'rgba(255,255,255,.04)'; for (let x = 40; x < w; x += 40) c.fillRect(x, 30, 2, h - 60); }
};

// ───────────────────────────── kit de piezas (reutiliza geometrías y materiales) ─────────────────────────────

function kit() {
  const mats = new Map(), geos = new Map();
  const keyOf = (kind, color, o) => (o && Object.values(o).some((v) => v && typeof v === 'object') ? null : `${kind}${color}${o ? JSON.stringify(o) : ''}`);
  const cached = (key, make) => { if (!key) return make(); let v = mats.get(key); if (!v) mats.set(key, (v = make())); return v; };
  const std = (color, o) => cached(keyOf('s', color, o), () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
  const basic = (color, o) => cached(keyOf('b', color, o), () => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o }));
  const glow = (color, i = 1, o) => std(color, { emissive: color, emissiveIntensity: i, ...o });
  const geo = (key, make) => { let v = geos.get(key); if (!v) geos.set(key, (v = make())); return v; };
  const mat = (c, o) => (c?.isMaterial ? c : std(c, o));
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
  const rbox = (w, h, d, c, x, y, z, r = 0.06, o) => mesh(geo(`b${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2))), mat(c, o), x, y, z);
  const cyl = (rt, rb, h, c, x, y, z, o, seg = 32) => mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat(c, o), x, y, z);
  const ball = (r, c, x, y, z, o, ws = 16, hs = 10) => mesh(geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), mat(c, o), x, y, z);
  const plane = (w, h, m, x, y, z, ry = 0) => { const p = mesh(geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)), m, x, y, z); p.rotation.y = ry; return p; };
  let blobTex, blobMat;
  const shadow = (w, d, x, z) => {
    if (!blobMat) {
      blobTex = canvasTex(128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(0.5, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      });
      blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false });
    }
    const m = mesh(geo(`p${w},${d}`, () => new THREE.PlaneGeometry(w, d)), blobMat, x, 0.012, z);
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  return { std, basic, glow, geo, mesh, rbox, cyl, ball, plane, shadow };
}

/** Llama con parpadeo (vela, antorcha, chimenea). light:null = sin luz propia. */
function flame(k, g, fx, x, y, z, { color = '#ffcf6b', light = '#ffb35c', power = 2.2, dist = 4, size = 0.035, ly = 0.14 } = {}) {
  const f = k.ball(size, k.basic(color), x, y, z, null, 12, 8);
  f.scale.y = 1.8;
  g.add(f);
  let l = null;
  if (light) { l = new THREE.PointLight(light, power, dist, 1.6); l.position.set(x, y + ly, z); g.add(l); }
  const ph = fx.length * 377;
  fx.push((t) => {
    const q = 1 + Math.sin((t + ph) * 0.013) * 0.08 + Math.sin((t + ph) * 0.031) * 0.06;
    if (l) l.intensity = power * q;
    f.scale.set(1, 1.8 * q, 1);
  });
  return f;
}
const pointLight = (g, color, power, x, y, z, dist = 5) => { const l = new THREE.PointLight(color, power, dist, 1.5); l.position.set(x, y, z); g.add(l); return l; };

// ───────────────────────────── piezas por lugar ─────────────────────────────

function buildWindow(k, g, P) {
  const S = P.win, fr = S.frame;
  const sky = canvasTex(256, 256, S.sky);
  const z = BZ;
  if (S.shape === 'round') {
    const cy = (WY0 + WY1) / 2, r = 0.78;
    g.add(k.mesh(new THREE.CircleGeometry(r + 0.32, 48), k.std(S.plate || '#6b7480', { metalness: 0.6, roughness: 0.4 }), WX, cy, z + 0.005));
    g.add(k.mesh(new THREE.CircleGeometry(r, 48), k.basic('#ffffff', { map: sky }), WX, cy, z + 0.012));
    const ring = k.mesh(new THREE.TorusGeometry(r + 0.04, 0.09, 12, 48), k.std(fr, { metalness: 0.7, roughness: 0.3 }), WX, cy, z + 0.04);
    g.add(ring);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(k.ball(0.04, '#cfd6de', WX + Math.cos(a) * (r + 0.22), cy + Math.sin(a) * (r + 0.22), z + 0.03, { metalness: 0.8, roughness: 0.3 }, 8, 6)); }
  } else if (S.shape === 'arch' || S.shape === 'pointed') {
    const hw = WW / 2, top = WY1 + 0.3, spr = S.shape === 'arch' ? top - hw : WY0 + 0.75;
    const outline = (p) => {
      p.lineTo(hw, spr - WY0);
      if (S.shape === 'arch') p.absarc(0, spr - WY0, hw, 0, Math.PI, false);
      else { const cy = spr - WY0 + (top - spr) * 0.72; p.quadraticCurveTo(hw, cy, 0, top - WY0); p.quadraticCurveTo(-hw, cy, -hw, spr - WY0); }
      p.lineTo(-hw, 0);
    };
    const shape = new THREE.Shape(); shape.moveTo(-hw, 0); shape.lineTo(hw, 0); outline(shape);
    const pg = new THREE.ShapeGeometry(shape, 24);
    const pos = pg.attributes.position, uv = pg.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + hw) / WW, pos.getY(i) / (top - WY0));
    g.add(k.mesh(pg, k.basic('#ffffff', { map: sky }), WX, WY0, z + 0.01));
    const path = new THREE.Path(); path.moveTo(hw, 0); outline(path);
    const pts = path.getSpacedPoints(90).map((p) => new THREE.Vector3(WX + p.x, WY0 + p.y, z + 0.06));
    g.add(k.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.07, 8), k.std(fr)));
    g.add(k.rbox(WW + 0.3, 0.1, 0.25, fr, WX, WY0 - 0.05, z + 0.12));
    g.add(k.rbox(0.05, top - WY0 - 0.05, 0.06, fr, WX, (WY0 + top) / 2, z + 0.04), k.rbox(WW, 0.05, 0.06, fr, WX, spr, z + 0.04));
    if (S.shape === 'pointed') {
      const tr = k.mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), k.std(fr), WX, spr + (top - spr) * 0.5, z + 0.05);
      g.add(tr);
    }
  } else {
    g.add(k.plane(WW, WY1 - WY0, k.basic('#ffffff', { map: sky }), WX, (WY0 + WY1) / 2, z + 0.01));
    g.add(
      k.rbox(WW + 0.2, 0.1, 0.12, fr, WX, WY1 + 0.05, z + 0.06), k.rbox(WW + 0.3, 0.1, 0.25, fr, WX, WY0 - 0.05, z + 0.12),
      k.rbox(0.1, WY1 - WY0, 0.12, fr, WX - WW / 2 - 0.05, (WY0 + WY1) / 2, z + 0.06), k.rbox(0.1, WY1 - WY0, 0.12, fr, WX + WW / 2 + 0.05, (WY0 + WY1) / 2, z + 0.06),
    );
    if (S.bars === 'grid') {
      for (let i = 1; i < 4; i++) g.add(k.rbox(0.04, WY1 - WY0, 0.05, fr, WX - WW / 2 + (i * WW) / 4, (WY0 + WY1) / 2, z + 0.04, 0.01));
      for (let i = 1; i < 3; i++) g.add(k.rbox(WW, 0.04, 0.05, fr, WX, WY0 + (i * (WY1 - WY0)) / 3, z + 0.04, 0.01));
    } else if (S.bars !== 'none') {
      g.add(k.rbox(0.05, WY1 - WY0, 0.06, fr, WX, (WY0 + WY1) / 2, z + 0.04), k.rbox(WW, 0.05, 0.06, fr, WX, (WY0 + WY1) / 2, z + 0.04));
    }
  }
  if (S.curtain) {
    const ch = S.curtainH || 2.1, cy = S.curtainY || 2.3;
    for (const s of [-1, 1]) g.add(k.rbox(0.45, ch, 0.08, S.curtain, WX + s * (WW / 2 + 0.35), cy, z + 0.12, 0.04));
    if (S.rod) {
      const rod = k.cyl(0.03, 0.03, WW + 1.4, S.rod, WX, cy + ch / 2 + 0.06, z + 0.14, null, 12);
      rod.rotation.z = Math.PI / 2;
      g.add(rod, k.ball(0.06, S.rod, WX - WW / 2 - 0.7, cy + ch / 2 + 0.06, z + 0.14), k.ball(0.06, S.rod, WX + WW / 2 + 0.7, cy + ch / 2 + 0.06, z + 0.14));
    }
  }
}

function buildShaft(k, g, fx, P) {
  const S = P.win;
  const wx = WX, wy0 = WY0, wy1 = WY1, ww = WW;
  // haz de luz: de la ventana al suelo, en dirección (0.35, -1, 1)
  const proj = (x, y) => new THREE.Vector3(x + 0.35 * y, 0.02, BZ + y);
  const shaftTex = canvasTex(4, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  shaftTex.colorSpace = THREE.NoColorSpace;
  const quad = (a, b, c2, d2) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c2.toArray(), ...d2.toArray()], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    return geo;
  };
  const shaftMat = new THREE.MeshBasicMaterial({ color: S.shaft, alphaMap: shaftTex, transparent: true, opacity: S.shaftOp, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const L = wx - ww / 2, R = wx + ww / 2, z0 = BZ + 0.02;
  const wTL = new THREE.Vector3(L, wy1, z0), wTR = new THREE.Vector3(R, wy1, z0), wBL = new THREE.Vector3(L, wy0, z0), wBR = new THREE.Vector3(R, wy0, z0);
  const fTL = proj(L, wy1), fTR = proj(R, wy1), fBL = proj(L, wy0), fBR = proj(R, wy0);
  for (const geo of [quad(wTL, wTR, fTR, fTL), quad(wBL, wBR, fBR, fBL), quad(wTL, wBL, fBL, fTL), quad(wTR, wBR, fBR, fTR)]) g.add(new THREE.Mesh(geo, shaftMat));
  const patchTex = canvasTex(128, 128, (c, w, h) => {
    const gr = c.createRadialGradient(64, 64, 10, 64, 64, 70);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  patchTex.colorSpace = THREE.NoColorSpace;
  g.add(new THREE.Mesh(quad(fBL, fBR, fTR, fTL), new THREE.MeshBasicMaterial({ color: S.patch, alphaMap: patchTex, transparent: true, opacity: S.patchOp, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  // polvo flotando en el haz
  const N = 70;
  const dust = new Float32Array(N * 3);
  const seedDust = (i) => { const kk = Math.random(), y = wy0 + Math.random() * (wy1 - wy0); const p = proj(L + Math.random() * ww, y); dust.set([THREE.MathUtils.lerp(L + Math.random() * ww, p.x, kk), y * (1 - kk), THREE.MathUtils.lerp(z0, p.z, kk)], i * 3); };
  for (let i = 0; i < N; i++) seedDust(i);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  g.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: S.dust, size: 0.035, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  const sun = new THREE.DirectionalLight(S.sun[0], S.sun[1]);
  sun.position.set(wx - 3.5, 10, BZ - 10);
  sun.target.position.set(wx + 0.5, 0, -2);
  g.add(sun, sun.target);
  let dustT = 0;
  fx.push((t, dt) => {
    dustT += dt;
    if (dustT <= 33) return;
    dustT = 0;
    for (let i = 0; i < N; i++) {
      dust[i * 3 + 1] += 0.0015 * Math.sin(t * 0.001 + i);
      dust[i * 3] += 0.0012;
      if (dust[i * 3] > R + 1.2 || dust[i * 3 + 1] < 0.05) seedDust(i);
    }
    dustGeo.attributes.position.needsUpdate = true;
  });
}

// sofá contra la pared izquierda, mirando hacia +x (asiento siempre a ~0.66 de alto: POIS.sofa.seat)
function buildSofa(k, g, S) {
  const { a, b, pillow } = S;
  if (S.kind === 'bench') {
    const fr = S.frame;
    g.add(k.rbox(1.1, 0.46, 2.6, fr, -4.4, 0.23, 0.5, 0.05));
    g.add(k.rbox(0.92, 0.2, 1.14, b, -4.3, 0.56, -0.07, 0.09), k.rbox(0.92, 0.2, 1.14, b, -4.3, 0.56, 1.07, 0.09));
    if (S.back) g.add(k.rbox(0.16, S.back, 2.6, fr, -4.88, S.back / 2, 0.5, 0.04), k.rbox(0.18, 0.62, 2.3, a, -4.72, 0.98, 0.5, 0.08));
    if (S.bolster) for (const z of [-0.62, 1.62]) { const bo = k.cyl(0.15, 0.15, 0.9, S.bolster, -4.3, 0.78, z, null, 20); bo.rotation.z = Math.PI / 2; g.add(bo); }
    if (S.trim) g.add(k.rbox(1.12, 0.05, 2.62, S.trim, -4.4, 0.44, 0.5, 0.02, { metalness: 0.7, roughness: 0.35 }));
  } else {
    const r = S.r ?? 0.12;
    const backH = S.backH || 1.0;
    g.add(
      k.rbox(1.1, 0.45, 2.4, a, -4.4, 0.25, 0.5, r), k.rbox(0.32, backH, 2.4, a, -4.82, 0.1 + backH / 2, 0.5, r + 0.02),
      k.rbox(1.1, 0.7, 0.3, a, -4.4, 0.35, -0.75, r), k.rbox(1.1, 0.7, 0.3, a, -4.4, 0.35, 1.75, r),
      k.rbox(0.85, 0.2, 1.08, b, -4.3, 0.56, 0, r * 0.75), k.rbox(0.85, 0.2, 1.08, b, -4.3, 0.56, 1.0, r * 0.75),
    );
    if (S.tufts) for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) g.add(k.ball(0.03, S.tufts, -4.65, 0.95 + row * 0.32, -0.4 + i * 0.36 + (row ? 0.18 : 0), { metalness: 0.6, roughness: 0.3 }, 8, 6));
    if (S.legs) for (const x of [-4.85, -3.95]) for (const z of [-0.8, 1.8]) g.add(k.cyl(0.04, 0.03, 0.12, S.legs, x, 0.06, z, null, 10));
    if (S.glow) g.add(k.rbox(1.14, 0.04, 2.44, k.glow(S.glow, 2.2), -4.4, 0.035, 0.5, 0.02));
  }
  if (pillow) g.add(k.rbox(0.18, 0.5, 0.5, pillow, -4.55, 0.85, -0.25, 0.08));
  g.add(k.shadow(1.6, 3.2, -4.3, 0.5));
}

// cuadros sobre el sofá (pared izquierda)
function buildArt(k, g, A) {
  if (!A || !A.items) return;
  for (const [z, c, w, h, paint, y = 2.4] of A.items) {
    if (A.frame) g.add(k.rbox(0.05, h + 0.12, w + 0.12, A.frame, LX + 0.03, y, z, 0.02, A.frameMetal ? { metalness: 0.75, roughness: 0.3 } : undefined));
    const m = paint ? k.std('#ffffff', { map: canvasTex(128, Math.round((128 * h) / w), paint), emissive: '#ffffff', emissiveIntensity: 0.06 }) : k.std(c, { emissive: c, emissiveIntensity: 0.15 });
    const art = k.plane(w, h, m, LX + 0.06, y, z, Math.PI / 2);
    g.add(art);
  }
}

// mesita con vela
function buildTable(k, g, fx, S) {
  if (S.kind === 'stump') {
    g.add(k.cyl(0.3, 0.34, 0.58, S.top, -4.3, 0.29, -1.45, null, 18), k.cyl(0.3, 0.3, 0.01, S.leg, -4.3, 0.585, -1.45, null, 18));
  } else {
    g.add(k.cyl(0.32, 0.26, 0.06, S.top, -4.3, 0.55, -1.45), k.cyl(0.05, 0.05, 0.52, S.leg, -4.3, 0.26, -1.45), k.cyl(0.2, 0.22, 0.03, S.leg, -4.3, 0.015, -1.45));
  }
  g.add(k.shadow(0.8, 0.8, -4.3, -1.45));
  if (S.orb) {
    g.add(k.ball(0.11, k.glow(S.orb, 2), -4.3, 0.7, -1.45, null, 20, 14), k.cyl(0.08, 0.1, 0.04, '#3a3f4a', -4.3, 0.6, -1.45, null, 16));
    const l = pointLight(g, S.light, S.power, -4.3, 0.9, -1.45, 4);
    fx.push((t) => { l.intensity = S.power * (0.85 + Math.sin(t * 0.002) * 0.15); });
  } else {
    g.add(k.cyl(0.07, 0.07, 0.22, S.candle, -4.3, 0.69, -1.45));
    flame(k, g, fx, -4.3, 0.86, -1.45, { color: S.flame, light: S.light, power: S.power });
  }
}

function buildRug(k, g, R) {
  if (R.shape === 'rect') {
    const tex = canvasTex(512, 384, rugRect(R));
    const rug = k.mesh(new THREE.PlaneGeometry(3.4, 2.5), R.glow ? k.std('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.5 }) : k.std('#ffffff', { map: tex }), 0.6, 0.006, 0.9);
    rug.rotation.x = -Math.PI / 2;
    g.add(rug);
    return;
  }
  const rug = k.mesh(new THREE.CircleGeometry(1.8, 64), k.std(R.a), 0.6, 0.006, 0.9);
  rug.rotation.x = -Math.PI / 2;
  const rug2 = k.mesh(new THREE.RingGeometry(1.25, 1.42, 64), R.glow ? k.glow(R.b, 1.6) : k.std(R.b), 0.6, 0.008, 0.9);
  rug2.rotation.x = -Math.PI / 2;
  if (R.shape === 'oval') { rug.scale.set(1.15, 0.8, 1); rug2.scale.set(1.15, 0.8, 1); }
  g.add(rug, rug2);
}

// cama en la esquina del fondo a la derecha (se acuesta a ~0.68: POIS.bed.seat)
function buildBed(k, g, B) {
  const r = B.r ?? 0.08;
  g.add(
    k.rbox(2.1, 0.38, 3.0, B.frame, 3.55, 0.2, -2.5, r), k.rbox(2.0, 0.26, 2.9, B.sheet, 3.55, 0.5, -2.5, 0.1),
    k.rbox(2.06, 0.08, 1.95, B.blanket, 3.55, 0.64, -1.97, 0.05), k.rbox(1.3, 0.2, 0.55, B.pillow, 3.55, 0.72, -3.55, 0.1),
    k.rbox(2.1, B.headH || 1.3, 0.14, B.head, 3.55, (B.headH || 1.3) / 2, -3.95, r * 0.75), k.shadow(2.6, 3.5, 3.55, -2.5),
  );
  if (B.stripe) g.add(k.rbox(2.08, 0.085, 0.18, B.stripe, 3.55, 0.645, -1.3, 0.03));
  if (B.glow) g.add(k.rbox(2.16, 0.05, 3.06, k.glow(B.glow, 2.2), 3.55, 0.04, -2.5, 0.02));
  if (B.posts) {
    const H = B.postH || 2.6;
    for (const x of [2.56, 4.54]) for (const z of [-1.06, -3.94]) g.add(k.cyl(0.055, 0.065, H, B.posts, x, H / 2, z, null, 12), k.ball(0.08, B.finial || B.posts, x, H + 0.05, z, null, 12, 8));
    for (const z of [-1.06, -3.94]) g.add(k.rbox(2.06, 0.08, 0.08, B.posts, 3.55, H - 0.04, z, 0.02));
    for (const x of [2.56, 4.54]) g.add(k.rbox(0.08, 0.08, 2.9, B.posts, x, H - 0.04, -2.5, 0.02));
    if (B.drape) {
      g.add(k.rbox(2.04, 0.04, 2.86, B.drape, 3.55, H - 0.02, -2.5, 0.015));
      g.add(k.rbox(2.04, 0.36, 0.05, B.drape, 3.55, H - 0.2, -1.04, 0.02));
      for (const x of [2.56, 4.54]) g.add(k.rbox(0.05, 0.36, 2.86, B.drape, x, H - 0.2, -2.5, 0.02));
      for (const x of [2.62, 4.48]) g.add(k.rbox(0.22, H - 0.5, 0.16, B.drape, x, (H - 0.5) / 2 + 0.3, -1.12, 0.06), k.rbox(0.3, H - 0.3, 0.12, B.drape, x, (H - 0.3) / 2 + 0.15, -3.86, 0.05));
    }
  }
}

// escritorio con la plaza (pantalla), lámpara y repisa con libros
function buildDesk(k, g, fx, S) {
  g.add(k.rbox(1.9, 0.08, 0.85, S.top, 1.0, 0.78, -3.5, 0.03));
  if (S.legW) for (const [x, z] of [[0.12, -3.83], [1.88, -3.83], [0.12, -3.17], [1.88, -3.17]]) g.add(k.rbox(S.legW, 0.76, S.legW, S.leg, x, 0.38, z, 0.02));
  else for (const [x, z] of [[0.1, -3.85], [1.9, -3.85], [0.1, -3.15], [1.9, -3.15]]) g.add(k.cyl(0.035, 0.035, 0.76, S.leg, x, 0.38, z));
  g.add(k.shadow(2.3, 1.2, 1.0, -3.5));
  const screenTex = canvasTex(256, 160, plaza(S.screen));
  if (S.screenKind === 'holo') {
    const scr = k.plane(0.86, 0.54, new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 0.9, 1.22, -3.7);
    g.add(scr, k.cyl(0.16, 0.18, 0.04, S.dark, 0.9, 0.84, -3.7, { metalness: 0.6, roughness: 0.35 }, 24), k.cyl(0.12, 0.12, 0.012, k.glow(S.screen.ink, 2), 0.9, 0.865, -3.7, null, 24));
    fx.push((t) => { scr.material.opacity = 0.78 + Math.sin(t * 0.006) * 0.06; });
  } else {
    const ornate = S.screenKind === 'mirror';
    const fw = ornate ? 1.0 : 0.9, fh = ornate ? 0.68 : 0.58;
    g.add(k.rbox(fw, fh, 0.05, S.dark, 0.9, 1.18, -3.73, 0.02, ornate ? { metalness: 0.8, roughness: 0.3 } : undefined));
    g.add(k.plane(0.82, 0.5, k.basic('#ffffff', { map: screenTex }), 0.9, 1.18, -3.7));
    g.add(k.cyl(0.03, 0.03, 0.18, S.dark, 0.9, 0.9, -3.75), k.cyl(0.14, 0.14, 0.02, S.dark, 0.9, 0.83, -3.75));
    if (ornate) g.add(k.ball(0.06, S.dark, 0.9, 1.56, -3.73, { metalness: 0.8, roughness: 0.3 }, 12, 8));
  }
  // lámpara
  const lx = 1.65, lz = -3.6;
  if (S.lamp === 'candles') {
    g.add(k.cyl(0.1, 0.12, 0.03, S.lampColor, lx, 0.83, lz, { metalness: 0.7, roughness: 0.35 }), k.cyl(0.015, 0.02, 0.36, S.lampColor, lx, 1.0, lz, { metalness: 0.7, roughness: 0.35 }));
    const arm = k.rbox(0.42, 0.025, 0.025, S.lampColor, lx, 1.12, lz, 0.01, { metalness: 0.7, roughness: 0.35 });
    g.add(arm);
    for (const dx of [-0.2, 0, 0.2]) { const y = dx ? 1.2 : 1.26; g.add(k.cyl(0.025, 0.025, dx ? 0.14 : 0.26, S.candle || '#f3ead6', lx + dx, y - (dx ? 0.0 : 0.06), lz)); flame(k, g, fx, lx + dx, y + (dx ? 0.1 : 0.1), lz, { size: 0.025, light: dx === 0 ? S.lampLight : null, power: 2.6, dist: 4.5 }); }
  } else if (S.lamp === 'lantern') {
    g.add(k.rbox(0.2, 0.04, 0.2, S.lampColor, lx, 0.84, lz, 0.01), k.rbox(0.17, 0.3, 0.17, k.glow(S.lampGlow || '#fff1c9', 1.3), lx, 1.0, lz, 0.02), k.rbox(0.22, 0.04, 0.22, S.lampColor, lx, 1.17, lz, 0.01));
    for (const [dx, dz] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) g.add(k.rbox(0.02, 0.32, 0.02, S.lampColor, lx + dx, 1.0, lz + dz, 0.005));
    pointLight(g, S.lampLight, 2.5, lx, 1.15, -3.45, 4.5);
  } else if (S.lamp === 'neon') {
    g.add(k.cyl(0.08, 0.1, 0.03, S.dark, lx, 0.83, lz, null, 16), k.cyl(0.025, 0.025, 0.6, k.glow(S.lampColor, 3), lx, 1.14, lz, null, 12));
    pointLight(g, S.lampLight, 2.6, lx, 1.15, -3.45, 4.5);
  } else if (S.lamp === 'oil') {
    const body = k.ball(0.09, S.lampColor, lx, 0.88, lz, { metalness: 0.7, roughness: 0.35 }, 16, 10);
    body.scale.set(1.5, 0.6, 1);
    g.add(body, k.cyl(0.02, 0.03, 0.08, S.lampColor, lx + 0.13, 0.9, lz, { metalness: 0.7, roughness: 0.35 }, 10));
    flame(k, g, fx, lx + 0.14, 0.98, lz, { size: 0.03, light: S.lampLight, power: 2.6, dist: 4.5, ly: 0.17 });
  } else {
    g.add(k.cyl(0.1, 0.12, 0.03, S.lampColor, lx, 0.83, lz), k.cyl(0.015, 0.015, 0.42, S.lampColor, lx, 1.04, lz), k.cyl(0.07, 0.17, 0.18, S.lampColor, lx, 1.3, lz, { emissive: S.lampColor, emissiveIntensity: 0.25 }));
    pointLight(g, S.lampLight, 2.5, lx, 1.15, -3.45, 4.5).decay = 1.4;
  }
}

function buildShelf(k, g, S) {
  if (!S) return;
  g.add(k.rbox(1.7, 0.06, 0.3, S.board, 1.0, 2.15, -3.85, 0.02));
  let bx = 0.3;
  for (const [h, c] of S.books) { g.add(k.rbox(0.11, h, 0.22, c, bx, 2.18 + h / 2, -3.84, 0.015)); bx += 0.13; }
  if (S.vase) g.add(k.cyl(0.12, 0.09, 0.16, S.vase, 1.55, 2.26, -3.84));
}

// planta en el rincón
function buildPlant(k, g, fx, S) {
  const x = -4.35, z = -3.4;
  g.add(k.shadow(1, 1, x, z));
  const pot = () => {
    if (S.potKind === 'barrel') {
      g.add(k.cyl(0.32, 0.28, 0.55, S.pot, x, 0.28, z, null, 20));
      for (const y of [0.12, 0.44]) g.add(k.cyl(0.33, 0.33, 0.04, '#3a3a3a', x, y, z, { metalness: 0.6, roughness: 0.4 }, 20));
    } else if (S.potKind === 'amphora') {
      const am = k.ball(0.3, S.pot, x, 0.36, z, null, 20, 14);
      am.scale.set(1, 1.25, 1);
      g.add(am, k.cyl(0.16, 0.2, 0.18, S.pot, x, 0.78, z, null, 20), k.cyl(0.2, 0.16, 0.05, S.pot, x, 0.88, z, null, 20));
      return 0.9;
    } else if (S.potKind === 'stand') {
      g.add(k.rbox(0.72, 0.42, 0.62, S.stand, x, 0.21, z, 0.03), k.rbox(0.62, 0.14, 0.42, S.pot, x, 0.49, z, 0.03));
      return 0.56;
    } else {
      g.add(k.cyl(0.32, 0.24, 0.55, S.pot, x, 0.28, z, S.potMetal ? { metalness: 0.7, roughness: 0.35 } : undefined));
    }
    return 0.55;
  };
  const top = pot();
  const leafy = (n, colors, sc, y0, glow) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = colors[i % colors.length];
      const leaf = k.ball(0.22, glow ? k.glow(c, glow) : c, x + Math.cos(a) * 0.18, y0 + (i % 3) * 0.12, z + Math.sin(a) * 0.18);
      leaf.scale.set(...sc);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(leaf);
    }
  };
  if (S.kind === 'bonsai') {
    const tr = S.trunk || '#5a3b26';
    const t1 = k.cyl(0.05, 0.08, 0.45, tr, x + 0.05, top + 0.2, z, null, 10); t1.rotation.z = -0.35;
    const t2 = k.cyl(0.035, 0.05, 0.4, tr, x - 0.06, top + 0.52, z, null, 10); t2.rotation.z = 0.6;
    g.add(t1, t2);
    for (const [dx, dy, dz, s] of [[-0.2, 0.7, 0, 1], [0.18, 0.55, 0.05, 0.8], [0.02, 0.85, -0.05, 0.75], [-0.05, 0.6, 0.18, 0.6]]) {
      const c = k.ball(0.24, dx > 0 ? S.leaves[0] : S.leaves[1], x + dx, top + dy, z + dz, null, 14, 8);
      c.scale.set(1.2 * s, 0.45 * s, 1 * s);
      g.add(c);
    }
  } else if (S.kind === 'palm') {
    let px = x, py = top;
    for (let i = 0; i < 6; i++) { const seg = k.cyl(0.06, 0.075, 0.24, S.trunk || '#8a6a44', px, py + 0.12, z, null, 10); seg.rotation.z = -0.08 * i; g.add(seg); px += 0.025 * i; py += 0.22; }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const fr = k.ball(0.3, S.leaves[i % 2], px + Math.cos(a) * 0.3, py + 0.02, z + Math.sin(a) * 0.3, null, 12, 6);
      fr.scale.set(1.4, 0.08, 0.32);
      fr.rotation.set(0, -a, -0.45);
      g.add(fr);
    }
    g.add(k.ball(0.06, '#6b4a2a', px, py - 0.05, z + 0.05, null, 10, 6), k.ball(0.06, '#6b4a2a', px + 0.06, py - 0.06, z - 0.03, null, 10, 6));
  } else if (S.kind === 'topiary') {
    g.add(k.cyl(0.03, 0.035, 0.55, S.trunk || '#6b4a2a', x, top + 0.27, z, null, 10));
    const b = k.ball(0.36, S.leaves[0], x, top + 0.78, z, null, 20, 14);
    g.add(b);
    for (let i = 0; i < 26; i++) { const u = Math.random() * Math.PI * 2, v = Math.acos(rnd(-1, 1)); g.add(k.ball(0.07, S.leaves[1], x + Math.sin(v) * Math.cos(u) * 0.34, top + 0.78 + Math.cos(v) * 0.34, z + Math.sin(v) * Math.sin(u) * 0.34, null, 8, 6)); }
    if (S.berries) for (let i = 0; i < 8; i++) { const u = (i / 8) * Math.PI * 2; g.add(k.ball(0.035, S.berries, x + Math.cos(u) * 0.37, top + 0.8 + Math.sin(u * 3) * 0.12, z + Math.sin(u) * 0.37, null, 8, 6)); }
  } else if (S.kind === 'crystal') {
    const geo = k.geo('oct', () => new THREE.OctahedronGeometry(0.16, 0));
    const shards = [];
    for (const [dx, dz, h, c] of [[0, 0, 1.4, 0], [0.14, 0.06, 0.9, 1], [-0.12, 0.08, 1, 0], [0.05, -0.14, 0.7, 1], [-0.1, -0.1, 0.6, 1]]) {
      const m = k.mesh(geo, k.glow(S.leaves[c], 1.2, { roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.9 }), x + dx, top + 0.16 * h * 1.6, z + dz);
      m.scale.set(0.6, h * 1.6, 0.6);
      m.rotation.set(dz * 2, 0, -dx * 2);
      g.add(m); shards.push(m);
    }
    const l = pointLight(g, S.leaves[0], 1.6, x, top + 0.5, z + 0.3, 3);
    fx.push((t) => { l.intensity = 1.6 + Math.sin(t * 0.0025) * 0.4; });
  } else {
    leafy(S.n || 9, S.leaves, S.leafScale || [0.55, 1.6, 0.35], top + 0.4, S.glow);
    if (S.flowers) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; g.add(k.ball(0.06, S.flowers, x + Math.cos(a) * 0.26, top + 0.62 + (i % 3) * 0.13, z + Math.sin(a) * 0.26, null, 10, 8)); }
  }
}

// ───────────────────────────── adornos propios de cada tema ─────────────────────────────

const sconce = (k, g, fx, x, y, z, side, { metal = '#2a2a2a', flameCol = '#ffb84a', light = '#ff9a3c', power = 2.4, torch = false } = {}) => {
  // side 'back' (pared del fondo) o 'left' (pared izquierda)
  const off = 0.16, px = side === 'left' ? x + off : x, pz = side === 'left' ? z : z + off;
  g.add(k.rbox(side === 'left' ? 0.04 : 0.14, 0.24, side === 'left' ? 0.14 : 0.04, metal, x + (side === 'left' ? 0.02 : 0), y - 0.05, z + (side === 'left' ? 0 : 0.02), 0.01, { metalness: 0.6, roughness: 0.4 }));
  const arm = k.rbox(side === 'left' ? 0.18 : 0.03, 0.03, side === 'left' ? 0.03 : 0.18, metal, x + (side === 'left' ? 0.09 : 0), y - 0.12, z + (side === 'left' ? 0 : 0.09), 0.01, { metalness: 0.6, roughness: 0.4 });
  g.add(arm);
  if (torch) {
    const st = k.cyl(0.035, 0.025, 0.36, '#5a3a22', px, y, pz, null, 8);
    st.rotation[side === 'left' ? 'z' : 'x'] = side === 'left' ? -0.3 : 0.3;
    g.add(st, k.cyl(0.05, 0.04, 0.08, metal, px + (side === 'left' ? 0.05 : 0), y + 0.18, pz + (side === 'left' ? 0 : 0.05), null, 10));
    flame(k, g, fx, px + (side === 'left' ? 0.05 : 0), y + 0.29, pz + (side === 'left' ? 0 : 0.05), { size: 0.06, color: flameCol, light, power, dist: 5, ly: 0.1 });
  } else {
    g.add(k.cyl(0.06, 0.04, 0.03, metal, px, y - 0.1, pz, null, 12), k.cyl(0.03, 0.03, 0.16, '#efe6d2', px, y, pz, null, 10));
    flame(k, g, fx, px, y + 0.12, pz, { size: 0.028, color: flameCol, light, power, dist: 4.5 });
  }
};
const banner = (k, g, x, y, z, w, h, side, paint, rod = '#6b4a2a') => {
  const tex = canvasTex(128, Math.round((128 * h) / w), paint);
  const m = k.plane(w, h, k.std('#ffffff', { map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), x, y, z, side === 'left' ? Math.PI / 2 : 0);
  const r = k.cyl(0.025, 0.025, w + 0.2, rod, x, y + h / 2 + 0.02, z, null, 10);
  if (side === 'left') r.rotation.x = Math.PI / 2; else r.rotation.z = Math.PI / 2;
  g.add(m, r);
};
const bannerPaint = (bg, trim, emblem) => (c, w, h) => {
  c.fillStyle = bg; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(w / 2, h - w * 0.35); c.lineTo(0, h); c.closePath(); c.fill();
  c.strokeStyle = trim; c.lineWidth = 8; c.stroke();
  emblem(c, w, h);
};

const neonStrip = (k, g, color, w, h, d, x, y, z, i = 3) => g.add(k.rbox(w, h, d, k.glow(color, i), x, y, z, Math.min(w, h, d) / 2));

const EXTRAS = {
  gothic(k, g, fx) {
    sconce(k, g, fx, -3.35, 2.5, BZ, 'back', { metal: '#1a1420' });
    sconce(k, g, fx, LX, 2.5, -2.4, 'left', { metal: '#1a1420' });
    // arcos ciegos sobre la cama y nervaduras
    for (const x of [-4.95, 2.3, 4.95]) g.add(k.rbox(0.18, WALL_H, 0.12, '#2a2234', x, WALL_H / 2, BZ + 0.06, 0.03));
    for (const z of [-3.95, -2.4, 2.4]) g.add(k.rbox(0.12, WALL_H, 0.18, '#2a2234', LX + 0.06, WALL_H / 2, z, 0.03));
    g.add(k.rbox(W, 0.14, 0.12, '#2a2234', 0, 3.85, BZ + 0.06, 0.03), k.rbox(0.12, 0.14, D, '#2a2234', LX + 0.06, 3.85, 0, 0.03));
    // calavera y velas en la repisa
    g.add(k.ball(0.09, '#e9e2cf', 0.25, 2.27, -3.8, null, 14, 10), k.rbox(0.1, 0.06, 0.08, '#e9e2cf', 0.25, 2.2, -3.76, 0.02));
    g.add(k.ball(0.022, '#120a18', 0.22, 2.28, -3.72, null, 8, 6), k.ball(0.022, '#120a18', 0.28, 2.28, -3.72, null, 8, 6));
    // ventanal: rosetón arriba
    const rose = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#1a0d22'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { c.fillStyle = ['#c0264a', '#5a2a9a', '#2a6ab0', '#d9a62a'][i % 4]; c.beginPath(); c.moveTo(64, 64); c.arc(64, 64, 58, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2); c.fill(); }
      disc(c, 64, 64, 18, '#d9a62a'); c.strokeStyle = '#1a0d22'; c.lineWidth = 6; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.cos((i / 8) * Math.PI * 2) * 64, 64 + Math.sin((i / 8) * Math.PI * 2) * 64); c.stroke(); }
    });
    const rm = k.mesh(new THREE.CircleGeometry(0.42, 32), k.basic('#ffffff', { map: rose }), 3.55, 3.05, BZ + 0.01);
    g.add(rm, k.mesh(new THREE.TorusGeometry(0.44, 0.05, 8, 32), k.std('#2a2234'), 3.55, 3.05, BZ + 0.03));
  },
  roman(k, g) {
    const marbleC = '#efe9de';
    const column = (x, z, side) => {
      const px = side === 'left' ? LX + 0.12 : x, pz = side === 'left' ? z : BZ + 0.12;
      g.add(k.cyl(0.14, 0.16, WALL_H - 0.5, marbleC, px, (WALL_H - 0.5) / 2 + 0.2, pz, null, 16));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(k.rbox(0.025, WALL_H - 0.6, 0.025, '#d8d0c0', px + Math.cos(a) * 0.15, (WALL_H - 0.5) / 2 + 0.2, pz + Math.sin(a) * 0.15, 0.01)); }
      g.add(k.rbox(0.42, 0.2, 0.42, marbleC, px, 0.1, pz, 0.03), k.rbox(0.42, 0.16, 0.42, marbleC, px, WALL_H - 0.22, pz, 0.03));
      g.add(k.cyl(0.2, 0.15, 0.12, marbleC, px, WALL_H - 0.36, pz, null, 16));
    };
    column(-3.4, 0, 'back'); column(2.25, 0, 'back'); column(0, -2.4, 'left');
    // cornisa
    g.add(k.rbox(W, 0.16, 0.22, marbleC, 0, WALL_H - 0.08, BZ + 0.11, 0.03), k.rbox(0.22, 0.16, D, marbleC, LX + 0.11, WALL_H - 0.08, 0, 0.03));
    g.add(k.rbox(W, 0.06, 0.12, '#c1693c', 0, WALL_H - 0.2, BZ + 0.06, 0.02), k.rbox(0.12, 0.06, D, '#c1693c', LX + 0.06, WALL_H - 0.2, 0, 0.02));
    // corona de laurel sobre el sofá
    const ring = k.mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 32), k.std('#5f7a3a'), LX + 0.06, 2.45, 0.5);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 1.5) < 0.35) continue;
      const lf = k.ball(0.08, i % 2 ? '#6f8f42' : '#86a852', LX + 0.08, 2.45 + Math.sin(a) * 0.42, 0.5 + Math.cos(a) * 0.42, null, 8, 6);
      lf.scale.set(0.4, 1.4, 0.6); lf.rotation.x = -a + (i % 2 ? 0.5 : -0.5);
      g.add(lf);
    }
    g.add(k.rbox(0.03, 0.3, 0.06, '#c9302c', LX + 0.08, 1.95, 0.42, 0.01), k.rbox(0.03, 0.3, 0.06, '#c9302c', LX + 0.08, 1.95, 0.58, 0.01));
    // fresco sobre la cama
    const fr = canvasTex(256, 160, (c, w, h) => {
      grad(c, w, h, [[0, '#9ad0e6'], [1, '#f2e2c4']]);
      ridge(c, w, h, '#8a9a5a', [[0, 110], [80, 96], [170, 112], [w, 100]]);
      c.fillStyle = '#c1693c'; c.fillRect(110, 70, 40, 40); c.beginPath(); c.moveTo(104, 70); c.lineTo(130, 52); c.lineTo(156, 70); c.fill();
      c.fillStyle = '#efe9de'; for (let i = 0; i < 4; i++) c.fillRect(114 + i * 10, 76, 4, 34);
      c.fillStyle = '#3d5a2a'; for (const x of [40, 60, 210]) { c.beginPath(); c.ellipse(x, 100, 8, 30, 0, 0, 7); c.fill(); }
      c.strokeStyle = '#7a2a1a'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    });
    g.add(k.plane(1.8, 1.1, k.std('#ffffff', { map: fr }), 3.55, 2.45, BZ + 0.012));
  },
  japanese(k, g) {
    const wood = '#4a3020';
    for (const x of [-4.94, -3.25, 2.25, 4.94]) g.add(k.rbox(0.14, WALL_H, 0.1, wood, x, WALL_H / 2, BZ + 0.05, 0.02));
    for (const z of [-3.94, -2.4, 2.4]) g.add(k.rbox(0.1, WALL_H, 0.14, wood, LX + 0.05, WALL_H / 2, z, 0.02));
    g.add(k.rbox(W, 0.14, 0.12, wood, 0, 3.45, BZ + 0.06, 0.02), k.rbox(0.12, 0.14, D, wood, LX + 0.06, 3.45, 0, 0.02));
    // farol de papel colgando en el rincón
    const lp = k.ball(0.26, k.glow('#fff0d0', 0.9), -3.95, 3.0, -3.3, null, 16, 12);
    lp.scale.y = 1.25;
    g.add(lp, k.cyl(0.12, 0.12, 0.05, '#2a1a12', -3.95, 3.34, -3.3, null, 14), k.cyl(0.12, 0.12, 0.05, '#2a1a12', -3.95, 2.66, -3.3, null, 14), k.cyl(0.008, 0.008, 0.9, '#2a1a12', -3.95, 3.8, -3.3, null, 6));
    pointLight(g, '#ffd9a0', 1.6, -3.95, 3.0, -3.0, 4);
    // rama de cerezo en un jarrón sobre la repisa
    const br = k.cyl(0.012, 0.016, 0.5, '#4a2a20', 1.55, 2.55, -3.84, null, 6); br.rotation.z = -0.4;
    g.add(br);
    for (let i = 0; i < 9; i++) g.add(k.ball(0.035, i % 2 ? '#ffb7cf' : '#ffd6e3', 1.55 + 0.05 + rnd(0, 0.2), 2.45 + rnd(0, 0.32), -3.84 + rnd(-0.06, 0.06), null, 8, 6));
  },
  scandi(k, g) {
    // estantes hexagonales y una lámpara colgante
    const hex = k.geo('hex', () => new THREE.CylinderGeometry(0.3, 0.3, 0.2, 6, 1, true));
    const wood = k.std('#d9b98c', { side: THREE.DoubleSide });
    for (const [y, z] of [[2.2, -2.55], [2.62, -2.2]]) { const h = k.mesh(hex, wood, LX + 0.11, y, z); h.rotation.z = Math.PI / 2; h.rotation.x = Math.PI / 6; g.add(h); }
    g.add(k.cyl(0.07, 0.06, 0.1, '#ffffff', LX + 0.12, 2.1, -2.55, null, 14), k.ball(0.09, '#6f9a6a', LX + 0.12, 2.2, -2.55, null, 10, 8));
    g.add(k.rbox(0.12, 0.16, 0.06, '#e6b04a', LX + 0.1, 2.56, -2.25, 0.02));
    // lámpara de pie (arco) en el rincón libre de la pared izquierda, junto al sofá
    g.add(k.cyl(0.16, 0.18, 0.04, '#2b2b2b', -4.72, 0.02, 2.6, null, 20), k.cyl(0.018, 0.018, 1.7, '#2b2b2b', -4.72, 0.87, 2.6, null, 8), k.cyl(0.1, 0.24, 0.24, '#2b2b2b', -4.6, 1.78, 2.6, { side: THREE.DoubleSide }, 20), k.ball(0.06, k.glow('#fff4dc', 2), -4.6, 1.7, 2.6, null, 10, 8));
    pointLight(g, '#fff0d6', 1.4, -4.4, 1.6, 2.4, 5);
    // manta tejida a los pies de la cama
    g.add(k.rbox(2.08, 0.1, 0.5, '#c9b9a0', 3.55, 0.66, -1.35, 0.04));
  },
  cyberpunk(k, g, fx) {
    // tubos de neón en zócalo y esquinas
    neonStrip(k, g, '#ff2fd0', W, 0.04, 0.04, 0, 0.08, BZ + 0.04);
    neonStrip(k, g, '#00e5ff', 0.04, 0.04, D, LX + 0.04, 0.08, 0);
    neonStrip(k, g, '#00e5ff', W, 0.04, 0.04, 0, 3.7, BZ + 0.04);
    neonStrip(k, g, '#ff2fd0', 0.04, 0.04, D, LX + 0.04, 3.7, 0);
    neonStrip(k, g, '#9b5cff', 0.05, WALL_H, 0.05, LX + 0.05, WALL_H / 2, BZ + 0.05);
    // letrero de neón sobre el sofá
    const sign = canvasTex(512, 192, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.font = 'bold 128px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = '#ff2fd0'; c.shadowBlur = 28; c.fillStyle = '#ffd0f4'; c.fillText('7ots', w / 2, h / 2 + 6);
      c.shadowBlur = 10; c.fillText('7ots', w / 2, h / 2 + 6);
    });
    const sm = new THREE.MeshBasicMaterial({ map: sign, transparent: true, depthWrite: false, toneMapped: false });
    g.add(k.plane(2.2, 0.82, sm, LX + 0.07, 2.5, 0.5, Math.PI / 2));
    const pink = pointLight(g, '#ff2fd0', 3, -4.3, 2.4, 0.5, 5);
    fx.push((t) => { const on = Math.sin(t * 0.0021) > -0.96 || Math.sin(t * 0.05) > 0; sm.opacity = on ? 1 : 0.35; pink.intensity = on ? 3 : 1; });
    pointLight(g, '#00e5ff', 2.4, 3.5, 2.6, -1.4, 6);
    // persiana/panel con anuncios sobre la cama
    const ad = canvasTex(128, 256, (c, w, h) => {
      c.fillStyle = '#0b0618'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#00e5ff'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center';
      for (const [i, ch] of ['ネ', 'オ', 'ン'].entries()) c.fillText(ch, w / 2, 70 + i * 60);
      c.strokeStyle = '#00e5ff'; c.lineWidth = 4; c.strokeRect(10, 10, w - 20, h - 20);
    });
    g.add(k.plane(0.6, 1.2, k.basic('#ffffff', { map: ad }), 4.4, 2.6, BZ + 0.012));
  },
  beach(k, g) {
    // tabla de surf apoyada en la pared izquierda (fuera del camino) y salvavidas en la pared
    const board = k.ball(0.5, '#ffcf4a', LX + 0.12, 1.1, -2.42, null, 20, 14);
    board.scale.set(0.08, 2.1, 0.5); board.rotation.z = -0.12;
    g.add(board);
    const stripe = k.ball(0.5, '#ff6f61', LX + 0.15, 1.1, -2.42, null, 20, 14);
    stripe.scale.set(0.08, 2.0, 0.12); stripe.rotation.z = -0.12;
    g.add(stripe);
    const buoy = k.mesh(new THREE.TorusGeometry(0.3, 0.09, 12, 32), k.std('#ffffff'), 3.55, 2.5, BZ + 0.1);
    g.add(buoy);
    for (let i = 0; i < 4; i++) { const seg = k.mesh(new THREE.TorusGeometry(0.3, 0.095, 12, 6, Math.PI / 4), k.std('#ef4444'), 3.55, 2.5, BZ + 0.1); seg.rotation.z = (i * Math.PI) / 2; g.add(seg); }
    // conchas y estrella de mar en la repisa
    g.add(k.ball(0.07, '#ffd7c2', 0.3, 2.22, -3.8, null, 10, 8), k.ball(0.05, '#fff1e0', 0.45, 2.21, -3.78, null, 10, 8));
    const star = k.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 5), k.std('#ff8a5b'), 0.75, 2.2, -3.8);
    g.add(star);
    // guirnalda de luces sobre la ventana
    for (let i = 0; i < 9; i++) { const x = WX - 1.4 + i * 0.35, y = 3.6 - Math.sin((i / 8) * Math.PI) * 0.18; g.add(k.ball(0.04, k.glow(i % 2 ? '#ffe28a' : '#ffffff', 1.6), x, y, BZ + 0.08, null, 8, 6)); }
  },
  cabin(k, g, fx) {
    // chimenea de piedra en la pared del fondo
    const fx0 = -3.3;
    const stone = canvasTex(256, 256, stones({ cols: ['#8a8378', '#7a7368', '#9a9488', '#6e675e'], grout: '#4a453f', rows: 7, minW: 40, maxW: 80 }));
    stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
    stone.repeat.set(0.8, WALL_H * 0.8);
    const st = k.std('#ffffff', { map: stone });
    g.add(k.mesh(new THREE.BoxGeometry(1.0, WALL_H, 0.3), st, fx0, WALL_H / 2, BZ + 0.15));
    g.add(k.rbox(1.16, 0.1, 0.42, '#5a3a22', fx0, 1.2, BZ + 0.2, 0.02));
    g.add(k.mesh(new THREE.BoxGeometry(0.62, 0.55, 0.05), k.std('#120a06'), fx0, 0.45, BZ + 0.29));
    g.add(k.rbox(1.12, 0.08, 0.5, '#6e675e', fx0, 0.04, BZ + 0.3, 0.02));
    for (const dz of [0.22, 0.3]) { const lg = k.cyl(0.05, 0.05, 0.5, '#5a3a22', fx0, 0.24, BZ + dz, null, 10); lg.rotation.z = Math.PI / 2; lg.rotation.y = dz > 0.25 ? 0.3 : -0.3; g.add(lg); }
    const fire = [];
    for (const [dx, h, c] of [[-0.12, 0.3, '#ff7a1a'], [0.1, 0.26, '#ff9a2a'], [0, 0.38, '#ffcf4a']]) { const f = k.mesh(k.geo(`cone${h}`, () => new THREE.ConeGeometry(0.08, h, 10)), k.basic(c), fx0 + dx, 0.3 + h / 2, BZ + 0.24); g.add(f); fire.push([f, h]); }
    const fl = pointLight(g, '#ff8a3a', 3.2, fx0, 0.6, BZ + 0.7, 6);
    fx.push((t) => { const q = 1 + Math.sin(t * 0.017) * 0.12 + Math.sin(t * 0.041) * 0.08; fl.intensity = 3.2 * q; fire.forEach(([f], i) => f.scale.set(1, q + Math.sin(t * 0.02 + i) * 0.1, 1)); });
    // leña apilada y astas
    g.add(k.rbox(0.03, 0.4, 0.5, '#5a3a22', LX + 0.03, 2.5, -2.4, 0.01));
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const a = k.cyl(0.018, 0.025, 0.32 - i * 0.06, '#e9dcc0', LX + 0.15 + i * 0.03, 2.62 + i * 0.12, -2.4 + s * (0.1 + i * 0.09), null, 6); a.rotation.x = s * (0.6 + i * 0.25); g.add(a); }
  },
  space(k, g, fx) {
    // franjas de LED y un panel de control parpadeante
    neonStrip(k, g, '#5ce1ff', W, 0.03, 0.03, 0, 3.6, BZ + 0.04, 2.5);
    neonStrip(k, g, '#5ce1ff', 0.03, 0.03, D, LX + 0.04, 3.6, 0, 2.5);
    g.add(k.rbox(0.08, 0.7, 1.0, '#3b4552', LX + 0.04, 1.9, -2.4, 0.03, { metalness: 0.6, roughness: 0.35 }));
    const leds = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const m = k.ball(0.03, k.basic(['#5ce1ff', '#ff6b6b', '#7dff8a'][(i + j) % 3], { transparent: true }), LX + 0.09, 1.72 + j * 0.16, -2.75 + i * 0.22, null, 8, 6); m.material = m.material.clone(); g.add(m); leds.push(m); }
    fx.push((t) => { leds.forEach((m, i) => { m.material.opacity = Math.sin(t * 0.004 + i * 1.7) > 0 ? 1 : 0.25; }); });
    // tubos del techo
    for (const z of [-3.2, -3.5]) { const p = k.cyl(0.05, 0.05, W, '#8a95a3', 0, 3.95, z, { metalness: 0.7, roughness: 0.3 }, 12); p.rotation.z = Math.PI / 2; g.add(p); }
    // mapa estelar sobre la cama
    const map = canvasTex(256, 160, (c, w, h) => {
      c.fillStyle = '#06101e'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(92,225,255,.25)'; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.strokeStyle = '#5ce1ff'; c.lineWidth = 2; c.beginPath(); c.ellipse(128, 80, 90, 40, 0, 0, 7); c.stroke(); c.beginPath(); c.ellipse(128, 80, 50, 22, 0, 0, 7); c.stroke();
      disc(c, 128, 80, 10, '#ffd36b'); disc(c, 218, 80, 5, '#ff8a5b'); disc(c, 160, 59, 4, '#7dff8a');
    });
    g.add(k.rbox(1.9, 1.1, 0.06, '#3b4552', 3.55, 2.5, BZ + 0.03, 0.03, { metalness: 0.6, roughness: 0.35 }), k.plane(1.76, 0.96, k.basic('#ffffff', { map }), 3.55, 2.5, BZ + 0.065));
  },
  castle(k, g, fx) {
    sconce(k, g, fx, -3.35, 2.2, BZ, 'back', { torch: true, metal: '#2a2420' });
    sconce(k, g, fx, LX, 2.2, -2.4, 'left', { torch: true, metal: '#2a2420' });
    // estandartes sobre la cama
    const lion = (c, w, h) => { c.fillStyle = '#e8c35a'; c.beginPath(); c.moveTo(w / 2, h * 0.22); c.lineTo(w * 0.78, h * 0.32); c.lineTo(w * 0.72, h * 0.55); c.lineTo(w / 2, h * 0.66); c.lineTo(w * 0.28, h * 0.55); c.lineTo(w * 0.22, h * 0.32); c.fill(); c.fillStyle = '#7a1a1a'; c.fillRect(w / 2 - 4, h * 0.3, 8, h * 0.3); c.fillRect(w * 0.32, h * 0.4, w * 0.36, 8); };
    banner(k, g, 2.95, 2.55, BZ + 0.02, 0.7, 1.5, 'back', bannerPaint('#8e1b1b', '#e8c35a', lion));
    banner(k, g, 4.15, 2.55, BZ + 0.02, 0.7, 1.5, 'back', bannerPaint('#1f3c8a', '#e8c35a', lion));
    // escudo y espadas sobre el sofá
    const sh = k.cyl(0.42, 0.42, 0.06, '#1f3c8a', LX + 0.06, 2.45, 0.5, { metalness: 0.2, roughness: 0.6 }, 32);
    sh.rotation.z = Math.PI / 2; sh.scale.set(1, 1, 1);
    g.add(sh, k.mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 32), k.std('#c9a64a', { metalness: 0.8, roughness: 0.3 }), LX + 0.1, 2.45, 0.5));
    g.children[g.children.length - 1].rotation.y = Math.PI / 2;
    g.add(k.rbox(0.03, 0.5, 0.08, '#e8c35a', LX + 0.1, 2.45, 0.5, 0.01), k.rbox(0.03, 0.08, 0.5, '#e8c35a', LX + 0.1, 2.5, 0.5, 0.01));
    for (const s of [-1, 1]) {
      const sw = k.rbox(0.03, 1.3, 0.06, '#c8ccd2', LX + 0.04, 2.45, 0.5, 0.01, { metalness: 0.9, roughness: 0.2 });
      sw.rotation.x = s * 0.7; g.add(sw);
      const gd = k.rbox(0.04, 0.05, 0.3, '#7a5a2a', LX + 0.05, 2.45 - Math.cos(0.7) * 0.5, 0.5 - s * Math.sin(0.7) * 0.5, 0.01);
      gd.rotation.x = s * 0.7; g.add(gd);
    }
    // almenas pintadas: viga de madera en lo alto
    g.add(k.rbox(W, 0.2, 0.16, '#4a3020', 0, 3.9, BZ + 0.08, 0.02), k.rbox(0.16, 0.2, D, '#4a3020', LX + 0.08, 3.9, 0, 0.02));
  },
};

// ───────────────────────────── los temas ─────────────────────────────

const COZY = {
  bg: '#2a1f55',
  light: { hemi: ['#e8ecff', '#40304e', 0.56], amb: ['#ffe9d6', 0.25], key: 1, env: 0.45, exposure: 1.05 },
  floor: { paint: planks({ base: '#b97f52', a: '#c38a5c', b: '#b07649', seam: 'rgba(60,30,10,.35)', grain: '80,40,15' }), repeat: [2.5, 2], rough: 0.7, metal: 0 },
  wall: { back: '#b6a3ea', left: '#a895e0', paint: null, tile: 2.5 },
  wains: { back: '#8a76cf', left: '#7f6bc6', rail: '#f4efff', h: 1.1, paint: null, railGlow: 0 },
  win: { shape: 'rect', bars: 'cross', frame: '#fbf8ff', sky: SKY.cozy, curtain: '#ff9fb8', curtainH: 0, curtainY: 0, rod: null, shaft: '#ffe2a8', shaftOp: 0.22, patch: '#ffd49a', patchOp: 0.55, dust: '#fff3d0', sun: ['#ffd9a0', 1.3] },
  sofa: { kind: 'sofa', a: '#3aa6a0', b: '#5cc4bd', pillow: '#ffd23f' },
  art: { frame: '#fbf8ff', items: [[-0.2, '#ff8fb1', 0.9, 0.7], [1.0, '#7ee0c3', 0.7, 0.9]] },
  table: { kind: 'table', top: '#e8d5b5', leg: '#c9b38f', candle: '#fff6e6', flame: '#ffcf6b', light: '#ffb35c', power: 2.2, orb: null },
  rug: { shape: 'circle', a: '#d9739b', b: '#ffd0e0' },
  bed: { frame: '#8a5a3b', head: '#7a4d31', sheet: '#fbf8ff', blanket: '#8b7bff', pillow: '#ffffff' },
  desk: { top: '#e9d8bd', leg: '#cfbd9f', dark: '#2b2440', screenKind: 'monitor', screen: { bg: '#1c1550', ink: '#ffd23f', dots: ['#8b7bff', '#7ee0c3', '#ff8fb1', '#8fd3ff'] }, lamp: 'lamp', lampColor: '#ffd23f', lampLight: '#ffd08a' },
  shelf: { board: '#e9d8bd', books: [[0.36, '#ef4444'], [0.42, '#3b82f6'], [0.32, '#ffd23f'], [0.4, '#7ee0c3'], [0.3, '#a855f7'], [0.38, '#f97316']], vase: '#fbf8ff' },
  plant: { kind: 'leafy', pot: '#d9774b', leaves: ['#58b86c', '#3f9d55'] },
};

const THEMES = {
  cozy: { emoji: '🏠' },
  gothic: {
    emoji: '🦇',
    bg: '#120a1c',
    light: { hemi: ['#b8a8ff', '#2a1020', 0.36], amb: ['#c9a0ff', 0.14], key: 0.55, env: 0.3, exposure: 1.1 },
    floor: { paint: planks({ base: '#2e1f1c', a: '#3a2722', b: '#2a1b18', seam: 'rgba(0,0,0,.5)', grain: '0,0,0', n: 8 }), rough: 0.55 },
    wall: { back: '#8f8aa0', left: '#7c7790', paint: stones({ cols: ['#5c566a', '#534d60', '#665f74', '#4c4658'], grout: '#2c2836', rows: 6 }), tile: 2.2 },
    wains: { back: '#3a1a2a', left: '#321624', rail: '#2a2234', h: 0.9 },
    win: { shape: 'pointed', frame: '#2a2234', sky: SKY.gothic, curtain: '#8e1030', curtainH: 2.9, curtainY: 2.05, rod: '#c9a64a', shaft: '#b9b8ff', shaftOp: 0.18, patch: '#a7a6ff', patchOp: 0.4, dust: '#d8d0ff', sun: ['#9aa0ff', 1.0] },
    sofa: { kind: 'sofa', a: '#4a1a5c', b: '#5e2470', pillow: '#a3122e', backH: 1.45, tufts: '#c9a64a', legs: '#c9a64a', r: 0.08 },
    art: { frame: '#c9a64a', frameMetal: true, items: [[-0.2, '#000', 0.7, 0.9, (c, w, h) => { grad(c, w, h, [[0, '#2a1830'], [1, '#100812']]); disc(c, w / 2, h * 0.38, w * 0.2, '#d8c6b0'); c.fillStyle = '#1a0d14'; c.fillRect(w * 0.25, h * 0.55, w * 0.5, h * 0.5); }], [1.15, '#000', 0.7, 0.9, (c, w, h) => { grad(c, w, h, [[0, '#2e1a1a'], [1, '#0c0608']]); disc(c, w / 2, h * 0.4, w * 0.18, '#cdb8a8'); c.fillStyle = '#5a0f1f'; c.fillRect(w * 0.22, h * 0.56, w * 0.56, h * 0.5); }]] },
    table: { top: '#2a1b18', leg: '#c9a64a', candle: '#efe6d2', flame: '#ffb84a', light: '#ff9a3c', power: 2.6 },
    rug: { shape: 'rect', a: '#5a0f1f', b: '#c9a64a', c: '#3a0814', pattern: 'medallion' },
    bed: { frame: '#2a1b18', head: '#1f1412', sheet: '#d8cfe0', blanket: '#5a0f1f', pillow: '#e8e0ec', headH: 1.6, posts: '#1f1412', postH: 2.75, drape: '#4a1a5c', finial: '#c9a64a' },
    desk: { top: '#2e1f1c', leg: '#1f1412', legW: 0.1, dark: '#c9a64a', screenKind: 'mirror', screen: { bg: '#170b22', ink: '#c9a64a', dots: ['#a3122e', '#7a4cff', '#c9a64a', '#d8d0ff'], font: 'italic bold 24px serif' }, lamp: 'candles', lampColor: '#c9a64a', lampLight: '#ffad5c' },
    shelf: { board: '#2e1f1c', books: [[0.36, '#3a0814'], [0.42, '#1f1430'], [0.34, '#2a2a1a'], [0.4, '#5a0f1f'], [0.3, '#1a2a2a'], [0.38, '#3a1a4a']], vase: null },
    plant: { kind: 'leafy', pot: '#1f1a24', potMetal: true, leaves: ['#1f3a2a', '#2a4a30'], flowers: '#b0102e', n: 9 },
  },
  roman: {
    emoji: '🏛️',
    bg: '#2a2030',
    light: { hemi: ['#fff6e6', '#6a5040', 0.62], amb: ['#fff0dc', 0.3], key: 1.05, env: 0.5, exposure: 1.05 },
    floor: { paint: checker({ a: '#efe6d6', b: '#c1693c', n: 8, vein: '#9a8a78', grout: 'rgba(80,50,30,.35)' }), repeat: [2.5, 2], rough: 0.45 },
    wall: { back: '#ffffff', left: '#ece6dc', paint: marble('#f3ece0', '#b8a890'), tile: 3 },
    wains: { back: '#ffffff', left: '#eeeeee', rail: '#efe9de', h: 1.0, paint: meander('#a8452a', '#efe2c4') },
    win: { shape: 'arch', bars: 'none', frame: '#efe9de', sky: SKY.roman, curtain: null, shaft: '#fff0c8', shaftOp: 0.24, patch: '#ffe6b0', patchOp: 0.55, dust: '#fff6dc', sun: ['#fff0c8', 1.4] },
    sofa: { kind: 'bench', frame: '#e8e1d4', a: '#a8452a', b: '#c1693c', pillow: null, bolster: '#d4a64a', trim: '#c9a64a' },
    art: { items: [] },
    table: { top: '#e8e1d4', leg: '#c9a64a', candle: '#f3ead6', flame: '#ffcf6b', light: '#ffb35c', power: 2.2 },
    rug: { shape: 'rect', a: '#efe2c4', b: '#a8452a', c: '#c1693c', pattern: 'medallion' },
    bed: { frame: '#e8e1d4', head: '#d8d0c0', sheet: '#fbf8f0', blanket: '#a8452a', pillow: '#d4a64a', stripe: '#d4a64a', r: 0.05 },
    desk: { top: '#ece6dc', leg: '#c9a64a', dark: '#c9a64a', screenKind: 'mirror', screen: { bg: '#3a2418', ink: '#e8c35a', dots: ['#c1693c', '#86a852', '#efe2c4', '#e8c35a'], font: 'bold 22px serif' }, lamp: 'oil', lampColor: '#b8862a', lampLight: '#ffcf8a' },
    shelf: { board: '#ece6dc', books: [[0.3, '#e9dcb8'], [0.3, '#d9c9a0'], [0.3, '#e9dcb8'], [0.3, '#d9c9a0']], vase: '#c1693c' },
    plant: { kind: 'topiary', potKind: 'amphora', pot: '#b8582e', leaves: ['#4e6e2e', '#6f8f42'], berries: '#2a2a40' },
  },
  japanese: {
    emoji: '🏯',
    bg: '#1e1a24',
    light: { hemi: ['#fff4e6', '#5a4a3a', 0.58], amb: ['#ffeedd', 0.28], key: 1, env: 0.45, exposure: 1.05 },
    floor: { paint: tatami, repeat: [3, 2.4], rough: 0.9 },
    wall: { back: '#ffffff', left: '#ece4d4', paint: plaster('#efe4cc'), tile: 2.5 },
    wains: { back: '#5a3b26', left: '#4e3320', rail: '#4a3020', h: 0.3 },
    win: { shape: 'rect', bars: 'grid', frame: '#4a3020', sky: SKY.japanese, curtain: null, shaft: '#ffd9c8', shaftOp: 0.22, patch: '#ffd0b8', patchOp: 0.5, dust: '#fff0e8', sun: ['#ffd6c0', 1.3] },
    sofa: { kind: 'bench', frame: '#5a3b26', a: '#2c3e6b', b: '#34497a', pillow: '#c0392b', back: 1.2 },
    art: { frame: '#3a2418', items: [[0.5, '#000', 0.6, 1.5, (c, w, h) => {
      c.fillStyle = '#f4ecd8'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7a8a6a'; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 14, w, 14);
      c.fillStyle = 'rgba(30,30,40,.75)'; c.beginPath(); c.moveTo(10, h * 0.7); c.lineTo(46, h * 0.45); c.lineTo(70, h * 0.58); c.lineTo(100, h * 0.36); c.lineTo(w - 6, h * 0.7); c.fill();
      disc(c, w * 0.7, h * 0.24, 12, '#c0392b');
      c.fillStyle = '#222'; c.font = 'bold 30px serif'; c.textAlign = 'center'; c.fillText('和', w / 2, h * 0.86);
    }, 2.2]] },
    table: { top: '#4a3020', leg: '#3a2418', candle: '#f4ecd8', flame: '#ffcf6b', light: '#ffb35c', power: 2.0 },
    rug: { shape: 'rect', a: '#2c3e6b', b: '#e9e0c8', c: '#3a5080', pattern: 'border' },
    bed: { frame: '#5a3b26', head: '#4a3020', sheet: '#f6f1e6', blanket: '#2c3e6b', pillow: '#e9e0c8', headH: 0.8, stripe: '#e9e0c8', r: 0.03 },
    desk: { top: '#5a3b26', leg: '#3a2418', legW: 0.08, dark: '#2a1a12', screen: { bg: '#f4ecd8', ink: '#c0392b', dots: ['#2c3e6b', '#7a8a6a', '#c0392b', '#d9a62a'], line: 'rgba(40,30,20,.45)' }, lamp: 'lantern', lampColor: '#2a1a12', lampGlow: '#fff1d0', lampLight: '#ffd9a0' },
    shelf: { board: '#5a3b26', books: [[0.3, '#2c3e6b'], [0.34, '#c0392b'], [0.28, '#e9e0c8']], vase: '#2a2a30' },
    plant: { kind: 'bonsai', potKind: 'stand', stand: '#4a3020', pot: '#2a3a4a', leaves: ['#3e6a3a', '#4f7d45'], trunk: '#5a3b26' },
  },
  scandi: {
    emoji: '🌿',
    bg: '#2a2e36',
    light: { hemi: ['#f4f7ff', '#6a6a70', 0.66], amb: ['#ffffff', 0.32], key: 1.05, env: 0.55, exposure: 1.05 },
    floor: { paint: planks({ base: '#d9bf98', a: '#e2caa6', b: '#d4b88f', seam: 'rgba(120,90,60,.25)', grain: '140,100,60', n: 8 }), rough: 0.65 },
    wall: { back: '#f1efe9', left: '#e6e3dc' },
    wains: null,
    win: { shape: 'rect', bars: 'cross', frame: '#2b2b2b', sky: SKY.scandi, curtain: '#e8e2d6', shaft: '#f0f6ff', shaftOp: 0.2, patch: '#eef4ff', patchOp: 0.45, dust: '#ffffff', sun: ['#eef4ff', 1.2] },
    sofa: { kind: 'sofa', a: '#9aa3a8', b: '#aeb6ba', pillow: '#e6b04a', legs: '#c9a273', r: 0.08 },
    art: { frame: '#2b2b2b', items: [[-0.25, '#000', 0.7, 0.95, (c, w, h) => { c.fillStyle = '#f4efe6'; c.fillRect(0, 0, w, h); disc(c, w / 2, h * 0.42, w * 0.26, '#e6b04a'); c.fillStyle = '#6f8f86'; c.fillRect(0, h * 0.62, w, h * 0.38); }], [0.95, '#000', 0.7, 0.95, (c, w, h) => { c.fillStyle = '#ece6dc'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2b2b2b'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h * 0.75, w * 0.32, Math.PI, 0); c.stroke(); c.beginPath(); c.moveTo(w * 0.2, h * 0.3); c.bezierCurveTo(w * 0.4, h * 0.1, w * 0.6, h * 0.5, w * 0.8, h * 0.3); c.stroke(); c.fillStyle = '#c96f4a'; c.beginPath(); c.arc(w * 0.68, h * 0.55, 10, 0, 7); c.fill(); }]] },
    table: { top: '#d9b98c', leg: '#2b2b2b', candle: '#ffffff', flame: '#ffcf6b', light: '#ffc27a', power: 2.0 },
    rug: { shape: 'rect', a: '#f0ebe0', b: '#2b2b2b', c: '#2b2b2b', pattern: 'diamond' },
    bed: { frame: '#d9b98c', head: '#cfae80', sheet: '#ffffff', blanket: '#9cb3a0', pillow: '#f2f2f2', headH: 1.0 },
    desk: { top: '#f4f4f2', leg: '#d9b98c', dark: '#2b2b2b', screen: { bg: '#2f3640', ink: '#e6b04a', dots: ['#9cb3a0', '#e6b04a', '#c96f4a', '#aeb6ba'] }, lamp: 'lamp', lampColor: '#2b2b2b', lampLight: '#fff0d6' },
    shelf: { board: '#d9b98c', books: [[0.36, '#e8e2d6'], [0.42, '#9cb3a0'], [0.32, '#2b2b2b'], [0.4, '#c96f4a'], [0.3, '#aeb6ba']], vase: '#ffffff' },
    plant: { kind: 'leafy', pot: '#f4f4f2', leaves: ['#2e5a3a', '#3e7048'], leafScale: [0.9, 1.6, 0.18], n: 8 },
  },
  cyberpunk: {
    emoji: '🌃',
    bg: '#07040f',
    light: { hemi: ['#8a7bff', '#200a30', 0.3], amb: ['#9a7bff', 0.12], key: 0.45, env: 0.25, exposure: 1.1 },
    floor: { paint: neonGrid, repeat: [2.5, 2], rough: 0.35, metal: 0.3 },
    wall: { back: '#ffffff', left: '#d8d8e8', paint: concrete('#2a2438'), tile: 2.5 },
    wains: { back: '#16121f', left: '#13101c', rail: '#00e5ff', h: 0.5, railGlow: 2.5 },
    win: { shape: 'rect', bars: 'grid', frame: '#1a1626', sky: SKY.cyberpunk, curtain: null, shaft: '#ff6fd8', shaftOp: 0.16, patch: '#ff4fd8', patchOp: 0.35, dust: '#9ff6ff', sun: ['#d06cff', 0.9] },
    sofa: { kind: 'sofa', a: '#1e1a2e', b: '#2a2440', pillow: '#00e5ff', r: 0.16, glow: '#ff2fd0' },
    art: { items: [] },
    table: { top: '#1a1626', leg: '#3a3550', orb: '#00e5ff', light: '#00e5ff', power: 2.0 },
    rug: { shape: 'circle', a: '#140d2a', b: '#ff2fd0', glow: true },
    bed: { frame: '#1a1626', head: '#221d33', sheet: '#2a2440', blanket: '#3a1f6e', pillow: '#5a4a8a', r: 0.14, glow: '#00e5ff', headH: 1.0 },
    desk: { top: '#1a1626', leg: '#3a3550', dark: '#2a2438', screenKind: 'holo', screen: { bg: '#001a24', ink: '#00e5ff', dots: ['#ff2fd0', '#00e5ff', '#ffe36b', '#9b5cff'], line: 'rgba(0,229,255,.6)' }, lamp: 'neon', lampColor: '#ff2fd0', lampLight: '#ff4fd8' },
    shelf: { board: '#2a2438', books: [[0.36, '#ff2fd0'], [0.42, '#1e1a2e'], [0.32, '#00e5ff'], [0.4, '#2a2440'], [0.3, '#9b5cff']], vase: null },
    plant: { kind: 'leafy', pot: '#1e1a2e', potMetal: true, leaves: ['#00ffa3', '#00c2ff'], glow: 0.9 },
  },
  beach: {
    emoji: '🏖️',
    bg: '#123a4a',
    light: { hemi: ['#f0fbff', '#8a7a5a', 0.66], amb: ['#fff8e8', 0.32], key: 1.05, env: 0.55, exposure: 1.05 },
    floor: { paint: planks({ base: '#d8c3a0', a: '#e3d0ae', b: '#cfb994', seam: 'rgba(120,90,60,.3)', grain: '150,120,80', n: 8 }), rough: 0.8 },
    wall: { back: '#ffffff', left: '#e8f2f2', paint: beadboard('#bfe6e0', 'rgba(60,110,110,.25)'), tile: 2 },
    wains: { back: '#f4efe4', left: '#e8e2d6', rail: '#ffffff', h: 1.0 },
    win: { shape: 'rect', bars: 'cross', frame: '#ffffff', sky: SKY.beach, curtain: '#f6ecd8', shaft: '#fff2c0', shaftOp: 0.26, patch: '#ffe8a8', patchOp: 0.55, dust: '#fffbe6', sun: ['#fff0c0', 1.45] },
    sofa: { kind: 'bench', frame: '#c8a26a', a: '#f4efe4', b: '#5fc4c0', pillow: '#ff6f61', back: 1.1 },
    art: { frame: '#ffffff', items: [[0.5, '#000', 1.3, 0.8, (c, w, h) => { grad(c, w, h, [[0, '#8fd3ff'], [0.55, '#d8f2ff'], [0.56, '#2ab0c6'], [1, '#5fe0d6']]); disc(c, w * 0.75, h * 0.3, 10, '#fff2b0'); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(w * 0.3, h * 0.55); c.lineTo(w * 0.36, h * 0.2); c.lineTo(w * 0.42, h * 0.55); c.fill(); c.fillStyle = '#7a4a2a'; c.fillRect(w * 0.25, h * 0.55, w * 0.22, 5); }]] },
    table: { kind: 'table', top: '#c8a26a', leg: '#a8824a', candle: '#ffffff', flame: '#ffcf6b', light: '#ffb35c', power: 2.0 },
    rug: { shape: 'rect', a: '#f6ecd8', b: '#2a9db0', c: '#5fc4c0', pattern: 'stripes' },
    bed: { frame: '#e8e2d6', head: '#f4efe4', sheet: '#ffffff', blanket: '#5fc4c0', pillow: '#ffe0d0', stripe: '#ff6f61' },
    desk: { top: '#e3d0ae', leg: '#c8a26a', dark: '#2a3a44', screen: { bg: '#0f4a5a', ink: '#ffe28a', dots: ['#ff6f61', '#5fc4c0', '#ffe28a', '#ffffff'] }, lamp: 'lamp', lampColor: '#ff6f61', lampLight: '#ffe0b0' },
    shelf: { board: '#c8a26a', books: [[0.36, '#2a9db0'], [0.32, '#f6ecd8'], [0.4, '#ff6f61']], vase: '#5fc4c0' },
    plant: { kind: 'palm', pot: '#c8a26a', leaves: ['#2f8a4a', '#45a85a'], trunk: '#9a7a4a' },
  },
  cabin: {
    emoji: '🪵',
    bg: '#1a1210',
    light: { hemi: ['#ffe8d0', '#40281a', 0.46], amb: ['#ffd8b0', 0.2], key: 0.8, env: 0.38, exposure: 1.08 },
    floor: { paint: planks({ base: '#5a3a24', a: '#6a442a', b: '#4e321f', seam: 'rgba(20,10,0,.55)', grain: '20,10,0', n: 6 }), rough: 0.7 },
    wall: { back: '#ffffff', left: '#e6dcd0', paint: logs({ cols: ['#9a6a3e', '#8a5c34', '#a67444'] }), tile: 2.1 },
    wains: null,
    win: { shape: 'rect', bars: 'cross', frame: '#5a3a22', sky: SKY.cabin, curtain: '#a8302a', rod: '#3a2418', shaft: '#ffc8a0', shaftOp: 0.16, patch: '#ffb890', patchOp: 0.4, dust: '#ffe6d0', sun: ['#ffb890', 0.9] },
    sofa: { kind: 'sofa', a: '#7a4a2a', b: '#8a5634', pillow: '#a8302a', r: 0.1, legs: '#3a2418' },
    art: { frame: '#5a3a22', items: [[0.5, '#000', 1.2, 0.8, SKY.cabin]] },
    table: { kind: 'stump', top: '#7a5434', leg: '#c9a273', candle: '#f4ead6', flame: '#ffcf6b', light: '#ffb35c', power: 2.2 },
    rug: { shape: 'oval', a: '#e8dcc4', b: '#a8302a' },
    bed: { frame: '#6a442a', head: '#5a3a22', sheet: '#f4ead6', blanket: '#a8302a', pillow: '#f4ead6', stripe: '#2a2a2a', posts: '#6a442a', postH: 1.5, finial: '#6a442a' },
    desk: { top: '#6a442a', leg: '#4e321f', legW: 0.1, dark: '#2a1a12', screen: { bg: '#20140e', ink: '#ffcf6b', dots: ['#a8302a', '#6f9a5a', '#e8dcc4', '#ffcf6b'] }, lamp: 'lantern', lampColor: '#2a2a2a', lampGlow: '#ffd8a0', lampLight: '#ffb870' },
    shelf: { board: '#6a442a', books: [[0.36, '#7a2a20'], [0.42, '#2f4a3a'], [0.32, '#c9a273'], [0.4, '#5a3a22'], [0.3, '#a8302a']], vase: '#e8dcc4' },
    plant: { kind: 'leafy', potKind: 'barrel', pot: '#7a5434', leaves: ['#2f5a34', '#3e6e40', '#285030'], leafScale: [0.35, 1.9, 0.2], n: 13 },
  },
  space: {
    emoji: '🚀',
    bg: '#05060f',
    light: { hemi: ['#dfeaff', '#1a2030', 0.45], amb: ['#cfe4ff', 0.18], key: 0.8, env: 0.5, exposure: 1.05 },
    floor: { paint: metalPlates({ base: '#4a525c', light: '#6b747f', seam: '#2a3038', rivet: '#8a949f' }), repeat: [2.5, 2], rough: 0.4, metal: 0.55 },
    wall: { back: '#ffffff', left: '#e2e8ef', paint: panels({ base: '#c9d2dc', line: '#8a95a3', dark: '#3b4552' }), tile: 2.5 },
    wains: { back: '#3b4552', left: '#343d49', rail: '#5ce1ff', h: 0.6, railGlow: 2 },
    win: { shape: 'round', frame: '#9aa5b2', plate: '#5a6470', sky: SKY.space, curtain: null, shaft: '#9fd8ff', shaftOp: 0.1, patch: '#9fd8ff', patchOp: 0.25, dust: '#cfeaff', sun: ['#bfe0ff', 0.8] },
    sofa: { kind: 'sofa', a: '#e8edf2', b: '#3b4b63', pillow: '#ff8a3c', r: 0.18, glow: '#5ce1ff' },
    art: { items: [] },
    table: { top: '#d0d8e2', leg: '#7a8592', orb: '#5ce1ff', light: '#5ce1ff', power: 2.0 },
    rug: { shape: 'circle', a: '#2a3240', b: '#5ce1ff', glow: true },
    bed: { frame: '#e8edf2', head: '#d0d8e2', sheet: '#f4f8fc', blanket: '#3b4b63', pillow: '#ffffff', r: 0.16, glow: '#5ce1ff', stripe: '#ff8a3c' },
    desk: { top: '#e8edf2', leg: '#7a8592', dark: '#3b4552', screenKind: 'holo', screen: { bg: '#02121e', ink: '#5ce1ff', dots: ['#ff8a3c', '#7dff8a', '#5ce1ff', '#ffd36b'], line: 'rgba(92,225,255,.6)' }, lamp: 'neon', lampColor: '#5ce1ff', lampLight: '#9fe8ff' },
    shelf: { board: '#9aa5b2', books: [[0.3, '#3b4b63'], [0.3, '#e8edf2'], [0.3, '#ff8a3c'], [0.3, '#3b4b63']], vase: null },
    plant: { kind: 'crystal', pot: '#7a8592', potMetal: true, leaves: ['#c77dff', '#5ce1ff'] },
  },
  castle: {
    emoji: '🏰',
    bg: '#141218',
    light: { hemi: ['#f0e8ff', '#3a2a20', 0.46], amb: ['#ffe2c0', 0.2], key: 0.85, env: 0.38, exposure: 1.08 },
    floor: { paint: stones({ cols: ['#77726a', '#6a655e', '#827c73', '#5f5a54'], grout: '#3a3632', rows: 4, minW: 90, maxW: 170 }), repeat: [2.5, 2], rough: 0.85 },
    wall: { back: '#ffffff', left: '#e0dcd6', paint: stones({ cols: ['#9a958c', '#8d8880', '#a6a198', '#857f77'], grout: '#5a5650', rows: 7 }), tile: 2.2 },
    wains: null,
    win: { shape: 'arch', bars: 'cross', frame: '#6a655e', sky: SKY.castle, curtain: null, shaft: '#fff0d0', shaftOp: 0.22, patch: '#ffe6b8', patchOp: 0.5, dust: '#fff3d8', sun: ['#ffe8c0', 1.25] },
    sofa: { kind: 'bench', frame: '#5a3a22', a: '#8e1b1b', b: '#a32424', pillow: '#e8c35a', back: 1.6 },
    art: { items: [] },
    table: { top: '#5a3a22', leg: '#3a2418', candle: '#efe6d2', flame: '#ffb84a', light: '#ff9a3c', power: 2.4 },
    rug: { shape: 'rect', a: '#8e1b1b', b: '#e8c35a', c: '#6a1010', pattern: 'border' },
    bed: { frame: '#5a3a22', head: '#4a3020', sheet: '#efe6d2', blanket: '#1f3c8a', pillow: '#efe6d2', stripe: '#e8c35a', posts: '#4a3020', postH: 2.7, drape: '#1f3c8a', finial: '#e8c35a', headH: 1.5 },
    desk: { top: '#5a3a22', leg: '#3a2418', legW: 0.12, dark: '#8a6a2a', screenKind: 'mirror', screen: { bg: '#2a1c10', ink: '#e8c35a', dots: ['#8e1b1b', '#1f3c8a', '#e8c35a', '#86b860'], font: 'bold 22px serif' }, lamp: 'candles', lampColor: '#8a6a2a', lampLight: '#ffad5c' },
    shelf: { board: '#5a3a22', books: [[0.36, '#5a1a10'], [0.42, '#1f2c5a'], [0.34, '#4a3a20'], [0.4, '#2a4a2a']], vase: '#c9a64a' },
    plant: { kind: 'topiary', potKind: 'barrel', pot: '#6a442a', leaves: ['#3e5a2e', '#4f6e38'], berries: '#c0392b' },
  },
};

/** Los tipos de casa, en el orden del selector. El nombre sale de i18n: `room.themes.<id>`. */
export const ROOM_THEMES = Object.entries(THEMES).map(([id, t]) => ({ id, emoji: t.emoji }));
export const DEFAULT_ROOM_THEME = 'cozy';

const resolve = (id) => {
  const T = THEMES[id] || THEMES.cozy;
  const P = {};
  for (const [key, def] of Object.entries(COZY)) {
    if (T[key] === null) P[key] = null;
    else if (def && typeof def === 'object' && !Array.isArray(def)) P[key] = { ...def, ...T[key] };
    else P[key] = T[key] ?? def;
  }
  return P;
};

/** Construye la pieza con el tema `id` dentro de `scene`. */
export function buildRoom(scene, id = DEFAULT_ROOM_THEME) {
  const theme = THEMES[id] ? id : DEFAULT_ROOM_THEME;
  const P = resolve(theme);
  const k = kit();
  const g = new THREE.Group();
  g.name = `room:${theme}`;
  const fx = [];

  // suelo
  const floorTex = canvasTex(512, 512, P.floor.paint);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(...P.floor.repeat);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), k.std('#ffffff', { map: floorTex, roughness: P.floor.rough, metalness: P.floor.metal || 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  g.add(floor);

  // paredes (con textura, el color es un tinte) y zócalo
  let backMat, leftMat;
  if (P.wall.paint) {
    const tex = canvasTex(512, 512, P.wall.paint);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const t2 = tex.clone();
    tex.repeat.set(W / P.wall.tile, WALL_H / P.wall.tile);
    t2.repeat.set(D / P.wall.tile, WALL_H / P.wall.tile);
    t2.needsUpdate = true;
    backMat = k.std(P.wall.back, { map: tex });
    leftMat = k.std(P.wall.left, { map: t2 });
  } else {
    backMat = k.std(P.wall.back);
    leftMat = k.std(P.wall.left);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, WALL_H), backMat);
  back.position.set(0, WALL_H / 2, BZ);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(D, WALL_H), leftMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(LX, WALL_H / 2, 0);
  g.add(back, left);
  if (P.wains) {
    const Z = P.wains, h = Z.h;
    g.add(k.rbox(W, h, 0.06, Z.back, 0, h / 2, BZ + 0.03, 0.02), k.rbox(0.06, h, D, Z.left, LX + 0.03, h / 2, 0, 0.02));
    if (Z.paint) {
      const tb = canvasTex(512, 64, Z.paint);
      tb.wrapS = THREE.RepeatWrapping;
      const tl = tb.clone();
      tb.repeat.set(W / (h * 8), 1); tl.repeat.set(D / (h * 8), 1); tl.needsUpdate = true;
      g.add(k.plane(W, h, k.std('#ffffff', { map: tb }), 0, h / 2, BZ + 0.062), k.plane(D, h, k.std('#ffffff', { map: tl }), LX + 0.062, h / 2, 0, Math.PI / 2));
    }
    if (Z.rail) {
      const rm = Z.railGlow ? k.glow(Z.rail, Z.railGlow) : Z.rail;
      g.add(k.rbox(W, 0.08, 0.08, rm, 0, h + 0.02, BZ + 0.05, 0.03), k.rbox(0.08, 0.08, D, rm, LX + 0.05, h + 0.02, 0, 0.03));
    }
  }

  buildWindow(k, g, P);
  buildShaft(k, g, fx, P);
  buildSofa(k, g, P.sofa);
  buildArt(k, g, P.art);
  buildTable(k, g, fx, P.table);
  buildRug(k, g, P.rug);
  buildBed(k, g, P.bed);
  buildDesk(k, g, fx, P.desk);
  buildShelf(k, g, P.shelf);
  buildPlant(k, g, fx, P.plant);
  EXTRAS[theme]?.(k, g, fx, P);

  scene.add(g);
  return {
    id: theme,
    group: g,
    floor,
    look: { bg: P.bg, ...P.light },
    tick(t, dt) { for (const f of fx) f(t, dt); },
  };
}
