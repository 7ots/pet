<p align="center"><img src="brand/wordmark.svg" alt="7ots" width="220"></p>

<p align="center"><b>Tu compañero de IA, con cara propia.</b><br>
Un ot es tu compañero de IA con cara, personalidad y voz: vive en tu escritorio como mascota, cuida a tu agente de código, te recuerda cosas, entra a tus videollamadas y puede ser tu asistente en Orquesta.<br>
<a href="https://7ots.com">7ots.com</a> · <a href="llms.txt">llms.txt</a> · <a href="docs/ARCHITECTURE.md">Arquitectura</a> · <a href="docs/BRAND.md">Marca</a></p>

```bash
npx @7ots/cli pet                    # tu ot se muda a tu escritorio
npx @7ots/cli hooks install --claude # y escucha a Claude Code (aciertos, errores, permisos)
```

- **Mascota de escritorio.** Ventana siempre visible, terminal o tmux; tiene necesidades, sube de nivel y comenta tu trabajo.
- **Cuida a tu agente de código.** Hooks de Claude Code y de la shell (bash/zsh): te avisa cuando tu agente termina, falla o te pide permiso, y cuando un comando falla.
- **Asistente.** Recordatorios, alertas de precios y procesos, conciencia de pantalla opcional (apagada por defecto) y voz local.
- **Videollamadas y Orquesta.** Entra a llamadas de apuchat con su avatar; conectado a Orquesta, vive en un proyecto y lanza tareas.
- **Para dueños de sitios, APIs y MCP.** Registra tu servicio en [7ots.com/app#sites](https://7ots.com/app#sites) con una guía de uso
  y verificación por DNS TXT, `/.well-known` o etiqueta meta, para que todos los ots sepan cuándo y cómo usarlo (impulsado por [Prowl.world](https://prowl.world)).

> **Legacy / widget web self-hosted:** lo que sigue documenta el SDK embebible (`<ots-agent>`, `embed.js`, proxy). Sigue funcionando, pero ya no es el producto principal: instálalo solo si lo pides explícitamente.

> Estado: `0.1.0` — prototipo funcional. APIs sujetas a cambios.

---

## Inicio rápido

```bash
npm install
cp .env.example .env        # LLM_PROVIDER=mock funciona sin ninguna clave
npm run dev                 # → http://localhost:8787/examples/
```

La demo (**Nimbus**, un SaaS ficticio) incluye login con JWT, un MCP autenticado, acciones
propias, plantillas y reglas proactivas. En modo `mock` prueba a escribir:

| Escribe | Qué pasa |
|---|---|
| `precios` | resalta la sección de precios |
| `saldo` (tras iniciar sesión) | acción propia autenticada con el JWT |
| `/tool nimbus__listar_pedidos {}` | herramienta del MCP autenticado |
| `/tool navigate {"url":"./docs.html"}` | navega y retoma la conversación en la otra página |
| `/tool iniciar_prueba {"plan":"Pro"}` | diálogo de confirmación antes de ejecutar |

Para respuestas reales, en `.env`:

```bash
LLM_PROVIDER=anthropic      # usa ANTHROPIC_API_KEY · modelo por defecto claude-opus-5-5
# o
LLM_PROVIDER=openai         # usa OPENAI_API_KEY · LLM_BASE_URL para compatibles (Groq, Ollama…)
```

Otros scripts: `npm run build` (genera `dist/7ots.esm.js` y `dist/7ots.iife.js`), `npm run check` (sintaxis).

---

## Integración en tu sitio

```html
<!-- Solo si quieres avatar 3D: TalkingHead importa "three" por nombre -->
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>

<script src="/7ots/7ots.iife.js"></script>
<script>
  const agent = SevenOts.init({
    endpoint: 'https://api.tusitio.com/api/agent',   // tu proxy (server/)
    siteKey: 'pk_tusitio',                            // identificador público
    agent: { name: 'Ana', role: 'asesora', siteName: 'Acme', instructions: 'Recomienda el plan anual.' },
    avatar: { url: '/avatars/ana.glb', body: 'F' },
    auth: { getToken: () => localStorage.getItem('jwt') },
    mcp: [{ url: '/mcp', name: 'acme', requiresAuth: true }],
  });
</script>
```

O como módulo: `import { init } from '@7ots/cli'`. O declarativo:
`<ots-agent endpoint="/api/agent" site-key="pk_x" name="Ana"></ots-agent>`.

### Configuración

| Clave | Descripción |
|---|---|
| `endpoint` | URL del proxy. Obligatoria. |
| `siteKey` | Identificador público que el proxy puede exigir (`SITE_KEYS`). |
| `identity` | `true`, URL o ficha — quién es el agente: nombre, aspecto, voz, contacto (ver «Identidad del agente»). |
| `agent` | `{ name, role, siteName, language, instructions, expressive }` — personalidad e instrucciones del negocio. |
| `avatar` | `{ url, body: 'F'\|'M', mood, cameraView }` o `false`. Sin WebGL cae a un avatar 2D. |
| `voice` | `{ tts: 'proxy'\|'browser'\|false, stt: true, lang }` o `false`. |
| `auth` | `{ token }`, `{ getToken, getUser }` o `{ credentials: 'include' }` (cookies), `exposeClaims`. |
| `mcp` | `[{ url, name, requiresAuth, filter, confirm }]` — servidores MCP (Streamable HTTP). |
| `actions` | Acciones propias (ver abajo). |
| `templates` | `{ nombre: (data, { escape }) => html }` — HTML de confianza para `show_modal` / `open_sidebar`. |
| `navigation` | `{ allowedOrigins, router }` — `router` para SPAs (`url => router.push(url)`). |
| `proactive` | `{ level: 'quiet'\|'normal'\|'bold', greetDelayMs, dwellMs, idleMs, cooldownMs, maxPerSession, rules, … }` o `false` (ver «Proactividad»). |
| `context` | `{ privateSelectors, ignoreSelectors, extra: () => ({...}) }`. |
| `contact` | `{ apuchat: true, apumail: true \| { categories } }` o `false`. |
| `builtins` | `{ exclude: ['click', …], confirmClicks: 'submit'\|'all'\|'none' }`. |
| `pointer` | `{ speed, visible }` o `false` — ratón y teclado virtuales (ver abajo). |
| `pageTools` | `true` (defecto) — convierte formularios/botones con `data-ots-tool` en herramientas. |
| `mode` | `'panel'` (defecto) o `'companion'` — el avatar sale del chat y se pasea por la página. |
| `companion` | `{ size: 150, idleHomeMs: 30000, follow: true, wanderMs, watchCursor }` (solo en modo compañero). |
| `theme` | `{ primary, radius, position: 'right'\|'left', font }`. |

La referencia completa está comentada en [`src/index.js`](src/index.js).

### API en tiempo de ejecución

```js
agent.registerAction({...});          // añade una herramienta
agent.registerMcp({ url, name });     // conecta otro MCP
agent.setAuthToken(jwt);              // al hacer login/logout (null)
agent.ask('¿qué plan me conviene?');  // como si lo escribiera el usuario
agent.notify('El carrito tiene 3 productos');  // evento: el agente decide si habla
agent.say('¡Bienvenido de nuevo!');   // mensaje directo, sin LLM
agent.setProactivity('bold');         // 'quiet' | 'normal' | 'bold'
agent.setIdentity({ name: 'Brisa', look: { color: '#e11d48' } });  // identidad en caliente
agent.open(); agent.close(); agent.reset(); agent.destroy();
agent.on('action:end', ({ name, result }) => analytics.track(name));
```

Eventos: `ready`, `user:message`, `agent:message`, `agent:thinking`, `agent:error`,
`action:start`, `action:end`, `handoff:start`, `handoff:message`, `handoff:end`,
`context:route`, `context:section`, `context:alert`, `proactive:trigger`, `proactive:level`, `identity:change`, `auth:change`,
`voice:start`, `voice:end`, `widget:open`, `widget:close`.

---

## Identidad del agente: cara, voz y contacto

Muchos agentes necesitan lo mismo: un nombre, un aspecto reconocible, una voz propia y formas de
localizarlo. 7ots lo resuelve con **una sola ficha declarativa**. La usan el widget, la voz del
proxy, los canales (correo, chat, meet) y una tarjeta pública. Puedes usar este módulo sin el chat
y con tu propio cerebro.

```js
{
  id: 'nube', name: 'Nube', role: 'asesora de Nimbus', tagline: 'Te ayudo con tu almacenamiento',
  bio: '…', language: 'es', languages: ['es', 'en'],
  personality: { tone: 'cercano y claro', traits: ['paciente'], instructions: '…' },  // instructions: privado
  look:  { color: '#4f46e5', accent: '#22d3ee', emoji: '☁️', image: 'https://…/retrato.png',
           avatar: { url: '/avatars/nube.glb', body: 'F', mood: 'happy', cameraView: 'upper' },
           face: { skin: '#…', eyes: '#…' }, meetAvatar: 'vivi', meetScene: '' },
  voice: { provider: 'auto'|'openai'|'elevenlabs'|'browser', voiceId: 'coral', model: '',
           style: 'cálida y clara', lang: 'es-ES', rate: 1.05, pitch: 1, browserVoice: '' },
  contact: { site: 'https://nimbus.example', email: 'nube@nimbus.example', apuchat: 'nube',
             meet: true, call: true, hours: 'L-V 9-18' },
}
```

`defineIdentity()` normaliza la ficha y nunca lanza excepciones. Descarta los colores que no son
hex, las URLs que no son http(s) y los valores fuera de rango. **La ficha no contiene secretos.**
Las claves de TTS, apumail y apuchat siguen en el entorno del proxy.

**De dónde sale.** Cada fuente pisa a la anterior: valores por defecto ← entorno (`AGENT_NAME`,
`AGENT_ROLE`, `APUCHAT_AGENT_AVATAR`, `APUMAIL_AGENT_INBOX`…) ← `data/identity.json`. La variable
`IDENTITY_FILE` cambia la ruta del fichero, y el backoffice lo escribe. Hay un ejemplo en
[`examples/identity.example.json`](examples/identity.example.json).

**Tarjeta pública.** Rutas del proxy (todas con CORS `*`):

| Ruta | Qué es |
|---|---|
| `GET /api/agent/identity` · `GET /.well-known/7ots-agent.json` | Tarjeta JSON (`@type: 7ots/agent`). Lleva solo campos de una lista blanca y nunca las instrucciones. `contact.answers` dice qué canales atiende el agente ahora mismo. |
| `GET /api/agent/identity.vcf` | vCard 4.0, para «guardar contacto». |
| `POST /api/agent/identity/call` | Abre una videollamada de meet.apuchat.com con el agente ya dentro y devuelve `{ call_url }`. Necesita apuchat; tiene límite por IP y pasa por `SITE_KEYS`. |

**En el widget.** La opción `identity` acepta tres formas: `true` (pide `{endpoint}/identity`), una
URL o el objeto de la ficha. La identidad fija nombre, colores, avatar y voz, pero lo que pongas
explícitamente en `agent`, `avatar`, `voice` o `theme` manda sobre ella. Para cambiarla en caliente
usa `agent.setIdentity(ficha)`, que emite el evento `identity:change`.

**Solo la cara y la voz (`createFace`).** Sirve si ya tienes tu chat o tu agente:

```js
import { createFace } from '@7ots/cli';
const face = await createFace(document.querySelector('#cara'), { identity: '/api/agent/identity', endpoint: '/api/agent' });
await face.say('Hola, soy Nube');       // voz de la identidad con lip-sync
face.mood('happy'); face.gesture('thumbup');
face.morph('wings'); face.effect('hearts'); // solo con el personaje 2D
const texto = await face.listen();      // micrófono → texto
face.setIdentity(otraFicha);            // en caliente
```

**Tarjeta de contacto (`<ots-identity>`).** Muestra retrato, nombre y rol, y botones para chatear
(si hay widget), escribir un correo, copiar el @handle de apuchat, iniciar una videollamada,
escucharle y guardar la vCard:

```html
<ots-identity src="/api/agent/identity" face greeting="Hola, soy Nube."></ots-identity>
```

Emite los eventos `ots-identity:load`, `ots-identity:call` y `ots-identity:error`. También puedes
asignarle `el.identity = ficha` para no pedir nada a la red.

**En tu servidor, con tu propio cerebro (`7ots/server`):**

```js
import { createAgentIdentity } from '7ots/server';

const nube = createAgentIdentity({
  identity: { name: 'Nube', voice: { provider: 'openai', voiceId: 'coral' }, contact: { email: 'nube@nimbus.example' } },
  brain: async ({ text, channel, history, identity }) => miAgente.responder(text),  // sin brain: el LLM de 7ots
  apumail: { inbox: 'nube@nimbus.example', token: process.env.NUBE_MAIL_TOKEN },   // contesta su correo
  apuchat: { identityKey: process.env.NUBE_APUCHAT_KEY },                          // mensajes y llamadas
});
await nube.start();
http.createServer(async (req, res) => (await nube.handler(req, res)) || miApp(req, res));

nube.card(); nube.vcard(); await nube.speak('Hola');   // tarjeta, vCard, audio con su voz
await nube.respond('¿Qué planes hay?', { channel: 'dm' });
await nube.call('@ana', 'Tu copia de seguridad ha terminado');  // hace sonar la app de apuchat
```

Para probarlo, abre la demo [`/examples/identidad.html`](examples/identidad.html). Al editar la ficha
cambian a la vez la cara, la tarjeta, el widget y la tarjeta pública.

## Backoffice: configúralo todo sin tocar código

El proxy sirve un panel en **`/backoffice/`** (por ejemplo `http://localhost:8787/backoffice/`):

| Sección | Qué configura |
|---|---|
| Resumen | Estado del modelo, la voz y los canales; botón «Probar el modelo». |
| Identidad | Nombre, papel, lema, biografía, idiomas, tono, rasgos e instrucciones privadas. |
| Aspecto | **Editor de avatar** (ver abajo), colores, emoji, retrato, ánimo, encuadre 3D y avatar de videollamada. |
| Voz | Proveedor, voz, modelo, acento, velocidad, tono y estilo, con botón «Escuchar». |
| Contacto | Web, correo, @apuchat, horario, videollamadas y el menú «hablar con una persona». |
| Comportamiento | Proactividad (nivel, saludo, límites, señales), modo compañero, puntero, acciones y micrófono. |
| Widget y marca | Lado, redondeo, tipografía, color, y JSON avanzado de `init()`. |
| Privacidad y navegación | `privateSelectors`, `ignoreSelectors` y `navigation.allowedOrigins`. |
| Avanzado (servidor y claves) | Todas las variables del proxy: LLM, TTS, apumail/apuchat, límites, orígenes… |
| Instalar | El snippet de una línea (`embed.js`) y los de código, tarjeta y editor. |

- **Vista previa en vivo**: los cambios sin guardar se ven al momento en un widget de prueba.
- **Guardar** (o Ctrl+S) escribe `data/identity.json` y `data/config.json`. El snippet
  `<script src="…/api/agent/embed.js">` carga esa configuración, así que tu web no se toca.
- **Claves**: se escriben en `data/secrets.json` (permisos 0600) y nunca vuelven al navegador; solo
  se ve si están puestas. Lo guardado manda sobre `.env`, y casi todo se aplica sin reiniciar
  (el panel avisa de lo que necesita reinicio: `PORT`, `TRUST_PROXY`, `DEMO`…).
- **Acceso**: sin `ADMIN_PASSWORD` solo abre desde la propia máquina (localhost). Con ella se entra
  desde fuera con una cookie firmada (HttpOnly, SameSite=Strict). Las escrituras exigen el mismo
  origen y la cabecera `X-7ots-Admin`. Rutas: `/api/agent/admin/*`.
- Lo que no son datos (acciones con `handler`, `auth`, plantillas) sigue en tu página, en
  `window.SevenOtsConfig` o en `init()`.

## Personaje 2D y editor de avatar

El avatar por defecto es un **personaje 2D vectorial al estilo Pou**, animado (parpadea, mira el
cursor, mueve la boca con la voz, tiene ánimos y gestos). Se describe con un objeto JSON y se edita
visualmente:

- **Cuerpo**: 16 formas de partida; luego se arrastran sus 16 puntos (con simetría opcional).
- **Cara**: 33 ojos, 28 bocas, 9 cejas, 8 mejillas; posición y tamaño arrastrando.
- **Color y acabado**: color libre, 7 acabados (mate, brillo, neón…), 10 estampados, contorno.
- **Accesorios**: ~70 (gorros, coronas, lentes, pipas, barbas, capas, alas…), cada uno movible,
  escalable (rueda), rotable (Mayús+rueda), con colores propios. Hasta 16 a la vez.
- **Estilos completos**: 26 presets (pirata, rey, reina, mago, chef, vaquero, astronauta, robot,
  vikingo, ninja, fantasma…) que se pueden aplicar conservando tu forma y color.
- **Realista**: la misma pestaña permite elegir un avatar 3D `.glb` (TalkingHead) o un retrato.
- Deshacer/rehacer, exportar SVG/PNG y copiar JSON.

En la identidad se guarda en `look.kind` (`character` | `realistic` | `image`) y `look.character`.
Todo el arte es propio (MIT).

```js
import { createAvatarEditor, createCharacter } from '@7ots/cli';

// El editor, en tu propia app (también como <ots-avatar-editor>):
const ed = createAvatarEditor(el, { value: identity.look, onChange: (v) => guardar(v) });

// Solo el personaje, animado:
const ch = createCharacter(el, { preset: 'pirate' });
ch.mood('happy'); ch.gesture('jump'); ch.mouth(0.6); ch.lookAtPoint(x, y);

// Gestos (CHARACTER_GESTURES): jump, bounce, wiggle, nod, shake, spin, wave, think, celebrate,
// surprise, shrug, sneeze, hiccup, laugh, dance, yawn, shiver, clap, thumbsup, thumbsdown, point,
// bow, fly, stomp, dizzy. Alias: handup, hi, index, ok, yes, no, thumbup, side, namaste, hop, cheer.
ch.gesture('celebrate'); ch.gesture('point', { mirror: true, ms: 2000 });

// Transformaciones temporales del cuerpo (CHARACTER_MORPHS) y efectos (CHARACTER_EFFECTS):
ch.morph('wings', { ms: 3000 });             // spikes, wings, hands, horns, puff, squish, stretch, melt, jelly
ch.morph('hands', { pose: 'wave', hold: true }); ch.unmorph('hands');
ch.morph('shape:heart');                     // cambia de forma un momento y vuelve
ch.effect('hearts');                         // sparkles, sweat, blush, hearts, zzz, exclaim, question, anger…

// Lip-sync:
const s = ch.speak('Hola, ¿qué tal?', { durationMs: 1800 }); // visemas del texto; s.stop(), s.sync(charIndex)
const stop = ch.lipsync(analyserNode, { text });             // audio real (AnalyserNode) + visemas
ch.viseme('O');                                              // X A E I O U M F S C
```

Demo: [`/examples/avatar.html`](examples/avatar.html) (editor más galería de estilos) y
[`/examples/character-lab.html`](examples/character-lab.html) (gestos, transformaciones, efectos y lip-sync).

## Idiomas (i18n)

Todo el texto que ve una persona sale de catálogos de traducción: el widget, el editor de avatar,
la tarjeta de contacto, el backoffice y los mensajes del proxy. Vienen **español, inglés y
portugués** completos.

- **Widget**: `init({ locale: 'en' })`. Sin `locale` se usa `<html lang>` y luego el idioma del
  navegador; un idioma que no existe cae a inglés. En caliente: `agent.setLocale('pt')`.
  El agente responde en el idioma en que le escribe el visitante.
- **Componentes**: `createAvatarEditor(el, { locale })`, `<ots-avatar-editor lang="en">`,
  `<ots-identity lang="pt">`, `createFace(el, { locale })`.
- **Proxy**: responde en el idioma de la cabecera `Accept-Language` (el widget la envía). Los avisos
  al equipo (correo, apuchat) usan `LOCALE` o, si no está, el idioma de la identidad.
- **Backoffice**: selector de idioma en la barra lateral.

**Añadir un idioma o cambiar textos:**

```js
import { addMessages } from '@7ots/cli';             // o SevenOts.i18n.addMessages con <script>
addMessages('fr', { widget: { /* … */ } });     // claves que falten → inglés
addMessages('es', { widget: { /* … */ } });     // sobrescribe solo esas claves
```

Los catálogos de serie están en `src/i18n/messages/` y son buena plantilla para traducir. Formato:
`{nombre}` para variables y `{ one: '# mensaje', other: '# mensajes' }` para plurales
(`Intl.PluralRules`).

## Acciones propias

Cada acción es una herramienta que el LLM puede llamar. El handler corre **en el navegador**,
con la sesión del usuario:

```js
agent.registerAction({
  name: 'agregar_al_carrito',                          // [a-zA-Z0-9_-], único
  description: 'Añade un producto al carrito del usuario.',
  parameters: {
    type: 'object',
    properties: { sku: { type: 'string' }, cantidad: { type: 'integer', minimum: 1 } },
    required: ['sku'],
  },
  requiresAuth: true,                                   // solo se ofrece con sesión
  confirm: ({ sku }) => `¿Añadir **${sku}** al carrito?`, // diálogo real antes de ejecutar
  handler: async ({ sku, cantidad = 1 }, ctx) => {
    const r = await ctx.auth.fetch('/api/cart', {       // adjunta el JWT; el LLM nunca lo ve
      method: 'POST', body: JSON.stringify({ sku, cantidad }),
    });
    if (!r.ok) return { ok: false, error: 'No se pudo añadir' };
    ctx.ui.toast({ message: 'Añadido ✓', type: 'success' });
    return r.json();                                    // vuelve al LLM como resultado
  },
});
```

`ctx` = `{ auth, ui, context, bus, agent, signal, pointer }`. Los errores lanzados vuelven al LLM como
resultado de error; nunca rompen la conversación.

**Acciones incluidas:** `get_page_context`, `find_on_page`, `read_element`, `navigate`,
`scroll_to`, `click`, `hover`, `type_text`, `press_key`, `drag_and_drop`, `scroll`, `fill_form`,
`highlight`, `show_toast`, `show_modal`, `open_sidebar`, `close_panels`, más
`send_email_ticket` (apumail) y `escalate_to_human` (apuchat).

El agente prefiere siempre las **herramientas internas** (tus acciones, tu MCP, tus
`data-ots-tool`): son exactas. El ratón y el teclado quedan para lo que no tiene herramienta o
cuando el usuario pide *«enséñame cómo se hace»*.

## Ratón y teclado

Con `pointer` activo (por defecto) el agente mueve un **cursor visible con su nombre** y opera la
página como una persona: `click` (doble, derecho), `hover`, `type_text` (tecla a tecla, compatible
con React/Vue), `press_key` (Enter, Tab, flechas, Escape, `Control+a`…), `drag_and_drop` (HTML5 y
ratón) y `scroll`.

- **Esc** (del usuario) detiene al instante lo que esté haciendo y corta el turno.
- Comprueba qué hay realmente bajo el punto: si otro elemento tapa el objetivo, falla y lo dice.
- Con `prefers-reduced-motion` o la pestaña oculta, actúa sin animación.
- Nunca escribe en contraseñas, campos de tarjeta, códigos OTP ni `data-ots-private`.
- Enter o click que **envía un formulario** pide confirmación. El sitio decide con
  `data-ots-confirm` en el botón o en el `<form>`: `"false"` = sin preguntar, o el texto de la pregunta.
- Funciona también dentro de `<dialog>` modales del sitio (cursor y confirmaciones van en la capa superior).

Límite: son eventos sintéticos (`isTrusted: false`). Cubren formularios, menús, pestañas,
listas y drag & drop normales, pero el navegador no deja simular acciones protegidas: abrir el
selector de archivos, pantalla completa, copiar al portapapeles o pasar un CAPTCHA.

## Herramientas declaradas en el HTML (`data-ots-tool`)

Un formulario o botón que ya existe se convierte en herramienta con un atributo, sin JS:

```html
<form data-ots-tool="invitar_miembro"
      data-ots-description="Invita a una persona al equipo"
      data-ots-confirm="¿Invitar a {email} como {rol}?"
      data-ots-auth>
  <input name="email" type="email" required>
  <select name="rol"><option>lector</option><option>editor</option></select>
  <button>Invitar</button>
</form>
<button data-ots-tool="exportar_csv">Exportar</button>
```

Los campos con `name` son los parámetros (select/radio → enum, checkbox → boolean,
number/range → número; `required` se respeta). El agente rellena, valida y envía. Tu código
puede devolverle el resultado con
`form.dispatchEvent(new CustomEvent('ots-result', { detail: {...} }))`; si no, recibe el texto
de `[role=status]`/`[role=alert]`. La lista se actualiza sola al cambiar la página.

Demo completa: [`examples/dashboard.html`](examples/dashboard.html) — panel con ajustes,
carpetas, drag & drop e invitaciones, manejable por herramientas internas o con el ratón.

## Modo compañero (`mode: 'companion'`)

Un modo más lúdico: en vez de quedarse en el chat, el avatar flota sobre la página, camina
hasta los elementos, los **señala** (gesto + flecha + resaltado) y habla en un bocadillo.

```js
init({ mode: 'companion', companion: { size: 150 }, avatar: { cameraView: 'head', /* … */ } });
```

- Pulsarlo abre o cierra el chat; arrastrarlo lo deja donde quieras.
- El modelo tiene tres acciones más: `point_at {target, message}`, `tour {steps:[{target, message}]}`
  (visita guiada, máx. 8 pasos) y `go_home`.
- Con `follow: true` se acerca a lo que toca el ratón virtual (click, type_text, drag…), así se
  ve quién está actuando.
- Con el chat cerrado, las respuestas salen en su bocadillo (y en voz alta si la voz está activa).
- Vuelve a su rincón tras `idleHomeMs` sin actividad. Respeta `prefers-reduced-motion`.
- Con `wanderMs` se da paseos solo: se acerca con curiosidad a un título, imagen o botón visible y
  vuelve. Con `watchCursor` sigue tu ratón con la mirada. Ambos los fija el nivel de proactividad.

Pruébalo en las demos con `?modo=companion` (`examples/?modo=companion`,
`examples/dashboard.html?modo=companion`) o con el enlace «Modo compañero» del menú.

## Proactividad: cuánto se atreve el agente

El agente no espera a que le escriban: observa la página y, cuando tiene sentido, **se mueve,
señala, resalta y despliega tarjetas de información** junto a lo que estás mirando. El nivel de
iniciativa lo fija el sitio (`proactive.level`) y el visitante puede cambiarlo en el menú
«⋯ → Iniciativa» (Discreta · Normal · Atrevida); su elección se recuerda en la sesión.

| Señal | `quiet` | `normal` (defecto) | `bold` |
|---|---|---|---|
| Saludo inicial | sí | sí | sí, con tarjeta de bienvenida |
| Cambio de ruta (`onRoute`) | — | sí | sí |
| Entrar en una sección (`sectionEnterMs`) | — | — | a los 1,5 s |
| Permanencia en una sección (`dwellMs`) | — | 25 s | 12 s |
| Inactividad (`idleMs`) | 120 s, solo formularios | 45 s, solo formularios | 20 s, en cualquier parte |
| Duda sobre un botón o enlace (`hesitationMs`) | — | 4,5 s | 2,5 s |
| Clics de frustración (`rageClicks`) | sí | sí | sí |
| Texto seleccionado (`selection`) | — | — | sí |
| Intención de salir (`exitIntent`) | — | sí | sí |
| Enfriamiento / máx. por sesión | 120 s / 3 | 40 s / 8 | 10 s / 40 |
| Paseo del compañero (`wanderMs`) / mira el cursor | — / no | 45 s / sí | 18 s / sí |

Cualquier valor del nivel se puede sobrescribir en `proactive` (p. ej. `{ level: 'bold', exitIntent: false }`).
Cada evento le dice al modelo el nivel de iniciativa: en `bold` prefiere **mostrar** (`point_at`,
`show_card`, `tour`) a preguntar «¿te ayudo?». Siempre puede contestar `NOOP` y no pasa nada.

**Tarjetas (`show_card`).** Acción integrada: `{ target?, title, content, facts: [{label, value}],
questions, tone, seconds }`. Se ancla al lado del elemento (o del compañero), lo trae a la vista si
hace falta, y las preguntas son chips que el visitante pulsa para seguir la conversación.

Pruébalo: `examples/?modo=companion`, menú «⋯ → Iniciativa → Atrevida», y baja hasta «Precios».

## MCP autenticado

Si tu sitio expone un servidor MCP (transporte Streamable HTTP), sus herramientas aparecen solas
con prefijo: `mcp: [{ url: '/mcp', name: 'acme' }]` → `acme__listar_pedidos`, `acme__cambiar_plan`…

- El JWT del usuario viaja como `Authorization: Bearer` (o cookies con `credentials: 'include'`).
- Las herramientas sin `readOnlyHint: true` piden confirmación al usuario antes de ejecutarse.
- Al cambiar la sesión (`setAuthToken`) se reconecta y se vuelve a listar.

## Autenticación

El widget se engancha a la sesión que **ya tiene** tu sitio; no gestiona logins.

- El token se usa en `ctx.auth.fetch()` y en el MCP. **Nunca se envía al LLM.**
- Al LLM solo llegan los claims de `exposeClaims` (p. ej. nombre y plan) o lo que devuelva `getUser()`.
- Llama a `agent.setAuthToken(token)` al hacer login y `setAuthToken(null)` al salir.

## Contacto: apuchat y apumail

**apuchat.com — hablar con una persona.** Cuando el usuario lo pide (o el agente no puede
resolver), `escalate_to_human` crea un canal efímero en el hub de apuchat y avisa al operador por DM
con un resumen y el enlace. El chat del widget pasa a ser un chat en vivo con el operador, con
opción de videollamada (el visitante entra por `call_url_public` y "llama a la puerta").

El proxy hace de **relé** entre el widget y el canal (`/contact/apuchat/{send,wait,end}`): el hub no
acepta CORS de otros sitios y el canal exige una `identity_key` que no debe salir del servidor. El
navegador solo recibe un id y un token opacos; el enlace de operador (con claves y PIN) **nunca** le llega.

```bash
APUCHAT_HUB=https://apuchat.com
APUCHAT_NOTIFIER_IDENTITY_KEY=...   # identidad que envía el aviso por DM
APUCHAT_OPERATOR_HANDLE=soporte     # quién lo recibe (sin @; con @ el DM se pierde en silencio)
```

> - El aviso por DM se limita a 4096 caracteres (se recorta el resumen, nunca el enlace).
> - El hub permite 15 videollamadas nuevas por minuto **por IP**: todos tus visitantes comparten
>   la IP del proxy.
> - El estado del relé está en memoria: con varias instancias del proxy usa sesiones *sticky* (o
>   cambia el `Map` por Redis). Reiniciar el proxy cierra las conversaciones abiertas.

**apumail.com — correo / ticket.** `send_email_ticket` redacta un ticket con asunto, categoría y
(opcionalmente) la transcripción, lo enseña al usuario para confirmar y lo envía por el proxy.

El correo sale de **un buzón tuyo de apumail** hacia el buzón del equipo; responder a ese correo
llega directamente al visitante (`reply_to`). El destinatario es fijo en el servidor: el LLM no lo elige.

```bash
APUMAIL_INBOX=soporte@apumail.com   # buzón remitente (permanente o de dominio propio)
APUMAIL_INBOX_TOKEN=...             # token del buzón o PAT acct_… de la cuenta dueña
APUMAIL_TO=equipo@tuempresa.com     # quién recibe los tickets
```

> Los buzones gratis de apumail caducan a las 24 h sin actividad y envían como mucho 5 destinatarios
> al día; para producción usa un buzón permanente o de dominio propio (100 envíos/h).

## Hablar con el agente por apumail, apuchat y meet

Además del widget, el mismo agente puede atender **fuera de la web**. Cada canal se activa solo si
están sus variables; sin ellas el proxy arranca igual. El agente usa el mismo LLM y
`SERVER_INSTRUCTIONS`, recuerda los últimos mensajes de cada contacto (24 h, en memoria) y, como
aquí no ve la página, manda a la gente a la web para cualquier cosa de su cuenta.

| Cómo le hablas | Qué pasa |
| --- | --- |
| Correo a su buzón de apumail | Contesta en el mismo hilo (`Re:`), sin citas ni firmas automáticas. |
| Mensaje a su @handle en la app de apuchat | Contesta por mensaje, corto y cercano. |
| "Llámame" por mensaje | Crea una videollamada de meet con su avatar, entra y te manda el enlace: **suena la app de apuchat** del móvil. |
| En meet.apuchat.com, 📞 *Ring* a su @handle | Le llega la invitación (Channel id / Token / PIN), entra en tu llamada, pone su avatar y te responde por voz. |

```bash
# Persona (común a los canales)
AGENT_NAME=Nube
AGENT_ROLE="asistente de Nimbus"
AGENT_SITE_URL=https://nimbus.ejemplo.com
AGENT_LANG=es

# apumail: buzón propio del agente
APUMAIL_AGENT_INBOX=nube@tudominio.com
APUMAIL_AGENT_TOKEN=...                 # token del buzón o PAT de la cuenta dueña
APUMAIL_AGENT_WEBHOOK_SECRET=...        # opcional: webhook en vez de long-poll
APUMAIL_AGENT_DAILY=20                  # respuestas al día como máximo

# apuchat / meet: identidad propia del agente
APUCHAT_AGENT_IDENTITY_KEY=...          # su X-Identity-Key (handle permanente)
APUCHAT_AGENT_AVATAR=vivi               # avatar en meet
APUCHAT_AGENT_SCENE=office              # opcional: fondo de la llamada
APUCHAT_AGENT_ALLOW=                    # opcional: @handles permitidos (coma)
```

- **Webhook de apumail:** si defines `APUMAIL_AGENT_WEBHOOK_SECRET`, registra en apumail la URL
  pública `https://tu-proxy/api/agent/channels/apumail`. Se verifica `X-Apumail-Signature` (HMAC
  SHA-256 del cuerpo) y se responde al momento. Sin secreto, el proxy hace long-poll a `/wait` y no
  necesita URL pública.
- **Avatares de meet:** shibu, shino, fumiriya, victoria, vita, vivi, kuro, maya, ingrid, kenji,
  viktor, marcus, leo, mei, claire, doctor, amira. **Escenas:** studio, beach, castle, space, sunset,
  forest, night, office, neon.
- **Voz:** en meet tú hablas y meet lo transcribe; el agente contesta en texto corto y tu navegador
  lo lee con el avatar. Si eliges idioma en meet (`[lang]`), responde en ese idioma.
- **"Teléfono"** es la llamada de la app de apuchat (push VoIP), no telefonía clásica. El agente solo
  llama a quien le está escribiendo.
- **Límites:** 0,5 mensajes/s (cola en el proxy), 30 mensajes por persona y hora, 5 correos por
  remitente y día. Llamadas: `AGENT_MAX_CALLS=3` simultáneas, `AGENT_CALL_MAX_MINUTES=15`,
  `AGENT_CALL_MAX_TURNS=40`. Cuelga si nadie entra en 2 min o tras 3 min de silencio.
- **No contesta** correos automáticos, rebotes ni listas, ni correos o mensajes antiguos al
  arrancar. Tampoco entra en invitaciones de hace más de 3 min.
- Usa un buzón y un handle **permanentes**: los gratis caducan.
- Estado en `GET /api/agent/health` → `channels`.

## Avatar y voz

- Avatar 3D con [TalkingHead](https://github.com/met4citizen/TalkingHead) (Three.js): modelos `.glb`
  con blendshapes ARKit + visemas Oculus (p. ej. exportados de Avaturn o Ready Player Me).
- Lip-sync: TalkingHead no trae módulo de español; se usa el finés (`fi`), fonéticamente cercano.
- Expresiones: con `agent.expressive: true` el modelo puede añadir `[[happy]]`, `[[thumbup]]`…
  (lista cerrada), que el widget quita del texto y aplica al avatar.
- TTS: `TTS_PROVIDER=openai|elevenlabs` en el proxy; si no hay, usa la voz del navegador.
- STT: Web Speech API (botón de micrófono) si el navegador la soporta.
- Por defecto, y sin WebGL o si el modelo 3D falla, se usa el personaje 2D (boca sincronizada con el audio).

## Proveedores de LLM

| `LLM_PROVIDER` | Notas |
|---|---|
| `anthropic` | Claude vía `@anthropic-ai/sdk`. `LLM_EFFORT` (`low` por defecto: chat en vivo) controla profundidad vs. latencia. Conserva los bloques de razonamiento entre pasos de un mismo turno. Activa los *fallbacks* del lado del servidor (si una petición es rechazada se reintenta en otro modelo); desactívalos con `LLM_FALLBACKS=off` en Bedrock/Vertex/Foundry. |
| `openai` | Chat Completions. `LLM_BASE_URL` para APIs compatibles (DeepSeek, Groq, Ollama, OpenRouter…). |
| `mock` | Sin claves. Determinista, para desarrollar UI y acciones. |

## Modelo de seguridad

1. **Claves solo en el servidor.** El navegador recibe `siteKey` (público) y nada más.
2. **El proxy es abusable si no lo cierras.** El `system` lo envía el widget, así que en producción
   configura `ALLOWED_ORIGINS`, `SITE_KEYS` y `RATE_LIMIT_PER_MIN`, y si quieres fija instrucciones
   con `SERVER_INSTRUCTIONS` (se anteponen siempre).
3. **La página es dato, no orden.** El contenido del DOM entra marcado como no confiable; el prompt
   indica ignorar instrucciones que aparezcan en él.
4. **Lo privado no sale.** No se leen `input[type=password]`, campos de tarjeta, ni nada bajo
   `data-ots-private` o `privateSelectors`.
5. **Confirmación humana** para envíos de formularios, herramientas MCP con efectos, correo,
   derivación a humano y cualquier acción con `confirm`.
6. **Navegación acotada** a tu origen y a `navigation.allowedOrigins`.
7. **HTML de confianza.** Los modales solo muestran markdown saneado o plantillas que tú defines.

## Estructura

```
src/
  index.js                 init(), exports, window.SevenOts
  core/AgentWidget.js      <ots-agent>: Shadow DOM, UI, orquesta todos los módulos
  core/AgentBrain.js       loop de tool calling, historial, prompt de sistema
  core/Proactivity.js      niveles quiet/normal/bold y señales (ruta, sección, duda, salida…) → notify()
  core/EventBus.js · core/storage.js
  context/ContextManager.js  snapshot semántico del DOM + MutationObserver + rutas SPA
  actions/ActionRegistry.js  registro, validación, confirmación, MCP
  actions/builtins.js        navegar, click, teclado, arrastrar, formularios, modales…
  actions/PageTools.js       [data-ots-tool] del HTML → herramientas
  ui/VirtualPointer.js       cursor, ratón y teclado virtuales (eventos sintéticos)
  ui/Companion.js            modo compañero: el avatar se pasea y señala (point_at, tour)
  mcp/McpClient.js           cliente MCP Streamable HTTP
  auth/AuthManager.js        JWT / cookies, claims expuestos
  ui/UIManager.js            capa de UI sobre la página (toasts, modales, sidebar, foco)
  avatar/AvatarStage.js      TalkingHead 3D + fallback 2D
  voice/VoiceEngine.js       TTS (proxy/navegador) + STT
  integrations/apumail.js · integrations/apuchat.js
  identity/schema.js         ficha de identidad: defineIdentity, publicIdentity, vCard (navegador y Node)
  identity/Face.js           createFace: cara + voz sin chat
  identity/ContactCard.js    <ots-identity>: tarjeta de contacto
  i18n/index.js              traducciones: t, translator, addMessages, resolveLocale (navegador y Node)
  i18n/messages/             catálogos es/en/pt por módulo (widget, character, identity, server)
  character/Character.js     personaje 2D estilo Pou: render, animación, ánimos y gestos
  character/parts.js         catálogo: formas, ojos, bocas, cejas, accesorios, estilos
  character/AvatarEditor.js  <ots-avatar-editor>: editor visual del personaje (y 3D/retrato)
backoffice/                panel /backoffice/: index.html, app.js, app.css
server/                    proxy Node (sin frameworks): llm, tts, contact, demo
  identity.mjs             identidad vigente: entorno + data/identity.json
  settings.mjs             data/config.json (widget + servidor) y data/secrets.json sobre el entorno
  admin.mjs                API del backoffice (/api/agent/admin/*): sesión, estado, guardar, pruebas
  sdk.mjs                  7ots/server: createAgentIdentity (identidad y canales para cualquier agente)
  channels/                el agente por apumail, apuchat y meet (fuera de la web)
examples/                  sitio de demo "Nimbus" (index, docs, dashboard) e identidad.html
site/                      la web de 7ots.com (landing es/en/pt con demo, editor y agente en vivo)
brand/                     logo, favicon, tokens.css y la mascota Ots (ver docs/BRAND.md)
desktop/                   la mascota como app de escritorio (electron-builder): AppImage/deb, dmg, Setup.exe
```

**Instaladores de la mascota.** `npm run build` en la raíz y luego, en `desktop/`, `npm ci && npm run dist:linux`
(o `dist:mac` / `dist:win`); salen en `desktop/release/`. La app arranca sola el daemon (su propio Electron en modo
node) y la ventana de `cli/pet/electron/main.cjs`, sin npx ni node global. En CI, un tag `v*` dispara
`.github/workflows/desktop-release.yml` (Linux, macOS universal y Windows en paralelo, release en borrador; los
secretos de firma están descritos en su cabecera). Luego `scripts/publish-desktop.sh <tag>` copia los instaladores al repo público `7ots/pet-releases` (de donde descargan los usuarios y se actualiza la app).

Detalles de diseño en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Licencia

MIT
