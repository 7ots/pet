// Genera dist/7ots.esm.js (import) y dist/7ots.iife.js (<script>, global SevenOts).
// TalkingHead y three NO se empaquetan: se cargan bajo demanda desde el CDN (import dinámico).
// src/character3d sí va dentro (se evalúa al importarlo, no al cargar el widget), pero sus
// `import 'three'` y addons leen globalThis.__OTS_THREE__, que rellena src/avatar/three.js.
import { build } from 'esbuild';

const THREE_GLOBAL = {
  three: 'three',
  'three/addons/utils/BufferGeometryUtils.js': 'BufferGeometryUtils',
  'three/addons/environments/RoomEnvironment.js': 'RoomEnvironment',
  'three/addons/loaders/GLTFLoader.js': 'GLTFLoader',
};

const threeFromGlobal = {
  name: 'three-from-global',
  setup(b) {
    b.onResolve({ filter: /^three(\/.*)?$/ }, (a) => {
      if (!THREE_GLOBAL[a.path]) return { errors: [{ text: `three: añade ${a.path} a THREE_GLOBAL (scripts/build.mjs) y a loadThree() (src/avatar/three.js)` }] };
      return { path: a.path, namespace: 'three-global' };
    });
    b.onLoad({ filter: /.*/, namespace: 'three-global' }, (a) => ({
      contents: `module.exports = globalThis.__OTS_THREE__.${THREE_GLOBAL[a.path]};`,
      loader: 'js',
    }));
  },
};

const common = {
  entryPoints: ['src/index.js'], bundle: true, minify: true, sourcemap: true, target: 'es2022', logLevel: 'info',
  plugins: [threeFromGlobal], define: { __OTS_BUNDLE__: 'true' },
};

await build({ ...common, format: 'esm', outfile: 'dist/7ots.esm.js' });
await build({ ...common, format: 'iife', globalName: 'SevenOtsModule', outfile: 'dist/7ots.iife.js' });
