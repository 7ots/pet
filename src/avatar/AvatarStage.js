/**
 * AvatarStage — el "cuerpo" del agente.
 *
 * Modo 3D: TalkingHead (Three.js) con un modelo .glb con blendshapes ARKit + visemas
 * Oculus (p. ej. los avatares de TalkingHead, Avaturn, o exportados desde Blender).
 * Lip-sync real a partir del audio + tiempos de palabra, estados de ánimo y gestos.
 *
 * Modo 2D (fallback automático): si no hay WebGL o falla la carga del módulo o el .glb, se
 * muestra el personaje 2D (`character`, ver src/character) con lip-sync, ánimos, mirada y
 * gestos; o el retrato (`image`) con un halo que late al hablar; o una cara SVG mínima.
 * `mode: '2d'` fuerza el modo 2D aunque haya WebGL (también si hay `character` y no `url`).
 *
 * Modo '3d-plush': el MISMO personaje (`character`) como peluche/vinilo 3D (src/character3d),
 * con la misma API (habla, ánimos, gestos, metamorfosis y efectos). `material`: 'plush'|'vinyl'.
 * three se trae del CDN aunque la página no tenga importmap (src/avatar/three.js); ante
 * cualquier fallo (sin WebGL, CSP, red) se queda en 2D.
 *
 * Requisito del modo 3D en la página anfitriona (TalkingHead importa "three" por nombre):
 *
 *   <script type="importmap">
 *   { "imports": {
 *       "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
 *       "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
 *   } }
 *   </script>
 *
 * API usada por VoiceEngine:
 *   await stage.speak({ text, audio })   // audio: ArrayBuffer (mp3/wav) → reproduce + lip-sync
 *   await stage.mimic({ text, durationMs })  // sin audio (speechSynthesis): solo mueve la boca
 *   stage.mimicSync(charIndex)              // resincroniza con SpeechSynthesisUtterance.onboundary
 *   stage.stop(); stage.setMood('happy'); stage.gesture('thumbup');
 *   stage.morph('wings') / stage.effect('hearts')   // ot 2D y 3D-plush (transformaciones y efectos)
 *
 * Gestos: en 2D valen todos los de CHARACTER_GESTURES (y sus alias: handup, index, ok…);
 * en 3D se traducen al gesto de TalkingHead más parecido (GESTURE_3D).
 */

export const TALKINGHEAD_URL = 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7.0/modules/talkinghead.mjs';
export const DEFAULT_AVATAR_URL = 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7.0/avatars/brunette.glb';

/** Enums cerrados: el LLM solo puede pedir estos valores (TalkingHead lanza con otros). */
import { createCharacter, CHARACTER_GESTURES, CHARACTER_GESTURE_ALIAS } from '../character/Character.js';
import { loadCharacter3D, ensureImportMap } from './three.js';

export const MOODS = ['neutral', 'happy', 'angry', 'sad', 'fear', 'disgust', 'love', 'sleep'];
export const GESTURES = ['handup', 'index', 'ok', 'thumbup', 'thumbdown', 'side', 'shrug', 'namaste'];
/** Moods que entiende el personaje 2D (los de TalkingHead + 'surprised'). */
export const MOODS_2D = [...MOODS, 'surprised'];
/** Todos los gestos aceptados: los de TalkingHead, los del personaje 2D y sus alias. */
export const ALL_GESTURES = [...new Set([...GESTURES, ...CHARACTER_GESTURES, ...Object.keys(CHARACTER_GESTURE_ALIAS)])];
/** Gesto del personaje 2D → gesto de TalkingHead (3D). Los que no están no tienen equivalente. */
export const GESTURE_3D = {
  wave: 'handup', hi: 'handup', hello: 'handup', celebrate: 'thumbup', thumbsup: 'thumbup', thumbsdown: 'thumbdown',
  point: 'index', nod: 'ok', yes: 'ok', shrug: 'shrug', bow: 'namaste', wiggle: 'side', think: 'index', clap: 'thumbup', cheer: 'thumbup',
};

/**
 * TalkingHead solo trae lip-sync para: en, fi, de, fr, lt.
 * El finés es casi fonético (una letra ≈ un sonido), así que funciona muy bien
 * para español, italiano o portugués. Configurable con `avatar.lipsyncLang`.
 */
const LIPSYNC_MAP = { es: 'fi', it: 'fi', pt: 'fi', ca: 'fi', en: 'en', de: 'de', fr: 'fr', fi: 'fi', lt: 'lt' };

export class AvatarStage {
  /**
   * @param {object} o
   * @param {HTMLElement} o.container  nodo dentro del Shadow DOM del widget
   * @param {object|false} o.config    { url, body:'F'|'M', mood, cameraView, lipsyncLang, module, name, image, face, mode:'2d'|'3d'|'3d-plush', material }
   * @param {string} [o.language]      idioma del agente (para elegir lip-sync)
   */
  constructor({ container, config = {}, language = document.documentElement.lang || 'es' }) {
    this.container = container;
    this.cfg = config === false ? false : {
      url: DEFAULT_AVATAR_URL,
      body: 'F',
      mood: 'neutral',
      cameraView: 'upper',
      module: TALKINGHEAD_URL,
      ...config,
    };
    this.lang = (this.cfg && this.cfg.lipsyncLang) || LIPSYNC_MAP[language.slice(0, 2).toLowerCase()] || 'en';
    this.head = null;
    this.mode = 'none';
    this._ctx = null; // AudioContext propio (modo 2D)
    this._src = null;
    this._mimicTimer = null;
    this._speakTimer = null;
    this._resolveSpeak = null;
  }

  /** Carga el avatar 3D o cae al 2D. Nunca lanza. */
  async load(onProgress) {
    if (this.cfg && this.cfg.mode === '3d-plush' && this.cfg.character && !this.cfg.image) return this._loadPlush();
    if (this.cfg === false || this.cfg.mode === '2d' || this.cfg.mode === '3d-plush' || (this.cfg.character && !this.cfg.url && this.cfg.mode !== '3d')) return this._load2D();
    if (!hasWebGL()) {
      console.info('[7ots] el navegador no tiene WebGL: avatar 2D');
      return this._load2D();
    }
    try {
      ensureImportMap(); // TalkingHead importa "three" por nombre
      const { TalkingHead } = await import(/* @vite-ignore */ /* webpackIgnore: true */ this.cfg.module);
      this.head = new TalkingHead(this.container, {
        ttsEndpoint: '', // no usamos el TTS de Google de TalkingHead: el audio viene de VoiceEngine
        lipsyncModules: [this.lang],
        lipsyncLang: this.lang,
        cameraView: this.cfg.cameraView,
        avatarMood: this.cfg.mood,
        modelFPS: 30,
      });
      await this.head.showAvatar(
        { url: this.cfg.url, body: this.cfg.body, avatarMood: this.cfg.mood, lipsyncLang: this.lang },
        (ev) => onProgress?.(ev.lengthComputable ? ev.loaded / ev.total : null),
      );
      this.mode = '3d';
      // Ahorra batería: pausa el render cuando la pestaña no se ve.
      this._vis = () => (document.hidden ? this.head?.stop() : this.head?.start());
      document.addEventListener('visibilitychange', this._vis);
    } catch (err) {
      console.warn('[7ots] avatar 3D no disponible, uso 2D:', err?.message || err);
      try { this.head?.dispose?.(); } catch {}
      this.head = null;
      this.container.replaceChildren();
      this._load2D();
    }
    return this.mode;
  }

  /** El ot como peluche 3D (misma spec que el 2D). Nunca lanza: ante cualquier fallo, 2D. */
  async _loadPlush() {
    const token = (this._plushToken = {});
    if (!hasWebGL()) return this._load2D();
    try {
      const m = await loadCharacter3D();
      if (this._plushToken !== token || !this.cfg) return this.mode; // otro load/dispose entre medias
      this._ch?.destroy();
      this.container.replaceChildren();
      this._mouth = null;
      this._face = null;
      const ch = m.createCharacter3D(this.container, this.cfg.character, {
        material: this.cfg.material === 'vinyl' ? 'vinyl' : 'plush',
        orbit: this.cfg.orbit === true,
        quality: this.cfg.quality || 'high',
        // escenario propio por encima del panel del widget (z-index 2147483000)
        stage: { key: 'overlay', zIndex: 2147483001, maxDpr: 1.5 },
      });
      this._ch = ch;
      this.mode = ch.fallback ? '2d' : '3d-plush';
      if (this.cfg.mood) ch.mood(this.cfg.mood, { fx: false });
    } catch (err) {
      console.warn('[7ots] ot 3D no disponible, uso 2D:', err?.message || err);
      this._ch?.destroy?.();
      this._ch = null;
      this.container.replaceChildren();
      this._load2D();
    }
    return this.mode;
  }

  _load2D() {
    this.mode = '2d';
    this._ch?.destroy();
    this._ch = null;
    const character = this.cfg && this.cfg.character;
    if (character && !this.cfg.image) {
      this.container.replaceChildren();
      this._mouth = null;
      this._face = null;
      this._ch = createCharacter(this.container, character, { title: '' });
      if (this.cfg.mood) this._ch.mood(this.cfg.mood);
      return this.mode;
    }
    const image = this.cfg && this.cfg.image;
    if (image) {
      this.container.innerHTML = `<div class="ots-portrait"><img alt="" referrerpolicy="no-referrer"></div>`;
      const img = this.container.querySelector('img');
      img.onerror = () => this._drawFace(); // retrato roto → cara dibujada
      img.src = image;
      this._mouth = null;
      this._face = this.container.querySelector('.ots-portrait');
      return this.mode;
    }
    return this._drawFace();
  }

  _drawFace() {
    this.mode = '2d';
    const f = (this.cfg && this.cfg.face) || {};
    const vars = [f.skin && `--face-bg:${f.skin}`, f.eyes && `--face-fg:${f.eyes}`].filter(Boolean).join(';');
    this.container.innerHTML = `
      <svg class="ots-face" viewBox="0 0 120 120" aria-hidden="true"${vars ? ` style="${vars}"` : ''}>
        <circle cx="60" cy="60" r="54" class="ots-face-bg"/>
        <g class="ots-eyes"><ellipse cx="42" cy="50" rx="6" ry="8"/><ellipse cx="78" cy="50" rx="6" ry="8"/></g>
        <ellipse class="ots-mouth" cx="60" cy="82" rx="16" ry="2"/>
      </svg>`;
    this._mouth = this.container.querySelector('.ots-mouth');
    this._face = this.container.querySelector('.ots-face');
    return this.mode;
  }

  _mouthOpen(v) {
    const x = Math.max(0, Math.min(1, v));
    this._mouth?.setAttribute('ry', String(2 + x * 12));
    this._ch?.mouth(x);
    this.container.style.setProperty('--ots-talk', x.toFixed(2)); // halo del retrato
  }

  /**
   * Cambia retrato / colores de la cara en caliente (identidad nueva). En 3D solo se guardan
   * para un futuro fallback: cambiar el .glb requiere recargar el avatar (reload()).
   */
  setLook({ image, face, character } = {}) {
    if (!this.cfg) return;
    if (image !== undefined) this.cfg.image = image;
    if (face !== undefined) this.cfg.face = face;
    if (character !== undefined) this.cfg.character = character;
    if (this._ch && character && image === undefined) return void this._ch.update(character, { material: this.cfg.material });
    if (this.mode === '2d') this._load2D();
  }

  /**
   * Aplica el aspecto de una identidad nueva: recarga si cambia entre 2D y 3D o el .glb/cuerpo,
   * y si no, actualiza en caliente. Devuelve el modo resultante.
   */
  async applyLook(look = {}) {
    if (!this.cfg) return this.mode;
    const plush = look.mode === '3d-plush' && !!look.character && !look.image;
    const want3d = !plush && (look.mode === '3d' || (look.mode !== '2d' && !!look.url));
    if (this.mode === 'none') {
      Object.assign(this.cfg, { image: '', character: null }, look);
      return this.mode;
    }
    const next = { image: '', character: null, ...look };
    const isPlush = this.mode === '3d-plush';
    if (plush !== isPlush || want3d !== (this.mode === '3d') || (this.mode === '3d' && ((look.url || '') !== (this.cfg.url || '') || (look.body && look.body !== this.cfg.body)))) {
      return this.reload(next);
    }
    Object.assign(this.cfg, next);
    if (isPlush) {
      this._ch.update(next.character, { material: next.material === 'vinyl' ? 'vinyl' : 'plush' });
      if (next.mood) this.setMood(next.mood);
    } else if (this.mode === '2d') {
      if (this._ch && next.character && !next.image) this._ch.update(next.character);
      else this._load2D();
      if (next.mood) this.setMood(next.mood);
    }
    return this.mode;
  }

  /** Vuelve a cargar el avatar con otra configuración (p. ej. otro .glb). */
  async reload(config = {}, onProgress) {
    const next = { ...(this.cfg || {}), ...config };
    this.dispose();
    this._ctx = null; // dispose() lo cerró
    this._vis = null;
    this.cfg = next;
    this.mode = 'none';
    return this.load(onProgress);
  }

  /** AudioContext compartido; debe reanudarse tras un gesto del usuario (autoplay). */
  audioContext() {
    if (this.head?.audioCtx) return this.head.audioCtx;
    this._ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  }

  async unlockAudio() {
    try { await this.audioContext().resume(); } catch {}
  }

  /**
   * Reproduce audio TTS con lip-sync. Resuelve cuando termina (o al llamar stop()).
   * @param {{text:string, audio:ArrayBuffer}} o
   */
  async speak({ text, audio }) {
    this.stop();
    const ctx = this.audioContext();
    await ctx.resume().catch(() => {});
    const buffer = await ctx.decodeAudioData(audio.slice(0));
    const ms = buffer.duration * 1000;

    if (this.mode === '3d') {
      const timing = wordTimings(text, ms);
      this.head.speakAudio({ audio: buffer, ...timing }, { lipsyncLang: this.lang });
      return this._waitFor(ms + 300);
    }

    // 2D: reproducimos nosotros y animamos la boca con un analizador.
    const src = ctx.createBufferSource();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.buffer = buffer;
    src.connect(analyser).connect(ctx.destination);
    this._src = src;
    if (this._ch) {
      // Personaje 2D: lip-sync por energía + timbre (con auto-ganancia), mezclado con los visemas del texto.
      this._lipStop = this._ch.lipsync(analyser, { text, durationMs: ms });
    } else {
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (this._src !== src) return this._mouthOpen(0);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        this._mouthOpen(Math.sqrt(sum / data.length) * 4);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    return new Promise((resolve) => {
      this._resolveSpeak = resolve;
      src.onended = () => {
        if (this._src === src) this._src = null;
        this._lipStop?.();
        this._lipStop = null;
        this._mouthOpen(0);
        resolve();
      };
      src.start();
    });
  }

  /**
   * Mueve la boca sin audio propio (cuando la voz es speechSynthesis del navegador).
   * En 3D se pasa a TalkingHead un buffer silencioso con los tiempos estimados.
   */
  mimic({ text, durationMs }) {
    this.stop();
    if (this.mode === '3d') {
      const ctx = this.audioContext();
      const silent = ctx.createBuffer(1, Math.max(1, Math.ceil((durationMs / 1000) * ctx.sampleRate)), ctx.sampleRate);
      this.head.speakAudio({ audio: silent, ...wordTimings(text, durationMs) }, { lipsyncLang: this.lang });
      return;
    }
    if (this._ch) {
      // Personaje 2D: visemas a partir del texto, repartidos en la duración estimada.
      this._speech = this._ch.speak(text || durationMs, { durationMs });
      return;
    }
    const t0 = performance.now();
    const loop = () => {
      const t = performance.now() - t0;
      if (t > durationMs) return this._mouthOpen(0);
      this._mouthOpen(0.35 + 0.35 * Math.sin(t / 70) * Math.sin(t / 190));
      this._mimicTimer = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * Resincroniza el lip-sync 2D con la posición real de la voz del navegador
   * (SpeechSynthesisUtterance.onboundary → e.charIndex).
   */
  mimicSync(charIndex) {
    this._speech?.sync?.(charIndex);
  }

  stop() {
    try { this.head?.stopSpeaking(); } catch {}
    this._speech?.stop?.();
    this._speech = null;
    this._lipStop?.();
    this._lipStop = null;
    if (this._src) {
      try { this._src.stop(); } catch {}
      this._src = null;
    }
    cancelAnimationFrame(this._mimicTimer);
    clearTimeout(this._speakTimer);
    this._resolveSpeak?.();
    this._resolveSpeak = null;
    this._mouthOpen(0);
  }

  setMood(mood) {
    if (!MOODS_2D.includes(mood)) return false;
    if (this.mode === '3d') {
      if (!MOODS.includes(mood)) mood = 'happy'; // TalkingHead no tiene 'surprised'
      try { this.head.setMood(mood); } catch { return false; }
    } else if (this._ch) {
      this._ch.mood(mood);
    } else if (this._face) {
      this._face.dataset.mood = mood;
    }
    return true;
  }

  /**
   * @param {string} name  gesto de ALL_GESTURES
   * @param {number} [seconds]  duración (en 2D, si no se indica, cada gesto usa la suya)
   * @param {boolean} [mirror] con la otra mano (p. ej. para señalar a la izquierda)
   */
  gesture(name, seconds, mirror = false) {
    if (!ALL_GESTURES.includes(name)) return false;
    if (this.mode === '3d') {
      const g = GESTURES.includes(name) ? name : GESTURE_3D[name];
      if (!g) return false;
      try { this.head.playGesture(g, seconds ?? 2.5, mirror); } catch { return false; }
      return true;
    }
    if (!this._ch) return false;
    return this._ch.gesture(name, { mirror, ...(seconds ? { ms: seconds * 1000 } : {}) });
  }

  /** Transformación temporal del ot ('wings', 'spikes', 'hands', 'shape:heart'…), 2D o 3D-plush. No hace nada con TalkingHead. */
  morph(name, opts) {
    return this._ch ? this._ch.morph(name, opts) : false;
  }

  /** Efecto del ot ('hearts', 'sparkles', 'zzz'…), 2D o 3D-plush. No hace nada con TalkingHead. */
  effect(name, opts) {
    return this._ch ? this._ch.effect(name, opts) : false;
  }

  /** Mira hacia un punto de la pantalla (coordenadas de viewport) durante `ms`. */
  lookAt(x, y, ms = 1500) {
    if (this.mode === '3d') {
      try { this.head.lookAt(x, y, ms); } catch {}
      return;
    }
    if (this._ch) {
      this._ch.lookAtPoint(x, y);
      clearTimeout(this._lookTimer);
      this._lookTimer = setTimeout(() => this._ch?.lookAt(0, 0), ms);
      return;
    }
    const eyes = this._face?.querySelector('.ots-eyes');
    if (!eyes) return;
    const r = this._face.getBoundingClientRect();
    const k = (v, c, size) => Math.max(-5, Math.min(5, ((v - c) / Math.max(size, 1)) * 6));
    eyes.style.transition = 'transform .25s';
    eyes.style.transform = `translate(${k(x, r.left + r.width / 2, r.width)}px, ${k(y, r.top + r.height / 2, r.height)}px)`;
    clearTimeout(this._lookTimer);
    this._lookTimer = setTimeout(() => (eyes.style.transform = ''), ms);
  }

  /** Aplica las etiquetas [[happy]] / [[thumbup]] de una respuesta y devuelve el texto limpio. */
  applyExpressions(text) {
    const { clean, moods, gestures } = extractExpressions(text);
    if (moods.length) this.setMood(moods[moods.length - 1]);
    if (gestures.length) this.gesture(gestures[0]);
    return clean;
  }

  _waitFor(ms) {
    return new Promise((resolve) => {
      this._resolveSpeak = resolve;
      this._speakTimer = setTimeout(() => {
        this._resolveSpeak = null;
        resolve();
      }, ms);
    });
  }

  dispose() {
    this._plushToken = null;
    this.stop();
    if (this._vis) document.removeEventListener('visibilitychange', this._vis);
    try { this.head?.dispose?.(); } catch {}
    this.head = null;
    this._ch?.destroy();
    this._ch = null;
    this._ctx?.close().catch(() => {});
    this.container.replaceChildren();
  }
}

// ───────────────────────────── helpers ─────────────────────────────

/** Separa las etiquetas de expresión [[...]] del texto. */
export function extractExpressions(text) {
  const moods = [];
  const gestures = [];
  const clean = String(text || '')
    .replace(/\[\[\s*([a-z]+)\s*\]\]/gi, (m, tag) => {
      const t = tag.toLowerCase();
      if (MOODS_2D.includes(t)) moods.push(t);
      else if (ALL_GESTURES.includes(t)) gestures.push(t);
      return '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { clean, moods, gestures };
}

/**
 * Estima cuándo empieza y cuánto dura cada palabra repartiendo la duración total
 * proporcionalmente a la longitud de las palabras (+ pausas en signos de puntuación).
 * Es suficiente para un lip-sync creíble sin necesitar timestamps del proveedor TTS.
 */
export function wordTimings(text, totalMs) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return { words: [], wtimes: [], wdurations: [] };
  const weight = (w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1 + (/[.,;:!?…]$/.test(w) ? 3 : 0);
  const total = words.reduce((s, w) => s + weight(w), 0);
  const lead = Math.min(150, totalMs * 0.03); // silencio inicial típico de los TTS
  const span = Math.max(1, totalMs - lead * 2);
  const wtimes = [];
  const wdurations = [];
  let t = lead;
  for (const w of words) {
    const d = (weight(w) / total) * span;
    const pause = /[.,;:!?…]$/.test(w) ? d * 0.3 : 0;
    wtimes.push(Math.round(t));
    wdurations.push(Math.round(d - pause));
    t += d;
  }
  return { words, wtimes, wdurations };
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
