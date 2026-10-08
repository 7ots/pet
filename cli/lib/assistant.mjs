/**
 * The pet as a small daily assistant: you tell it things and it acts.
 *
 *   "recuérdame ver el correo en 10 minutos"     → reminder; when due it speaks, notifies and opens Gmail
 *   "remind me at 15:30 to call Ana"             → reminder
 *   "anota que los viernes hay demo"             → a note it remembers (and the AI brain reads)
 *   "abre el calendario" · "mis recordatorios" · "cancela los recordatorios" · "qué sabes de mí"
 *
 * With an AI brain (config.brain) the AI reads the request and answers with JSON actions; with
 * `lines` (or if the AI fails) a local parser understands the common phrasings in en/es/pt.
 * State: ~/.7ots/reminders.json and ~/.7ots/memory.json.
 *   "avísame si BTC llega a 85 mil" · "avísame cuando termine el build"  → a watcher (watchers.mjs)
 * With access.processes it also knows what runs on the computer (the busiest processes).
 * `extra` (integrations.mjs) adds actions that fetch something (logs, email, Orquesta agents, custom
 * integrations): what they bring back goes to the brain once more for the final reply.
 * With access.vm and a cloud worker (vm.mjs) it can `offload` long work ("investiga…", "lee estas
 * páginas…") to the ot's server: progress as `say` (≤1 every 20 s), result to memory/notification.
 * `sites` (prowl.mjs, access.sites): Prowl.world usage guides for the domains in play, as untrusted reference.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homeFile, readJson, writeJson } from './paths.mjs';
import { openUrl } from './open.mjs';
import { followJob, submitJob } from './vm.mjs';

const SITES = [
  [/\b(correo|mail|gmail|e-?mail|inbox|bandeja)\b/i, 'https://mail.google.com', { en: 'your email', es: 'tu correo', pt: 'seu e-mail' }],
  [/\b(calendario|calendar|agenda|calend[aá]rio)\b/i, 'https://calendar.google.com', { en: 'your calendar', es: 'tu calendario', pt: 'sua agenda' }],
  [/\bwhats ?app\b/i, 'https://web.whatsapp.com', { en: 'WhatsApp', es: 'WhatsApp', pt: 'WhatsApp' }],
  [/\bslack\b/i, 'https://app.slack.com', { en: 'Slack', es: 'Slack', pt: 'Slack' }],
  [/\bgithub\b/i, 'https://github.com', { en: 'GitHub', es: 'GitHub', pt: 'GitHub' }],
  [/\b(drive)\b/i, 'https://drive.google.com', { en: 'Drive', es: 'Drive', pt: 'Drive' }],
  [/\blinked ?in\b/i, 'https://www.linkedin.com', { en: 'LinkedIn', es: 'LinkedIn', pt: 'LinkedIn' }],
  [/\b(twitter|x\.com)\b/i, 'https://x.com', { en: 'X', es: 'X', pt: 'X' }],
  [/\b(google meet|meet)\b/i, 'https://meet.google.com', { en: 'Meet', es: 'Meet', pt: 'Meet' }],
];

const T = {
  en: {
    watch: (w) => (w.kind === 'price' ? `Watching ${w.coin}: I'll tell you when it is ${w.op} ${fmt(w.value)} ${w.vs.toUpperCase()}.` : `Watching "${w.match}": I'll tell you when it ${w.until === 'start' ? 'starts' : 'ends'}.`),
    watchFire: (w, n) => (w.kind === 'price' ? `${w.coin} is at ${fmt(n.price)} ${w.vs.toUpperCase()}!${w.text ? ` ${w.text}` : ''}` : `"${w.match}" ${w.until === 'start' ? 'started' : 'finished'}.${w.text ? ` ${w.text}` : ''}`),
    when: 'When? For example "in 10 minutes" or "at 15:30".',
    set: (r) => `Got it: I'll remind you to ${r.text} at ${hhmm(r.at)}${r.open ? ' and open it for you' : ''}.`,
    none: 'No pending reminders.',
    list: (rs) => `Pending: ${rs.map((r) => `${hhmm(r.at)} ${r.text}`).join(' · ')}`,
    cancelled: (n) => `Cancelled ${n} reminder${n === 1 ? '' : 's'}.`,
    noted: 'Noted, I will remember it.',
    know: (ns) => (ns.length ? `I remember: ${ns.map((n) => n.text).join(' · ')}` : "I don't know much about you yet. Tell me \"remember that…\"."),
    opening: (s) => `Opening ${s}.`,
    fire: (r) => `Reminder: ${r.text}!`,
    offload: (k) => `On it: I sent it to my server (${k}). I'll tell you how it goes.`,
    offloadQueued: 'Queued: my server is offline right now, it will start when it is back.',
    offloadStep: (s) => `Still working: ${s}`,
    offloadDone: (r) => `Done: ${r}`,
    offloadFail: (e) => `My server could not finish it: ${e}`,
    help: 'I can set reminders ("remind me to check email in 10 minutes"), open sites ("open my calendar") and remember notes ("remember that…"). Seeing your screen: coming soon.',
  },
  es: {
    watch: (w) => (w.kind === 'price' ? `Vigilando ${w.coin}: te aviso cuando esté ${w.op} ${fmt(w.value)} ${w.vs.toUpperCase()}.` : `Vigilando "${w.match}": te aviso cuando ${w.until === 'start' ? 'empiece' : 'termine'}.`),
    watchFire: (w, n) => (w.kind === 'price' ? `¡${w.coin} está en ${fmt(n.price)} ${w.vs.toUpperCase()}!${w.text ? ` ${w.text}` : ''}` : `"${w.match}" ${w.until === 'start' ? 'empezó' : 'terminó'}.${w.text ? ` ${w.text}` : ''}`),
    when: '¿Para cuándo? Por ejemplo "en 10 minutos" o "a las 15:30".',
    set: (r) => `Listo: te recuerdo ${r.text} a las ${hhmm(r.at)}${r.open ? ' y te lo abro' : ''}.`,
    none: 'No tienes recordatorios pendientes.',
    list: (rs) => `Pendientes: ${rs.map((r) => `${hhmm(r.at)} ${r.text}`).join(' · ')}`,
    cancelled: (n) => `Cancelé ${n} recordatorio${n === 1 ? '' : 's'}.`,
    noted: 'Anotado, lo voy a recordar.',
    know: (ns) => (ns.length ? `Recuerdo: ${ns.map((n) => n.text).join(' · ')}` : 'Todavía sé poco de ti. Dime "anota que…".'),
    opening: (s) => `Abriendo ${s}.`,
    fire: (r) => `¡Recordatorio: ${r.text}!`,
    offload: (k) => `Voy: se lo mandé a mi servidor (${k}). Te cuento cómo va.`,
    offloadQueued: 'En cola: mi servidor está apagado ahora, empieza cuando vuelva.',
    offloadStep: (s) => `Sigo en eso: ${s}`,
    offloadDone: (r) => `Listo: ${r}`,
    offloadFail: (e) => `Mi servidor no pudo terminarlo: ${e}`,
    help: 'Puedo poner recordatorios ("recuérdame ver el correo en 10 minutos"), abrir sitios ("abre mi calendario") y recordar notas ("anota que…"). Ver tu pantalla: muy pronto.',
  },
  pt: {
    watch: (w) => (w.kind === 'price' ? `Vigiando ${w.coin}: te aviso quando estiver ${w.op} ${fmt(w.value)} ${w.vs.toUpperCase()}.` : `Vigiando "${w.match}": te aviso quando ${w.until === 'start' ? 'começar' : 'terminar'}.`),
    watchFire: (w, n) => (w.kind === 'price' ? `${w.coin} está em ${fmt(n.price)} ${w.vs.toUpperCase()}!${w.text ? ` ${w.text}` : ''}` : `"${w.match}" ${w.until === 'start' ? 'começou' : 'terminou'}.${w.text ? ` ${w.text}` : ''}`),
    when: 'Para quando? Por exemplo "em 10 minutos" ou "às 15:30".',
    set: (r) => `Feito: te lembro de ${r.text} às ${hhmm(r.at)}${r.open ? ' e abro pra você' : ''}.`,
    none: 'Nenhum lembrete pendente.',
    list: (rs) => `Pendentes: ${rs.map((r) => `${hhmm(r.at)} ${r.text}`).join(' · ')}`,
    cancelled: (n) => `Cancelei ${n} lembrete${n === 1 ? '' : 's'}.`,
    noted: 'Anotado, vou lembrar.',
    know: (ns) => (ns.length ? `Eu lembro: ${ns.map((n) => n.text).join(' · ')}` : 'Ainda sei pouco de você. Diga "anote que…".'),
    opening: (s) => `Abrindo ${s}.`,
    fire: (r) => `Lembrete: ${r.text}!`,
    offload: (k) => `Já vou: mandei para o meu servidor (${k}). Te conto como vai.`,
    offloadQueued: 'Na fila: meu servidor está desligado agora, começa quando voltar.',
    offloadStep: (s) => `Ainda trabalhando: ${s}`,
    offloadDone: (r) => `Pronto: ${r}`,
    offloadFail: (e) => `Meu servidor não conseguiu terminar: ${e}`,
    help: 'Posso criar lembretes ("me lembre de ver o e-mail em 10 minutos"), abrir sites ("abra minha agenda") e lembrar notas ("anote que…"). Ver sua tela: em breve.',
  },
};

/** The language the human wrote in (replies follow it), or null. */
export function langOf(text) {
  const s = String(text || '').toLowerCase();
  if (W('[ãõç]|\\b(me lembre|lembre|lembrete|voc[eê]|abra minha|anote|meus|daqui a|amanh[aã])\\b', 'u').test(s)) return 'pt';
  if (W('[ñ¿¡]|\\b(recu[eé]rd|recordame|av[ií]same|anota|apunta|abre|abr[ií]|mis|qu[eé]|ma[nñ]ana|minutos|a las|correo|cancela|setea|alerta|avisa|av[ií]same|cuando|llega|una|pon|dime|est[aá]|hay|para|por favor|d[oó]lares|termine)\\b', 'u').test(s)) return 'es';
  if (/\b(remind|remember|open|my|what|tomorrow|minutes?|at \d)\b/.test(s)) return 'en';
  return null;
}

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 2 });
const hhmm = (at) => new Date(at).toTimeString().slice(0, 5);
export const tr = (lang) => T[lang] || T.en;

// ── local parser ──

// \b does not see accented letters (é, í, ã, à) as word characters: unicode-aware boundaries.
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const W = (src, flags = 'iu') => new RegExp(src.replaceAll('\\b(', `${B}(`).replaceAll(')\\b', `)${E}`), flags);

const NUM = { un: 1, una: 1, uno: 1, uma: 1, um: 1, a: 1, an: 1, one: 1, dos: 2, two: 2, 'dois': 2, tres: 3, three: 3, 'três': 3, cinco: 5, five: 5, diez: 10, ten: 10, dez: 10, quince: 15, fifteen: 15, quinze: 15, veinte: 20, twenty: 20, vinte: 20, treinta: 30, thirty: 30, trinta: 30 };
const UNIT = (u) => (/^(s|seg|sec)/.test(u) ? 1000 : /^(h|hr|hora|hour)/.test(u) ? 3_600_000 : 60_000);
const IN_RE = W('\\b(?:en|in|em|dentro de|daqui a)\\s+(\\d+|un|una|uno|uma|um|an?|one|dos|two|dois|tres|three|três|cinco|five|diez|ten|dez|quince|fifteen|quinze|veinte|twenty|vinte|treinta|thirty|trinta)\\s*(segundos?|seg|secs?|seconds?|s|minutos?|mins?|minutes?|m|horas?|hours?|hrs?|h)\\b');
const HALF_RE = W('\\b(?:en|in|em|dentro de)\\s+(?:media hora|half an hour|meia hora)\\b');
const AT_RE = W('\\b(?:a las|a la|at|às|as)\\s+(\\d{1,2})(?:[:.h](\\d{2}))?\\s*(am|pm|hrs?|horas?)?\\b');
const TOMORROW_RE = W('\\b(mañana|manana|tomorrow|amanh[aã])\\b');
const REMIND_RE = W('\\b(recu[eé]rd[aá]me|recordame|recu[eé]rdame|av[ií]same|remind me|me lembr[ae]|lembre-me|lembra-me)\\b');
const NOTE_RE = W('^\\s*(?:anota(?:\\s+que)?|apunta(?:\\s+que)?|recuerda que|aprende que|remember(?:\\s+that)?|note(?:\\s+that)?|anote(?:\\s+que)?|lembre que|lembra que)\\s+');
const OPEN_RE = W('^\\s*(?:abre|abr[ií]|abrime|[aá]breme|open|abra|abrir)\\b');
const LIST_RE = W('\\b(mis recordatorios|qu[eé] recordatorios|recordatorios pendientes|my reminders|list reminders|reminders|meus lembretes|lembretes)\\b');
const CANCEL_RE = W('\\b(cancela|borra|elimina|cancel|clear|apaga|remove)\\b.*\\b(recordatorios?|reminders?|lembretes?)\\b');
const KNOW_RE = W('\\b(qu[eé] (?:sabes|recuerdas)|what do you (?:know|remember)|o que (?:voc[eê] )?(?:sabe|lembra))\\b');
const HELP_RE = W('^\\s*(ayuda|help|ajuda|qu[eé] puedes hacer|what can you do|o que voc[eê] pode fazer)\\s*\\??\\s*$');

function siteOf(text) {
  const url = text.match(/https?:\/\/[^\s]+/i)?.[0];
  if (url) return { url, label: url };
  for (const [re, u, label] of SITES) if (re.test(text)) return { url: u, label };
  return null;
}

/** When, from a phrase. Returns epoch ms or null. */
export function parseWhen(text, now = Date.now()) {
  if (HALF_RE.test(text)) return now + 30 * 60_000;
  const m = text.match(IN_RE);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1].toLowerCase()] || 1;
    return now + n * UNIT(m[2].toLowerCase());
  }
  const a = text.match(AT_RE);
  const tomorrow = TOMORROW_RE.test(text);
  if (a) {
    let h = Number(a[1]);
    const min = Number(a[2] || 0);
    if (/pm/i.test(a[3] || '') && h < 12) h += 12;
    if (/am/i.test(a[3] || '') && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    const d = new Date(now);
    d.setHours(h, min, 0, 0);
    if (tomorrow) d.setDate(d.getDate() + 1);
    else if (d.getTime() <= now) d.setDate(d.getDate() + 1); // "a las 9" said at 10 → tomorrow
    return d.getTime();
  }
  if (tomorrow) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  }
  return null;
}

/** What to remember, without the trigger and the time words. */
function reminderText(text) {
  const s = text
    .replace(REMIND_RE, ' ')
    .replace(HALF_RE, ' ')
    .replace(IN_RE, ' ')
    .replace(AT_RE, ' ')
    .replace(TOMORROW_RE, ' ')
    .replace(/\by (?:que )?(?:t[uú] mismo |él mismo |el mismo |ella misma )?(?:me )?(?:abras?|abre|abr[ií]|open|abra)\b.*$/i, ' ') // "…y que me abras la pestaña"
    .replace(/\band (?:then )?open\b.*$/i, ' ')
    .replace(/^\s*(?:de |que |to |that |para )/i, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.:;!?-]+$/g, '')
    .replace(/^(?:de|que|to|that|para)\s+/i, '');
  return s || text.trim();
}

/** Local understanding → list of actions. */
export function parseLocal(text, now = Date.now()) {
  const s = String(text || '').trim();
  if (!s) return [];
  if (HELP_RE.test(s)) return [{ type: 'help' }];
  if (CANCEL_RE.test(s)) return [{ type: 'cancel' }];
  if (LIST_RE.test(s) && !REMIND_RE.test(s)) return [{ type: 'list' }];
  if (KNOW_RE.test(s)) return [{ type: 'know' }];
  if (NOTE_RE.test(s)) return [{ type: 'note', text: s.replace(NOTE_RE, '').trim() }];
  const site = siteOf(s);
  const at = parseWhen(s, now);
  if (REMIND_RE.test(s) || at) {
    if (!at) return [{ type: 'ask_when' }];
    return [{ type: 'remind', at, text: reminderText(s), open: site?.url || null }];
  }
  if (OPEN_RE.test(s) && site) return [{ type: 'open', url: site.url, label: site.label }];
  return [];
}

// ── AI understanding ──

function aiPrompt(text, { lang, notes, reminders, watchers = [], procs = '', more = '', conv = '', vmKinds = [], now }) {
  return [
    // the conversation goes first, right above the new message: a short «ok», «prueba», «dale» answers your last line
    conv,
    `Your human wrote to you: """${String(text).slice(0, 800)}"""`,
    conv ? `Read it as the next turn of that conversation: if it is short ("yes", "go", "try it", "ok"), it answers or continues your last message, so do what you offered or asked there.` : '',
    `Now it is ${new Date(now).toString()}.`,
    notes.length ? `What you know about them: ${notes.map((n) => `- ${n.text}`).join('\n')}` : '',
    reminders.length ? `Pending reminders: ${reminders.map((r) => `${new Date(r.at).toString()}: ${r.text}`).join('; ')}` : '',
    watchers.length ? `Active watchers: ${watchers.map((w) => (w.kind === 'price' ? `${w.coin} ${w.op} ${w.value} ${w.vs}` : `process "${w.match}" ${w.until}`)).join('; ')}` : '',
    procs ? `Busiest processes on their computer right now: ${procs}` : '',
    `You can act. Answer ONLY with one JSON object, no prose around it:`,
    `{"reply":"one short line in character, in the human's language","actions":[...]}`,
    `Actions: {"type":"remind","in_minutes":N | "at":"ISO-8601 local time","text":"what to remind (short, imperative)","open":"https://… or null"}`,
    `{"type":"open","url":"https://…"} (open now) · {"type":"note","text":"a durable fact or preference worth remembering"} · {"type":"cancel"} (all pending reminders and watchers) · {"type":"list"}`,
    `{"type":"watch_price","coin":"bitcoin|ethereum|solana|… (CoinGecko id) or ticker","op":">=|<=","value":N,"vs":"usd|clp|eur|…","text":"what to tell them"} (crypto price alert; checked every minute)`,
    `{"type":"watch_process","match":"part of the command line, e.g. 'npm run build'","until":"exit|start","text":"what to tell them"} (tell them when a program on their computer finishes or starts)`,
    vmKinds.length ? `{"type":"offload","kind":"${vmKinds.join('|')}","text":"the full request for your cloud server"} (hand long work to your own server: research = think it through, browse = read the URLs in text, long = multi-step work${vmKinds.includes('code') ? ', code = programming task' : ''}${vmKinds.includes('shell') ? ', shell = one bash command' : ''}; you will report back when it is done)` : '',
    more,
    `Use the watch actions for "alert me / let me know if/when …" about a price or a program. Never say you cannot do something these actions can do.`,
    `When a reminder is about a website (email → https://mail.google.com, calendar → https://calendar.google.com, etc.) set "open" so it opens when due.`,
    `If they share something about their work, routine or preferences, add a note. If a reminder has no time, ask when in "reply" with no actions.`,
    lang ? `Reply in ${{ es: 'Spanish', pt: 'Portuguese' }[lang] || 'English'}.` : `Reply in the language the human wrote in.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function parseAi(raw, now, extra = null, vmKinds = []) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const actions = [];
  for (const a of Array.isArray(j.actions) ? j.actions : []) {
    if (a?.type === 'remind') {
      const at = Number.isFinite(Number(a.in_minutes)) && a.in_minutes !== null && a.in_minutes !== '' ? now + Number(a.in_minutes) * 60_000 : Date.parse(a.at);
      if (Number.isFinite(at) && at > now - 60_000 && a.text) actions.push({ type: 'remind', at, text: String(a.text).slice(0, 200), open: safeUrl(a.open) });
    } else if (a?.type === 'open' && safeUrl(a.url)) actions.push({ type: 'open', url: safeUrl(a.url), label: a.url });
    else if (a?.type === 'note' && a.text) actions.push({ type: 'note', text: String(a.text).slice(0, 300) });
    else if (['cancel', 'list'].includes(a?.type)) actions.push({ type: a.type });
    else if (a?.type === 'watch_price' && a.coin && Number.isFinite(Number(a.value))) actions.push({ type: 'watch_price', coin: String(a.coin), op: ['<=', '<'].includes(a.op) ? '<=' : '>=', value: Number(a.value), vs: String(a.vs || 'usd').toLowerCase().slice(0, 6), text: String(a.text || '').slice(0, 200) });
    else if (a?.type === 'watch_process' && a.match) actions.push({ type: 'watch_process', match: String(a.match).slice(0, 120), until: a.until === 'start' ? 'start' : 'exit', text: String(a.text || '').slice(0, 200) });
    else if (a?.type === 'offload' && vmKinds.includes(a.kind) && a.text) actions.push({ type: 'offload', kind: a.kind, text: String(a.text).slice(0, 8000) });
    else {
      const x = extra?.parse(a);
      if (x) actions.push(x);
    }
  }
  return { reply: String(j.reply || '').slice(0, 400), actions };
}

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

// ── the assistant ──

/** Desktop notification, best effort. */
export function notify(title, body) {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['osascript', ['-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`]]
      : process.platform === 'win32'
        ? [null, []]
        : ['notify-send', ['-a', '7ots', '-u', 'critical', title, body]];
  if (!cmd) return;
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref();
  } catch {}
}

/**
 * @param {{ brain, system: (lang) => string, lang: string, name: string, onFire: (reminder, line) => void, watchers?: object, procs?: () => Promise<string>, access?: () => object, log?: Function }} o
 *   access()  config.access: memory (keep/use notes), open (open sites), notify (desktop notifications),
 *             vm + vmKinds (offload to the ot's cloud worker; off unless explicitly true)
 *   cloud()   the ot id of this computer (signed in to 7ots.com) or null · say(line) speaks later
 */
export function createAssistant({ brain, system, lang, name, onFire, watchers = null, procs = async () => '', access = () => ({}), memoryTokens = () => 20000, extra = null, sites = null, cloud = () => null, say = () => {}, context = () => '', log = () => {} }) {
  const may = (k) => access()[k] !== false;
  const vmKinds = () => (access().vm === true && cloud() ? (access().vmKinds || []).filter(Boolean) : []);
  let offloading = null;

  // Runs in the background: the reply already said "on it"; progress and result come as `say`.
  async function offload(a, L0) {
    const otsId = cloud();
    let last = 0;
    const speak = (line, force = false) => {
      if (!force && Date.now() - last < 20000) return;
      last = Date.now();
      say(line);
    };
    try {
      const context = may('memory') && notes.length ? `What the owner told the pet to remember:\n${notes.slice(-15).map((n) => `- ${n.text}`).join('\n')}` : '';
      const job = await submitJob(otsId, { kind: a.kind, input: a.text, context });
      offloading = job.id;
      last = Date.now();
      if (!job.online) speak(L0.offloadQueued, true);
      const end = await followJob(otsId, job.id, { onEvent: (ev) => ev.kind === 'progress' && !/^start /.test(ev.text) && speak(L0.offloadStep(String(ev.text).slice(0, 160))) });
      if (end.status === 'completed') {
        const text = String(end.result || '').trim();
        if (may('memory')) (notes.push({ text: `[${a.kind}] ${a.text.slice(0, 80)} → ${text.slice(0, 200)}`, at: Date.now() }), saveN());
        if (may('notify')) notify(`${name} · 7ots`, text.slice(0, 200));
        speak(L0.offloadDone(text.length > 300 ? `${text.slice(0, 300)}…` : text), true);
      } else if (end.status !== 'cancelled') speak(L0.offloadFail(end.error || end.status), true);
    } catch (e) {
      log(`offload: ${e.message}`);
      speak(L0.offloadFail(e.message), true);
    } finally {
      offloading = null;
    }
  }
  let L = tr(lang);
  const remF = homeFile('reminders.json');
  const memF = homeFile('memory.json');
  let reminders = (readJson(remF, []) || []).filter((r) => r && !r.done);
  let notes = readJson(memF, []) || [];
  const saveR = () => writeJson(remF, reminders);
  const saveN = () => writeJson(memF, notes.slice(-200));

  // Conversation memory: recent turns verbatim, older ones folded into a summary once past the token budget.
  const convF = homeFile('conversation.json');
  let conv = readJson(convF, null) || {};
  conv = { summary: String(conv.summary || ''), turns: Array.isArray(conv.turns) ? conv.turns : [] };
  const saveC = () => writeJson(convF, conv);
  const tokensOf = (s) => Math.ceil(String(s).length / 4);
  const convTokens = () => tokensOf(conv.summary) + conv.turns.reduce((n, t) => n + tokensOf(t.u) + tokensOf(t.a), 0);
  let compacting = null;
  function convBlock() {
    if (!(memoryTokens() > 0) || (!conv.summary && !conv.turns.length)) return '';
    const lines = conv.turns.map((t) => `Them: ${t.u}\nYou: ${t.a}`).join('\n');
    return `Your conversation with them so far (context for follow-ups; do not repeat old answers):\n${conv.summary ? `[earlier, summarized] ${conv.summary}\n` : ''}${lines}`;
  }
  async function compact() {
    const budget = memoryTokens();
    if (!(budget > 0) || convTokens() <= budget || compacting) return;
    // fold the oldest half (at least until it fits in ~70% of the budget) into the summary
    let cut = Math.max(1, Math.floor(conv.turns.length / 2));
    const keep = () => tokensOf(conv.summary) + conv.turns.slice(cut).reduce((n, t) => n + tokensOf(t.u) + tokensOf(t.a), 0);
    while (cut < conv.turns.length - 1 && keep() > budget * 0.7) cut++;
    const old = conv.turns.slice(0, cut);
    const room = Math.max(300, Math.floor(budget * 0.25)) * 4;
    compacting = (async () => {
      let summary = '';
      if (brain.kind !== 'lines') {
        try {
          const text = old.map((t) => `Them: ${t.u}\nYou: ${t.a}`).join('\n').slice(-room * 6);
          summary = await brain.think({ purpose: 'compact', system: 'You compress chat history for a desktop pet assistant.', messages: [{ role: 'user', content: `Summary so far: ${conv.summary || '(none)'}\n\nNew turns:\n${text}\n\nWrite one updated summary (plain text, under ${Math.floor(room / 4)} tokens) keeping facts, decisions, open requests and the owner's preferences. No secrets.` }], timeoutMs: 60000 });
        } catch (e) {
          log(`compact: ${e.message}`);
        }
      }
      // brain off or failed: keep the gist of what they asked
      if (!summary) summary = [conv.summary, ...old.map((t) => t.u.slice(0, 120))].filter(Boolean).join(' · ');
      conv.summary = String(summary).trim().slice(-room);
      conv.turns = conv.turns.slice(old.length);
      saveC();
    })().finally(() => {
      compacting = null;
    });
    return compacting;
  }
  function remember(u, a) {
    if (!(memoryTokens() > 0) || !a) return;
    conv.turns.push({ u: String(u).slice(0, 4000), a: String(a).slice(0, 4000), at: Date.now() });
    saveC();
    compact().catch(() => {});
  }

  function fire(r) {
    r.done = true;
    const line = tr(r.lang || lang).fire(r);
    if (may('notify')) notify(`${name} · 7ots`, r.text);
    if (r.open && may('open')) openUrl(r.open);
    onFire(r, line);
  }

  // A minute late is fine; missed while the daemon was down → fire on start (once).
  const timer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const r of reminders) if (!r.done && r.at <= now) (fire(r), (changed = true));
    if (changed) {
      reminders = reminders.filter((r) => !r.done);
      saveR();
    }
  }, 5000);
  timer.unref?.();

  function run(actions) {
    const out = [];
    for (const a of actions) {
      if ((a.type === 'note' && !may('memory')) || (a.type === 'open' && !may('open'))) continue;
      if (a.type === 'remind') {
        const r = { id: randomBytes(4).toString('hex'), at: a.at, text: a.text, open: (may('open') && a.open) || null, lang: L === T.es ? 'es' : L === T.pt ? 'pt' : 'en', created: Date.now() };
        reminders.push(r);
        reminders.sort((x, y) => x.at - y.at);
        saveR();
        out.push(L.set(r));
      } else if (a.type === 'open') {
        openUrl(a.url);
        out.push(L.opening(typeof a.label === 'object' ? a.label[L === T.es ? 'es' : L === T.pt ? 'pt' : 'en'] : a.label));
      } else if (a.type === 'note') {
        notes.push({ text: a.text, at: Date.now() });
        saveN();
        out.push(L.noted);
      } else if (a.type === 'cancel') {
        const n = reminders.length;
        reminders = [];
        saveR();
        watchers?.cancel('all');
        out.push(L.cancelled(n));
      } else if (a.type === 'watch_price' || a.type === 'watch_process') {
        const w = watchers && (a.type === 'watch_price' ? watchers.addPrice(a) : watchers.addProcess(a));
        if (w) (w.lang = L === T.es ? 'es' : L === T.pt ? 'pt' : 'en'), out.push(L.watch(w));
      } else if (a.type === 'offload') {
        if (!vmKinds().includes(a.kind)) continue;
        offload(a, L);
        out.push(L.offload(a.kind));
      } else if (a.type === 'list') out.push(reminders.length ? L.list(reminders) : L.none, ...(watchers?.list || []).map((w) => L.watch(w)));
      else if (a.type === 'know') out.push(L.know(may('memory') ? notes.slice(-12) : []));
      else if (a.type === 'ask_when') out.push(L.when);
      else if (a.type === 'help') out.push(L.help);
    }
    return out;
  }

  /** Free text → { reply, actions }. Never throws. */
  async function answer(text) {
    const now = Date.now();
    const detected = langOf(text);
    const said = detected || lang;
    L = tr(said);
    const local = parseLocal(text, now);
    let ai = null;
    if (brain.kind !== 'lines') {
      try {
        // Prowl.world guides for the sites in play (access.sites; untrusted reference), fetched alongside the processes
        const [running, siteRef] = await Promise.all([may('processes') ? procs().catch(() => '') : '', sites ? sites.prompt(text).catch(() => '') : '']);
        const more = [extra?.prompt() || '', context() || '', siteRef].filter(Boolean).join('\n');
        const raw = await brain.think({ purpose: 'assistant', system: system(detected), messages: [{ role: 'user', content: aiPrompt(text, { lang: detected, notes: may('memory') ? notes.slice(-30) : [], reminders, watchers: watchers?.list || [], procs: running, more, conv: convBlock(), vmKinds: vmKinds(), now }) }], timeoutMs: 45000, raw: true });
        ai = parseAi(raw, now, extra, vmKinds());
      } catch (e) {
        log(`assistant: ${e.message}`);
      }
    }
    if (ai && (ai.actions.length || !local.length)) {
      const done = run(ai.actions);
      // fetched things (logs, email, agents…): the brain reads them and answers once more
      const fetched = [];
      for (const a of ai.actions.filter((x) => x.extra).slice(0, 3)) {
        const r = await extra.run(a, detected || lang);
        if (r.data) fetched.push(r.data);
      }
      if (fetched.length) {
        let said = '';
        try {
          said = await brain.think({ purpose: 'assistant', system: system(detected), messages: [{ role: 'user', content: `${convBlock() ? `${convBlock()}\n\n` : ''}Your human wrote to you: «${String(text).slice(0, 800)}»\nHere is what you fetched for them:\n${fetched.join('\n\n').slice(0, 9000)}\n\nNow answer them in 1-3 short sentences, in character, no JSON, no markdown. Never quote secrets.` }], timeoutMs: 45000 });
        } catch (e) {
          log(`assistant: ${e.message}`);
        }
        return { reply: [ai.reply, said].filter(Boolean).join(' ') || done.join(' ') || L.help, actions: ai.actions };
      }
      // a watch the AI asked for but that could not be set (unknown coin…): say so instead of a cheerful reply
      const failed = ai.actions.some((a) => a.type.startsWith('watch_')) && !done.length;
      return { reply: failed ? L.help : ai.reply || done.join(' ') || L.help, actions: ai.actions };
    }
    const done = run(local);
    return { reply: done.join(' ') || L.help, actions: local };
  }

  return {
    get reminders() {
      return reminders.slice();
    },
    /** A reminder set by something other than a message (the senses' rules): { at, text } → what it says. */
    remind({ at, text }) {
      return run([{ type: 'remind', at: Math.max(Date.now() + 5000, Number(at) || 0), text: String(text || '').slice(0, 200) }])[0] || '';
    },
    get notes() {
      return notes.slice();
    },
    /** The cloud job running now (vmj_…) or null. */
    get offloading() {
      return offloading;
    },
    /** Free text → { reply, actions }. Never throws. */
    async ask(text) {
      const r = await answer(text);
      remember(text, r.reply);
      return r;
    },
    /** What it remembers of the conversation: { tokens, budget, summary, turns }. */
    get conversation() {
      return { tokens: convTokens(), budget: memoryTokens(), summary: conv.summary, turns: conv.turns.slice() };
    },
    forgetConversation() {
      conv = { summary: '', turns: [] };
      saveC();
      return true;
    },
    /** Forget one note (by its timestamp, stable across the list) or all of them. */
    forget(at) {
      const n = notes.length;
      notes = at === 'all' ? [] : notes.filter((x) => String(x.at) !== String(at));
      saveN();
      return n !== notes.length;
    },
    cancel(id) {
      const n = reminders.length;
      reminders = reminders.filter((r) => r.id !== id);
      saveR();
      return n !== reminders.length;
    },
    stop() {
      clearInterval(timer);
    },
  };
}
