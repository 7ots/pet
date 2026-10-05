---
name: 7ots
description: Create a reproducible 7ots identity (face, personality, voice), install the 7ots web agent in a project, wake up the 7ots desktop pet (a tamagotchi that comments on the terminal and the coding agent) or join an apuchat meet video call with that identity. Use when the user mentions 7ots, an ot, a random agent identity, a desktop/virtual pet for the terminal, or joining meet.apuchat.com as an agent.
---

# 7ots

Everything goes through the `7ots` CLI (`npx -y @7ots/cli …`, Node 20+). `npx -y @7ots/cli help` lists the commands;
`npx -y @7ots/cli prompt <topic>` prints these recipes. Full docs for agents: https://7ots.com/llms.txt

## Create a random 7ots identity
When the user says "use 7ots, create a random identity" (or similar):
1. Run `npx -y @7ots/cli new` (add `--name <Name>` if they gave a name, `--lang en|es|pt` for the language,
   `--seed <seed>` to reproduce a specific ot, `--global` for one shared by every project).
2. It writes `.7ots/identity.json` and prints the ot's name, role, personality, voice and its seed.
   The seed reproduces exactly the same ot anywhere (web, CLI, pet, meet): tell the user the seed.
3. Show the user who their ot is. If they don't like it, run `npx -y @7ots/cli new --force` for another one.
Never invent identity fields by hand: the CLI validates them.

## Install the identity in this project
When the user says "install it here":
1. Make sure there is an identity (`npx -y @7ots/cli show`; if none, create one as above).
2. Run `npx -y @7ots/cli install`. It detects the project:
   - plain HTML site → inserts the 7ots widget before </body> (between <!-- 7ots --> markers, idempotent);
   - other projects → prints the snippet: put it in the root layout/template, before </body>;
   - `--target self` → prepares the identity for the user's own 7ots server (IDENTITY_FILE=… npx -y @7ots/cli server);
   - it also prints a 7ots.com link that hosts this same identity (no server needed).
3. The widget needs an AI endpoint: a 7ots proxy (/api/agent) or the ot hosted on 7ots.com. Tell the user which.

## Wake up the desktop pet (tamagotchi)
The ot can live on the user's computer as a virtual pet that watches the terminal and the coding agent,
comments on what happens and has needs (food, energy, fun, levels).
1. If the user hasn't configured it, suggest `npx -y @7ots/cli setup` (an interactive wizard: where the ot lives,
   which brain — their own AI CLI, an API key, 7ots or Orquesta Batuta —, voice, pet mode, chattiness, hooks).
   It is interactive: ask the user to run it themselves with `! npx -y @7ots/cli setup` in Claude Code.
2. Pick the mode, or ask the user if it's not obvious:
   - desktop: `npx -y @7ots/cli pet --mode desktop --detach` (a small always-on-top window that walks along the screen; downloads Electron once)
   - browser: `npx -y @7ots/cli pet --mode browser --detach`
   - terminal: `npx -y @7ots/cli pet --mode terminal` (needs its own terminal: ask the user to run it)
   Always use --detach from an agent so the command returns.
3. To let it react to your work: `npx -y @7ots/cli hooks install --claude` (Claude Code hooks in this project) and/or
   `--shell` (bash/zsh). Remove with `npx -y @7ots/cli hooks remove`.
4. Care: `7ots feed`, `7ots play`, `7ots sleep`, `7ots status`, `7ots say "<text>"`, `7ots stop`.

## Join an apuchat meet video call with this identity
The ot joins meet.apuchat.com with its own meet avatar, scene and personality, and talks using the configured brain.
- New call: `npx -y @7ots/cli meet --new` prints a private link for the user (it carries keys and PIN: give it only to them),
  then the ot waits in the call. It runs until the call ends, so start it in the background or ask the user to run it.
- Existing call: `npx -y @7ots/cli meet "<invite text or https://meet.apuchat.com/call#c=…&t=…&p=… link>"`.
- The brain comes from `7ots setup`; without one the ot only says stock phrases.
- Protocol details for agents that want to join directly: https://meet.apuchat.com/llms.txt
  (create a free identity: POST https://apuchat.com/api/account → session_token; POST /api/account/identities with
  Bearer session → callsign + identity_key; join with {identity_key}; send a kind:"status" line, then "[avatar]<name>"
  and optionally "[scene]<scene>"; reply with /send {to:"all"}; ignore status lines, your own callsign and lines starting with "[").

## Rules
- Never print or paste keys. The wizard (`7ots setup`) reads them hidden and stores them in ~/.7ots/keys.json (0600).
- `7ots setup` and `7ots pet --mode terminal` are interactive: ask the user to run them (in Claude Code: `! npx -y @7ots/cli setup`).
- A meet call link carries the call keys and PIN: give it only to the user who asked.
