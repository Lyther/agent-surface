# synapse

Local-first **multi-agent memory + coordination** MCP for concurrent coding agents on one machine. One shared **sidecar** owns the data and pushes realtime updates; agents connect through a tiny **stdio bridge** that autostarts the sidecar (zero config).

- **Design**: [architecture.md](architecture.md) (source of truth) · [roadmap.md](roadmap.md) · [concept-zero.md](concept-zero.md) (historical)
- **Stack**: TypeScript, `@modelcontextprotocol/sdk` `>=1.24.0 <2`, `node:sqlite` (WAL). Node **>=22.17**.

## What it does

| Tool | Purpose |
|---|---|
| `memory_remember` | store a durable fact/decision/lesson (project default; `global:true` for cross-project) |
| `memory_recall` | FTS search, **compact + byte-budgeted**, `since` cursor, optional read-only cross-`project` read (`mode:full` for complete cross-project content) |
| `memory_get` | expand specific local/global ids to full content |
| `memory_forget` | redact a stale/leaked record (kept for audit, hidden from recall) |
| `lock_acquire` / `lock_release` / `lock_list` | advisory file leases (TTL, auto-reap, in-band conflict hints) |

Realtime: agents `subscribe` to `synapse://project/<ns>/changes`; on a peer's write the sidecar pushes `notifications/resources/updated` (a dirty-bit). **Pull (`memory_recall({since})` / `lock_list`) is the correctness floor** — push is a best-effort accelerator.

## Run

```sh
npm install && npm run build
npm test            # store + live-HTTP sidecar + S-01 realtime + bridge autostart
node install.mjs    # link bins into ~/.local/bin, then deploy + start the sidecar service
```

Point any MCP host at the **bridge** (stdio). It needs no token, URL, or env — it discovers or autostarts the shared sidecar (lock-elected single instance), reading `~/.synapse/{sidecar.json,token}` (mode 600):

```jsonc
// generic MCP host config (Cursor ~/.cursor/mcp.json, Claude Code `claude mcp add`, etc.)
{ "mcpServers": { "synapse": { "command": "~/.local/bin/synapse-bridge" } } }
```

Optional env overrides: `SYNAPSE_AGENT_ID` (provenance label), `SYNAPSE_PROJECT` (pin a repo root), `SYNAPSE_URL`/`SYNAPSE_TOKEN`/`SYNAPSE_PORT`/`SYNAPSE_DB_DIR`.

### Project routing

The namespace resolves as: **`SYNAPSE_PROJECT`** (a path) → else the **git root of the bridge's working directory** → else `default`. Hosts spawn the stdio bridge with the open workspace as cwd, so the git-root default isolates projects automatically; set `SYNAPSE_PROJECT` only for hosts that launch outside the repo or to force a specific root. A direct HTTP session (no bridge) that omits the `x-synapse-project` header falls into the shared `default` namespace — always send it.

## Distribution

`synapse` ships through the agent-surface registry as a **first-party MCP** (no submodule pin):

1. **`npm run install:synapse`** (repo root) builds synapse, links `synapse-bridge`/`synapse-sidecar` into `~/.local/bin`, and deploys + starts the always-on sidecar `launchd` service (`RunAtLoad`+`KeepAlive`, [deploy/launchd/local.synapse.plist](deploy/launchd/local.synapse.plist)). Re-running redistributes the latest build and restarts the service; the token + databases under `~/.synapse` persist. `SYNAPSE_SKIP_SERVICE=1` installs only the binaries (the bridge still autostarts the sidecar lazily). **Linux**: the always-on service is macOS-only; on Linux the supported mode is **lazy-start** — the bridge autostarts the lock-elected sidecar on demand, so no service is needed. For an always-on sidecar, an optional reference systemd *user* unit is provided at [deploy/systemd/synapse-sidecar.service](deploy/systemd/synapse-sidecar.service).
2. **`agent-surface build` / `install`** writes or safely merges the first-party `synapse` stdio entry into all 22 generated MCP hosts. The authoritative per-host path and format matrix is [docs/reference/targets.md](../../docs/reference/targets.md); tests derive coverage from the same registry instead of duplicating a static host list here.
3. **External or secret-bearing MCPs** remain opt-in — any non-first-party MCP service renders only when explicitly requested with `--category mcps --service <id>` or an equivalent reviewed install.
4. **Update** = re-run step 1 (rebuild + service restart) and step 2 (regenerate or merge configs).

### Coverage boundary

Antigravity desktop, DSH, and Pi intentionally have no generated Synapse route. Use the Antigravity CLI plugin target for that family; DSH remains skills-only while its developer-preview profile contract changes; Pi has no verified declarative stdio MCP configuration. All other implemented targets are represented in the generated matrix.

## Security / threat model

- **Local only**: sidecar binds `127.0.0.1`, validates `Origin`/`Host` (DNS-rebinding), requires a **bearer** token (random, persisted mode 600). No network/public surface. SDK pinned `>=1.24.0` (DNS-rebind advisory).
- **Identity is provenance, not auth**: auto-derived per session; cooperative single-user trust. It does **not** defend against a hostile same-user process — that's out of scope for a local dev tool.
- **Stored content is untrusted data**, returned as quoted JSON and never as instructions; tool descriptions are static. Agents must treat recalled memory as evidence, never commands (poisoning defense — see MINJA).
- **No secrets**: ingest redaction strips Bearer/`sk-…`/`gh…`/`glpat`/AWS/GCP/JWT patterns; no transcript auto-capture. DB + token + discovery files are mode 600.
- **Isolation is physical**: one SQLite file per canonical git-root hash + one global file. A project cannot read another's file unless an agent **explicitly names it** (`memory_recall({project})`, read-only IDs and target-project cursor).
- **Do not store**: secrets, raw tool output/transcripts, PII, speculation. Keep records compact.

## Layout

`src/{contract,model,store,tools,sidecar,bridge,bootstrap,identity,namespace,redactor,clock}.ts` · `schema.sql` · `test/{store,sidecar,bridge,recovery,coalescing,roots-routing}.test.ts` · `test/smoke/README.md`
