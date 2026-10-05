// Stages desktop/app/: what electron-builder packages (its "two package.json" layout). The repo's runtime files
// (cli, server, src, dist, brand, skills) + launcher.cjs as main.cjs + a package.json with only the runtime
// dependencies, installed here. Run `npm run build` at the repo root first (dist/ is the pet page's bundle).
//
//   DESKTOP_VERSION=0.2.0 node stage.mjs     version of the app (CI passes the tag); default: the CLI's version
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const app = join(here, 'app');
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deskPkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

if (!existsSync(join(root, 'dist', '7ots.esm.js'))) {
  console.error('dist/7ots.esm.js is missing: run `npm ci && npm run build` at the repo root first');
  process.exit(1);
}

rmSync(app, { recursive: true, force: true });
mkdirSync(app, { recursive: true });
for (const d of ['cli', 'server', 'src', 'dist', 'brand', 'skills']) cpSync(join(root, d), join(app, d), { recursive: true });
for (const f of ['llms.txt', 'LICENSE']) if (existsSync(join(root, f))) copyFileSync(join(root, f), join(app, f));
copyFileSync(join(here, 'launcher.cjs'), join(app, 'main.cjs'));

mkdirSync(join(here, 'build'), { recursive: true });
copyFileSync(join(root, 'brand', 'icon-512.png'), join(here, 'build', 'icon.png'));

const version = (process.env.DESKTOP_VERSION || rootPkg.version).replace(/^v/, '');
writeFileSync(
  join(app, 'package.json'),
  JSON.stringify(
    {
      name: '7ots',
      productName: '7ots',
      version,
      description: 'Your 7ots desktop pet: an AI companion with a face of its own.',
      homepage: rootPkg.homepage,
      repository: rootPkg.repository,
      author: { name: '7ots', email: 'noreply@7ots.com', url: 'https://7ots.com' },
      license: rootPkg.license,
      type: 'module', // cli/ and src/ are ES modules; the Electron entry points are .cjs
      main: 'main.cjs',
      desktopName: '7ots.desktop', // Linux: WM_CLASS ↔ the .desktop entry
      dependencies: { ...rootPkg.dependencies, ...deskPkg.appDependencies },
    },
    null,
    2,
  ) + '\n',
);

execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock --loglevel=error', { cwd: app, stdio: 'inherit' });
console.log(`staged desktop/app (7ots ${version})`);
