/**
 * The pet's brain. It turns "what just happened" into one short line in the ot's voice.
 *
 *   cli     the user's own AI CLI, as a separate instance: claude -p · codex exec · gemini -p · ollama run
 *           · orquesta -p (Orquesta CLI; model = an endpoint name, e.g. "batuta")
 *           (runs in ~/.7ots with SEVENOTS_PET_BRAIN=1 so our hooks don't fire inside it)
 *   api     own key (Anthropic or any OpenAI-compatible endpoint) through server/llm.mjs
 *   batuta  Orquesta's Batuta LLM (OpenAI-compatible) with ORQUESTA_TOKEN
 *   7ots    the ot's home: POST <home.url>/chat (7ots.com or your own 7ots-server)
 *   lines   built-in phrases (also the fallback when the AI is slow or fails)
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, win32 } from 'node:path';
import { identityPrompt } from '../../src/identity/schema.js';
import { createLLM } from '../../server/llm.mjs';
import { SEVENOTS_URL } from './account.mjs';
import { env, loadConfig, ORQUESTA_URL } from './config.mjs';
import { characterPrompt, integrationsPrompt } from './integrations.mjs';
import { ensureHome, PET_PORT } from './paths.mjs';
import { SPEECH_TAGS_PROMPT } from '../../src/voice/tags.js';

// Started from a desktop launcher or autostart, the daemon gets a bare PATH (/usr/bin:/bin) and can't find
// CLIs installed per user (claude lives in ~/.local/bin): add the usual places before looking for them.
{
  const home = homedir();
  const extra = [join(home, '.local', 'bin'), join(home, '.npm-global', 'bin'), join(home, '.bun', 'bin'), join(home, '.cargo', 'bin'), join(home, '.volta', 'bin'), dirname(process.execPath), '/usr/local/bin', '/opt/homebrew/bin', '/snap/bin'];
  const have = (process.env.PATH || '').split(delimiter).filter(Boolean);
  process.env.PATH = [...have, ...extra.filter((d) => !have.includes(d))].join(delimiter);
}

export const AI_CLIS = {
  claude: { bin: 'claude', json: true, args: (p, m, files, web) => ['-p', p, '--output-format', 'json', ...(m ? ['--model', m] : []), ...(files || web ? ['--allowedTools', [files && 'Read', web && 'WebSearch', web && 'WebFetch'].filter(Boolean).join(',')] : [])], vision: true, minTimeoutMs: 120000 }, // claude -p can take ~30 s just to start (hooks, plugins, MCP servers)
  codex: { bin: 'codex', args: (p, m) => ['exec', '--skip-git-repo-check', ...(m ? ['-m', m] : []), p] },
  gemini: { bin: 'gemini', args: (p, m) => ['-p', p, ...(m ? ['-m', m] : [])] },
  ollama: { bin: 'ollama', args: (p, m) => ['run', m || 'llama3.2', p] },
  orquesta: { bin: 'orquesta', args: (p, m) => ['-p', p, ...(m ? ['--endpoint', m] : [])] },
};

const LANG_NAME = { en: 'English', es: 'Spanish', pt: 'Portuguese' };

/** Which AI CLIs are installed (for the wizard and `--mode auto`). Cached a minute: settings polls it. */
let clisSeen = null;
export function detectClis() {
  if (clisSeen && Date.now() - clisSeen.at < 60000) return clisSeen.list;
  const list = Object.keys(AI_CLIS).filter((k) => {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [AI_CLIS[k].bin], { stdio: 'ignore', windowsHide: true });
    return r.status === 0;
  });
  clisSeen = { at: Date.now(), list };
  return list;
}

/** System prompt shared by every brain. */
/** Voices that perform speech tags: xAI, and ElevenLabs on its v3 model. */
export const expressiveVoice = (v = {}) => v.kind === 'grok' || (v.kind === 'elevenlabs' && /v3/.test(v.providers?.elevenlabs?.model || ''));

export function petSystem(identity, { lang, role = 'pet' } = {}) {
  const L = LANG_NAME[lang || identity.language] || 'English';
  const base = identityPrompt(identity, 'en');
  const job =
    role === 'assistant'
      ? `You live on your human's computer as a virtual pet and also their small daily assistant: reminders, alerts (prices, programs that finish), opening sites, remembering what matters about their work.`
      : role === 'meet'
      ? `You are in a live video call (apuchat meet). Your words are spoken aloud: answer in 1-3 short sentences, no markdown, no emojis, no lists.`
      : `You live on your human's computer as a virtual pet (a tamagotchi). You watch their terminal and their coding agent and comment on it. Answer with ONE short line (max 18 words), in character, no quotes, no markdown. Be playful, never rude, never repeat yourself.`;
  // the character sheet (settings → Personality) weighs more than the identity's traits;
  // integrations (settings → Permissions) tell the assistant what else it can reach
  let config = {};
  try {
    config = loadConfig();
  } catch {}
  const sheet = characterPrompt(config.character);
  const tools = role === 'assistant' ? integrationsPrompt(config) : '';
  const tone = config.voice?.expressive && expressiveVoice(config.voice) ? `\n${SPEECH_TAGS_PROMPT}` : '';
  // 'auto': the language the human just wrote in (they may switch from the ot's usual one)
  return `${base}${sheet ? `\n${sheet}` : ''}\n${job}${tools ? `\n${tools}` : ''}${tone}\n${lang === 'auto' ? 'Always answer in the language your human writes in.' : `Always answer in ${L}.`}`;
}

/**
 * On Windows, npm installs global CLIs as `orquesta.cmd` shims, and spawn() without a shell only finds
 * .exe/.com (no PATHEXT), so `spawn('orquesta')` fails with ENOENT although `where orquesta` finds it.
 * A shell is no way out: cmd.exe can't carry the prompt's newlines and re-parses its quotes. So we read
 * the npm shim and run its script with node directly (the same thing the shim does); a real .exe runs as is.
 * Elsewhere the name goes through unchanged.
 */
export function resolveCliCommand(bin, args, { platform = process.platform, where = whereAll, read = (f) => readFileSync(f, 'utf8'), exists = existsSync } = {}) {
  if (platform !== 'win32' || /[\\/]/.test(bin)) return { cmd: bin, args };
  const found = where(bin);
  const exe = found.find((f) => /\.(exe|com)$/i.test(f));
  if (exe) return { cmd: exe, args };
  for (const shim of found.filter((f) => /\.(cmd|bat)$/i.test(f))) {
    let text = '';
    try {
      text = read(shim);
    } catch {
      continue;
    }
    // npm/cmd-shim: "%_prog%"  "%dp0%\node_modules\pkg\bin.js" %*   (older: "%~dp0\..." )
    const m = text.match(/"%(?:~dp0|dp0%)\\?([^"%]+?\.(?:c|m)?js)"\s+%\*/i);
    if (!m) continue;
    const dir = win32.dirname(shim);
    const script = win32.resolve(dir, m[1]);
    if (!exists(script)) continue;
    const local = win32.join(dir, 'node.exe'); // the shim prefers a node.exe next to it, then the one on PATH
    const node = exists(local) ? local : where('node').find((f) => /\.exe$/i.test(f)) || 'node';
    return { cmd: node, args: [script, ...args] };
  }
  return { cmd: bin, args }; // not installed: spawn reports ENOENT as before
}

function whereAll(bin) {
  const r = spawnSync('where', [bin], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? String(r.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

function runCli({ cli, model, command }, prompt, timeoutMs, files, web = false) {
  const spec = cli === 'custom' ? { bin: '/bin/sh', args: (p) => ['-c', command, 'sh', p] } : AI_CLIS[cli];
  if (!spec) return Promise.reject(new Error(`unknown cli ${cli}`));
  return new Promise((resolve, reject) => {
    const run = resolveCliCommand(spec.bin, spec.args(prompt, model, files, web));
    const child = spawn(run.cmd, run.args, {
      cwd: ensureHome(),
      windowsHide: true,
      env: { ...process.env, SEVENOTS_PET_BRAIN: '1', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('timeout'));
    }, Math.max(timeoutMs, spec.minTimeoutMs || 0));
    child.stdout.on('data', (d) => (out += d).length > (web ? 200000 : 20000) && child.kill('SIGTERM'));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !out.trim()) return reject(new Error(`exit ${code}`));
      if (!spec.json) return resolve({ text: out });
      // claude --output-format json: the reply plus what it cost (tokens, USD)
      try {
        const j = JSON.parse(out);
        const u = j.usage || {};
        if (j.is_error) return reject(new Error(String(j.result || 'error').slice(0, 200)));
        resolve({ text: String(j.result ?? ''), usage: { in: u.input_tokens || 0, out: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, usd: j.total_cost_usd } });
      } catch {
        resolve({ text: out });
      }
    });
  });
}

/**
 * Batuta only takes Orquesta's sign-in token (oclt_…, from `7ots login orquesta` / "Sign in with Orquesta") or a
 * project's agent token. An API key from Orquesta → Settings → API keys (oak_…) is found but has no project, and
 * Batuta answers 403 "Could not resolve organization for token": say which token it needs instead.
 * `code` lets the settings page translate it; the message stays readable in logs.
 */
export function batutaError(e, token = '') {
  const status = e?.status;
  const msg = String(e?.message || '');
  const wrongKind = /^(oak_|mcp_)/.test(token) || (status === 403 && /resolve organization/i.test(msg));
  if (wrongKind) return Object.assign(new Error('batuta: this Orquesta token has no organization for Batuta (an API key?); sign in with Orquesta to get a CLI token (oclt_)'), { code: 'batuta_wrong_token', status });
  if (status === 401) return Object.assign(new Error(`batuta: Orquesta rejected the token (${msg.replace(/^\d+\s*/, '').slice(0, 80) || 'invalid'}); sign in with Orquesta again`), { code: 'batuta_bad_token', status });
  if (status === 402 || (status === 403 && /billing|limit|access|plan|add-on/i.test(msg))) return Object.assign(new Error(`batuta: ${msg.replace(/^\d+\s*/, '').slice(0, 160)}`), { code: 'batuta_no_plan', status });
  return e;
}

/** Last meaningful paragraph of a CLI's output, cleaned of ANSI and quotes. */
export function cleanReply(text, max = 400) {
  const s = String(text || '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .pop() || '';
  return s.replace(/\s+/g, ' ').replace(/^["'«“]+|["'»”]+$/g, '').trim().slice(0, max);
}

/**
 * @param {object} brain  config.brain
 * @param {object} home   config.home
 * @returns {{ kind: string, think: (o: { system: string, messages: {role,content}[] }) => Promise<string> }}
 */
export function createBrain(brain = { kind: 'lines' }, home = {}) {
  const keys = env();
  if (brain.kind === 'cli') {
    return {
      kind: 'cli',
      // files: images to look at (the screen); only CLIs that can read them (claude) get them
      vision: Boolean(AI_CLIS[brain.cli]?.vision),
      async think({ system, messages, timeoutMs = 45000, raw = false, files = null, onUsage }) {
        const convo = messages.map((m) => `${m.role === 'user' ? 'Them' : 'You'}: ${m.content}`).join('\n');
        const look = files?.length ? `\n\n(Use the Read tool to look at: ${files.join(', ')})` : '';
        const prompt = `${system}${look}\n\n${convo}\nYou:`;
        const { text: out, usage } = await runCli(brain, prompt, timeoutMs, files?.length ? files : null);
        // CLIs that don't report usage: a rough count (≈ 4 characters a token)
        onUsage?.(usage || { in: Math.round(prompt.length / 4), out: Math.round(out.length / 4), approx: true });
        return raw ? out : cleanReply(out);
      },
      // long work (the assistant's offload) on this computer: minutes, not seconds; web = may search and read pages (claude)
      async work(prompt, { web = false, timeoutMs = 10 * 60 * 1000 } = {}) {
        return (await runCli(brain, prompt, timeoutMs, null, web)).text;
      },
    };
  }
  if (brain.kind === 'api' || brain.kind === 'batuta') {
    const llmEnv =
      brain.kind === 'batuta'
        ? { LLM_PROVIDER: 'openai', LLM_BASE_URL: `${ORQUESTA_URL}/api/v1`, OPENAI_API_KEY: keys.ORQUESTA_TOKEN, LLM_MODEL: brain.model || 'batuta-auto' }
        : {
            LLM_PROVIDER: brain.provider || 'anthropic',
            LLM_MODEL: brain.model || '',
            LLM_BASE_URL: brain.baseUrl || '',
            LLM_EFFORT: 'low',
            LLM_MAX_TOKENS: '2000',
            ANTHROPIC_API_KEY: keys.ANTHROPIC_API_KEY,
            OPENAI_API_KEY: keys.OPENAI_API_KEY,
          };
    const llm = createLLM(llmEnv);
    return {
      kind: brain.kind,
      async think({ system, messages, raw = false, onUsage }) {
        if (brain.kind === 'batuta' && !keys.ORQUESTA_TOKEN) throw Object.assign(new Error('batuta: no Orquesta token'), { code: 'batuta_no_token' });
        let r;
        try {
          r = await llm.step({ system, messages, tools: [] });
        } catch (e) {
          throw brain.kind === 'batuta' ? batutaError(e, keys.ORQUESTA_TOKEN) : e;
        }
        if (r.usage) onUsage?.(r.usage);
        return raw ? r.text : cleanReply(r.text);
      },
    };
  }
  if (brain.kind === '7ots' && home.url) {
    const url = `${home.url.replace(/\/+$/, '')}/chat`;
    return {
      kind: '7ots',
      async think({ system, messages, timeoutMs = 45000, raw = false, onUsage }) {
        // On 7ots.com the owner's device token opens its own ot's home; a self-hosted home only serves its
        // domains (add http://127.0.0.1:<port> to them). The token never goes to another server.
        const token = new URL(url).origin === new URL(SEVENOTS_URL).origin && env().SEVENOTS_TOKEN;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PET_PORT}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ system, messages, tools: [] }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (data.usage) onUsage?.(data.usage);
        return raw ? data.text : cleanReply(data.text);
      },
    };
  }
  return {
    kind: 'lines',
    think: async () => '',
  };
}
