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
node install.mjs    # link bins into ~/.local/bin (the bridge autostarts the sidecar)
```

Point any MCP host at the **bridge** (stdio). It needs no token, URL, or env — it discovers or autostarts the shared sidecar (lock-elected single instance), reading `~/.synapse/{sidecar.json,token}` (mode 600):

```jsonc
// generic MCP host config (Cursor ~/.cursor/mcp.json, Claude Code `claude mcp add`, etc.)
{ "mcpServers": { "synapse": { "command": "~/.local/bin/synapse-bridge" } } }
```

Optional env overrides: `SYNAPSE_AGENT_ID` (provenance label; locks belong to one bridge process, so sessions sharing it still hold separate leases, and a crashed bridge's leases expire with their TTL, 30 minutes by default), `SYNAPSE_PROJECT` (pin a repo root), `SYNAPSE_ROOTS=ignore` (skip MCP roots; see below), `SYNAPSE_URL`+`SYNAPSE_TOKEN` (set both or neither), `SYNAPSE_PORT`/`SYNAPSE_DB_DIR`.

### Project routing

The namespace resolves as: **`SYNAPSE_PROJECT`** (a path) → else the **git root of the bridge's working directory** → else `default`. Hosts spawn the stdio bridge with the open workspace as cwd, so the git-root default isolates projects automatically; set `SYNAPSE_PROJECT` only for hosts that launch outside the repo or to force a specific root. A host that advertises MCP roots routes by its first root instead, and a failed or timed-out `roots/list` stops the bridge rather than guess from cwd. FastMCP's multi-server proxy advertises roots it cannot serve outside a request, so the installer sets `SYNAPSE_ROOTS=ignore` only on hosts verified to start the bridge in the workspace: OpenHands, where the key is the launch directory (a session whose `OPENHANDS_WORK_DIR` names another directory needs `SYNAPSE_PROJECT`), and Deep Agents Code project installs not rooted at the home directory. Any other non-empty value stops the bridge. A direct HTTP session (no bridge) that omits the project header falls into the shared `default` namespace — always send it, as the canonical git-root realpath a bridge would send, because the sidecar uses the key as-is: `x-synapse-project-encoded` carries it percent-encoded (required for a path beyond Latin-1), and the raw `x-synapse-project` is read when that is absent.

## Distribution

`synapse` ships through the agent-surface registry as a **first-party MCP** (no submodule pin):

1. **`npm run install:synapse`** (repo root) builds synapse and links `synapse-bridge`/`synapse-sidecar` into `~/.local/bin`; the token + databases under `~/.synapse` persist. There is no service on any platform: the first bridge autostarts the lock-elected sidecar and later bridges reuse it. On macOS the installer boots out and deletes the `local.synapse` launchd agent earlier versions deployed, which raced autostart for the port.
2. **`agent-surface build` / `install`** writes or safely merges the first-party `synapse` stdio entry into all 25 generated MCP hosts. The authoritative per-host path and format matrix is [docs/reference/targets.md](../../docs/reference/targets.md); tests derive coverage from the same registry instead of duplicating a static host list here.
3. **External or secret-bearing MCPs** remain opt-in — any non-first-party MCP service renders only when explicitly requested with `--category mcps --service <id>` or an equivalent reviewed install.
4. **Update** = re-run step 1 (rebuild) and step 2 (regenerate or merge configs), then restart the hosts, so that every bridge and the sidecar run the new build. A bridge refuses a sidecar from an earlier build. An earlier bridge sends no operation ids, so a write it retries can be applied twice. Step 1 stops the running sidecar when its `/health` reports the pid on record, and otherwise warns. A sidecar from a build before that check reports no pid, so stop it yourself; restarting hosts does not replace it, because bridges reuse any live sidecar.

### Coverage boundary

Antigravity desktop and DSH intentionally have no generated Synapse route. Use the Antigravity CLI plugin target for that family; DSH remains skills-only while its developer-preview profile contract changes. All other implemented targets are represented in the generated matrix.

## Security / threat model

- **Local only**: sidecar binds `127.0.0.1`, validates `Origin`/`Host` (DNS-rebinding), requires a **bearer** token (random, persisted mode 600). No network/public surface. SDK pinned `>=1.24.0` (DNS-rebind advisory).
- **Identity is provenance, not auth**: auto-derived per session; cooperative single-user trust. It does **not** defend against a hostile same-user process — that's out of scope for a local dev tool.
- **Stored content is untrusted data**, returned as quoted JSON and never as instructions; tool descriptions are static. Agents must treat recalled memory as evidence, never commands (poisoning defense — see MINJA).
- **No secrets**: ingest redaction strips Bearer/Basic auth, `sk-…`/`gh…`/`glpat`/AWS/GCP/JWT patterns, `key=secret` pairs (prefixed or JSON/YAML-quoted keys) and URL credentials from content and tags; no transcript auto-capture. The data directory is owner-only (mode 700, an owner-only ACL on Windows); DB + token + discovery files are mode 600.
- **Isolation is physical**: one SQLite file per canonical git-root hash + one global file. A project cannot read another's file unless an agent **explicitly names it** (`memory_recall({project})`, read-only IDs and target-project cursor).
- **Do not store**: secrets, raw tool output/transcripts, PII, speculation. Keep records compact.

## Layout

`src/{contract,model,store,tools,sidecar,bridge,bootstrap,identity,namespace,redactor,clock}.ts` · `schema.sql` · `test/{store,sidecar,bridge,recovery,coalescing,roots-routing}.test.ts` · `test/smoke/README.md`
