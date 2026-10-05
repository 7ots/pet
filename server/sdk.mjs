/**
 * 7ots/server — identidad y contactabilidad para CUALQUIER agente, sin el widget.
 *
 * Tienes tu propio agente (LangChain, tu API, un bot…) y quieres darle una cara, una voz y
 * formas de contactarlo: un correo propio (apumail), un @handle que contesta mensajes y
 * llamadas (apuchat), videollamadas con avatar (meet.apuchat.com) y una tarjeta pública.
 *
 *   import { createAgentIdentity } from '7ots/server';
 *
 *   const nube = createAgentIdentity({
 *     identity: {
 *       name: 'Nube', role: 'asistente de Nimbus', bio: 'Te ayudo con tu almacenamiento.',
 *       look: { color: '#6d5dfc', image: 'https://…/nube.png', meetAvatar: 'maya' },
 *       voice: { provider: 'openai', voiceId: 'coral', style: 'cálida y clara' },
 *       contact: { site: 'https://nimbus.example', email: 'nube@nimbus.example' },
 *     },
 *     // Tu cerebro: recibe el mensaje y devuelve el texto de la respuesta.
 *     brain: async ({ text, channel, history, identity }) => miAgente.responder(text),
 *     apumail: { inbox: 'nube@nimbus.example', token: process.env.NUBE_MAIL_TOKEN },
 *     apuchat: { identityKey: process.env.NUBE_APUCHAT_KEY },
 *   });
 *   nube.start();
 *
 *   http.createServer((req, res) => nube.handler(req, res) || miApp(req, res));
 *
 * Sin `brain`, usa el LLM del proxy de 7ots (LLM_PROVIDER + claves en el entorno).
 * Las claves se pasan en el código del servidor o por entorno; nunca aparecen en la tarjeta.
 */

import { defineIdentity, publicIdentity, toVCard, identityPrompt, useIdentity, getIdentity, MEET_AVATARS, MEET_SCENES, OPENAI_VOICES, GROK_VOICES } from './identity.mjs';
import { startAgentChannels } from './channels/index.mjs';
import { synthesize } from './tts.mjs';

export { defineIdentity, publicIdentity, toVCard, identityPrompt, MEET_AVATARS, MEET_SCENES, OPENAI_VOICES, GROK_VOICES };

/**
 * @param {object} o
 * @param {object} [o.identity]           ficha de identidad (ver server/identity.mjs). Sin ella: entorno + data/identity.json
 * @param {Function} [o.brain]            async ({ key, channel, text, lang, history, identity, system, tools, run }) => string
 * @param {{step: Function}} [o.llm]      o un LLM con la interfaz neutral de 7ots (sin brain ni llm: el del entorno)
 * @param {object|false} [o.apumail]      { inbox, token, webhookSecret, daily, api } — false lo apaga
 * @param {object|false} [o.apuchat]      { identityKey, allow, maxCalls, maxMinutes, maxTurns, hub } — false lo apaga
 * @param {string} [o.basePath]           prefijo de las rutas de handler() (defecto '/agent')
 * @param {Function} [o.log]
 */
export function createAgentIdentity({ identity, brain, llm, apumail, apuchat, basePath = '/agent', log } = {}) {
  if (identity) useIdentity(identity);
  let channels = null;
  const base = basePath.replace(/\/$/, '');

  const ensure = async () => {
    if (channels) return channels;
    let theLlm = llm;
    if (!brain && !theLlm) theLlm = (await import('./llm.mjs')).createLLM();
    channels = startAgentChannels({ llm: theLlm, brain, identity: getIdentity, config: { apumail, apuchat }, ...(log ? { log } : {}) });
    return channels;
  };

  const api = {
    /** Arranca los canales configurados (long-poll de apumail, mensajes y llamadas de apuchat). */
    async start() {
      await ensure();
      return api;
    },
    async stop() {
      await channels?.stop();
    },
    /** Identidad completa (incluye instrucciones; no la publiques tal cual). */
    get identity() {
      return getIdentity();
    },
    /** Cambia la identidad en caliente (nombre, voz, avatar de meet…). */
    update(patch) {
      return useIdentity(defineIdentity(patch, getIdentity()));
    },
    /** Tarjeta pública (segura para servir). */
    card() {
      return publicIdentity(getIdentity(), channels?.live() || {});
    },
    vcard(o) {
      return toVCard(api.card(), o);
    },
    /** Texto → audio con la voz de la identidad. → { audio: Buffer, contentType } */
    speak(text) {
      return synthesize({ text, voice: getIdentity().voice });
    },
    /** Responde a un mensaje como lo haría por un canal ('email' | 'dm' | 'voice'). */
    async respond(text, { from = 'sdk', channel = 'dm', lang } = {}) {
      return (await ensure()).agent.respond(`${channel}:${from}`, channel, text, { lang });
    },
    /** Hace sonar la app de apuchat de @handle con una videollamada del agente. */
    async call(handle, motivo) {
      return (await ensure()).ring(handle, motivo);
    },
    /** Crea una videollamada de meet con el agente dentro → { call_url } (dásela solo a quien llama). */
    async openCall(o) {
      return (await ensure()).openCall(o);
    },
    status() {
      return channels?.status() || { apumail: false, apuchat: false };
    },
    /**
     * Manejador HTTP para Node (http, Express, Fastify con .raw…). Devuelve una promesa que
     * resuelve true si atendió la ruta:
     *   GET  {base}/identity  ·  GET {base}/identity.vcf  ·  GET /.well-known/7ots-agent.json
     *   POST {base}/channels/apumail   (webhook de apumail)
     */
    async handler(req, res) {
      const path = new URL(req.url, 'http://x').pathname;
      if (req.method === 'GET' && (path === `${base}/identity` || path === '/.well-known/7ots-agent.json')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(api.card()));
        return true;
      }
      if (req.method === 'GET' && path === `${base}/identity.vcf`) {
        res.writeHead(200, { 'Content-Type': 'text/vcard; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(api.vcard());
        return true;
      }
      if (path.startsWith(`${base}/channels/`)) return (await ensure()).handle(req, res, path.slice(base.length));
      return false;
    },
  };
  return api;
}
