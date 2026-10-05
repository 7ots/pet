/**
 * Hooks that tell the pet what happens.
 *
 *   Claude Code   .claude/settings.local.json (or ~/.claude/settings.json with --global):
 *                 PostToolUse · UserPromptSubmit · Stop · Notification · SessionStart → `7ots event --from claude`
 *                 (the hook JSON arrives on stdin).
 *   Shell         ~/.7ots/shell.sh sourced from ~/.bashrc / ~/.zshrc: after each command,
 *                 `7ots event --type shell --code <exit> --cmd <command>` in the background.
 *
 * Every entry we add runs "7ots … event", so `7ots hooks remove` finds and removes only ours.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { homeFile, PKG_ROOT, readJson, writeJson, ensureHome } from './paths.mjs';

/** Our entries: `7ots event …`, `npx -y @7ots/cli event …` or `node ".../cli/7ots.mjs" event …`. */
const isOurs = (h) => /(7ots(\.mjs"?)?|@7ots\/cli)\s+event\b/.test(String(h?.command || ''));
const CLAUDE_EVENTS = ['PostToolUse', 'UserPromptSubmit', 'Stop', 'Notification', 'SessionStart'];
const RC_LINE = '[ -f "$HOME/.7ots/shell.sh" ] && . "$HOME/.7ots/shell.sh" # 7ots pet';

/** How hooks should call us: the global `7ots`, this checkout, or npx. */
export function selfCommand() {
  // under npx, PATH holds npx's own cache bin dir: that `7ots` is gone once npx exits
  const which = spawnSync('which', ['7ots'], { encoding: 'utf8' });
  const bin = which.status === 0 ? which.stdout.trim() : '';
  if (bin && !/[\\/]_npx[\\/]/.test(bin)) return '7ots';
  if (!/[\\/]_npx[\\/]/.test(PKG_ROOT)) return `node ${JSON.stringify(join(PKG_ROOT, 'cli', '7ots.mjs'))}`;
  return 'npx -y @7ots/cli';
}

function claudeSettingsFile({ global = false, cwd = process.cwd() } = {}) {
  return global ? join(homedir(), '.claude', 'settings.json') : join(cwd, '.claude', 'settings.local.json');
}

export function installClaudeHooks(opts = {}) {
  const file = claudeSettingsFile(opts);
  const s = readJson(file, {}) || {};
  s.hooks ||= {};
  const cmd = `${selfCommand()} event --from claude`;
  for (const ev of CLAUDE_EVENTS) {
    const list = (s.hooks[ev] ||= []);
    const ours = list.some((g) => (g.hooks || []).some(isOurs));
    if (!ours) list.push({ ...(ev === 'PostToolUse' ? { matcher: '*' } : {}), hooks: [{ type: 'command', command: cmd, timeout: 5 }] });
  }
  writeJson(file, s);
  return file;
}

export function removeClaudeHooks(opts = {}) {
  const file = claudeSettingsFile(opts);
  if (!existsSync(file)) return null;
  const s = readJson(file, {}) || {};
  for (const ev of Object.keys(s.hooks || {})) {
    s.hooks[ev] = s.hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
  writeJson(file, s);
  return file;
}

function shellScript() {
  const cmd = selfCommand();
  return `# 7ots pet — tells your pet how your commands go. Remove with: 7ots hooks remove
# (generated; runs in the background and never changes $?)
__7ots_send() {
  [ -n "$SEVENOTS_PET_BRAIN" ] && return
  ( ${cmd} event --type shell --code "$1" --cmd "$2" >/dev/null 2>&1 & ) 2>/dev/null
}
if [ -n "$ZSH_VERSION" ]; then
  __7ots_preexec() { __7ots_cmd="$1"; }
  __7ots_precmd() {
    local code=$?
    [ -n "$__7ots_cmd" ] && __7ots_send "$code" "$__7ots_cmd"
    __7ots_cmd=""
    return $code
  }
  autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook preexec __7ots_preexec && add-zsh-hook precmd __7ots_precmd
elif [ -n "$BASH_VERSION" ]; then
  __7ots_prompt() {
    local code=$?
    local h; h=$(HISTTIMEFORMAT= history 1)
    local n=\${h%%[^ 0-9]*}
    if [ -n "$__7ots_n" ] && [ "$n" != "$__7ots_n" ]; then
      __7ots_send "$code" "$(printf '%s' "$h" | sed 's/^ *[0-9]* *//')"
    fi
    __7ots_n=$n
    return $code
  }
  case ";$PROMPT_COMMAND;" in *";__7ots_prompt;"*) ;; *) PROMPT_COMMAND="__7ots_prompt\${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;; esac
fi
`;
}

export function installShellHooks() {
  ensureHome();
  writeFileSync(homeFile('shell.sh'), shellScript());
  const touched = [];
  for (const rc of ['.bashrc', '.zshrc']) {
    const f = join(homedir(), rc);
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    if (!text.includes(RC_LINE)) writeFileSync(f, `${text.replace(/\n*$/, '\n')}${RC_LINE}\n`);
    touched.push(f);
  }
  return touched;
}

export function removeShellHooks() {
  const touched = [];
  for (const rc of ['.bashrc', '.zshrc']) {
    const f = join(homedir(), rc);
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    if (!text.includes(RC_LINE)) continue;
    writeFileSync(f, text.split('\n').filter((l) => l !== RC_LINE).join('\n'));
    touched.push(f);
  }
  return touched;
}

/** Hides what looks like a secret before a command reaches the pet (and maybe an AI). */
export function redact(cmd) {
  return String(cmd || '')
    .replace(/((?:key|token|secret|password|passwd|pwd|auth|bearer)[\w-]*\s*[=:]\s*|--(?:key|token|secret|password)[\w-]*[ =])\S+/gi, '$1***')
    .replace(/\b(?:sk|pk|rk|ghp|gho|xox[abp]|oak|oclt|oat|acct)[-_][A-Za-z0-9_-]{8,}/g, '***')
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '***')
    .replace(/https?:\/\/[^\s@/]+:[^\s@/]+@/g, 'https://***@')
    .slice(0, 120);
}

/** Claude Code hook JSON → pet event. */
export function fromClaudeHook(h = {}) {
  const ev = h.hook_event_name;
  if (ev === 'UserPromptSubmit') return { type: 'prompt', text: redact(h.prompt).slice(0, 120) };
  if (ev === 'Stop' || ev === 'SubagentStop') return { type: 'stop' };
  if (ev === 'Notification') return { type: 'notify', message: String(h.message || '').slice(0, 160) };
  if (ev === 'SessionStart') return { type: 'start' };
  if (ev === 'PostToolUse') {
    const r = h.tool_response;
    const failed =
      r && typeof r === 'object' && (r.is_error === true || r.success === false || (r.exitCode ?? r.exit_code ?? 0) !== 0 || r.interrupted === true);
    const input = h.tool_input || {};
    const detail = redact(input.command || input.file_path || input.pattern || input.url || input.description || '');
    return { type: 'tool', tool: String(h.tool_name || 'tool').slice(0, 40), ok: !failed, detail };
  }
  return null;
}
