/**
 * Creador de ots por pasos: Cuerpo → Cara → Pintar → Accesorios, con el ot en 3D grande al centro
 * (se gira arrastrando y reacciona a cada cambio) y, a la derecha, miniaturas 2D de cada opción
 * aplicada sobre el propio ot, colores y ajustes finos.
 *
 *   const c = createStepCreator(el, { value: look.character, locale: 'es', onChange: (spec) => …, onPlay: () => … });
 *   c.value = otroSpec;   // sin disparar onChange
 *   c.destroy();
 *
 * Edita solo `look.character` (el spec del personaje). El editor completo (estilos artísticos, mods,
 * carta, imagen) sigue siendo createAvatarEditor.
 */

import '../i18n/messages/character.js';
import '../i18n/messages/creator.js';
import { translator } from '../i18n/index.js';
import {
  createCharacter, renderCharacter, normalizeCharacter, randomCharacter, partLabel,
  SHAPES, EYES, BROWS, MOUTHS, CHEEKS, PATTERNS, FINISHES, TEXTURES, ACCESSORIES, ACCESSORY_GROUPS, PRESETS,
} from '../character/Character.js';
import { STYLES as ART_STYLES } from '../character/styles.js';
import { loadCharacter3D } from '../avatar/three.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

const BODY_COLORS = ['#f3efff', '#ffd6e7', '#ffb4a2', '#ffd23f', '#b8f2a1', '#7ee0c3', '#8fd3ff', '#8b7bff', '#c084fc', '#a0714f', '#5b4636', '#3a3a4a', '#1f1f2b', '#ef4444'];
const ACCENT_COLORS = ['#ffffff', '#c9b8ff', '#ff8fb1', '#ffd23f', '#86efac', '#67e8f9', '#3b82f6', '#a855f7', '#f97316', '#6b4423', '#1a1a24'];
const STEPS = [
  { id: 'body', icon: '🫧', tabs: ['shape', 'style', 'color', 'finish', 'preset'] },
  { id: 'face', icon: '👀', tabs: ['eyes', 'brows', 'mouth', 'cheeks'] },
  { id: 'paint', icon: '🎨', tabs: ['pattern', 'texture'] },
  { id: 'acc', icon: '🎩', tabs: ACCESSORY_GROUPS.map(([g]) => `acc:${g}`) },
];
// una sola pieza por grupo (salvo «extra», que se acumula)
const SINGLE = new Set(['head', 'eyes', 'face', 'neck', 'back']);
const groupOf = (id) => ACCESSORIES.find((b) => b.id === id)?.group;
const toggleAcc = (s, x) => {
  const has = s.accessories.some((a) => a.id === x.id);
  s.accessories = s.accessories.filter((a) => (SINGLE.has(x.group) ? groupOf(a.id) !== x.group : a.id !== x.id));
  if (!has) s.accessories.push({ id: x.id });
};

/** Qué lista de piezas usa cada pestaña: [piezas, tipo para partLabel, aplicar, ¿elegida?, gesto]. */
function lists(get) {
  const L = {
    shape: [SHAPES, 'shapes', (s, x) => { s.body.shape = x.id; s.body.points = null; }, (x) => get().body.shape === x.id, 'bounce'],
    style: [ART_STYLES, 'styles', (s, x) => { s.style = x.id; }, (x) => (get().style || 'none') === x.id, 'celebrate'],
    finish: [FINISHES, 'finishes', (s, x) => { s.finish = x.id; }, (x) => get().finish === x.id, 'bounce'],
    preset: [PRESETS, 'presets', (s, x) => Object.assign(s, normalizeCharacter(x.spec)), () => false, 'celebrate'],
    eyes: [EYES, 'eyes', (s, x) => { s.eyes.type = x.id; }, (x) => get().eyes.type === x.id, 'nod'],
    brows: [BROWS, 'brows', (s, x) => { s.brows.type = x.id; }, (x) => get().brows.type === x.id, 'nod'],
    mouth: [MOUTHS, 'mouths', (s, x) => { s.mouth.type = x.id; }, (x) => get().mouth.type === x.id, 'laugh'],
    cheeks: [CHEEKS, 'cheeks', (s, x) => { s.cheeks.type = x.id; }, (x) => get().cheeks.type === x.id, 'nod'],
    pattern: [PATTERNS, 'patterns', (s, x) => { s.body.pattern = x.id; }, (x) => get().body.pattern === x.id, 'spin'],
    texture: [TEXTURES, 'textures', (s, x) => { s.texture = x.id; }, (x) => get().texture === x.id, 'wiggle'],
  };
  for (const [g] of ACCESSORY_GROUPS) L[`acc:${g}`] = [ACCESSORIES.filter((a) => a.group === g), 'accessories', toggleAcc, (x) => get().accessories.some((a) => a.id === x.id), 'spin'];
  return L;
}

const CSS = `
.osc{container-type:inline-size;--osc-line:color-mix(in srgb,currentColor 14%,transparent);--osc-card:color-mix(in srgb,currentColor 6%,transparent);--osc-hover:color-mix(in srgb,currentColor 11%,transparent);--osc-muted:color-mix(in srgb,currentColor 62%,transparent);--osc-sel:#8b7bff;--osc-accent:#ffd23f;--osc-accent-ink:#1a1240}
.osc *{box-sizing:border-box}
.osc button{font:inherit;color:inherit;cursor:pointer}
.osc button:disabled{opacity:.4;cursor:default}
.osc-wrap{display:grid;grid-template-columns:84px minmax(0,1fr) minmax(300px,380px);height:var(--osc-h,640px);border:1px solid var(--osc-line);border-radius:22px;overflow:hidden;background:radial-gradient(90% 70% at 45% 35%,rgb(150 130 255 / .22),transparent 70%)}
.osc-rail{display:flex;flex-direction:column;gap:6px;padding:14px 8px;border-right:1px solid var(--osc-line)}
.osc-rail button{position:relative;display:grid;justify-items:center;gap:3px;padding:10px 4px;border:1px solid transparent;border-radius:14px;background:none;color:var(--osc-muted);font-size:12px;font-weight:600}
.osc-rail button i{font-style:normal;font-size:22px;line-height:1;filter:grayscale(.6)}
.osc-rail button:hover{background:var(--osc-card);color:inherit}
.osc-rail button[aria-current=step]{background:rgb(139 123 255 / .2);border-color:rgb(139 123 255 / .55);color:inherit}
.osc-rail button[aria-current=step] i,.osc-rail button.done i,.osc-rail .osc-play i{filter:none}
.osc-rail button.done::after{content:"✓";position:absolute;top:5px;right:7px;font-size:10px;color:#6ee7b7}
.osc-rail .osc-play{margin-top:auto;background:var(--osc-accent);color:var(--osc-accent-ink)}
.osc-rail .osc-play:hover{background:var(--osc-accent);color:var(--osc-accent-ink);filter:brightness(1.06)}
.osc-stage{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;padding:10px}
.osc-prev{position:relative;width:100%;flex:1;min-height:0;max-width:560px}
.osc-prev>svg{width:100%;height:100%}
.osc-ped{width:min(46%,300px);height:40px;margin-top:-34px;border-radius:50%;background:radial-gradient(ellipse at center,color-mix(in srgb,currentColor 16%,transparent),color-mix(in srgb,currentColor 4%,transparent) 60%,transparent 72%);border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);pointer-events:none}
.osc-tools{display:flex;gap:8px;align-items:center;margin-top:8px}
.osc-chip{width:38px;height:38px;border-radius:50%;border:1px solid var(--osc-line);background:var(--osc-card);font-size:17px;padding:0}
.osc-chip.osc-dim{font-size:12px;font-weight:800}
.osc-chip:hover{background:rgb(139 123 255 / .3)}
.osc-hint{margin:6px 0 0;color:var(--osc-muted);font-size:12px}
.osc-panel{display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--osc-line);background:color-mix(in srgb,currentColor 3%,transparent)}
.osc-head{padding:16px 18px 0}
.osc-kick{margin:0;color:var(--osc-muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.osc-title{margin:2px 0 12px;font-size:26px;font-weight:800;line-height:1.1}
.osc-tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:color-mix(in srgb,currentColor 7%,transparent);overflow-x:auto;scrollbar-width:none}
.osc-tabs button{flex:1 0 auto;border:0;background:none;color:var(--osc-muted);padding:6px 10px;border-radius:9px;font-weight:600;font-size:13px;white-space:nowrap}
.osc-tabs button[aria-selected=true]{background:color-mix(in srgb,currentColor 13%,transparent);color:inherit}
.osc-body{flex:1;min-height:0;overflow-y:auto;padding:14px 18px}
.osc-foot{display:flex;justify-content:space-between;gap:8px;padding:12px 18px;border-top:1px solid var(--osc-line)}
.osc-mod{display:grid;gap:8px;justify-items:start;margin-bottom:14px;padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,#fde047 55%,transparent);background:color-mix(in srgb,#fde047 12%,transparent)}.osc-mod p{margin:0;font-size:13.5px;line-height:1.4}
.osc-btn{border:1px solid var(--osc-line);background:var(--osc-card);border-radius:999px;padding:8px 14px;font-weight:600}
.osc-btn:hover:not(:disabled){background:var(--osc-hover)}
.osc-btn.p{border:0;background:var(--osc-accent);color:var(--osc-accent-ink);font-weight:700}
.osc-sec{margin:0 0 16px}
.osc-sec h3{margin:0 0 8px;font-size:11px;font-weight:700;color:var(--osc-muted);text-transform:uppercase;letter-spacing:.07em}
.osc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.osc-tile{position:relative;overflow:hidden;display:grid;gap:2px;justify-items:center;padding:5px 3px 7px;border-radius:13px;border:1.5px solid transparent;background:var(--osc-card);color:var(--osc-muted);font-size:11px;line-height:1.15;text-align:center}
.osc-tile svg{width:100%;aspect-ratio:1;height:auto;display:block;transform:scale(1.3)}
.osc-grid.face .osc-tile svg{transform:scale(2.2) translateY(6%)}
.osc-tile span{position:relative}
.osc-tile:hover{background:var(--osc-hover);color:inherit}
.osc-tile[aria-pressed=true]{border-color:var(--osc-sel);background:rgb(139 123 255 / .2);color:inherit}
.osc-tile[aria-pressed=true]::after{content:"✓";position:absolute;top:4px;right:5px;width:16px;height:16px;border-radius:50%;background:var(--osc-sel);color:#fff;font-size:10px;line-height:16px}
.osc-sws{display:flex;flex-wrap:wrap;gap:7px}
.osc-sw{width:30px;height:30px;border-radius:50%;border:2px solid color-mix(in srgb,currentColor 18%,transparent);padding:0}
.osc-sw[aria-pressed=true]{outline:2.5px solid currentColor;outline-offset:2px}
.osc-pick{position:relative;overflow:hidden;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)}
.osc-pick input{position:absolute;inset:-8px;opacity:0;cursor:pointer}
.osc-sl{display:grid;grid-template-columns:84px 1fr;align-items:center;gap:10px;margin:5px 0;color:var(--osc-muted);font-size:13px}
.osc-sl input{accent-color:var(--osc-sel)}
@container (max-width:820px){
  .osc-wrap{grid-template-columns:1fr;grid-template-rows:auto 340px auto;height:auto}
  .osc-rail{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--osc-line);padding:8px 10px;scrollbar-width:none}
  .osc-rail button{flex:0 0 auto;grid-auto-flow:column;gap:6px;padding:6px 12px;font-size:13px}
  .osc-rail button i{font-size:17px}
  .osc-rail .osc-play{margin:0 0 0 auto}
  .osc-panel{border-left:0;border-top:1px solid var(--osc-line)}
  .osc-body{overflow:visible}
  .osc-hint{display:none}
}
@container (max-width:420px){.osc-grid{grid-template-columns:repeat(3,1fr)}}
`;
let cssDone = false;
const injectCss = () => {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.dataset.ots = 'step-creator';
  s.textContent = CSS;
  document.head.appendChild(s);
};

/**
 * @param {HTMLElement} host
 * @param {{ value?: object, locale?: string, onChange?: (spec:object)=>void, onPlay?: ()=>void, height?: string, material?: string }} [opts]
 */
export function createStepCreator(host, opts = {}) {
  injectCss();
  const t = translator(opts.locale);
  let spec = normalizeCharacter(opts.value || {});
  const undo = [];
  const L = lists(() => spec);
  let stepI = 0;
  const tabOf = STEPS.map((s) => s.tabs[0]);
  const visited = new Set([0]);
  let alive = true;

  const root = document.createElement('div');
  root.className = 'osc';
  root.innerHTML = `<div class="osc-wrap"${opts.height ? ` style="--osc-h:${esc(opts.height)}"` : ''}>
    <nav class="osc-rail" data-rail></nav>
    <section class="osc-stage">
      <div class="osc-prev" data-prev></div>
      <div class="osc-ped" aria-hidden="true"></div>
      <div class="osc-tools">
        <button type="button" class="osc-chip" data-g="wave" aria-label="${esc(partLabel(t, 'gestures', 'wave'))}">👋</button>
        <button type="button" class="osc-chip" data-g="dance" aria-label="${esc(partLabel(t, 'gestures', 'dance'))}">💃</button>
        <button type="button" class="osc-chip" data-g="jump" aria-label="${esc(partLabel(t, 'gestures', 'jump'))}">⤴</button>
        <button type="button" class="osc-chip osc-dim" data-dim title="2D / 3D" aria-label="2D / 3D">2D</button>
        <button type="button" class="osc-chip" data-random title="${esc(t('creator.random'))}" aria-label="${esc(t('creator.random'))}">🎲</button>
        <button type="button" class="osc-chip" data-undo title="${esc(t('creator.undo'))}" aria-label="${esc(t('creator.undo'))}" disabled>↶</button>
      </div>
      <p class="osc-hint">${esc(t('creator.drag'))}</p>
    </section>
    <aside class="osc-panel">
      <header class="osc-head"><p class="osc-kick" data-kick></p><h2 class="osc-title" data-title></h2><nav class="osc-tabs" role="tablist" data-tabs></nav></header>
      <div class="osc-body" data-body></div>
      <footer class="osc-foot"><button type="button" class="osc-btn" data-back></button><button type="button" class="osc-btn p" data-next></button></footer>
    </aside>
  </div>`;
  host.appendChild(root);
  const $ = (s) => root.querySelector(s);

  // vista previa: 3D si se puede, si no el 2D; el chip 2D/3D alterna (el 2D muestra el estilo con su fondo)
  let prev = null;
  let want3d = true;
  let mountN = 0;
  const mountPrev = async () => {
    const n = ++mountN;
    prev?.destroy?.();
    prev = null;
    $('[data-prev]').innerHTML = '';
    let p = null;
    if (want3d) {
      try {
        const m = await loadCharacter3D();
        if (alive && n === mountN && m.webglAvailable()) p = m.createCharacter3D($('[data-prev]'), spec, { material: opts.material || 'plush', orbit: true, stage: { key: 'overlay', zIndex: 2147483001, maxDpr: 1.5 } });
      } catch {}
    }
    if (!alive || n !== mountN) return p?.destroy?.();
    if (!p) want3d = false;
    prev = p || createCharacter($('[data-prev]'), spec);
    $('[data-dim]').textContent = want3d ? '2D' : '3D';
    $('.osc-hint').hidden = !want3d;
  };
  mountPrev();
  let raf = 0;
  const repaint = (gesture) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      prev?.update(spec);
      if (gesture) setTimeout(() => prev?.gesture?.(gesture), 60);
    });
    $('[data-undo]').disabled = !undo.length;
  };
  const change = (mut, gesture) => {
    undo.push(clone(spec));
    if (undo.length > 50) undo.shift();
    const s = clone(spec);
    // a full-body mod (.glb/.vrm) hides everything the steps edit: editing takes it off (undo puts it back)
    if (bodyMod()) s.mods = s.mods.filter((m) => !m.model);
    mut(s);
    spec = normalizeCharacter(s);
    repaint(gesture);
    opts.onChange?.(clone(spec));
  };
  const bodyMod = () => (spec.mods || []).find((m) => m.model);
  const modName = (m) => (m.name && typeof m.name === 'object' ? m.name[opts.locale] || m.name.en || Object.values(m.name)[0] : m.name) || m.id;
  const setPath = (s, path, v) => { const [a, b] = path.split('.'); s[a][b] = v; };

  const tabLabel = (k) => (k.startsWith('acc:') ? partLabel(t, 'groups', k.slice(4)) : t(`creator.tabs.${k}`));
  const thumb = (mut) => { const s = clone(spec); mut(s); return renderCharacter(s, {}, { backdrop: false }); };
  const sec = (title, html) => `<section class="osc-sec"><h3>${esc(title)}</h3>${html}</section>`;
  const sws = (list, cur, key) => `<div class="osc-sws">${list.map((c) => `<button type="button" class="osc-sw" style="background:${c}" data-sw="${key}" data-c="${c}" aria-pressed="${cur === c}" aria-label="${c}"></button>`).join('')}<label class="osc-sw osc-pick" title="${esc(t('creator.otherColor'))}"><input type="color" data-sw="${key}" value="${esc(cur || '#ffffff')}" aria-label="${esc(t('creator.otherColor'))}"></label></div>`;
  const sl = (label, key, v, min, max, step) => `<label class="osc-sl">${esc(label)}<input type="range" data-sl="${key}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;

  function paintRail() {
    $('[data-rail]').innerHTML = STEPS.map((s, i) => `<button type="button" data-step="${i}" class="${visited.has(i) && i !== stepI ? 'done' : ''}" aria-current="${i === stepI ? 'step' : 'false'}"><i>${s.icon}</i>${esc(t(`creator.steps.${s.id}`))}</button>`).join('')
      + (opts.onPlay ? `<button type="button" class="osc-play" data-play><i>▶</i>${esc(t('creator.play'))}</button>` : '');
  }
  function paintBody() {
    const key = tabOf[stepI];
    let html = '';
    if (key === 'color') html = sec(t('creator.bodyColor'), sws(BODY_COLORS, spec.body.color, 'body.color')) + sec(t('creator.eyeColor'), sws(ACCENT_COLORS, spec.eyes.iris, 'eyes.iris'));
    else if (L[key]) {
      const [list, kind, mut, on] = L[key];
      const face = STEPS[stepI].id === 'face' || ['acc:head', 'acc:eyes', 'acc:face'].includes(key);
      html = sec(tabLabel(key), `<div class="osc-grid${face ? ' face' : ''}">${list.map((x, i) => `<button type="button" class="osc-tile" data-i="${i}" aria-pressed="${on(x)}">${thumb((s) => mut(s, x))}<span>${esc(partLabel(t, kind, x.id))}</span></button>`).join('')}</div>`);
      if (key === 'eyes') html = sec(t('creator.adjust'), sl(t('creator.size'), 'eyes.size', spec.eyes.size, 0.6, 1.5, 0.05) + sl(t('creator.spacing'), 'eyes.spacing', spec.eyes.spacing, 0.6, 1.5, 0.05) + sl(t('creator.height'), 'eyes.y', spec.eyes.y, -20, 20, 1)) + html;
      if (key === 'mouth') html = sec(t('creator.adjust'), sl(t('creator.size'), 'mouth.size', spec.mouth.size, 0.6, 1.6, 0.05)) + html;
      if (key === 'brows') html += sec(t('creator.color'), sws(ACCENT_COLORS, spec.brows.color, 'brows.color'));
      if (key === 'cheeks') html += sec(t('creator.color'), sws(ACCENT_COLORS.concat('#ff6b8a'), spec.cheeks.color, 'cheeks.color'));
      if (key === 'pattern') html = sec(t('creator.patternColor'), sws(ACCENT_COLORS, spec.body.patternColor, 'body.patternColor')) + html;
      if (key.startsWith('acc:') && spec.accessories.length) html += `<button type="button" class="osc-btn" data-clear>${esc(t('creator.clearAll', { n: spec.accessories.length }))}</button>`;
    }
    const bm = bodyMod();
    $('[data-body]').innerHTML = (bm ? `<div class="osc-mod"><p>${esc(t('creator.modBody', { name: modName(bm) }))}</p><button type="button" class="osc-btn" data-unmod>${esc(t('creator.modRemove'))}</button></div>` : '') + (html || `<p>${esc(t('creator.empty'))}</p>`);
  }
  function paint() {
    const s = STEPS[stepI];
    $('[data-kick]').textContent = t('creator.stepOf', { n: stepI + 1, total: STEPS.length });
    $('[data-title]').textContent = t(`creator.steps.${s.id}`);
    $('[data-tabs]').innerHTML = s.tabs.map((k) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tabOf[stepI]}">${esc(tabLabel(k))}</button>`).join('');
    $('[data-back]').textContent = t('creator.back');
    $('[data-back]').disabled = stepI === 0;
    const last = stepI === STEPS.length - 1;
    $('[data-next]').textContent = last ? (opts.onPlay ? t('creator.playNext') : t('creator.steps.body')) : t('creator.next');
    paintRail();
    paintBody();
  }
  const go = (i) => { stepI = i; visited.add(i); paint(); };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.play != null) return opts.onPlay?.();
    if (b.dataset.step != null) return go(Number(b.dataset.step));
    if (b.dataset.tab) { tabOf[stepI] = b.dataset.tab; return paint(); }
    if (b.dataset.g) return prev?.gesture?.(b.dataset.g);
    if (b.dataset.dim != null) { want3d = !want3d; return mountPrev(); }
    if (b.dataset.random != null) { change((s) => Object.assign(s, randomCharacter(Math.random() * 1e9)), 'celebrate'); return paintBody(); }
    if (b.dataset.undo != null) {
      if (!undo.length) return;
      spec = undo.pop();
      repaint('shake');
      opts.onChange?.(clone(spec));
      return paintBody();
    }
    if (b.dataset.back != null) return stepI > 0 && go(stepI - 1);
    if (b.dataset.next != null) {
      if (stepI < STEPS.length - 1) { go(stepI + 1); prev?.gesture?.('jump'); }
      else if (opts.onPlay) opts.onPlay();
      else go(0);
      return;
    }
    if (b.classList.contains('osc-tile')) {
      const [list, , mut, , gesture] = L[tabOf[stepI]];
      const x = list[Number(b.dataset.i)];
      change((s) => mut(s, x), gesture);
      return paintBody();
    }
    if (b.dataset.sw) { change((s) => setPath(s, b.dataset.sw, b.dataset.c)); return paintBody(); }
    if (b.dataset.unmod != null) { change(() => {}, 'celebrate'); return paintBody(); }
    if (b.dataset.clear != null) { change((s) => { s.accessories = []; }, 'shrug'); paintBody(); }
  });
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.sl) change((s) => setPath(s, el.dataset.sl, Number(el.value)));
    else if (el.type === 'color' && el.dataset.sw) change((s) => setPath(s, el.dataset.sw, el.value));
  });
  root.addEventListener('change', (e) => { if (e.target.dataset.sl || e.target.type === 'color') paintBody(); });

  paint();
  return {
    el: root,
    get value() { return clone(spec); },
    set value(v) { spec = normalizeCharacter(v || {}); undo.length = 0; repaint(); paintBody(); },
    gesture: (name) => prev?.gesture?.(name),
    destroy() { alive = false; cancelAnimationFrame(raf); prev?.destroy?.(); root.remove(); },
  };
}
