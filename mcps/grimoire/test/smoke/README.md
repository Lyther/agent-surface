# Per-Host Launch Smoke — grimoire (living record)

Goal: before documenting a host as "grimoire runtime-verified", prove `grimoire-server` actually
loads under that host — `tools/list` exposes the 4 `grimoire_*` tools and a `grimoire_search` →
`grimoire_get` → `grimoire_file_get` round-trip returns real hits. Each host has its own MCP
config shape and launch cwd, so a **recorded pass per host** is required.

Per-host in-UI launch is **operator-run, not automated** (GUI/CLI apps must be started by a human),
so this matrix is filled **continuously during actual use**, not in one sitting.

## What is already automated (not per-host, but real)

- **Spawned-process stdio** — `test/packaging.test.ts` launches the built `dist/src/server.js` over
  real stdio and drives `search → get → file_get`. Proves the transport + binary generically.
- **Config generation/merge** — `tests/agent-surface.test.mjs` (repo root) proves grimoire is present,
  non-destructively, in every generated host config family (JSON/TOML/JSONC/YAML).

Config presence + generic stdio are proven; the matrix below records **in-app loading** per host.

## Prerequisites

- `npm run install:grimoire` has run: `~/.local/bin/grimoire-server` exists and `~/.grimoire/index.sqlite`
  + `manifest.json` are present (mode 600). `npm run doctor` shows `grimoire-index: ok (<commit>)`.
- The host's MCP config has been wired: `agent-surface install --target <host> --scope user --category mcps`.

## Host matrix

Mark a host **verified** only when `tools/list` shows the 4 tools **and** a `grimoire_search` returns a
real result in that host's UI/CLI. Record the date + host version.

| Host | MCP config | tools/list (4) | search→get→file_get | Verified (date · version) |
|---|---|---|---|---|
| Claude Code | `~/.claude.json` | | | |
| Codex | `~/.codex/config.toml` | | | |
| Deep Agents | `~/.deepagents/.mcp.json` | | | |
| Cursor | `~/.cursor/mcp.json` | | | |
| Droid | `~/.factory/mcp.json` | | | |
| Cline | `~/.cline/mcp.json` | | | |
| Kilo | `~/.config/kilo/kilo.jsonc` | | | |
| OpenCode | `~/.config/opencode/opencode.json` | | | |
| VS Code | `…/Code/User/mcp.json` | | | |
| VSCodium | `…/VSCodium/User/mcp.json` | | | |
| Trae | `~/.trae/mcp.json` | | | |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | | | |
| Zed | `~/.config/zed/settings.json` | | | |
| Grok Build | `~/.grok/settings.json` | | | |
| Antigravity CLI | `~/.gemini/config/plugins/agent-surface/mcp_config.json` | | | |
| Goose | `~/.config/goose/config.yaml` | | | |
| Poolside | `~/.config/poolside/settings.yaml` | | | |

Note: the 5 most-recently-added formats (VSCodium, Grok Build, Antigravity CLI, Goose, Poolside) were
generated from official docs and are proven **written + non-destructively merged**, but not yet proven
**loaded** by the real app — prioritize recording those.
