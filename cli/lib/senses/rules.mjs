/**
 * Rules: "when this holds, do that". ~/.7ots/rules.json, a list of
 *
 *   { id, name, when: { state: 'tired', for: '3m', streak: '>60m', … }, then: { type: 'say', about: '…' },
 *     cooldown: '60m', by: '7ots' | 'user' | 'ot', status: 'active' | 'proposed' | 'off' }
 *
 * when (all must hold):
 *   state  'tired'|'tense'|'focused'|'sad'|'happy'|'neutral'   what the camera reads, held for `for`
 *   streak '>90m'     time at the computer without a break (5 min away = a break)
 *   away   '>10m'     time away right now
 *   app    'code'     the active app contains this (case-insensitive); site likewise ('youtube')
 *   appFor '>45m'     time on that app/site today
 *   hour   '18-23'    local hour range (wraps: '22-6')
 *   meetingIn '<11m'  next calendar event
 *   battery '<15'     percent, only when not charging
 *   mail   'urgent' | 'new'   an email (urgent-looking) in the last 10 min
 * then:
 *   say     a line in character; `about` tells the brain what to talk about ({streak} {state} {app} {site}
 *           {meeting} {meetingIn} {battery} {mail} {time}), `text` is said as is (or when there is no brain)
 *   remind  a reminder `text` in `in` ('10m'), like "remind me…"
 *   quiet   quiet mode for `for` ('25m'): no comments, no reflector
 *   notify  a desktop notification `text`
 * The ot proposes rules of its own (by: 'ot', status: 'proposed'); they only start when you accept them.
 */

import { homeFile, readJson, writeJson } from '../paths.mjs';
import { clip, cmp, cmpOf, dur, human } from './util.mjs';

export const STATES = ['tired', 'tense', 'focused', 'sad', 'happy', 'neutral'];
const THEN = ['say', 'remind', 'quiet', 'notify'];
const ID_RE = /^[\w-]{1,40}$/;

export const SEED_RULES = [
  { id: 'seed-tired-break', name: 'Tired and no break → suggest a rest', when: { state: 'tired', for: '3m', streak: '>60m' }, then: { type: 'say', about: 'They look tired and have been at the computer for {streak} without a break. Suggest a short break (stand up, water, look away from the screen) and offer to remind them later.' }, cooldown: '60m' },
  { id: 'seed-long-streak', name: 'Over 2 h non-stop → a break', when: { streak: '>120m' }, then: { type: 'say', about: 'They have been working {streak} non-stop. Suggest a 5 minute break, kindly.' }, cooldown: '90m' },
  { id: 'seed-focus-quiet', name: 'Focused → quiet mode', when: { state: 'focused', for: '5m' }, then: { type: 'quiet', for: '25m' }, cooldown: '25m' },
  { id: 'seed-tense-help', name: 'Tense → offer help', when: { state: 'tense', for: '4m' }, then: { type: 'say', about: 'They look tense or frustrated (on {app}). Gently offer help with what they are doing, or a breather. One line, no lecture.' }, cooldown: '45m' },
  { id: 'seed-sad', name: 'Down → keep them company', when: { state: 'sad', for: '8m' }, then: { type: 'say', about: 'They look a bit down. Be warm and brief: ask if they want to talk or a small distraction.' }, cooldown: '120m' },
  { id: 'seed-meeting', name: 'Meeting in 10 min → tell me', when: { meetingIn: '<11m' }, then: { type: 'say', about: 'Their calendar event «{meeting}» starts in {meetingIn}. Tell them, and if they have been at it for long ({streak}) suggest a quick stretch first.' }, cooldown: '20m' },
  { id: 'seed-mail-urgent', name: 'Urgent email → tell me', when: { mail: 'urgent' }, then: { type: 'say', about: 'An email that looks urgent just arrived: {mail}. Tell them in one line (do not read it out).' }, cooldown: '10m' },
  { id: 'seed-battery', name: 'Low battery → tell me', when: { battery: '<15' }, then: { type: 'say', about: 'The battery is at {battery}% and not charging. Tell them to plug it in.' }, cooldown: '30m' },
  { id: 'seed-late', name: 'Very late → suggest sleeping', when: { hour: '1-5', streak: '>30m' }, then: { type: 'say', about: 'It is very late ({time}) and they are still at it. Kindly suggest wrapping up and sleeping.' }, cooldown: '120m' },
].map((r) => ({ ...r, by: '7ots', status: 'active' }));

/** Cleans a rule (from the file, the settings page or the brain). Throws on what cannot be a rule. */
export function normalizeRule(r = {}, { by } = {}) {
  if (!r || typeof r !== 'object') throw new Error('rule');
  const w = r.when && typeof r.when === 'object' ? r.when : {};
  const when = {};
  if (w.state !== undefined) {
    if (!STATES.includes(w.state)) throw new Error('when.state');
    when.state = w.state;
    if (w.for !== undefined) {
      if (!Number.isFinite(dur(w.for))) throw new Error('when.for');
      when.for = String(w.for);
    }
  }
  for (const k of ['streak', 'away', 'appFor', 'meetingIn']) {
    if (w[k] === undefined) continue;
    if (!cmpOf(w[k])) throw new Error(`when.${k}`);
    when[k] = String(w[k]).replace(/\s+/g, '');
  }
  if (w.battery !== undefined) {
    if (!cmpOf(w.battery, false)) throw new Error('when.battery');
    when.battery = String(w.battery).replace(/\s+/g, '');
  }
  for (const k of ['app', 'site']) if (w[k] !== undefined && clip(w[k], 60)) when[k] = clip(w[k], 60).toLowerCase();
  if (w.hour !== undefined) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(w.hour).replace(/\s+/g, ''));
    if (!m || +m[1] > 23 || +m[2] > 24) throw new Error('when.hour');
    when.hour = `${+m[1]}-${+m[2]}`;
  }
  if (w.mail !== undefined) {
    if (!['urgent', 'new'].includes(w.mail)) throw new Error('when.mail');
    when.mail = w.mail;
  }
  if (!Object.keys(when).length) throw new Error('when');
  const t = r.then && typeof r.then === 'object' ? r.then : {};
  if (!THEN.includes(t.type)) throw new Error('then.type');
  const then = { type: t.type };
  if (t.about) then.about = clip(t.about, 400);
  if (t.text) then.text = clip(t.text, 200);
  if (t.type === 'remind') {
    if (!then.text) throw new Error('then.text');
    then.in = Number.isFinite(dur(t.in ?? '0m')) ? String(t.in ?? '0m') : '0m';
  }
  if (t.type === 'notify' && !then.text) throw new Error('then.text');
  if (t.type === 'say' && !then.text && !then.about) throw new Error('then.about');
  if (t.type === 'quiet') then.for = Number.isFinite(dur(t.for)) ? String(t.for) : '25m';
  const cd = Number.isFinite(dur(r.cooldown)) ? String(r.cooldown) : '60m';
  return {
    id: ID_RE.test(String(r.id || '')) ? r.id : `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: clip(r.name, 100) || describe({ when, then }),
    when,
    then,
    cooldown: dur(cd) < 60_000 ? '1m' : cd,
    by: by || (['7ots', 'user', 'ot'].includes(r.by) ? r.by : 'user'),
    status: ['active', 'proposed', 'off'].includes(r.status) ? r.status : 'active',
    ...(r.why ? { why: clip(r.why, 300) } : {}),
    ...(r.at ? { at: Number(r.at) || Date.now() } : { at: Date.now() }),
  };
}

/** A plain description, for rules without a name. */
export function describe(r) {
  const w = Object.entries(r.when).map(([k, v]) => `${k} ${v}`).join(' + ');
  return `${w} → ${r.then.type}${r.then.text ? ` «${r.then.text}»` : ''}`.slice(0, 100);
}

const FILE = () => homeFile('rules.json');
export function loadRules() {
  const raw = readJson(FILE(), null);
  if (!Array.isArray(raw)) return SEED_RULES.map((r) => normalizeRule(r, { by: '7ots' }));
  const out = [];
  for (const r of raw.slice(0, 100)) {
    try {
      out.push(normalizeRule(r));
    } catch {}
  }
  return out;
}
export function saveRules(rules) {
  writeJson(FILE(), rules);
}

/** Whether a rule's `when` holds for these facts (see senses/index.mjs facts()). */
export function holds(when, f) {
  if (when.state && (f.state !== when.state || f.stateFor < (dur(when.for) || 0))) return false;
  if (when.streak && !cmp(f.streak, cmpOf(when.streak))) return false;
  if (when.away && !cmp(f.away, cmpOf(when.away))) return false;
  if (when.app && !String(f.app || '').toLowerCase().includes(when.app)) return false;
  if (when.site && !String(f.site || '').toLowerCase().includes(when.site)) return false;
  if (when.appFor && !cmp(f.appFor, cmpOf(when.appFor))) return false;
  if (when.meetingIn && !(f.meetingIn > 0 && cmp(f.meetingIn, cmpOf(when.meetingIn)))) return false;
  if (when.battery && !(f.battery && !f.battery.charging && cmp(f.battery.pct, cmpOf(when.battery, false)))) return false;
  if (when.mail && !(when.mail === 'urgent' ? f.mailUrgent : f.mailNew)) return false;
  if (when.hour) {
    const [a, b] = when.hour.split('-').map(Number);
    const h = new Date(f.now).getHours();
    if (!(a <= b ? h >= a && h < b : h >= a || h < b)) return false;
  }
  return true;
}

/** {streak} {state} … in a rule's text, from the facts. */
export function fill(s, f) {
  const v = {
    streak: human(f.streak),
    state: f.state || 'neutral',
    app: f.app || '?',
    site: f.site || '?',
    meeting: f.meeting || '',
    meetingIn: human(f.meetingIn),
    battery: f.battery?.pct ?? '?',
    mail: f.mailLast || '',
    time: new Date(f.now).toTimeString().slice(0, 5),
  };
  return String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
}
