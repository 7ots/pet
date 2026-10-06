/**
 * Canal apuchat: el agente tiene su propio @handle.
 *
 *  - Mensajes: cualquiera le escribe por la app de apuchat y el agente contesta.
 *  - Videollamada: en meet.apuchat.com pulsas 📞 Ring y escribes su @handle → le llega un
 *    mensaje con "Channel id / Token / PIN" (o un enlace /call#…) y entra en la llamada con su
 *    propio avatar. Tú hablas; meet transcribe, el agente responde y tu navegador lo dice.
 *  - Llamada al teléfono: si le pides "llámame", crea una llamada y te manda el enlace por
 *    mensaje; eso hace SONAR la app de apuchat del móvil (push VoIP). No hay telefonía
 *    clásica (SIP/PSTN): la "llamada" es la de la app.
 *
 *   APUCHAT_AGENT_IDENTITY_KEY  clave de la identidad del agente (X-Identity-Key). Usa un
 *                               handle permanente: los gratis caducan tras 24 h sin mensajes
 *                               (escuchar cuenta como actividad, así que aguanta encendido).
 *   APUCHAT_AGENT_ALLOW         opcional: @handles que pueden hablarle (coma). Vacío = todos.
 *   El avatar y la escena de meet salen de la identidad (look.meetAvatar / look.meetScene;
 *   por defecto APUCHAT_AGENT_AVATAR / APUCHAT_AGENT_SCENE) y se leen en cada llamada.
 *   AGENT_CALL_MAX_MINUTES      (defecto 15) · AGENT_CALL_MAX_TURNS (40) · AGENT_MAX_CALLS (3)
 *
 * Contrato del hub (apuchat.com):
 *   GET  /api/dm/wait?since&timeout≤300   X-Identity-Key  → { callsign, messages:[{id,from,to,text,at}], next_since }
 *   POST /api/dm  { to, text ≤4096 }       X-Identity-Key  → 202 siempre (0,5 msg/s por identidad)
 *   POST /api/video-call {}                → { channel_id, channel_token, owner_password, call_url, … }
 *   Canal: /join {identity_key, owner_password?} → session_id · /wait · /send {to:'all', message, kind?} · /leave
 *   Tras entrar: ping kind:"status" (así meet lo trata como agente), luego "[avatar]<nombre>".
 *   Líneas de control "[…]": se ignoran todas salvo "[lang]<código>".
 *
 * Textos fijos para la persona (avisos, saludo de reserva): en el idioma de la llamada
 * ("[lang]") o, si no, en el de la identidad / LOCALE. Los registros siguen en español.
 */

import { resolveLocale, translator } from '../../src/i18n/index.js';
import { i18nError, serverLocale } from '../i18n.mjs';

const env = process.env;
const DM_GAP_MS = 2100; // 0,5 mensajes/s por identidad
const DM_MAX = 4000;
const BACKLOG_MAX_AGE_MS = 10 * 60 * 1000;
const INVITE_MAX_AGE_MS = 3 * 60 * 1000; // una invitación vieja es una llamada que ya acabó
const NO_SHOW_MS = 5 * 60 * 1000; // lo que el agente espera en la sala a que entre la persona
const PER_SENDER_PER_HOUR = 30;
/** Configuración del canal desde el entorno (el SDK puede pasar la suya). */
export function apuchatConfigFromEnv(e = env) {
  return {
    hub: e.APUCHAT_HUB || 'https://apuchat.com',
    identityKey: e.APUCHAT_AGENT_IDENTITY_KEY || '',
    allow: e.APUCHAT_AGENT_ALLOW || '',
    maxCalls: Number(e.AGENT_MAX_CALLS || 3),
    maxMinutes: Number(e.AGENT_CALL_MAX_MINUTES || 15),
    maxTurns: Number(e.AGENT_CALL_MAX_TURNS || 40),
  };
}

export function apuchatConfigured(cfg = apuchatConfigFromEnv()) {
  return !!cfg.identityKey;
}

/**
 * @param {{ agent: ReturnType<import('./agent.mjs').createServerAgent>, persona: Function, log: Function, config?: object, tools?: Function }} deps
 *   tools: extra tools for a DM, decided by sender ({ channel:'dm', from } → { tools, run } | null)
 */
export function createApuchatChannel({ agent, persona, log, config = apuchatConfigFromEnv(), tools: extraTools = null }) {
  const cfg = { ...apuchatConfigFromEnv({}), ...config };
  const key = cfg.identityKey;
  const hub = String(cfg.hub).replace(/\/$/, '');
  const hubFetch = (method, path, o) => hubRequest(hub, method, path, o);
  const allow = (Array.isArray(cfg.allow) ? cfg.allow : String(cfg.allow || '').split(',')).map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  const { maxCalls, maxMinutes, maxTurns } = cfg;

  const stats = { callsign: null, dmsIn: 0, dmsOut: 0, calls: 0, lastError: null };
  const calls = new Map(); // channel_id → sesión de llamada
  const rate = new Map(); // handle → { n, at }
  let stopped = false;

  // ── DMs: cola de salida para respetar el límite del hub ──
  let queue = Promise.resolve();
  function dm(to, text) {
    const job = queue.then(async () => {
      const res = await hubFetch('POST', '/api/dm', { headers: { 'X-Identity-Key': key }, body: { to, text: String(text).slice(0, DM_MAX) } });
      if (!res.ok) throw new Error(`dm ${res.status}`);
      stats.dmsOut++;
      await sleep(DM_GAP_MS);
    });
    queue = job.catch(() => sleep(DM_GAP_MS));
    return job;
  }

  const allowed = (from) => {
    if (allow.length && !allow.includes(from)) return false;
    const now = Date.now();
    const r = rate.get(from);
    if (!r || now - r.at > 3600_000) {
      rate.set(from, { n: 1, at: now });
      return true;
    }
    return ++r.n <= PER_SENDER_PER_HOUR;
  };

  // ── herramienta que el agente puede usar en un chat: llamar a quien le escribe ──
  const ringTool = {
    name: 'llamar_por_apuchat',
    description:
      'Llama por voz a la persona con la que hablas: crea una videollamada de meet.apuchat.com con tu avatar y ' +
      'le manda el enlace, lo que hace sonar su app de apuchat. Úsalo cuando pida que la llames o hablar por voz.',
    parameters: { type: 'object', properties: { motivo: { type: 'string', description: 'De qué vais a hablar (breve)' } } },
  };

  /**
   * Crea una videollamada de meet con el agente ya dentro y devuelve el enlace para entrar.
   * El enlace (`call_url`) lleva el token y el PIN de ESA llamada: solo se entrega a la persona
   * para la que se creó (por DM o a quien la pidió desde la web), nunca a terceros.
   */
  async function openCall({ peer = null, reason = '' } = {}) {
    if (calls.size >= maxCalls) throw i18nError(503, 'server.channels.tooManyCalls');
    const res = await hubFetch('POST', '/api/video-call', { body: {} });
    if (!res.ok || !res.data?.channel_id) throw i18nError(502, 'server.channels.callFailed', { status: res.status });
    const c = res.data;
    // Primero entra el agente (así ya está cuando la persona descuelga).
    startCall({ channel_id: c.channel_id, token: c.channel_token, pin: c.owner_password, peer, reason }).catch((e) => log('apuchat call:', e.message));
    return { call_url: c.call_url, channel_id: c.channel_id, expires_at: c.expires_at || null };
  }

  async function ring(handle, motivo = '') {
    const c = await openCall({ peer: handle, reason: motivo });
    const t = langT(persona().lang);
    await dm(handle, motivo ? t('server.channels.ringAbout', { topic: motivo, url: c.call_url }) : t('server.channels.ring', { url: c.call_url })); // suena la app
    return { ok: true, llamando_a: `@${handle}` };
  }

  // ── bucle de mensajes ──
  async function listen() {
    let since = 0;
    let first = true;
    while (!stopped) {
      try {
        const res = await hubFetch('GET', `/api/dm/wait?timeout=60${since ? `&since=${since}` : ''}`, { headers: { 'X-Identity-Key': key }, timeoutMs: 75000 });
        if (res.status === 401 || res.status === 403) {
          stats.lastError = `wait ${res.status}`;
          log(`apuchat: la identidad del agente no es válida (${res.status}); se deja de escuchar. ¿Caducó? Revisa APUCHAT_AGENT_IDENTITY_KEY.`);
          return;
        }
        if (!res.ok) throw new Error(`wait ${res.status}`);
        if (!stats.callsign && res.data.callsign) {
          stats.callsign = res.data.callsign;
          log(`apuchat: el agente atiende como @${stats.callsign} (avatar ${persona().meetAvatar})`);
        }
        for (const m of res.data.messages || []) {
          stats.dmsIn++;
          onDm(m, { backlog: first }).catch((e) => log('apuchat dm:', e.message));
        }
        since = res.data.next_since ?? since;
        first = false;
      } catch (e) {
        stats.lastError = e.message;
        await sleep(5000);
      }
    }
  }

  async function onDm(m, { backlog }) {
    const from = String(m.from || '').toLowerCase();
    const text = String(m.text || '').trim();
    if (!from || from === stats.callsign || !text) return;
    const age = Date.now() - Number(m.at || 0);
    const invite = parseInvite(text);
    if (invite) {
      if (age > INVITE_MAX_AGE_MS) return log(`apuchat: invitación antigua de @${from} ignorada`);
      if (!allowed(from)) return;
      log(`apuchat: @${from} llama al agente → entra en la llamada`);
      return startCall({ ...invite, peer: from });
    }
    if (backlog && age > BACKLOG_MAX_AGE_MS) return;
    if (!allowed(from)) return;
    const extra = extraTools?.({ channel: 'dm', from }) || null;
    const reply = await agent.respond(`dm:${from}`, 'dm', text, {
      tools: [ringTool, ...(extra?.tools || [])],
      run: async (name, args) => {
        if (name === 'llamar_por_apuchat') return ring(from, args.motivo);
        if (extra?.tools.some((x) => x.name === name)) return extra.run(name, args);
        throw new Error(`Herramienta desconocida: ${name}`);
      },
    });
    if (reply) await dm(from, reply);
  }

  // ── una llamada de meet ──
  async function startCall({ channel_id, token, pin, peer, reason = '' }) {
    if (calls.has(channel_id)) return;
    if (calls.size >= maxCalls) {
      if (peer) await dm(peer, langT(persona().lang)('server.channels.busyDm')).catch(() => {});
      return;
    }
    const p = persona();
    const s = { ch: channel_id, token, sid: '', cs: '', since: 0, lang: p.lang, turns: 0, start: Date.now(), lastHuman: 0, greeted: false, done: false };
    calls.set(channel_id, s);
    const tc = (k, v) => langT(s.lang)(k, v); // s.lang cambia con "[lang]": se resuelve en cada uso
    stats.calls++;
    const path = (x) => `/api/channels/${encodeURIComponent(channel_id)}${x}`;
    const headers = () => ({ Authorization: `Bearer ${token}`, ...(s.sid ? { 'X-Session-Id': s.sid } : {}) });
    const send = (message, kind) => hubFetch('POST', path('/send'), { headers: headers(), body: { to: 'all', message: String(message).slice(0, 8000), ...(kind ? { kind } : {}) } });
    const join = async () => {
      const r = await hubFetch('POST', path('/join'), { headers: { Authorization: `Bearer ${token}` }, body: { identity_key: key, ...(pin ? { owner_password: pin } : {}) } });
      if (!r.ok) throw new Error(`join ${r.status} ${r.data?.error || ''}`.trim());
      s.sid = r.data.session_id;
      s.cs = r.data.callsign || s.cs;
      for (const m of r.data.history || []) if (m.id > s.since) s.since = m.id;
    };
    const leave = async (why) => {
      if (s.done) return;
      s.done = true;
      calls.delete(channel_id);
      agent.forget(`call:${channel_id}`);
      log(`apuchat: sale de la llamada (${why}, ${s.turns} turnos)`);
      await hubFetch('POST', path('/leave'), { headers: headers(), body: {} }).catch(() => {});
    };
    const say = async (text) => {
      if (text) await send(text);
    };
    // Lo mismo que puede en el chat con esa persona (p. ej. Orquesta): la llamada es otro canal, no otro agente.
    // Sin @peer (una llamada abierta desde la web) no hay a quién autorizar: sin herramientas.
    const extra = peer ? extraTools?.({ channel: 'dm', from: peer }) || null : null;
    const voiceOpts = () => ({
      lang: s.lang,
      ...(extra ? { tools: extra.tools, run: (name, args) => extra.run(name, args) } : {}),
    });
    const greet = async () => {
      if (s.greeted) return;
      s.greeted = true;
      s.lastHuman = Date.now();
      const hello = await agent
        .respond(`call:${channel_id}`, 'voice', `(La persona${peer ? ` @${peer}` : ''} acaba de entrar en la llamada${reason ? `; ibais a hablar de: ${reason}` : ''}. Salúdala en una frase y pregúntale en qué la ayudas.)`, voiceOpts())
        .catch(() => '');
      await say(hello || tc('server.channels.hello', { name: p.name }));
    };

    try {
      await join();
      await send(tc('server.channels.here', { name: p.name }), 'status'); // obligatorio: así meet le da avatar y voz
      await send(`[avatar]${p.meetAvatar || 'vivi'}`);
      if (p.meetScene) await send(`[scene]${p.meetScene}`);
    } catch (e) {
      calls.delete(channel_id);
      stats.lastError = e.message;
      log(`apuchat: no pudo entrar en la llamada (${e.message})`);
      if (peer) await dm(peer, tc('server.channels.joinFailedDm')).catch(() => {});
      return;
    }

    while (!s.done && !stopped) {
      const now = Date.now();
      // El teléfono puede tardar en sonar y en descolgarse: 5 min antes de rendirse.
      if (!s.greeted && now - s.start > NO_SHOW_MS) return leave('nadie entró');
      if (s.greeted && now - s.lastHuman > 180_000) {
        await say(tc('server.channels.hangUp'));
        return leave('silencio');
      }
      if (now - s.start > maxMinutes * 60_000 || s.turns >= maxTurns) {
        await say(tc('server.channels.limit'));
        return leave('límite');
      }
      let r;
      try {
        // Mientras nadie entra, vueltas cortas: el roster de /wait dice cuándo llega la persona.
        r = await hubFetch('GET', path(`/wait?timeout=${s.greeted ? 25 : 8}${s.since ? `&since=${s.since}` : ''}`), { headers: headers(), timeoutMs: 40000 });
      } catch {
        await sleep(2000);
        continue;
      }
      if (r.status === 400 || r.status === 410) {
        try {
          await join(); // not_joined / session_expired → volver a entrar, igual que el navegador
        } catch (e) {
          return leave(`no pudo volver a entrar: ${e.message}`);
        }
        continue;
      }
      if (r.status === 401 || r.status === 403 || r.status === 404) return leave(`canal cerrado (${r.status})`);
      if (!r.ok) {
        await sleep(2000);
        continue;
      }
      // Quien entra a meet no siempre habla ni toca el idioma: con verlo en la sala ya se le saluda.
      if (!s.greeted && (r.data.roster || []).some((c) => c && c !== s.cs)) await greet();
      const lines = [];
      for (const m of r.data.messages || []) {
        if (m.id > s.since) s.since = m.id;
        if (m.from === s.cs || m.kind === 'status' || !m.text) continue;
        const t = String(m.text);
        if (t.startsWith('[lang]')) {
          const code = t.slice(6).trim().split(/\s/)[0].toLowerCase();
          if (code && code !== 'auto') s.lang = code;
          await greet();
          continue;
        }
        if (/^\s*\[/.test(t)) continue; // [via] [rtc] [avatar] [scene]…: no son para el agente
        lines.push(t.trim());
      }
      if (!lines.length) continue;
      // Un /wait puede traer varias frases seguidas (STT por fragmentos): un solo turno.
      const text = lines.join(' ').slice(0, 1500);
      s.lastHuman = Date.now();
      if (!s.greeted) s.greeted = true;
      s.turns++;
      await send(tc('server.channels.thinking'), 'status');
      try {
        await say(await agent.respond(`call:${channel_id}`, 'voice', text, voiceOpts()));
      } catch (e) {
        log('apuchat call llm:', e.message);
        await say(tc('server.channels.repeat'));
      }
    }
    await leave('parado');
  }

  return {
    start() {
      listen();
    },
    async stop() {
      stopped = true;
      await Promise.all(
        [...calls.values()].map((s) =>
          hubFetch('POST', `/api/channels/${encodeURIComponent(s.ch)}/leave`, { headers: { Authorization: `Bearer ${s.token}`, 'X-Session-Id': s.sid }, body: {} }).catch(() => {}),
        ),
      );
    },
    ring,
    openCall,
    handle: () => stats.callsign,
    status: () => ({ ...stats, activeCalls: calls.size, avatar: persona().meetAvatar }),
  };
}

// ───────────────────────────── helpers ─────────────────────────────

/**
 * Invitación a una llamada dentro de un mensaje: las líneas "Channel id / Token / PIN" del
 * botón Ring de meet, o un enlace …/call#c=…&t=…&p=… (también en la query).
 */
export function parseInvite(text) {
  const s = String(text || '');
  const line = (label) => s.match(new RegExp(`${label}\\s*:\\s*([^\\s]+)`, 'i'))?.[1];
  const id = line('channel id');
  const token = line('token');
  if (id && token) return { channel_id: id, token, pin: line('pin') || null };
  for (const url of s.match(/https?:\/\/[^\s<>"')]+/g) || []) {
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (!/\/call\b/.test(u.pathname)) continue;
    const params = new URLSearchParams(u.hash.slice(1) || u.search.slice(1));
    const c = params.get('c');
    const t = params.get('t');
    if (c && t) return { channel_id: c, token: t, pin: params.get('p') || null };
  }
  return null;
}

async function hubRequest(hub, method, path, { headers = {}, body, timeoutMs = 15000 } = {}) {
  const res = await fetch(hub + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

/** Traductor para un idioma de persona o llamada (códigos sin catálogo → inglés; vacío → servidor). */
const langT = (lang) => translator(lang ? resolveLocale(lang) : serverLocale());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
