/**
 * Adaptadores de LLM del proxy. Traducen el formato NEUTRAL del widget a cada proveedor
 * y de vuelta. El proxy es sin estado: el historial viaja en cada petición.
 *
 * Entrada:  { system: string, messages: Neutral[], tools: [{name, description, parameters}] }
 *   Neutral = {role:'user', content}
 *           | {role:'assistant', content, toolCalls?:[{id,name,args}], raw?}
 *           | {role:'tool', toolCallId, name, content, isError?}
 *
 * Salida:   { text, toolCalls:[{id,name,args}], finishReason, provider, raw? }
 *   `raw` (solo Anthropic) son los bloques de contenido tal cual: el widget los devuelve
 *   intactos en el siguiente paso del MISMO turno para conservar el razonamiento.
 *
 * Proveedores (LLM_PROVIDER):
 *   anthropic  → Claude vía @anthropic-ai/sdk  (por defecto claude-opus-5-5)
 *   openai     → Chat Completions vía openai SDK (LLM_BASE_URL para compatibles: DeepSeek, Groq, Ollama…)
 *   mock       → sin claves, para desarrollo y tests: "/tool nombre {json}"
 *
 * `step()` acepta además `locale` (idioma de la petición) para los textos fijos del proxy:
 * la negativa de Anthropic y las respuestas del mock. Sin él, se usa el idioma del servidor.
 */

import { translator } from '../src/i18n/index.js';
import { serverLocale } from './i18n.mjs';

/**
 * @param {Record<string,string|undefined>} [env]  configuración (defecto: process.env). En la plataforma,
 *   cada ots trae la suya, con sus claves: el SDK nunca lee el entorno del proceso.
 */
export function createLLM(env = process.env) {
  const provider = (env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : 'mock')).toLowerCase();
  if (provider === 'anthropic') return anthropicProvider(env);
  if (provider === 'openai') return openaiProvider(env);
  return mockProvider();
}

// ───────────────────────────── Anthropic (Claude) ─────────────────────────────

function anthropicProvider(env) {
  const model = env.LLM_MODEL || 'claude-opus-5-5';
  const effort = env.LLM_EFFORT || 'low'; // chat en vivo: poca latencia. Sube a medium/high si tus evals lo justifican.
  const maxTokens = Number(env.LLM_MAX_TOKENS || 8000);
  // Reintento automático en otro modelo si el clasificador de seguridad rechaza la petición.
  // No disponible en Bedrock/Vertex/Foundry: pon LLM_FALLBACKS=off allí.
  const useFallbacks = env.LLM_FALLBACKS !== 'off';
  let client;

  return {
    name: 'anthropic',
    model,
    async step({ system, messages, tools, locale }) {
      if (!client) {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY ?? null }); // null: nunca cae al entorno del proceso
      }
      const params = {
        model,
        max_tokens: maxTokens,
        output_config: { effort },
        // System y tools son fijos por sesión → se cachean entre pasos y turnos.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: tools.map((t) => ({ name: t.name, description: t.description || '', input_schema: normalizeSchema(t.parameters) })),
        tool_choice: { type: 'auto' },
        messages: toAnthropicMessages(messages),
      };
      if (!params.tools.length) {
        delete params.tools;
        delete params.tool_choice;
      }

      const call = (p) =>
        useFallbacks
          ? client.beta.messages.create({ ...p, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
          : client.messages.create(p);

      let res;
      try {
        res = await call(params);
      } catch (err) {
        // Red de seguridad del "preserved thinking": si algún bloque de razonamiento quedó
        // ligado a un prefijo distinto (historial editado), se quitan y se reintenta una vez.
        if (err?.status === 400 && /bound to a different conversation/i.test(String(err?.message))) {
          res = await call({ ...params, messages: stripThinking(params.messages) });
        } else throw err;
      }

      if (res.stop_reason === 'refusal') {
        return {
          text: translator(locale || serverLocale())('server.llm.refusal'),
          toolCalls: [],
          finishReason: 'refusal',
          provider: 'anthropic',
        };
      }

      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      let toolCalls = res.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
      // Si se cortó por max_tokens, la última tool puede venir incompleta: no se ejecuta nada.
      if (res.stop_reason === 'max_tokens') toolCalls = [];
      return {
        text,
        toolCalls,
        finishReason: res.stop_reason,
        provider: 'anthropic',
        usage: res.usage ? { in: res.usage.input_tokens || 0, out: res.usage.output_tokens || 0, cacheRead: res.usage.cache_read_input_tokens || 0, cacheWrite: res.usage.cache_creation_input_tokens || 0 } : undefined,
        raw: toolCalls.length ? res.content : undefined, // solo hace falta para continuar el loop
      };
    },
  };
}

export function toAnthropicMessages(messages) {
  const out = [];
  const push = (role, blocks) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    // La API exige alternancia user/assistant: se fusionan mensajes seguidos del mismo rol.
    if (last?.role === role) last.content.push(...blocks);
    else out.push({ role, content: [...blocks] });
  };
  for (const m of messages) {
    if (m.role === 'user') {
      push('user', [{ type: 'text', text: String(m.content || '(vacío)') }]);
    } else if (m.role === 'assistant') {
      if (Array.isArray(m.raw) && m.raw.length) {
        push('assistant', m.raw); // tal cual, incluidos los bloques de thinking
      } else {
        const blocks = [];
        if (m.content) blocks.push({ type: 'text', text: String(m.content) });
        for (const c of m.toolCalls || []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
        push('assistant', blocks);
      }
    } else if (m.role === 'tool') {
      push('user', [{ type: 'tool_result', tool_use_id: m.toolCallId, content: String(m.content ?? ''), ...(m.isError ? { is_error: true } : {}) }]);
    }
  }
  // Los tool_result deben ir ANTES que el texto dentro de un mismo mensaje de usuario.
  for (const m of out) {
    if (m.role === 'user') m.content.sort((a, b) => (a.type === 'tool_result' ? 0 : 1) - (b.type === 'tool_result' ? 0 : 1));
  }
  // Breakpoint de caché al final: los pasos siguientes del mismo turno reutilizan el prefijo.
  const lastBlock = out[out.length - 1]?.content.at(-1);
  if (lastBlock && out[out.length - 1].role === 'user') lastBlock.cache_control = { type: 'ephemeral' };
  return out;
}

function stripThinking(messages) {
  return messages.map((m) =>
    m.role === 'assistant' ? { ...m, content: m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking') } : m,
  );
}

// ───────────────────────────── OpenAI (y compatibles) ─────────────────────────────

function openaiProvider(env) {
  const model = env.LLM_MODEL || 'gpt-4.1-mini';
  let client;
  return {
    name: 'openai',
    model,
    async step({ system, messages, tools }) {
      if (!client) {
        const { default: OpenAI } = await import('openai');
        client = new OpenAI({ apiKey: env.OPENAI_API_KEY ?? null, baseURL: env.LLM_BASE_URL || undefined });
      }
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: system }, ...toOpenAIMessages(messages)],
        ...(tools.length
          ? {
              tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: normalizeSchema(t.parameters) } })),
              tool_choice: 'auto',
            }
          : {}),
      });
      const choice = res.choices[0];
      const msg = choice.message || {};
      return {
        text: (msg.content || '').trim(),
        toolCalls: (msg.tool_calls || [])
          .filter((c) => c.type === 'function')
          .map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) })),
        finishReason: choice.finish_reason,
        provider: 'openai',
        usage: res.usage ? { in: res.usage.prompt_tokens || 0, out: res.usage.completion_tokens || 0, cacheRead: res.usage.prompt_tokens_details?.cached_tokens || 0 } : undefined,
      };
    },
  };
}

function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) }
          : {}),
      };
    }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: String(m.content ?? '') };
    return { role: 'user', content: String(m.content || '') };
  });
}

// ───────────────────────────── Mock (sin claves) ─────────────────────────────

/**
 * Proveedor falso y determinista para desarrollar la UI y probar acciones sin gastar:
 *   "/tool highlight {"target":"#precios","message":"Aquí"}"  → llama a esa herramienta
 *   "precios" / "persona" / "correo" / "saldo"                → atajos de la demo
 *   eventos proactivos → saluda la primera vez, NOOP el resto
 */
function mockProvider() {
  return {
    name: 'mock',
    model: 'mock',
    async step({ messages, tools, locale }) {
      const t = translator(locale || serverLocale());
      const last = messages[messages.length - 1];
      const has = (n) => tools.some((t) => t.name === n);
      const reply = (text, toolCalls = []) => ({ text, toolCalls, finishReason: toolCalls.length ? 'tool_use' : 'end_turn', provider: 'mock' });
      const call = (name, args) => [{ id: `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name, args }];

      // Guiones de varios pasos (demo del panel): el paso = nº de resultados desde el último mensaje del usuario.
      const lastUserIdx = messages.findLastIndex((m) => m.role === 'user' && !String(m.content).includes('<evento_del_sistema>'));
      const userBody = String(messages[lastUserIdx]?.content || '').split('</user_state>').pop().trim();
      const script = (last.role === 'tool' || messages.length - 1 === lastUserIdx) && panelScript(userBody, has, t);
      if (script) {
        const done = messages.slice(lastUserIdx + 1).filter((m) => m.role === 'tool');
        if (done.at(-1)?.isError) return reply(t('server.mock.failed', { name: done.at(-1).name, error: String(done.at(-1).content).slice(0, 200) }));
        if (done.length < script.steps.length) {
          const [name, args, say = ''] = script.steps[done.length];
          return reply(say, call(name, args));
        }
        return reply(script.end);
      }

      if (last.role === 'tool') {
        // Tras una intervención proactiva, nada más que decir (ya lo dijo el bocadillo o la tarjeta).
        if (String(messages.findLast((m) => m.role === 'user')?.content || '').includes('<evento_del_sistema>')) return reply('');
        if (!last.isError && /^(tour|point_at|go_home)$/.test(last.name)) return reply(t('server.mock.moreHelp'));
        if (last.name === 'llamar_por_apuchat') return reply(last.isError ? t('server.mock.callFailed', { error: last.content }) : t('server.mock.calling'));
        const short = String(last.content).slice(0, 300);
        return reply(last.isError ? t('server.mock.failed', { name: last.name, error: short }) : t('server.mock.done', { name: last.name, result: short.length < 120 ? short : '' }).trim());
      }

      const content = String(last.content || '');
      const body = content.split('</user_state>').pop().trim();
      if (body.startsWith('<evento_del_sistema>')) {
        if (/primera vez/.test(body) && has('tour'))
          return reply(t('server.mock.helloCompanion'));
        if (/primera vez/.test(body) && has('panel_obtener_estado'))
          return reply(t('server.mock.helloPanel'));
        if (/primera vez/.test(body)) return reply(t('server.mock.hello'));
        if (/navegación a .* terminó/.test(body)) return reply(t('server.mock.newPage'));
        const pro = proactiveIntent(body, has, t);
        if (pro) return reply(pro[0], call(pro[1], pro[2]));
        return reply('NOOP');
      }

      const m = body.match(/^\/tool\s+([\w-]+)\s*(\{[\s\S]*\})?\s*$/);
      if (m) return reply('', call(m[1], m[2] ? safeJson(m[2]) : {}));
      const q = body.toLowerCase();
      const buddy = has('tour') && companionIntent(q, has, t);
      if (buddy) return reply(buddy[0], call(buddy[1], buddy[2]));
      if (/precio|pre[çc]o|plan|cu[aá]nto cuesta|price|pricing/.test(q) && has('highlight')) return reply(t('server.mock.showPrices'), call('highlight', { target: '#precios', message: t('server.mock.pricesHere') }));
      if (/ll[aá]mame|llamada|hablar por voz|call me|me liga|ligar/.test(q) && has('llamar_por_apuchat')) return reply(t('server.mock.callingNow'), call('llamar_por_apuchat', {}));
      if (/saldo|balance/.test(q) && has('consultar_saldo')) return reply('', call('consultar_saldo', {}));
      if (/persona|humano|agente real|person|human|pessoa/.test(q) && has('escalate_to_human')) return reply('', call('escalate_to_human', { reason: t('server.mock.escalateReason'), summary: body.slice(0, 300) }));
      if (/correo|email|mensaje|message|mensagem/.test(q) && has('send_email_ticket')) return reply('', call('send_email_ticket', { subject: t('server.mock.emailSubject'), message: body.slice(0, 500), category: t('server.mock.emailCategory') }));
      return reply(t('server.mock.echo', { text: body.slice(0, 120) }));
    },
  };
}

/** Proactividad (demo): en nivel atrevido, el mock enseña cosas por su cuenta. */
function proactiveIntent(body, has, t) {
  const bold = /iniciativa ALTO/.test(body);
  const target = body.match(/\(elemento: ([^)]+)\)/)?.[1];
  const point = (sel, msg) => (has('point_at') ? [msg, 'point_at', { target: sel, message: msg }] : ['', 'highlight', { target: sel, message: msg, seconds: 5 }]);
  if (/varios clicks seguidos/.test(body) && target) return point(target, t('server.mock.pro.clicks'));
  if (!bold || !has('show_card')) return null;
  if (/acaba de entrar al sitio/.test(body))
    return [t('server.mock.pro.welcomeSay'), 'show_card', { target: 'h1', title: t('server.mock.pro.welcomeTitle'), content: t('server.mock.pro.welcomeContent'), questions: [t('server.mock.pro.qTour'), t('server.mock.pro.qPrices')] }];
  const section = body.match(/llegar a la sección "([^"]+)"/)?.[1];
  if (section && target) {
    if (/precio|plan|starter|pro\b|business/i.test(section))
      return [
        t('server.mock.pro.plansSay'),
        'show_card',
        {
          target,
          title: t('server.mock.pro.plansTitle'),
          facts: [
            { label: 'Starter', value: t('server.mock.pro.perUser', { price: 5 }) },
            { label: 'Pro', value: t('server.mock.pro.perUser', { price: 12 }) },
            { label: 'Business', value: t('server.mock.pro.perUser', { price: 25 }) },
            { label: t('server.mock.pro.trial'), value: t('server.mock.pro.trialValue') },
          ],
          questions: [t('server.mock.pro.qWhich')],
        },
      ];
    return point(target, t('server.mock.pro.section', { section }));
  }
  const selected = body.match(/«([^»]+)»/)?.[1];
  if (selected)
    return ['', 'show_card', { target, title: t('server.mock.pro.selTitle'), content: t('server.mock.pro.selContent', { text: selected.slice(0, 80) }), questions: [t('server.mock.pro.qSimpler')], tone: 'tip' }];
  if (/sin decidirse a pulsarlo/.test(body) && target) return point(target, t('server.mock.pro.hesitate'));
  if (/quieto en esta parte/.test(body))
    return ['', 'show_card', { title: t('server.mock.pro.tipTitle'), content: t('server.mock.pro.tipContent'), tone: 'tip', seconds: 12 }];
  if (/salido por arriba/.test(body))
    return [t('server.mock.pro.exitSay'), 'show_card', { title: t('server.mock.pro.exitTitle'), content: t('server.mock.pro.exitContent'), questions: [t('server.mock.pro.qDoubt')], seconds: 15 }];
  return null;
}

/** Modo compañero (demo): recorrido por la página o señalar algo conocido. */
function companionIntent(q, has, t) {
  const panel = has('panel_obtener_estado');
  if (/ens[eé]ñame la p[aá]gina|recorrido|tour|vis[ií]ta guiada|qu[eé] hay aqu[ií]|show me the page|mostre a p[aá]gina/.test(q)) {
    const steps = panel
      ? [
          { target: '#tab-resumen', message: t('server.mock.tour.panelSummary') },
          { target: '#tab-archivos', message: t('server.mock.tour.panelFiles') },
          { target: '#tab-equipo', message: t('server.mock.tour.panelTeam') },
          { target: '#tab-ajustes', message: t('server.mock.tour.panelSettings') },
          { target: '#btn-login', message: t('server.mock.tour.panelLogin') },
        ]
      : [
          { target: 'h1', message: t('server.mock.tour.siteWelcome') },
          { target: '#funciones', message: t('server.mock.tour.siteFeatures') },
          { target: '#precios', message: t('server.mock.tour.sitePrices') },
          { target: '#faq', message: t('server.mock.tour.siteFaq') },
          { target: '#contacto', message: t('server.mock.tour.siteContact') },
        ];
    return [t('server.mock.tour.go'), 'tour', { steps }];
  }
  const m = q.match(/(?:d[oó]nde (?:est[aá]n?|queda|puedo)|se[ñn]ala(?:me)?|mu[eé]strame d[oó]nde)\s+(.+?)[?¿!.]*$/);
  if (!m) return null;
  const known = [
    [/precio|plan/, '#precios', 'prices'],
    [/login|sesi[oó]n|entrar/, '#btn-login', 'login'],
    [/contacto|escrib/, '#contacto', 'contact'],
    [/faq|pregunta|duda/, '#faq', 'faq'],
    [/funci/, '#funciones', 'features'],
    [/ajuste|configura|tema/, '#tab-ajustes', 'settings'],
    [/archivo|carpeta/, '#tab-archivos', 'files'],
    [/equipo|invita|miembro/, '#tab-equipo', 'team'],
    [/busca/, '#buscar', 'search'],
  ].find(([re]) => re.test(m[1]));
  return known ? ['', 'point_at', { target: known[1], message: t(`server.mock.point.${known[2]}`) }] : null;
}

/** Frases de la demo del panel → secuencia de herramientas [nombre, args, texto]. */
function panelScript(body, has, t) {
  if (!has('panel_obtener_estado')) return null;
  const q = body.toLowerCase();
  const mouse = /ens[eé]ñame|mu[eé]strame|con el rat[oó]n|a mano|c[oó]mo se/.test(q);
  const tab = (id) => ['click', { target: `#tab-${id}` }];
  let m;
  if ((m = q.match(/\b(modo|tema)\s+(oscuro|claro|sistema)/))) {
    const tema = m[2];
    if (mouse)
      return {
        steps: [tab('ajustes'), ['click', { target: `input[name=tema][value=${tema}]` }], ['click', { target: '#form-ajustes [type=submit]' }]],
        end: t('server.mock.panel.themeMouse', { theme: tema }),
      };
    return { steps: [['panel_actualizar_ajustes', { tema }]], end: t('server.mock.panel.themeDone', { theme: tema }) };
  }
  if ((m = body.match(/carpeta\s+(?:llamada\s+|que se llame\s+)?[«"']?([\p{L}\p{N} _-]{1,40}?)[»"']?\s*$/iu)) && /crea|nueva|haz/.test(q)) {
    const nombre = m[1].trim();
    if (mouse)
      return {
        steps: [tab('archivos'), ['click', { target: '#btn-nueva-carpeta' }, t('server.mock.panel.openFolder')], ['type_text', { target: '#nombre-carpeta', text: nombre }], ['press_key', { key: 'Enter', target: '#nombre-carpeta' }]],
        end: t('server.mock.panel.folderMouse', { name: nombre }),
      };
    return { steps: [['panel_crear_carpeta', { nombre }]], end: t('server.mock.panel.folderDone', { name: nombre }) };
  }
  if ((m = body.match(/(?:mueve|arrastra|pasa)\s+(?:el archivo\s+)?(\S+\.\w{2,5})\s+a\s+(?:la carpeta\s+)?(.+?)\s*$/i))) {
    const [, archivo, carpeta] = m;
    const folder = carpeta.charAt(0).toUpperCase() + carpeta.slice(1);
    return {
      steps: [tab('archivos'), ['drag_and_drop', { source: `[data-file="${archivo}"]`, target: `[data-folder="${folder}"]` }, t('server.mock.panel.dragging', { file: archivo, folder })]],
      end: t('server.mock.panel.moved', { file: archivo, folder }),
    };
  }
  if ((m = body.match(/busca\s+(.+?)\s*$/i)))
    return { steps: [tab('archivos'), ['type_text', { target: '#buscar', text: m[1], clear: true }]], end: t('server.mock.panel.filtered', { query: m[1] }) };
  if ((m = body.match(/invita\s+a\s+(\S+@\S+?)(?:\s+como\s+(lector|editor|admin))?\s*$/i)) && has('invitar_miembro'))
    return { steps: [tab('equipo'), ['invitar_miembro', { email: m[1], rol: m[2] || 'lector' }]], end: t('server.mock.panel.invited', { email: m[1] }) };
  if (/ajustes|configuraci[oó]n/.test(q) && /qu[eé]|c[oó]mo|mis/.test(q))
    return { steps: [['panel_obtener_estado', {}]], end: t('server.mock.panel.state') };
  return null;
}

// ───────────────────────────── helpers ─────────────────────────────

function safeJson(s) {
  try {
    const v = JSON.parse(s || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Asegura un JSON Schema de tipo objeto válido para ambos proveedores. */
function normalizeSchema(schema) {
  const s = schema && typeof schema === 'object' ? { ...schema } : {};
  delete s.$schema;
  if (s.type !== 'object') return { type: 'object', properties: {}, ...(s.type ? {} : s) };
  s.properties ??= {};
  return s;
}
