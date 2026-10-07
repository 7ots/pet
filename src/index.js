/**
 * 7ots — asistente web proactivo, embebible en cualquier sitio.
 *
 *   import { init } from '@7ots/cli';            // ESM
 *   const agent = SevenOts.init({...});      // <script> (build IIFE: dist/7ots.iife.js)
 *
 * Configuración (todo opcional salvo `endpoint` si usas el proxy incluido):
 *
 *   SevenOts.init({
 *     endpoint: '/api/agent',                 // tu proxy (server/): el LLM y las claves viven allí
 *     identity: true | '/url/identidad' | { name, role, look, voice, contact },  // quién es (ver src/identity/schema.js)
 *     siteKey: 'pk_demo',                     // identificador público del sitio (no es secreto)
 *     agent:   { name: 'Ana', role: 'asesora de ventas', siteName: 'Acme',
 *                language: 'español', instructions: 'Ofrece siempre el plan anual…' },
 *     avatar:  { url: '/avatars/ana.glb', body: 'F', mood: 'happy', cameraView: 'upper' } | false,
 *     voice:   { tts: 'proxy' | 'browser' | false, stt: true, lang: 'es-ES' } | false,
 *     auth:    { getToken: () => localStorage.getItem('jwt'), getUser: () => ({ name, email, plan }) },
 *     mcp:     [{ url: '/mcp', name: 'acme', requiresAuth: true }],
 *     actions: [{ name, description, parameters, handler, confirm, requiresAuth }],
 *     templates: { producto: (data, { escape }) => `<h3>${escape(data.nombre)}</h3>` },
 *     navigation: { allowedOrigins: ['https://docs.acme.com'], router: (url) => nextRouter.push(url) },
 *     proactive: { level: 'quiet' | 'normal' | 'bold',   // preset de iniciativa; el visitante lo cambia en el menú
 *                  dwellMs, idleMs, hesitationMs, exitIntent, selection, cooldownMs, maxPerSession,
 *                  rules: [{ id, when: (snap) => bool, message }] } | false,
 *     context:   { privateSelectors: ['.saldo'], ignoreSelectors: ['#cookie-banner'], extra: () => ({ carrito }) },
 *     contact:   { apuchat: true, apumail: true | { categories } } | false,   // hub y claves: en el proxy
 *     builtins:  { exclude: ['click'], confirmClicks: 'submit' | 'all' | 'none' },
 *     pointer:   { speed: 1, visible: true } | false,   // ratón y teclado visibles del agente (Esc lo detiene)
 *     pageTools: true | false,                         // [data-ots-tool] del HTML → herramientas
 *     mode:      'panel' | 'companion',                // companion: el avatar se pasea por la página y señala
 *     companion: { size: 150, idleHomeMs: 30000, follow: true, wanderMs, watchCursor },
 *     theme:     { primary: '#e11d48', radius: 18, position: 'right', font: 'Inter, sans-serif' },
 *     open: false,
 *   });
 *
 * API devuelta: registerAction, registerMcp, registerTemplate, setAuthToken, ask, say,
 * notify, setProactivity(level), setIdentity(identity), identity, open, close, reset,
 * on(event, fn), destroy, y ui/auth/context/actions/bus.
 *
 * Módulo de identidad (sin el chat): quién es el agente, cómo se ve, cómo suena y cómo se le contacta.
 *
 *   const face = await SevenOts.createFace(el, { identity: '/api/agent/identity', endpoint: '/api/agent' });
 *   face.say('Hola');                                   // cara + voz de la identidad, lip-sync
 *   <ots-identity src="/api/agent/identity" face></ots-identity>   // tarjeta de contacto
 *
 * Personaje 2D y editor de avatar (estilo Pou: forma deformable, ojos, bocas, accesorios, estilos):
 *
 *   const ch = SevenOts.createCharacter(el, { preset: 'pirate' });  ch.mouth(0.6); ch.mood('happy');
 *   SevenOts.createAvatarEditor(el, { value: identity.look, onChange: (look) => … });
 *   <ots-avatar-editor></ots-avatar-editor>
 */

import { AgentWidget } from './core/AgentWidget.js';

export { AgentWidget };
export { EventBus } from './core/EventBus.js';
export { AgentBrain } from './core/AgentBrain.js';
export { ContextManager } from './context/ContextManager.js';
export { ActionRegistry, validate } from './actions/ActionRegistry.js';
export { createBuiltinActions, setFieldValue } from './actions/builtins.js';
export { VirtualPointer } from './ui/VirtualPointer.js';
export { PageTools } from './actions/PageTools.js';
export { Companion, createCompanionActions } from './ui/Companion.js';
export { AuthManager, decodeJwt } from './auth/AuthManager.js';
export { McpClient } from './mcp/McpClient.js';
export { UIManager } from './ui/UIManager.js';
export { AvatarStage, MOODS, GESTURES, MOODS_2D, ALL_GESTURES, GESTURE_3D } from './avatar/AvatarStage.js';
export { loadCharacter3D } from './avatar/three.js';
export { VoiceEngine } from './voice/VoiceEngine.js';
export { ProxyLLM } from './llm/ProxyLLM.js';
export { ApuchatBridge, createApuchatActions } from './integrations/apuchat.js';
export { createApumailActions } from './integrations/apumail.js';
export { defineIdentity, identityToWidgetConfig, publicIdentity, toVCard, IDENTITY_DEFAULTS, MEET_AVATARS, MEET_SCENES, OPENAI_VOICES, GROK_VOICES } from './identity/schema.js';
export { randomIdentity, randomName, newSeed, cleanSeed } from './identity/random.js';
import { createFace } from './identity/Face.js';
import { IdentityCard } from './identity/ContactCard.js';
import { defineIdentity } from './identity/schema.js';
export { createFace, IdentityCard };
export {
  createCharacter, renderCharacter, normalizeCharacter, randomCharacter, applyPreset, DEFAULT_CHARACTER,
  CHARACTER_MOODS, CHARACTER_GESTURES, CHARACTER_MORPHS, CHARACTER_EFFECTS, CHARACTER_GESTURE_ALIAS, VISEMES, textToVisemes, SHAPES, EYES, BROWS, MOUTHS, CHEEKS, PATTERNS, FINISHES, ACCESSORIES, ACCESSORY_GROUPS, PRESETS, partLabel,
  resolveCharacter, normalizeMods, normalizeMod, sanitizeSvg, modName, MOD_ANCHORS, MOD_SLOTS, MOD_FACE, MAX_MODS,
} from './character/Character.js';
export { DANCES, DANCE_STYLE, DANCE_BPM } from './character/motion.js';
export { playBeat, BEAT_STYLES } from './character/beat.js';
import { createAvatarEditor, AvatarEditor } from './character/AvatarEditor.js';
import { renderCharacter as _renderCharacter, createCharacter as _createCharacter } from './character/Character.js';
export { createAvatarEditor, AvatarEditor };

export { t, translator, addMessages, addCatalog, resolveLocale, detectLocale, getLocale, setLocale, onLocaleChange, availableLocales, formatNumber, formatList, LOCALES, LOCALE_NAMES, DEFAULT_LOCALE } from './i18n/index.js';
import { t as _t, translator as _translator, addMessages as _addMessages, setLocale as _setLocale, getLocale as _getLocale, LOCALES as _LOCALES } from './i18n/index.js';
export const version = '0.1.0';

let singleton = null;

/**
 * Crea (o devuelve) el agente de la página.
 * @returns {ReturnType<AgentWidget['configure']>['api']}
 */
export function init(config = {}) {
  if (singleton?.widget.isConnected) {
    console.warn('[7ots] ya inicializado; se devuelve la instancia existente');
    return singleton;
  }
  const el = document.createElement('ots-agent');
  // Se inserta antes de configurar para que el Shadow DOM exista y el CSS se aplique.
  (document.body || document.documentElement).appendChild(el);
  el.configure(config);
  singleton = el.api;
  return singleton;
}

/** La instancia actual (o null). */
export function get() {
  return singleton;
}

// Global para el uso con <script> (y para depurar desde la consola).
if (typeof window !== 'undefined') {
  window.SevenOts = Object.assign(window.SevenOts || {}, { init, get, version, createFace, defineIdentity, createAvatarEditor, createCharacter: _createCharacter, renderCharacter: _renderCharacter, i18n: { t: _t, translator: _translator, addMessages: _addMessages, setLocale: _setLocale, getLocale: _getLocale, LOCALES: _LOCALES } });
}
