/**
 * Perfil público de un ot: lo que ve una persona al abrir /api/o/<id>/identity en el navegador.
 *
 * Portada con el personaje (SVG renderizado aquí, así la primera pintura y la vista previa ya lo
 * traen; luego el navegador lo anima), quién es, sus rasgos únicos (los mismos de traits.json) y la
 * tarjeta de contacto <ots-identity> con sus acciones (escuchar, correo, @handle, llamada, vCard).
 */
import { renderCharacter } from '../../src/character/Character.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex = (v, def) => (/^#[0-9a-f]{3,8}$/i.test(v || '') ? v : def);

const L = {
  en: { about: 'About', tone: 'Tone', speaks: 'Speaks', traits: 'Unique traits', traitsSub: 'No two ots share this face. The fingerprint is what makes it one of a kind.', print: 'Fingerprint', contact: 'Contact', json: 'JSON', make: 'Create your own ot', unique: 'One of a kind', soon: 'NFT soon', noBio: '{name} hasn’t written a bio yet.' },
  es: { about: 'Sobre mí', tone: 'Tono', speaks: 'Habla', traits: 'Rasgos únicos', traitsSub: 'No hay dos ots con esta cara. La huella es lo que lo hace único.', print: 'Huella', contact: 'Contacto', json: 'JSON', make: 'Crea tu propio ot', unique: 'Único', soon: 'NFT pronto', noBio: '{name} todavía no escribió su bio.' },
  pt: { about: 'Sobre', tone: 'Tom', speaks: 'Fala', traits: 'Traços únicos', traitsSub: 'Não existem dois ots com este rosto. A impressão é o que o torna único.', print: 'Impressão', contact: 'Contato', json: 'JSON', make: 'Crie seu próprio ot', unique: 'Único', soon: 'NFT em breve', noBio: '{name} ainda não escreveu a bio.' },
};

const LANG_NAMES = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano', ja: '日本語', zh: '中文', ko: '한국어', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी', nl: 'Nederlands', pl: 'Polski', tr: 'Türkçe', et: 'Eesti' };

/** 32 hex → código de barras de colores: la huella se ve, no solo se lee. */
function printBars(print) {
  if (!print) return '';
  const bars = print.match(/../g).map((b, i) => {
    const n = parseInt(b, 16);
    return `<rect x="${i * 16 + 2}" y="${n % 3 === 0 ? 4 : 0}" width="${4 + (n % 8)}" height="${n % 3 === 0 ? 28 : 32}" rx="1.5" fill="hsl(${Math.round((n / 255) * 360)} 80% 65%)"/>`;
  });
  return `<svg class="bars" viewBox="0 0 256 32" preserveAspectRatio="none" aria-hidden="true">${bars.join('')}</svg>`;
}

/**
 * Retrato suelto del ot, para mostrarlo fuera de 7ots (Orquesta, listas de ots) con un <img>:
 * { redirect } si su look es una imagen https, si no { svg } con el personaje (o su inicial).
 * Un <img> no ejecuta nada del SVG, y el personaje se dibuja de su spec normalizada.
 */
export function portraitOf(card) {
  const look = card.look || {};
  if (look.kind === 'image' && /^https:\/\//i.test(look.image || '')) return { redirect: look.image };
  if (look.character && Object.keys(look.character).length) {
    try {
      return { svg: renderCharacter(look.character, {}, { title: card.name }) };
    } catch {}
  }
  const c1 = hex(look.color, '#6d5dfc');
  const c2 = hex(look.accent, '#22d3ee');
  const ch = esc(([...(look.emoji || card.name || '?')][0] || '?').toUpperCase());
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img"><title>${esc(card.name)}</title><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="46" font-weight="700" fill="#fff">${ch}</text></svg>`,
  };
}

/**
 * card: publicIdentity(...) · meta: traitsMeta(...) · ep: base /api/o/<id> · locale: idioma del visitante.
 */
export function profilePage(card, meta, ep, locale = 'en') {
  const l = L[String(locale).slice(0, 2)] || L.en;
  const name = esc(card.name);
  const desc = esc(card.tagline || card.role || '');
  const c1 = hex(card.look?.color, '#6d5dfc');
  const c2 = hex(card.look?.accent, '#22d3ee');
  const look = card.look || {};
  let portrait = `<span class="initial">${esc((look.emoji || card.name.slice(0, 1)).toUpperCase())}</span>`;
  if (look.kind === 'image' && look.image) portrait = `<img src="${esc(look.image)}" alt="" referrerpolicy="no-referrer">`;
  else if (look.character && Object.keys(look.character).length) {
    try {
      portrait = renderCharacter(look.character, {}, { title: card.name });
    } catch {}
  }
  const langs = [...new Set([card.language, ...(card.languages || [])].filter(Boolean))];
  const traits = card.personality?.traits || [];
  const handle = meta?.handle;
  const attrs = (meta?.attributes || []).filter((a) => a.trait_type !== 'Kind');
  const tile = (a) => {
    const v = String(a.value);
    const sw = /^#[0-9a-f]{3,8}$/i.test(v) ? `<i class="sw" style="background:${v}"></i>` : '';
    return `<div class="tile"><dt>${esc(a.trait_type)}</dt><dd>${sw}${esc(sw ? v.toUpperCase() : v.replace(/[-_]/g, ' '))}</dd></div>`;
  };
  const jsonUrl = `${esc(ep)}/identity?format=json`;

  return `<!doctype html><html lang="${esc(card.language || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} · 7ots</title><meta name="description" content="${desc}">
<meta property="og:title" content="${name} · 7ots"><meta property="og:description" content="${desc}"><meta property="og:type" content="profile">
<meta name="theme-color" content="${c1}">
<link rel="alternate" type="application/json" href="${jsonUrl}"><link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600&display=swap">
<style>
:root{color-scheme:dark;--c1:${c1};--c2:${c2};--bg:#0b0919;--panel:rgb(255 255 255/.045);--line:rgb(255 255 255/.09);--ink:#f3f1ff;--muted:#a7a2c9;--disp:"Bricolage Grotesque",system-ui,sans-serif}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;font:15px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);overflow-x:hidden}
body::before{content:"";position:fixed;inset:-20%;z-index:-1;background:radial-gradient(700px 520px at 20% 8%,color-mix(in srgb,var(--c1) 42%,transparent),transparent 65%),radial-gradient(640px 520px at 92% 30%,color-mix(in srgb,var(--c2) 26%,transparent),transparent 65%),radial-gradient(900px 600px at 50% 120%,color-mix(in srgb,var(--c1) 22%,transparent),transparent 60%)}
a{color:inherit}
.top{max-width:1080px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:8px;font:800 17px var(--disp);text-decoration:none;letter-spacing:-.02em}
.brand img{width:26px;height:26px;border-radius:7px}
.cta{font:600 13px Inter,sans-serif;text-decoration:none;padding:8px 14px;border-radius:999px;background:var(--ink);color:#120f2a}
.cta:hover{opacity:.9}
main{max-width:1080px;margin:0 auto;padding:8px 20px 56px;display:grid;gap:22px}
.hero{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:36px;align-items:center;padding:28px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(140deg,color-mix(in srgb,var(--c1) 18%,transparent),rgb(255 255 255/.02) 55%);backdrop-filter:blur(6px)}
.stage{position:relative;aspect-ratio:1;border-radius:24px;display:grid;place-items:center;background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--c2) 30%,transparent),transparent 62%),rgb(0 0 0/.18);overflow:hidden}
.stage::after{content:"";position:absolute;left:18%;right:18%;bottom:9%;height:7%;border-radius:50%;background:rgb(0 0 0/.35);filter:blur(10px)}
.stage>.av{position:relative;z-index:1;width:82%;height:82%;display:grid;place-items:center}
.stage svg{width:100%;height:100%;overflow:visible}
.stage img{width:100%;height:100%;object-fit:cover;border-radius:18px}
.initial{font:800 120px var(--disp);color:var(--c1)}
.who{display:grid;gap:12px;align-content:center;min-width:0}
.badges{display:flex;flex-wrap:wrap;gap:8px}
.badge{display:inline-flex;align-items:center;gap:6px;font:600 12px Inter,sans-serif;padding:5px 10px;border-radius:999px;border:1px solid var(--line);background:rgb(255 255 255/.05);color:var(--muted)}
.badge.u{color:var(--ink);border-color:color-mix(in srgb,var(--c2) 55%,transparent);background:color-mix(in srgb,var(--c2) 14%,transparent)}
.badge svg{width:13px;height:13px}
h1{margin:0;font:800 clamp(40px,7vw,68px)/1 var(--disp);letter-spacing:-.035em;overflow-wrap:anywhere}
.handle{font:600 16px Inter,sans-serif;color:var(--c2)}
.role{margin:0;font-size:18px;color:var(--muted);text-transform:capitalize}
.tagline{margin:0;font:600 21px/1.35 var(--disp);letter-spacing:-.01em;max-width:34ch}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,380px);gap:22px;align-items:start}
.col{display:grid;gap:22px;min-width:0}
.panel{border:1px solid var(--line);border-radius:22px;background:var(--panel);padding:22px;display:grid;gap:14px}
.panel h2{margin:0;font:700 13px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;justify-content:space-between;gap:8px}
.panel h2 small{font:600 11px Inter,sans-serif;letter-spacing:0;text-transform:none;padding:3px 8px;border-radius:999px;background:rgb(255 255 255/.07)}
.bio{margin:0;font-size:16px;white-space:pre-line}
.bio.empty{color:var(--muted);font-style:italic}
.kv{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin:0;align-items:baseline}
.kv dt{color:var(--muted);font-size:13px}
.kv dd{margin:0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.chips li{font-size:13px;padding:4px 10px;border-radius:999px;background:rgb(255 255 255/.07);border:1px solid var(--line)}
.sub{margin:-6px 0 0;color:var(--muted);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:0}
.tile{border:1px solid var(--line);border-radius:14px;padding:11px 13px;background:rgb(0 0 0/.15)}
.tile dt{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.tile dd{margin:3px 0 0;font-weight:600;text-transform:capitalize;display:flex;align-items:center;gap:7px;overflow-wrap:anywhere}
.sw{width:14px;height:14px;border-radius:5px;flex:none;box-shadow:inset 0 0 0 1px rgb(255 255 255/.25)}
.print{display:grid;gap:8px;padding:14px;border-radius:14px;background:rgb(0 0 0/.25);border:1px solid var(--line)}
.print span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.print code{font:500 12.5px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;color:var(--ink)}
.bars{width:100%;height:30px}
ots-identity{display:block;--ots-bg:#16132e;--ots-fg:#f3f1ff;--ots-line:rgb(255 255 255/.1)}
.links{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted);justify-content:center}
.links a{text-decoration:none}.links a:hover{color:var(--ink)}
@media (max-width:820px){.hero{grid-template-columns:1fr;gap:22px;padding:20px;text-align:center}.stage{max-width:280px;width:100%;margin:0 auto}.badges,.who{justify-items:center;justify-content:center}.tagline{margin-inline:auto}.grid{grid-template-columns:1fr}}
@media (max-width:480px){main,.top{padding-inline:16px}.panel{padding:18px}}
@media (prefers-reduced-motion:no-preference){.stage>.av{animation:float 5s ease-in-out infinite}@keyframes float{50%{transform:translateY(-6px)}}}
</style></head><body>
<header class="top"><a class="brand" href="https://7ots.com"><img src="/brand/icon-512.png" alt="">7ots</a><a class="cta" href="https://7ots.com">${l.make}</a></header>
<main>
  <section class="hero">
    <div class="stage"><div class="av" id="av">${portrait}</div></div>
    <div class="who">
      <div class="badges">${meta?.fingerprint ? `<span class="badge u"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>${l.unique}</span>` : ''}${langs.map((x) => `<span class="badge">${esc(LANG_NAMES[x] || x.toUpperCase())}</span>`).join('')}</div>
      <h1>${name}</h1>
      ${handle ? `<span class="handle">@${esc(handle)}</span>` : ''}
      ${card.role ? `<p class="role">${esc(card.role)}</p>` : ''}
      ${card.tagline ? `<p class="tagline">“${esc(card.tagline)}”</p>` : ''}
    </div>
  </section>
  <div class="grid">
    <div class="col">
      <section class="panel"><h2>${l.about}</h2>
        ${card.bio ? `<p class="bio">${esc(card.bio)}</p>` : `<p class="bio empty">${esc(l.noBio.replace('{name}', card.name))}</p>`}
        <dl class="kv">
          ${card.personality?.tone ? `<dt>${l.tone}</dt><dd>${esc(card.personality.tone)}</dd>` : ''}
          ${langs.length ? `<dt>${l.speaks}</dt><dd>${esc(langs.map((x) => LANG_NAMES[x] || x).join(' · '))}</dd>` : ''}
        </dl>
        ${traits.length ? `<ul class="chips">${traits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </section>
      ${attrs.length || meta?.fingerprint ? `<section class="panel"><h2>${l.traits}<small>${l.soon}</small></h2><p class="sub">${l.traitsSub}</p>
        ${meta?.fingerprint ? `<div class="print"><span>${l.print}</span>${printBars(meta.fingerprint)}<code>${esc(meta.fingerprint)}</code></div>` : ''}
        <dl class="tiles">${attrs.map(tile).join('')}</dl>
      </section>` : ''}
    </div>
    <div class="col">
      <section class="panel"><h2>${l.contact}</h2><ots-identity src="${jsonUrl}" face lang="${esc(String(locale).slice(0, 2))}"></ots-identity></section>
      <p class="links"><a href="${jsonUrl}">${l.json}</a><a href="${esc(ep)}/traits.json">traits.json</a><a href="${esc(ep)}/identity.vcf">vCard</a><a href="https://7ots.com">7ots.com</a></p>
    </div>
  </div>
</main>
<script src="/api/agent/7ots.js"></script>
<script>
(function(){var c=${JSON.stringify(look.kind !== 'image' && look.character ? look.character : null).replace(/</g, '\\u003c')};var el=document.getElementById('av');
if(!c||!window.SevenOts||!SevenOts.createCharacter)return;try{el.innerHTML='';SevenOts.createCharacter(el,c,{title:${JSON.stringify(card.name).replace(/</g, '\\u003c')}});}catch(e){}})();
</script>
</body></html>`;
}
