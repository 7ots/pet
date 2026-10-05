/**
 * Contactabilidad: Apumail (correo/tickets) y Apuchat (derivar a una persona).
 *
 * Todo lo sensible se queda aquí: API keys, buzón de destino, identidad del notificador
 * y el enlace de operador de la videollamada. Al navegador solo vuelve lo mínimo.
 *
 * Idiomas: los errores llevan clave (se traducen al idioma del visitante al responder); el correo
 * y el DM al equipo salen en el idioma del servidor (LOCALE, ver server/i18n.mjs).
 */

import { openHandoff } from './apuchat-relay.mjs';
import { i18nError, teamT } from './i18n.mjs';

const HUB = (env) => (env.APUCHAT_HUB || 'https://apuchat.com').replace(/\/$/, '');

// ───────────────────────────── Apumail ─────────────────────────────

/**
 * Envía el ticket como un correo normal desde un buzón de apumail.com que es tuyo.
 * (apumail no tiene endpoint de "tickets": se usa la API de envío del buzón.)
 *
 *   POST {APUMAIL_API}/api/v1/inbox/{APUMAIL_INBOX}/send
 *   Authorization: Bearer {APUMAIL_INBOX_TOKEN}      (token del buzón o PAT acct_… de la cuenta dueña)
 *   { to, subject (≤256), text (≤100k), reply_to }   → { ok, provider_id, message_id }
 *
 * El remitente siempre es el propio buzón. Usa un buzón permanente o de dominio propio:
 * los buzones gratis caducan a las 24 h sin actividad y solo envían 5 destinatarios/día.
 */
export async function sendApumail(body, env = process.env) {
  if (!env.APUMAIL_INBOX || !env.APUMAIL_INBOX_TOKEN || !env.APUMAIL_TO) {
    throw i18nError(501, 'server.contact.mailNotConfigured');
  }
  const subject = clip(body.subject, 160);
  const message = clip(body.message, 5000);
  const replyTo = clip(body.replyTo, 200);
  // apumail no valida reply_to: se valida aquí.
  if (!subject || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(replyTo)) throw i18nError(400, 'server.contact.mailMissing');

  const api = (env.APUMAIL_API || 'https://api.apumail.com').replace(/\/$/, '');
  const res = await fetch(`${api}/api/v1/inbox/${encodeURIComponent(env.APUMAIL_INBOX.toLowerCase())}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.APUMAIL_INBOX_TOKEN}` },
    body: JSON.stringify(buildApumailPayload({ ...body, subject, message, replyTo, to: env.APUMAIL_TO })),
    signal: AbortSignal.timeout(15000),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const wait = out.retry_after_seconds || Number(res.headers.get('Retry-After')) || null;
    throw wait ? i18nError(429, 'server.contact.mailRateLimitedWait', { minutes: Math.ceil(wait / 60) }) : i18nError(429, 'server.contact.mailRateLimited');
  }
  if (!res.ok) {
    console.error('[7ots] apumail', res.status, out.code || '', out.error || '');
    throw i18nError(502, 'server.contact.mailFailed');
  }
  return { ok: true, ticketId: out.message_id || out.provider_id || null };
}

/** Cuerpo para /inbox/:address/send. Solo texto: el contenido viene del usuario y del LLM. */
export function buildApumailPayload({ to, subject, message, replyTo, category, user, page, transcript = [] }) {
  const t = teamT(); // lo lee el equipo: idioma del servidor
  const cat = category || t('server.contact.mail.otherCategory');
  const convo = transcript
    .slice(-40)
    .map((m) => `${m.from === 'user' ? t('server.contact.mail.user') : m.from === 'agent' ? t('server.contact.mail.agent') : m.name || t('server.contact.mail.team')}: ${clip(m.text, 1000)}`)
    .join('\n');
  const text = [
    message,
    '',
    t('server.contact.mail.category', { category: cat }),
    t('server.contact.mail.page', { url: clip(page?.url, 500) }),
    user ? t('server.contact.mail.userLine', { user: clip(JSON.stringify(user), 500) }) : t('server.contact.mail.anonymous'),
    '',
    convo ? `${t('server.contact.mail.conversation')}\n${convo}` : '',
  ].join('\n');
  return {
    to, // fijo en el servidor (APUMAIL_TO): el LLM nunca elige el destinatario
    subject: clip(`[${cat}] ${subject}`, 256),
    text: text.slice(0, 100000),
    reply_to: replyTo, // responder al correo llega directamente al visitante
  };
}

// ───────────────────────────── Apuchat ─────────────────────────────

/**
 * Crea una videollamada efímera en el hub, avisa al operador por DM y abre el relé
 * (server/apuchat-relay.mjs) con la identidad "agent" de la llamada.
 *
 *   POST {hub}/api/video-call  {transcribe}           → {channel_id, channel_token, call_url, call_url_public, agent, phone}
 *   POST {hub}/api/dm  x-identity-key  {to, text}      (handle SIN "@", ≤ 4096; 202 aunque el handle no exista)
 *
 * El operador entra con `call_url` (lleva claves y PIN: solo viaja en el DM).
 * Al navegador vuelven un id/token opacos del relé y `call_url_public` (sin secretos: quien
 * lo abre "llama a la puerta" y alguien de dentro le deja pasar).
 *
 * Ojo: el hub limita /api/video-call a 15/min por IP, y todas las peticiones salen de este
 * servidor, así que ese límite es compartido por todos los visitantes.
 */
export async function startApuchat(body, env = process.env) {
  const hub = HUB(env);
  const res = await fetch(`${hub}/api/video-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Solo `false` explícito desactiva la transcripción en el hub.
    body: JSON.stringify({ transcribe: env.APUCHAT_TRANSCRIBE === 'true' }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 429) throw i18nError(429, 'server.contact.chatBusy');
  if (!res.ok) throw i18nError(502, 'server.contact.chatHubError', { status: res.status });
  const call = await res.json();

  const relay = await openHandoff({
    hub,
    channel_id: call.channel_id,
    channel_token: call.channel_token,
    identity_key: call.agent?.identity_key,
  });

  let operatorNotified = false;
  const operator = String(env.APUCHAT_OPERATOR_HANDLE || '').trim().replace(/^@/, '').toLowerCase();
  if (env.APUCHAT_NOTIFIER_IDENTITY_KEY && operator) {
    const t = teamT(); // aviso para el operador: idioma del servidor
    const head = [
      t('server.contact.dm.head', { urgency: clip(body.urgency, 10) || t('server.contact.dm.normal'), reason: clip(body.reason, 200) }),
      body.user?.name ? t('server.contact.dm.user', { name: clip(body.user.name, 80) }) : t('server.contact.dm.visitor'),
      t('server.contact.dm.page', { url: clip(body.page?.url, 300) }),
    ].join('\n');
    const link = t('server.contact.dm.link', { url: call.call_url });
    // El enlace va al final y nunca se recorta: se recorta el resumen.
    const room = 4096 - head.length - link.length - 20;
    const text = `${head}\n\n${t('server.contact.dm.summary', { summary: clip(body.summary, Math.max(0, room)) })}\n\n${link}`;
    const dm = await fetch(`${hub}/api/dm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-identity-key': env.APUCHAT_NOTIFIER_IDENTITY_KEY },
      body: JSON.stringify({ to: operator, text }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    operatorNotified = !!dm && dm.status < 300;
    if (!operatorNotified) console.error('[7ots] apuchat: el DM al operador falló', dm?.status ?? 'sin respuesta');
  } else {
    console.warn('[7ots] apuchat: falta APUCHAT_NOTIFIER_IDENTITY_KEY/APUCHAT_OPERATOR_HANDLE; nadie recibe aviso de la derivación.');
  }

  return { ...relay, call_url_public: call.call_url_public || null, operatorNotified };
}

// ───────────────────────────── helpers ─────────────────────────────

function clip(s, n) {
  return String(s ?? '').slice(0, n).trim();
}
