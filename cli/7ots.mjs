#!/usr/bin/env node
/**
 * 7ots CLI — identities, the desktop pet, hooks, apuchat meet and the setup wizard.
 * `7ots help` lists the commands. Texts are English by default (es/pt: SEVENOTS_LANG, config or LANG).
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createIdentity, describe, identityPrompt, loadIdentity, cleanSeed } from './lib/identity.mjs';
import { loadConfig } from './lib/config.mjs';
import { t, cliLang } from './lib/i18n.mjs';
import { ensureHome, homeFile, PET_PORT, PKG_ROOT } from './lib/paths.mjs';
import { applyEvent, loadPet, savePet, tick, view } from './lib/pet-core.mjs';
import { petAlive, petToken, postPet, startPetServer } from './lib/pet-server.mjs';
import { fromClaudeHook, installClaudeHooks, installShellHooks, redact, removeClaudeHooks, removeShellHooks } from './lib/hooks.mjs';
import { detectProject, findHtml, installHtml, platformLink, pretty, snippet } from './lib/install.mjs';
import { llmsTxt, promptText } from './lib/prompts.mjs';
import { openUrl, graphical } from './lib/open.mjs';

const ELECTRON = 'electron@37';
const tty = process.stdout.isTTY;
const bold = (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s);

function parse(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && VALUED.has(k) && (!argv[i + 1].startsWith('-') || ['cmd', 'text', 'code'].includes(k))) flags[k] = argv[++i];
      else flags[k] = true;
    } else if (/^-[a-z]$/.test(a)) flags[{ h: 'help', g: 'global', f: 'force' }[a[1]] || a[1]] = true;
    else pos.push(a);
  }
  return { pos, flags };
}
const VALUED = new Set(['seed', 'name', 'lang', 'target', 'mode', 'type', 'code', 'cmd', 'tool', 'from', 'port', 'text', 'minutes', 'cancel', 'server', 'ms', 'dance']);

const fail = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};

function needIdentity() {
  const { identity, file } = loadIdentity();
  if (!identity) fail(t('err.noIdentity'));
  return { identity, file };
}

/* ───────────── identity ───────────── */

function cmdNew({ flags }) {
  const r = createIdentity({ seed: flags.seed, name: typeof flags.name === 'string' ? flags.name : undefined, lang: flags.lang, global: !!flags.global, force: !!flags.force });
  if (flags.json) return console.log(JSON.stringify({ ...r.identity, file: r.file, kept: r.kept }, null, 2));
  console.log(r.kept ? t('new.kept', { file: pretty(r.file) }) : t('new.created', { file: pretty(r.file) }));
  console.log('\n' + describe(r.identity, bold) + '\n');
  console.log(dim(t('new.next')));
}

function cmdShow({ flags }) {
  const { identity, file } = loadIdentity();
  if (!identity) return fail(t('show.none'));
  if (flags.json) return console.log(JSON.stringify(identity, null, 2));
  if (flags.prompt) return console.log(identityPrompt(identity));
  console.log(dim(pretty(file)) + '\n' + describe(identity, bold));
}

function cmdInstall({ pos, flags }) {
  const { identity, file } = needIdentity();
  const target = flags.target || (pos[0] ? 'html' : 'auto');
  const app = platformLink(identity.seed);
  const home = loadConfig().home;
  if (target === 'self') {
    console.log(t('install.self', { file: JSON.stringify(file) }));
    return console.log(dim(t('install.platform', { app })));
  }
  const block = snippet(identity, { home });
  const html = target === 'print' ? null : pos[0] || findHtml();
  if (!html) {
    const proj = detectProject();
    if (proj.kind === 'none' && !pos[0] && target !== 'print') {
      // Not a website: the snippet would be useless here; say what the ot can do instead.
      console.log(t('install.notWeb', { name: identity.name, app }));
      return;
    }
    const where = proj.file ? t('install.pasteIn', { file: proj.file, name: proj.name || '' }) : t('install.noHtml');
    console.log(where + '\n\n' + block + '\n');
  } else {
    const r = installHtml(html, block);
    console.log(t(r.updated ? 'install.htmlUpdated' : 'install.html', { file: pretty(html) }));
  }
  if (home.kind === '7ots') return;
  if (home.kind === 'server') return console.log(dim(t('install.platform', { app })));
  console.log(dim(t('install.endpointLocal', { file: JSON.stringify(file), app })));
}

/* ───────────── pet ───────────── */

async function chooseMode(identity, flags) {
  let mode = flags.mode || loadConfig().pet.mode || 'ask';
  if (mode === 'ask' && !(process.stdin.isTTY && tty)) mode = 'auto';
  if (mode === 'ask') {
    const { choose } = await import('./lib/wizard.mjs');
    mode = await choose(t('pet.chooseMode', { name: identity.name }), [
      ['desktop', t('mode.desktop')],
      ['terminal', t('mode.terminal')],
      ['browser', t('mode.browser')],
    ], graphical() ? 'desktop' : 'terminal');
  }
  if (mode === 'auto') mode = graphical() ? 'desktop' : 'terminal';
  if (!['desktop', 'terminal', 'browser'].includes(mode)) fail(`--mode desktop|terminal|browser|auto`);
  return mode;
}

/** Starts the daemon in the background (it outlives this command). */
async function spawnDaemon() {
  ensureHome();
  const log = openSync(homeFile('pet.log'), 'a');
  const child = spawn(process.execPath, [join(PKG_ROOT, 'cli', '7ots.mjs'), 'pet', '--daemon'], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: process.env,
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const h = await petAlive();
    if (h) return h;
  }
  fail(`the pet did not start; see ${homeFile('pet.log')}`);
}

function petUrl(desktop = false, view3d = false) {
  return `http://127.0.0.1:${PET_PORT}/pet?${desktop ? 'desktop=1&' : ''}${view3d ? '3d=1&' : ''}token=${petToken()}`;
}

/** Path to the Electron binary, or null. `electron`'s index.js throws if its postinstall download never finished. */
function electronBin(dir) {
  try {
    const bin = createRequire(join(dir, 'package.json'))('electron');
    return typeof bin === 'string' && existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

/**
 * Electron lives in ~/.7ots/electron, installed once with npm in the foreground. Not `npx electron`:
 * if npx is cut off mid-download (we used to detach it and close its pipes) its cache keeps a package
 * without the binary and every later run fails with "electron: not found".
 */
function ensureElectron() {
  const dir = homeFile('electron');
  let bin = electronBin(dir);
  if (bin) return { bin };
  ensureHome();
  console.log(dim(t('pet.electronInstall', { dir })));
  if (!existsSync(join(dir, 'package.json'))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{ "name": "7ots-electron", "private": true }\n');
  }
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ELECTRON], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  bin = electronBin(dir);
  return bin ? { bin } : { error: r.error?.message || `npm install ${ELECTRON} failed (exit ${r.status})` };
}

/** Electron window (detached). Resolves ok once it has stayed up for a few seconds. */

// The shell's menus speak the human's language (like the settings page): SEVENOTS_LANG, config.lang, the
// system's, and only then the ot's — cliLang() puts the ot's first, which left a Spanish desktop with English menus.
function menuLang() {
  const pick = (v) => (['en', 'es', 'pt'].includes(v) ? v : '');
  let lang = '';
  try {
    lang = loadConfig().lang;
  } catch {}
  return pick(process.env.SEVENOTS_LANG) || pick(lang) || pick(String(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').slice(0, 2).toLowerCase()) || cliLang();
}

// Electron installed per user (~/.7ots/electron) has a chrome-sandbox that is not root:4755, and Ubuntu 24.04+
// blocks unprivileged user namespaces (AppArmor), so Chromium aborts with SIGTRAP before showing a window.
// Without a usable setuid helper, run unsandboxed: the window only loads the pet's own 127.0.0.1 page.
function electronSandboxArgs(bin) {
  if (process.platform !== 'linux') return [];
  try {
    const st = statSync(join(dirname(bin), 'chrome-sandbox'));
    if (st.uid === 0 && st.mode & 0o4000) return [];
  } catch {}
  return ['--no-sandbox'];
}

function openDesktop({ opaque = false, view3d = false } = {}) {
  console.log(dim(t('pet.electron')));
  const { bin, error } = ensureElectron();
  if (!bin) return Promise.resolve({ ok: false, error });
  const log = openSync(homeFile('electron.log'), 'a');
  const child = spawn(bin, [join(PKG_ROOT, 'cli', 'pet', 'electron', 'main.cjs'), ...electronSandboxArgs(bin)], {
    stdio: ['ignore', log, log],
    detached: true,
    windowsHide: true,
    env: { ...process.env, SEVENOTS_PET_URL: `http://127.0.0.1:${PET_PORT}`, SEVENOTS_PET_TOKEN: petToken(), SEVENOTS_PET_OPAQUE: opaque ? '1' : '', SEVENOTS_PET_3D: view3d ? '1' : '', SEVENOTS_PET_LANG: menuLang() },
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.unref();
      resolve({ ok: true });
    }, 3000);
    child.once('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    child.once('exit', (code, sig) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `exit ${code ?? sig}; see ${homeFile('electron.log')}` });
    });
  });
}

/** Talk to the pet: reminders, notes, opening sites (the daemon's /ask). */
async function cmdAsk({ pos }) {
  const text = pos.join(' ').trim();
  if (!text) fail(t('usage.ask'));
  if (!(await petAlive())) fail(t('err.noPet'));
  const r = await fetch(`http://127.0.0.1:${PET_PORT}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-7ots-Token': petToken() },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(60_000),
  })
    .then((x) => x.json())
    .catch((e) => fail(e.message));
  console.log(r.reply || '');
}

async function cmdReminders({ flags }) {
  if (!(await petAlive())) fail(t('err.noPet'));
  if (flags.cancel) {
    const ok = await postPet('/reminders/cancel', { id: String(flags.cancel) });
    return console.log(ok ? 'ok' : '?');
  }
  const r = await fetch(`http://127.0.0.1:${PET_PORT}/reminders?token=${petToken()}`).then((x) => x.json());
  for (const x of r.reminders) console.log(`${dim(x.id)}  ${new Date(x.at).toLocaleString()}  ${x.text}${x.open ? dim(`  → ${x.open}`) : ''}`);
  if (!r.reminders.length) console.log(dim('—'));
  if (r.notes.length) console.log(`\n${bold('notes')}\n${r.notes.map((n) => `  · ${n.text}`).join('\n')}`);
}

/** The settings page (brain, what it may see, notes, reminders), in the browser. --print: only the URL. */
async function cmdConfig({ flags }) {
  if (!(await petAlive())) fail(t('err.noPet'));
  const url = `http://127.0.0.1:${PET_PORT}/settings?token=${petToken()}`;
  if (flags.print || !graphical() || !openUrl(url)) return console.log(url);
  console.log(t('pet.settings'));
}

async function cmdPet({ flags }) {
  if (flags.daemon) {
    try {
      await startPetServer({ port: PET_PORT, log: (s) => console.log(new Date().toISOString(), s) });
    } catch (e) {
      if (e.code === 'NO_IDENTITY') fail(t('err.noIdentity'));
      if (e.code === 'EADDRINUSE') fail(`port ${PET_PORT} is busy (SEVENOTS_PET_PORT changes it)`);
      throw e;
    }
    return; // the server keeps the process alive
  }

  const { identity } = needIdentity();
  if (flags.tmux) return petInTmux(identity, flags);
  const mode = await chooseMode(identity, flags);
  const detach = !!flags.detach;
  const view3d = !!flags['3d'] || loadConfig().pet.view === '3d';

  let alive = await petAlive();
  let local = null;
  if (alive) {
    console.log(dim(t('pet.already', { name: alive.name, pid: alive.pid })));
  } else if (detach || mode !== 'terminal') {
    // Desktop and browser windows need a daemon that lives on its own.
    alive = await spawnDaemon();
  } else {
    local = await startPetServer({ port: PET_PORT });
  }

  if (mode === 'terminal') {
    const { runTerminal } = await import('./lib/terminal.mjs');
    const annoy = Number(loadConfig().pet.annoy ?? 2);
    await runTerminal({ identity, lang: cliLang(), port: PET_PORT, bell: annoy >= 3, compact: !!flags.compact || (process.stdout.columns || 80) < 44 });
    if (local) local.stop();
    return;
  }

  if (mode === 'desktop') {
    const r = await openDesktop({ opaque: !!flags.opaque || !!loadConfig().pet.opaque, view3d });
    if (!r.ok) {
      console.log(t('pet.electronFail', { error: r.error }));
      openUrl(petUrl(false, view3d));
    } else console.log(t('pet.where', { name: identity.name }));
  } else {
    openUrl(petUrl(false, view3d));
    console.log(t('pet.running', { name: identity.name, url: `http://127.0.0.1:${PET_PORT}/pet` }));
  }
  console.log(t('pet.detached', { name: identity.name }));
}

/** The terminal pet in a tmux pane next to this one (the daemon lives on its own, so the pane can close). */
async function petInTmux(identity, flags) {
  if (!process.env.TMUX) fail(t('pet.tmuxNo'));
  if (!(await petAlive())) await spawnDaemon();
  const cmd = [process.execPath, join(PKG_ROOT, 'cli', '7ots.mjs'), 'pet', '--mode', 'terminal', ...(flags.compact ? ['--compact'] : [])]
    .map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`)
    .join(' ');
  const r = spawn('tmux', ['split-window', '-h', '-d', '-l', flags.compact ? '28' : '40', cmd], { stdio: 'inherit' });
  r.once('exit', (code) => (code ? fail('tmux split-window failed') : console.log(t('pet.tmuxOk', { name: identity.name }))));
}

/** Events from hooks. Never fails loudly: a hook must not break the agent or the shell. */
async function cmdEvent({ flags }) {
  let ev = null;
  try {
    if (flags.from === 'claude') {
      let raw = '';
      if (!process.stdin.isTTY) for await (const c of process.stdin) if ((raw += c).length > 512 * 1024) break;
      ev = fromClaudeHook(JSON.parse(raw || '{}'));
    } else if (flags.type) {
      ev = { type: String(flags.type) };
      if (flags.code !== undefined) ev.code = Number(flags.code) || 0;
      if (typeof flags.cmd === 'string') ev.cmd = redact(flags.cmd);
      if (typeof flags.tool === 'string') ev.tool = flags.tool.slice(0, 60);
      if (typeof flags.text === 'string') ev.text = flags.text.slice(0, 300);
    }
  } catch {
    return;
  }
  if (!ev) return;
  if (await postPet('/event', ev)) return;
  // No daemon: the state still changes (food, xp…), it just doesn't talk.
  const p = tick(loadPet());
  applyEvent(p, ev);
  savePet(p);
}

const CARE = { feed: 'feed', play: 'play', sleep: 'sleep', wake: 'wake' };

async function cmdCare(cmd, { pos, flags }) {
  const ev = cmd === 'say' ? { type: 'say', text: (flags.text || pos.join(' ')).toString().slice(0, 300) } : { type: CARE[cmd] };
  if (await postPet('/event', ev)) return cmdStatus();
  const p = tick(loadPet());
  applyEvent(p, ev);
  savePet(p);
  console.log(dim(t('pet.notRunning')));
  await cmdStatus();
}

async function cmdDance(cmd, { pos, flags }) {
  const { DANCES } = await import('../src/character/motion.js');
  if (flags.list) return console.log(DANCES.join(' '));
  const name = (cmd === 'dance' ? pos[0] : flags.dance) || undefined;
  const body = { name, ms: flags.ms ? Number(flags.ms) : undefined };
  if (flags['no-music'] || flags.music === false) body.music = false;
  if (!(await postPet('/' + cmd, body))) console.log(dim(t('pet.notRunning')));
}

async function cmdStatus({ flags = {} } = {}) {
  const { identity } = loadIdentity();
  let state;
  try {
    const r = await fetch(`http://127.0.0.1:${PET_PORT}/state?token=${petToken()}`, { signal: AbortSignal.timeout(800) });
    if (r.ok) state = (await r.json()).state;
  } catch {}
  state ||= view(tick(loadPet()));
  if (flags.json) return console.log(JSON.stringify(state, null, 2));
  if (flags.line) {
    // Short and plain: made for the tmux status bar.
    const low = Math.min(state.food, state.energy, state.fun) < 25 ? '!' : '';
    return console.log(`${identity?.name || '7ots'}${state.asleep ? ' z' : ''} ♥${state.food} ⚡${state.energy} ★${state.fun}${low}`);
  }
  console.log(
    t('pet.status', {
      name: identity?.name || '7ots',
      level: state.level,
      food: state.food,
      energy: state.energy,
      fun: state.fun,
      asleep: state.asleep ? t('pet.asleep') : '',
    }),
  );
}

async function cmdStop() {
  const alive = await petAlive();
  if (!alive) return console.log(dim(t('pet.notRunning')));
  await postPet('/quit');
  console.log(t('pet.stopped', { name: alive.name }));
}

/* ───────────── hooks ───────────── */

function cmdHooks({ pos, flags }) {
  const action = pos[0] || 'install';
  const both = !flags.claude && !flags.shell;
  if (action === 'remove' || action === 'uninstall') {
    if (both || flags.claude) removeClaudeHooks({ global: !!flags.global });
    if (both || flags.shell) removeShellHooks();
    return console.log(t('hooks.removed'));
  }
  if (action !== 'install') return fail('7ots hooks install|remove [--claude] [--shell] [--global]');
  if (both || flags.claude) console.log(t('hooks.claude', { file: pretty(installClaudeHooks({ global: !!flags.global })) }));
  if (flags.shell) {
    const files = installShellHooks();
    console.log(files.length ? t('hooks.shell', { files: files.join(', ') }) : t('hooks.shellNone'));
    console.log(dim(t('hooks.reload')));
  }
}

/* ───────────── meet ───────────── */

async function cmdMeet({ pos, flags }) {
  const { identity } = needIdentity();
  const config = loadConfig();
  const { newCall, parseInvite, joinCall } = await import('./lib/meet.mjs');
  let invite;
  if (flags.new) {
    console.log(dim(t('meet.creating')));
    const call = await newCall();
    invite = { channel_id: call.channel_id, token: call.token, pin: call.pin };
    console.log(t('meet.open', { name: identity.name, url: call.url }));
  } else {
    invite = parseInvite(pos.join(' '));
    if (!invite?.channel_id || !invite?.token) fail(t('meet.badInvite'));
  }
  if (config.brain.kind === 'lines') console.log(dim(t('meet.noBrain')));
  console.log(dim(t('meet.joining', { name: identity.name, avatar: identity.look.meetAvatar })));
  await joinCall({ invite, identity, config, log: (s) => console.log(dim(s)), maxMinutes: Number(flags.minutes) || 30 });
}

/* ───────────── orquesta ───────────── */

async function cmdLogin({ pos }) {
  if (pos[0] === 'orquesta') {
    const { login } = await import('./lib/orquesta.mjs');
    const r = await login({ open: openUrl, onWaiting: (url) => console.log(t('login.open', { url })) });
    return console.log(t('login.ok', { org: r.organizationName || r.organizationId }));
  }
  if (pos[0] && pos[0] !== '7ots') return fail('7ots login [orquesta]');
  const acct = await import('./lib/account.mjs');
  const { url, done } = await acct.startLogin({ open: openUrl });
  console.log(t('login.open', { url }));
  await done;
  const { account } = await acct.me();
  console.log(t('acct.ok', { who: account?.email || account?.name || '' }));
  return cmdOts();
}

/* ───────────── vm (cloud worker of an ot) ───────────── */

async function cmdVm({ pos, flags }) {
  const vm = await import('./lib/vm.mjs');
  if (pos[0] === 'enroll') return console.log(await vm.enroll({ server: flags.server, code: flags.code, systemd: Boolean(flags.systemd) }));
  if (pos[0] === 'worker') return vm.runWorker({ log: (s) => console.log(`[${new Date().toISOString()}] ${s}`) });
  return fail(t('vm.usage'));
}

async function cmdLogout() {
  const acct = await import('./lib/account.mjs');
  await acct.logout();
  console.log(t('acct.out'));
}

// `7ots ots`: the ots in your 7ots.com account (★ = the one on this computer).
async function cmdOts() {
  const acct = await import('./lib/account.mjs');
  if (!acct.signedIn()) return console.log(t('acct.none'));
  const { ots = [] } = await acct.me();
  if (!ots.length) return console.log(t('acct.empty', { url: acct.SEVENOTS_URL }));
  const cur = loadConfig().account?.otsId;
  for (const o of ots) console.log(`${o.id === cur ? '★' : ' '} ${o.id}  ${o.identity?.name || o.name}`);
}

async function cmdUse({ pos }) {
  if (!pos[0]) return fail('7ots use <ot-id>');
  const acct = await import('./lib/account.mjs');
  if (!acct.signedIn()) return console.log(t('acct.none'));
  const { identity } = await acct.use(pos[0]);
  console.log(t('acct.used', { name: identity.name }));
}

/* ───────────── main ───────────── */

async function main() {
  const [cmd = 'help', ...rest] = process.argv.slice(2);
  const args = parse(rest);
  if (args.flags.lang && ['en', 'es', 'pt'].includes(args.flags.lang)) (await import('./lib/i18n.mjs')).setCliLang(args.flags.lang);
  // `7ots <cmd> --help` only prints usage: it never launches anything (the pet would download Electron).
  if (args.flags.help && !['help', '--help', '-h'].includes(cmd)) {
    const key = { create: 'new', serve: 'server', wizard: 'setup', init: 'setup' }[cmd] || cmd;
    const usage = t(`usage.${key}`);
    return console.log(usage === `usage.${key}` ? t('help') : usage);
  }
  switch (cmd) {
    case 'new':
    case 'create':
      return cmdNew(args);
    case 'show':
    case 'whoami':
      return cmdShow(args);
    case 'install':
      return cmdInstall(args);
    case 'setup':
    case 'wizard':
    case 'init': {
      const { runWizard } = await import('./lib/wizard.mjs');
      const r = await runWizard();
      if (r?.launch) return cmdPet({ flags: { mode: r.mode, detach: r.mode !== 'terminal' } });
      return;
    }
    case 'pet':
      return cmdPet(args);
    case 'event':
      return cmdEvent(args);
    case 'feed':
    case 'play':
    case 'sleep':
    case 'wake':
    case 'say':
      return cmdCare(cmd, args);
    case 'ask':
    case 'tell':
      return cmdAsk(args);
    case 'dance':
    case 'entrance':
      return cmdDance(cmd, args);
    case 'reminders':
      return cmdReminders(args);
    case 'config':
    case 'settings':
      return cmdConfig(args);
    case 'status':
      return cmdStatus(args);
    case 'stop':
      return cmdStop();
    case 'hooks':
      return cmdHooks(args);
    case 'meet':
      return cmdMeet(args);
    case 'prompt':
    case 'prompts':
      return console.log(promptText(args.pos[0] || 'all'));
    case 'docs':
    case 'llms':
      return console.log(llmsTxt('https://7ots.com'));
    case 'server':
    case 'serve':
      return import('../server/server.mjs'); // the 7ots proxy (reads .env / env vars)
    case 'login':
      return cmdLogin(args);
    case 'logout':
      return cmdLogout();
    case 'vm':
      return cmdVm(args);
    case 'ots':
      return cmdOts();
    case 'use':
      return cmdUse(args);
    case 'seed':
      return console.log(cleanSeed(args.pos[0]) || '');
    case 'help':
    case '--help':
    case '-h':
      return console.log(t('help'));
    case '--version':
    case '-v':
    case 'version': {
      const { readFileSync } = await import('node:fs');
      return console.log(JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version);
    }
    default:
      fail(t('err.unknown', { cmd }));
  }
}

main().catch((e) => {
  if (process.argv[2] === 'event') process.exit(0); // hooks never fail
  console.error(e?.message || e);
  process.exit(1);
});
