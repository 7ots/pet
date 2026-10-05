/**
 * createFace — la cara y la voz de una identidad, sin chat ni cerebro.
 *
 * Para quien ya tiene su agente (propio backend, otro framework…) y solo quiere darle un
 * rostro que habla con lip-sync y la voz de su identidad:
 *
 *   const face = await SevenOts.createFace(document.querySelector('#cara'), {
 *     identity: '/api/agent/identity',        // o el objeto de identidad
 *     endpoint: '/api/agent',                 // proxy de 7ots para el TTS (opcional: sin él, voz del navegador)
 *   });
 *   await face.say('Hola, soy Nube. ¿En qué te ayudo?');
 *   face.mood('happy'); face.gesture('thumbup'); face.morph('wings'); face.effect('hearts');
 *   const texto = await face.listen();        // micrófono → texto (Web Speech API)
 *
 * El avatar 3D necesita el importmap de three en la página (ver AvatarStage); sin WebGL
 * se muestra el retrato de la identidad o la cara 2D.
 */

import { AvatarStage } from '../avatar/AvatarStage.js';
import { VoiceEngine } from '../voice/VoiceEngine.js';
import { EventBus } from '../core/EventBus.js';
import { createStore } from '../core/storage.js';
import { defineIdentity, identityToWidgetConfig } from './schema.js';
import { translator, detectLocale } from '../i18n/index.js';
import '../i18n/messages/identity.js';

/**
 * @param {HTMLElement} container
 * @param {object} [o]
 * @param {object|string} [o.identity]   identidad o URL de su tarjeta (defecto: {endpoint}/identity si hay endpoint)
 * @param {string} [o.endpoint]          proxy de 7ots (TTS con la voz de la identidad)
 * @param {string} [o.siteKey]
 * @param {object|false} [o.avatar]      sobrescribe el avatar de la identidad ({ mode: '2d' } fuerza retrato/cara)
 * @param {object|false} [o.voice]       sobrescribe la voz ({ tts: 'browser' }, false = muda)
 * @param {number} [o.size]              alto en px (defecto: el del contenedor, mínimo 160)
 * @param {boolean} [o.subtitles=true]   muestra lo que dice
 * @param {string} [o.locale]            idioma de los textos de interfaz (etiquetas, errores); defecto: detectLocale()
 *                                       (la voz y el lip-sync siguen el `language` de la identidad)
 */
export async function createFace(container, o = {}) {
  if (!container) throw new Error('createFace necesita un elemento contenedor');
  const endpoint = o.endpoint ? o.endpoint.replace(/\/$/, '') : '';
  const t = translator(detectLocale(o.locale));
  const src = o.identity ?? (endpoint ? `${endpoint}/identity` : {});
  let identity = defineIdentity(typeof src === 'string' ? await fetchJson(src, t) : src);
  let ic = identityToWidgetConfig(identity);

  const host = document.createElement('div');
  host.setAttribute('data-ots-root', 'face');
  host.style.cssText = `display:block;position:relative;width:100%;height:${o.size ? `${o.size}px` : '100%'};min-height:160px;`;
  container.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${faceCss()}</style><div class="wrap"><div class="stage"></div><div class="subs" aria-live="polite" aria-label="${escAttr(t('identity.face.subtitles'))}"></div></div>`;
  const wrap = root.querySelector('.wrap');
  const subs = root.querySelector('.subs');
  const applyColor = () => wrap.style.setProperty('--p', identity.look.color);
  applyColor();

  const bus = new EventBus();
  const avatarCfg = o.avatar === false ? { mode: '2d' } : { ...ic.avatar, ...(o.avatar || {}) };
  const avatar = new AvatarStage({ container: root.querySelector('.stage'), config: avatarCfg, language: identity.language });
  const voice =
    o.voice === false
      ? null
      : new VoiceEngine({
          bus,
          avatar,
          store: createStore(`face:${identity.id}`),
          config: { endpoint, siteKey: o.siteKey, tts: endpoint ? 'proxy' : 'browser', stt: true, ...ic.voice, ...(o.voice || {}) },
        });
  if (voice?.muted) voice.setMuted(false); // la cara existe para hablar: no hereda silencios viejos
  const mode = await avatar.load();
  wrap.dataset.mode = mode;

  let subsTimer = 0;
  const face = {
    get identity() {
      return identity;
    },
    mode,
    /** Dice un texto con la voz de la identidad; resuelve al terminar. */
    async say(text) {
      await avatar.unlockAudio();
      if (o.subtitles !== false) {
        clearTimeout(subsTimer);
        subs.textContent = String(text || '');
      }
      await (voice ? voice.say(text) : Promise.resolve());
      if (o.subtitles !== false) subsTimer = setTimeout(() => (subs.textContent = ''), 1200);
    },
    /** Escucha por el micrófono y devuelve el texto reconocido ('' si nada). */
    listen: (opt) => voice?.listen(opt) ?? Promise.resolve(''),
    interrupt: () => voice?.interrupt(),
    mute: (on = true) => voice?.setMuted(on),
    // AvatarStage valida los nombres (moods 2D/3D, gestos del personaje + alias de TalkingHead).
    mood: (m) => avatar.setMood(m),
    gesture: (g, seconds) => avatar.gesture(g, seconds),
    morph: (name, opts) => avatar.morph(name, opts),
    effect: (name, opts) => avatar.effect(name, opts),
    lookAt: (x, y, ms) => avatar.lookAt(x, y, ms),
    /** Cambia de identidad en caliente (voz, color, retrato; .glb distinto → recarga). */
    async setIdentity(next) {
      identity = defineIdentity(typeof next === 'string' ? await fetchJson(next, t) : next);
      ic = identityToWidgetConfig(identity);
      applyColor();
      voice?.configure({ ...ic.voice, ...(o.voice || {}) });
      wrap.dataset.mode = await avatar.applyLook({ ...ic.avatar, ...(o.avatar || {}) });
      return identity;
    },
    on: (event, fn) => bus.on(event, fn), // voice:start, voice:end, voice:listen
    destroy() {
      voice?.interrupt();
      avatar.dispose();
      host.remove();
    },
  };
  return face;
}

async function fetchJson(url, t) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(t('identity.face.loadError', { status: r.status }));
  return r.json();
}

function escAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function faceCss() {
  return `
  :host { all: initial; display: block; }
  .wrap { --p: #6d5dfc; position: absolute; inset: 0; overflow: hidden; border-radius: inherit;
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--p) 22%, transparent), transparent 70%); font-family: system-ui, sans-serif; }
  .stage { position: absolute; inset: 0; }
  .ots-face, .ots-portrait { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(70%, 70vmin, 220px); aspect-ratio: 1; height: auto; }
  .ots-face-bg { fill: var(--face-bg, var(--p)); }
  .ots-eyes, .ots-mouth { fill: var(--face-fg, #fff); }
  .ots-mouth { transition: ry .06s; }
  .ots-portrait { border-radius: 50%; overflow: hidden; background: var(--p);
    box-shadow: 0 0 0 calc(4px + var(--ots-talk, 0) * 16px) color-mix(in srgb, var(--p) 40%, transparent); transition: box-shadow .08s linear; }
  .ots-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .subs { position: absolute; left: 8px; right: 8px; bottom: 8px; text-align: center; font-size: 14px; line-height: 1.35; color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,.85); pointer-events: none; }
  .subs:empty { display: none; }
  @media (prefers-reduced-motion: reduce) { .ots-portrait { transition: none; } }
  `;
}
