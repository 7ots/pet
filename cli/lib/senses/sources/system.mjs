/** The computer itself (always on, nothing leaves it): load, memory and battery, read once a minute. */

import { readdirSync, readFileSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { run } from '../util.mjs';

async function battery() {
  if (process.platform === 'linux') {
    try {
      const b = readdirSync('/sys/class/power_supply').find((d) => /^BAT/i.test(d));
      if (!b) return null;
      const r = (f) => readFileSync(`/sys/class/power_supply/${b}/${f}`, 'utf8').trim();
      return { pct: Number(r('capacity')), charging: !/discharging/i.test(r('status')) };
    } catch {
      return null;
    }
  }
  if (process.platform === 'darwin') {
    const out = await run('pmset', ['-g', 'batt']);
    const pct = Number(out?.match(/(\d+)%/)?.[1]);
    return Number.isFinite(pct) ? { pct, charging: !/discharging/i.test(out) } : null;
  }
  return null;
}

export function createSystem() {
  let now = null;
  return {
    id: 'system',
    async tick() {
      const n = cpus().length || 1;
      now = { cpu: Math.round((loadavg()[0] / n) * 100), mem: Math.round((1 - freemem() / totalmem()) * 100), battery: await battery(), at: Date.now() };
      return now;
    },
    get now() {
      return now;
    },
  };
}
