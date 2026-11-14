# 7ots plugins

A plugin adds something to an ot: a **window beside it** (like the game in byte), **tools for its brain**
(an MCP server), and a few words that tell the ot **when** to use them. Anyone can make one; the public
catalog at [7ots.com/app/#plugins](https://7ots.com/app/#plugins) only lists the ones a 7ots admin approved
after reading the code.

Example in this repo: [`plugins/btc-price/`](../plugins/btc-price) — the bitcoin price in a small window,
opened when you ask your ot "how is BTC doing?".

## Try it in 5 minutes

```sh
npm i -g @7ots/cli          # the desktop ot (7ots pet)
7ots plugin new my-plugin   # a folder ~/7ots-plugins/my-plugin (or: 7ots plugin new my-plugin ./here)
7ots plugin add ./my-plugin # load it from your folder (live: edit, then reopen the window)
7ots plugin open my-plugin  # opens its window beside the ot
```

The same from the app: **settings → Plugins → Create a plugin / Load from a folder**. The ot's right-click menu
→ **Plugins** opens the window of any plugin you have on.

## The folder

```
my-plugin/
  7ots-plugin.json   the manifest (required)
  panel.html         the window (optional), plus its .css/.js/images
  README.md          for people (not uploaded)
```

### 7ots-plugin.json

```json
{
  "id": "btc-price",
  "name": "BTC price",
  "version": "1.0.0",
  "icon": "₿",
  "description": "Bitcoin price live, in a small window beside your ot.",
  "author": "you",
  "homepage": "https://…",
  "instructions": "When your human asks about the bitcoin price, open this panel.",
  "panel": { "file": "panel.html", "title": "BTC", "width": 300, "height": 200 },
  "net": ["api.coingecko.com"],
  "mcp": { "url": "https://example.com/mcp" },
  "env": ["EXAMPLE_API_KEY"]
}
```

| field | |
|---|---|
| `id` | 2–32 of `a-z 0-9 -`. Unique in the catalog: the first account that publishes it owns it. |
| `name`, `version`, `icon`, `description`, `author`, `homepage` | what people see. `version` is semver. |
| `instructions` | for the ot's brain: when to open the window or use the tools (≤ 600 chars). |
| `panel` | the window: an `.html` file of the plugin, its title and size (200–900 px). |
| `net` | the hosts the window may talk to (https only, ≤ 8). Nothing else is reachable. |
| `mcp` | tools for the brain: `{ "url": "https://…" }`. `{ "command": "node server.mjs" }` works only for plugins you load yourself (dev); the catalog takes `url` only. |
| `env` | keys the MCP server needs (the human sets them in settings). |

A plugin needs at least one of `panel`, `mcp` or `instructions`.

## The window

- It opens in **its own sandboxed window and origin** (`ots-plugin://<id>/`), next to the ot, always on top.
- CSP: scripts and styles only from the plugin's own files (no inline `<script>`, no CDNs: bundle what you use),
  images from its files, `data:` and `net`; `fetch()` only to the `net` hosts over https.
- It does **not** see the ot, its memory, keys or the local daemon. Links to `https://…` open in the browser.
- `localStorage` works (per plugin). Keep it small: 30 files, 512 KB in all, only web files
  (html, css, js, mjs, json, txt, md, svg, png, jpg, webp, gif, woff2).

## Publish

```sh
7ots login                       # your 7ots.com account
7ots plugin publish ./my-plugin  # sends it to review
```

Or at [7ots.com/app/#plugins](https://7ots.com/app/#plugins) → **Publish a plugin** → pick the folder.

It shows **In review** under *Your plugins*; an admin reads the code and approves or rejects it. Once
approved anyone can install it (`7ots plugin add <id>` or settings → Plugins → Catalog). **Every update goes
back to review.** The pet checks what it downloads against the sha256 of the approved version.

## Commands

```
7ots plugin                      list what you have (on/off, catalog or dev)
7ots plugin catalog [search]     what is approved on 7ots.com
7ots plugin add <id | ./folder>  install from the catalog, or load your folder (dev)
7ots plugin on|off <id>
7ots plugin open <id>            open its window (the desktop ot must be running)
7ots plugin remove <id>
7ots plugin new <id> [folder]    start one
7ots plugin publish <folder>     send it to review
```

## Review (admins)

`PLATFORM_ADMINS` accounts see **To review** at 7ots.com/app/#plugins with every file of each pending plugin.
Check: `net` hosts make sense for what it says it does; no obfuscated code; the MCP `url` belongs to the author;
`instructions` do not try to steer the ot beyond the plugin. Reported plugins (3 reports) hide until reviewed.
Our own plugins live in `plugins/<id>/` of the repo and are published as "by 7ots" on every deploy.
