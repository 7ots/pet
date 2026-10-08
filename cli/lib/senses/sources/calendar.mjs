/**
 * Calendar (access.calendar): the private ICS address of your calendars (Google Calendar → Settings → "Secret
 * address in iCal format"; Outlook, iCloud and Proton have one too), kept as the key SENSES_ICS_URL in
 * ~/.7ots/keys.json (several separated by spaces). Read every 15 minutes; only the next 24 h of timed events
 * stay in memory (title and start). Repeating events (RRULE) count only on their first date.
 */

import { env } from '../../config.mjs';

/** "20261008T150000Z" | "20261008T150000" (local) | "20261008" (all day → null) → ms */
function icsTime(v, params = '') {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
  if (!m || !m[4] || /VALUE=DATE(?!-)/.test(params)) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  return m[7] ? Date.UTC(y, mo - 1, d, h, mi, s) : new Date(y, mo - 1, d, h, mi, s).getTime(); // TZID: read as local
}

export function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let ev = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') ev = {};
    else if (l === 'END:VEVENT') {
      if (ev?.start && ev.status !== 'CANCELLED') out.push({ title: ev.title || '(sin título)', start: ev.start });
      ev = null;
    } else if (ev) {
      const i = l.indexOf(':');
      if (i < 0) continue;
      const [name, ...params] = l.slice(0, i).split(';');
      const val = l.slice(i + 1);
      if (name === 'DTSTART') ev.start = icsTime(val, params.join(';'));
      else if (name === 'SUMMARY') ev.title = val.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').slice(0, 120);
      else if (name === 'STATUS') ev.status = val.trim().toUpperCase();
    }
  }
  return out;
}

export function createCalendar({ config, log = () => {} }) {
  let events = [];
  let err = '';
  const urls = () => String(env().SENSES_ICS_URL || '').split(/\s+/).filter((u) => /^(https?|webcal):\/\//i.test(u));
  const ready = () => config().access?.calendar === true && urls().length > 0;
  return {
    id: 'calendar',
    ready,
    async tick() {
      if (!ready()) return (events = []);
      const now = Date.now();
      const all = [];
      for (const u of urls().slice(0, 5)) {
        try {
          const r = await fetch(u.replace(/^webcal:/i, 'https:'), { signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          all.push(...parseIcs((await r.text()).slice(0, 8_000_000)));
          err = '';
        } catch (e) {
          if (e.message !== err) log(`senses calendar: ${(err = e.message)}`); // never the URL: it is a secret
        }
      }
      events = all.filter((e) => e.start > now - 30 * 60_000 && e.start < now + 24 * 3_600_000).sort((a, b) => a.start - b.start).slice(0, 20);
    },
    /** The next event that has not started yet: { title, start } */
    get next() {
      return events.find((e) => e.start > Date.now()) || null;
    },
    get upcoming() {
      return events.filter((e) => e.start > Date.now()).slice(0, 5);
    },
    get error() {
      return err;
    },
  };
}
