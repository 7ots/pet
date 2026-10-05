/**
 * i18n de 7ots: catálogos por módulo, detección de idioma, variables y plurales. Sin dependencias;
 * funciona igual en el navegador y en Node (el proxy lo importa).
 *
 *   import { addMessages, translator, resolveLocale } from '@7ots/cli';
 *   addMessages('fr', { widget: { send: 'Envoyer' } });          // añade o sobrescribe textos
 *   const t = translator('es-MX');                               // es-MX → es → en
 *   t('widget.greeting', { name: 'Ana' });                       // "Hola, soy {name}" → "Hola, soy Ana"
 *   t('editor.items', { count: 3 });                             // { one: '# elemento', other: '# elementos' }
 *
 * Claves con puntos (`módulo.sección.texto`). Los valores son cadenas con `{var}` o, para plurales,
 * objetos con las categorías de Intl.PluralRules (`zero`, `one`, `two`, `few`, `many`, `other`),
 * donde `#` es el número formateado. Si falta un texto se prueba el idioma base, luego inglés,
 * luego español (idioma fuente) y al final se devuelve la propia clave. Un idioma pedido que no
 * existe (p. ej. 'fr' sin catálogo) usa inglés; sin preferencia alguna, español.
 */

/** Idiomas incluidos de serie (todos los módulos tienen estos tres completos). */
export const LOCALES = ['es', 'en', 'pt'];
export const DEFAULT_LOCALE = 'en';
/** Nombre de cada idioma en su propio idioma (para selectores). */
export const LOCALE_NAMES = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano', ca: 'Català' };

const catalogs = Object.create(null); // lang → Map(clave plana → valor)
const listeners = new Set();
let current = DEFAULT_LOCALE;

/**
 * Registra textos de un idioma. Acepta objetos anidados o claves con puntos; se fusiona con lo que
 * hubiera (lo nuevo manda), así un sitio puede cambiar solo algunos textos.
 * @param {string} lang  'es', 'en', 'pt-BR'…
 * @param {object} messages
 */
export function addMessages(lang, messages) {
  const l = normalize(lang);
  if (!l || !messages || typeof messages !== 'object') return;
  const map = (catalogs[l] ||= new Map());
  flatten(messages, '', map);
  emit();
}

/** Registra un módulo con todos sus idiomas: `{ es: {...}, en: {...}, pt: {...} }`. */
export function addCatalog(byLang) {
  for (const [lang, msgs] of Object.entries(byLang || {})) addMessages(lang, msgs);
}

/** Idiomas con algún texto registrado. */
export function availableLocales() {
  return Object.keys(catalogs);
}

/**
 * Elige el mejor idioma disponible para una o varias preferencias (en orden).
 * Acepta etiquetas BCP 47 ('es-MX'), cabeceras Accept-Language ('pt-BR,pt;q=0.9,en;q=0.8') y listas.
 * @param {...(string|string[]|null|undefined)} prefs
 * @returns {string}
 */
export function resolveLocale(...prefs) {
  const wanted = prefs.flat().filter(Boolean).flatMap((p) => String(p).split(',')).map((p) => normalize(p.split(';')[0]));
  for (const w of wanted) {
    if (!w) continue;
    if (catalogs[w]) return w;
    const base = w.split('-')[0];
    if (catalogs[base]) return base;
  }
  // Pidieron un idioma que no tenemos: el inglés se entiende más que el español.
  return wanted.some(Boolean) && catalogs.en ? 'en' : DEFAULT_LOCALE;
}

/**
 * Idioma sugerido por el entorno: `<html lang>` y luego el navegador. En Node, DEFAULT_LOCALE.
 * @param {string} [explicit] preferencia explícita (manda si está disponible)
 */
export function detectLocale(explicit) {
  const doc = typeof document !== 'undefined' ? document.documentElement.lang : '';
  const nav = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  return resolveLocale(explicit, doc, nav);
}

/**
 * Traductor ligado a un idioma (varios componentes pueden usar idiomas distintos a la vez).
 * @param {string} [locale] por defecto, el idioma global (setLocale)
 * @returns {(key: string, vars?: object) => string}
 */
export function translator(locale) {
  const fixed = locale ? resolveLocale(locale) : null;
  const t = (key, vars) => format(lookup(fixed || current, key), vars, fixed || current, key);
  Object.defineProperty(t, 'locale', { get: () => fixed || current });
  /** ¿Existe el texto (en cualquier idioma de la cadena)? */
  t.has = (key) => lookup(fixed || current, key) !== undefined;
  return t;
}

/** Traduce con el idioma global. */
export function t(key, vars) {
  return format(lookup(current, key), vars, current, key);
}

/** Idioma global (lo usan los componentes sin idioma propio). */
export function getLocale() {
  return current;
}
export function setLocale(lang) {
  const next = resolveLocale(lang);
  if (next === current) return current;
  current = next;
  emit();
  return current;
}
/** Avisa al cambiar el idioma global o registrar textos. Devuelve la función para darse de baja. */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Formateadores con el idioma del traductor (fechas, números, listas). */
export function formatNumber(n, locale = current, opts) {
  try {
    return new Intl.NumberFormat(locale, opts).format(n);
  } catch {
    return String(n);
  }
}
export function formatList(items, locale = current, type = 'conjunction') {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type }).format(items);
  } catch {
    return items.join(', ');
  }
}

// ───────────────────────────── internos ─────────────────────────────

function normalize(tag) {
  const s = String(tag || '').trim().replace('_', '-');
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(s)) return '';
  const [lang, ...rest] = s.split('-');
  return [lang.toLowerCase(), ...rest.map((r) => (r.length === 2 ? r.toUpperCase() : r))].join('-');
}

function chain(locale) {
  const out = [locale];
  const base = locale.split('-')[0];
  if (base !== locale) out.push(base);
  for (const f of ['en', DEFAULT_LOCALE]) if (!out.includes(f)) out.push(f);
  return out;
}

function lookup(locale, key) {
  for (const l of chain(locale)) {
    const v = catalogs[l]?.get(key);
    if (v !== undefined) return v;
  }
  return undefined;
}

function format(value, vars, locale, key) {
  if (value === undefined) return key;
  let s = value;
  if (typeof value === 'object') {
    const n = Number(vars?.count ?? 0);
    let cat = 'other';
    try {
      cat = n === 0 && value.zero !== undefined ? 'zero' : new Intl.PluralRules(locale).select(n);
    } catch {
      cat = n === 1 ? 'one' : 'other';
    }
    s = String(value[cat] ?? value.other ?? '').replace(/#/g, formatNumber(n, locale));
  }
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
function flatten(obj, prefix, map) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (Object.keys(v).length && Object.keys(v).every((x) => PLURAL_KEYS.has(x))) map.set(key, { ...v });
      else flatten(v, key, map);
    } else if (typeof v === 'string') map.set(key, v);
  }
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      /* un oyente roto no para a los demás */
    }
  }
}
