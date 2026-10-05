/**
 * Canales para hablar con el agente fuera de la web: apumail (correo) y apuchat
 * (mensajes, videollamadas de meet.apuchat.com y llamadas a la app).
 * Cada canal se activa solo si tiene su configuración (por defecto, variables de entorno).
 */

import { getIdentity } from '../identity.mjs';
import { i18nError, reqT } from '../i18n.mjs';
import { createServerAgent, persona as personaOf } from './agent.mjs';
import { apumailConfigFromEnv, apumailConfigured, createApumailChannel } from './apumail.mjs';
import { apuchatConfigFromEnv, apuchatConfigured, createApuchatChannel } from './apuchat.mjs';

/**
 * @param {object} deps
 * @param {{step: Function}} [deps.llm]       LLM del proxy
 * @param {Function} [deps.brain]            cerebro propio (ver channels/agent.mjs); sustituye al LLM
 * @param {() => object} [deps.identity]     identidad vigente (defecto: server/identity.mjs)
 * @param {() => string} [deps.instructions] instrucciones fijas del servidor (defecto: SERVER_INSTRUCTIONS)
 * @param {{ apumail?: object|false, apuchat?: object|false }} [deps.config]  por defecto, el entorno
 * @param {Function} [deps.log]
 * @param {(ctx: { channel: 'dm'|'email', from: string, verified?: boolean }) => ({ tools: object[], run: Function }|null)} [deps.tools]
 *   extra server tools for one conversation (DMs and mails, never voice calls), decided per sender
 * @param {(t: { key: string, channel: 'email'|'dm', user: string, reply: string }) => void} [deps.onTurn]  each answered mail / DM
 */
export function startAgentChannels({ llm, brain, identity = getIdentity, instructions, config = {}, log = (...a) => console.log('[7ots]', ...a), tools = null, onTurn = null }) {
  const agent = createServerAgent({ llm, brain, identity, instructions, onTurn });
  const persona = () => personaOf(identity);
  const mailCfg = config.apumail === false ? null : { ...apumailConfigFromEnv(), ...(config.apumail || {}) };
  const chatCfg = config.apuchat === false ? null : { ...apuchatConfigFromEnv(), ...(config.apuchat || {}) };
  const apumail = mailCfg && apumailConfigured(mailCfg) ? createApumailChannel({ agent, log, config: mailCfg, tools }) : null;
  const apuchat = chatCfg && apuchatConfigured(chatCfg) ? createApuchatChannel({ agent, persona, log, config: chatCfg, tools }) : null;
  apumail?.start();
  apuchat?.start();

  return {
    agent,
    /** Rutas públicas de los canales (van antes del site key: las llama apumail, no el widget). */
    async handle(req, res, path) {
      if (path === '/channels/apumail' && req.method === 'POST') {
        if (!apumail) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: reqT(req)('server.channels.noApumail') }));
          return true;
        }
        await apumail.webhook(req, res);
        return true;
      }
      return false;
    },
    /** Qué canales funcionan ahora mismo (para la tarjeta pública de identidad). */
    live: () => ({
      email: !!apumail,
      apuchat: apuchat?.handle() || null,
      meet: !!apuchat,
    }),
    /** Videollamada de meet con el agente dentro; devuelve el enlace para entrar. */
    openCall: (o) => {
      if (!apuchat) throw i18nError(501, 'server.channels.noApuchat');
      return apuchat.openCall(o);
    },
    /** Hace sonar la app de apuchat de @handle con una llamada del agente. */
    ring: (handle, motivo) => {
      if (!apuchat) throw i18nError(501, 'server.channels.noApuchat');
      return apuchat.ring(String(handle).replace(/^@/, '').toLowerCase(), motivo);
    },
    status: () => ({ apumail: apumail?.status() || false, apuchat: apuchat?.status() || false }),
    async stop() {
      apumail?.stop();
      await apuchat?.stop();
    },
  };
}
