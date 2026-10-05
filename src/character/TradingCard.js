/**
 * Carta coleccionable de un ot: la misma carta holográfica del pet de escritorio (cli/pet/card.html),
 * como pieza reutilizable para la web (tipo de avatar «Carta» del editor, dashboard).
 *
 *   const card = createTradingCard(div, { identity, id: 'ots_abc', createdAt, foil: 'holo', locale: 'es' });
 *   card.update({ identity });  card.setFoil('gold');  card.destroy();
 *
 * Marco metálico en los colores del ot, arte con el personaje (o la imagen propia si la hay), rasgos y
 * rareza sembrados por id + nombre (el mismo ot siempre saca la misma carta) y lámina holo / prisma /
 * cosmos / oro que sigue al puntero; sola se mece como si la giraras en la mano.
 */
import { createCharacter } from './Character.js';

export const CARD_FOILS = ['holo', 'prism', 'cosmos', 'gold', 'none'];

const T = {
  en: { stats: ['Energy', 'Wit', 'Charm', 'Chaos'], rar: ['Common', 'Rare', 'Epic', 'Legendary'] },
  es: { stats: ['Energía', 'Ingenio', 'Encanto', 'Caos'], rar: ['Común', 'Rara', 'Épica', 'Legendaria'] },
  pt: { stats: ['Energia', 'Engenho', 'Charme', 'Caos'], rar: ['Comum', 'Rara', 'Épica', 'Lendária'] },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.5l7.1-.6z"/></svg>';

/** Rasgos y rareza sembrados: el mismo ot siempre saca la misma carta. */
export function cardTraits(id, name, locale = 'en') {
  const L = T[String(locale).slice(0, 2)] || T.en;
  let h = 2166136261;
  for (const ch of `${id || name || 'ot'}|${name || ''}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)), (h >>> 0) / 4294967296);
  const stats = L.stats.map((n) => [n, 25 + Math.round(rnd() * 74)]);
  const r = rnd();
  const rarity = r > 0.94 ? 3 : r > 0.75 ? 2 : r > 0.4 ? 1 : 0;
  return { stats, rarity, rarityName: L.rar[rarity], defaultFoil: ['holo', 'holo', 'prism', 'cosmos'][rarity] };
}

const CSS = `
:host{display:block;--rx:0deg;--ry:0deg;--mx:50%;--my:50%;--o:.6}
*{box-sizing:border-box}
.scene{perspective:1400px;display:grid;place-items:center}
.card{width:100%;max-width:var(--w,360px);aspect-ratio:5/7;position:relative;border-radius:20px;transform-style:preserve-3d;
  transform:rotateY(var(--ry)) rotateX(var(--rx));transition:transform .5s cubic-bezier(.2,.8,.2,1);container-type:inline-size;
  box-shadow:0 30px 60px -20px rgb(0 0 0/.65),0 0 0 1px rgb(255 255 255/.06),0 0 60px -10px color-mix(in srgb,var(--c) 60%,transparent)}
.card.live{transition:transform .08s linear}
.frame{position:absolute;inset:0;border-radius:inherit;padding:3.2cqw;overflow:hidden;
  background:linear-gradient(135deg,color-mix(in srgb,var(--c) 70%,#fff) 0%,var(--c) 22%,color-mix(in srgb,var(--a) 80%,#000) 50%,var(--c) 78%,color-mix(in srgb,var(--a) 60%,#fff) 100%)}
.card[data-foil=gold] .frame{background:linear-gradient(135deg,#fff3b0,#d4a017 20%,#8a6100 45%,#f7d774 62%,#b8860b 80%,#fff1a8)}
.card[data-foil=cosmos] .frame{background:linear-gradient(135deg,#2b1b5e,#120a2e 40%,#3b2380 70%,#0b0720)}
.face{position:relative;height:100%;border-radius:3cqw;display:flex;flex-direction:column;overflow:hidden;
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 22%,#15121e),#0f0c17 60%);color:#f4f1ff;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;align-items:baseline;gap:2cqw;padding:2.6cqw 3.6cqw 2cqw}
.name{font:800 6.6cqw/1 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;letter-spacing:-.01em;text-shadow:0 2px 0 rgb(0 0 0/.35);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lvl{margin-left:auto;font:700 3cqw/1 ui-monospace,monospace;opacity:.9;white-space:nowrap}
.lvl b{font-size:5cqw}
.art{position:relative;margin:0 3cqw;flex:1 1 auto;min-height:0;border-radius:2cqw;overflow:hidden;isolation:isolate;
  box-shadow:inset 0 0 0 2px rgb(255 255 255/.25),0 6px 14px rgb(0 0 0/.45);
  background:radial-gradient(120% 90% at 50% 70%,color-mix(in srgb,var(--a) 55%,#fff) 0%,var(--c) 45%,color-mix(in srgb,var(--c) 40%,#000) 100%)}
.rays{position:absolute;inset:-50%;background:repeating-conic-gradient(from 0deg at 50% 50%,rgb(255 255 255/.14) 0 6deg,transparent 6deg 18deg);animation:spin 60s linear infinite}
@keyframes spin{to{transform:rotate(1turn)}}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgb(255 255 255/.35) 1px,transparent 1.5px);background-size:14px 14px;mask-image:linear-gradient(transparent,#000 70%);opacity:.5}
.floor{position:absolute;left:18%;right:18%;bottom:7%;height:9%;border-radius:50%;background:radial-gradient(rgb(0 0 0/.45),transparent 70%)}
.fig{position:absolute;left:10%;right:10%;top:6%;bottom:4%;z-index:1}
.fig>img{width:100%;height:100%;object-fit:contain}
.type{display:flex;justify-content:space-between;gap:2cqw;margin:2cqw 3cqw 0;padding:1.3cqw 2.6cqw;border-radius:999px;background:rgb(255 255 255/.08);
  font:600 2.8cqw/1.3 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#e6e1ff}
.type span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.type span:last-child{opacity:.7}
.stats{margin:2.6cqw 3.6cqw 0;display:grid;gap:1.8cqw}
.stat{display:grid;grid-template-columns:19cqw 1fr 8cqw;align-items:center;gap:2cqw;font:600 3cqw/1 system-ui,sans-serif}
.bar{height:1.8cqw;border-radius:9px;background:rgb(255 255 255/.1);overflow:hidden}
.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--c),var(--a));box-shadow:0 0 10px var(--a)}
.stat em{font-style:normal;text-align:right;font-family:ui-monospace,monospace}
.flavor{margin:2.6cqw 3.6cqw 0;padding-top:2cqw;font:italic 3cqw/1.35 Georgia,serif;color:#cfc8ea;border-top:1px solid rgb(255 255 255/.12);
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
footer{margin-top:auto;display:flex;align-items:center;gap:1.5cqw;padding:2cqw 3.6cqw 2.6cqw;font:600 2.5cqw/1 ui-monospace,monospace;color:#b9b1d8;letter-spacing:.04em}
.rar{margin-left:auto;display:flex;align-items:center;gap:1cqw;color:#fff}
.rar svg{width:3cqw;height:3cqw;fill:currentColor}
.holo,.glitter,.glare{position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.holo{mix-blend-mode:color-dodge;opacity:var(--o);filter:brightness(.55) contrast(1.6) saturate(1.4);
  background:repeating-linear-gradient(110deg,#ff3b6b 0%,#ffd23b 6%,#3bff9a 12%,#3bd6ff 18%,#a63bff 24%,#ff3b6b 30%),
    repeating-linear-gradient(-45deg,#0e152e 0%,#8fa3bf 3.8%,#8fa3bf 4.5%,#0e152e 5.2%,#0e152e 10%);
  background-size:400% 400%,300% 300%;background-blend-mode:overlay;
  background-position:var(--mx) var(--my),calc(100% - var(--mx)) calc(100% - var(--my))}
.card[data-foil=holo] .holo{-webkit-mask:var(--artmask);mask:var(--artmask)}
.card[data-foil=gold] .holo{background:repeating-linear-gradient(115deg,#3a2500 0%,#ffe9a0 5%,#b8860b 9%,#3a2500 14%);background-size:300% 300%;filter:brightness(.7) contrast(1.4)}
.card[data-foil=cosmos] .holo{background:radial-gradient(circle at var(--mx) var(--my),#ff6be6 0%,transparent 35%),
  repeating-radial-gradient(circle at 30% 70%,#2b2b8f 0,#8f2bd6 8%,#2bd6c4 16%,#2b2b8f 24%);background-size:100% 100%,200% 200%}
.glitter{mix-blend-mode:color-dodge;opacity:calc(var(--o)*.9);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 9 -6.2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:220px;background-position:var(--mx) var(--my);
  -webkit-mask:radial-gradient(circle at var(--mx) var(--my),#000 0%,rgb(0 0 0/.25) 55%,transparent 80%);mask:radial-gradient(circle at var(--mx) var(--my),#000 0%,rgb(0 0 0/.25) 55%,transparent 80%)}
.card[data-foil=none] .holo,.card[data-foil=none] .glitter{display:none}
.glare{mix-blend-mode:overlay;background:radial-gradient(farthest-corner circle at var(--mx) var(--my),rgb(255 255 255/.75) 0%,rgb(255 255 255/.15) 30%,rgb(0 0 0/.35) 90%);opacity:calc(.4 + var(--o)*.5)}
@media (prefers-reduced-motion:reduce){.rays{animation:none}}
`;

/**
 * @param {HTMLElement} container
 * @param {{ identity?: object, character?: object, id?: string, createdAt?: number, level?: number, model?: string,
 *   foil?: string, locale?: string, width?: number, interactive?: boolean }} [opts]
 *   character: spec a dibujar (por defecto identity.look.character). width: ancho máximo en px.
 */
export function createTradingCard(container, opts = {}) {
  const host = document.createElement('div');
  host.className = 'ots-trading-card';
  container.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  let o = { ...opts };
  let figure = null;
  let raf = 0;
  let hovering = false;
  let destroyed = false;

  const card = () => root.querySelector('.card');

  function render() {
    const id = o.identity || {};
    const look = id.look || {};
    const spec = o.character || look.character || {};
    const name = id.name || 'ot';
    const info = cardTraits(o.id, name, o.locale);
    const foil = CARD_FOILS.includes(o.foil) ? o.foil : info.defaultFoil;
    const C = hex(spec.body?.color, hex(look.color, '#6d5dfc'));
    const A = hex(look.accent, hex(spec.cheeks?.color, '#22d3ee'));
    const flavor = id.bio || id.tagline || '';
    const year = new Date(o.createdAt || Date.now()).getFullYear();
    const serial = `#${String(o.id || 'local').replace(/^ots_/, '').slice(-6).toUpperCase()} · ${year}`;
    figure?.destroy?.();
    figure = null;
    root.innerHTML = `<style>${CSS}</style>
      <div class="scene"><div class="card" data-foil="${foil}" style="--c:${C};--a:${A};${o.width ? `--w:${o.width}px` : ''}">
        <div class="frame"><div class="face">
          <header><span class="name">${esc(name)}</span>${o.level ? `<span class="lvl">LV <b>${esc(o.level)}</b></span>` : ''}</header>
          <div class="art"><div class="rays"></div><div class="dots"></div><div class="floor"></div><div class="fig"></div></div>
          <div class="type"><span>${esc(id.role || 'ot')}</span><span>${esc(String(o.model || '').slice(0, 24))}</span></div>
          <div class="stats">${info.stats.map(([n, v]) => `<div class="stat"><span>${esc(n)}</span><div class="bar"><i style="width:${v}%"></i></div><em>${v}</em></div>`).join('')}</div>
          ${flavor ? `<div class="flavor">${esc(flavor)}</div>` : ''}
          <footer><span>${esc(serial)}</span><span class="rar">${STAR.repeat(info.rarity + 1)}<span>${esc(info.rarityName)}</span></span></footer>
        </div></div>
        <div class="holo"></div><div class="glitter"></div><div class="glare"></div>
      </div></div>`;
    const fig = root.querySelector('.fig');
    if (look.kind === 'image' && look.image) fig.innerHTML = `<img src="${esc(look.image)}" alt="" referrerpolicy="no-referrer">`;
    else {
      figure = createCharacter(fig, spec, { locale: o.locale, title: name, moodFx: false });
      figure.mood?.('happy', { fx: false });
    }
    requestAnimationFrame(setMask);
  }

  // la lámina holo clásica solo brilla en el arte: máscara con la ventana del arte recortada
  function setMask() {
    const c = card()?.getBoundingClientRect();
    const a = root.querySelector('.art')?.getBoundingClientRect();
    if (!c?.width || !a) return;
    const [x, y, w, h] = [a.left - c.left, a.top - c.top, a.width, a.height].map((v) => (v / c.width) * 100);
    const H = (c.height / c.width) * 100;
    card().style.setProperty('--artmask', `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 ${H}' preserveAspectRatio='none'><rect x='${x}' y='${y}' width='${w}' height='${h}' rx='2'/></svg>`)}") 0 0 / 100% 100%`);
  }

  function light(px, py) {
    const el = card();
    if (!el) return;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--ry', `${(px - 0.5) * 26}deg`);
    el.style.setProperty('--rx', `${(0.5 - py) * 26}deg`);
    el.style.setProperty('--o', String(0.35 + Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 1.6) * 0.65));
  }

  render();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setMask) : null;
  ro?.observe(host);
  const still = o.interactive === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (o.interactive !== false) {
    root.addEventListener('pointermove', (e) => {
      const el = card();
      const b = el.getBoundingClientRect();
      hovering = true;
      el.classList.add('live');
      light((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    });
    root.addEventListener('pointerleave', () => {
      hovering = false;
      card()?.classList.remove('live');
    });
  }
  if (still) light(0.68, 0.3), card().style.setProperty('--rx', '0deg'), card().style.setProperty('--ry', '0deg');
  else {
    const t0 = performance.now();
    const sway = (t) => {
      if (destroyed) return;
      if (!hovering) {
        const s = (t - t0) / 1000;
        light(0.5 + Math.sin(s * 0.7) * 0.28, 0.45 + Math.cos(s * 0.5) * 0.2);
      }
      raf = requestAnimationFrame(sway);
    };
    raf = requestAnimationFrame(sway);
  }

  return {
    el: host,
    /** Cambia datos (identity, character, foil…) y vuelve a pintar. */
    update(next = {}) {
      o = { ...o, ...next };
      render();
    },
    setFoil(f) {
      o.foil = f;
      const el = card();
      if (el) el.dataset.foil = CARD_FOILS.includes(f) ? f : cardTraits(o.id, o.identity?.name, o.locale).defaultFoil;
    },
    get foil() {
      return card()?.dataset.foil;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      figure?.destroy?.();
      host.remove();
    },
  };
}
