/**
 * `7ots meet`: the ot joins an apuchat meet call with its identity (meet avatar + scene) and talks
 * with the configured brain. Protocol: https://meet.apuchat.com/llms.txt
 *
 *   7ots meet --new                 creates a call and prints the link for you to open
 *   7ots meet "<invite or URL>"     joins an existing call ("Channel id/Token/PIN" lines or …/call#c=&t=&p=)
 *
 * It uses a free apuchat identity (~/.7ots/apuchat.json, 0600) so the callsign stays the same;
 * free identities expire after 24 h without DMs and are recreated on demand.
 */

import { parseInvite } from '../../server/channels/apuchat.mjs';
import { createBrain, petSystem } from './brain.mjs';
import { line } from './lines.mjs';
import { homeFile, readJson, writeJson } from './paths.mjs';
import { postPet } from './pet-server.mjs';

const HUB = (process.env.APUCHAT_HUB || 'https://apuchat.com').replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hub(method, path, { headers = {}, body, timeoutMs = 15000 } = {}) {
  const res = await fetch(HUB + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/** Our apuchat identity (created the first time). */
export async function apuchatIdentity({ fresh = false } = {}) {
  const file = homeFile('apuchat.json');
  const saved = readJson(file);
  if (saved?.identity_key && !fresh) return saved;
  const acc = await hub('POST', '/api/account');
  if (!acc.ok || !acc.data?.session_token) throw new Error(`apuchat account ${acc.status}`);
  const id = await hub('POST', '/api/account/identities', { headers: { Authorization: `Bearer ${acc.data.session_token}` } });
  if (!id.ok || !id.data?.identity_key) throw new Error(`apuchat identity ${id.status}`);
  const out = { callsign: id.data.callsign, identity_key: id.data.identity_key, session_token: acc.data.session_token, created: Date.now() };
  writeJson(file, out, { secret: true });
  return out;
}

export async function newCall() {
  const r = await hub('POST', '/api/video-call', { body: {} });
  if (!r.ok) throw new Error(`video-call ${r.status} ${r.data?.error || ''}`.trim());
  return {
    channel_id: r.data.channel_id,
    token: r.data.channel_token,
    pin: r.data.owner_password || null,
    url: r.data.call_url, // carries keys + PIN: only for you
    publicUrl: r.data.call_url_public,
  };
}

export { parseInvite };

/**
 * Joins and talks until the call ends. log(text) prints progress.
 */
export async function joinCall({ invite, identity, config, log = () => {}, maxMinutes = 30 }) {
  let me = await apuchatIdentity();
  const brain = createBrain(config.brain, config.home);
  const ch = invite.channel_id;
  const path = (x) => `/api/channels/${encodeURIComponent(ch)}${x}`;
  const s = { sid: '', cs: '', since: 0, lang: identity.language || 'en', start: Date.now(), done: false };
  const headers = () => ({ Authorization: `Bearer ${invite.token}`, ...(s.sid ? { 'X-Session-Id': s.sid } : {}) });
  const send = (message, kind) => hub('POST', path('/send'), { headers: headers(), body: { to: 'all', message: String(message).slice(0, 8000), ...(kind ? { kind } : {}) } });
  const join = async () => {
    let r = await hub('POST', path('/join'), { headers: { Authorization: `Bearer ${invite.token}` }, body: { identity_key: me.identity_key, ...(invite.pin ? { owner_password: invite.pin } : {}) } });
    if (r.status === 401 || r.status === 403) {
      // the free identity may have expired: make a new one and retry once
      me = await apuchatIdentity({ fresh: true });
      r = await hub('POST', path('/join'), { headers: { Authorization: `Bearer ${invite.token}` }, body: { identity_key: me.identity_key, ...(invite.pin ? { owner_password: invite.pin } : {}) } });
    }
    if (!r.ok) throw new Error(`join ${r.status} ${r.data?.error || ''}`.trim());
    s.sid = r.data.session_id;
    s.cs = r.data.callsign || me.callsign;
    for (const m of r.data.history || []) if (m.id > s.since) s.since = m.id;
  };
  const leave = async (why) => {
    if (s.done) return;
    s.done = true;
    log(`leave: ${why}`);
    await hub('POST', path('/leave'), { headers: headers(), body: {} }).catch(() => {});
    postPet('/event', { type: 'say', text: line('stop', s.lang) });
  };
  process.once('SIGINT', () => leave('ctrl-c').finally(() => process.exit(0)));

  await join();
  await send(`${identity.name} ${s.lang === 'es' ? 'está aquí' : s.lang === 'pt' ? 'está aqui' : 'is here'}`, 'status'); // required: meet gives it an avatar and a voice
  await send(`[avatar]${identity.look.meetAvatar || 'vivi'}`);
  if (identity.look.meetScene) await send(`[scene]${identity.look.meetScene}`);
  log(`joined as @${s.cs} (${identity.look.meetAvatar})`);
  postPet('/event', { type: 'say', text: `📞 ${identity.name} → meet` });

  const history = [];
  let greeted = false;
  let lastHuman = Date.now();
  const reply = async (text) => {
    history.push({ role: 'user', content: text });
    let out = '';
    if (brain.kind !== 'lines') {
      await send('…', 'status');
      try {
        out = await brain.think({ system: petSystem(identity, { lang: s.lang, role: 'meet' }), messages: history.slice(-16), timeoutMs: 40000 });
      } catch (e) {
        log(`brain: ${e.message}`);
      }
    }
    if (!out) out = brain.kind === 'lines' ? line('noBrain', s.lang) : line('idle', s.lang);
    history.push({ role: 'assistant', content: out });
    await send(out);
    log(`${identity.name}: ${out}`);
  };

  while (!s.done) {
    const now = Date.now();
    if (now - s.start > maxMinutes * 60_000) return leave('time limit');
    if (now - lastHuman > 5 * 60_000) return leave('silence');
    let r;
    try {
      r = await hub('GET', path(`/wait?timeout=25${s.since ? `&since=${s.since}` : ''}`), { headers: headers(), timeoutMs: 40000 });
    } catch {
      await sleep(2000);
      continue;
    }
    if (r.status === 400 && /not_joined|session_expired/.test(JSON.stringify(r.data)) || r.status === 410) {
      try {
        await join();
      } catch (e) {
        return leave(`rejoin failed: ${e.message}`);
      }
      continue;
    }
    if (r.status === 401 || r.status === 403 || r.status === 404) return leave(`channel closed (${r.status})`);
    if (!r.ok) {
      await sleep(2000);
      continue;
    }
    const lines = [];
    for (const m of r.data?.messages || []) {
      if (m.id > s.since) s.since = m.id;
      if (m.from === s.cs || m.kind === 'status' || !m.text) continue;
      const t = String(m.text);
      if (t.startsWith('[lang]')) {
        const code = t.slice(6).trim().split(/\s/)[0].toLowerCase();
        if (code && code !== 'auto') s.lang = code.slice(0, 2);
        if (!greeted) {
          greeted = true;
          await reply('(Someone just joined the call. Greet them in one sentence.)');
        }
        continue;
      }
      if (/^\s*\[/.test(t)) continue;
      log(`@${m.from}: ${t}`);
      lines.push(t.trim());
    }
    if (!lines.length) continue;
    greeted = true;
    lastHuman = Date.now();
    await reply(lines.join(' ').slice(0, 1500));
  }
}
