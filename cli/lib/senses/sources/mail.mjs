/**
 * Email (access.mail, plus Integrations → email on with APUMAIL_TOKEN): every 5 minutes, which mails are new.
 * Only who, the subject and "looks urgent" become events; the body never leaves here.
 */

import { mailMessages } from '../../integrations.mjs';
import { env } from '../../config.mjs';

const URGENT = /\b(urgente?|asap|importante|important|cr[ií]tico|critical|hoy mismo|deadline|vence hoy|plazo|incidente?|incident|ca[ií]do|outage)\b/i;

export function createMail({ config, emit, log = () => {} }) {
  const seen = new Set();
  let primed = false;
  let last = [];
  let err = '';
  const ready = () => {
    const c = config();
    return c.access?.mail === true && c.integrations?.apumail?.on && Boolean(env().APUMAIL_TOKEN);
  };
  return {
    id: 'mail',
    ready,
    async tick() {
      if (!ready()) return (primed = false), seen.clear();
      try {
        const list = await mailMessages(config().integrations.apumail.inbox, { n: 15 });
        err = '';
        const fresh = list.filter((m) => !seen.has(m.id));
        for (const m of list) seen.add(m.id);
        if (seen.size > 500) for (const id of [...seen].slice(0, 200)) seen.delete(id);
        last = list.slice(0, 5).map((m) => ({ at: m.at, from: m.from, subject: m.subject, urgent: URGENT.test(`${m.subject} ${m.text}`) }));
        if (!primed) return (primed = true); // what was already there is not news
        for (const m of fresh.slice(0, 5)) {
          const urgent = URGENT.test(`${m.subject} ${m.text}`);
          emit({ source: 'mail', kind: 'message', value: { from: m.from, subject: m.subject, urgent }, summary: `email from ${m.from}: «${m.subject || '(no subject)'}»`, urgency: urgent ? 2 : 0 });
        }
      } catch (e) {
        if (e.message !== err) log(`senses mail: ${(err = e.message)}`);
      }
    },
    get latest() {
      return last;
    },
    get error() {
      return err;
    },
  };
}
