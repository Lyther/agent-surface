# Per-Host Launch Smoke — grimoire (living record)

Goal: before documenting a host as "grimoire runtime-verified", prove `grimoire-server` actually loads under that host — `tools/list` exposes the 4 `grimoire_*` tools and a `grimoire_search` → `grimoire_get` → `grimoire_file_get` round-trip returns real hits. Each host has its own MCP config shape and launch cwd, so a **recorded pass per host** is required.

Use a native headless entry point where the host provides one; GUI-only hosts remain operator-run. This matrix records actual host execution, not generated config presence.

## What is already automated (not per-host, but real)

- **Spawned-process stdio** — `test/packaging.test.ts` launches the built `dist/src/server.js` over real stdio and drives `search → get → file_get`. Proves the transport + binary generically.
- **Config generation/merge** — the repo-root `tests/suites/build.test.mjs` and `install.test.mjs` prove grimoire is present, non-destructively, in every generated host config family (JSON/TOML/JSONC/YAML).

Config presence + generic stdio are proven; the matrix below records **in-app loading** per host.

## Prerequisites

- `npm run install:grimoire` has run: `~/.local/bin/grimoire-server` and `~/.grimoire/index.sqlite` are present. `npm run doctor` shows `grimoire-index: present`.
- The host's MCP config has been wired: `agent-surface install --target <host> --scope user --category mcps`.

## Host matrix

Mark a host **verified** only when `tools/list` shows the 4 tools **and** a `grimoire_search` returns a real result in that host's UI/CLI. Record the date + host version.

The authoritative config paths are maintained once in [`docs/reference/targets.md`](../../../../docs/reference/targets.md). For Antigravity CLI, validate and install the staged plugin before running this smoke.

| Host | tools/list (4) | search→get→file_get | Verified (date · version) |
|---|---|---|---|
| Antigravity CLI | | | |
| Claude Code | | | |
| Cline | | | |
| Codex | | | |
| GitHub Copilot | | | |
| Cursor | | | |
| Deep Agents Code | | | |
| Droid | | | |
| Goose | | | |
| Grok Build | | | |
| Kilo | | | |
| Kimi Code | | | |
| Kiro | | | |
| OpenCode | | | |
| OpenHands | | | |
| Poolside | | | |
| Qoder | | | |
| Qwen Code | | | |
| Trae | | | |
| VS Code | | | |
| Windsurf | | | |
| Zed | | | |
