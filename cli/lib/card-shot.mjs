/**
 * The ot's card as a high-res PNG. Headless Chrome renders /card?shot=1 and the DevTools protocol (over
 * --remote-debugging-pipe: fd 3 in, fd 4 out, no WebSocket needed) captures exactly the card's box at the
 * asked scale, on a transparent background. Blend modes, glitter and the 3D ot come out as on screen.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  const dirs = ['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome'];
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  return [...names.flatMap((n) => dirs.map((d) => join(d, n))), ...mac].find(existsSync) || null;
}

/** → Buffer (png). url: the card page with ?shot=1; scale: device pixels per CSS pixel. */
export async function cardShot(url, { scale = 4, gl = false, timeout = 45000 } = {}) {
  const chrome = findChrome();
  if (!chrome) throw Object.assign(new Error('needs Google Chrome or Chromium'), { status: 501 });
  const dir = mkdtempSync(join(tmpdir(), '7ots-card-'));
  const args = ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${dir}`,
    ...(gl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu']), 'about:blank'];
  const p = spawn(chrome, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const [toChrome, fromChrome] = [p.stdio[3], p.stdio[4]];
  let seq = 0;
  const waiting = new Map();
  const events = new Map();
  let buf = '';
  fromChrome.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.method) events.get(m.method)?.(m.params);
      const w = waiting.get(m.id);
      if (!w) continue;
      waiting.delete(m.id);
      m.error ? w.rej(new Error(m.error.message)) : w.res(m.result);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const id = ++seq;
      waiting.set(id, { res, rej });
      toChrome.write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
    });
  // Chrome gone (crashed, or killed on timeout): whatever was waiting fails instead of hanging the request
  const gone = (e) => {
    for (const w of waiting.values()) w.rej(Object.assign(new Error(e?.message || 'chrome closed'), { status: 504 }));
    waiting.clear();
  };
  p.on('exit', gone);
  p.on('error', gone);
  fromChrome.on('error', () => {});
  toChrome.on('error', () => {});
  const killer = setTimeout(() => p.kill('SIGKILL'), timeout);
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, prm) => send(m, prm, sessionId);
    await s('Emulation.setDeviceMetricsOverride', { width: 460, height: 640, deviceScaleFactor: scale, mobile: false });
    await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    // The page calls __cardReady(box) once the ot is drawn (a binding: no polling competing with the 3D
    // render, which takes seconds per frame on a software GPU); then a moment for it to settle.
    const ready = new Promise((ok) => events.set('Runtime.bindingCalled', (e) => e.name === '__cardReady' && ok(JSON.parse(e.payload))));
    await s('Runtime.enable');
    await s('Runtime.addBinding', { name: '__cardReady' });
    await s('Page.navigate', { url });
    const box = await Promise.race([ready, new Promise((ok) => setTimeout(ok, timeout - 8000, null))]);
    if (box) await new Promise((ok) => setTimeout(ok, 400));
    if (!box) throw Object.assign(new Error('the card did not render'), { status: 504 });
    const pad = 2; // the rounded corners' anti-aliasing
    const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { x: box.x - pad, y: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2, scale: 1 } });
    return Buffer.from(data, 'base64');
  } finally {
    clearTimeout(killer);
    p.kill();
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 1500).unref();
  }
}
