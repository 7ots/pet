/**
 * The data sources the senses can use, as the settings page lists them. Adding one = a module here with
 * { id, ready(), tick(), … } wired in senses/index.mjs, plus its own access key (off by default).
 *
 * WhatsApp is listed but not available: personal accounts have no official API (only WhatsApp Business), and
 * the unofficial WhatsApp Web clients break its terms and can get the number banned. It will come through the
 * Business API or a bridge you run yourself.
 */

export const SOURCES = [
  { id: 'camera', access: 'camera', available: true },
  { id: 'activity', access: 'activity', available: true },
  { id: 'system', access: null, available: true },
  { id: 'mail', access: 'mail', available: true, needs: 'apumail' },
  { id: 'calendar', access: 'calendar', available: true, needs: 'SENSES_ICS_URL' },
  { id: 'whatsapp', access: 'whatsapp', available: false },
];
