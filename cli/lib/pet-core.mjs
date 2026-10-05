/**
 * Tamagotchi state: pure functions over a plain object saved in ~/.7ots/pet.json.
 *
 *   food, energy, fun   0..100 (100 = full / rested / happy). They decay with time.
 *   xp, level           grow with work that goes well (passing commands, finished agent turns).
 *   asleep              while asleep energy recovers and it stays quiet. It sleeps until you wake it
 *                       (wake, feed, play). The agent's events don't wake it: only what you asked for
 *                       (a reminder, a watcher, an answer) stirs it for a moment (pet-server).
 *
 * Events come from hooks (Claude Code, the shell) and from the user (feed, play, sleep).
 */

import { homeFile, readJson, writeJson } from './paths.mjs';

const FILE = () => homeFile('pet.json');
const HOUR = 3600_000;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

export function newPet(now = Date.now()) {
  return { food: 90, energy: 100, fun: 80, xp: 0, level: 1, asleep: false, born: now, last: now, lastTalk: 0, lastSeen: now, stats: { ok: 0, fail: 0, turns: 0 } };
}

export function loadPet() {
  const p = readJson(FILE());
  return p && typeof p === 'object' ? { ...newPet(), ...p, stats: { ...newPet().stats, ...p.stats } } : newPet();
}

export function savePet(p) {
  writeJson(FILE(), p);
}

export const xpForLevel = (level) => 20 * level * level;

/** Time passes: needs decay (slower while asleep, energy recovers). */
export function tick(p, now = Date.now()) {
  // Time away counts up to 8 h: coming back after a weekend finds it peckish, not starving.
  const h = Math.max(0, Math.min(8, (now - p.last) / HOUR));
  p.last = now;
  if (!h) return p;
  if (p.asleep) {
    p.energy = clamp(p.energy + 30 * h);
    p.food = clamp(p.food - 2 * h);
  } else {
    p.food = clamp(p.food - 5 * h);
    p.fun = clamp(p.fun - 7 * h);
    p.energy = clamp(p.energy - 4 * h);
  }
  return p;
}

function gainXp(p, n) {
  p.xp += n;
  let up = false;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    up = true;
  }
  return up;
}

/** Mood shown by the face. */
export function moodOf(p) {
  if (p.asleep) return 'sleep';
  // The latest strong feeling wins (a treat after an error cheers it up).
  if (p._sad && Date.now() - p._sad < 90_000 && !(p._happy > p._sad)) return 'sad';
  if (p.food < 20 || p.energy < 15) return 'sad';
  if (p.fun < 20) return 'disgust';
  if (p._happy && Date.now() - p._happy < 60_000) return 'happy';
  return p.food > 60 && p.fun > 60 ? 'happy' : 'neutral';
}

/** Which need complains first (or null). */
export function need(p) {
  if (p.asleep) return null;
  if (p.food < 25) return 'hungry';
  if (p.energy < 20) return 'sleepy';
  if (p.fun < 25) return 'bored';
  return null;
}

/**
 * Applies an event. Returns what the pet would like to react with:
 *   { line: kind for lines.mjs, gesture?, effect?, morph?, important?, levelUp? }
 */
export function applyEvent(p, ev, now = Date.now()) {
  tick(p, now);
  p.lastSeen = now;
  const r = { line: null, gesture: null, important: false };
  const happy = () => (p._happy = now);
  const sad = () => (p._sad = now);
  switch (ev.type) {
    case 'feed': // one "treat" button: food and fun together
      p.food = clamp(p.food + 30);
      p.fun = clamp(p.fun + 20);
      p.asleep = false;
      happy();
      Object.assign(r, { line: 'fed', gesture: 'bounce', effect: 'hearts', important: true });
      break;
    case 'play':
      p.fun = clamp(p.fun + 25);
      p.energy = clamp(p.energy - 5);
      p.asleep = false;
      happy();
      Object.assign(r, { line: 'played', gesture: 'spin', effect: 'sparkles', important: true });
      break;
    case 'sleep':
      p.asleep = true;
      Object.assign(r, { line: 'slept', effect: 'zzz', important: true });
      break;
    case 'wake':
      p.asleep = false;
      Object.assign(r, { line: 'woke', gesture: 'jump', important: true });
      break;
    case 'tool':
      if (ev.ok === false) {
        p.fun = clamp(p.fun - 2);
        p.stats.fail++;
        sad();
        Object.assign(r, { line: 'toolFail', gesture: 'shake', effect: 'sweat' });
      } else {
        p.food = clamp(p.food + 0.5);
        p.stats.ok++;
        r.levelUp = gainXp(p, 1);
        r.line = 'tool';
      }
      break;
    case 'shell':
      if (Number(ev.code) === 0) {
        p.food = clamp(p.food + 1);
        p.stats.ok++;
        r.levelUp = gainXp(p, 1);
        r.line = 'ok';
      } else if (Number(ev.code) !== 130) {
        p.fun = clamp(p.fun - 3);
        p.stats.fail++;
        sad();
        Object.assign(r, { line: 'fail', gesture: 'stomp', effect: 'steam' });
      }
      break;
    case 'prompt':
      p.energy = clamp(p.energy - 1);
      r.line = 'prompt';
      break;
    case 'stop':
      p.food = clamp(p.food + 4);
      p.fun = clamp(p.fun + 3);
      p.stats.turns++;
      happy();
      r.levelUp = gainXp(p, 5);
      Object.assign(r, { line: 'stop', gesture: 'jump', important: true }); // background work finished
      break;
    case 'notify':
      Object.assign(r, { line: 'waiting', gesture: 'wave', important: true });
      break;
    case 'start':
      Object.assign(r, { line: 'hello', gesture: 'wave', important: true });
      break;
    case 'say':
      Object.assign(r, { important: true });
      break;
    default:
      break;
  }
  if (r.levelUp) Object.assign(r, { line: 'levelUp', gesture: 'celebrate', effect: 'confetti', morph: 'wings', important: true });
  return r;
}

/** Public view for renderers (no internal fields). */
export function view(p) {
  return {
    food: Math.round(p.food),
    energy: Math.round(p.energy),
    fun: Math.round(p.fun),
    xp: p.xp,
    next: xpForLevel(p.level),
    level: p.level,
    asleep: p.asleep,
    mood: moodOf(p),
    stats: p.stats,
    born: p.born,
  };
}
