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
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { identityPrompt } from '../../src/identity/schema.js';
import { createLLM } from '../../server/llm.mjs';
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
  claude: { bin: 'claude', json: true, args: (p, m, files) => ['-p', p, '--output-format', 'json', ...(m ? ['--model', m] : []), ...(files ? ['--allowedTools', 'Read'] : [])], vision: true, minTimeoutMs: 120000 }, // claude -p can take ~30 s just to start (hooks, plugins, MCP servers)
  codex: { bin: 'codex', args: (p, m) => ['exec', '--skip-git-repo-check', ...(m ? ['-m', m] : []), p] },
  gemini: { bin: 'gemini', args: (p, m) => ['-p', p, ...(m ? ['-m', m] : [])] },
  ollama: { bin: 'ollama', args: (p, m) => ['run', m || 'llama3.2', p] },
  orquesta: { bin: 'orquesta', args: (p, m) => ['-p', p, ...(m ? ['--endpoint', m] : [])] },
};

const LANG_NAME = { en: 'English', es: 'Spanish', pt: 'Portuguese' };

/** Which AI CLIs are installed (for the wizard and `--mode auto`). */
export function detectClis() {
  return Object.keys(AI_CLIS).filter((k) => {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [AI_CLIS[k].bin], { stdio: 'ignore' });
    return r.status === 0;
  });
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

function runCli({ cli, model, command }, prompt, timeoutMs, files) {
  const spec = cli === 'custom' ? { bin: '/bin/sh', args: (p) => ['-c', command, 'sh', p] } : AI_CLIS[cli];
  if (!spec) return Promise.reject(new Error(`unknown cli ${cli}`));
  return new Promise((resolve, reject) => {
    const child = spawn(spec.bin, spec.args(prompt, model, files), {
      cwd: ensureHome(),
      env: { ...process.env, SEVENOTS_PET_BRAIN: '1', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('timeout'));
    }, Math.max(timeoutMs, spec.minTimeoutMs || 0));
    child.stdout.on('data', (d) => (out += d).length > 20000 && child.kill('SIGTERM'));
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
        const r = await llm.step({ system, messages, tools: [] });
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
        // The ot's home only serves its own domains: add http://127.0.0.1:<port> to them in /app/.
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PET_PORT}` },
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
