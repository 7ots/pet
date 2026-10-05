/**
 * Carga de three para los avatares 3D, sin depender de que la página anfitriona declare el
 * importmap (el widget vive en webs de terceros).
 *
 *   - Bundle (dist/7ots.*.js): scripts/build.mjs cambia `import 'three'` y sus addons por
 *     lecturas de globalThis.__OTS_THREE__, y src/character3d queda dentro del bundle con
 *     evaluación perezosa. loadThree() rellena ese global desde el CDN (+esm de jsDelivr: los
 *     addons importan la MISMA instancia de three) antes del import dinámico.
 *   - Fuentes sin empaquetar (site/3d, desarrollo): `import 'three'` lo resuelve el importmap;
 *     si la página no lo tiene, ensureImportMap() lo inyecta (vale mientras no se haya cargado
 *     ningún módulo todavía, o en navegadores con varios importmaps).
 *
 * Este archivo NO importa three: se puede cargar siempre.
 */

export const THREE_VERSION = '0.170.0';
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;
const base = () => String(globalThis.OTS_THREE_BASE || CDN).replace(/\/$/, '');

/** Importmap de three (el mismo que declaran site/3d, backoffice, app y site/start). */
export function threeImportMap() {
  return { imports: { three: `${base()}/build/three.module.js`, 'three/addons/': `${base()}/examples/jsm/` } };
}

/** ¿Resuelve ya la página el especificador 'three'? Si no, inyecta el importmap. */
export function ensureImportMap() {
  if (typeof document === 'undefined') return false;
  for (const s of document.querySelectorAll('script[type="importmap"]')) {
    try { if (JSON.parse(s.textContent || '{}').imports?.three) return true; } catch {}
  }
  const s = document.createElement('script');
  s.type = 'importmap';
  s.textContent = JSON.stringify(threeImportMap());
  (document.head || document.documentElement).prepend(s);
  return true;
}

let threeP = null;

/** three + los addons que usa src/character3d, en globalThis.__OTS_THREE__. */
export function loadThree() {
  threeP ??= (async () => {
    if (globalThis.__OTS_THREE__?.three) return globalThis.__OTS_THREE__;
    const u = (p) => `${base()}/${p}/+esm`;
    const [three, BufferGeometryUtils, RoomEnvironment, GLTFLoader] = await Promise.all([
      import(/* @vite-ignore */ /* webpackIgnore: true */ `${base()}/+esm`),
      import(/* @vite-ignore */ /* webpackIgnore: true */ u('examples/jsm/utils/BufferGeometryUtils.js')),
      import(/* @vite-ignore */ /* webpackIgnore: true */ u('examples/jsm/environments/RoomEnvironment.js')),
      import(/* @vite-ignore */ /* webpackIgnore: true */ u('examples/jsm/loaders/GLTFLoader.js')),
    ]);
    return (globalThis.__OTS_THREE__ = { three, BufferGeometryUtils, RoomEnvironment, GLTFLoader });
  })();
  threeP.catch(() => { threeP = null; });
  return threeP;
}

/** Módulo de los ots 3D (src/character3d/index.js) listo para usar. Lanza si no se puede. */
export async function loadCharacter3D() {
  ensureImportMap();
  // __OTS_BUNDLE__ lo define scripts/build.mjs; sin empaquetar, three viene del importmap
  if (typeof __OTS_BUNDLE__ !== 'undefined') await loadThree();
  return import('../character3d/index.js');
}
