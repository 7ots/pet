/**
 * AgentWidget — el Web Component <ots-agent> que une todas las piezas.
 *
 *   ┌──────────────── página anfitriona ────────────────┐
 *   │  DOM del sitio ◄── ContextManager (lee)           │
 *   │        ▲                                          │
 *   │        └──── ActionRegistry (actúa: click, form…) │
 *   │  <div data-ots-root="overlay">  ◄── UIManager     │  modales / sidebars / toasts
 *   │  <ots-agent> #shadow-root  ◄── este archivo       │  burbuja + panel + avatar + chat
 *   └───────────────────────────────────────────────────┘
 *
 *   usuario ─► AgentBrain ─► ProxyLLM ─► /api/agent/chat (tu servidor) ─► Claude / OpenAI
 *                  │
 *                  ├─► ActionRegistry ─► builtins · tus acciones · MCP del sitio · apumail · apuchat
 *                  └─► VoiceEngine ─► AvatarStage (TalkingHead 3D / cara 2D)
 *
 * Todo el CSS vive en el Shadow DOM: el sitio no rompe el widget y el widget no rompe el sitio.
 * El widget y el overlay llevan data-ots-root, así el agente nunca se "lee" a sí mismo.
 *
 * Normalmente no se usa directamente: SevenOts.init(config) (src/index.js) lo crea.
 * También puede declararse en HTML: <ots-agent endpoint="/api/agent" name="Ana" locale="en"></ots-agent>
 *
 * Idioma: los textos del widget salen del catálogo src/i18n/messages/widget.js (claves `widget.*`).
 * `locale` fija el idioma; sin él se usa <html lang> y luego el navegador. Se cambia en caliente
 * con agent.setLocale('pt'). El modelo contesta en el idioma en que le escriba el visitante.
 */

import { EventBus } from './EventBus.js';
import { createStore } from './storage.js';
import { AgentBrain } from './AgentBrain.js';
import { Proactivity } from './Proactivity.js';
import { ContextManager } from '../context/ContextManager.js';
import { ActionRegistry } from '../actions/ActionRegistry.js';
import { createBuiltinActions } from '../actions/builtins.js';
import { AuthManager } from '../auth/AuthManager.js';
import { UIManager } from '../ui/UIManager.js';
import { VirtualPointer } from '../ui/VirtualPointer.js';
import { PageTools } from '../actions/PageTools.js';
import { renderMarkdown, escapeHtml } from '../ui/markdown.js';
import { ProxyLLM } from '../llm/ProxyLLM.js';
import { AvatarStage, extractExpressions } from '../avatar/AvatarStage.js';
import { Companion, createCompanionActions } from '../ui/Companion.js';
import { VoiceEngine } from '../voice/VoiceEngine.js';
import { createApumailActions } from '../integrations/apumail.js';
import { ApuchatBridge, createApuchatActions } from '../integrations/apuchat.js';
import { defineIdentity, identityToWidgetConfig } from '../identity/schema.js';
import { actionTitle } from '../actions/ActionRegistry.js';
import { acceptLanguage } from '../llm/ProxyLLM.js';
import { translator, detectLocale } from '../i18n/index.js';
import '../i18n/messages/widget.js';

// Las etiquetas de los chips de acciones (antes ACTION_LABELS) viven en el catálogo: widget.actions.<nombre>.

/** Acciones que tocan un elemento: en modo compañero, el avatar se acerca a él. */
const FOLLOW_ACTIONS = new Set(['click', 'hover', 'type_text', 'press_key', 'drag_and_drop', 'fill_form', 'highlight', 'scroll_to', 'read_element']);

const DEFAULTS = {
  endpoint: '/api/agent',
  siteKey: null,
  llm: null,
  // name: null → widget.defaultName en el idioma del widget ('Asistente', 'Assistant'…)
  agent: { name: null, role: 'asistente virtual', language: null, instructions: '', expressive: true },
  // Idioma de la interfaz: 'es' | 'en' | 'pt' (o 'en-GB', 'pt-PT'…). null → <html lang> y luego el
  // navegador; un idioma sin catálogo cae a inglés. También es el idioma por defecto de las respuestas
  // y de la voz (si voice.lang no se da: es→es-ES, en→en-US, pt→pt-BR, respetando la región).
  locale: null,
  avatar: {},
  voice: {},
  auth: {},
  context: {},
  navigation: {},
  proactive: {},
  actions: [],
  mcp: [],
  templates: {},
  contact: { apuchat: true, apumail: true },
  theme: {},
  open: false,
  confirmClicks: 'submit',
  pointer: {},
  pageTools: true,
  mode: 'panel', // 'panel' | 'companion' (el avatar se pasea por la página)
  companion: {},
  namespace: 'default',
  identity: null, // objeto de identidad, URL de una tarjeta, o true = {endpoint}/identity
};

export class AgentWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._started = false;
    this._offs = [];
  }

  /** Config por atributos para el uso declarativo en HTML. */
  connectedCallback() {
    this.setAttribute('data-ots-root', 'widget');
    if (!this._started && !this._pendingConfig) {
      // Espera un tick: SevenOts.init() llama a configure() justo después de insertar.
      queueMicrotask(() => {
        if (this._started) return;
        const a = (n) => this.getAttribute(n);
        this.configure({
          endpoint: a('endpoint') || undefined,
          siteKey: a('site-key') || undefined,
          identity: a('identity') === '' || a('identity') === 'true' ? true : a('identity') || undefined,
          locale: a('locale') || undefined,
          agent: { name: a('name') || undefined, siteName: a('site-name') || undefined },
          avatar: a('avatar') === 'false' ? false : a('avatar-url') ? { url: a('avatar-url') } : {},
        });
      });
    }
  }

  disconnectedCallback() {
    // Solo si lo quitan del DOM de verdad (no en un re-parenting).
    queueMicrotask(() => { if (!this.isConnected) this.destroy(); });
  }

  /**
   * Arranca el agente con la configuración dada. Solo se ejecuta una vez.
   * @param {object} userConfig  ver DEFAULTS y README
   */
  configure(userConfig = {}) {
    if (this._started) return this;
    this._started = true;
    // Identidad: lo que el sitio pase explícitamente en init() manda sobre ella.
    const idSrc = userConfig.identity;
    this._userConfig = userConfig;
    this.identity = idSrc && typeof idSrc === 'object' ? defineIdentity(idSrc) : null;
    const base = this.identity ? mergeConfig(DEFAULTS, identityToWidgetConfig(this.identity)) : DEFAULTS;
    const cfg = (this.config = mergeConfig(base, userConfig));

    // ── idioma ──
    // this.t es estable (los componentes lo guardan) y delega en el traductor del idioma actual,
    // así setLocale() llega a todos sin recrearlos. t.locale viaja como Accept-Language.
    this._t = translator(detectLocale(cfg.locale));
    const t = (this.t = (key, vars) => this._t(key, vars));
    Object.defineProperty(t, 'locale', { get: () => this._t.locale });
    t.has = (key) => this._t.has(key);
    this._autoName = !cfg.agent.name;
    if (this._autoName) cfg.agent.name = t('widget.defaultName');
    // Voz: la de la config (o la identidad) manda; si no hay, se deriva del idioma del widget.
    this._voiceLangAuto = cfg.voice !== false && !cfg.voice?.lang;
    const lang = this._voiceLangAuto ? voiceLangFor(t.locale, [cfg.locale, cfg.agent.language]) : cfg.voice?.lang || voiceLangFor(t.locale);

    // ── núcleo ──
    this.bus = new EventBus();
    this.store = createStore(cfg.namespace);
    this.auth = new AuthManager({ bus: this.bus, config: cfg.auth });
    this.ui = new UIManager({ bus: this.bus, theme: cfg.theme, t });
    this.context = new ContextManager({ bus: this.bus, ...cfg.context });
    // Ratón y teclado del agente. pointer:false → sin herramientas de ratón (click instantáneo).
    this.pointer =
      cfg.pointer === false
        ? null
        : new VirtualPointer({
            name: cfg.agent.name,
            color: cfg.theme.primary || '#4f46e5',
            t,
            ...cfg.pointer,
            onCancel: () => {
              this.brain?.abort();
              this.ui.toast({ message: t('widget.pointer.stopped'), type: 'info' });
            },
          });
    this.actions = new ActionRegistry({ bus: this.bus, auth: this.auth, ui: this.ui, context: this.context, pointer: this.pointer, agent: null, t });
    this.llm = cfg.llm || new ProxyLLM({ endpoint: cfg.endpoint, siteKey: cfg.siteKey, locale: () => t.locale });

    this.brain = new AgentBrain({
      llm: this.llm,
      actions: this.actions,
      context: this.context,
      auth: this.auth,
      bus: this.bus,
      store: this.store,
      t,
      persona: {
        ...cfg.agent,
        locale: t.locale,
        siteName: cfg.agent.siteName || document.title.split(/[|–—-]/)[0].trim(),
        instructions: [
          cfg.agent.instructions,
          cfg.mode === 'companion'
            ? 'Modo compañero: tu avatar vive SOBRE la página, no solo en el chat. Cuando hables de algo que está en pantalla, ve y señálalo con point_at (mensaje de una frase); para explicar varias cosas usa tour. Sé cercano y juguetón, pero breve.'
            : '',
        ].filter(Boolean).join('\n'),
      },
    });

    // ── acciones ──
    const excluded = new Set(cfg.builtins?.exclude || []);
    this.actions.registerMany(
      createBuiltinActions({
        navigation: cfg.navigation,
        confirmClicks: cfg.builtins?.confirmClicks ?? cfg.confirmClicks,
        beforeNavigate: (url, reason) => this._beforeNavigate(url, reason),
        pointer: this.pointer,
        t,
      }).filter((a) => !excluded.has(a.name)),
    );
    // Herramientas declaradas en el HTML del sitio (data-ots-tool), se actualizan con la página.
    this.pageTools = cfg.pageTools === false ? null : new PageTools({ actions: this.actions, context: this.context, bus: this.bus, pointer: this.pointer, t });
    const getTranscript = () => this.brain.transcript();
    this.apuchat = null;
    if (cfg.contact?.apumail) {
      const o = typeof cfg.contact.apumail === 'object' ? cfg.contact.apumail : {};
      this.actions.registerMany(createApumailActions({ endpoint: cfg.endpoint, siteKey: cfg.siteKey, getTranscript, t, ...o }));
    }
    if (cfg.contact?.apuchat) {
      this.apuchat = new ApuchatBridge({ endpoint: cfg.endpoint, siteKey: cfg.siteKey, bus: this.bus, store: this.store, t });
      this.actions.registerMany(createApuchatActions({ endpoint: cfg.endpoint, siteKey: cfg.siteKey, bridge: this.apuchat, getTranscript, t }));
    }
    for (const def of cfg.actions) this.actions.register(def);
    for (const [name, fn] of Object.entries(cfg.templates)) this.ui.registerTemplate(name, fn);

    // ── interfaz ──
    this._render();
    this.avatar = cfg.avatar === false ? null : new AvatarStage({ container: this.$('.stage'), config: cfg.avatar, language: lang });
    // Modo compañero: el avatar sale del panel y flota sobre la página.
    this.companion = null;
    if (cfg.mode === 'companion') {
      this.companion = new Companion({
        root: this.shadowRoot,
        stage: this.avatar ? this.$('.stage') : null,
        avatar: this.avatar,
        ui: this.ui,
        name: cfg.agent.name,
        t,
        side: cfg.theme.position === 'left' ? 'left' : 'right',
        config: cfg.companion,
        speak: (text) => (this.voice && !this.voice.muted ? this.voice.say(text) : Promise.reject()),
        onActivate: () => (this.isOpen ? this.close() : this.open()),
        panelOpen: () => this.isOpen,
      });
      this.shadowRoot.host.classList.add('companion');
      this.$('.launcher').hidden = true;
      this.$('.stage-wrap').hidden = true;
      this.actions.registerMany(createCompanionActions(this.companion, { t }));
      this.companion.mount();
      if (!this.avatar) this.companion.el.querySelector('.b-stage').innerHTML = `<span class="b-initial">${escapeHtml(cfg.agent.name.slice(0, 1))}</span>`;
    }
    this.voice =
      cfg.voice === false
        ? null
        : new VoiceEngine({
            bus: this.bus,
            avatar: this.avatar,
            store: this.store,
            t,
            config: { endpoint: cfg.endpoint, siteKey: cfg.siteKey, lang, ...cfg.voice },
          });
    this.proactivity =
      cfg.proactive === false
        ? null
        : new Proactivity({
            bus: this.bus,
            brain: this.brain,
            context: this.context,
            store: this.store,
            config: { ...cfg.proactive, greet: cfg.proactive.greet !== false && !this.brain.history.length },
          });

    // Vida propia del compañero y ancla de las tarjetas.
    this.ui.cardAnchor = () => this.companion?.el.querySelector('.b-body') || (this.isOpen ? this.$('.panel') : null);
    if (this.companion) {
      this.companion.canWander = () => !this.brain.busy && !this.isOpen;
      const pc = this.proactivity?.cfg;
      if (pc) this.companion.setBehavior({ wanderMs: cfg.companion.wanderMs ?? pc.wanderMs, watchCursor: cfg.companion.watchCursor ?? pc.watchCursor });
      this._offs.push(
        this.bus.on('proactive:level', ({ config: c }) => this.companion.setBehavior({ wanderMs: c.wanderMs, watchCursor: c.watchCursor })),
      );
    }

    this.actions.deps.agent = this.api = createPublicApi(this);
    // Identidad remota: el avatar espera a tenerla (así no carga dos .glb) como mucho 3 s.
    if (idSrc === true || typeof idSrc === 'string') {
      const url = idSrc === true ? `${cfg.endpoint.replace(/\/$/, '')}/identity` : idSrc;
      this._identityReady = Promise.race([
        fetch(url, { credentials: 'omit', headers: acceptLanguage(t.locale) })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`identidad ${r.status}`))))
          .then((id) => this.setIdentity(id))
          .catch((e) => console.warn('[7ots] no se pudo cargar la identidad:', e.message)),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    }
    this._wireEvents();
    this.context.start();
    this.ui.mount();
    this.pageTools?.start();

    // ── restaurar estado tras navegar de página ──
    for (const m of this.brain.transcript()) this._addMessage(m.from, m.text, { name: m.name, restore: true });
    const pending = this.store.get('pendingNav', null);
    this.store.remove('pendingNav');
    if (this.store.get('open', cfg.open)) this.open({ focus: false });
    if (this.apuchat?.active) {
      this.apuchat.resume();
      this._setHandoff(true);
    }

    // MCP del sitio: se conecta en segundo plano (y se reconecta si cambia la sesión).
    this._connectMcp();

    const boot = async () => {
      if (this.companion) this._loadAvatar(); // el compañero se ve siempre: carga ya el avatar
      this.proactivity?.start();
      if (pending && Date.now() - pending.at < 60000) {
        await this.brain.notify(
          `La navegación a ${location.pathname} terminó (motivo: ${pending.reason || 'petición del usuario'}). ` +
            'Continúa con la tarea que el usuario pidió, usando el contexto de esta página. Si ya está completa, díselo en una frase.',
          { allowNoop: false },
        );
      }
    };
    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot, { once: true });

    this.bus.emit('ready', { api: this.api });
    return this;
  }

  $(sel) {
    return this.shadowRoot.querySelector(sel);
  }

  /**
   * Aplica una identidad en caliente: nombre, papel, idioma, color, retrato/avatar y voz.
   * Lo que el sitio fijó explícitamente en init() se respeta. Devuelve la identidad normalizada.
   */
  setIdentity(input) {
    const id = (this.identity = defineIdentity(input));
    const ic = identityToWidgetConfig(id);
    const u = this._userConfig || {};
    const own = (sec, key) => u[sec] && typeof u[sec] === 'object' && u[sec][key] !== undefined;
    const take = (sec) => Object.fromEntries(Object.entries(ic[sec]).filter(([k]) => !own(sec, k)));
    const agent = take('agent');
    if (!agent.name) delete agent.name;
    else this._autoName = false;
    Object.assign(this.config.agent, agent);
    Object.assign(this.brain.persona, agent);
    this._relabel();
    if (!own('theme', 'primary')) {
      this.config.theme.primary = id.look.color;
      this.style.setProperty('--p', id.look.color);
      this.ui.setPrimary?.(id.look.color);
      if (this.pointer) this.pointer.color = id.look.color;
    }
    if (this.voice && this.config.voice !== false) {
      const v = take('voice');
      if (v.lang) this._voiceLangAuto = false; // la voz de la identidad manda sobre la del idioma
      this.voice.configure(v);
    }
    if (this.avatar && u.avatar !== false) {
      const mine = u.avatar && typeof u.avatar === 'object' ? u.avatar : {};
      this.avatar.applyLook({ ...take('avatar'), ...mine }).then((mode) => {
        const w = this.$('.stage-wrap');
        if (w && mode !== 'none') w.dataset.mode = mode;
      });
    }
    this.bus.emit('identity:change', { identity: id });
    return id;
  }

  /**
   * Cambia el idioma del widget en caliente: textos de la interfaz, idioma por defecto de las
   * respuestas, Accept-Language y la voz (si no se fijó voice.lang). Los mensajes se conservan.
   * @param {string} lang  'es' | 'en' | 'pt' (o con región: 'en-GB')
   * @returns {string} el idioma resuelto
   */
  setLocale(lang) {
    if (!this._started) return this.t?.locale;
    const prev = this.t.locale;
    this._t = translator(detectLocale(lang));
    const locale = this.t.locale;
    if (this._autoName) {
      this.config.agent.name = this.t('widget.defaultName');
      this.brain.persona.name = this.config.agent.name;
    }
    this.brain.setLocale(locale);
    if (this.voice && this._voiceLangAuto) this.voice.configure({ lang: voiceLangFor(locale, [lang]) });
    this._relabel();
    if (locale !== prev) this.bus.emit('locale:change', { locale, previous: prev });
    return locale;
  }

  /** Vuelve a pintar los textos de la interfaz (idioma o nombre nuevos) sin tocar los mensajes. */
  _relabel() {
    const t = this.t;
    const name = this.config.agent.name;
    const vars = { name };
    const root = this.shadowRoot;
    root.querySelectorAll('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t, vars)));
    root.querySelectorAll('[data-t-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.tAria, vars)));
    root.querySelectorAll('[data-t-title]').forEach((el) => (el.title = t(el.dataset.tTitle, vars)));
    const who = this.$('.who strong');
    if (who) who.textContent = name;
    const sub = this.$('.sub');
    if (sub) sub.textContent = t(this._statusKey || 'widget.status.online');
    const ta = this.$('textarea');
    if (ta) ta.placeholder = t(this._handoffOn ? 'widget.composer.placeholderTeam' : 'widget.composer.placeholder');
    this.$('.typing')?.setAttribute('aria-label', t('widget.typing'));
    const lbl = this.$('[data-more="proactive"] .lbl');
    if (lbl && this.store) lbl.textContent = t(this.store.get('pro:muted', false) ? 'widget.menu.unmuteSuggestions' : 'widget.menu.muteSuggestions');
    this._paintVoice?.();
    if (this.pointer) this.pointer.name = name;
    if (this.companion) {
      this.companion.name = name;
      this.companion.relabel();
      const initial = this.companion.el?.querySelector('.b-initial');
      if (initial) initial.textContent = name.slice(0, 1);
    }
  }

  // ───────────────────────────── render ─────────────────────────────

  _render() {
    const t = this.config.theme;
    const name = escapeHtml(this.config.agent.name);
    const hasContact = this.config.contact && (this.config.contact.apuchat || this.config.contact.apumail);
    this.shadowRoot.innerHTML = `
      <style>${widgetCss(t)}</style>
      <div class="teaser" hidden role="status"><button class="teaser-x" data-t-aria="widget.teaser.dismiss">×</button><div class="teaser-text"></div></div>
      <button class="launcher" data-t-aria="widget.launcher.open" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-6l-4.5 3.6A.9.9 0 0 1 5 18.9V16a3 3 0 0 1-1-2.2Z"/></svg>
        <span class="dot" hidden></span>
      </button>
      <section class="panel" role="dialog" data-t-aria="widget.panel.label" hidden>
        <header>
          <span class="status" aria-hidden="true"></span>
          <div class="who"><strong>${name}</strong><small class="sub"></small></div>
          <button class="icon b-voice" data-t-aria="widget.voice.mute" aria-pressed="false">${ICONS.voice}</button>
          ${hasContact ? `<button class="icon b-contact" data-t-title="widget.menu.contact" data-t-aria="widget.menu.contact" aria-haspopup="menu">${ICONS.contact}</button>` : ''}
          <button class="icon b-menu" data-t-title="widget.menu.more" data-t-aria="widget.menu.more" aria-haspopup="menu">${ICONS.more}</button>
          <button class="icon b-close" data-t-title="widget.menu.minimize" data-t-aria="widget.menu.minimize">${ICONS.close}</button>
        </header>
        <div class="menu contact-menu" role="menu" hidden>
          ${this.config.contact?.apuchat ? `<button role="menuitem" data-contact="human">${ICONS.person}<span data-t="widget.contact.human"></span></button>` : ''}
          ${this.config.contact?.apumail ? `<button role="menuitem" data-contact="mail">${ICONS.mail}<span data-t="widget.contact.mail"></span></button>` : ''}
        </div>
        <div class="menu more-menu" role="menu" hidden>
          ${this.config.proactive !== false ? `<div class="level" role="group" data-t-aria="widget.menu.initiativeLabel"><span data-t="widget.menu.initiative"></span>
            <div class="seg">${['quiet', 'normal', 'bold'].map((v) => `<button role="menuitemradio" data-level="${v}" data-t="widget.menu.level.${v}" aria-checked="false"></button>`).join('')}</div></div>` : ''}
          <button role="menuitem" data-more="proactive">${ICONS.bell}<span class="lbl"></span></button>
          <button role="menuitem" data-more="reset">${ICONS.reset}<span data-t="widget.menu.reset"></span></button>
        </div>
        <div class="stage-wrap" ${this.config.avatar === false ? 'hidden' : ''}>
          <div class="stage" data-ots-ignore></div>
          <div class="loading" hidden><span></span></div>
          <div class="subtitles" aria-hidden="true"></div>
        </div>
        <div class="handoff" hidden>
          <span>${ICONS.person} <b class="handoff-who" data-t="widget.handoff.team"></b></span>
          <button class="link b-video" data-t="widget.handoff.video"></button>
          <button class="link b-endhandoff" data-t="widget.handoff.back"></button>
        </div>
        <ol class="messages" aria-live="polite" aria-relevant="additions"></ol>
        <form class="composer">
          <textarea rows="1" data-t-aria="widget.composer.label"></textarea>
          <button type="button" class="icon b-mic" data-t-aria="widget.composer.mic" hidden>${ICONS.mic}</button>
          <button type="submit" class="icon send" data-t-aria="widget.composer.send">${ICONS.send}</button>
        </form>
        <footer class="brand"><span data-t="widget.footer.ai"></span> · <a href="https://7ots.com" target="_blank" rel="noopener">7ots</a></footer>
      </section>`;
    this._relabel();
  }

  _wireEvents() {
    const on = (e, fn) => this._offs.push(this.bus.on(e, fn));
    const ta = this.$('textarea');

    // Cualquier interacción con el widget desbloquea el audio (política de autoplay).
    this.shadowRoot.addEventListener('pointerdown', () => this.avatar?.unlockAudio(), { capture: true });

    this.$('.launcher').onclick = () => (this.isOpen ? this.close() : this.open());
    this.$('.b-close').onclick = () => this.close();
    this.$('.teaser').onclick = (e) => {
      this._hideTeaser();
      if (!e.target.closest('.teaser-x')) this.open();
    };
    this.$('.composer').onsubmit = (e) => {
      e.preventDefault();
      this._submit(ta.value);
      ta.value = '';
      autoGrow(ta);
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.$('.composer').requestSubmit();
      }
      if (e.key === 'Escape') this.close();
    });
    ta.addEventListener('input', () => autoGrow(ta));

    // Voz
    const vb = this.$('.b-voice');
    if (!this.voice) vb.hidden = true;
    const paintVoice = (this._paintVoice = () => {
      const muted = !!this.voice?.muted;
      vb.innerHTML = muted ? ICONS.voiceOff : ICONS.voice;
      vb.setAttribute('aria-pressed', String(muted));
      vb.title = this.t(muted ? 'widget.voice.off' : 'widget.voice.on');
    });
    paintVoice();
    vb.onclick = () => {
      this.voice?.setMuted(!this.voice.muted);
      paintVoice();
    };
    const mic = this.$('.b-mic');
    if (this.voice?.canListen) {
      mic.hidden = false;
      mic.onclick = async () => {
        if (this.voice.listening) return this.voice.stopListening();
        mic.classList.add('rec');
        const text = await this.voice.listen({ onPartial: (t) => (ta.value = t) });
        mic.classList.remove('rec');
        ta.value = '';
        if (text) this._submit(text, 'voice');
      };
    }

    // Menús
    const toggleMenu = (sel) => {
      const m = this.$(sel);
      const show = m.hidden;
      this.shadowRoot.querySelectorAll('.menu').forEach((x) => (x.hidden = true));
      m.hidden = !show;
    };
    this.$('.b-contact')?.addEventListener('click', () => toggleMenu('.contact-menu'));
    this.$('.b-menu').onclick = () => {
      this.$('[data-more="proactive"] .lbl').textContent = this.t(this.store.get('pro:muted', false) ? 'widget.menu.unmuteSuggestions' : 'widget.menu.muteSuggestions');
      this.shadowRoot.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.level === this.proactivity?.level)));
      toggleMenu('.more-menu');
    };
    this.shadowRoot.addEventListener('click', (e) => {
      if (!e.target.closest('.menu, .b-contact, .b-menu')) this.shadowRoot.querySelectorAll('.menu').forEach((x) => (x.hidden = true));
    });
    this.$('.contact-menu').onclick = (e) => {
      const b = e.target.closest('[data-contact]');
      if (!b) return;
      this.$('.contact-menu').hidden = true;
      this._submit(this.t(b.dataset.contact === 'human' ? 'widget.contact.askHuman' : 'widget.contact.askMail'));
    };
    this.$('.more-menu').onclick = (e) => {
      const lv = e.target.closest('[data-level]');
      if (lv) {
        this.proactivity?.setLevel(lv.dataset.level);
        if (this.store.get('pro:muted', false)) this.proactivity?.mute(false);
        this.shadowRoot.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-checked', String(b === lv)));
        return;
      }
      const b = e.target.closest('[data-more]');
      if (!b) return;
      this.$('.more-menu').hidden = true;
      if (b.dataset.more === 'proactive') this.proactivity?.mute(!this.store.get('pro:muted', false));
      if (b.dataset.more === 'reset') this.reset();
    };

    // Derivación a humano
    this.$('.b-video').onclick = () => this.apuchat?.callUrl && window.open(this.apuchat.callUrl, '_blank', 'noopener');
    this.$('.b-endhandoff').onclick = () => this.apuchat?.end(this.t('widget.handoff.userLeft'));

    // ── eventos del agente ──
    on('agent:thinking', ({ on: v }) => this._setThinking(v));
    on('agent:message', ({ text, error }) => this._onAgentMessage(text, { error }));
    on('action:start', ({ name, args }) => {
      this._actionChip(name, 'start');
      const t = args?.target ?? args?.source ?? args?.fields?.[0]?.target;
      if (this.companion && FOLLOW_ACTIONS.has(name) && t) this.companion.follow(this.context.resolve(t));
    });
    on('action:end', ({ name, result }) => this._actionChip(name, result.ok ? 'ok' : 'fail'));
    on('handoff:start', () => this._setHandoff(true));
    on('handoff:end', ({ reason }) => {
      this._setHandoff(false);
      this._addMessage('system', reason || this.t('widget.handoff.ended'));
    });
    on('handoff:message', ({ from, text }) => {
      this.brain.recordHuman(text, from);
      this._addMessage('human', text, { name: from });
      const who = this.$('.handoff-who');
      who.removeAttribute('data-t'); // ya es el nombre de la persona: no se traduce
      who.textContent = from;
      if (!this.isOpen) this._showTeaser(`${from}: ${text}`);
    });
    on('auth:change', () => this._connectMcp());
  }

  // ───────────────────────────── acciones de UI ─────────────────────────────

  get isOpen() {
    return !this.$('.panel').hidden;
  }

  open({ focus = true } = {}) {
    this.$('.panel').hidden = false;
    this.$('.launcher').setAttribute('aria-expanded', 'true');
    this.$('.launcher').classList.add('active');
    this.$('.dot').hidden = true;
    this._hideTeaser();
    this.store.set('open', true);
    this._loadAvatar();
    this._scrollBottom();
    if (focus) this.$('textarea').focus();
    this.companion?.panelChanged(true);
    this.bus.emit('widget:open', {});
  }

  close() {
    this.$('.panel').hidden = true;
    this.$('.launcher').setAttribute('aria-expanded', 'false');
    this.$('.launcher').classList.remove('active');
    this.store.set('open', false);
    this.voice?.interrupt();
    this.companion?.panelChanged(false);
    this.bus.emit('widget:close', {});
  }

  async _loadAvatar() {
    if (!this.avatar || this._avatarLoading) return;
    this._avatarLoading = true;
    await this._identityReady;
    const loading = this.$('.loading');
    loading.hidden = false;
    await this.avatar.load((p) => {
      if (p != null) loading.firstElementChild.style.width = `${Math.round(p * 100)}%`;
    });
    loading.hidden = true;
    this.$('.stage-wrap').dataset.mode = this.avatar.mode;
  }

  _submit(text, source = 'text') {
    const clean = String(text || '').trim();
    if (!clean) return;
    this._addMessage('user', clean);
    if (this.apuchat?.active) {
      this.brain.recordHuman(clean, 'usuario');
      this.apuchat.send(clean).catch(() => this._addMessage('system', this.t('widget.handoff.sendFailed')));
      return;
    }
    this.voice?.interrupt();
    this.brain.send(clean, { source });
  }

  _onAgentMessage(text, { error } = {}) {
    const { clean, moods, gestures } = extractExpressions(text);
    if (!clean) return;
    this._addMessage('agent', clean, { error });
    if (this.avatar?.mode && this.avatar.mode !== 'none') {
      if (moods.length) this.avatar.setMood(moods.at(-1));
      if (gestures.length) this.avatar.gesture(gestures[0]);
    }
    if (this.companion) {
      // El bocadillo siempre; la voz, por aquí solo si el chat está cerrado (abierto habla abajo).
      this.companion.say(clean, { speak: !this.isOpen });
      if (!this.isOpen) return;
    } else if (!this.isOpen) {
      this._showTeaser(clean);
      return;
    }
    if (this.voice) {
      this._subtitle(clean);
      this.voice.say(clean).then(() => this._subtitle(''));
    }
  }

  _addMessage(from, text, { name, error, restore } = {}) {
    const li = document.createElement('li');
    li.className = `msg ${from}${error ? ' error' : ''}`;
    if (from === 'user' || from === 'system') li.textContent = text;
    else {
      li.innerHTML = (from === 'human' ? `<span class="author">${escapeHtml(name || this.t('widget.handoff.author'))}</span>` : '') + renderMarkdown(text);
    }
    this.$('.messages').appendChild(li);
    if (!restore) this._scrollBottom();
    return li;
  }

  _actionChip(name, state) {
    const list = this.$('.messages');
    const key = `widget.actions.${name}`;
    const own = this.actions._actions.get(name);
    const label = (this.t.has(key) ? this.t(key) : own && actionTitle(own)) || name.replace(/__/g, ' · ').replace(/_/g, ' ');
    let chip = list.querySelector(`.chip[data-running="${CSS.escape(name)}"]`);
    if (state === 'start') {
      chip = document.createElement('li');
      chip.className = 'chip';
      chip.dataset.running = name;
      chip.textContent = `${label}…`;
      list.appendChild(chip);
    } else if (chip) {
      chip.removeAttribute('data-running');
      chip.classList.add(state);
      chip.textContent = state === 'ok' ? `✓ ${label}` : `✕ ${label}`;
    }
    this._scrollBottom();
  }

  _setThinking(on) {
    this._statusKey = on ? 'widget.status.thinking' : this.apuchat?.active ? 'widget.status.withTeam' : 'widget.status.online';
    this.$('.sub').textContent = this.t(this._statusKey);
    this.$('.panel').classList.toggle('thinking', on);
    let t = this.$('.typing');
    if (on && !t) {
      t = document.createElement('li');
      t.className = 'typing';
      t.innerHTML = '<span></span><span></span><span></span>';
      t.setAttribute('aria-label', this.t('widget.typing'));
      this.$('.messages').appendChild(t);
      this._scrollBottom();
    } else if (!on) t?.remove();
  }

  _setHandoff(on) {
    this.$('.handoff').hidden = !on;
    this.$('.b-video').hidden = !this.apuchat?.callUrl;
    this.$('.panel').classList.toggle('human', on);
    this._handoffOn = on;
    this._statusKey = on ? 'widget.status.withTeam' : 'widget.status.online';
    this.$('.sub').textContent = this.t(this._statusKey);
    this.$('textarea').placeholder = this.t(on ? 'widget.composer.placeholderTeam' : 'widget.composer.placeholder');
  }

  _subtitle(text) {
    const s = this.$('.subtitles');
    s.textContent = text.length > 160 ? text.slice(0, 157) + '…' : text;
  }

  _showTeaser(text) {
    const t = this.$('.teaser');
    t.querySelector('.teaser-text').textContent = text.length > 180 ? text.slice(0, 177) + '…' : text;
    t.hidden = false;
    this.$('.dot').hidden = false;
  }

  _hideTeaser() {
    this.$('.teaser').hidden = true;
  }

  _scrollBottom() {
    const m = this.$('.messages');
    requestAnimationFrame(() => (m.scrollTop = m.scrollHeight));
  }

  _beforeNavigate(url, reason) {
    this.store.set('pendingNav', { url, reason, at: Date.now() });
    this.brain._persist();
    this.apuchat?.suspend();
  }

  async _connectMcp() {
    for (const m of this.config.mcp) {
      if ((m.requiresAuth ?? true) && !this.auth.isAuthenticated()) continue;
      try {
        const names = await this.actions.registerMcpServer(m);
        if (this.config.debug) console.info(`[7ots] MCP "${m.name || 'site'}": ${names.length} herramientas`);
      } catch (err) {
        console.warn(`[7ots] no se pudo conectar el MCP ${m.url}:`, err?.message || err);
      }
    }
  }

  /** Borra la conversación (y cierra una derivación activa). */
  reset() {
    this.brain.reset();
    this.voice?.interrupt();
    this.apuchat?.end('');
    this.$('.messages').replaceChildren();
    this.ui.closeAll();
  }

  destroy() {
    if (!this._started) return;
    this._started = false;
    this._offs.forEach((off) => off());
    this.proactivity?.stop();
    this.context.stop();
    this.brain.abort();
    this.voice?.interrupt();
    this.avatar?.dispose();
    this.apuchat?.suspend();
    this.actions.closeAll();
    this.pageTools?.stop();
    this.pointer?.destroy();
    this.companion?.destroy();
    this.ui.destroy();
    this.bus.clear();
    this.shadowRoot.replaceChildren();
    if (this.isConnected) this.remove();
  }
}

// ───────────────────────────── API pública ─────────────────────────────

/**
 * Objeto que recibe el desarrollador (y los handlers como ctx.agent).
 * Todo lo interno sigue accesible vía agent.widget para casos avanzados.
 */
function createPublicApi(w) {
  return {
    widget: w,
    bus: w.bus,
    ui: w.ui,
    auth: w.auth,
    context: w.context,
    actions: w.actions,
    /** Registra una acción (herramienta) propia. Devuelve una función para quitarla. */
    registerAction: (def) => w.actions.register(def),
    /** Conecta otro servidor MCP del sitio en caliente. */
    registerMcp: (opt) => w.actions.registerMcpServer(opt),
    /** Plantillas HTML de confianza para show_modal/open_sidebar. */
    registerTemplate: (name, fn) => w.ui.registerTemplate(name, fn),
    /** Actualiza el JWT del usuario (login/logout/refresh) y reconecta el MCP. */
    setAuthToken: (token) => w.auth.setToken(token),
    /** Envía un mensaje como si lo escribiera el usuario. */
    ask: (text) => {
      if (!w.isOpen && !w.companion) w.open(); // el compañero contesta en su bocadillo
      w._submit(text);
    },
    /** Hace que el agente diga algo literal (sin pasar por el LLM). */
    say: (text) => w.bus.emit('agent:message', { text, final: true }),
    /** Dispara una observación proactiva propia ("el carrito lleva 5 min abandonado"). */
    notify: (text, opt) => w.brain.notify(text, opt),
    /** Identidad del agente (nombre, aspecto, voz, contacto); se aplica en caliente. */
    setIdentity: (identity) => w.setIdentity(identity),
    get identity() {
      return w.identity;
    },
    /** Nivel de iniciativa: 'quiet' | 'normal' | 'bold'. */
    setProactivity: (level) => w.proactivity?.setLevel(level),
    /** Idioma del widget en caliente: 'es' | 'en' | 'pt'. Emite 'locale:change'. Devuelve el resuelto. */
    setLocale: (lang) => w.setLocale(lang),
    get locale() {
      return w.t?.locale;
    },
    open: () => w.open(),
    close: () => w.close(),
    reset: () => w.reset(),
    on: (event, fn) => w.bus.on(event, fn),
    destroy: () => w.destroy(),
  };
}

// ───────────────────────────── helpers ─────────────────────────────

function mergeConfig(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v === undefined) continue;
    const b = base[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b) && typeof v !== 'function'
      ? mergeConfig(b, v)
      : v;
  }
  return out;
}

const VOICE_REGION = { es: 'es-ES', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

/**
 * Etiqueta BCP 47 para la voz a partir del idioma del widget. Conserva la región si alguna
 * preferencia del mismo idioma la trae (locale 'en-GB', agent.language 'es-MX', <html lang="pt-PT">);
 * si no, la región habitual (es→es-ES, en→en-US, pt→pt-BR). El navegador no cuenta: la voz
 * sigue al sitio, como antes.
 * @param {string} locale  idioma resuelto del widget
 * @param {Array<string|null|undefined>} [prefs]  preferencias explícitas (van primero)
 */
function voiceLangFor(locale, prefs = []) {
  const base = String(locale || 'es').split('-')[0].toLowerCase();
  const cands = [locale, ...prefs, document.documentElement.lang].filter(Boolean).map(String);
  const withRegion = cands.find((c) => c.includes('-') && c.split('-')[0].toLowerCase() === base);
  return withRegion || VOICE_REGION[base] || base;
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  voice: svg('<path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/>'),
  voiceOff: svg('<path d="M4 9v6h4l5 4V5L8 9H4Zm16.3-.3-1.4-1.4L17 9.2l-1.9-1.9-1.4 1.4 1.9 1.9-1.9 1.9 1.4 1.4 1.9-1.9 1.9 1.9 1.4-1.4-1.9-1.9Z"/>'),
  contact: svg('<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5Z"/>'),
  more: svg('<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>'),
  close: svg('<path d="M5 11h14v2H5z"/>'),
  person: svg('<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"/>'),
  mail: svg('<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5Z"/>'),
  bell: svg('<path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6V11a6 6 0 0 0-5-5.9V4h-2v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1Z"/>'),
  reset: svg('<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/>'),
  mic: svg('<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11Z"/>'),
  send: svg('<path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2Z"/>'),
};

function widgetCss(t = {}) {
  const side = t.position === 'left' ? 'left' : 'right';
  return `
  :host { all: initial; display: block; }
  :host {
    --p: ${t.primary || '#4f46e5'};
    --r: ${t.radius ?? 16}px;
    --bg: #ffffff; --fg: #111827; --mut: #6b7280; --line: #e5e7eb; --soft: #f3f4f6;
    --agent: #f3f4f6; --human: #ecfdf5; --human-b: #10b981;
    position: fixed; ${side}: 20px; bottom: 20px; z-index: ${t.zIndex ?? 2147483000};
    font: 14px/1.45 ${t.font || 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'};
    color: var(--fg);
  }
  @media (prefers-color-scheme: dark) {
    :host { --bg: #111827; --fg: #f9fafb; --mut: #9ca3af; --line: #374151; --soft: #1f2937; --agent: #1f2937; --human: #064e3b; }
  }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
  svg { width: 20px; height: 20px; fill: currentColor; }

  /* ── modo compañero ── */
  .buddy { position: fixed; inset: auto; left: 0; top: 0; width: var(--bs); height: var(--bs); z-index: 1;
    margin: 0; padding: 0; border: 0; background: none; overflow: visible; color: var(--fg);
    transition-property: transform; transition-timing-function: cubic-bezier(.45,.05,.3,1); will-change: transform; }
  :host(.companion) .panel { bottom: 0; }
  .buddy.behind { opacity: 0; pointer-events: none; }
  .b-body { position: absolute; inset: 0; padding: 0; border-radius: 50%; cursor: grab; touch-action: none; display: block; }
  .b-body:active { cursor: grabbing; }
  .b-body:focus-visible { outline: 3px solid var(--p); outline-offset: 2px; }
  .b-stage { position: absolute; inset: 0; display: block; border-radius: 50%; overflow: hidden;
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--p) 22%, transparent), transparent 70%); }
  .b-stage .stage { position: absolute; inset: 0; }
  .buddy .b-stage .ots-face { width: 88%; height: 88%; position: absolute; left: 6%; top: 6%; transform: none; }
  .b-initial { position: absolute; inset: 12%; border-radius: 50%; background: var(--p); color: #fff; display: grid; place-items: center;
    font: 700 calc(var(--bs) * .32)/1 system-ui, sans-serif; }
  .b-shadow { position: absolute; left: 22%; right: 22%; bottom: -6px; height: 10px; border-radius: 50%; background: rgba(0,0,0,.18); filter: blur(3px); }
  .buddy:not(.walking) .b-body { animation: idle 3.2s ease-in-out infinite; }
  .buddy.walking .b-stage { animation: hop .32s ease-in-out infinite alternate; }
  .buddy.curious:not(.walking) .b-stage { animation: tilt 1.6s ease-in-out infinite alternate; }
  @keyframes tilt { from { transform: rotate(-4deg); } to { transform: rotate(4deg) translateY(-3px); } }
  .buddy.walking.to-left .b-stage { animation-name: hop-l; }
  @keyframes idle { 50% { transform: translateY(-4px); } }
  @keyframes hop { from { transform: translateY(0) rotate(-3deg); } to { transform: translateY(-10px) rotate(3deg); } }
  @keyframes hop-l { from { transform: translateY(0) rotate(3deg); } to { transform: translateY(-10px) rotate(-3deg); } }
  .b-say { position: absolute; width: max-content; max-width: min(280px, calc(100vw - 32px)); padding: 10px 14px; border-radius: 16px;
    background: var(--bg); color: var(--fg); box-shadow: 0 10px 30px rgba(0,0,0,.22); cursor: pointer; animation: pop .2s ease; font-size: 14px; }
  .b-say p { margin: 0; }
  .b-say p + p { margin-top: 6px; }
  .buddy[data-v="bottom"] .b-say { bottom: calc(100% + 10px); }
  .buddy[data-v="top"] .b-say { top: calc(100% + 10px); }
  .buddy[data-h="right"] .b-say { right: 10%; }
  .buddy[data-h="left"] .b-say { left: 10%; }
  .b-say::after { content: ''; position: absolute; width: 14px; height: 14px; background: inherit; transform: rotate(45deg); }
  .buddy[data-v="bottom"] .b-say::after { bottom: -6px; }
  .buddy[data-v="top"] .b-say::after { top: -6px; }
  .buddy[data-h="right"] .b-say::after { right: 26px; }
  .buddy[data-h="left"] .b-say::after { left: 26px; }
  @keyframes pop { from { opacity: 0; transform: scale(.9); } }
  .b-arrow { position: absolute; left: 0; top: 0; width: 34px; height: 14px; margin: -7px 0 0 0; transform-origin: 0 50%; pointer-events: none; }
  .b-arrow::before { content: ''; position: absolute; inset: 4px 10px 4px 0; background: var(--p); border-radius: 3px; }
  .b-arrow::after { content: ''; position: absolute; right: 0; top: 0; border: 7px solid transparent; border-left: 12px solid var(--p); border-right: 0; }
  .b-arrow.go { animation: poke .5s ease-in-out 4 alternate; }
  @keyframes poke { to { margin-left: 8px; } }
  @media (prefers-reduced-motion: reduce) { .buddy *, .buddy { animation: none !important; } }

  .launcher { position: relative; width: 60px; height: 60px; border-radius: 50%; background: var(--p); color: #fff;
    display: grid; place-items: center; box-shadow: 0 8px 24px rgba(0,0,0,.25); transition: transform .2s; margin-${side}: 0; float: ${side}; }
  .launcher:hover { transform: scale(1.06); }
  .launcher svg { width: 28px; height: 28px; }
  .launcher.active { transform: scale(.9); }
  .launcher .dot { position: absolute; top: 4px; ${side === 'right' ? 'right' : 'left'}: 4px; width: 14px; height: 14px; border-radius: 50%; background: #ef4444; border: 2px solid #fff; }

  .teaser { position: absolute; bottom: 72px; ${side}: 0; width: min(300px, calc(100vw - 40px)); background: var(--bg); color: var(--fg);
    border-radius: var(--r); padding: 12px 30px 12px 14px; box-shadow: 0 10px 30px rgba(0,0,0,.18); cursor: pointer; animation: pop .25s ease-out; }
  .teaser-x { position: absolute; top: 4px; ${side}: 6px; font-size: 18px; color: var(--mut); }

  .panel { position: absolute; bottom: 72px; ${side}: 0; width: min(380px, calc(100vw - 24px)); height: min(640px, calc(100vh - 110px));
    background: var(--bg); border-radius: var(--r); box-shadow: 0 20px 50px rgba(0,0,0,.28); display: flex; flex-direction: column;
    overflow: hidden; animation: pop .22s ease-out; border: 1px solid var(--line); }
  header { display: flex; align-items: center; gap: 4px; padding: 10px 8px 10px 14px; border-bottom: 1px solid var(--line); }
  .status { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; margin-right: 6px; }
  .panel.thinking .status { background: #f59e0b; animation: pulse 1s infinite; }
  .panel.human .status { background: var(--human-b); }
  .who { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .who small { color: var(--mut); font-size: 12px; }
  .icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--mut); }
  .icon:hover { background: var(--soft); color: var(--fg); }
  .icon[aria-pressed="true"] { color: #ef4444; }

  .menu { position: absolute; top: 52px; right: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.15); padding: 6px; z-index: 5; min-width: 230px; }
  .menu button { display: flex; gap: 10px; align-items: center; width: 100%; padding: 9px 10px; border-radius: 8px; text-align: left; }
  .menu button:hover { background: var(--soft); }
  .level { padding: 6px 10px 8px; font-size: 12px; color: var(--muted); }
  .level .seg { display: flex; gap: 2px; margin-top: 6px; background: var(--soft); border-radius: 9px; padding: 2px; }
  .menu .level .seg button { justify-content: center; padding: 6px 4px; font-size: 12px; border-radius: 7px; color: var(--fg); }
  .menu .level .seg button[aria-checked="true"] { background: var(--primary); color: #fff; }

  .stage-wrap { position: relative; height: 230px; flex: none; background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--p) 18%, var(--bg)), var(--bg)); }
  .stage { position: absolute; inset: 0; }
  .stage-wrap[data-mode="2d"] { height: 150px; }
  .stage-wrap:has(.otsc) { height: 190px; }
  .stage > .otsc { padding: 10px 0 6px; box-sizing: border-box; }
  .buddy .b-stage:has(.otsc) { overflow: visible; background: none; }
  .stage .ots-face { width: 120px; height: 120px; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); }
  .ots-face-bg { fill: var(--face-bg, var(--p)); }
  .ots-eyes, .ots-mouth { fill: var(--face-fg, #fff); }
  .ots-portrait { position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; transform: translate(-50%,-50%); border-radius: 50%;
    overflow: hidden; background: var(--p); box-shadow: 0 0 0 calc(3px + var(--ots-talk, 0) * 12px) color-mix(in srgb, var(--p) 45%, transparent);
    transition: box-shadow .08s linear; }
  .ots-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .buddy .b-stage .ots-portrait { width: 88%; height: 88%; }
  .ots-mouth { transition: ry .06s; }
  .ots-face[data-mood="sad"] .ots-eyes { transform: translateY(3px); transform-origin: center; }
  .loading { position: absolute; left: 20%; right: 20%; bottom: 14px; height: 4px; background: var(--line); border-radius: 4px; overflow: hidden; }
  .loading span { display: block; height: 100%; width: 10%; background: var(--p); transition: width .2s; }
  .subtitles { position: absolute; left: 10px; right: 10px; bottom: 8px; text-align: center; font-size: 13px; color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,.8); pointer-events: none; }

  .handoff { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: var(--human); font-size: 13px; }
  .handoff span { flex: 1; display: flex; gap: 6px; align-items: center; }
  .handoff svg { width: 16px; height: 16px; }
  .link { color: var(--p); text-decoration: underline; font-size: 12px; }

  .messages { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 14px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; }
  .msg { max-width: 86%; padding: 9px 12px; border-radius: 14px; word-wrap: break-word; }
  .msg p { margin: 0 0 6px; } .msg p:last-child { margin: 0; }
  .msg ul, .msg ol { margin: 4px 0; padding-left: 20px; }
  .msg a { color: var(--p); }
  .msg code { background: rgba(0,0,0,.07); padding: 1px 4px; border-radius: 4px; }
  .msg.user { align-self: flex-end; background: var(--p); color: #fff; border-bottom-right-radius: 4px; white-space: pre-wrap; }
  .msg.agent { align-self: flex-start; background: var(--agent); border-bottom-left-radius: 4px; }
  .msg.human { align-self: flex-start; background: var(--human); border-left: 3px solid var(--human-b); }
  .msg.human .author { display: block; font-size: 11px; font-weight: 600; color: var(--human-b); margin-bottom: 2px; }
  .msg.system { align-self: center; color: var(--mut); font-size: 12px; background: none; }
  .msg.error { border: 1px solid #fca5a5; }
  .chip { align-self: flex-start; font-size: 12px; color: var(--mut); padding: 2px 10px; border-radius: 999px; border: 1px dashed var(--line); }
  .chip.ok { border-style: solid; } .chip.fail { color: #ef4444; }
  .typing { align-self: flex-start; display: flex; gap: 4px; padding: 12px; background: var(--agent); border-radius: 14px; }
  .typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--mut); animation: blink 1.2s infinite; }
  .typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }

  .composer { display: flex; gap: 4px; align-items: flex-end; padding: 8px; border-top: 1px solid var(--line); }
  textarea { flex: 1; resize: none; border: 1px solid var(--line); border-radius: 12px; padding: 9px 12px; font: inherit; color: var(--fg);
    background: var(--bg); max-height: 120px; outline: none; }
  textarea:focus { border-color: var(--p); box-shadow: 0 0 0 3px color-mix(in srgb, var(--p) 20%, transparent); }
  .send { color: var(--p); }
  .b-mic.rec { color: #fff; background: #ef4444; animation: pulse 1s infinite; }
  .brand { font-size: 10.5px; text-align: center; color: var(--mut); padding: 0 0 6px; }
  .brand a { color: inherit; }
  :focus-visible { outline: 2px solid var(--p); outline-offset: 2px; }

  @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
  @keyframes pulse { 50% { opacity: .5; } }
  @keyframes blink { 0%, 80%, 100% { opacity: .3; } 40% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  @media (max-width: 480px) {
    :host { ${side}: 12px; bottom: 12px; }
    .panel { position: fixed; inset: 0; width: 100vw; height: 100dvh; border-radius: 0; bottom: 0; }
  }`;
}

if (!customElements.get('ots-agent')) customElements.define('ots-agent', AgentWidget);
