/** Opens a URL with the system's browser. Best effort: returns false if it can't. */

import { spawn } from 'node:child_process';

export function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    // The desktop app runs the daemon as Electron-in-node-mode; a browser or app opened from here must not inherit that.
    const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true, env });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export const graphical = () =>
  process.platform === 'darwin' || process.platform === 'win32' || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
