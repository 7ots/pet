/**
 * The ot's senses: what it notices about you (camera, activity, the computer, email, calendar), what it does
 * with that (rules, gesture commands) and a reflector that now and then asks the brain whether there is
 * something worth doing or a rule worth proposing. See docs/SENSES.md.
 *
 *   sources ──► events + current facts ──► rules (rules.json) ──► say / remind / quiet / notify
 *                                     └──► reflector (brain) ──► one line, or a rule it proposes (you accept)
 *   camera page (/senses) ──► gestures ──► gestures.json ──► confirm / media / key / command / ask / pause
 *
 * Kept on this computer only (never in desktop sync): ~/.7ots/senses/day-YYYY-MM-DD.json (14 days of
 * aggregates: minutes per app, site and face state, breaks), baseline.json (your neutral face, numbers only),
 * fired.json (rule cooldowns). Camera frames never leave the page: the daemon only gets labels.
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homeFile, readJson, writeJson } from '../paths.mjs';
import { createActivity } from './sources/activity.mjs';
import { createCalendar } from './sources/calendar.mjs';
import { createMail } from './sources/mail.mjs';
import { createSystem } from './sources/system.mjs';
import { SOURCES } from './sources/index.mjs';
import { GESTURES, command, key, loadGestures, media, normalizeGestures, saveGestures } from './gestures.mjs';
import { STATES, fill, holds, loadRules, normalizeRule, saveRules } from './rules.mjs';
import { clip, dayKey, dur, human } from './util.mjs';

export { GESTURES, STATES, SOURCES };
export const SENSES_DEFAULTS = { arm: true, holdMs: 600, fps: 5, reflect: true };

const KEEP_DAYS = 14;
const BREAK = 5 * 60_000; // this long away = a break (the streak starts over)
const CAMERA_STALE = 30_000;
const REFLECT = { 0: Infinity, 1: 90 * 60_000, 2: 40 * 60_000, 3: 15 * 60_000 }; // by the annoyance level
const PROPOSE_GAP = 3 * 3_600_000;
const MAX_OT_RULES = 12;
const ARM_MS = 6000;

const T = {
  en: { propose: (n) => `Shall I add this rule? «${n}»`, armed: 'I see you 👋 what do I do?', paused: (m) => `Camera paused for ${m} min.`, cmd: (l) => `Run «${l}» when you make that gesture?`, failed: 'That did not work here.' },
  es: { propose: (n) => `¿Agrego esta regla? «${n}»`, armed: 'Te veo 👋 ¿qué hago?', paused: (m) => `Cámara en pausa ${m} min.`, cmd: (l) => `¿Ejecuto «${l}» cada vez que hagas ese gesto?`, failed: 'Eso no funcionó acá.' },
  pt: { propose: (n) => `Adiciono esta regra? «${n}»`, armed: 'Te vejo 👋 o que eu faço?', paused: (m) => `Câmera pausada por ${m} min.`, cmd: (l) => `Executo «${l}» quando você fizer esse gesto?`, failed: 'Isso não funcionou aqui.' },
};
// what the seed rules say with the built-in phrases (no AI brain to word `about`)
const PLAIN = {
  en: { 'seed-tired-break': 'You look tired and it has been {streak}. A short break? Water, stand up, look away.', 'seed-long-streak': '{streak} non-stop! Five minutes of break?', 'seed-tense-help': 'Rough one? Tell me if I can help.', 'seed-sad': 'I am here if you want to talk 💛', 'seed-meeting': '«{meeting}» starts in {meetingIn}.', 'seed-mail-urgent': 'Urgent-looking email: {mail}', 'seed-battery': 'Battery at {battery}%: plug it in!', 'seed-late': 'It is {time}… time to sleep?' },
  es: { 'seed-tired-break': 'Te veo cansado y llevas {streak}. ¿Una pausa? Agua, estirarte, mirar lejos.', 'seed-long-streak': '¡{streak} sin parar! ¿Cinco minutos de pausa?', 'seed-tense-help': '¿Difícil? Dime si te ayudo.', 'seed-sad': 'Estoy aquí si quieres hablar 💛', 'seed-meeting': '«{meeting}» empieza en {meetingIn}.', 'seed-mail-urgent': 'Correo que parece urgente: {mail}', 'seed-battery': 'Batería al {battery}%: ¡enchúfame!', 'seed-late': 'Son las {time}… ¿a dormir?' },
  pt: { 'seed-tired-break': 'Você parece cansado e já são {streak}. Uma pausa? Água, levantar, olhar longe.', 'seed-long-streak': '{streak} sem parar! Cinco minutos de pausa?', 'seed-tense-help': 'Difícil? Me diz se posso ajudar.', 'seed-sad': 'Estou aqui se quiser conversar 💛', 'seed-meeting': '«{meeting}» começa em {meetingIn}.', 'seed-mail-urgent': 'Email que parece urgente: {mail}', 'seed-battery': 'Bateria em {battery}%: liga na tomada!', 'seed-late': 'São {time}… hora de dormir?' },
};
const MEDIA_ICON = { 'play-pause': '⏯', next: '⏭', prev: '⏮', mute: '🔇', up: '🔊', down: '🔉' };
const FEATURE = /^[a-zA-Z]{2,40}$/;

const emptyDay = (date) => ({ date, active: 0, away: 0, breaks: 0, longest: 0, apps: {}, sites: {}, states: {}, gestures: {}, mail: 0 });

/**
 * @param o.config () => config      (access.*, senses.*, integrations)
 * @param o.talk ({ text, about, exact, kind, important, gesture }) => Promise<boolean>   says a line if pacing
 *               allows; `about` is worded by the brain (unless `exact`), `text` is the line without one
 * @param o.confirm (text) => Promise<boolean>      Approve / Reject in its bubble
 * @param o.answer (ok) => boolean                  answers the question it is asking now, if any
 * @param o.asking () => boolean
 * @param o.remind ({ at, text }) => string         sets a reminder
 * @param o.ask (text) => Promise                   as if you had typed it
 * @param o.broadcast (msg) => void                 to the pet pages (SSE)
 */
export function createSenses({ config, brain, lang = 'en', system = () => '', annoy = () => 2, busy = () => false, talk, confirm, answer, asking, remind, ask, notify = () => {}, broadcast = () => {}, log = () => {} }) {
  const L = T[lang] || T.en;
  const dir = homeFile('senses');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = (n) => join(dir, n);
  const conf = () => ({ ...SENSES_DEFAULTS, ...config().senses });
  const acc = () => config().access || {};

  // ── what it keeps ──
  let day = { ...emptyDay(dayKey()), ...readJson(f(`day-${dayKey()}.json`), {}) };
  const saveDay = () => writeJson(f(`day-${day.date}.json`), day, { secret: true });
  function prune() {
    const cut = dayKey(Date.now() - KEEP_DAYS * 86_400_000);
    for (const n of readdirSync(dir)) if (/^day-\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(4, 14) < cut) unlinkSync(f(n));
  }
  prune();
  let fired = readJson(f('fired.json'), {}) || {};
  let rules = loadRules();
  if (!existsSync(homeFile('rules.json'))) saveRules(rules);
  let gestures = loadGestures();
  if (!existsSync(homeFile('gestures.json'))) saveGestures(gestures);
  const recent = []; // events of the last 2 h: { source, kind, ts, value, summary, urgency }

  // ── now ──
  const cam = { on: false, at: 0, state: 'neutral', score: 0, since: Date.now(), present: null, scores: {} };
  let streakStart = Date.now();
  let awaySince = 0;
  let present = null;
  let quietUntil = 0;
  let armedUntil = 0;
  let lastReflect = Date.now();
  let lastPropose = Number(fired['@propose']) || 0;
  let lastTick = Date.now();
  const lastGesture = {};
  let reflecting = false;

  const activity = createActivity({ enabled: () => acc().activity === true, log });
  const sys = createSystem();
  const emit = (e) => {
    const ev = { source: e.source, kind: e.kind, ts: Date.now(), value: e.value ?? null, summary: clip(e.summary, 200), urgency: Math.max(0, Math.min(3, e.urgency | 0)) };
    recent.push(ev);
    while (recent.length && (recent.length > 400 || recent[0].ts < Date.now() - 2 * 3_600_000)) recent.shift();
    if (ev.source === 'mail') day.mail++;
    return ev;
  };
  const mail = createMail({ config, emit, log });
  const calendar = createCalendar({ config, log });

  const camFresh = () => acc().camera === true && cam.on && Date.now() - cam.at < CAMERA_STALE;
  const paused = () => Number(config().senses?.pausedUntil) > Date.now();

  function presence() {
    if (camFresh() && cam.present != null) return cam.present;
    const a = activity.now;
    if (a && Number.isFinite(a.idleMs)) return a.idleMs < BREAK;
    return null; // nothing tells
  }

  function facts() {
    const now = Date.now();
    const a = activity.now;
    const next = calendar.next;
    const mails = recent.filter((e) => e.source === 'mail' && e.ts > now - 10 * 60_000);
    const urgent = mails.filter((e) => e.value?.urgent);
    return {
      now,
      present,
      state: camFresh() && cam.present !== false ? cam.state : null,
      stateFor: now - cam.since,
      streak: present === null ? 0 : now - streakStart,
      away: awaySince ? now - awaySince : 0,
      app: a?.app || '',
      site: a?.site || '',
      appFor: Math.max(day.apps[a?.app] || 0, day.sites[a?.site] || 0),
      meeting: next?.title || '',
      meetingIn: next ? next.start - now : 0,
      battery: sys.now?.battery || null,
      cpu: sys.now?.cpu ?? null,
      mailNew: mails.length > 0,
      mailUrgent: urgent.length > 0,
      mailLast: (urgent.at(-1) || mails.at(-1))?.summary || '',
    };
  }

  // ── every 15 s: time adds up, rules are checked ──
  let ticks = 0;
  async function tick() {
    const now = Date.now();
    const dt = Math.min(60_000, now - lastTick);
    lastTick = now;
    if (dayKey(now) !== day.date) {
      saveDay();
      day = emptyDay(dayKey(now));
      prune();
    }
    await activity.tick();
    if (ticks % 4 === 0) await sys.tick();
    if (ticks % 20 === 0) mail.tick();
    if (ticks % 60 === 0) calendar.tick();
    ticks++;
    if (cam.on && !camFresh()) (cam.on = false), broadcast({ senses: { camera: paused() ? 'paused' : 'off' } }); // the page went away
    present = presence();
    if (present === true) {
      if (awaySince && now - awaySince >= BREAK) (streakStart = now), day.breaks++;
      awaySince = 0;
      day.active += dt;
      const a = activity.now;
      if (a?.app) day.apps[a.app] = (day.apps[a.app] || 0) + dt;
      if (a?.site) day.sites[a.site] = (day.sites[a.site] || 0) + dt;
      if (camFresh()) day.states[cam.state] = (day.states[cam.state] || 0) + dt;
      day.longest = Math.max(day.longest, now - streakStart);
    } else if (present === false) {
      awaySince ||= now;
      day.away += dt;
    }
    if (ticks % 4 === 0) saveDay();
    await checkRules();
    if (now - lastReflect > REFLECT[annoy()] && conf().reflect !== false) reflect();
  }
  const timer = setInterval(() => tick().catch((e) => log(`senses: ${e.message}`)), 15_000);
  timer.unref?.();
  const first = setTimeout(() => tick().catch(() => {}), 3000);

  // ── rules ──
  const important = (r) => Boolean(r.when.meetingIn || r.when.mail || r.when.battery);
  async function checkRules() {
    if (!anyOn()) return;
    const F = facts();
    let said = false;
    for (const r of rules) {
      if (r.status !== 'active' || !holds(r.when, F)) continue;
      if (Date.now() - (Number(fired[r.id]) || 0) < dur(r.cooldown)) continue;
      const t = r.then;
      if (t.type === 'say') {
        if (said || (Date.now() < quietUntil && !important(r))) continue;
        const plain = t.text || (PLAIN[lang] || PLAIN.en)[r.id] || '';
        const ok = await talk({ kind: `rule:${r.id}`, about: t.about ? fill(t.about, F) : '', text: plain ? fill(plain, F) : '', exact: Boolean(t.text), important: important(r), gesture: r.when.state === 'tired' ? 'yawn' : 'wave' });
        if (!ok) continue; // not now (it is talking, asleep, or you are chatting): it tries again on a later tick
        said = true;
      } else if (t.type === 'remind') remind({ at: Date.now() + (dur(t.in) || 0), text: fill(t.text, F) });
      else if (t.type === 'quiet') {
        quietUntil = Date.now() + (dur(t.for) || 25 * 60_000);
        broadcast({ senses: { quiet: quietUntil } });
      } else if (t.type === 'notify') notify(fill(t.text, F));
      fired[r.id] = Date.now();
      writeJson(f('fired.json'), fired);
      log(`senses: rule ${r.id} (${t.type})`);
    }
  }

  // ── the reflector: now and then, is there something worth doing? ──
  function digest() {
    const F = facts();
    const top = (o, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).filter(([, ms]) => ms >= 60_000).map(([k, ms]) => `${k} ${human(ms)}`).join(', ');
    const faces = Object.values(day.states).reduce((a, b) => a + b, 0);
    const lines = [
      `Now: ${new Date(F.now).toLocaleString()}.`,
      F.present === false ? `They are away (${human(F.away)}).` : F.present ? `At the computer for ${human(F.streak)} without a break.` : '',
      F.app ? `Active app: ${F.app}${F.site ? ` (site: ${F.site})` : ''}, ${human(F.appFor)} today.` : '',
      `Today: active ${human(day.active)}, away ${human(day.away)}, ${day.breaks} breaks, longest stretch ${human(day.longest)}.`,
      top(day.apps) ? `Apps today: ${top(day.apps)}.` : '',
      top(day.sites) ? `Sites today: ${top(day.sites)}.` : '',
      F.state ? `Their face right now reads as ${F.state} (a hint, not a fact; for ${human(F.stateFor)}).` : '',
      faces > 10 * 60_000 ? `Face today: ${top(day.states)}.` : '',
      calendar.upcoming.length ? `Calendar: ${calendar.upcoming.map((e) => `«${e.title}» at ${new Date(e.start).toTimeString().slice(0, 5)}`).join(', ')}.` : '',
      mail.latest.length && acc().mail ? `Latest emails: ${mail.latest.map((m) => `${m.from} «${m.subject}»${m.urgent ? ' (looks urgent)' : ''}`).join('; ')}.` : '',
      F.battery ? `Battery ${F.battery.pct}%${F.battery.charging ? ' charging' : ''}.` : '',
      F.cpu != null && F.cpu > 85 ? `The computer is busy (load ${F.cpu}%).` : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  /** For the assistant's prompt: what it notices, when any sense is on. */
  function prompt() {
    if (!anyOn()) return '';
    return `What you notice about your human right now (your senses; hints, not facts — use them when relevant, never recite them):\n${digest()}`;
  }

  async function reflect({ force = false } = {}) {
    lastReflect = Date.now();
    if (reflecting || brain.kind === 'lines' || !anyOn()) return null;
    if (!force && (busy() || Date.now() < quietUntil || present !== true || paused())) return null;
    reflecting = true;
    try {
      const mine = rules.map((r) => `- [${r.status}] ${r.name} ${JSON.stringify(r.when)} → ${r.then.type}`).join('\n');
      const may = Date.now() - lastPropose > PROPOSE_GAP && rules.filter((r) => r.by === 'ot').length < MAX_OT_RULES;
      const raw = await brain.think({
        purpose: 'senses',
        system: system(),
        messages: [
          {
            role: 'user',
            content: `You quietly look after your human and help them before they ask. What you know right now:\n${digest()}\n\nYour rules (automatic reactions):\n${mine || '(none)'}\n\nIs there ONE thing worth doing now? Most of the time there is not: then answer {"say":"","rule":null}.\n- "say": one short line to them in ${lang}, in character, useful or caring (a break, an upcoming meeting, a site eating their day, a tip about what they do). Never mention the camera or diagnose emotions as facts.\n${may ? `- "rule": only if you notice a pattern worth automating that none of your rules covers, propose ONE: {"name":"short, in ${lang}","why":"one line","when":{…},"then":{…},"cooldown":"60m"}. when keys: state (tired|tense|focused|sad|happy) + for ("5m"), streak (">90m"), away, app ("code"), site ("youtube"), appFor (">45m"), hour ("18-23"), meetingIn ("<15m"), battery ("<20"), mail ("urgent"). then: {"type":"say","about":"what to tell them; may use {streak} {app} {site} {meeting} {time}"} | {"type":"remind","text":"…","in":"0m"} | {"type":"quiet","for":"25m"}.` : '- "rule": null (no proposals now).'}\nAnswer ONLY the JSON object.`,
          },
        ],
        timeoutMs: 60000,
        raw: true,
      });
      const j = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || '{}');
      const say = clip(j.say, 300);
      if (may && j.rule && typeof j.rule === 'object') {
        let r = null;
        try {
          r = normalizeRule({ ...j.rule, status: 'proposed' }, { by: 'ot' });
        } catch (e) {
          log(`senses: proposed rule dropped (${e.message})`);
        }
        if (r && !rules.some((x) => JSON.stringify(x.when) === JSON.stringify(r.when) && x.then.type === r.then.type)) {
          lastPropose = fired['@propose'] = Date.now();
          writeJson(f('fired.json'), fired);
          rules.push(r);
          saveRules(rules);
          log(`senses: proposes rule ${r.id} «${r.name}»`);
          confirm(`${say ? `${say} ` : ''}${L.propose(r.name)}`).then((ok) => setRule(r.id, { status: ok ? 'active' : 'off' }));
          return { say, rule: r };
        }
      }
      if (say) await talk({ kind: 'reflect', text: say });
      return { say, rule: null };
    } catch (e) {
      log(`senses reflect: ${e.message}`);
      return null;
    } finally {
      reflecting = false;
    }
  }

  // ── the camera page ──
  async function onGesture(g) {
    const now = Date.now();
    if (!GESTURES.includes(g) || now - (lastGesture[g] || 0) < 1500) return;
    lastGesture[g] = now;
    day.gestures[g] = (day.gestures[g] || 0) + 1;
    const a = gestures.map[g];
    const c = conf();
    if (asking() && (a?.type === 'confirm' || a?.type === 'reject')) {
      answer(a.type === 'confirm');
      return broadcast({ gesture: a.type === 'confirm' ? 'thumbsup' : 'thumbsdown', senses: { gesture: g } });
    }
    if (c.arm && g === 'open_palm') {
      armedUntil = now + ARM_MS;
      return broadcast({ gesture: 'wave', senses: { gesture: g, armed: armedUntil, hint: L.armed } });
    }
    if (!a || a.type === 'confirm' || a.type === 'reject') return broadcast({ senses: { gesture: g } });
    if (a.type === 'react') return broadcast({ gesture: 'wave', effect: 'hearts', senses: { gesture: g } });
    if (c.arm && now > armedUntil) return broadcast({ senses: { gesture: g, unarmed: true } });
    armedUntil = 0;
    log(`senses: gesture ${g} → ${a.type}`);
    let ok = true;
    let did = '';
    if (a.type === 'media') (ok = await media(a.do)), (did = MEDIA_ICON[a.do]);
    else if (a.type === 'key') (ok = await key(a.keys)), (did = '⌨');
    else if (a.type === 'pause') return pause(a.for);
    else if (a.type === 'ask') return ask(a.text);
    else if (a.type === 'command') {
      const cmd = gestures.commands[a.id];
      if (!cmd) return;
      if (!cmd.approved) {
        if (!(await confirm(L.cmd(cmd.label)))) return;
        cmd.approved = true;
        saveGestures(gestures);
      }
      ok = await command(cmd);
      did = '▶';
    }
    broadcast(ok ? { gesture: 'nod', senses: { gesture: g, did } } : { gesture: 'shrug', senses: { gesture: g, did: '✕', hint: L.failed } });
  }

  function pause(min = 15) {
    const until = Date.now() + Math.max(1, Math.min(240, Number(min) || 15)) * 60_000;
    setConfig({ pausedUntil: until });
    cam.on = false;
    broadcast({ senses: { camera: 'paused', until, hint: L.paused(Math.round((until - Date.now()) / 60_000)) } });
    return until;
  }
  let setConfig = () => {}; // the daemon saves senses.* (see bind)

  /** Labels from the camera page: { kind: 'status'|'state'|'presence'|'gesture', … } */
  function ingest(list) {
    if (acc().camera !== true || paused()) {
      if (cam.on) (cam.on = false), broadcast({ senses: { camera: paused() ? 'paused' : 'off' } });
      return { ok: false, paused: paused() };
    }
    const now = Date.now();
    for (const e of (Array.isArray(list) ? list : [list]).slice(0, 20)) {
      if (!e || typeof e !== 'object') continue;
      const wasOn = cam.on;
      cam.on = true;
      cam.at = now;
      if (!wasOn) broadcast({ senses: { camera: 'on' } });
      if (e.kind === 'status' && e.on === false) {
        cam.on = false;
        broadcast({ senses: { camera: 'off' } });
      } else if (e.kind === 'state' && STATES.includes(e.state)) {
        if (typeof e.present === 'boolean') cam.present = e.present;
        if (e.scores && typeof e.scores === 'object') cam.scores = Object.fromEntries(STATES.map((s) => [s, Math.round(Math.max(0, Math.min(1, Number(e.scores[s]) || 0)) * 100) / 100]));
        cam.score = Math.max(0, Math.min(1, Number(e.score) || 0));
        if (e.state !== cam.state) {
          cam.state = e.state;
          cam.since = now;
          emit({ source: 'camera', kind: 'state', value: { state: e.state, score: cam.score }, summary: `face reads ${e.state}` });
          broadcast({ senses: { state: e.state } });
        }
      } else if (e.kind === 'presence' && typeof e.present === 'boolean') {
        if (cam.present !== e.present) emit({ source: 'camera', kind: 'presence', value: { present: e.present }, summary: e.present ? 'back at the computer' : 'left the computer' });
        cam.present = e.present;
      } else if (e.kind === 'gesture' && typeof e.gesture === 'string') onGesture(e.gesture).catch((x) => log(`senses gesture: ${x.message}`));
    }
    return { ok: true };
  }

  // ── for the settings page and the CLI ──
  const anyOn = () => ['camera', 'activity', 'mail', 'calendar'].some((k) => acc()[k] === true);
  function today() {
    const top = (o, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
    return { ...day, apps: top(day.apps), sites: top(day.sites) };
  }
  function status() {
    const F = facts();
    return {
      on: anyOn(),
      access: Object.fromEntries(SOURCES.filter((s) => s.access).map((s) => [s.access, acc()[s.access] === true])),
      sources: SOURCES.map((s) => ({ ...s, ready: s.id === 'mail' ? mail.ready() : s.id === 'calendar' ? calendar.ready() : s.id === 'activity' ? activity.available : s.id === 'camera' ? camFresh() : s.available, error: s.id === 'mail' ? mail.error : s.id === 'calendar' ? calendar.error : '' })),
      camera: { on: camFresh(), paused: paused(), pausedUntil: Number(config().senses?.pausedUntil) || 0, state: cam.state, score: cam.score, scores: cam.scores, present: cam.present, since: cam.since },
      facts: { ...F, battery: F.battery },
      quietUntil,
      armedUntil,
      today: today(),
      upcoming: calendar.upcoming,
      mail: acc().mail ? mail.latest : [],
      recent: recent.slice(-30).reverse(),
      rules,
      gestures,
      config: conf(),
      baseline: Boolean(readJson(f('baseline.json'), null)),
    };
  }

  function setRule(id, patch) {
    const i = rules.findIndex((r) => r.id === id);
    if (i < 0) return null;
    rules[i] = normalizeRule({ ...rules[i], ...patch, by: rules[i].by }, { by: rules[i].by });
    saveRules(rules);
    broadcast({ senses: { rules: true } });
    return rules[i];
  }

  return {
    ingest,
    status,
    prompt,
    digest,
    reflect,
    pause,
    facts,
    bind(o) {
      setConfig = o.setConfig || setConfig;
    },
    /** What the camera page needs. */
    pageConfig() {
      const c = conf();
      return { on: acc().camera === true && !paused(), pausedUntil: Number(config().senses?.pausedUntil) || 0, holdMs: c.holdMs, fps: c.fps, arm: c.arm, baseline: readJson(f('baseline.json'), null), gestures: Object.keys(gestures.map), lang };
    },
    setBaseline(b) {
      if (b === null) {
        try {
          unlinkSync(f('baseline.json'));
        } catch {}
        broadcast({ senses: { recalibrate: true } });
        return true;
      }
      if (!b || typeof b !== 'object') return false;
      const clean = Object.fromEntries(Object.entries(b).filter(([k, v]) => FEATURE.test(k) && Number.isFinite(Number(v))).slice(0, 60).map(([k, v]) => [k, Math.round(Number(v) * 10000) / 10000]));
      writeJson(f('baseline.json'), { ...clean, at: Date.now() }, { secret: true });
      log('senses: baseline saved');
      return true;
    },
    quiet: () => Date.now() < quietUntil,
    cameraOn: () => camFresh(),
    setQuiet(ms) {
      quietUntil = ms > 0 ? Date.now() + ms : 0;
      broadcast({ senses: { quiet: quietUntil } });
    },
    get rules() {
      return rules;
    },
    addRule(r) {
      const n = normalizeRule({ ...r, status: r.status || 'active' }, { by: 'user' });
      rules = [...rules.filter((x) => x.id !== n.id), n].slice(-100);
      saveRules(rules);
      return n;
    },
    setRule,
    removeRule(id) {
      const n = rules.length;
      rules = rules.filter((r) => r.id !== id);
      saveRules(rules);
      return n !== rules.length;
    },
    /** Every proposed rule accepted or turned down from settings. */
    get gestures() {
      return gestures;
    },
    setGestures(d) {
      gestures = normalizeGestures(d, gestures);
      saveGestures(gestures);
      broadcast({ senses: { gestures: Object.keys(gestures.map) } });
      return gestures;
    },
    /** Deletes what it noticed (days, baseline, cooldowns). Rules and gestures stay. */
    forget() {
      for (const n of readdirSync(dir)) if (/^(day-.*|baseline|fired)\.json$/.test(n)) unlinkSync(f(n));
      day = emptyDay(dayKey());
      fired = {};
      recent.length = 0;
      broadcast({ senses: { recalibrate: true } });
      log('senses: forgot everything noticed');
      return true;
    },
    stop() {
      clearInterval(timer);
      clearTimeout(first);
      saveDay();
    },
  };
}
