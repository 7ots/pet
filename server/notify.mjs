/**
 * Correos internos de 7ots.com (al equipo, nunca a terceros elegidos por el visitante):
 * formulario de contacto/feedback del sitio y aviso de alta de cuentas nuevas.
 *
 * Salen por la API de envío de un buzón permanente de apumail.com:
 *   NOTIFY_MAIL_INBOX   buzón remitente (p. ej. 7ots@apumail.com) · NOTIFY_MAIL_TOKEN su token
 *   CONTACT_TO          destino del formulario de contacto/feedback (defecto maestro@apumail.com)
 *   SIGNUP_NOTIFY_EMAIL destino del aviso de alta (defecto maestro@apumail.com)
 *   APUMAIL_API         defecto https://api.apumail.com
 *
 * Es independiente de PLATFORM_MAIL_* (enlace mágico de acceso), que sigue apagado mientras no se configure.
 */

const env = process.env;
export const notifyConfigured = () => !!(env.NOTIFY_MAIL_INBOX && env.NOTIFY_MAIL_TOKEN);
const clip = (s, n) => String(s ?? '').replace(/\r/g, '').slice(0, n).trim();

/** Envía un correo de texto plano desde el buzón de avisos. Lanza si falla. */
export async function sendNotify({ to, subject, text, replyTo }) {
  if (!notifyConfigured()) {
    const e = new Error('notify mail not configured');
    e.status = 501;
    throw e;
  }
  const api = (env.APUMAIL_API || 'https://api.apumail.com').replace(/\/$/, '');
  const body = { to, subject: clip(subject, 256), text: clip(text, 100000) };
  if (replyTo) body.reply_to = replyTo;
  const res = await fetch(`${api}/api/v1/inbox/${encodeURIComponent(env.NOTIFY_MAIL_INBOX.toLowerCase())}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.NOTIFY_MAIL_TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const out = await res.json().catch(() => ({}));
    const e = new Error(`apumail ${res.status} ${out.code || ''}`.trim());
    e.status = res.status === 429 ? 429 : 502;
    throw e;
  }
  return true;
}

// ───────────────────────────── aviso de alta (P15) ─────────────────────────────

const signupHits = [];
/**
 * Avisa al dueño de una cuenta nueva. Best-effort: nunca lanza ni bloquea el alta.
 * Solo producto, email (si lo hay), método y fecha; nada de tokens ni ids de sesión.
 */
export function notifySignup({ email, via, id }) {
  try {
    const now = Date.now();
    while (signupHits.length && now - signupHits[0] > 3600_000) signupHits.shift();
    if (signupHits.length >= Number(env.SIGNUP_NOTIFY_MAX_PER_HOUR || 60)) return Promise.resolve(false);
    signupHits.push(now);
    const to = env.SIGNUP_NOTIFY_EMAIL || 'maestro@apumail.com';
    const when = new Date(now).toISOString();
    const who = email || '(sin email: cuenta notlogin)';
    const text = [
      'Nueva cuenta en 7ots.com',
      '',
      `Producto: 7ots (https://7ots.com)`,
      `Usuario: ${who}`,
      `Método de alta: ${via || 'desconocido'}`,
      `Cuenta: ${id ?? "?"}`,
      `Fecha: ${when}`,
    ].join('\n');
    return sendNotify({ to, subject: `[7ots] Nueva cuenta: ${who}`, text })
      .then(() => true)
      .catch((e) => {
        console.warn('[7ots] aviso de alta no enviado:', e.message);
        return false;
      });
  } catch (e) {
    console.warn('[7ots] aviso de alta:', e.message);
    return Promise.resolve(false);
  }
}
