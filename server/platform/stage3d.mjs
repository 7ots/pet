/**
 * GET /api/o/:id/3d — the ot alone, in 3D, as a page other apps embed in an <iframe>
 * (meet.apuchat.com puts it on a call tile when an agent wears this ot as its persona).
 *
 * The page draws the ot's own character (same spec as the 2D face, mods included) on a
 * transparent background and takes two messages from its parent:
 *   { type: '7ots:speaking', on: boolean }   babble the mouth while the ot is talking
 *   { type: '7ots:gesture', name: string }   one of the 3D gestures (wave, nod, …)
 * Neither carries data nor reaches the server, so any parent may send them. A look that is
 * not a character (an uploaded picture) falls back to /portrait.svg.
 */

// Who may frame it. Kept to the apps that actually embed ots; widen it here, not in Caddy.
export const STAGE3D_FRAME_ANCESTORS = [
  "'self'",
  'https://meet.apuchat.com',
  'https://apuchat.com', 'https://*.apuchat.com',
  'https://getorquesta.com', 'https://*.getorquesta.com',
  'https://rogerthat.chat', 'https://*.rogerthat.chat',
];

export function stage3dHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // frame-ancestors supersedes the X-Frame-Options the edge adds to every response.
    'Content-Security-Policy': `frame-ancestors ${STAGE3D_FRAME_ANCESTORS.join(' ')}; base-uri 'none'; object-src 'none'`,
  };
}

export function stage3dPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>7ots</title>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>
<style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  #ot { position: absolute; inset: 0; }
  img { position: absolute; inset: 0; margin: auto; height: 70%; max-width: 85%; object-fit: contain; }
</style>
</head>
<body>
<div id="ot"></div>
<script type="module">
  import { createCharacter3D } from '/src/character3d/index.js';
  const el = document.getElementById('ot');
  const base = location.pathname.replace(/\\/3d\\/?$/, '');
  const flat = () => { el.innerHTML = ''; const i = new Image(); i.alt = ''; i.src = base + '/portrait.svg'; el.append(i); };
  let ot = null;
  try {
    const card = await fetch(base + '/identity', { headers: { accept: 'application/json' } }).then((r) => r.json());
    const look = card && card.look;
    if (look && look.kind === 'character' && look.character) ot = createCharacter3D(el, look.character, { orbit: false, backdrop: false });
    else flat();
  } catch { flat(); }
  let talk = null;
  addEventListener('message', (e) => {
    const m = e.data;
    if (!ot || !m || typeof m !== 'object') return;
    if (m.type === '7ots:speaking') {
      if (m.on && !talk) talk = ot.speak(600000);
      else if (!m.on && talk) { talk.stop(); talk = null; }
    } else if (m.type === '7ots:gesture' && typeof m.name === 'string') {
      try { ot.gesture(m.name.slice(0, 32)); } catch {}
    }
  });
  parent !== window && parent.postMessage({ type: '7ots:ready' }, '*');
</script>
</body>
</html>`;
}
