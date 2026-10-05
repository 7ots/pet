/**
 * Acciones incluidas por defecto: las "manos" del agente sobre la página.
 *
 *   get_page_context · find_on_page · read_element       (percepción)
 *   navigate · scroll_to · click · fill_form             (ejecución)
 *   hover · type_text · press_key · drag_and_drop · scroll   (ratón y teclado, con VirtualPointer)
 *   highlight · show_card · show_toast · show_modal · open_sidebar · close_panels   (interfaz)
 *
 * Todas reciben los elementos como `target`: un ref del snapshot ("e12") o un selector CSS.
 * Se pueden desactivar con config.builtins = { exclude: ['click', ...] }.
 */

import { revealElement } from '../ui/UIManager.js';
import { translator } from '../i18n/index.js';
import '../i18n/messages/widget.js';

const TARGET = {
  type: 'string',
  description: 'Ref del elemento según el contexto (p. ej. "e12"). Solo si no hay ref, un selector CSS.',
};

/**
 * @param {object} opt
 * @param {object} [opt.navigation]  { allowedOrigins: string[], router?: (url) => void|Promise }
 * @param {'submit'|'all'|'none'} [opt.confirmClicks='submit']
 * @param {(url, reason) => void} [opt.beforeNavigate]  lo usa AgentWidget para persistir estado
 * @param {import('../ui/VirtualPointer.js').VirtualPointer} [opt.pointer]  ratón/teclado visibles
 * @param {(key: string, vars?: object) => string} [opt.t]  traductor de lo que ve el usuario
 *   (confirmaciones, botones). Las descripciones y resultados son para el LLM y no se traducen.
 */
export function createBuiltinActions({ navigation = {}, confirmClicks = 'submit', beforeNavigate = null, pointer = null, t = translator() } = {}) {
  const allowedOrigins = [location.origin, ...(navigation.allowedOrigins || [])];

  /** @returns {Element} o lanza un error legible para el LLM */
  const need = (context, target) => {
    const el = context.resolve(target);
    if (!el) throw new Error(`No encontré el elemento "${target}". Pide get_page_context o usa find_on_page.`);
    return el;
  };

  /** Campos que el agente no puede escribir ni leer: los rellena el usuario. */
  const assertWritable = (context, el) => {
    if (el.matches('input[type=password], [autocomplete^=cc-], [autocomplete=one-time-code]') || context._isPrivate?.(el)) {
      throw new Error('Es un campo privado (contraseña, tarjeta, código…): pide al usuario que lo escriba él.');
    }
  };

  /** Enlaces: solo a orígenes permitidos, y guardando el estado si salen de la página. */
  const checkLink = (el) => {
    const a = el.closest?.('a[href]');
    if (!a) return null;
    const dest = new URL(a.getAttribute('href'), location.href);
    if (/^https?:$/.test(dest.protocol) && !allowedOrigins.includes(dest.origin)) {
      return `Ese enlace sale a ${dest.origin}, que no está permitido.`;
    }
    if (dest.origin === location.origin && dest.pathname !== location.pathname) beforeNavigate?.(dest.href, 'click en enlace');
    return null;
  };

  /** ¿Pulsar Enter / este botón envía un formulario? */
  const submits = (el) =>
    !!el?.matches?.('[type=submit], form button:not([type]), [data-ots-confirm]') ||
    (!!el?.form && el.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=button])'));

  /**
   * Confirmación al enviar: el sitio decide con data-ots-confirm en el botón o en su <form>
   * ("false" = no preguntar, texto = la pregunta). Si no dice nada, `fallback`.
   */
  const submitConfirm = (el, fallback) => {
    const c = el?.dataset?.otsConfirm ?? el?.form?.dataset?.otsConfirm ?? el?.closest?.('form')?.dataset?.otsConfirm;
    if (c === 'false') return false;
    return c && c !== 'true' ? c : fallback;
  };

  return [
    // ─────────────── percepción ───────────────
    {
      name: 'get_page_context',
      category: 'perception',
      description: 'Vuelve a leer la página actual (estructura, sección visible, elementos con refs, formularios). Úsalo tras navegar, hacer click o si los refs dejaron de funcionar.',
      parameters: { type: 'object', properties: {} },
      handler: async (_, { context }) => ({ ok: true, data: context.toMarkdown() }),
    },
    {
      name: 'find_on_page',
      category: 'perception',
      description: 'Busca en toda la página elementos, títulos o secciones por texto (aunque no estén en el contexto). Devuelve refs.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Texto a buscar, p. ej. "precios" o "iniciar sesión"' } },
        required: ['query'],
      },
      handler: async ({ query }, { context }) => {
        const found = context.search(query);
        return found.length ? { ok: true, data: found } : { ok: false, error: `Nada coincide con "${query}".` };
      },
    },
    {
      name: 'read_element',
      category: 'perception',
      description: 'Lee el texto completo de un elemento o sección (p. ej. una tabla de precios o unos términos).',
      parameters: { type: 'object', properties: { target: TARGET }, required: ['target'] },
      handler: async ({ target }, { context }) => {
        const text = context.readElement(target);
        return text == null ? { ok: false, error: `No encontré "${target}".` } : { ok: true, data: text };
      },
    },

    // ─────────────── ejecución ───────────────
    {
      name: 'navigate',
      category: 'execution',
      description: 'Lleva al usuario a otra página del sitio. Acepta rutas relativas ("/precios") o URLs de dominios permitidos.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Ruta o URL destino' },
          reason: { type: 'string', description: 'Qué quieres hacer al llegar (para continuar la guía en la página nueva)' },
        },
        required: ['url'],
      },
      handler: async ({ url, reason = '' }) => {
        let dest;
        try {
          dest = new URL(url, location.href);
        } catch {
          return { ok: false, error: 'URL inválida' };
        }
        if (!/^https?:$/.test(dest.protocol) || !allowedOrigins.includes(dest.origin)) {
          return { ok: false, error: `No tengo permiso para navegar a ${dest.origin}. Solo: ${allowedOrigins.join(', ')}` };
        }
        if (dest.href === location.href) return { ok: true, data: 'Ya estás en esa página.' };
        if (typeof navigation.router === 'function') {
          // SPA: el router del sitio navega sin recargar; el agente sigue vivo.
          await navigation.router(dest.origin === location.origin ? dest.pathname + dest.search + dest.hash : dest.href);
          await new Promise((r) => setTimeout(r, 600)); // deja renderizar la vista nueva
          return { ok: true, data: `Navegado a ${dest.pathname}. Llama a get_page_context para ver la página nueva.` };
        }
        if (dest.origin === location.origin && dest.pathname === location.pathname && dest.search === location.search && dest.hash) {
          location.hash = dest.hash;
          return { ok: true, data: `Desplazado a ${dest.hash}` };
        }
        // Navegación completa: se persiste la conversación y el agente retoma en la página nueva.
        beforeNavigate?.(dest.href, reason);
        setTimeout(() => location.assign(dest.href), 350);
        return { ok: true, data: 'Navegando… la conversación continúa en la página nueva.', terminal: true };
      },
    },
    {
      name: 'scroll_to',
      category: 'execution',
      description: 'Desplaza la página hasta un elemento o sección.',
      parameters: { type: 'object', properties: { target: TARGET }, required: ['target'] },
      handler: async ({ target }, { context }) => {
        revealElement(need(context, target));
        return { ok: true, data: 'Listo' };
      },
    },
    {
      name: 'click',
      category: 'execution',
      description: 'Mueve el ratón hasta un botón, enlace, pestaña o control y hace click (o doble click / click derecho) en nombre del usuario.',
      parameters: {
        type: 'object',
        properties: {
          target: TARGET,
          double: { type: 'boolean', description: 'Doble click' },
          button: { type: 'string', enum: ['left', 'right'], description: 'right = menú contextual' },
        },
        required: ['target'],
      },
      confirm: confirmClicks === 'none' ? false : (args, { context }) => {
        // Pide confirmación para envíos (o para todo si confirmClicks === 'all').
        const el = context.resolve(args.target);
        const isSubmit = el?.matches?.('[type=submit], form button:not([type]), [data-ots-confirm]');
        if (isSubmit) return submitConfirm(el, t('widget.confirm.click', { label: labelOf(el) || args.target }));
        if (confirmClicks === 'all') return t('widget.confirm.click', { label: labelOf(el) || args.target });
        return false;
      },
      handler: async ({ target, double = false, button = 'left' }, { context, ui }) => {
        const el = need(context, target);
        const blocked = checkLink(el);
        if (blocked) return { ok: false, error: blocked };
        if (pointer) {
          await pointer.click(el, { double, button });
        } else {
          revealElement(el);
          ui.highlight(el, { duration: 900, scroll: false });
          await sleep(450);
          el.focus?.({ preventScroll: true });
          el.click();
          if (double) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        }
        await sleep(300);
        return { ok: true, data: `Click en "${labelOf(el)}". Si la página cambió, llama a get_page_context.` };
      },
    },
    {
      name: 'hover',
      category: 'execution',
      description: 'Pasa el ratón por encima de un elemento (menús o tooltips que se abren al pasar el ratón). Si el menú no aparece, prueba con click.',
      parameters: { type: 'object', properties: { target: TARGET }, required: ['target'] },
      enabled: () => !!pointer,
      handler: async ({ target }, { context }) => {
        await pointer.hover(need(context, target));
        await sleep(250);
        return { ok: true, data: 'Ratón encima. Llama a get_page_context si esperabas que apareciera algo.' };
      },
    },
    {
      name: 'type_text',
      category: 'execution',
      description: 'Escribe con el teclado en un campo, tecla a tecla, como lo haría el usuario (buscadores, editores, campos que reaccionan al escribir). Para rellenar varios campos a la vez usa fill_form.',
      parameters: {
        type: 'object',
        properties: {
          target: { ...TARGET, description: 'Campo donde escribir. Si se omite, el que tenga el foco.' },
          text: { type: 'string', description: 'Texto a escribir. "\\n" = salto de línea en áreas de texto.' },
          clear: { type: 'boolean', description: 'Borra el contenido actual antes de escribir' },
          submit: { type: 'boolean', description: 'Pulsa Enter al terminar (envía búsquedas o formularios)' },
        },
        required: ['text'],
      },
      enabled: () => !!pointer,
      confirm: (args, { context }) => {
        if (!args.submit) return false;
        const el = args.target ? context.resolve(args.target) : document.activeElement;
        return el?.form ? submitConfirm(el, t('widget.confirm.typeSubmit')) : false;
      },
      handler: async ({ target, text, clear = false, submit = false }, { context }) => {
        const el = target ? need(context, target) : null;
        const field = el || document.activeElement;
        if (field && field !== document.body) assertWritable(context, field);
        const typed = await pointer.type(el, text, { clear });
        if (submit) await pointer.press('Enter');
        return { ok: true, data: `Escrito en "${labelOf(typed)}"${submit ? ' y pulsado Enter' : ''}.` };
      },
    },
    {
      name: 'press_key',
      category: 'execution',
      description: 'Pulsa una tecla o atajo: Enter, Tab, Shift+Tab, Escape, ArrowDown, ArrowUp, Backspace, Space, PageDown, Control+a… Sobre el elemento indicado o el que tenga el foco.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Tecla o combinación, p. ej. "Enter" o "Shift+Tab"' },
          target: { ...TARGET, description: 'Elemento donde pulsar (opcional: por defecto el que tiene el foco)' },
          times: { type: 'integer', description: 'Repeticiones (1-20), p. ej. ArrowDown 3 veces' },
        },
        required: ['key'],
      },
      enabled: () => !!pointer,
      confirm: (args, { context }) => {
        if (!/^(enter|return)$/i.test(args.key.trim())) return false;
        const el = args.target ? context.resolve(args.target) : document.activeElement;
        return submits(el) ? submitConfirm(el, t('widget.confirm.enterSubmit', { label: labelOf(el) })) : false;
      },
      handler: async ({ key, target, times = 1 }, { context }) => {
        if (!/^((ctrl|control|shift|alt|meta|cmd)\+)*[\w ]{1,12}$/i.test(key.trim())) return { ok: false, error: `Tecla no válida: "${key}"` };
        const el = target ? need(context, target) : null;
        const n = Math.min(20, Math.max(1, Math.floor(times)));
        let focused = null;
        for (let i = 0; i < n; i++) focused = await pointer.press(key, i === 0 ? el : null);
        return { ok: true, data: `Pulsado ${key}${n > 1 ? ` ×${n}` : ''}. Foco en: "${labelOf(focused) || focused?.tagName?.toLowerCase() || 'la página'}".` };
      },
    },
    {
      name: 'drag_and_drop',
      category: 'execution',
      description: 'Arrastra un elemento con el ratón y lo suelta sobre otro (mover tarjetas, archivos a carpetas, reordenar listas).',
      parameters: {
        type: 'object',
        properties: {
          source: { ...TARGET, description: 'Elemento a arrastrar' },
          target: { ...TARGET, description: 'Dónde soltarlo' },
        },
        required: ['source', 'target'],
      },
      enabled: () => !!pointer,
      confirm: (args, { context }) => (context.resolve(args.target)?.dataset?.otsConfirm || false),
      handler: async ({ source, target }, { context }) => {
        const src = need(context, source);
        const dst = need(context, target);
        await pointer.drag(src, dst);
        await sleep(300);
        return { ok: true, data: `Arrastrado "${labelOf(src)}" a "${labelOf(dst)}". Comprueba el resultado con get_page_context.` };
      },
    },
    {
      name: 'scroll',
      category: 'execution',
      description: 'Gira la rueda del ratón: desplaza la página o un panel con scroll propio (listas, tablas, chats) en una dirección.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
          amount: { type: 'number', description: 'Pantallas a desplazar (por defecto 1)' },
          target: { ...TARGET, description: 'Panel a desplazar (opcional: por defecto la página)' },
        },
        required: ['direction'],
      },
      enabled: () => !!pointer,
      handler: async ({ direction, amount = 1, target }, { context }) => {
        await pointer.scroll(direction, amount, target ? need(context, target) : null);
        return { ok: true, data: 'Desplazado. Llama a get_page_context para ver lo que hay ahora.' };
      },
    },
    {
      name: 'fill_form',
      category: 'execution',
      description: 'Rellena campos de un formulario con datos que el usuario te dio. Nunca inventes datos personales. No envía el formulario salvo submit=true.',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            description: 'Campos a rellenar',
            items: {
              type: 'object',
              properties: {
                target: TARGET,
                value: { type: 'string', description: 'Valor. Para checkbox: "true"/"false". Para select: texto u opción.' },
              },
              required: ['target', 'value'],
            },
          },
          submit: { type: 'boolean', description: 'Si true, envía el formulario después (pide confirmación al usuario).' },
        },
        required: ['fields'],
      },
      confirm: (args) => (args.submit ? t('widget.confirm.fillSubmit') : false),
      handler: async ({ fields, submit = false }, { context, ui }) => {
        const report = [];
        let form = null;
        for (const f of fields) {
          const el = context.resolve(f.target);
          if (!el) { report.push(`✗ ${f.target}: no encontrado`); continue; }
          try {
            assertWritable(context, el);
          } catch {
            report.push(`✗ ${f.target}: campo privado, el usuario debe escribirlo`);
            continue;
          }
          try {
            if (pointer && isTextField(el)) {
              await pointer.type(el, f.value, { clear: true });
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (pointer && el.matches('input[type=checkbox], input[type=radio]')) {
              const want = el.type === 'radio' || /^(true|1|s[ií]|yes|on)$/i.test(String(f.value));
              if (el.checked !== want) await pointer.click(el);
            } else {
              if (pointer) await pointer.moveTo(el);
              setFieldValue(el, f.value);
            }
            if (!pointer) ui.highlight(el, { duration: 1200, scroll: false });
            report.push(`✓ ${labelOf(el) || f.target}`);
            form = form || el.form;
          } catch (err) {
            report.push(`✗ ${f.target}: ${err.message}`);
          }
        }
        if (submit) {
          if (!form) return { ok: false, error: 'No encontré el formulario para enviarlo.', data: report };
          form.requestSubmit ? form.requestSubmit() : form.submit();
          report.push('Formulario enviado');
        }
        return { ok: true, data: report.join('\n') };
      },
    },

    // ─────────────── interfaz ───────────────
    {
      name: 'highlight',
      category: 'ui',
      description: 'Resalta visualmente un elemento de la página con un mensaje opcional para guiar al usuario ("haz click aquí").',
      parameters: {
        type: 'object',
        properties: {
          target: TARGET,
          message: { type: 'string', description: 'Texto corto que aparece junto al elemento' },
          seconds: { type: 'number', description: 'Duración (por defecto 6)' },
        },
        required: ['target'],
      },
      handler: async ({ target, message = '', seconds = 6 }, { context, ui }) => {
        ui.highlight(need(context, target), { message, duration: Math.min(30, Math.max(1, seconds)) * 1000 });
        return { ok: true, data: 'Resaltado' };
      },
    },
    {
      name: 'show_card',
      category: 'ui',
      description:
        'Despliega una tarjeta de información junto a un elemento de la página (o junto a ti si no das target): ' +
        'título, texto breve, datos clave (p. ej. precio, plazo, límite) y hasta 3 preguntas rápidas que el usuario puede pulsar. ' +
        'Úsala para MOSTRAR información sin que el usuario tenga que leer toda la página. No bloquea: sigue hablando mientras.',
      parameters: {
        type: 'object',
        properties: {
          target: { ...TARGET, description: 'Elemento junto al que aparece (opcional)' },
          title: { type: 'string' },
          content: { type: 'string', description: 'Markdown breve (2-4 líneas o una lista corta)' },
          facts: {
            type: 'array',
            maxItems: 6,
            description: 'Datos clave en formato etiqueta/valor',
            items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] },
          },
          questions: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'Preguntas rápidas que el usuario puede pulsar para seguir' },
          tone: { type: 'string', enum: ['info', 'tip', 'warning', 'success'] },
          seconds: { type: 'number', description: 'Se cierra sola tras N segundos (0 = no)' },
        },
        required: ['title'],
      },
      handler: async ({ target, title, content = '', facts = [], questions = [], tone = 'info', seconds = 0 }, { context, ui, agent }) => {
        const el = target ? need(context, target) : null;
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) {
            revealElement(el);
            await sleep(450);
          }
        }
        ui.card({
          title,
          content,
          facts,
          target: el,
          tone,
          duration: Math.min(120, Math.max(0, seconds)) * 1000,
          actions: questions.map((q) => ({ label: q, onClick: () => agent?.ask(q) })),
        });
        return { ok: true, data: 'Tarjeta mostrada' };
      },
    },
    {
      name: 'show_toast',
      category: 'ui',
      description: 'Muestra una notificación breve en la esquina (confirmaciones, avisos).',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          type: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
        },
        required: ['message'],
      },
      handler: async ({ message, type = 'info' }, { ui }) => {
        ui.toast({ message, type });
        return { ok: true, data: 'Mostrado' };
      },
    },
    {
      name: 'show_modal',
      category: 'ui',
      description: 'Abre una ventana emergente con información (markdown) o una plantilla del sitio. Si das "options", espera a que el usuario elija y devuelve su elección.',
      timeoutMs: 180000,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string', description: 'Markdown simple (sin HTML)' },
          template: { type: 'string', description: 'Nombre de una plantilla registrada por el sitio (opcional)' },
          data: { type: 'object', description: 'Datos para la plantilla' },
          options: { type: 'array', items: { type: 'string' }, description: 'Botones de elección (máx. 4)' },
        },
        required: ['title'],
      },
      handler: async ({ title, content = '', template, data, options = [] }, { ui }) => {
        const actions = options.slice(0, 4).map((o, i) => ({ label: o, value: o, primary: i === options.length - 1 }));
        if (!actions.length) {
          ui.modal({ title, content, template, data, actions: [{ label: t('widget.dialog.gotIt'), value: 'ok', primary: true }] });
          return { ok: true, data: 'Modal mostrado' };
        }
        const choice = await ui.modal({ title, content, template, data, actions });
        return { ok: true, data: choice ? `El usuario eligió: ${choice}` : 'El usuario cerró sin elegir' };
      },
    },
    {
      name: 'open_sidebar',
      category: 'ui',
      description: 'Abre un panel lateral con información extensa (pasos a seguir, comparativas, resultados) sin tapar la página.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string', description: 'Markdown simple' },
          template: { type: 'string' },
          data: { type: 'object' },
        },
        required: ['title'],
      },
      handler: async ({ title, content = '', template, data }, { ui }) => {
        ui.sidebar({ title, content, template, data });
        return { ok: true, data: 'Panel abierto' };
      },
    },
    {
      name: 'close_panels',
      category: 'ui',
      description: 'Cierra modales, paneles laterales y resaltados abiertos por el asistente.',
      parameters: { type: 'object', properties: {} },
      handler: async (_, { ui }) => {
        ui.closeAll();
        return { ok: true, data: 'Cerrado' };
      },
    },
  ];
}

// ───────────────────────────── helpers DOM ─────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTextField(el) {
  return el.tagName === 'TEXTAREA' || el.isContentEditable ||
    (el.tagName === 'INPUT' && /^(text|search|email|url|tel|number)$/.test(el.type || 'text'));
}

function labelOf(el) {
  if (!el) return '';
  // Campos: su etiqueta, nunca lo escrito dentro. Botones y demás: su texto.
  const field = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(submit|button|reset)$/.test(el.type);
  const label = field ? el.labels?.[0]?.innerText : el.innerText || el.value;
  return (el.getAttribute('aria-label') || label || el.placeholder || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * Asigna un valor como lo haría un usuario, compatible con React/Vue/Angular:
 * usa el setter nativo y dispara input/change para que el framework lo detecte.
 */
export function setFieldValue(el, value) {
  const v = String(value);
  if (el.isContentEditable) {
    el.focus();
    el.textContent = v;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return;
  }
  const tag = el.tagName;
  if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
    const want = el.type === 'radio' ? true : /^(true|1|s[ií]|yes|on)$/i.test(v);
    if (el.checked !== want) el.click();
    return;
  }
  if (tag === 'SELECT') {
    const norm = (s) => s.toLowerCase().trim();
    const opt = [...el.options].find((o) => norm(o.value) === norm(v) || norm(o.text) === norm(v)) ||
      [...el.options].find((o) => norm(o.text).includes(norm(v)));
    if (!opt) throw new Error(`opción "${v}" no existe`);
    setNative(el, HTMLSelectElement.prototype, opt.value);
    return;
  }
  if (tag === 'TEXTAREA') return setNative(el, HTMLTextAreaElement.prototype, v);
  if (tag === 'INPUT') return setNative(el, HTMLInputElement.prototype, v);
  throw new Error('no es un campo editable');
}

function setNative(el, proto, value) {
  el.focus();
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
}
