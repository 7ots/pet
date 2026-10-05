// Comprobación de sintaxis de todos los módulos (sin dependencias).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (/\.(m?js)$/.test(f)) files.push(p);
});
['src', 'server', 'scripts'].forEach(walk);
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
process.exit(bad ? 1 : 0);
