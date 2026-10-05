# Contributing

Thanks for helping. A few notes so your change lands quickly:

- **Run it locally:** `npm ci && npm run build`, then `node cli/7ots.mjs pet`. Desktop app: `cd desktop && npm ci && npm start`.
- **Before a pull request:** `npm run check` must pass. Keep changes focused, one topic per PR.
- **Style:** plain modern JavaScript (ES modules, Node 20+), no frameworks. Match the code around you.
- **Bugs:** include your OS, how you installed (desktop app or npm) and the steps to reproduce.

This repository is a mirror of the code we ship. Accepted pull requests are applied upstream and come back here
with the next sync, credited to you.

By contributing you agree your work is released under the [MIT license](LICENSE).
