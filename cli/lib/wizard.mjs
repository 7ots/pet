/**
 * `7ots setup`: a short interactive wizard.
 *
 *   language → identity (keep / new, re-roll) → where the ot lives (local · 7ots.com · own server · Orquesta project)
 *   → brain (an AI CLI · API key · its 7ots home · Orquesta Batuta · built-in phrases) → voice → pet mode + chattiness
 *   → hooks (Claude Code, shell) → summary → wake it up?
 *
 * Keys are read hidden and saved in ~/.7ots/keys.json (0600); the ones already in the environment are used as-is.
 */

import { createIdentity, loadIdentity, identityPath } from './identity.mjs';
import { CONFIG_DEFAULTS, loadConfig, saveConfig, saveKey, hasKey, ORQUESTA_URL } from './config.mjs';
import { detectClis } from './brain.mjs';
import { installClaudeHooks, installShellHooks } from './hooks.mjs';
import { platformLink } from './install.mjs';
import { FACES } from './terminal.mjs';
import { t, setCliLang, cliLang } from './i18n.mjs';
import { existsSync, homeFile, PET_PORT } from './paths.mjs';
import * as ui from './ui.mjs';

const STEPS = 7;
const short = (label) => String(label).split(/ [—(-] ?/)[0];
const pretty = (f) => String(f).replace(process.env.HOME || '\0', '~');

/** Menu, used by `7ots pet` too. options: [[value, label, hint?], …]. */
export async function choose(q, options, def = options[0][0]) {
  try {
    return await ui.select(q, options, def);
  } finally {
    ui.closeUi();
  }
}

async function key(name) {
  if (hasKey(name)) {
    ui.ok(t('w.keyEnv', { name }));
    return true;
  }
  const v = await ui.secret(t('w.key', { name }));
  if (!v) return false;
  saveKey(name, v);
  ui.ok(t('w.keySaved'));
  return true;
}

/** The ot as a little card: face in its color, name, role, tagline, personality. */
function idCard(identity) {
  ui.setAccent(identity.look?.character?.body?.color);
  const [l, m, r] = FACES.happy;
  const p = identity.personality || {};
  const face = ui.accent(`(${l}${m}${r})`);
  return ui.card(
    [
      `${face}  ${ui.bold(identity.name)} ${ui.gray('—')} ${identity.role}`,
      `       ${ui.dim(`“${identity.tagline}”`)}`,
      `       ${p.tone}${p.traits?.length ? ui.gray(` · ${p.traits.join(', ')}`) : ''}`,
      `       ${ui.gray(`seed ${identity.seed || '—'} · voice ${identity.voice?.lang} · meet ${identity.look?.meetAvatar || '—'}`)}`,
    ],
    { title: t('w.idCard') },
  );
}

/** Wizard entry point. Returns { launch, mode } when the user wants to wake the pet now. */
export async function runWizard() {
  if (!process.stdin.isTTY) {
    console.error('7ots setup is interactive: run it in a terminal (in Claude Code: ! npx @7ots/cli setup).');
    process.exit(1);
  }
  try {
    return await steps();
  } finally {
    ui.closeUi();
  }
}

async function steps() {
  const cfg = loadConfig();
  const yesNo = [t('yes'), t('no')];

  ui.intro('7ots setup', t('w.intro'));

  // 1 · language + identity (the global one is the pet's; a project identity still wins inside its project)
  ui.step(1, STEPS, t('w.s.identity'));
  const lang = await ui.select(t('w.lang'), [['en', 'English'], ['es', 'Español'], ['pt', 'Português']], cfg.lang || cliLang());
  setCliLang(lang);
  cfg.lang = lang;

  let { identity } = loadIdentity();
  if (identity) {
    idCard(identity);
    const keep = await ui.select(t('w.identity'), [['keep', t('w.idKeep', { name: identity.name })], ['new', t('w.idNew')]], 'keep');
    if (keep === 'new') identity = null;
  }
  if (!identity) {
    let name;
    for (;;) {
      identity = createIdentity({ global: true, force: true, lang, name }).identity;
      const shown = idCard(identity);
      const a = await ui.select(t('w.idLike'), [['keep', t('w.idThis')], ['again', t('w.idAgain')], ['name', t('w.idName')]], 'keep');
      if (a === 'keep') break;
      name = a === 'name' ? (await ui.text(t('w.idNameQ'), { validate: (v) => (v ? '' : t('w.required')) })).slice(0, 40) : undefined;
      ui.erase(shown + 1 + (a === 'name' ? 1 : 0)); // the old card + its answer: the new one takes its place
    }
  }

  // 2 · home
  ui.step(2, STEPS, t('w.s.home'));
  const home = await ui.select(t('w.home'), [
    ['local', t('w.home.local'), t('w.h.local')],
    ['7ots', t('w.home.7ots'), t('w.h.7ots')],
    ['server', t('w.home.server'), t('w.h.server')],
    ['orquesta', t('w.home.orquesta'), t('w.h.orquesta')],
  ], cfg.home.kind);
  const url = (v) => (/^https?:\/\/\S+$/.test(v) ? '' : t('w.badUrl'));
  if (home === '7ots') {
    ui.note(t('w.home7otsUrl', { app: platformLink(identity.seed) }));
    const u = await ui.text('URL', { def: cfg.home.kind === '7ots' ? cfg.home.url : '', validate: url });
    cfg.home = { kind: '7ots', url: u.replace(/\/+$/, '').replace(/\/(chat|embed\.js)$/, '') };
  } else if (home === 'server') {
    const u = await ui.text(t('w.homeServerUrl'), { def: cfg.home.kind === 'server' ? cfg.home.url : '', validate: url });
    cfg.home = { kind: 'server', url: u.replace(/\/+$/, '') };
  } else if (home === 'orquesta') {
    cfg.home = await orquestaHome(cfg.home);
  } else {
    cfg.home = { kind: 'local' };
  }
  if (['7ots', 'server'].includes(cfg.home.kind)) ui.warn(t('w.originHint', { port: PET_PORT }));

  // 3 · brain
  ui.step(3, STEPS, t('w.s.brain'));
  const clis = detectClis();
  const brainOpts = [
    ...clis.map((k) => [`cli:${k}`, t('w.brain.cli', { cli: k }), t('w.h.cli')]),
    ['api', t('w.brain.api'), t('w.h.api')],
    ...(['7ots', 'server'].includes(cfg.home.kind) ? [['7ots', t('w.brain.7ots', { url: cfg.home.url })]] : []),
    ...(cfg.home.kind === 'orquesta' || hasKey('ORQUESTA_TOKEN') ? [['batuta', t('w.brain.batuta')]] : []),
    ['lines', t('w.brain.lines'), t('w.h.lines')],
  ];
  const curBrain = cfg.brain.kind === 'cli' ? `cli:${cfg.brain.cli}` : cfg.brain.kind;
  const configured = existsSync(homeFile('config.json')) && curBrain !== 'lines';
  const brain = await ui.select(t('w.brain'), brainOpts, configured && brainOpts.some(([v]) => v === curBrain) ? curBrain : brainOpts[0][0]);
  if (brain.startsWith('cli:')) {
    const cli = brain.slice(4);
    const model = await ui.text(t('w.model'), { def: cfg.brain.cli === cli ? cfg.brain.model || '' : cli === 'claude' ? 'haiku' : '' });
    cfg.brain = { kind: 'cli', cli, ...(model ? { model } : {}) };
  } else if (brain === 'api') {
    const provider = await ui.select(t('w.provider'), [['anthropic', 'Anthropic'], ['openai', 'OpenAI / compatible']], cfg.brain.provider || 'anthropic');
    const baseUrl = provider === 'openai' ? await ui.text(t('w.baseUrl'), { def: cfg.brain.baseUrl || '' }) : '';
    const model = await ui.text(t('w.model'), { def: cfg.brain.model || (provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : '') });
    await key(provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY');
    cfg.brain = { kind: 'api', provider, ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) };
  } else if (brain === 'batuta') {
    if (!hasKey('ORQUESTA_TOKEN')) await orquestaLogin();
    cfg.brain = { kind: 'batuta' };
  } else {
    cfg.brain = { kind: brain };
  }

  // 4 · voice
  ui.step(4, STEPS, t('w.s.voice'));
  const voice = await ui.select(t('w.voice'), [
    ['browser', t('w.voice.browser')],
    ['apuchat', t('w.voice.apuchat')],
    ['elevenlabs', t('w.voice.elevenlabs')],
    ['grok', t('w.voice.grok')],
    ['fish', t('w.voice.fish')],
    ['none', t('w.voice.none')],
  ], cfg.voice.kind);
  const VOICE_KEY = { apuchat: 'APUCHAT_VOICE_TOKEN', elevenlabs: 'ELEVENLABS_API_KEY', grok: 'XAI_API_KEY', fish: 'FISH_API_KEY' };
  cfg.voice = { kind: voice };
  if (VOICE_KEY[voice]) {
    if (!(await key(VOICE_KEY[voice]))) {
      cfg.voice = { kind: 'browser' };
      ui.warn(t('w.voiceFallback'));
    } else if (voice !== 'apuchat') {
      const id = await ui.text(t('w.voiceId'));
      if (id) cfg.voice.voiceId = id;
    }
  }

  // 5 · pet
  ui.step(5, STEPS, t('w.s.pet'));
  const mode = await ui.select(t('w.mode'), [
    ['ask', t('mode.ask')],
    ['desktop', t('mode.desktop')],
    ['terminal', t('mode.terminal')],
    ['browser', t('mode.browser')],
  ], cfg.pet.mode || CONFIG_DEFAULTS.pet.mode);
  const annoy = await ui.select(t('w.annoyQ'), [0, 1, 2, 3].map((n) => [n, t(`w.annoy.${n}`)]), Number(cfg.pet.annoy ?? 2));
  cfg.pet = { mode, annoy };

  // 6 · hooks
  ui.step(6, STEPS, t('w.s.hooks'));
  const claude = await ui.select(t('w.hooksClaude'), [
    ['project', t('w.hooksClaude.project'), pretty(process.cwd())],
    ['global', t('w.hooksClaude.global'), '~/.claude/settings.json'],
    ['no', t('w.hooksClaude.no')],
  ], 'project');
  const hooks = [];
  if (claude !== 'no') {
    const f = installClaudeHooks({ global: claude === 'global' });
    ui.ok(t('hooks.claude', { file: pretty(f) }));
    hooks.push('Claude Code');
  }
  if (await ui.confirm(t('w.hooksShell'), false, yesNo)) {
    const files = installShellHooks();
    if (files.length) ui.ok(t('hooks.shell', { files: files.map(pretty).join(', ') }));
    else ui.warn(t('hooks.shellNone'));
    ui.note(t('hooks.reload'));
    hooks.push('shell');
  }

  // 7 · save + summary
  ui.step(7, STEPS, t('w.s.done'));
  saveConfig(cfg);
  const homeLabel = { local: t('w.home.local'), '7ots': cfg.home.url, server: cfg.home.url, orquesta: `Orquesta · ${cfg.home.projectName || ''}` }[cfg.home.kind];
  const brainLabel = cfg.brain.kind === 'cli' ? `${cfg.brain.cli}${cfg.brain.model ? ` · ${cfg.brain.model}` : ''}` : cfg.brain.kind === 'api' ? `${cfg.brain.provider}${cfg.brain.model ? ` · ${cfg.brain.model}` : ''}` : cfg.brain.kind === 'lines' ? t('w.brain.lines') : cfg.brain.kind;
  ui.summary(t('w.sum.title'), [
    [t('w.sum.ot'), `${ui.accent(identity.name)} ${ui.gray(`· ${identity.role}`)}`],
    [t('w.sum.home'), homeLabel || '—'],
    [t('w.sum.brain'), brainLabel],
    [t('w.sum.voice'), short(t(`w.voice.${cfg.voice.kind}`))],
    [t('w.sum.pet'), `${short(t(`mode.${cfg.pet.mode}`))} ${ui.gray('·')} ${short(t(`w.annoy.${cfg.pet.annoy}`))}`],
    [t('w.sum.hooks'), hooks.join(', ') || '—'],
    [t('w.sum.files'), ui.gray(pretty(homeFile('config.json')))],
    ['', ui.gray(pretty(loadIdentity().file || identityPath({ global: true })))],
  ]);

  const launch = await ui.confirm(t('w.launch', { name: identity.name }), true, yesNo);
  if (!launch) {
    ui.outro(t('w.next'));
    return null;
  }
  ui.outro(t('w.waking', { name: identity.name }));
  return { launch, mode: cfg.pet.mode === 'ask' ? 'auto' : cfg.pet.mode };
}

async function orquestaLogin() {
  if (!(await ui.confirm(t('w.orqLogin'), true, [t('yes'), t('no')]))) return false;
  const { login } = await import('./orquesta.mjs');
  const { openUrl } = await import('./open.mjs');
  let stop = () => {};
  try {
    const r = await login({
      open: openUrl,
      onWaiting: (url) => {
        ui.note(t('login.open', { url }));
        stop = ui.spinner(t('w.waitingBrowser'));
      },
    });
    stop(t('login.ok', { org: r.organizationName || r.organizationId }));
    return true;
  } catch (e) {
    stop();
    ui.warn(e.message);
    return false;
  }
}

async function orquestaHome(prev) {
  if (!hasKey('ORQUESTA_TOKEN') && !(await orquestaLogin())) return { kind: 'local' };
  const { projects } = await import('./orquesta.mjs');
  let list = [];
  const stop = ui.spinner(t('w.loading'));
  try {
    list = (await projects()).projects;
    stop();
  } catch (e) {
    stop();
    ui.warn(`${ORQUESTA_URL}: ${e.message}`);
  }
  if (!list.length) {
    ui.warn(t('w.orqNone'));
    return { kind: 'local' };
  }
  const id = await ui.select(t('w.orqProject'), list.slice(0, 30).map((p) => [p.id, p.name, p.slug || '']), prev.projectId || list[0].id);
  const p = list.find((x) => x.id === id);
  return { kind: 'orquesta', projectId: p.id, projectName: p.name };
}
