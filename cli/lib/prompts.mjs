/**
 * Prompts for coding agents (Claude Code, Codex, Gemini CLI, Cursor…). `7ots prompt <topic>`
 * prints them and the proxy serves them all at https://7ots.com/llms.txt.
 */

export const PROMPTS = {
  identity: `## Create a random 7ots identity
When the user says "use 7ots, create a random identity" (or similar):
1. Run \`npx -y @7ots/cli new\` (add \`--name <Name>\` if they gave a name, \`--lang en|es|pt\` for the language,
   \`--seed <seed>\` to reproduce a specific ot, \`--global\` for one shared by every project).
2. It writes \`.7ots/identity.json\` and prints the ot's name, role, personality, voice and its seed.
   The seed reproduces exactly the same ot anywhere (web, CLI, pet, meet): tell the user the seed.
3. Show the user who their ot is. If they don't like it, run \`npx -y @7ots/cli new --force\` for another one.
Never invent identity fields by hand: the CLI validates them.`,

  install: `## Install the web widget in this project (legacy)
Only when the user explicitly asks for the widget on their website:
1. Make sure there is an identity (\`npx -y @7ots/cli show\`; if none, create one as above).
2. Run \`npx -y @7ots/cli install\`. It detects the project:
   - plain HTML site → inserts the 7ots widget before </body> (between <!-- 7ots --> markers, idempotent);
   - other projects → prints the snippet: put it in the root layout/template, before </body>;
   - \`--target self\` → prepares the identity for the user's own 7ots server (IDENTITY_FILE=… npx -y @7ots/cli server);
   - it also prints a 7ots.com link that hosts this same identity (no server needed).
3. The widget needs an AI endpoint: a 7ots proxy (/api/agent) or the ot hosted on 7ots.com. Tell the user which.`,

  pet: `## Wake up the desktop pet (tamagotchi)
The ot can live on the user's computer as a virtual pet that watches the terminal and the coding agent,
comments on what happens and has needs (food, energy, fun, levels).
1. If the user hasn't configured it, suggest \`npx -y @7ots/cli setup\` (an interactive wizard: where the ot lives,
   which brain — their own AI CLI, an API key, 7ots or Orquesta Batuta —, voice, pet mode, chattiness, hooks).
   It is interactive: ask the user to run it themselves with \`! npx -y @7ots/cli setup\` in Claude Code.
2. Pick the mode, or ask the user if it's not obvious:
   - desktop: \`npx -y @7ots/cli pet --mode desktop --detach\` (a small always-on-top window that walks along the screen; downloads Electron once)
   - browser: \`npx -y @7ots/cli pet --mode browser --detach\`
   - terminal: \`npx -y @7ots/cli pet --mode terminal\` (needs its own terminal: ask the user to run it)
   Always use --detach from an agent so the command returns.
3. To let it react to your work: \`npx -y @7ots/cli hooks install --claude\` (Claude Code hooks in this project) and/or
   \`--shell\` (bash/zsh). Remove with \`npx -y @7ots/cli hooks remove\`.
4. Care: \`7ots feed\`, \`7ots play\`, \`7ots sleep\`, \`7ots status\`, \`7ots say "<text>"\`, \`7ots stop\`.`,

  meet: `## Join an apuchat meet video call with this identity
The ot joins meet.apuchat.com with its own meet avatar, scene and personality, and talks using the configured brain.
- New call: \`npx -y @7ots/cli meet --new\` prints a private link for the user (it carries keys and PIN: give it only to them),
  then the ot waits in the call. It runs until the call ends, so start it in the background or ask the user to run it.
- Existing call: \`npx -y @7ots/cli meet "<invite text or https://meet.apuchat.com/call#c=…&t=…&p=… link>"\`.
- The brain comes from \`7ots setup\`; without one the ot only says stock phrases.
- Protocol details for agents that want to join directly: https://meet.apuchat.com/llms.txt
  (create a free identity: POST https://apuchat.com/api/account → session_token; POST /api/account/identities with
  Bearer session → callsign + identity_key; join with {identity_key}; send a kind:"status" line, then "[avatar]<name>"
  and optionally "[scene]<scene>"; reply with /send {to:"all"}; ignore status lines, your own callsign and lines starting with "[").`,
};

export function promptText(topic = 'all') {
  if (topic === 'all' || !PROMPTS[topic]) return Object.values(PROMPTS).join('\n\n');
  return PROMPTS[topic];
}

/** https://7ots.com/llms.txt — everything a coding agent needs to set up 7ots without guessing. */
export function llmsTxt(base = 'https://7ots.com') {
  return `# 7ots

> An ot is the user's personal AI companion with its own face, personality and voice. It lives on their desktop as a pet
> (\`npx @7ots/cli pet\`), watches over their coding agent (Claude Code hooks + bash/zsh hooks), sets reminders, watches prices and
> processes, can see the screen if allowed, joins apuchat video calls and can work as an Orquesta assistant inside a project.
> Every ot's identity (face, personality, voice, meet avatar) is reproducible from a short seed. 7ots integrates apuchat,
> apumail and voice providers; it does not host audio or mail.
> Site, API and MCP owners: register your service at ${base}/app#sites (usage guide + domain verification via
> DNS TXT, /.well-known or a meta tag) so every ot knows when and how to use it. Discovery is powered by https://prowl.world.
> 7ots is no longer pitched as a chatbot to embed on websites: do not install the web widget unless the user explicitly asks for it.

- Site: ${base}/ · create an identity in the browser: ${base}/#create
- Hosted ots (dashboard, no server needed): ${base}/app/
- CLI: npm \`@7ots/cli\` (https://www.npmjs.com/package/@7ots/cli) → \`npx -y @7ots/cli help\`, \`npx -y @7ots/cli <cmd> --help\`
- This file: ${base}/llms.txt (also \`npx -y @7ots/cli docs\`)

# Read this first (for coding agents)

1. Never invent identity fields or config files by hand: use the CLI, it validates everything.
2. Ask the user only what you can't tell from the project. The default is the pet on their computer, connected to their
   coding agent (sections "Pet" and "Hooks"). Other homes: a meet call, an Orquesta project (\`login orquesta\`) or hosting on
   ${base}/app/. Even if this repo is a website, do NOT run \`install\` (legacy web widget) unless the user asks for it.
3. From an agent, commands must return: use \`--detach\` for the pet, run \`meet\` in the background, and ask the user to run
   interactive commands themselves (\`setup\`, the terminal pet) — in Claude Code: \`! npx -y @7ots/cli setup\`.
4. Language: \`--lang en|es|pt\` on \`new\` sets the ot's language, and from then on every CLI text follows it
   (order: SEVENOTS_LANG > ~/.7ots/config.json "lang" > the ot's language > LANG > English).
5. Secrets (API keys, tokens) never go in HTML, in identity.json or in your reply: they go in env vars / .env of a server,
   in ~/.7ots/keys.json (written by \`setup\`, 0600) or in the ${base}/app/ dashboard.
6. When done, tell the user: the ot's name and seed, where it lives, and how to see it (URL, \`7ots pet\`, …).

# Typical flows

- "Use 7ots" / "give me an ot" / "give me a pet":
  \`npx -y @7ots/cli new\` (if there is no identity) → \`npx -y @7ots/cli pet --mode desktop --detach\` → \`npx -y @7ots/cli hooks install --claude\`.
- "Put it in a call": \`npx -y @7ots/cli meet --new\` (in the background) and give the printed link only to the user.
- "Make it my Orquesta assistant": \`npx -y @7ots/cli new --global\` → ask the user to run \`! npx -y @7ots/cli login orquesta\`
  (or connect it in the ot's Orquesta tab at ${base}/app/), then pick a project.
- "Host it, no server": create it at ${base}/app/.
- "Make ots use my site / API / MCP": send the owner to ${base}/app#sites to enroll it with a usage guide and verify
  the domain (DNS TXT, /.well-known file or meta tag). Ots then find it through Prowl.world (section "For site, API and MCP owners").

# CLI reference (\`npx -y @7ots/cli <command>\`, or \`7ots <command>\` once installed globally)

Every command accepts \`--help\` (prints usage, never launches anything) and \`--lang en|es|pt\`.

| Command | What it does |
|---|---|
| \`new [--seed s] [--name n] [--lang en\\|es\\|pt] [--global] [--force] [--json]\` | Random identity → \`.7ots/identity.json\` (\`--global\`: \`~/.7ots/identity.json\`, shared by every project). Keeps an existing one unless \`--force\`. |
| \`show [--json\\|--prompt]\` | The identity in use (the project's, else the global one). \`--prompt\`: as a system prompt. |
| \`seed <text>\` | Normalizes a seed. Same seed = same ot everywhere. |
| \`install [--target html\\|self\\|print] [file]\` | Legacy: puts the web widget in the project (see "Website (legacy)"). Only when the user asks. |
| \`setup\` (alias \`wizard\`, \`init\`) | Interactive wizard: where the ot lives, brain, voice, pet mode, chattiness, hooks. Writes \`~/.7ots/config.json\` and \`keys.json\`. |
| \`pet [--mode desktop\\|terminal\\|browser\\|auto] [--detach] [--opaque] [--tmux] [--compact]\` | Wakes the pet (see "Pet"). |
| \`feed\` · \`play\` · \`sleep\` · \`wake\` · \`say <text>\` | Care for the pet (works even if it is not running: the state is saved). |
| \`status [--line\\|--json]\` | Level, food, energy, fun. \`--line\`: one short line for status bars. |
| \`stop\` | Stops the pet daemon (and its windows). |
| \`hooks install\\|remove [--claude] [--shell] [--global]\` | Lets the pet react to your work (see "Hooks"). |
| \`meet --new [--minutes n]\` · \`meet "<invite or link>"\` | The ot joins an apuchat meet video call. |
| \`prompt [identity\\|install\\|pet\\|meet\\|all]\` | Short recipes for coding agents. |
| \`docs\` | Prints this file. |
| \`login orquesta\` | Connects a getorquesta.com account (brain "batuta", home "orquesta"). |
| \`server\` | Runs the 7ots proxy (\`/api/agent\`) with the env vars below. |
| \`version\` · \`help\` | |

# Files

| Path | Content |
|---|---|
| \`.7ots/identity.json\` (project) / \`~/.7ots/identity.json\` (global) | The identity. Public data only (name, role, look, voice, personality, contact). Commit it if you want. |
| \`~/.7ots/config.json\` | Written by \`setup\`: \`lang\`, \`home\`, \`brain\`, \`voice\`, \`pet\` (below). |
| \`~/.7ots/keys.json\` (0600) | Keys typed in \`setup\`, under their env-var names. Env vars always win. Never print it. |
| \`~/.7ots/pet.json\` · \`pet.log\` · \`pet.token\` | Pet state, daemon log, local auth token. |
| \`SEVENOTS_HOME\` | Moves \`~/.7ots\` elsewhere. \`SEVENOTS_PET_PORT\` (default 7717) moves the pet daemon. \`SEVENOTS_LANG\` forces the CLI language. |

Identity fields: \`id, name, role, tagline, seed, bio, language, languages, personality{tone, traits, instructions}, look{color, …},
voice{provider, id, lang}, contact{…}\`. Change them with \`new --force\`, the web editor (${base}/#create) or the backoffice, not by hand.

## config.json

\`\`\`
home   { kind: 'local' }                                  only on this computer
       { kind: '7ots', url: '${base}/api/o/<id>' }        hosted on 7ots.com
       { kind: 'server', url: 'https://site/api/agent' }   the user's own 7ots server
       { kind: 'orquesta', projectId, projectName }        a getorquesta.com project
brain  { kind: 'lines' }                                  built-in phrases, no AI (default)
       { kind: 'cli', cli: 'claude'|'codex'|'gemini'|'ollama'|'custom', model?, command? }   the user's own AI CLI
       { kind: 'api', provider: 'anthropic'|'openai', model?, baseUrl? }                    a key in keys.json/env
       { kind: '7ots' }                                   the home's /chat (7ots.com or own server)
       { kind: 'batuta', model? }                         Orquesta's Batuta
voice  { kind: 'none'|'browser'|'apuchat'|'elevenlabs'|'grok'|'fish'|'openai', voiceId? }
pet    { mode: 'ask'|'desktop'|'terminal'|'browser', annoy: 0..3, opaque?: true }
       annoy: 0 silent · 1 rarely · 2 normal · 3 chatty (+ terminal bell)
\`\`\`
Keys by name: ANTHROPIC_API_KEY, OPENAI_API_KEY, ORQUESTA_TOKEN, APUCHAT_VOICE_TOKEN, ELEVENLABS_API_KEY, XAI_API_KEY, FISH_API_KEY.

# Pet

- \`desktop\`: a small always-on-top window that walks along the bottom of the screen (Electron via npx, ~100 MB the first time).
  Find it bottom-right; menu on right click or the tray icon (Show / Hide / Feed / Play / Sleep / Quit). Hide keeps it alive.
- \`terminal\`: drawn in the current terminal, keys f feed · p play · s sleep/wake · q quit. Needs its own terminal: ask the user.
- \`browser\`: a tab at http://127.0.0.1:7717/pet.
- \`auto\`: desktop if there is a screen, else terminal.
- \`--detach\`: return immediately (always from agents). The daemon keeps running until \`7ots stop\`.
- tmux: \`7ots pet --tmux\` opens the terminal pet in a side pane (\`--compact\` for a narrow one); for the status bar add
  \`set -g status-right "#(7ots status --line)"\` to ~/.tmux.conf.
- Needs: food, energy and fun decay with time (time away counts at most 8 h); it gains XP and levels from passing
  commands and finished agent turns.

Troubleshooting:
- A grey/black box behind the pet (Linux without a compositor, some GPUs): \`7ots pet --opaque\` (or \`"pet": {"opaque": true}\` in config.json).
- Can't see it: look at the tray icon, or \`7ots stop && 7ots pet --mode desktop\` (it comes back bottom-right).
- Electron can't start (no display, headless, WSL): it falls back to the browser tab; or use \`--mode terminal\`.
- Port busy: \`SEVENOTS_PET_PORT=7720\`.

# Hooks

- \`hooks install --claude\`: Claude Code hooks in \`.claude/settings.local.json\` of this project (\`--global\`: ~/.claude/settings.json).
  The pet hears tool calls, errors and finished turns (\`7ots event --from claude\`, reads the hook JSON on stdin; never fails).
- \`hooks install --shell\`: bash/zsh hook in ~/.bashrc / ~/.zshrc: the pet hears commands and exit codes (secrets are redacted).
- \`hooks remove\` undoes both. Without a running pet the events still change its state silently.

# For site, API and MCP owners

Every ot consults a directory of services (powered by Prowl.world, https://prowl.world) to choose what to use and how.
Owners enroll a website, REST API or MCP server at ${base}/app#sites with a plain-language usage guide (what it does,
when to use it, how, what to avoid) and verify the domain with a DNS TXT record, a file under /.well-known or a meta tag
(the dashboard gives the exact token). Enrolled services become context for every ot: "ASO for agents".

# Website (legacy / self-hosted web widget)

Legacy: 7ots no longer promotes the on-site chatbot. Use this only when the user explicitly asks for a widget on their site.

\`npx -y @7ots/cli install\` detects the project:
- plain HTML (index.html in ., public/, src/, static/, www/, site/) → inserts the widget before </body> between
  \`<!-- 7ots -->\` markers (idempotent: re-running replaces the block);
- a framework (Next, Nuxt, Astro, SvelteKit, Remix, Gatsby, Vite, Django, Rails, Laravel, Hugo, Jekyll…) → prints the snippet and
  which file to paste it in (root layout/template, before </body>);
- not a website → says so and suggests the pet, meet or hosting;
- \`--target print\` only prints the snippet; \`--target self\` prepares the identity for the user's own server.

Snippet for an ot hosted on 7ots.com (simplest; allowed domains are set in the dashboard):
\`\`\`html
<script src="${base}/api/o/<id>/embed.js" defer></script>
\`\`\`
Snippet with your own proxy:
\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/@7ots/cli/dist/7ots.iife.js" defer></script>
<script>
  addEventListener('DOMContentLoaded', () => SevenOts.init({ endpoint: '/api/agent', identity: true }));
</script>
\`\`\`
Declarative: \`<ots-agent endpoint="/api/agent" site-key="pk_x" name="Ana"></ots-agent>\`. ES module: \`import { init } from '@7ots/cli'\`.

\`SevenOts.init(options)\`:
| Option | Meaning |
|---|---|
| \`endpoint\` | Proxy URL (\`/api/agent\`, \`${base}/api/o/<id>\`, …). Required. |
| \`siteKey\` | Public site id the proxy may require (\`SITE_KEYS\`). |
| \`identity\` | \`true\` (ask the endpoint), a URL, or an inline identity object (public fields only). |
| \`agent\` | \`{ name, role, siteName, language, instructions, expressive }\`. |
| \`avatar\` | \`{ url, body: 'F'\\|'M', mood, cameraView }\` (3D, needs an importmap for three) or \`false\`; default is the 2D character. |
| \`voice\` | \`{ tts: 'proxy'\\|'browser'\\|false, stt: true, lang }\` or \`false\`. |
| \`auth\` | \`{ token }\`, \`{ getToken, getUser }\` or \`{ credentials: 'include' }\`; \`exposeClaims\`. |
| \`mcp\` | \`[{ url, name, requiresAuth, filter, confirm }]\` MCP servers (Streamable HTTP). |
| \`actions\` | Custom tools \`[{ name, description, parameters, handler, confirm }]\`. |
| \`templates\` | \`{ name: (data, { escape }) => html }\` for show_modal / open_sidebar. |
| \`navigation\` | \`{ allowedOrigins, router }\` (\`router\` for SPAs). |
| \`proactive\` | \`{ level: 'quiet'\\|'normal'\\|'bold', greetDelayMs, dwellMs, idleMs, cooldownMs, maxPerSession, … }\` or \`false\`. |
| \`context\` | \`{ privateSelectors, ignoreSelectors, extra: () => ({...}) }\` — what it may read on the page. |
| \`contact\` | \`{ apuchat: true, apumail: true \\| { categories } }\` or \`false\` — hand off to a human. |
| \`builtins\` | \`{ exclude: ['click', …], confirmClicks: 'submit'\\|'all'\\|'none' }\`. |
| \`pointer\` | \`{ speed, visible }\` or \`false\` — the virtual mouse/keyboard. |
| \`pageTools\` | \`true\` (default): forms/buttons with \`data-ots-tool\` become tools. |
| \`mode\` / \`companion\` | \`'panel'\` (default) or \`'companion'\` (the avatar walks the page); \`{ size, idleHomeMs, follow, wanderMs, watchCursor }\`. |
| \`theme\` | \`{ primary, radius, position: 'right'\\|'left', font }\`. |

HTML tools without JS: \`<form data-ots-tool="invite_member" data-ots-description="…" data-ots-confirm="Invite {email}?" data-ots-auth>\`
(named fields become parameters). Runtime API: \`agent.ask(text)\`, \`say\`, \`notify\`, \`registerAction\`, \`registerMcp\`,
\`setAuthToken\`, \`setIdentity\`, \`setProactivity\`, \`open/close/reset/destroy\`, \`on(event, fn)\`.

# Own server (\`npx -y @7ots/cli server\`, or \`node server/server.mjs\` from the repo)

Reads env vars / \`.env\`. Keys live only here. Admin UI at /backoffice/ (localhost only unless ADMIN_PASSWORD).
- Core: PORT (8787), ALLOWED_ORIGINS (comma list), SITE_KEYS, RATE_LIMIT_PER_MIN (40), TRUST_PROXY, SERVER_INSTRUCTIONS, LOCALE (es|en|pt), LOG_LEVEL.
- LLM: LLM_PROVIDER (anthropic | openai | mock), ANTHROPIC_API_KEY, OPENAI_API_KEY, LLM_MODEL, LLM_BASE_URL (OpenAI-compatible:
  DeepSeek, Groq, Ollama, OpenRouter…), LLM_EFFORT (low…max), LLM_MAX_TOKENS, LLM_FALLBACKS (on|off).
- Voice (TTS): TTS_PROVIDER (apuchat | elevenlabs | grok | fish | openai | none = browser voice; empty = first with a key);
  APUCHAT_VOICE_URL, APUCHAT_VOICE_TOKEN, APUCHAT_VOICE_ID, APUCHAT_VOICE_PROVIDER; ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL; XAI_API_KEY, XAI_TTS_VOICE; FISH_API_KEY, FISH_VOICE_ID, FISH_MODEL; OPENAI_TTS_MODEL, OPENAI_TTS_VOICE.
- Email tickets (apumail): APUMAIL_API, APUMAIL_INBOX, APUMAIL_INBOX_TOKEN, APUMAIL_TO.
- Human handoff (apuchat): APUCHAT_HUB, APUCHAT_NOTIFIER_IDENTITY_KEY, APUCHAT_OPERATOR_HANDLE, APUCHAT_TRANSCRIBE.
- Backoffice: ADMIN_PASSWORD, CONFIG_FILE, SECRETS_FILE, IDENTITY_FILE (default data/identity.json).
- The agent outside the web: AGENT_NAME, AGENT_ROLE, AGENT_SITE_URL, AGENT_INSTRUCTIONS, AGENT_LANG; own mailbox APUMAIL_AGENT_INBOX,
  APUMAIL_AGENT_TOKEN, APUMAIL_AGENT_WEBHOOK_SECRET, APUMAIL_AGENT_DAILY; own apuchat/meet identity APUCHAT_AGENT_IDENTITY_KEY,
  APUCHAT_AGENT_AVATAR, APUCHAT_AGENT_SCENE, APUCHAT_AGENT_ALLOW, AGENT_MAX_CALLS, AGENT_CALL_MAX_MINUTES, AGENT_CALL_MAX_TURNS.
- Demo: DEMO, SERVE_STATIC, DEMO_JWT_SECRET.
- Platform (multi-tenant, what ${base} runs): PLATFORM=true, PLATFORM_URL, PLATFORM_DB, PLATFORM_SECRET, PLATFORM_MAX_OTS,
  PLATFORM_OTS_RATE_PER_MIN, PLATFORM_OTS_DAILY_LIMIT, PLATFORM_NEW_ACCOUNTS_PER_IP_DAY, PLATFORM_MAX_INFLIGHT,
  PLATFORM_LLM_PROVIDER/API_KEY/BASE_URL/MODEL, PLATFORM_FREE_MESSAGES, PLATFORM_APUCHAT_VOICE_TOKEN, PLATFORM_FREE_TTS,
  PLATFORM_MAIL_INBOX/TOKEN, NOTLOGIN_URL/CLIENT_ID/CLIENT_SECRET, PLATFORM_APUCHAT_IDENTITIES_PER_DAY (free apuchat
  identities per account and day, default 5), ORQUESTA_URL (default https://getorquesta.com).
Endpoints: POST /api/agent/chat, POST /api/agent/tts, GET /api/agent/identity, /api/agent/contact/*, /llms.txt.

# Hosted on ${base} (no server)

- Sign in at ${base}/app/, create an ot (\`7ots install\` also prints a link that opens this same identity there), pick its brain and voice; (legacy) set allowed domains and copy the web embed only if the user wants the widget.
- Each ot's public API: \`${base}/api/o/<id>/\` — embed.js, config, identity, identity.vcf, chat, tts, contact/apumail, contact/apuchat.
  Point the CLI at it with \`setup\` → home "7ots" (brain "7ots" then uses its /chat).
- Brain: the account's free monthly quota on the platform's AI, or the user's own key (BYOK) set in the ot's settings.
  Same for voice. Keys are encrypted and never shown again. Per-ot daily and per-minute limits apply.
- Settings per ot in /backoffice/?ots=<id>: instructions, LLM/voice keys, apumail/apuchat channels.
- apuchat tab of an ot: a free @handle (expires after 24h without activity, e.g. while the ot is paused), made permanent
  by paying once by card on apuchat; connect your apuchat account to keep paid identities under it, or paste an identity key you own.
- Orquesta tab of an ot: connect Orquesta (OAuth or an oak_ key), pick a project, enable tasks. Then the ot can start Orquesta
  tasks (run_task, task_status) only for its owner in the dashboard ("Ask your ot to do something") and for apuchat DMs /
  apumail emails from senders on the ot's allowlist — never from the public chat (/api/o/<id>/chat). Daily cap per ot (default 20).

# Recipes for coding agents

${promptText('all')}
`;
}
