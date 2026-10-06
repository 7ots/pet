/**
 * Desktop mode: the pet page in a transparent, frameless, always-on-top window that strolls
 * along the bottom of the screen. It resizes to what is in use and lets clicks through its empty parts. Launched by `7ots pet --mode desktop` with
 *   ~/.7ots/electron/…/electron cli/pet/electron/main.cjs (installed once by the CLI)
 * and SEVENOTS_PET_URL / SEVENOTS_PET_TOKEN in the environment.
 * Menu: right click on the pet, or the tray icon (Show / Hide / Talk / Listen / care / Settings / Quit).
 * Voice: Ctrl+Alt+Space (anywhere) makes it listen; the page records and the server transcribes (/stt).
 * With a purpose: when something needs you (the agent finished or waits, a reminder opened a site) it walks to
 * that window (found with xdotool on X11; elsewhere it comes to the cursor) and points at it.
 * SEVENOTS_PET_OPAQUE=1 paints a solid card instead of transparency (Linux setups without a compositor).
 */

const path = require('node:path');
const { execFile } = require('node:child_process');
const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, screen, session, shell } = require('electron');

const URL_ = process.env.SEVENOTS_PET_URL;
const TOKEN = process.env.SEVENOTS_PET_TOKEN;
const OPAQUE = process.env.SEVENOTS_PET_OPAQUE === '1';
const VIEW3D = process.env.SEVENOTS_PET_3D === '1';
// menus in the human's language: SEVENOTS_PET_LANG, else the system's (es_CL.UTF-8 → es)
const LANG = [process.env.SEVENOTS_PET_LANG, process.env.SEVENOTS_LANG, process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]
  .map((l) => String(l || '').slice(0, 2).toLowerCase()).find((l) => ['en', 'es', 'pt'].includes(l)) || 'en';
const ICON = path.join(__dirname, '..', '..', '..', 'brand', 'icon-512.png');
const BIG = { w: 240, h: 270 }; // with room for the bubble, the buttons and the talk box
const SMALL = { w: 160, h: 164 }; // just the ot
// The smallest the window gets: the ot with room for its hands, a hop and small effects. Every resize of a
// transparent window flickers (and in 3D rescales the canvas), so it stays at least this big; click-through
// keeps the empty parts out of the way.
const MIN = { w: 288, h: 272 };
const linux = process.platform === 'linux';

const L = {
  en: { settings: '⚙️ Settings', talk: '💬 Talk', listen: '🎙️ Listen (Ctrl+Alt+Space)', show: 'Show pet', hide: 'Hide (keeps living)', feed: '🍎 Treat', play: '🎾 Play', byte: '🎮 Play on byte', watch: '📺 Watch the game', stopGame: '⏹ Stop the game', noGames: 'byte: no games (sign in to 7ots.com)', sleep: '💤 Sleep', wake: '☀️ Wake up', still: 'Stay still', quit: 'Quit pet' },
  es: { settings: '⚙️ Configuración', talk: '💬 Hablar', listen: '🎙️ Escúchame (Ctrl+Alt+Espacio)', show: 'Mostrar mascota', hide: 'Ocultar (sigue viva)', feed: '🍎 Mimar', play: '🎾 Jugar', byte: '🎮 Jugar en byte', watch: '📺 Ver la partida', stopGame: '⏹ Parar la partida', noGames: 'byte: sin juegos (entra a 7ots.com)', sleep: '💤 Dormir', wake: '☀️ Despertar', still: 'Quedarse quieta', quit: 'Cerrar mascota' },
  pt: { settings: '⚙️ Configurações', talk: '💬 Falar', listen: '🎙️ Me escute (Ctrl+Alt+Espaço)', show: 'Mostrar bichinho', hide: 'Esconder (segue vivo)', feed: '🍎 Mimar', play: '🎾 Brincar', byte: '🎮 Jogar no byte', watch: '📺 Ver a partida', stopGame: '⏹ Parar a partida', noGames: 'byte: sem jogos (entre no 7ots.com)', sleep: '💤 Dormir', wake: '☀️ Acordar', still: 'Ficar parado', quit: 'Fechar bichinho' },
}[LANG] || {};
const tr = (k) => L[k] || { listen: 'Listen', show: 'Show pet', hide: 'Hide', talk: 'Talk', settings: 'Settings', feed: 'Feed', play: 'Play', sleep: 'Sleep', wake: 'Wake up', still: 'Stay still', quit: 'Quit pet' }[k];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // it talks without a click
if (linux && !OPAQUE) {
  // Transparent windows on Linux: these avoid the black/grey box on most X11 setups.
  app.commandLine.appendSwitch('enable-transparent-visuals');
  if (!VIEW3D) app.disableHardwareAcceleration(); // the 3D ot needs the GPU (WebGL)
}

const post = (p, body) =>
  fetch(new URL(p, URL_), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-7ots-Token': TOKEN }, body: JSON.stringify(body || {}) }).catch(() => {});

// The packaged desktop app (desktop/launcher.cjs) starts the daemon itself and sets sevenotsReady: wait for it.
app.whenReady().then(() => globalThis.sevenotsReady).then(() => setTimeout(start, linux ? 400 : 0)); // Linux: the compositor needs a moment

// The shell lives as long as the daemon that started it: when that one stops (7ots stop) or another takes
// its place (a relaunch), this shell leaves too, so there are never two shells (and two directors) at once.
{
  let pid = 0;
  let misses = 0;
  setInterval(async () => {
    const h = await fetch(new URL('/health', URL_), { signal: AbortSignal.timeout(3000) }).then((r) => r.json(), () => null);
    if (!h?.pid) return ++misses > 4 && app.quit(); // gone for ~25 s
    misses = 0;
    pid ||= h.pid;
    // The packaged app owns its shell: a daemon that restarted itself (new identity) is adopted, not a reason to leave.
    if (h.pid !== pid) process.env.SEVENOTS_PET_APP ? (pid = h.pid) : app.quit();
  }, 5000);
}

// The cursor. On X11 Chromium answers getCursorScreenPoint() from the last mouse event its own windows got,
// and a click-through window gets none: the point froze wherever the mouse last left the ot, so hovering it
// often did nothing (no menu, no grab). There a tiny python3 + libX11 helper asks the X server ~60 times a
// second instead; without python3/libX11 (or off X11) it stays Electron's answer.
let xCursor = null; // { x, y, at } in physical pixels
function watchX11Cursor() {
  if (!linux || !process.env.DISPLAY || process.env.WAYLAND_DISPLAY) return;
  const py = [
    'import ctypes, ctypes.util, sys, time',
    "x = ctypes.cdll.LoadLibrary(ctypes.util.find_library('X11') or 'libX11.so.6')",
    'x.XOpenDisplay.restype = ctypes.c_void_p',
    'x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]; x.XDefaultRootWindow.restype = ctypes.c_ulong',
    'x.XQueryPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong] + [ctypes.c_void_p] * 7',
    'd = x.XOpenDisplay(None)',
    'if not d: sys.exit(1)',
    'r = x.XDefaultRootWindow(d)',
    'w = ctypes.c_ulong(); i = [ctypes.c_int() for _ in range(4)]; m = ctypes.c_uint(); last = None; n = 0',
    'while True:',
    '  x.XQueryPointer(d, r, ctypes.byref(w), ctypes.byref(w), *[ctypes.byref(v) for v in i], ctypes.byref(m))',
    '  p = (i[0].value, i[1].value); n += 1',
    '  if p != last or n % 30 == 0:',
    "    last = p; sys.stdout.write('%d %d\\n' % p); sys.stdout.flush()",
    '  time.sleep(0.016)',
  ].join('\n');
  let child;
  try {
    child = require('node:child_process').spawn('python3', ['-c', py], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  } catch {
    return;
  }
  child.on('error', () => {});
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    const lines = buf.split('\n');
    buf = lines.pop();
    const m = /^(-?\d+) (-?\d+)$/.exec(lines.pop() || '');
    if (m) xCursor = { x: +m[1], y: +m[2], at: Date.now() };
  });
  app.on('will-quit', () => child.kill());
}
const cursorPoint = () => {
  if (xCursor && Date.now() - xCursor.at < 2000) {
    const k = screen.getPrimaryDisplay().scaleFactor || 1; // X11 pixels → Electron's DIP
    return { x: Math.round(xCursor.x / k), y: Math.round(xCursor.y / k) };
  }
  return screen.getCursorScreenPoint();
};

// Every ot on the desktop: the one that lives here ('host') and visitors from the same account.
const DEBUG = !!process.env.SEVENOTS_PET_DEBUG;
const ots = new Map();
let tray = null;
let relaunching = false; // a 2D → 3D switch that needs the GPU (see setView)

function start() {
  watchX11Cursor();
  // Tray first: if there is one, the window can stay out of the taskbar; if not, it shows there so it can be found.
  try {
    const img = nativeImage.createFromPath(ICON);
    if (!img.isEmpty()) {
      tray = new Tray(img.resize({ width: 22, height: 22 }));
      tray.setToolTip('7ots pet');
    }
  } catch {}
  ots.set('host', makeOt({ host: true }));
  // Visitors come and go from the settings (Account → invite): polled, a window each.
  const syncVisitors = async () => {
    const list = await fetch(new URL('/visitors', URL_), { headers: { 'X-7ots-Token': TOKEN } }).then((r) => (r.ok ? r.json() : null), () => null);
    if (!Array.isArray(list)) return;
    const want = new Set(list.map((v) => v.id));
    for (const [k, o] of ots) if (k !== 'host' && !want.has(k)) (o.close(), ots.delete(k));
    list.forEach((v, i) => ots.has(v.id) || ((!v.url || v.token) && ots.set(v.id, makeOt({ id: v.id, name: v.name, index: i, url: v.url, token: v.token }))));
  };
  setTimeout(syncVisitors, 2500);
  setInterval(syncVisitors, 4000);
  require('./director.cjs').createDirector({ ots, lang: LANG, url: URL_, token: TOKEN });
}

// Settings in a window of our own (not a browser tab); links elsewhere open in the browser.
const settingsWins = new Map(); // one per ot that has its own daemon
function openSettings(base = URL_, tok = TOKEN) {
  let settingsWin = settingsWins.get(base);
  if (settingsWin && !settingsWin.isDestroyed()) return settingsWin.show(), settingsWin.focus();
  settingsWin = new BrowserWindow({ width: 1120, height: 820, minWidth: 420, minHeight: 480, title: '7ots', icon: ICON, autoHideMenuBar: true, backgroundColor: '#0f0d14', show: false });
  settingsWin.removeMenu?.();
  settingsWins.set(base, settingsWin);
  settingsWin.loadURL(`${base}/settings?token=${encodeURIComponent(tok)}`);
  settingsWin.once('ready-to-show', () => settingsWin.show());
  const ours = (u) => String(u || '').startsWith(base);
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (!ours(url)) return shell.openExternal(url).catch(() => {}), { action: 'deny' };
    return { action: 'allow', overrideBrowserWindow: { width: 760, height: 900, icon: ICON, autoHideMenuBar: true, backgroundColor: '#0f0d14' } }; // e.g. an ot's card
  });
  settingsWin.webContents.on('will-navigate', (e, url) => ours(url) || (e.preventDefault(), shell.openExternal(url).catch(() => {})));
  settingsWin.on('closed', () => settingsWins.delete(base));
}

function makeOt(opt = {}) {
  const HOST = !!opt.host;
  // a second ot with everything (its own daemon: brain, voice, memory, settings) or a visitor drawn by the host's
  const base = opt.url || URL_;
  const tok = opt.token || TOKEN;
  const FULL = HOST || !!opt.url;
  const postOt = (p, body) =>
    fetch(new URL(p, base), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-7ots-Token': tok }, body: JSON.stringify(body || {}) }).catch(() => {});
  const getOt = (p) =>
    fetch(new URL(p, base), { headers: { 'X-7ots-Token': tok } }).then((r) => r.json()).catch(() => ({}));
  const area = screen.getPrimaryDisplay().workArea;
  const right = area.x + area.width;
  const floor = area.y + area.height;

  // The ot lives at an anchor (bottom-center of the window). The window is sized to what is in use:
  // SMALL is just the body; BIG (room for the bubble, the buttons and the talk box) only while needed.
  // Home: where it lives on screen. By default the bottom-right corner; wherever you drop it, after a drag.
  const HOME_FILE = path.join(require('node:os').homedir(), '.7ots', HOST ? 'pet-home.json' : `pet-home-${opt.id}.json`);
  let home = null;
  try {
    const h = JSON.parse(require('node:fs').readFileSync(HOME_FILE, 'utf8'));
    if (h.x >= area.x && h.x <= right && h.y >= area.y + 80 && h.y <= floor) home = { x: h.x, y: h.y };
  } catch {}
  let homeSave = null;
  const setHome = (p) => {
    home = { x: Math.round(p.x), y: Math.round(p.y) };
    clearTimeout(homeSave);
    homeSave = setTimeout(() => require('node:fs').promises.writeFile(HOME_FILE, JSON.stringify(home)).catch(() => {}), 800);
  };
  // a visitor turns up beside the host, a bit to the left
  const hostHome = () => ots.get('host')?.home() || { x: right - BIG.w / 2 - 24, y: floor };
  const homeAnchor = () => (home ? { ...home } : HOST ? { x: right - BIG.w / 2 - 24, y: floor } : { x: Math.max(area.x + 140, hostHome().x - 230 * ((opt.index || 0) + 1)), y: hostHome().y });
  if (!HOST && !home) home = homeAnchor(); // a visitor roams beside the host, at its height (saved once dragged)
  const pos = homeAnchor();
  let size = BIG; // it says hi on start
  const bounds = (s = size, a = pos, lift = 0) => ({ x: Math.round(a.x - s.w / 2), y: Math.round(a.y - s.h - lift), width: s.w, height: s.h });

  const win = new BrowserWindow({
    ...bounds(),
    transparent: !OPAQUE,
    frame: false,
    resizable: true, // resized by code only; frameless, so no edges to grab
    hasShadow: OPAQUE,
    alwaysOnTop: true,
    skipTaskbar: !!tray,
    title: '7ots pet',
    icon: ICON,
    backgroundColor: OPAQUE ? '#ffffff' : '#00000000',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces?.(true);
  let view3d = VIEW3D; // switched live from the settings (see setView)
  const petURL = () => `${base}/pet?desktop=1${FULL ? '' : `&guest=${encodeURIComponent(opt.id)}`}${OPAQUE ? '&opaque=1' : ''}${view3d ? '&3d=1' : ''}&token=${encodeURIComponent(tok)}`;
  win.loadURL(petURL());
  // The page's ⚙️ button opens the settings window; anything else is denied.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${base}/settings`)) openSettings(base, tok);
    return { action: 'deny' };
  });
  // Only our own pet page may load (its reload after a settings change or another ot: Electron routes
  // location.reload() through will-navigate too, so blocking everything froze the old look until a restart).
  win.webContents.on('will-navigate', (e, url) => String(url || e?.url || '').startsWith(`${base}/pet?`) || e.preventDefault());
  win.webContents.on('console-message', (e, level, msg) => /\[7ots/.test(msg ?? e?.message) && console.log(msg ?? e?.message)); // to ~/.7ots/electron.log
  // The microphone, only for our own page (voice control).
  const ours = (u) => /^http:\/\/127\.0\.0\.1:\d+\//.test(String(u || '')); // our daemons
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, d) => cb(perm === 'media' && ours(d?.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => perm === 'media' && ours(origin));
  const alive = () => !win.isDestroyed();
  const page = (js) => alive() && win.webContents.executeJavaScript(js).catch(() => {});

  let still = false;
  let lastBounds = null;
  const place = (lift = 0) => {
    const b = bounds(size, pos, lift);
    if (lastBounds && b.x === lastBounds.x && b.y === lastBounds.y && b.width === lastBounds.width && b.height === lastBounds.height) return;
    lastBounds = b;
    win.setBounds(b);
  };
  const show = () => {
    Object.assign(pos, homeAnchor());
    place();
    win.showInactive();
    win.moveTop();
  };
  const dismiss = () => post('/account/visitor', { id: opt.id, on: false }).finally(() => close());
  const guestMenu = () =>
    Menu.buildFromTemplate([
      { label: `${opt.name || opt.id}`, enabled: false },
      { type: 'separator' },
      { label: { es: '👋 Despedir', pt: '👋 Mandar embora' }[LANG] || '👋 Send home', click: dismiss },
      { label: tr('settings'), click: () => openSettings(base, tok) },
    ]);
  const menu = () =>
    Menu.buildFromTemplate([
      win.isVisible() ? { label: tr('hide'), click: () => win.hide() } : { label: tr('show'), click: show },
      { type: 'separator' },
      { label: tr('talk'), click: () => { show(); win.focus(); page('postMessage({ talk: true })'); } },
      { label: tr('listen'), click: listen },
      { label: tr('feed'), click: () => postOt('/event', { type: 'feed' }) },
      { label: tr('sleep'), click: () => postOt('/event', { type: 'sleep' }) },
      { label: tr('wake'), click: () => postOt('/event', { type: 'wake' }) },
      { label: tr('byte'), click: () => gameMenu().then((m) => m.popup({ window: win })) },
      { type: 'separator' },
      { label: tr('settings'), click: () => openSettings(base, tok) },
      { label: tr('still'), type: 'checkbox', checked: still, click: (i) => (still = i.checked) },
      HOST ? { label: tr('quit'), click: () => post('/quit').finally(() => app.quit()) } : { label: { es: '👋 Despedir', pt: '👋 Mandar embora' }[LANG] || '👋 Send home', click: dismiss },
    ]);
  // ── byte arena: the ot plays a game live (7ots.com runs its moves) and a small window shows it, beside it ──
  let gameWin = null;
  const watchGame = (url) => {
    if (!/^https:\/\/[^/]+\/stream\/s_[a-z0-9]+$/i.test(String(url || ''))) return;
    if (gameWin && !gameWin.isDestroyed()) return gameWin.loadURL(url), gameWin.showInactive();
    const w = 480;
    const h = 300;
    const [wx, wy] = win.getPosition();
    const x = Math.max(area.x, Math.min(right - w, wx + size.w / 2 - w - 40));
    const y = Math.max(area.y, Math.min(floor - h, wy + size.h - h));
    gameWin = new BrowserWindow({ x, y, width: w, height: h, minWidth: 320, minHeight: 200, alwaysOnTop: true, title: 'byte arena', icon: ICON, autoHideMenuBar: true, backgroundColor: '#0b0b12', show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    gameWin.removeMenu?.();
    gameWin.setAlwaysOnTop(true, 'floating');
    gameWin.webContents.setAudioMuted(false);
    // the page stays on byte's stream; any other link goes to the browser
    const origin = new URL(url).origin;
    gameWin.webContents.setWindowOpenHandler(({ url: u }) => (shell.openExternal(u).catch(() => {}), { action: 'deny' }));
    gameWin.webContents.on('will-navigate', (e, u) => String(u).startsWith(`${origin}/stream/`) || (e.preventDefault(), shell.openExternal(u).catch(() => {})));
    gameWin.loadURL(url);
    gameWin.once('ready-to-show', () => gameWin.showInactive());
    gameWin.on('closed', () => (gameWin = null));
  };
  const playGame = async (game) => {
    const r = await fetch(new URL('/byte/play', base), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-7ots-Token': tok }, body: JSON.stringify({ game }) }).then((x) => x.json()).catch((e) => ({ error: e.message }));
    if (r.streamUrl) {
      watchGame(r.streamUrl);
      postOt('/event', { type: 'say', text: `🎮 ${r.game}` });
      watchStart(r.sessionId);
    } else postOt('/event', { type: 'say', text: `byte: ${r.error || 'no'}` });
  };
  // a game that dies before its first move leaves the stream black: say why and close the window
  const watchStart = (sid, n = 0) =>
    setTimeout(async () => {
      const st = await getOt('/byte/status').catch(() => ({}));
      if (st.sessionId !== sid) return;
      if (st.status === 'error' || ((st.status === 'finished' || st.status === 'stopped') && !st.moves)) {
        postOt('/event', { type: 'say', text: `byte: ${st.error || st.status}` });
        if (gameWin && !gameWin.isDestroyed()) gameWin.close();
      } else if (!st.moves && n < 12) watchStart(sid, n + 1);
    }, 4000);
  const gameMenu = async () => {
    const [st, g] = await Promise.all([getOt('/byte'), getOt('/byte/games')]);
    const live = st.play?.status === 'running';
    const items = live
      ? [
          { label: `${st.play.game} · ${st.play.moves}`, enabled: false },
          { label: tr('watch'), click: () => watchGame(st.play.streamUrl) },
          { label: tr('stopGame'), click: () => postOt('/byte/stop').then(() => gameWin && !gameWin.isDestroyed() && gameWin.close()) },
        ]
      : (g.games || []).map((x) => ({ label: x.name || x.slug, click: () => playGame(x.slug) }));
    return Menu.buildFromTemplate(items.length ? items : [{ label: tr('noGames'), enabled: false }]);
  };
  function listen() {
    if (!win.isVisible()) win.showInactive();
    page('postMessage({ listen: true })');
  }
  if (HOST) {
    try {
      globalShortcut.register('CommandOrControl+Alt+Space', listen);
    } catch {}
    app.on('will-quit', () => globalShortcut.unregisterAll());
  }
  win.webContents.on('context-menu', () => (FULL ? menu() : guestMenu()).popup({ window: win }));
  if (HOST && tray) {
    const refresh = () => tray.setContextMenu(menu()); // Linux trays only show the context menu
    refresh();
    win.on('show', refresh);
    win.on('hide', refresh);
    tray.on('click', () => (win.isVisible() ? win.hide() : show()));
  }

  // The user dragged it: that spot becomes its home (it roams around it, and comes back there after errands),
  // remembered across restarts. Linux only emits 'move' (not 'moved'): our own setBounds also emits it, so
  // only a position that differs from the last one we set counts as a drag.
  let dragged = 0;
  const onMove = () => {
    if (!alive() || !lastBounds) return;
    const [wx, wy] = win.getPosition();
    if (Math.abs(wx - lastBounds.x) < 3 && Math.abs(wy - lastBounds.y) < 3) return;
    dragged = Date.now();
    droppedSaid = false;
    pos.x = wx + size.w / 2;
    pos.y = wy + size.h;
    lastBounds = { ...lastBounds, x: wx, y: wy };
    plan = { mode: 'idle', until: Date.now() + 6000 };
    setHome(pos);
  };
  win.on('move', onMove);
  // Our own drag (the page has no drag region, so clicks reach it): the window follows the cursor while the
  // button is down on the ot. Past 4 px it is a drag: the drop spot becomes home, as with a system drag.
  let grabbing = null;
  let grabTimer = null;
  function grab(on, resizing = false) {
    clearInterval(grabTimer);
    // stretching from a corner (pet.html): the window keeps the mouse and stays put; the page grows the ot
    if (on && resizing) {
      grabbing = { resize: true, moved: false };
      grabTimer = setInterval(() => (grabbing ? (stillUntil = Date.now() + 1200) : clearInterval(grabTimer)), 200); // no wandering off mid-stretch
      return;
    }
    if (!on) {
      if (grabbing?.moved) (setHome(pos), (droppedSaid = false), (plan = { mode: 'idle', until: Date.now() + 6000 }));
      grabbing = null;
      return;
    }
    // while grabbed the window has the mouse, so Electron's own cursor is live (and finer than the X11 poll)
    const c = screen.getCursorScreenPoint();
    grabbing = { dx: pos.x - c.x, dy: pos.y - c.y, x: c.x, y: c.y, moved: false };
    grabTimer = setInterval(() => {
      if (!alive() || !grabbing) return clearInterval(grabTimer);
      const p = screen.getCursorScreenPoint();
      if (!grabbing.moved && Math.hypot(p.x - grabbing.x, p.y - grabbing.y) < 4) return;
      if (!grabbing.moved) page('postMessage({ carried: true })'); // the page stretches it toward the pull
      grabbing.moved = true;
      dragged = Date.now();
      pos.x = Math.max(area.x + size.w / 2 - 40, Math.min(right - size.w / 2 + 40, p.x + grabbing.dx));
      pos.y = Math.max(area.y + size.h - 40, Math.min(floor + 40, p.y + grabbing.dy));
      place();
    }, 16);
  }
  win.on('moved', onMove);

  // ── What the page is showing (polled): hit areas for click-through, and whether it needs the big window ──
  let rects = [];
  let need = null; // what the page really shows: { w, h } (bubble, effects around the body, talk box)
  let busy = false; // bubble or talk box on screen
  let asleep = false; // asleep it stays put (an urgent stir wakes it for a moment, see pet.html)
  const HIT = `(() => {
    const out = [];
    for (const e of document.querySelectorAll('#stage, .actions, .ask, .bubble.asking')) {
      const cs = getComputedStyle(e);
      // the menu counts while faded out too: reaching for it must not let the mouse through (and hide it)
      if (cs.display === 'none' || cs.visibility === 'hidden' || (+cs.opacity < 0.3 && !e.classList.contains('actions'))) continue;
      const r = e.getBoundingClientRect();
      if (r.width && r.height) out.push([r.left, r.top, r.right, r.bottom]);
    }
    const goal = window.__goal || null;
    window.__goal = null;
    return { rects: out, goal, need: window.__need?.(), busy: document.body.classList.contains('talking') || document.body.classList.contains('listening') || !!document.querySelector('.bubble.on'), asleep: document.body.classList.contains('asleep') };
  })()`;
  const hitTimer = setInterval(() => {
    if (!alive()) return;
    win.webContents.executeJavaScript(HIT).then((r) => {
      ({ rects, busy, asleep } = r);
      need = r.need || null;
      if (r.goal) goTo(r.goal);
    }).catch(() => {});
  }, 120);

  // Click-through: only the ot, its buttons and the talk box take the mouse; the transparent rest lets
  // clicks reach the window behind. The cursor is polled because `forward: true` is macOS/Windows only.
  let passing = null;
  let hoverUntil = 0;
  let stillUntil = 0;
  const pass = (p) => {
    if (p === passing || !alive()) return;
    passing = p;
    win.setIgnoreMouseEvents(p, { forward: true });
  };
  let cursorNear = false;
  let hovered = false;
  let lastLook = null;
  let shrinkAt = 0;
  let shrinkTo = null;
  let droppedSaid = true;
  let dbgT = 0;
  const mouseTimer = setInterval(() => {
    if (!alive() || !win.isVisible()) return;
    const c = cursorPoint();
    const [wx, wy] = win.getPosition();
    const x = c.x - wx;
    const y = c.y - wy;
    const over = rects.some(([l, t, r, b]) => x >= l - 14 && x <= r + 14 && y >= t - 14 && y <= b + 14);
    if (over) hoverUntil = Date.now() + 900;
    // anywhere over its window (not only the drawn parts): it stays put so it can be clicked or dragged
    if (x >= 0 && y >= 0 && x <= size.w && y <= size.h) stillUntil = Date.now() + 1200;
    // the eyes follow the cursor anywhere on screen (the page only sees it inside the window)
    if (!lastLook || Math.abs(x - lastLook[0]) + Math.abs(y - lastLook[1]) > 6) {
      lastLook = [x, y];
      page(`postMessage({ look: [${x}, ${y}] })`);
    }
    // dropped after a drag: a little dizzy
    if (dragged && !droppedSaid && Date.now() - dragged > 350) {
      droppedSaid = true;
      page('postMessage({ dropped: true })');
    }
    cursorNear = Math.hypot(c.x - pos.x, c.y - (pos.y - SMALL.h / 2)) < 260;
    if (DEBUG && Date.now() - (dbgT || 0) > 1000) (dbgT = Date.now()), console.log('[7ots dbg]', HOST ? 'host' : opt.id, 'cur', x, y, 'over', over, 'busy', busy, 'pass', passing, 'rects', JSON.stringify(rects.map((q) => q.map(Math.round))), 'size', size.w, size.h, 'win', wx, wy);
    pass(!(over || busy || grabbing) && rects.length > 0); // while dragged it keeps the mouse (the button-up must reach the page)
    // the menu shows on hover: CSS :hover alone misses it when the window starts taking the mouse (or resizes)
    // under a cursor that has not moved since
    const h = Date.now() < hoverUntil;
    if (h !== hovered) (hovered = h), page(`document.body.classList.toggle('hover', ${h})`);
    resize();
  }, 60);
  // testing: SEVENOTS_PET_FX=thought plays that effect every 5 s
  if (process.env.SEVENOTS_PET_FX) setInterval(() => page(`postMessage(${JSON.stringify({ effect: process.env.SEVENOTS_PET_FX })})`), 5000);
  let held = null; // a scene holds one size from start to end (see director.cjs)
  function resize() {
    // Size: what the page shows (the bubble's real height, room for effects), big enough for the buttons on hover.
    // Grows at once, shrinks only after it has wanted less for 2.5 s: an animation that swings the arms in and
    // out would otherwise resize the window on every swing, and each resize of a transparent window flickers.
    // 16 px steps to avoid resizing for every pixel.
    const hover = Date.now() < hoverUntil;
    const step = (v) => Math.ceil(v / 16) * 16;
    const want = {
      w: step(Math.min(area.width, Math.max(MIN.w, need?.w || 0, hover ? BIG.w : 0, held?.w || 0))),
      h: step(Math.min(area.height, Math.max(MIN.h, need?.h || 0, hover ? BIG.h : 0, held?.h || 0))),
    };
    const grow = want.w > size.w || want.h > size.h;
    const differs = want.w !== size.w || want.h !== size.h;
    if (!differs) (shrinkAt = 0), (shrinkTo = null);
    else if (!grow) shrinkTo = shrinkTo ? { w: Math.max(shrinkTo.w, want.w), h: Math.max(shrinkTo.h, want.h) } : want; // the most it wanted while waiting
    // growing never waits (a stretch while dragged would be cut off); shrinking waits for the drop
    if (differs && (grow || (Date.now() - dragged > 400 && !held && (shrinkAt ||= Date.now() + 6000) < Date.now()))) {
      size = grow ? { w: Math.max(want.w, size.w), h: Math.max(want.h, size.h) } : shrinkTo || want;
      shrinkAt = 0;
      shrinkTo = null;
      place();
    }
  }
  // 2D ↔ 3D from the settings. A 2D start on Linux turned the GPU off (see the top), and WebGL cannot come
  // back without it: then the whole shell relaunches as 3D (the daemons live on; visitors reopen from /visitors).
  function setView(on) {
    if (on === view3d) return;
    if (on && linux && !OPAQUE && !VIEW3D) {
      if (relaunching) return;
      relaunching = true;
      process.env.SEVENOTS_PET_3D = '1';
      app.relaunch();
      return app.exit(0);
    }
    view3d = on;
    if (alive()) win.loadURL(petURL());
  }
  // An effect just started: the page says how much room it needs right away (see tellNeed in pet.html).
  win.webContents.on('console-message', (e, level, msg) => {
    const m = String(e?.message ?? msg ?? '');
    if (m.startsWith('\u00a77drag')) {
      const d = JSON.parse(m.slice(6));
      return grab(d.on, d.resize);
    }
    if (m.startsWith('\u00a77bye')) return HOST || dismiss();
    if (m.startsWith('\u00a77ctx')) return (FULL ? menu() : guestMenu()).popup({ window: win });
    if (m.startsWith('\u00a77game')) return FULL && gameMenu().then((mm) => mm.popup({ window: win }));
    if (m.startsWith('\u00a77view')) return setView(m.slice(6) === '3d');
    if (m.startsWith('\u00a77enter')) return enter();
    if (!m.startsWith('\u00a77need')) return;
    try {
      need = JSON.parse(m.slice(6));
      if (alive() && win.isVisible()) resize();
    } catch {}
  });

  // ── Movement: steering with ease-in/ease-out, a little gait bounce, hops, pauses, curiosity ──
  const rnd = (a, b) => a + Math.random() * (b - a);
  const BAND = 200; // how far above the taskbar it roams
  const minX = area.x + 136; // half the widest window (bubble + effects) stays on screen
  const maxX = right - 136;
  const homeY = () => home?.y ?? floor; // it roams in a band above its home's floor
  const clampY = (y) => Math.max(homeY() - BAND, Math.min(homeY(), y));
  const vel = { x: 0, y: 0 };
  let plan = { mode: 'idle', until: Date.now() + 2500 };
  let gait = 0;
  let facing = 0; // what the page last heard: -1..1 (3D yaw follows it smoothly)
  let lastT = Date.now();

  function next() {
    const now = Date.now();
    const r = Math.random();
    if (r < 0.38) return { mode: 'idle', until: now + rnd(1800, 7000) };
    if (r < 0.48) return { mode: 'hop', start: now, hops: 1 + Math.floor(Math.random() * 3), then: { mode: 'idle', until: now + 2500 } };
    if (r < 0.6 && cursorNear) return { mode: 'follow', until: now + rnd(3000, 6000), speed: rnd(70, 110) };
    // a stroll: sometimes short and lazy, sometimes across the screen
    const far = Math.random() < 0.3;
    const dx = (far ? rnd(300, 900) : rnd(60, 260)) * (Math.random() < 0.5 ? -1 : 1);
    // ...but never wanders far from home: past 320 px it heads back toward it
    const hx = home?.x ?? pos.x;
    const tx = Math.max(minX, Math.min(maxX, Math.abs(pos.x + dx - hx) > 320 ? hx + rnd(-120, 120) : pos.x + dx));
    return { mode: 'go', tx, ty: clampY(pos.y + rnd(-60, 60)), speed: far ? rnd(110, 170) : rnd(45, 95) };
  }

  const stepTimer = setInterval(() => {
    // isDestroyed first: once the window is gone, isVisible() throws ("Object has been destroyed").
    if (!alive() || !win.isVisible()) return;
    const now = Date.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const errand = plan.mode === 'point';
    const scene = plan.mode === 'scene' || plan.mode === 'fling';
    // the cursor on it stops it, scenes too (the director sees interrupted() and ends the scene): something
    // that walks away from the mouse can't be grabbed or clicked
    if (now - dragged < 6000 || now < stillUntil || (!errand && now < hoverUntil) || (!scene && (still || (!errand && (busy || asleep))))) {
      // stop gently
      vel.x *= 0.8;
      vel.y *= 0.8;
      if (Math.abs(vel.x) < 1 && facing !== 0 && plan.mode !== 'show') tellFacing(0); // keeps facing what it points at
      return;
    }

    let lift = 0;
    let tx = pos.x;
    let ty = pos.y;
    let speed = 0;
    if (plan.mode === 'show' && now > plan.until) plan = { mode: 'idle', until: now + rnd(2000, 5000) };
    if (plan.mode === 'idle' && now > plan.until) {
      plan = next();
      if (plan.mode === 'follow') page('postMessage({ follow: true })');
    }
    if (plan.mode === 'go' || plan.mode === 'point' || plan.mode === 'scene') ({ tx, ty, speed } = plan);
    else if (plan.mode === 'fling') {
      // knocked back: an arc, sliding to a stop where it lands
      const t = (now - plan.start) / plan.ms;
      if (t >= 1) plan = { mode: 'scene', tx: pos.x, ty: pos.y, speed: 0, dir: plan.dir };
      else {
        pos.x = Math.max(minX, Math.min(maxX, pos.x + plan.vx * dt * (1 - t)));
        lift = Math.sin(Math.PI * t) * plan.height;
        vel.x = vel.y = 0;
        tx = pos.x;
        ty = pos.y;
      }
    }
    else if (plan.mode === 'follow') {
      const c = cursorPoint();
      // stays a polite distance from the cursor, on the floor band
      tx = Math.max(minX, Math.min(maxX, c.x + (c.x > pos.x ? -90 : 90)));
      ty = clampY(c.y + SMALL.h / 2);
      speed = plan.speed;
      if (now > plan.until) plan = { mode: 'idle', until: now + rnd(1500, 4000) };
    } else if (plan.mode === 'hop') {
      const t = (now - plan.start) / 480;
      if (t >= plan.hops) plan = plan.then;
      else if (Math.floor(t) !== plan.said) (plan.said = Math.floor(t), page('postMessage({ hop: true })'));
      if (plan.mode === 'hop') lift = Math.sin(Math.PI * (t % 1)) * 34 * (1 - Math.floor(t) * 0.25);
    }

    // arrive: full speed far away, easing to a stop in the last 140 px; velocity eases too (no jerks)
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dist = Math.hypot(dx, dy);
    const want = speed * Math.min(1, dist / 140);
    const vx = dist > 0.5 ? (dx / dist) * want : 0;
    const vy = dist > 0.5 ? (dy / dist) * want : 0;
    const k = Math.min(1, dt * 2.6);
    vel.x += (vx - vel.x) * k;
    vel.y += (vy - vel.y) * k;
    pos.x = Math.max(minX, Math.min(maxX, pos.x + vel.x * dt));
    pos.y = Math.max(minY, Math.min(floor, pos.y + vel.y * dt)); // roams near the floor, errands go anywhere
    if (plan.mode === 'go' && dist < 3 && Math.hypot(vel.x, vel.y) < 6) plan = { mode: 'idle', until: now + rnd(1500, 6000) };
    if (plan.mode === 'point' && ((dist < 4 && Math.hypot(vel.x, vel.y) < 8) || now > plan.until)) arrived(plan);

    // gait: a small bounce per step, scaled by speed
    const v = Math.hypot(vel.x, vel.y);
    gait += dt * (4 + v / 18);
    if (v > 4) lift += Math.abs(Math.sin(gait * Math.PI)) * Math.min(5, v / 22);

    // facing: turn toward where it walks, back to the front when it stops
    const f = v > 8 ? Math.max(-1, Math.min(1, vel.x / 70)) : plan.mode === 'show' || scene ? plan.dir || 0 : 0;
    if (Math.abs(f - facing) > 0.15 || (f === 0 && facing !== 0)) tellFacing(Math.round(f * 10) / 10);

    place(Math.round(lift));
  }, 16);

  // ── Entrance (pet.html entrance()): it reappears ~500 px toward the middle of the screen and walks back
  // to where it was, like down the ramp to the ring. Not mid-scene, not pinned or asleep. ──
  let enterUntil = 0;
  function enter() {
    if (plan.mode === 'scene' || plan.mode === 'fling' || still || asleep || Date.now() - dragged < 2000) return;
    enterUntil = Date.now() + 12000;
    const to = { ...pos };
    const mid = area.x + area.width / 2;
    pos.x = Math.max(minX, Math.min(maxX, to.x + (to.x > mid ? -1 : 1) * 520));
    vel.x = vel.y = 0;
    place();
    plan = { mode: 'go', tx: to.x, ty: to.y, speed: 115 };
  }

  // ── Errands: walk to what needs you and point at it ──
  const minY = area.y + BIG.h;
  const TERM = /terminal|kitty|alacritty|konsole|tilix|wezterm|xterm|ghostty|warp|terminator|code|cursor|windsurf|zed|jetbrains|idea|pycharm|webstorm/i;
  const BROWSER = /chrom|firefox|brave|vivaldi|opera|edge|epiphany|librewolf|zen/i;
  const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { timeout: 1500, windowsHide: true }, (e, out) => res(e ? '' : String(out))));
  // The top-most visible window whose class matches, if it is not mostly covered by others (no use pointing
  // at a terminal hidden behind the browser: then it comes to the cursor instead).
  async function findWindow(re) {
    if (!linux || !process.env.DISPLAY) return null;
    const root = await run('xprop', ['-root', '_NET_CLIENT_LIST_STACKING', '_NET_CURRENT_DESKTOP']);
    const desk = root.match(/_NET_CURRENT_DESKTOP\(CARDINAL\) = (\d+)/)?.[1];
    const ids = (root.match(/0x[0-9a-f]+/gi) || []).reverse(); // bottom → top, reversed
    const above = [];
    for (const hex of ids) {
      const id = String(parseInt(hex, 16));
      const props = await run('xprop', ['-id', id, 'WM_CLASS', '_NET_WM_STATE', '_NET_WM_DESKTOP', '_NET_WM_WINDOW_TYPE']);
      const cls = props.match(/WM_CLASS\(STRING\) = (.*)/)?.[1] || '';
      const d = props.match(/_NET_WM_DESKTOP\(CARDINAL\) = (\d+)/)?.[1];
      if (/HIDDEN/.test(props) || /7ots|electron/i.test(cls) || (d != null && desk != null && d !== desk && d !== '4294967295')) continue;
      if (/_TYPE_(DOCK|DESKTOP)/.test(props)) continue;
      const g = await run('xdotool', ['getwindowgeometry', '--shell', id]);
      const n = (k) => Number(g.match(new RegExp(`^${k}=(-?\\d+)`, 'm'))?.[1]);
      const r = { x: n('X'), y: n('Y'), w: n('WIDTH'), h: n('HEIGHT') };
      if (!(r.w > 50)) continue;
      if (re.test(cls)) {
        // how much of it the windows above cover (approximate: sum of overlaps, capped)
        let hid = 0;
        for (const o of above) hid += Math.max(0, Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x)) * Math.max(0, Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y));
        return hid / (r.w * r.h) > 0.6 ? null : r;
      }
      above.push(r);
    }
    return null;
  }
  async function goTo(goal) {
    if (still || plan.mode === 'scene' || plan.mode === 'fling') return; // a scene with another ot goes first
    if (goal === 'browser') await new Promise((r) => setTimeout(r, 900)); // let the site open first
    const c = cursorPoint();
    const rect = (goal === 'agent' ? await findWindow(TERM) : goal === 'browser' ? await findWindow(BROWSER) : null) || { x: c.x - 1, y: c.y - 1, w: 2, h: 2, cursor: true };
    const cx = rect.x + rect.w / 2;
    // stand beside the window if there is room, otherwise inside it, near its lower corner closest to us
    const half = SMALL.w / 2 + 12;
    const roomL = rect.x - half >= minX;
    const roomR = rect.x + rect.w + half <= maxX;
    let tx;
    if (rect.cursor) tx = c.x + (c.x > pos.x ? -110 : 110);
    else if (roomL && (!roomR || pos.x < cx)) tx = rect.x - half;
    else if (roomR) tx = rect.x + rect.w + half;
    else tx = pos.x < cx ? rect.x + half + 20 : rect.x + rect.w - half - 20;
    tx = Math.max(minX, Math.min(maxX, tx));
    const ty = Math.max(minY, Math.min(floor, rect.cursor ? c.y + SMALL.h / 2 : Math.min(rect.y + rect.h, rect.y + rect.h * 0.75 + SMALL.h / 2)));
    const spot = rect.cursor ? c : { x: cx, y: rect.y + Math.min(rect.h / 2, 160) };
    plan = { mode: 'point', tx, ty, speed: 260, until: Date.now() + 9000, spot };
    page('postMessage({ errand: true })');
  }
  function arrived(p) {
    const dir = p.spot.x >= pos.x ? 1 : -1;
    plan = { mode: 'show', dir, until: Date.now() + 5000 };
    tellFacing(dir);
    const [wx, wy] = win.getPosition();
    page(`postMessage({ point: ${dir}, at: [${Math.round(p.spot.x - wx)}, ${Math.round(p.spot.y - wy)}] })`);
  }

  function tellFacing(f) {
    facing = f;
    page(`postMessage({ walk: ${f} })`);
  }

  function close() {
    if (alive()) win.destroy();
  }
  win.on('closed', () => {
    clearInterval(stepTimer);
    clearInterval(hitTimer);
    clearInterval(mouseTimer);
  });

  // ── What the director (scenes between ots, see director.cjs) can do with this one ──
  return {
    id: HOST ? 'host' : opt.id,
    host: HOST,
    home: () => homeAnchor(),
    pos: () => ({ ...pos }),
    bounds: () => ({ minX, maxX, floor }),
    close,
    // free to join a scene: shown, loaded, not held still, dragged, hovered, talking or on an errand
    daemon: { url: base, token: opt.token || TOKEN }, // its own daemon (settings there can ask for a scene)
    // for a scene asked from settings: errands (pointing at the terminal while an agent works) may be cut short
    ready: () => alive() && win.isVisible() && !win.webContents.isLoading() && !asleep && Date.now() - dragged > 3000 && Date.now() > hoverUntil + 1500 && plan.mode !== 'scene' && plan.mode !== 'fling',
    free: () => alive() && win.isVisible() && !win.webContents.isLoading() && !still && !asleep && Date.now() > enterUntil && Date.now() - dragged > 8000 && Date.now() > hoverUntil + 1500 && !busy && /idle|go|hop/.test(plan.mode),
    walkTo: (x, y = pos.y, speed = 120) => (plan = { mode: 'scene', tx: Math.max(minX, Math.min(maxX, x)), ty: Math.max(minY, Math.min(floor, y)), speed, dir: plan.dir || 0 }),
    arrivedAt: () => plan.mode === 'scene' && Math.abs(plan.tx - pos.x) < 6 && Math.abs(plan.ty - pos.y) < 6 && Math.hypot(vel.x, vel.y) < 10,
    face: (dir) => {
      if (plan.mode === 'scene' || plan.mode === 'fling') plan.dir = dir;
      tellFacing(dir);
    },
    fling: (vx, height = 46, ms = 650) => (plan = { mode: 'fling', vx, height, ms, start: Date.now(), dir: plan.dir || 0 }),
    say: (msg) => page(`postMessage(${JSON.stringify(msg)})`),
    release: () => {
      plan = { mode: 'idle', until: Date.now() + rnd(2500, 6000) };
      tellFacing(0);
    },
    hold: (s) => ((held = s), resize()),
    inScene: () => plan.mode === 'scene' || plan.mode === 'fling',
    // the mouse on it (to click or drag it) ends the scene
    interrupted: () => !alive() || !win.isVisible() || Date.now() - dragged < 1000 || Date.now() < hoverUntil || Date.now() < stillUntil,
  };
}

// Hidden is not closed: the pet lives on in the tray until Quit.
app.on('window-all-closed', () => app.quit());
