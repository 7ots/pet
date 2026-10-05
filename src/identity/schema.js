/**
 * Esquema de la identidad de un agente 7ots: quién es, cómo se ve, cómo suena y cómo se le contacta.
 * Código puro (sin DOM ni Node): lo usan el widget, la tarjeta <ots-identity>, la cara
 * (createFace), el proxy y el SDK de servidor.
 *
 *   {
 *     id, name, role, tagline, seed, bio, language, languages[],
 *     personality: { tone, traits[], instructions },          // instructions: privadas, solo servidor
 *     look:    { kind: character|plush|image (realistic: heredado, se trata como character),
 *                character: {…personaje, ver src/character}, material: plush|vinyl (kind plush),
 *                color, accent, emoji, image, avatar: { url, body, mood, cameraView },
 *                face: { skin, eyes }, meetAvatar, meetScene },
 *     voice:   { provider: auto|apuchat|elevenlabs|grok|fish|openai|browser, voiceId, model, style, lang, rate, pitch, browserVoice },
 *     contact: { site, email, apuchat, meet, call, hours },
 *   }
 *
 * La identidad NUNCA contiene secretos (las claves de apumail/apuchat/TTS viven en el servidor).
 */

import { normalizeCharacter } from '../character/Character.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/identity.js';

/** Tipos de aspecto válidos. 'realistic' (.glb externo) ya no se ofrece: se lee y se muestra como 'character'. */
export const LOOK_KINDS = ['character', 'plush', 'image', 'realistic'];
/** Tipos que ofrecen los editores. */
export const LOOK_KINDS_OFFERED = ['character', 'plush', 'image'];
export const LOOK_MATERIALS = ['plush', 'vinyl'];
export const MEET_AVATARS = ['shibu', 'shino', 'fumiriya', 'victoria', 'vita', 'vivi', 'kuro', 'maya', 'ingrid', 'kenji', 'viktor', 'marcus', 'leo', 'mei', 'claire', 'doctor', 'amira'];
export const MEET_SCENES = ['studio', 'beach', 'castle', 'space', 'sunset', 'forest', 'night', 'office', 'neon'];
export const VOICE_PROVIDERS = ['auto', 'apuchat', 'elevenlabs', 'grok', 'fish', 'openai', 'browser'];
/** Voces integradas de xAI (Grok) TTS; también admite ids de voces clonadas propias. */
export const GROK_VOICES = ['eve', 'ara', 'leo', 'rex', 'sal'];
/** TTS models per provider, first = what the server uses when none is picked. xAI has a single model. */
export const TTS_MODELS = {
  elevenlabs: ['eleven_multilingual_v2', 'eleven_v3', 'eleven_flash_v2_5', 'eleven_turbo_v2_5'],
  openai: ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'],
  fish: ['s2.1-pro', 's1', 'speech-1.6', 'speech-1.5'],
  apuchat: ['s2.1-pro-free'],
  grok: [],
};
export const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
export const MOODS = ['neutral', 'happy', 'angry', 'sad', 'fear', 'disgust', 'love', 'sleep'];

export const IDENTITY_DEFAULTS = Object.freeze({
  id: 'asistente',
  name: 'Asistente',
  role: 'asistente virtual',
  tagline: '',
  seed: '',
  bio: '',
  language: 'es',
  languages: [],
  personality: { tone: 'cercano y claro', traits: [], instructions: '' },
  look: {
    kind: '', // character (2D) | plush (el mismo personaje en 3D) | image (retrato). Vacío = se deduce
    character: null, // personaje (null = el de serie); lo usan character y plush
    material: 'plush', // plush (peluche con pelo) | vinyl (juguete liso), solo para kind plush
    color: '#6d5dfc',
    accent: '#22d3ee',
    emoji: '',
    image: '', // retrato (URL) para tarjetas, correo y vCard
    avatar: { url: '', body: 'F', mood: 'neutral', cameraView: 'upper' }, // .glb 3D (vacío = el de serie)
    face: { skin: '', eyes: '' }, // colores de la cara 2D
    meetAvatar: 'vivi',
    meetScene: '',
  },
  voice: { provider: 'auto', voiceId: '', model: '', style: '', lang: 'es-ES', rate: 1.05, pitch: 1, browserVoice: '' },
  contact: { site: '', email: '', apuchat: '', meet: true, call: true, hours: '' },
});

/**
 * Normaliza y valida una identidad (acepta objetos parciales). Nunca lanza: descarta lo inválido.
 * @param {object} input
 * @param {object} [base] identidad sobre la que se aplica (por defecto, los valores de serie)
 */
/** Campos de la ficha de personaje y su largo máximo. */
const SHEET = { backstory: 3000, style: 1500, quirks: 1500, scenario: 1500, greeting: 600, examples: 4000 };

export function defineIdentity(input = {}, base = IDENTITY_DEFAULTS) {
  const i = input && typeof input === 'object' ? input : {};
  const b = base;
  const look = { ...b.look, ...pick(i.look) };
  const voice = { ...b.voice, ...pick(i.voice) };
  const contact = { ...b.contact, ...pick(i.contact) };
  const personality = { ...b.personality, ...pick(i.personality) };
  const out = {
    // El id es estable: solo cambia si se da uno explícito o si aún es el de serie.
    id: slug(i.id) || (b.id !== IDENTITY_DEFAULTS.id ? b.id : slug(i.name)) || IDENTITY_DEFAULTS.id,
    name: str(i.name ?? b.name, 60) || IDENTITY_DEFAULTS.name,
    role: str(i.role ?? b.role, 120),
    tagline: str(i.tagline ?? b.tagline, 160),
    seed: String(i.seed ?? b.seed ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32), // semilla de randomIdentity
    bio: str(i.bio ?? b.bio, 1200),
    language: lang(i.language ?? b.language) || 'es',
    languages: list(i.languages ?? b.languages, 12).map(lang).filter(Boolean),
    personality: {
      tone: str(personality.tone, 120),
      traits: list(personality.traits, 12).map((t) => str(t, 40)).filter(Boolean),
      instructions: str(personality.instructions, 4000),
      // ficha de personaje (la misma del pet de escritorio; privada como las instrucciones)
      sheet: Object.fromEntries(Object.entries(SHEET).map(([k, n]) => [k, str(personality.sheet?.[k], n)]).filter(([, v]) => v)),
    },
    look: {
      kind: LOOK_KINDS.includes(look.kind) ? look.kind : look.image ? 'image' : 'character',
      character: normalizeCharacter(look.character || {}),
      material: LOOK_MATERIALS.includes(look.material) ? look.material : 'plush',
      color: color(look.color) || IDENTITY_DEFAULTS.look.color,
      accent: color(look.accent) || IDENTITY_DEFAULTS.look.accent,
      emoji: str(look.emoji, 8),
      image: url(look.image),
      card: { foil: ['holo', 'prism', 'cosmos', 'gold', 'none'].includes(look.card?.foil) ? look.card.foil : '' },
      avatar: {
        url: url(look.avatar?.url),
        body: look.avatar?.body === 'M' ? 'M' : 'F',
        mood: MOODS.includes(look.avatar?.mood) ? look.avatar.mood : 'neutral',
        cameraView: ['full', 'mid', 'upper', 'head'].includes(look.avatar?.cameraView) ? look.avatar.cameraView : 'upper',
      },
      face: { skin: color(look.face?.skin), eyes: color(look.face?.eyes) },
      meetAvatar: MEET_AVATARS.includes(String(look.meetAvatar).toLowerCase()) ? String(look.meetAvatar).toLowerCase() : 'vivi',
      meetScene: MEET_SCENES.includes(String(look.meetScene).toLowerCase()) ? String(look.meetScene).toLowerCase() : '',
    },
    voice: {
      provider: VOICE_PROVIDERS.includes(voice.provider) ? voice.provider : 'auto',
      voiceId: str(voice.voiceId, 80),
      model: str(voice.model, 80),
      style: str(voice.style, 400),
      lang: /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(voice.lang)) ? voice.lang : 'es-ES',
      rate: num(voice.rate, 0.5, 2, 1.05),
      pitch: num(voice.pitch, 0, 2, 1),
      browserVoice: str(voice.browserVoice, 120),
    },
    contact: {
      site: url(contact.site),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(contact.email || '')) ? String(contact.email).toLowerCase() : '',
      apuchat: String(contact.apuchat || '').trim().replace(/^https?:\/\/[^/]+\//i, '').replace(/^@/, '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32),
      meet: contact.meet !== false,
      call: contact.call !== false,
      hours: str(contact.hours, 120),
    },
  };
  return out;
}

// ───────────────────────────── salidas ─────────────────────────────

/**
 * Tarjeta pública: lo que cualquiera puede saber del agente y cómo contactarlo.
 * @param {object} id                  identidad normalizada
 * @param {{ email?: boolean, apuchat?: string|null, meet?: boolean }} [live]  canales que atiende el propio agente
 */
export function publicIdentity(id, live = {}) {
  const apuchat = live.apuchat || id.contact.apuchat || '';
  return {
    '@type': '7ots/agent',
    version: 1,
    id: id.id,
    name: id.name,
    role: id.role,
    tagline: id.tagline,
    seed: id.seed || undefined,
    bio: id.bio,
    language: id.language,
    languages: id.languages,
    personality: { tone: id.personality.tone, traits: id.personality.traits }, // las instrucciones no son públicas
    look: id.look,
    voice: { provider: id.voice.provider, lang: id.voice.lang, rate: id.voice.rate, pitch: id.voice.pitch, browserVoice: id.voice.browserVoice },
    contact: {
      site: id.contact.site,
      hours: id.contact.hours,
      email: id.contact.email,
      apuchat,
      // meet: el agente entra en llamadas de meet.apuchat.com; call: se puede abrir una desde la web
      meet: !!(id.contact.meet && apuchat && live.meet !== false),
      call: !!(id.contact.call && live.meet),
      // qué canales contesta el agente él solo (el resto los lee una persona o tu sistema)
      answers: { email: !!live.email, apuchat: !!live.apuchat, meet: !!live.meet },
    },
  };
}

/** vCard 4.0 de la tarjeta pública. */
export function toVCard(card, { baseUrl = '' } = {}) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', 'KIND:individual', `FN:${esc(card.name)}`, `UID:urn:7ots:${card.id}`];
  if (card.role) lines.push(`TITLE:${esc(card.role)}`);
  if (card.bio || card.tagline) lines.push(`NOTE:${esc(card.tagline || card.bio)}`);
  if (card.contact.email) lines.push(`EMAIL;TYPE=work:${card.contact.email}`);
  if (card.contact.apuchat) lines.push(`IMPP;PREF=1:apuchat:${card.contact.apuchat}`);
  if (card.contact.site) lines.push(`URL:${card.contact.site}`);
  if (card.look.image) lines.push(`PHOTO:${card.look.image}`);
  if (card.language) lines.push(`LANG:${card.language}`);
  if (baseUrl) lines.push(`SOURCE:${baseUrl}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Líneas del system prompt que dan personalidad al agente (web y canales).
 * Se redactan en el idioma de la identidad (`id.language`; uno sin catálogo usa inglés).
 * @param {object} id  identidad normalizada
 * @param {string} [locale]  fuerza otro idioma
 */
export function identityPrompt(id, locale = id.language) {
  const p = id.personality;
  const t = translator(locale || 'es');
  return [
    id.role ? t('identity.prompt.youAreRole', { name: id.name, role: id.role }) : t('identity.prompt.youAre', { name: id.name }),
    id.bio ? t('identity.prompt.about', { bio: id.bio }) : '',
    p.tone ? t('identity.prompt.tone', { tone: p.tone }) : '',
    p.traits.length ? t('identity.prompt.traits', { traits: p.traits.join(', ') }) : '',
    p.sheet?.backstory,
    p.sheet?.style,
    p.sheet?.quirks,
    p.sheet?.examples,
    p.instructions,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Traduce la identidad a la configuración del widget (agent, avatar, voice, theme).
 * Lo que el sitio pase explícitamente en init() manda sobre esto.
 */
export function identityToWidgetConfig(id) {
  const a = id.look.avatar;
  const kind = id.look.kind || 'character';
  // El personaje va siempre: es el avatar en 'character' y 'plush' (y el respaldo 2D si falla el 3D).
  // 'realistic' (heredado) se muestra como 'character'.
  const avatar =
    kind === 'plush'
      ? { mode: '3d-plush', character: id.look.character, material: id.look.material || 'plush', mood: a.mood }
      : kind === 'image' && id.look.image
        ? { mode: '2d', image: id.look.image, face: id.look.face, mood: a.mood }
        : { mode: '2d', character: id.look.character, mood: a.mood };
  return {
    agent: { name: id.name, role: id.role, language: id.language },
    avatar,
    voice: {
      lang: id.voice.lang,
      rate: id.voice.rate,
      pitch: id.voice.pitch,
      ...(id.voice.browserVoice ? { voice: id.voice.browserVoice } : {}),
      ...(id.voice.provider === 'browser' ? { tts: 'browser' } : {}),
    },
    theme: { primary: id.look.color, accent: id.look.accent },
  };
}

// ───────────────────────────── helpers ─────────────────────────────

function pick(o) {
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
}
function str(v, max) {
  return v == null ? '' : String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}
function list(v, max) {
  if (typeof v === 'string') v = v.split(',');
  return Array.isArray(v) ? v.slice(0, max) : [];
}
function slug(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
function lang(v) {
  const m = String(v || '').trim().toLowerCase().match(/^[a-z]{2,3}/);
  return m ? m[0] : '';
}
function color(v) {
  const s = String(v || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ? s : '';
}
function url(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s.slice(0, 500); // ruta del propio sitio
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href.slice(0, 500) : '';
  } catch {
    return '';
  }
}
function num(v, min, max, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
