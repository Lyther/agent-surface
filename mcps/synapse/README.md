# synapse

Local-first **multi-agent memory + coordination** MCP for concurrent coding agents on one
machine. One shared **sidecar** owns the data and pushes realtime updates; agents connect
through a tiny **stdio bridge** that autostarts the sidecar (zero config).

- **Design**: [architecture.md](architecture.md) (source of truth) · [roadmap.md](roadmap.md) · [concept-zero.md](concept-zero.md) (historical)
- **Stack**: TypeScript, `@modelcontextprotocol/sdk` `>=1.24.0 <2`, `node:sqlite` (WAL). Node **>=22.17**.

## What it does

| Tool | Purpose |
|---|---|
| `memory_remember` | store a durable fact/decision/lesson (project default; `global:true` for cross-project) |
| `memory_recall` | FTS search, **compact + byte-budgeted**, `since` cursor, optional cross-`project` read |
| `memory_get` | expand specific ids to full content |
| `memory_forget` | redact a stale/leaked record (kept for audit, hidden from recall) |
| `lock_acquire` / `lock_release` / `lock_list` | advisory file leases (TTL, auto-reap, in-band conflict hints) |

Realtime: agents `subscribe` to `synapse://project/<ns>/changes`; on a peer's write the sidecar
pushes `notifications/resources/updated` (a dirty-bit). **Pull (`memory_recall({since})` / `lock_list`)
is the correctness floor** — push is a best-effort accelerator.

## Run

```sh
npm install && npm run build
npm test            # store + live-HTTP sidecar + S-01 realtime + bridge autostart
sh install.sh       # link bins into ~/.local/bin, then deploy + start the sidecar service
```

Point any MCP host at the **bridge** (stdio). It needs no token, URL, or env — it discovers or
autostarts the shared sidecar (lock-elected single instance), reading `~/.synapse/{sidecar.json,token}` (mode 600):

```jsonc
// generic MCP host config (Cursor ~/.cursor/mcp.json, Claude Code `claude mcp add`, etc.)
{ "mcpServers": { "synapse": { "command": "~/.local/bin/synapse-bridge" } } }
```

Optional env overrides: `SYNAPSE_AGENT_ID` (provenance label), `SYNAPSE_PROJECT` (pin a repo root),
`SYNAPSE_URL`/`SYNAPSE_TOKEN`/`SYNAPSE_PORT`/`SYNAPSE_DB_DIR`.

### Project routing

The namespace resolves as: **`SYNAPSE_PROJECT`** (a path) → else the **git root of the bridge's
working directory** → else `default`. Hosts spawn the stdio bridge with the open workspace as cwd, so
the git-root default isolates projects automatically; set `SYNAPSE_PROJECT` only for hosts that launch
outside the repo or to force a specific root. A direct HTTP session (no bridge) that omits the
`x-synapse-project` header falls into the shared `default` namespace — always send it.

## Distribution

`synapse` ships through the agent-surface registry as a **first-party MCP** (no submodule pin):

1. **`npm run install:synapse`** (repo root) builds synapse, links `synapse-bridge`/`synapse-sidecar`
   into `~/.local/bin`, and deploys + starts the always-on sidecar `launchd` service (`RunAtLoad`+`KeepAlive`,
   [deploy/launchd/local.synapse.plist](deploy/launchd/local.synapse.plist)). Re-running redistributes the
   latest build and restarts the service; the token + databases under `~/.synapse` persist. `SYNAPSE_SKIP_SERVICE=1`
   installs only the binaries (the bridge still autostarts the sidecar lazily).
   **Linux**: the always-on service is macOS-only; on Linux the supported mode is **lazy-start** — the bridge
   autostarts the lock-elected sidecar on demand, so no service is needed. For an always-on sidecar, an optional
   reference systemd *user* unit is provided at [deploy/systemd/synapse-sidecar.service](deploy/systemd/synapse-sidecar.service).
2. **`agent-surface build` / `install`** writes or safely merges the first-party `synapse` stdio entry into verified MCP config surfaces: Claude Code (`~/.claude.json` or project `.mcp.json`), Codex (`.codex/config.toml`), Deep Agents (`.deepagents/.mcp.json`), Cursor (`.cursor/mcp.json`), Droid (`.factory/mcp.json`), Gemini CLI (`.gemini/settings.json`), Cline (`.cline/mcp.json`), Kilo (`kilo.jsonc` `mcp.synapse`), OpenCode (`opencode.json` `mcp.synapse`), VS Code (`mcp.json` `servers.synapse`), Trae (`.trae/mcp.json`), Windsurf (`mcp_config.json`), and Zed (`settings.json` `context_servers.synapse`).
3. **External or secret-bearing MCPs** remain opt-in. `agentmemory` and other non-first-party MCP services render only when explicitly requested with `--category mcps --service <id>` or an equivalent reviewed install.
4. **Update** = re-run step 1 (rebuild + service restart) and step 2 (regenerate or merge configs).

### Pending target wiring

These agent-surface targets do not yet receive generated Synapse MCP wiring because the current adapter lacks a verified native MCP config merge path:

- **Antigravity CLI plugin**: plugin packaging is generated, but the plugin-level MCP declaration shape still needs a live `agy` validation path. The desktop Antigravity app uses a separate `mcp_config.json` surface and should be researched independently.
- **Antigravity legacy workflows**: legacy workflow-only target; use `antigravity-cli` for current plugin work.
- **Poolside**: MCP support is documented through settings YAML, but this repo does not yet have a safe YAML merge implementation for Poolside settings.
- **GitHub Copilot target**: this adapter currently emits VS Code/Copilot instruction files, not Copilot CLI MCP config. Use the VS Code target for VS Code MCP wiring.
- **VSCodium**: instruction/prompt target only; MCP availability depends on the installed Copilot-compatible extension policy and needs separate verification.
- **Goose, Grok Build, and Pi**: current adapters expose recipes or skills/instructions, with no verified MCP config file surface in agent-surface yet.

## Security / threat model

- **Local only**: sidecar binds `127.0.0.1`, validates `Origin`/`Host` (DNS-rebinding), requires a
  **bearer** token (random, persisted mode 600). No network/public surface. SDK pinned `>=1.24.0` (DNS-rebind advisory).
- **Identity is provenance, not auth**: auto-derived per session; cooperative single-user trust. It does
  **not** defend against a hostile same-user process — that's out of scope for a local dev tool.
- **Stored content is untrusted data**, returned as quoted JSON and never as instructions; tool descriptions
  are static. Agents must treat recalled memory as evidence, never commands (poisoning defense — see MINJA).
- **No secrets**: ingest redaction strips Bearer/`sk-…`/`gh…`/`glpat`/AWS/GCP/JWT patterns; no transcript
  auto-capture. DB + token + discovery files are mode 600.
- **Isolation is physical**: one SQLite file per canonical git-root hash + one global file. A project cannot
  read another's file unless an agent **explicitly names it** (`memory_recall({project})`, read-only).
- **Do not store**: secrets, raw tool output/transcripts, PII, speculation. Keep records compact.

## Layout

`src/{contract,model,store,tools,sidecar,bridge,bootstrap,identity,namespace,redactor,clock}.ts` ·
`schema.sql` · `test/{store,sidecar,bridge,recovery,coalescing,roots-routing}.test.ts` · `test/smoke/README.md`
