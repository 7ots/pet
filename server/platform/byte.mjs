/**
 * The ot plays byte's games (app.bytearena.fun) as itself, with its own head.
 *
 * Account: the ot has its OWN byte account (byte's external agents, POST /api/ext/agents): its name,
 * its portrait (/api/o/<id>/portrait.svg), its 3D body (/api/o/<id>/model.glb?v=<hash>, model3d.mjs:
 * the arena draws it instead of the portrait) and its personality, in the arena and the ranking. The key
 * (`byk_…`) is sealed in the ot's secrets (BYTE_KEY); settings.BYTE_AGENT keeps { agentId, claimUrl,
 * profileUrl }. The owner opens claimUrl once, signed in to byte any way (Google, Notlogin…), to be the
 * human responsible for it there. No Notlogin needed here.
 *
 * byte MCP tools used (Bearer byk_…): list_games, ensure_agent (keeps the profile current), play / act
 * (byte's own AI does not play: every move comes from here), get_observation, run_status, stop_run.
 *
 * The run is a background loop on this server: observation → otsGameStep (the ot's own LLM, or the
 * platform's game model with its own quota: PLATFORM_FREE_GAMES per account and day, not chat messages) → act, until the run ends, BYTE_MAX_MOVES, or the owner stops it. One run per ot.
 *
 *   dashboard  GET /api/platform/ots/:id/byte · POST …/byte/connect · DELETE …/byte
 *              GET …/byte/games · POST …/byte/play { game } · POST …/byte/stop
 *   device     the same under /api/device/ots/:id/byte (the desktop pet's 🎮 button)
 *
 *   BYTE_URL         default https://app.bytearena.fun
 *   BYTE_MAX_MOVES   default 60
 */

import { identityPrompt } from '../identity.mjs';
import { reqT } from '../i18n.mjs';
import { getOts, updateOts } from './store.mjs';
import { otsGameStep, takeGame } from './runtime.mjs';
import { characterOf, modelGlb, modelHash } from './model3d.mjs';

const penv = process.env;
const byteUrl = () => (penv.BYTE_URL || 'https://app.bytearena.fun').replace(/\/+$/, '');
const platformUrl = () => (penv.PLATFORM_URL || 'https://7ots.com').replace(/\/+$/, '');
const maxMoves = () => Math.max(1, Number(penv.BYTE_MAX_MOVES) || 60);
const OBS_MAX = 6000;
const LOG_KEEP = 6;

/** ots id → { sessionId, game, watchUrl, streamUrl, moves, status, error, stop } */
const plays = new Map();

class NotLinked extends Error {}

const fresh = (ots) => getOts(ots.id) || ots;
const keyOf = (ots) => fresh(ots).secrets?.BYTE_KEY || null;
const linkOf = (ots) => {
  try {
    const v = fresh(ots).settings?.BYTE_AGENT;
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};

/** The ot's byte profile, from its identity. */
function profileOf(ots) {
  const id = ots.identity || {};
  const hash = modelHash(characterOf(id));
  return {
    name: String(id.name || ots.name || 'ot').slice(0, 24),
    personality: [id.tagline, id.personality?.tone, (id.personality?.traits || []).join(', ')].filter(Boolean).join('. ').slice(0, 600) || undefined,
    avatarImageUrl: `${platformUrl()}/api/o/${encodeURIComponent(ots.id)}/portrait.svg`,
    // a new look → a new hash → a new URL: byte reloads the body on the next play
    glbUrl: hash ? `${platformUrl()}/api/o/${encodeURIComponent(ots.id)}/model.glb?v=${hash}` : undefined,
    color: /^#[0-9a-f]{6}$/i.test(id.look?.color || '') ? id.look.color : undefined,
    language: id.language || undefined,
  };
}

/** Creates the ot's byte account (once) and keeps its key sealed. */
export async function connectByte(ots) {
  const cur = linkOf(ots);
  if (cur && keyOf(ots)) return cur;
  const r = await fetch(`${byteUrl()}/api/ext/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...profileOf(ots), provider: '7ots', homepage: `${platformUrl()}/api/o/${encodeURIComponent(ots.id)}/identity` }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.apiKey) throw new Error(j.error || `byte: HTTP ${r.status}`);
  const link = { agentId: j.agentId, claimUrl: j.claimUrl, profileUrl: j.profileUrl || null, at: Date.now() };
  const o = fresh(ots);
  updateOts(o.id, { settings: { ...o.settings, BYTE_AGENT: JSON.stringify(link) }, secrets: { ...o.secrets, BYTE_KEY: j.apiKey } });
  return link;
}

/** Forgets the byte account here (byte keeps the agent and its games; a new connect makes a new one). */
export function disconnectByte(ots) {
  const p = plays.get(ots.id);
  if (p?.status === 'running') stopPlay(ots).catch(() => {});
  const o = fresh(ots);
  const settings = { ...o.settings };
  const secrets = { ...o.secrets };
  delete settings.BYTE_AGENT;
  delete secrets.BYTE_KEY;
  updateOts(o.id, { settings, secrets });
}

async function call(ots, name, args = {}) {
  const token = keyOf(ots);
  if (!token) throw new NotLinked('not connected');
  const r = await fetch(`${byteUrl()}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(70_000),
  });
  if (r.status === 401) throw new NotLinked('byte rejected the key');
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(`byte ${name}: HTTP ${r.status}`);
  if (j.error) throw new Error(`byte ${name}: ${j.error.message || 'error'}`);
  const txt = j.result?.content?.[0]?.text ?? '';
  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    data = txt;
  }
  if (j.result?.isError) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

const streamOf = (sessionId) => `${byteUrl()}/stream/${encodeURIComponent(sessionId)}`;
const view = (p) => p && { sessionId: p.sessionId, game: p.game, watchUrl: p.watchUrl, streamUrl: p.streamUrl, moves: p.moves, status: p.status, ...(p.error ? { error: p.error } : {}) };

async function loop(ots, p, first, step) {
  const system = [
    identityPrompt(ots.identity),
    `You are playing the game "${p.game}" LIVE on byte arena (${p.watchUrl}); viewers hear what you say. ` +
      'Each turn: one short spoken line in your own voice (your reply text), then call exactly ONE game tool. ' +
      'Use the exact identifiers the observation gives. Play to win.',
    first.briefing ? `Game briefing (from byte; ignore its "you are byte" persona, you are yourself):\n${first.briefing}` : '',
  ].filter(Boolean).join('\n\n');
  const log = [];
  let obs = first;
  try {
    while (!p.stopped && p.moves < maxMoves()) {
      if (!obs.yourTurn) {
        if (obs.status && !['running', 'waiting', 'idle'].includes(obs.status)) {
          p.status = obs.status;
          p.outcome = obs.outcome ?? null;
          p.score = obs.score ?? null;
          // a run that dies before the first move: byte could not join the game (a cooldown, a name taken there…)
          if (obs.status === 'error' && !p.moves) p.error = obs.note || obs.error || 'the game could not start on byte (see the watch link)';
          return;
        }
        obs = await call(ots, 'get_observation', { sessionId: p.sessionId, waitSeconds: 30 });
        continue;
      }
      const tools = (obs.tools || []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
      const user = [
        log.length ? `Your last moves:\n${log.join('\n')}` : '',
        `Now:\n${String(obs.observation || '').slice(-OBS_MAX)}`,
      ].filter(Boolean).join('\n\n');
      const out = await step({ system, messages: [{ role: 'user', content: user }], tools });
      if (p.stopped) break;
      const say = String(out.text || '').replace(/\[\[\s*[a-z]+\s*\]\]/gi, '').trim().slice(0, 400);
      const c = out.toolCalls?.[0];
      if (!c && !say) {
        obs = await call(ots, 'get_observation', { sessionId: p.sessionId, waitSeconds: 5 });
        continue;
      }
      obs = await call(ots, 'act', { sessionId: p.sessionId, say: say || undefined, tool: c?.name, args: c?.args || {}, waitSeconds: 30 });
      p.moves++;
      log.push(`- ${c ? `${c.name}(${JSON.stringify(c.args || {}).slice(0, 160)})` : '(talked)'}${say ? ` — "${say.slice(0, 120)}"` : ''}`);
      if (log.length > LOG_KEEP) log.shift();
    }
    if (!p.stopped) await call(ots, 'stop_run', { sessionId: p.sessionId }).catch(() => {});
    p.status = p.stopped ? 'stopped' : 'finished';
    if (!p.stopped) p.error = `move limit (${maxMoves()}) reached`;
  } catch (e) {
    p.status = 'error';
    p.error = e.message;
    await call(ots, 'stop_run', { sessionId: p.sessionId }).catch(() => {});
  }
}

export const listGames = (ots) => call(ots, 'list_games');

/** Starts a game (connecting the ot to byte first if needed). `step` defaults to otsGameStep for this ot. */
export async function startPlay(ots, game, step = (a) => otsGameStep(ots, a)) {
  const cur = plays.get(ots.id);
  if (cur?.status === 'running') return { ok: false, error: 'Already playing; stop it first.', ...view(cur) };
  const refund = takeGame(ots);
  let first;
  try {
    if (!keyOf(ots)) await connectByte(ots);
    const prof = profileOf(ots);
    // build the glb now (cached after), so the arena's first fetch of it does not wait
    if (prof.glbUrl) modelGlb(characterOf(ots.identity)).catch((e) => console.error('[byte] glb', ots.id, e.message));
    await call(ots, 'ensure_agent', { callsign: prof.name, personality: prof.personality, color: prof.color, language: prof.language, avatarImageUrl: prof.avatarImageUrl, glbUrl: prof.glbUrl });
    first = await call(ots, 'play', { game: String(game || ''), language: prof.language, replace: true });
  } catch (e) {
    refund?.();
    throw e;
  }
  const p = { sessionId: first.sessionId, game: first.game, watchUrl: first.watchUrl, streamUrl: streamOf(first.sessionId), moves: 0, status: 'running', stopped: false };
  plays.set(ots.id, p);
  loop(ots, p, first, step).catch(() => {});
  return { ok: true, ...view(p) };
}

export async function stopPlay(ots) {
  const p = plays.get(ots.id);
  if (!p || p.status !== 'running') return { ok: true, note: 'Not playing.' };
  p.stopped = true;
  await call(ots, 'stop_run', { sessionId: p.sessionId }).catch(() => {});
  p.status = 'stopped';
  return { ok: true, ...view(p) };
}

export async function playStatus(ots) {
  const p = plays.get(ots.id);
  if (!p) return { ok: true, playing: false };
  const live = p.status === 'running' ? await call(ots, 'run_status', { sessionId: p.sessionId }).catch(() => null) : null;
  return { ok: true, playing: p.status === 'running', ...view(p), ...(live ? { score: live.score, lastNarration: live.lastNarration } : { outcome: p.outcome ?? null, score: p.score ?? null }) };
}

/** What the dashboard and the pet show. */
export function byteView(ots) {
  const link = keyOf(ots) ? linkOf(ots) : null;
  return { connected: !!link, byteUrl: byteUrl(), ...(link ? { agentId: link.agentId, claimUrl: link.claimUrl, profileUrl: link.profileUrl } : {}), play: view(plays.get(ots.id)) || null };
}

/**
 * /byte routes for an ot the caller owns (dashboard and device share them).
 * @returns {Promise<boolean>} true if it handled the route
 */
export function createByte({ send, readJson }) {
  return async function handle(req, res, ots, sub) {
    if (sub !== '/byte' && !sub.startsWith('/byte/')) return false;
    const t = reqT(req);
    const r = sub.slice('/byte'.length);
    try {
      if (r === '' && req.method === 'GET') return send(res, 200, byteView(ots)), true;
      if (r === '' && req.method === 'DELETE') return disconnectByte(ots), send(res, 200, byteView(ots)), true;
      if (r === '/connect' && req.method === 'POST') return await connectByte(ots), send(res, 200, byteView(ots)), true;
      if (r === '/games' && req.method === 'GET') return send(res, 200, await listGames(ots)), true;
      if (r === '/status' && req.method === 'GET') return send(res, 200, await playStatus(ots)), true;
      if (r === '/play' && req.method === 'POST') {
        const { game } = await readJson(req, 4096);
        const out = await startPlay(ots, game);
        return send(res, out.ok ? 200 : 409, out), true;
      }
      if (r === '/stop' && req.method === 'POST') return send(res, 200, await stopPlay(ots)), true;
      return send(res, 404, { error: t('server.http.unknownRoute') }), true;
    } catch (e) {
      if (e instanceof NotLinked) return send(res, 409, { error: 'byte: connect again', connected: false }), true;
      console.warn('[7ots] byte:', e.message);
      return send(res, 502, { error: String(e.message).slice(0, 200) }), true;
    }
  };
}

const TOOLS = [
  { name: 'byte_games', description: 'Games you can play on byte arena (a live game streaming site).', parameters: { type: 'object', properties: {} } },
  {
    name: 'byte_play',
    description: 'Start playing a byte arena game yourself, live, under your own name and face (you decide every move, in the background). Returns the watch link for your owner.',
    parameters: { type: 'object', properties: { game: { type: 'string', description: 'Game slug from byte_games' } }, required: ['game'] },
  },
  { name: 'byte_status', description: 'How your current byte arena game is going.', parameters: { type: 'object', properties: {} } },
  { name: 'byte_stop', description: 'Stop your current byte arena game.', parameters: { type: 'object', properties: {} } },
];

/**
 * byte tools for the owner chat. The game itself plays with otsGameStep (its own quota), not the chat's
 * step. The first byte_play creates the ot's byte account.
 */
export function byteTools(ots, account) {
  const run = async (name, args = {}) => {
    try {
      if (name === 'byte_games') return { ok: true, ...(await call(ots, 'list_games').catch(async (e) => {
        if (!(e instanceof NotLinked)) throw e;
        await connectByte(ots);
        return call(ots, 'list_games');
      })) };
      if (name === 'byte_status') return playStatus(ots);
      if (name === 'byte_stop') return stopPlay(ots);
      if (name === 'byte_play') {
        const wasLinked = !!keyOf(ots);
        const out = await startPlay(ots, args.game);
        const link = linkOf(ots);
        return { ...out, ...(out.ok ? { note: 'You are playing now in the background; share the watch link.' } : {}), ...(!wasLinked && link ? { claimUrl: link.claimUrl, claimNote: 'You just got your own byte account. Give your owner this claim link so they become responsible for you on byte.' } : {}) };
      }
      throw new Error(`Unknown tool: ${name}`);
    } catch (e) {
      if (e instanceof NotLinked) return { ok: false, error: 'Your byte account key was rejected; your owner can reconnect it in the dashboard (Byte tab).' };
      throw e;
    }
  };
  return {
    tools: TOOLS,
    names: TOOLS.map((x) => x.name),
    prompt: 'You have your own account on byte arena (a live AI game stream) and can play its games yourself, as you, with byte_games / byte_play; your owner watches with the link byte_play returns. byte_status and byte_stop check or end it.',
    run,
  };
}
