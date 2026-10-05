/**
 * Identidades aleatorias reproducibles: la misma semilla da siempre el mismo ot (cara, nombre,
 * carácter, voz y avatar de meet). Así la web, el CLI, la mascota y apuchat meet comparten una
 * identidad sin guardarla en ningún servidor: basta con la semilla («k7x2qa»).
 * Código puro (sin DOM ni Node).
 */

import { randomCharacter } from '../character/Character.js';
import { defineIdentity, MEET_AVATARS, MEET_SCENES } from './schema.js';

const START = ['b', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'ch', 'br', 'tr', 'gl', 'pl', 'qu'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'a', 'o', 'i'];
const END = ['', '', '', 'n', 'l', 's', 'r', 'x', 'k', 'm'];

const TEXT = {
  es: {
    roles: ['asistente de la casa', 'guía curioso', 'compañero de código', 'anfitrión digital', 'ayudante incansable', 'explorador de páginas', 'mascota con opiniones', 'vigía de la terminal'],
    tones: ['cercano y juguetón', 'tranquilo y claro', 'entusiasta y directo', 'irónico pero amable', 'tierno y curioso', 'serio con chispa'],
    traits: ['curioso', 'paciente', 'bromista', 'ordenado', 'dramático', 'optimista', 'despistado', 'leal', 'mandón', 'dormilón', 'glotón', 'valiente'],
    tagline: (n) => `Hola, soy ${n}.`,
  },
  en: {
    roles: ['house assistant', 'curious guide', 'coding buddy', 'digital host', 'tireless helper', 'page explorer', 'opinionated pet', 'terminal lookout'],
    tones: ['warm and playful', 'calm and clear', 'eager and direct', 'wry but kind', 'sweet and curious', 'serious with a spark'],
    traits: ['curious', 'patient', 'cheeky', 'tidy', 'dramatic', 'optimistic', 'scatterbrained', 'loyal', 'bossy', 'sleepy', 'hungry', 'brave'],
    tagline: (n) => `Hi, I'm ${n}.`,
  },
  pt: {
    roles: ['assistente da casa', 'guia curioso', 'parceiro de código', 'anfitrião digital', 'ajudante incansável', 'explorador de páginas', 'mascote com opiniões', 'vigia do terminal'],
    tones: ['próximo e brincalhão', 'calmo e claro', 'entusiasmado e direto', 'irônico mas gentil', 'fofo e curioso', 'sério com faísca'],
    traits: ['curioso', 'paciente', 'brincalhão', 'organizado', 'dramático', 'otimista', 'distraído', 'leal', 'mandão', 'dorminhoco', 'guloso', 'corajoso'],
    tagline: (n) => `Oi, eu sou ${n}.`,
  },
};

/**
 * Semilla corta y legible (7 caracteres base36). Las de 7 caracteres sortean entre el catálogo
 * completo de piezas; cualquier otra longitud (las de 6 de antes de 2026-10, las escritas a mano)
 * usa solo el catálogo 1, así que sigue dando exactamente el mismo ot que siempre.
 */
export function newSeed() {
  let s = '';
  for (let i = 0; i < 7; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

/** ¿La semilla usa el catálogo 1 (todas salvo las de 7 caracteres, ver newSeed)? */
export function isLegacySeed(seed) {
  return cleanSeed(seed).length !== 7;
}

/** Personaje de una semilla (el mismo en la web, el CLI, la mascota y el visor 3D). */
export function seedCharacter(seed) {
  return randomCharacter(seedNumber(seed), { legacy: isLegacySeed(seed) });
}

/** Normaliza una semilla escrita por una persona: minúsculas, [a-z0-9-], máx. 32. */
export function cleanSeed(seed) {
  return String(seed ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
}

/** Texto → entero de 32 bits (FNV-1a). */
export function seedNumber(seed) {
  let h = 2166136261;
  for (const c of cleanSeed(seed) || '7ots') h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h || 1;
}

function rng(n) {
  let s = n >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
  return { rnd, pick: (l) => l[Math.floor(rnd() * l.length)] };
}

/** Nombre pronunciable a partir de la semilla («Tobix», «Mirel»…). */
export function randomName(seed) {
  const { rnd, pick } = rng(seedNumber(seed) ^ 0x51ed);
  const syl = rnd() < 0.55 ? 2 : rnd() < 0.8 ? 1 : 3;
  let n = '';
  for (let i = 0; i < syl; i++) n += pick(START) + pick(VOWEL);
  n += pick(END);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * Identidad completa y válida (pasa por defineIdentity).
 * @param {string} seed
 * @param {{ lang?: 'en'|'es'|'pt', name?: string }} [opts] el nombre puede fijarse; el resto sale de la semilla
 */
export function randomIdentity(seed, { lang = 'en', name } = {}) {
  const sd = cleanSeed(seed) || newSeed();
  const L = TEXT[lang] ? lang : 'en';
  const tx = TEXT[L];
  const { rnd, pick } = rng(seedNumber(sd));
  const character = seedCharacter(sd);
  const nm = String(name || '').trim().slice(0, 40) || randomName(sd);
  const traits = [];
  while (traits.length < 3) {
    const t = pick(tx.traits);
    if (!traits.includes(t)) traits.push(t);
  }
  const female = rnd() < 0.5;
  return defineIdentity({
    id: `${nm}-${sd}`,
    name: nm,
    role: pick(tx.roles),
    tagline: tx.tagline(nm),
    language: L,
    personality: { tone: pick(tx.tones), traits },
    look: {
      kind: 'character',
      character,
      color: character.body.color,
      accent: character.eyes.iris,
      meetAvatar: pick(MEET_AVATARS),
      meetScene: pick(MEET_SCENES),
    },
    voice: {
      provider: 'auto',
      lang: { es: 'es-ES', en: 'en-US', pt: 'pt-BR' }[L],
      rate: Math.round((0.95 + rnd() * 0.2) * 100) / 100,
      pitch: Math.round((female ? 1.05 + rnd() * 0.3 : 0.8 + rnd() * 0.25) * 100) / 100,
    },
    seed: sd,
  });
}
