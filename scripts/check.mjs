// Comprobación de sintaxis de todos los módulos (sin dependencias).
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (/\.(c|m)?js$/.test(f)) files.push(p);
});
['src', 'server', 'scripts', 'site', 'app', 'backoffice', 'cli'].forEach(walk);

// Los <script> en línea de las páginas del pet: un error de sintaxis ahí deja la ventana abierta y muerta.
const tmp = mkdtempSync(join(tmpdir(), '7ots-check-'));
const inline = [];
for (const f of readdirSync('cli/pet').filter((n) => n.endsWith('.html'))) {
  const html = readFileSync(join('cli/pet', f), 'utf8');
  [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].forEach(([, attrs, body], i) => {
    if (/\bsrc=/.test(attrs) || !body.trim() || /type=["']?(importmap|application)/.test(attrs)) return;
    const file = join(tmp, `${f}.${i}.${/type=["']?module/.test(attrs) ? 'mjs' : 'cjs'}`);
    writeFileSync(file, body);
    inline.push(file);
  });
}
files.push(...inline);
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.error(`✗ ${f}\n${e.stderr}`);
  }
}
console.log(`${files.length - bad}/${files.length} archivos OK`);
rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
