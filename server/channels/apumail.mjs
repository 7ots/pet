/**
 * Canal apumail: el agente tiene su propio buzón y contesta los correos que le llegan.
 *
 *   APUMAIL_AGENT_INBOX           dirección del buzón del agente (p. ej. nube@tudominio.com)
 *   APUMAIL_AGENT_TOKEN           token del buzón (o PAT de la cuenta dueña)
 *   APUMAIL_AGENT_WEBHOOK_SECRET  opcional: si está, se espera el webhook de apumail en
 *                                 POST /api/agent/channels/apumail (URL pública) y se verifica
 *                                 X-Apumail-Signature. Si no, se usa long-poll (/wait).
 *   APUMAIL_AGENT_DAILY           máximo de respuestas al día (defecto 20)
 *
 * Contrato de apumail usado:
 *   GET  /api/v1/inbox/:address/wait?since=<id>&timeout≤300   Bearer token
 *        → { messages: StoredMail[], next_since, timed_out }
 *   POST /api/v1/inbox/:address/send  { to, subject, text, reply_to_mail_id }  (se enhebra solo)
 *   Webhook: { event:'mail.received', inbox, mail, ts }  +  X-Apumail-Signature: sha256=<hex HMAC del cuerpo>
 *   StoredMail: { id, to, from, subject, text, html, received_at, … }
 *
 * Usa un buzón permanente (dominio propio o handle de pago): los gratis caducan y solo
 * envían 5 destinatarios al día.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { i18nError, reqT, teamT } from '../i18n.mjs';

const env = process.env;
const BACKLOG_MAX_AGE_MS = 30 * 60 * 1000; // al arrancar, solo se contestan correos recientes
const PER_SENDER_PER_DAY = 5;
const MAX_BODY = 256 * 1024;

/** Configuración del canal desde el entorno (el SDK puede pasar la suya). */
export function apumailConfigFromEnv(e = env) {
  return {
    api: e.APUMAIL_API || 'https://api.apumail.com',
    inbox: e.APUMAIL_AGENT_INBOX || '',
    token: e.APUMAIL_AGENT_TOKEN || '',
    webhookSecret: e.APUMAIL_AGENT_WEBHOOK_SECRET || '',
    daily: Number(e.APUMAIL_AGENT_DAILY || 20),
  };
}

export function apumailConfigured(cfg = apumailConfigFromEnv()) {
  return !!(cfg.inbox && cfg.token);
}

/**
 * @param {{ agent: ReturnType<import('./agent.mjs').createServerAgent>, log: Function, config?: object, tools?: Function }} deps
 *   tools: extra tools for a mail, decided by sender ({ channel:'email', from, verified } → { tools, run } | null)
 */
export function createApumailChannel({ agent, log, config = apumailConfigFromEnv(), tools = null }) {
  const cfg = { ...apumailConfigFromEnv({}), ...config };
  const inbox = String(cfg.inbox || '').toLowerCase();
  const token = cfg.token;
  const secret = cfg.webhookSecret || '';
  const dailyCap = Number(cfg.daily || 20);
  const base = `${String(cfg.api).replace(/\/$/, '')}/api/v1/inbox/${encodeURIComponent(inbox)}`;
  const auth = { Authorization: `Bearer ${token}` };

  const seen = new Set(); // ids ya tratados (los webhooks se reintentan)
  const stats = { mode: secret ? 'webhook' : 'long-poll', received: 0, replied: 0, skipped: 0, lastError: null };
  let day = '';
  let sentToday = 0;
  const perSender = new Map();
  let stopped = false;

  const budget = (from) => {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      sentToday = 0;
      perSender.clear();
    }
    if (sentToday >= dailyCap) return 'límite diario';
    if ((perSender.get(from) || 0) >= PER_SENDER_PER_DAY) return 'límite por remitente';
    return null;
  };

  async function handleMail(mail, { backlog = false } = {}) {
    if (!mail?.id || seen.has(mail.id)) return;
    seen.add(mail.id);
    if (seen.size > 5000) seen.clear();
    stats.received++;
    const from = emailOf(mail.from);
    const why = skipReason(mail, from, inbox) || (backlog && Date.now() - Number(mail.received_at || 0) > BACKLOG_MAX_AGE_MS ? 'antiguo' : null) || budget(from);
    if (why) {
      stats.skipped++;
      log(`apumail: no se contesta el correo ${mail.id} (${why})`);
      return;
    }
    const subject = String(mail.subject || '').slice(0, 200);
    const body = (mail.text || stripHtml(mail.html) || '').split('\n').filter((l) => !l.startsWith('>')).join('\n').trim().slice(0, 6000);
    const extra = tools?.({ channel: 'email', from, verified: senderVerified(mail) }) || null;
    const reply = await agent.respond(`mail:${from}`, 'email', `Asunto: ${subject || '(sin asunto)'}\n\n${body || '(vacío)'}`, extra || {});
    if (!reply) return;
    const res = await fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ to: from, subject: /^re:/i.test(subject) ? subject : `Re: ${subject || teamT()('server.channels.replySubject')}`, text: reply, reply_to_mail_id: mail.id }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const out = await res.json().catch(() => ({}));
      stats.lastError = `send ${res.status} ${out.code || ''}`.trim();
      log(`apumail: no se pudo responder (${stats.lastError})`);
      return;
    }
    sentToday++;
    perSender.set(from, (perSender.get(from) || 0) + 1);
    stats.replied++;
    log(`apumail: respondido el correo ${mail.id}`);
  }

  /** Long-poll: sin URL pública. El primer lote es el atrasado (solo se contestan los recientes). */
  async function poll() {
    let since = 0;
    let first = true;
    while (!stopped) {
      try {
        const res = await fetch(`${base}/wait?timeout=60${since ? `&since=${since}` : ''}`, { headers: auth, signal: AbortSignal.timeout(75000) });
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          stats.lastError = `wait ${res.status}`;
          log(`apumail: el buzón del agente no responde (${res.status}); se deja de escuchar. Revisa APUMAIL_AGENT_INBOX / APUMAIL_AGENT_TOKEN.`);
          return;
        }
        if (!res.ok) throw new Error(`wait ${res.status}`);
        const out = await res.json();
        for (const mail of out.messages || []) await handleMail(mail, { backlog: first }).catch((e) => log('apumail:', e.message));
        since = out.next_since ?? since;
        first = false;
      } catch (e) {
        stats.lastError = e.message;
        await sleep(5000);
      }
    }
  }

  /** POST /api/agent/channels/apumail — webhook firmado. */
  async function webhook(req, res) {
    const raw = await readRaw(req);
    const sig = String(req.headers['x-apumail-signature'] || '');
    const want = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    if (!secret || sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: reqT(req)('server.channels.badSignature') }));
    }
    let evt;
    try {
      evt = JSON.parse(raw.toString('utf8'));
    } catch {
      res.writeHead(400);
      return res.end();
    }
    // Se responde ya (apumail reintenta si tardamos); el correo se trata en segundo plano.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    if (evt.event === 'mail.received' && String(evt.inbox || '').toLowerCase() === inbox) {
      handleMail(evt.mail).catch((e) => log('apumail:', e.message));
    }
  }

  return {
    start() {
      log(`apumail: el agente atiende ${inbox} (${stats.mode})`);
      if (!secret) poll();
    },
    stop() {
      stopped = true;
    },
    webhook,
    status: () => ({ inbox, ...stats, sentToday }),
  };
}

// ───────────────────────────── helpers ─────────────────────────────

export function emailOf(from) {
  const s = String(from || '');
  return (s.match(/<([^>]+)>/)?.[1] || s).trim().toLowerCase();
}

/**
 * Did apumail verify the sender (DMARC pass for the From domain)? Only a structured verdict from
 * apumail counts; headers inside the mail can be written by whoever sent it.
 */
export function senderVerified(mail) {
  return mail?.auth?.dmarc === 'pass';
}

/** Correos que nunca se contestan: propios, automáticos, rebotes, listas. */
export function skipReason(mail, from, inbox) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(from)) return 'remitente inválido';
  if (from === inbox) return 'propio';
  if (/^(no-?reply|mailer-daemon|postmaster|bounces?|notifications?)([+@.-])/i.test(from)) return 'automático';
  if (/^(auto(matic)? ?reply|respuesta autom|out of office|fuera de la oficina|undeliverable|delivery status|returned mail)/i.test(String(mail.subject || ''))) return 'automático';
  const h = mail.headers || {};
  if (/auto-(replied|generated)/i.test(h['auto-submitted'] || '') || h['list-id'] || /bulk|list|junk/i.test(h.precedence || '')) return 'automático';
  return null;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw i18nError(413, 'server.http.bodyTooLarge');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
