/**
 * Capa pública de 7ots.com sobre los estáticos de site/:
 *
 *   - idioma servido desde el servidor: ?lang → cookie 7ots-lang → Accept-Language → inglés.
 *     <html lang>, textos data-i18n (site/i18n.js), canonical, hreflang (es/en/pt/zh/hi + x-default),
 *     og:locale/og:title/og:description/og:image por idioma.
 *   - pie común (ecosistema con logos, privacidad, términos, contacto, idiomas) + botón de feedback.
 *   - /site/privacy/ · /site/terms/ · /site/contact/  (site/footer/legal.js)
 *   - POST /api/site/contact  formulario de contacto/feedback → correo interno (server/notify.mjs)
 *   - /robots.txt · /sitemap.xml · página 404 en HTML para navegadores
 */

import { SITE_LANGS, OG_LOCALE, LANG_NAMES, STRINGS, footerHtml, pickLang } from '../site/footer/strings.js';
import { LEGAL, UPDATED } from '../site/footer/legal.js';
import siteMessages from '../site/i18n.js';
import { sendNotify } from './notify.mjs';

const env = process.env;
const BASE = () => (env.PLATFORM_URL || 'https://7ots.com').replace(/\/+$/, '');
const LANG_COOKIE = '7ots-lang';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/** Páginas que llevan el pie común (las demás son apps/embeds con su propia UI). */
const FOOTER_PAGES = new Set(['site/start/index.html', 'site/index.html']);
/** Páginas indexables (sitemap). */
const PUBLIC_PAGES = ['/site/start/', '/site/', '/site/pet/', '/site/plaza/', '/site/contact/', '/site/privacy/', '/site/terms/'];

// ───────────────────────────── idioma ─────────────────────────────

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Idioma del sitio para esta petición. */
export function siteLocale(req, url) {
  const q = (url.searchParams.get('lang') || '').toLowerCase().split('-')[0];
  if (SITE_LANGS.includes(q)) return q;
  const c = (cookies(req)[LANG_COOKIE] || '').toLowerCase().split('-')[0];
  if (SITE_LANGS.includes(c)) return c;
  const prefs = String(req.headers['accept-language'] || '')
    .split(',')
    .map((p, i) => {
      const [tag, ...params] = p.trim().split(';');
      const qv = params.map((x) => x.trim()).find((x) => x.startsWith('q='));
      return { lang: tag.toLowerCase().split('-')[0], q: qv ? Number(qv.slice(2)) || 0 : 1, i };
    })
    .filter((p) => p.lang && p.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) if (SITE_LANGS.includes(p.lang)) return p.lang;
  return 'en';
}

// Catálogo del sitio aplanado: lang → Map(clave → texto).
const flat = {};
function flatten(obj, prefix, map) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, map);
    else if (typeof v === 'string') map.set(key, v);
  }
}
for (const l of SITE_LANGS) {
  flat[l] = new Map();
  flatten(siteMessages[l], '', flat[l]);
}
const msg = (lang, key) => flat[lang]?.get(key);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const unesc = (v) => String(v ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);

/** URL de una variante de idioma (en = sin parámetro sería ambiguo con la detección: se marca explícito). */
const langUrl = (path, l) => `${BASE()}${path}?lang=${l}`;

function headTags(path, lang, explicit, { title, description }) {
  const canonical = explicit ? langUrl(path, lang) : `${BASE()}${path}`;
  const alt = SITE_LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${langUrl(path, l)}">`).join('\n');
  const ogImg = lang === 'es' ? 'og-es.png' : lang === 'pt' ? 'og-pt.png' : 'og.png';
  const others = SITE_LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`).join('\n');
  const fonts = lang === 'zh' || lang === 'hi'
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${lang === 'zh' ? 'Noto+Sans+SC' : 'Noto+Sans+Devanagari'}:wght@400;600;700&display=swap">\n<style>:root{--font-body:Inter,${lang === 'zh' ? "'Noto Sans SC'" : "'Noto Sans Devanagari'"},system-ui,sans-serif;--font-display:'Bricolage Grotesque',${lang === 'zh' ? "'Noto Sans SC'" : "'Noto Sans Devanagari'"},Inter,system-ui,sans-serif}</style>`
    : '';
  return [
    `<link rel="canonical" href="${canonical}">`,
    alt,
    `<link rel="alternate" hreflang="x-default" href="${BASE()}${path}">`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}">`,
    others,
    `<meta property="og:url" content="${canonical}">`,
    title ? `<meta property="og:title" content="${esc(title)}">\n<meta name="twitter:title" content="${esc(title)}">` : '',
    description ? `<meta property="og:description" content="${esc(description)}">\n<meta name="twitter:description" content="${esc(description)}">` : '',
    `<meta property="og:image" content="${BASE()}/brand/${ogImg}">`,
    `<meta name="twitter:image" content="${BASE()}/brand/${ogImg}">`,
    fonts,
  ].filter(Boolean).join('\n');
}

function jsonLd(lang) {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${BASE()}/#org`, name: '7ots', url: BASE(), logo: `${BASE()}/brand/apple-touch-icon.png`, sameAs: ['https://github.com/7ots/pet', 'https://www.npmjs.com/package/@7ots/cli'] },
      { '@type': 'WebSite', '@id': `${BASE()}/#site`, name: '7ots', url: BASE(), inLanguage: SITE_LANGS, publisher: { '@id': `${BASE()}/#org` } },
      {
        '@type': 'SoftwareApplication',
        name: '7ots',
        applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Windows, macOS, Linux, Web',
        description: msg(lang, 'site.meta.description') || msg('en', 'site.meta.description'),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        url: BASE(),
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/**
 * Traduce y completa una página HTML de site/ para el idioma de la petición.
 * @param {string} rel ruta relativa al repo (site/start/index.html)
 */
export function renderSitePage(req, url, rel, html) {
  const lang = siteLocale(req, url);
  const explicit = SITE_LANGS.includes((url.searchParams.get('lang') || '').toLowerCase());
  const embed = url.searchParams.has('embed');
  const path = url.pathname;
  const tr = (key) => {
    const v = msg(lang, key);
    return v !== undefined && !v.includes('{') ? v : undefined;
  };

  let out = html.replace(/<html\b([^>]*?)\slang=(["'])[^"']*\2/i, `<html$1 lang="${lang}"`);
  if (lang !== 'en') {
    // Texto de elementos con data-i18n y sin hijos.
    out = out.replace(/(<([a-z0-9]+)\b[^>]*?\sdata-i18n="([\w.-]+)"[^>]*>)([^<]*)(<\/\2>)/gi, (m, open, tag, key, inner, close) => {
      const v = tr(key);
      return v === undefined ? m : `${open}${esc(v)}${close}`;
    });
    // Atributos traducibles.
    const ATTRS = { content: 'content', aria: 'aria-label', placeholder: 'placeholder', value: 'value', title: 'title' };
    out = out.replace(/<[a-z0-9]+\b[^>]*\sdata-i18n-(content|aria|placeholder|value|title)="[\w.-]+"[^>]*>/gi, (tagStr) => {
      let t = tagStr;
      for (const [k, attr] of Object.entries(ATTRS)) {
        const km = t.match(new RegExp(`\\sdata-i18n-${k}="([\\w.-]+)"`));
        if (!km) continue;
        const v = tr(km[1]);
        if (v === undefined) continue;
        const re = new RegExp(`(\\s${attr}=)(["'])[^"']*\\2`);
        t = re.test(t) ? t.replace(re, `$1"${esc(v)}"`) : t.replace(/\s*\/?>$/, (end) => ` ${attr}="${esc(v)}"${end}`);
      }
      return t;
    });
  }

  const title = unesc((out.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '');
  const description = unesc((out.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1] || '');
  // Fuera lo que se vuelve a poner por idioma.
  out = out.replace(/\s*<link rel="canonical"[^>]*>/gi, '')
    .replace(/\s*<link rel="alternate" hreflang=[^>]*>/gi, '')
    .replace(/\s*<meta property="og:(url|title|description|image|locale)"[^>]*>/gi, '')
    .replace(/\s*<meta name="twitter:(title|description|image)"[^>]*>/gi, '');

  let head = headTags(path, lang, explicit, { title, description }) + '\n<script src="/site/footer/errors.js" defer></script>';
  if (FOOTER_PAGES.has(rel) && !embed) head += `\n<link rel="stylesheet" href="/site/footer/footer.css">\n${jsonLd(lang)}`;
  out = out.replace(/<\/head>/i, `${head}\n</head>`);
  if (FOOTER_PAGES.has(rel) && !embed) {
    out = out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${footerHtml(lang)}\n<script type="module" src="/site/footer/footer.js"></script>\n</body>`);
  }
  return out;
}

// ───────────────────────────── páginas propias ─────────────────────────────

function pageShell(req, url, { lang, path, title, description, body, noindex = false }) {
  const explicit = SITE_LANGS.includes((url.searchParams.get('lang') || '').toLowerCase());
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 7ots</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#120d33">
<link rel="icon" type="image/svg+xml" href="/brand/favicon.svg">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/brand/tokens.css">
<link rel="stylesheet" href="/site/footer/footer.css">
${headTags(path, lang, explicit, { title: `${title} · 7ots`, description })}
<script src="/site/footer/errors.js" defer></script>
</head>
<body class="ots-page">
<header class="ots-page-top"><a class="ots-page-logo" href="/site/start/${lang === 'en' ? '' : `?lang=${lang}`}" aria-label="7ots.com"><img src="/brand/mark.svg" alt="" width="28" height="28"><span>7ots</span></a></header>
<main class="ots-page-main">
${body}
</main>
${footerHtml(lang)}
<script type="module" src="/site/footer/footer.js"></script>
</body>
</html>`;
}

function legalBody(lang, doc) {
  const L = LEGAL[lang];
  const d = L[doc];
  const secs = d.sections.map(([h, ps]) => `<section><h2>${esc(h)}</h2>${ps.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('\n');
  return `<article class="ots-legal-doc"><h1>${esc(d.title)}</h1><p class="ots-lead">${esc(d.lead)}</p>${secs}<p class="ots-updated">${esc(L.updated)}: <time datetime="${UPDATED}">${UPDATED}</time></p></article>`;
}

function contactBody(lang, url) {
  const L = LEGAL[lang].contact;
  const t = STRINGS[lang];
  const sent = url.searchParams.get('sent') === '1';
  const err = url.searchParams.get('error');
  const kind = url.searchParams.get('kind') === 'feedback' ? 'feedback' : 'contact';
  if (sent) return `<article class="ots-legal-doc"><h1>${esc(L.sentTitle)}</h1><p class="ots-lead">${esc(t.sent)}</p><p><a href="/site/start/${lang === 'en' ? '' : `?lang=${lang}`}">${esc(L.back)}</a></p></article>`;
  return `<article class="ots-legal-doc"><h1>${esc(kind === 'feedback' ? t.feedbackTitle : L.title)}</h1><p class="ots-lead">${esc(kind === 'feedback' ? t.feedbackLead : L.lead)}</p>
${err ? `<p class="ots-form-msg err" role="alert">${esc(err === 'invalid' ? t.invalid : t.error)}</p>` : ''}
<form class="ots-form" method="post" action="/api/site/contact" data-ots-form>
  <input type="hidden" name="kind" value="${kind}">
  <input type="hidden" name="lang" value="${lang}">
  <div class="ots-hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
  <label>${esc(t.name)}<input name="name" maxlength="80" autocomplete="name"></label>
  <label>${esc(kind === 'feedback' ? t.emailOpt : t.email)}<input name="email" type="email" maxlength="200" autocomplete="email"${kind === 'feedback' ? '' : ' required'}></label>
  <label>${esc(t.message)}<textarea name="message" rows="6" maxlength="5000" required></textarea></label>
  <button type="submit" class="ots-btn">${esc(t.send)}</button>
</form></article>`;
}

// ───────────────────────────── contacto / feedback ─────────────────────────────

const hits = new Map(); // ip → timestamps
let dayCount = { day: '', n: 0 };
function contactAllowed(ip) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (dayCount.day !== day) dayCount = { day, n: 0 };
  if (dayCount.n >= Number(env.CONTACT_MAX_PER_DAY || 300)) return { ok: false, retry: 3600 };
  const list = (hits.get(ip) || []).filter((t) => now - t < 86400_000);
  const recent = list.filter((t) => now - t < 600_000);
  if (recent.length >= 5) return { ok: false, retry: Math.ceil((600_000 - (now - recent[0])) / 1000) };
  if (list.length >= 20) return { ok: false, retry: Math.ceil((86400_000 - (now - list[0])) / 1000) };
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  dayCount.n++;
  return { ok: true };
}

async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) return null;
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return null;
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

const clip = (v, n) => String(v ?? '').replace(/\r/g, '').slice(0, n).trim();

/**
 * @param {{ send: Function, clientIp: (req) => string, originOf: (req) => string }} deps
 */
export function createSite({ send, clientIp, originOf }) {
  function html(res, status, body, req) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', Vary: 'Accept-Language, Cookie', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function contact(req, res, url) {
    const origin = req.headers.origin;
    if (origin && origin !== originOf(req) && origin !== new URL(BASE()).origin) return send(res, 403, { error: 'origin not allowed' });
    const json = String(req.headers['content-type'] || '').includes('application/json');
    const body = await readBody(req, 32 * 1024);
    const lang = pickLang(body?.lang);
    const kind = body?.kind === 'feedback' ? 'feedback' : 'contact';
    const back = (q) => {
      res.writeHead(303, { Location: `/site/contact/?lang=${lang}&kind=${kind}&${q}`, 'Cache-Control': 'no-store' });
      res.end();
    };
    if (!body) return json ? send(res, 400, { error: 'bad request' }) : back('error=invalid');
    // Honeypot: el bot cree que salió.
    if (body.website) return json ? send(res, 200, { ok: true }) : back('sent=1');
    const message = clip(body.message, 5000);
    const email = clip(body.email, 200).toLowerCase();
    const name = clip(body.name, 80);
    const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : '';
    if (message.length < 2 || (email && !EMAIL_RE.test(email)) || (kind === 'contact' && !email)) {
      return json ? send(res, 400, { error: STRINGS[lang].invalid }) : back('error=invalid');
    }
    const lim = contactAllowed(clientIp(req));
    if (!lim.ok) {
      res.setHeader('Retry-After', String(lim.retry));
      return json ? send(res, 429, { error: STRINGS[lang].error }) : back('error=limit');
    }
    const page = clip(body.page || req.headers.referer, 300);
    const text = [
      message,
      '',
      '—',
      `Tipo: ${kind}${rating ? ` (${rating === 'up' ? '👍' : '👎'})` : ''}`,
      `Nombre: ${name || '-'}`,
      `Email: ${email || '-'}`,
      `Idioma: ${lang}`,
      `Página: ${page || '-'}`,
      `Fecha: ${new Date().toISOString()}`,
    ].join('\n');
    try {
      await sendNotify({
        to: env.CONTACT_TO || 'maestro@apumail.com',
        subject: `[7ots ${kind}] ${clip(message.split('\n')[0], 80)}`,
        text,
        replyTo: email || undefined,
      });
    } catch (e) {
      console.warn('[7ots] contacto no enviado:', e.message);
      return json ? send(res, 502, { error: STRINGS[lang].error }) : back('error=send');
    }
    return json ? send(res, 200, { ok: true }) : back('sent=1');
  }

  /** @returns {Promise<boolean>} true si atendió la petición */
  async function handle(req, res, url) {
    const p = url.pathname;
    const get = req.method === 'GET' || req.method === 'HEAD';
    if (p === '/api/site/contact') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' }), true;
      await contact(req, res, url);
      return true;
    }
    if (p === '/robots.txt' && get) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nDisallow: /app/\nDisallow: /backoffice/\n\nSitemap: ${BASE()}/sitemap.xml\n`);
      return true;
    }
    if (p === '/sitemap.xml' && get) {
      const urls = PUBLIC_PAGES.map((pg) => {
        const alts = SITE_LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${langUrl(pg, l)}"/>`).join('\n');
        return `  <url>\n    <loc>${BASE()}${pg}</loc>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE()}${pg}"/>\n  </url>`;
      }).join('\n');
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
      return true;
    }
    const m = p.match(/^\/site\/(privacy|terms|contact)(\/?)$/);
    if (m && get) {
      if (!m[2]) {
        res.writeHead(301, { Location: `${p}/${url.search}` });
        res.end();
        return true;
      }
      const lang = siteLocale(req, url);
      const doc = m[1];
      const L = LEGAL[lang];
      const body = doc === 'contact' ? contactBody(lang, url) : legalBody(lang, doc);
      const sub = url.searchParams.has('sent') || url.searchParams.has('error');
      html(res, 200, pageShell(req, url, { lang, path: `/site/${doc}/`, title: L[doc].title, description: L[doc].lead, body, noindex: sub }), req);
      return true;
    }
    return false;
  }

  /** 404 propia: HTML para navegadores, JSON para el resto. */
  function notFound(req, res, url, jsonBody) {
    const accept = String(req.headers.accept || '');
    if ((req.method === 'GET' || req.method === 'HEAD') && accept.includes('text/html') && !url.pathname.startsWith('/api/')) {
      const lang = siteLocale(req, url);
      const T = { en: ['Page not found', 'This page does not exist or was moved.', 'Go to 7ots.com'], es: ['Página no encontrada', 'Esta página no existe o se movió.', 'Ir a 7ots.com'], pt: ['Página não encontrada', 'Esta página não existe ou foi movida.', 'Ir para 7ots.com'], zh: ['页面未找到', '此页面不存在或已被移动。', '前往 7ots.com'], hi: ['पेज नहीं मिला', 'यह पेज मौजूद नहीं है या हटा दिया गया है।', '7ots.com पर जाएँ'] }[lang];
      const body = `<article class="ots-legal-doc ots-404"><p class="ots-404-code">404</p><h1>${esc(T[0])}</h1><p class="ots-lead">${esc(T[1])}</p><p><a class="ots-btn" href="/site/start/${lang === 'en' ? '' : `?lang=${lang}`}">${esc(T[2])}</a></p></article>`;
      const page = pageShell(req, url, { lang, path: '/site/start/', title: T[0], description: T[1], body, noindex: true })
        .replace(/\s*<link rel="(canonical|alternate)"[^>]*>/g, '');
      html(res, 404, page, req);
      return;
    }
    send(res, 404, jsonBody);
  }

  return { handle, notFound };
}

export { LANG_NAMES };
