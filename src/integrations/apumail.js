/**
 * Integración Apumail — dejar un mensaje / abrir un ticket por correo.
 *
 * Flujo:
 *   LLM → send_email_ticket({subject, message, category, email?})
 *       → confirmación con vista previa (el usuario ve exactamente lo que se enviará)
 *       → POST {endpoint}/contact/apumail   (el proxy tiene la API key de apumail)
 *       → el proxy lo envía desde tu buzón de apumail (APUMAIL_INBOX) a APUMAIL_TO, con transcript + URL + usuario.
 *
 * El navegador NUNCA tiene la clave de apumail. El destino (buzón de soporte) lo fija
 * el servidor (APUMAIL_TO), así un prompt malicioso no puede enviar correos a terceros.
 *
 * ⚠ La forma exacta de la API de apumail.com es configurable en server/contact.mjs:
 *   ajusta allí el payload si tu cuenta de apumail espera otros campos.
 */

import { escapeHtml } from '../ui/markdown.js';
import { acceptLanguage } from '../llm/ProxyLLM.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {object} o
 * @param {string} o.endpoint              base del proxy, p. ej. "/api/agent"
 * @param {string} [o.siteKey]
 * @param {() => Array<{from,text}>} o.getTranscript
 * @param {string[]} [o.categories]
 * @param {(key: string, vars?: object) => string} [o.t]  traductor de la confirmación; su `locale`
 *   viaja en Accept-Language para que el proxy conteste los errores en ese idioma
 */
export function createApumailActions({ endpoint, siteKey, getTranscript, categories = ['soporte', 'ventas', 'facturacion', 'otro'], t = translator() }) {
  return [
    {
      name: 'send_email_ticket',
      category: 'contact',
      description:
        'Envía un correo/ticket al equipo del sitio (vía apumail) con el resumen del caso y la conversación adjunta. ' +
        'Úsalo cuando el usuario quiere dejar un mensaje, pedir algo que requiere a una persona sin esperar en línea, o reportar un problema. ' +
        'Antes, asegúrate de tener un email de respuesta (el de la sesión o uno que el usuario te dé).',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Asunto breve y concreto' },
          message: { type: 'string', description: 'Resumen claro del caso en tercera persona, con los datos relevantes' },
          category: { type: 'string', enum: categories },
          email: { type: 'string', description: 'Email de respuesta si el usuario no ha iniciado sesión' },
          include_transcript: { type: 'boolean', description: 'Adjuntar la conversación (por defecto true)' },
        },
        required: ['subject', 'message', 'category'],
      },
      confirm: (args, { auth }) => {
        const to = args.email || auth?.publicUser()?.email || t('widget.contact.noEmail');
        return t('widget.contact.mailPreview', { subject: args.subject, to, message: args.message });
      },
      timeoutMs: 20000,
      handler: async (args, { auth }) => {
        const user = auth?.publicUser() || null;
        const replyTo = (args.email || user?.email || '').trim();
        if (!EMAIL_RE.test(replyTo)) {
          return { ok: false, error: 'Falta un email de respuesta válido. Pídeselo al usuario.' };
        }
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/contact/apumail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(siteKey ? { 'X-Site-Key': siteKey } : {}), ...acceptLanguage(t.locale) },
          body: JSON.stringify({
            subject: args.subject,
            message: args.message,
            category: args.category,
            replyTo,
            user,
            page: { url: location.href, title: document.title },
            transcript: args.include_transcript === false ? [] : getTranscript().slice(-40),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: body.error || `No se pudo enviar (HTTP ${res.status})` };
        return { ok: true, data: { sent: true, ticketId: body.ticketId || null, replyTo } };
      },
    },
  ];
}

/** Plantilla opcional para mostrar el ticket enviado en un modal. */
export function apumailTicketTemplate(data, { escape = escapeHtml, t = translator() } = {}) {
  return `<div class="ots-ticket"><p><strong>${escape(t('widget.contact.ticket', { id: data.ticketId || '' }))}</strong></p><p>${escape(t('widget.contact.replyTo', { email: data.replyTo }))}</p></div>`;
}
