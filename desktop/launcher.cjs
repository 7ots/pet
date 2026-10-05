/**
 * Entry point of the packaged desktop app (7ots.AppImage / .deb / .dmg / Setup.exe). desktop/stage.mjs copies it
 * to app/main.cjs next to cli/, server/, src/, dist/ and brand/, so nothing needs npx or a global node:
 *
 *   1. the daemon (cli/7ots.mjs pet --daemon) runs on the app's own Electron binary in node mode
 *      (ELECTRON_RUN_AS_NODE). On an AppImage it is the AppImage itself relaunched with SEVENOTS_DESKTOP_DAEMON=1
 *      instead: the binary inside lives on a mount that disappears when the process that mounted it exits, and the
 *      daemon outlives windows, relaunches and its own restarts;
 *   2. the first run creates the global identity (~/.7ots/identity.json), like `7ots new --global`;
 *   3. the pet window is cli/pet/electron/main.cjs, the same shell `7ots pet --mode desktop` opens, fed the same
 *      SEVENOTS_PET_* variables the CLI passes.
 * Updates: electron-updater against the GitHub Releases (AppImage, Windows, signed macOS builds).
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { spawn, spawnSync } = require('node:child_process');
const { app, dialog } = require('electron');

const ROOT = __dirname;
const CLI = path.join(ROOT, 'cli', '7ots.mjs');
const HOME = process.env.SEVENOTS_HOME ? path.resolve(process.env.SEVENOTS_HOME) : path.join(os.homedir(), '.7ots');
const PORT = Number(process.env.SEVENOTS_PET_PORT) || 7717;
const PET_URL = `http://127.0.0.1:${PORT}`;
const linux = process.platform === 'linux';
const APPIMAGE = linux ? process.env.APPIMAGE || '' : '';
const homeFile = (n) => path.join(HOME, n);

// Linux: Chromium's sandbox needs chrome-sandbox root:4755 (the .deb sets it; an AppImage mount is nosuid) and
// Ubuntu 24.04+ blocks the userns fallback, so without the helper every renderer dies. Same rule as the CLI, but
// --no-sandbox only counts on the real command line (the zygote starts before this file runs): relaunch with it.
if (linux && !setuidSandbox() && !process.argv.includes('--no-sandbox')) {
  // (spawned by hand: app.relaunch() before 'ready' does nothing)
  spawn(APPIMAGE || process.execPath, [...process.argv.slice(1), '--no-sandbox'], { detached: true, stdio: 'inherit' }).unref();
  app.exit(0);
} else if (process.env.SEVENOTS_DESKTOP_DAEMON === '1') runDaemon();
else runShell();

function setuidSandbox() {
  try {
    const st = fs.statSync(path.join(path.dirname(process.execPath), 'chrome-sandbox'));
    return st.uid === 0 && (st.mode & 0o4000) !== 0;
  } catch {
    return false;
  }
}

/** AppImage only: this process is the daemon (no windows), started through the AppImage so it has its own mount. */
function runDaemon() {
  app.disableHardwareAcceleration();
  // The daemon respawns itself (restart, companions) with process.execPath + cli/7ots.mjs: through the AppImage
  // again (it ignores the arguments and, with SEVENOTS_DESKTOP_DAEMON inherited, lands back here).
  if (APPIMAGE) process.execPath = APPIMAGE;
  process.argv = [process.execPath, CLI, 'pet', '--daemon'];
  import(pathToFileURL(CLI).href).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

function runShell() {
  process.env.SEVENOTS_PET_APP = '1';
  // main.cjs relaunches the shell to switch 2D → 3D: that one must not lose the single-instance race to us.
  const relaunched = process.env.SEVENOTS_APP_RELAUNCH === '1';
  delete process.env.SEVENOTS_APP_RELAUNCH;
  if (!relaunched && !app.requestSingleInstanceLock()) return app.quit();

  const relaunch = app.relaunch.bind(app);
  app.relaunch = (opts = {}) => {
    process.env.SEVENOTS_APP_RELAUNCH = '1';
    relaunch(APPIMAGE ? { execPath: APPIMAGE, ...opts } : opts); // same arguments (--no-sandbox included)
  };

  const cfg = readJson(homeFile('config.json')) || {};
  const pet = cfg.pet || {};
  const pick = (v) => (['en', 'es', 'pt'].includes(v) ? v : '');
  process.env.SEVENOTS_PET_URL = PET_URL;
  process.env.SEVENOTS_PET_TOKEN = petToken();
  process.env.SEVENOTS_PET_OPAQUE = process.env.SEVENOTS_PET_OPAQUE === '1' || pet.opaque ? '1' : '';
  process.env.SEVENOTS_PET_3D = process.env.SEVENOTS_PET_3D === '1' || pet.view === '3d' ? '1' : '';
  process.env.SEVENOTS_PET_LANG = pick(process.env.SEVENOTS_PET_LANG) || pick(process.env.SEVENOTS_LANG) || pick(cfg.lang) || '';

  globalThis.sevenotsReady = ensureDaemon().catch((e) => {
    dialog.showErrorBox('7ots', String(e?.message || e));
    app.exit(1);
    return new Promise(() => {});
  });
  require('./cli/pet/electron/main.cjs');
  app.whenReady().then(startUpdater);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Same secret as cli/lib/pet-server.mjs petToken(): ~/.7ots/pet.token, created 0600 if missing. */
function petToken() {
  fs.mkdirSync(HOME, { recursive: true });
  const f = homeFile('pet.token');
  try {
    const t = fs.readFileSync(f, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch {}
  const t = randomBytes(24).toString('hex');
  fs.writeFileSync(f, t + '\n', { mode: 0o600 });
  fs.chmodSync(f, 0o600);
  return t;
}

async function health() {
  try {
    const r = await fetch(`${PET_URL}/health`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** The CLI run as node by this very binary (short commands only: see the AppImage note above for the daemon). */
const nodeEnv = () => ({ ...process.env, ELECTRON_RUN_AS_NODE: '1' });

async function ensureDaemon() {
  if (await health()) return;
  // First run: an ot of its own, like `7ots new --global` (the daemon refuses to start without one).
  if (!fs.existsSync(homeFile('identity.json'))) {
    spawnSync(process.execPath, [CLI, 'new', '--global'], { cwd: os.homedir(), env: nodeEnv(), stdio: 'ignore', windowsHide: true });
  }
  const log = fs.openSync(homeFile('pet.log'), 'a');
  const [cmd, args, env] = APPIMAGE
    ? [APPIMAGE, process.argv.includes('--no-sandbox') ? ['--no-sandbox'] : [], { ...process.env, SEVENOTS_DESKTOP_DAEMON: '1' }]
    : [process.execPath, [CLI, 'pet', '--daemon'], nodeEnv()];
  for (const k of ['SEVENOTS_PET_APP', 'SEVENOTS_PET_URL', 'SEVENOTS_PET_TOKEN', 'SEVENOTS_PET_OPAQUE', 'SEVENOTS_PET_3D', 'SEVENOTS_PET_LANG']) delete env[k];
  // cwd = home: never pick up some project's .7ots/identity.json
  spawn(cmd, args, { cwd: os.homedir(), detached: true, windowsHide: true, stdio: ['ignore', log, log], env }).unref();
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 150));
    if (await health()) return;
  }
  throw new Error(`The pet did not start; see ${homeFile('pet.log')}`);
}

/** Updates from GitHub Releases (publish config in desktop/electron-builder.yml). Best effort, silent on errors. */
function startUpdater() {
  if (!app.isPackaged || process.env.SEVENOTS_NO_UPDATE) return;
  if (linux && !APPIMAGE) return; // .deb: the package manager's job
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.logger = null;
    autoUpdater.on('error', () => {});
    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setTimeout(check, 30_000);
    setInterval(check, 6 * 3600_000);
  } catch {}
}
