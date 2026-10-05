/**
 * VoiceEngine — voz de salida (TTS) y de entrada (STT).
 *
 * TTS, cadena de respaldo:
 *   1. 'proxy'   → POST {endpoint}/tts  {text, lang}  → audio (mp3). El proxy usa audio de apuchat,
 *                  ElevenLabs, xAI (Grok), Fish Audio u OpenAI con claves del servidor. Mejor calidad + lip-sync exacto.
 *   2. 'browser' → speechSynthesis del navegador (gratis, sin red). El avatar imita la boca.
 *   3. false     → sin voz, solo texto.
 * Si el paso 1 falla, se usa automáticamente el 2.
 *
 * STT: Web Speech API (Chrome/Edge/Safari). Pulsar para hablar; el texto reconocido
 * se envía como mensaje del usuario con source:'voice'.
 *
 * Las frases se encolan: si llega otra respuesta mientras habla, se dice después.
 * `interrupt()` corta todo (p. ej. cuando el usuario empieza a hablar: barge-in).
 */

import { toSpeech } from '../ui/markdown.js';
import { acceptLanguage } from '../llm/ProxyLLM.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

export class VoiceEngine {
  /**
   * @param {object} o
   * @param {import('../core/EventBus.js').EventBus} o.bus
   * @param {import('../avatar/AvatarStage.js').AvatarStage} o.avatar
   * @param {object} o.config   { tts:'proxy'|'browser'|false, stt:boolean, voice, rate, pitch, lang, endpoint, siteKey }
   * @param {ReturnType<import('../core/storage.js').createStore>} o.store
   * @param {(key: string, vars?: object) => string} [o.t]  traductor de los avisos; su `locale`
   *   viaja en Accept-Language hacia /tts
   */
  constructor({ bus, avatar, config = {}, store, t = translator() }) {
    this.bus = bus;
    this.t = t;
    this.avatar = avatar;
    this.store = store;
    this.cfg = { tts: 'proxy', stt: true, rate: 1.05, pitch: 1, lang: document.documentElement.lang || 'es-ES', ...config };
    this.muted = store.get('muted', false);
    this._queue = [];
    this._speaking = false;
    this._gen = 0; // se incrementa en interrupt() para descartar trabajo en curso
    this._rec = null;
    this.listening = false;
  }

  get canListen() {
    return !!(this.cfg.stt && (window.SpeechRecognition || window.webkitSpeechRecognition));
  }

  /** Cambia voz, idioma, velocidad o tono en caliente (p. ej. identidad nueva). */
  configure(patch = {}) {
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) this.cfg[k] = v;
    if (patch.tts !== undefined) this._proxyBroken = false;
  }

  setMuted(on) {
    this.muted = on;
    this.store.set('muted', on);
    if (on) this.interrupt();
  }

  /** Encola un texto para decirlo en voz alta. Resuelve cuando se terminó de decir. */
  say(text) {
    const clean = toSpeech(text);
    if (!clean || this.muted || this.cfg.tts === false) return Promise.resolve();
    return new Promise((resolve) => {
      this._queue.push({ text: clean, resolve });
      this._drain();
    });
  }

  interrupt() {
    this._gen++;
    for (const q of this._queue) q.resolve();
    this._queue = [];
    try { speechSynthesis.cancel(); } catch {}
    this.avatar?.stop();
  }

  async _drain() {
    if (this._speaking) return;
    this._speaking = true;
    this.bus.emit('voice:start', {});
    while (this._queue.length) {
      const { text, resolve } = this._queue.shift();
      const gen = this._gen;
      try {
        await this._speakOne(text, gen);
      } catch (err) {
        console.warn('[7ots] voz falló:', err?.message || err);
      }
      resolve();
    }
    this._speaking = false;
    this.bus.emit('voice:end', {});
  }

  async _speakOne(text, gen) {
    if (this.cfg.tts === 'proxy' && this.cfg.endpoint && !this._proxyBroken) {
      try {
        const audio = await this._fetchTts(text);
        if (gen !== this._gen) return;
        if (this.avatar) return await this.avatar.speak({ text, audio });
        return await playRaw(audio);
      } catch (err) {
        // 404/501 = el proxy no tiene TTS configurado: no volver a intentarlo.
        if (err.status === 404 || err.status === 501) this._proxyBroken = true;
        console.warn('[7ots] TTS del proxy no disponible, uso la voz del navegador');
      }
    }
    if (gen !== this._gen) return;
    return this._speakBrowser(text);
  }

  async _fetchTts(text) {
    const res = await fetch(`${this.cfg.endpoint.replace(/\/$/, '')}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.cfg.siteKey ? { 'X-Site-Key': this.cfg.siteKey } : {}), ...acceptLanguage(this.t.locale) },
      body: JSON.stringify({ text, lang: this.cfg.lang }),
    });
    if (!res.ok) {
      const e = new Error(`TTS ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return res.arrayBuffer();
  }

  _speakBrowser(text) {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.cfg.lang;
      u.rate = this.cfg.rate;
      u.pitch = this.cfg.pitch ?? 1;
      const voice = pickVoice(this.cfg.lang, this.cfg.voice);
      if (voice) u.voice = voice;
      // Estimación de duración (~14 caracteres/s a rate 1) para el lip-sync imitado.
      const durationMs = (text.length / 14 / u.rate) * 1000;
      u.onstart = () => this.avatar?.mimic({ text, durationMs });
      // Cada límite de palabra corrige la deriva entre la estimación y la voz real.
      u.onboundary = (e) => this.avatar?.mimicSync?.(e.charIndex);
      u.onend = u.onerror = () => {
        this.avatar?.stop();
        resolve();
      };
      speechSynthesis.speak(u);
    });
  }

  // ─────────────────────────── STT ───────────────────────────

  /**
   * Empieza a escuchar. `onPartial` recibe el texto provisional; resuelve con el
   * texto final (o '' si no se entendió nada).
   */
  listen({ onPartial } = {}) {
    if (!this.canListen) return Promise.resolve('');
    this.interrupt(); // barge-in: si el agente hablaba, se calla
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = this.cfg.lang;
    rec.interimResults = true;
    rec.continuous = false;
    this._rec = rec;
    this.listening = true;
    this.bus.emit('voice:listen', { on: true });
    let finalText = '';
    return new Promise((resolve) => {
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        onPartial?.((finalText + interim).trim());
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed') this.bus.emit('agent:error', { error: new Error(this.t('widget.voice.micDenied')) });
      };
      rec.onend = () => {
        this.listening = false;
        this._rec = null;
        this.bus.emit('voice:listen', { on: false });
        resolve(finalText.trim());
      };
      try {
        rec.start();
      } catch {
        rec.onend();
      }
    });
  }

  stopListening() {
    try { this._rec?.stop(); } catch {}
  }
}

function pickVoice(lang, preferred) {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (preferred) {
    const v = voices.find((v) => v.name === preferred || v.voiceURI === preferred);
    if (v) return v;
  }
  const base = lang.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase() && /natural|neural|google|online/i.test(v.name)) ||
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

async function playRaw(arrayBuffer) {
  const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }));
  const a = new Audio(url);
  try {
    await a.play();
    await new Promise((r) => (a.onended = r));
  } finally {
    URL.revokeObjectURL(url);
  }
}
