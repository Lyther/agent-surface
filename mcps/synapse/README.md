# synapse

Local-first **shared memory + file-lock coordination** MCP for coding agents working on one machine. Each host session starts its own stdio server, and all of them share the SQLite files under `~/.synapse`. On Claude Code, Codex and Droid, a PostToolUse hook also hands each session the records other agents wrote since its last tool call.

- **Design**: [architecture.md](architecture.md) (source of truth) · [roadmap.md](roadmap.md) · [concept-zero.md](concept-zero.md) (historical)
- **Stack**: TypeScript, `@modelcontextprotocol/sdk` `>=1.24.0 <2`, `node:sqlite` (WAL). Node **>=22.17**.

## What it does

| Tool | Purpose |
|---|---|
| `memory_remember` | store a durable fact/decision/lesson (project default; `global:true` for cross-project) |
| `memory_recall` | FTS search, **compact + byte-budgeted**, `since` cursor, optional read-only cross-`project` read (`mode:full` for complete cross-project content) |
| `memory_get` | expand specific local/global ids to full content |
| `memory_forget` | scrub a stale or leaked record (the row stays for audit; its content becomes a tombstone) |
| `lock_acquire` / `lock_release` / `lock_list` | advisory file leases (TTL, auto-reap, in-band conflict hints) |

### Delivery after each tool call

`synapse-hook` runs after every tool call on Claude Code, Codex and Droid. It prints the records this session (or subagent) has not been handed yet, under a header that marks them as untrusted data, and the host adds them to the model's context:

- Each record reaches a session once. The first hook run in a session only records where it starts, so records written before that arrive through `memory_recall`.
- A run carries at most 8 KiB; the rest arrive with later tool calls, and the text says how many remain. A record longer than the budget arrives as a snippet whose id `memory_get` expands.
- The record a session's own `memory_remember` returned is not handed back to it.
- The hook stays silent in a project where no agent has used Synapse, and when nothing is new.

Other hosts, and idle sessions on any host, see new records through `memory_recall({since})`.

## Run

```sh
npm install && npm run build
npm test            # store, real server processes, the hook on recorded host payloads
node install.mjs    # link synapse-bridge and synapse-hook into ~/.local/bin
```

Point any MCP host at `synapse-bridge` (stdio). It needs no token, URL or env:

```jsonc
// generic MCP host config (Cursor ~/.cursor/mcp.json, Claude Code `claude mcp add`, etc.)
{ "mcpServers": { "synapse": { "command": "~/.local/bin/synapse-bridge" } } }
```

Optional env: `SYNAPSE_AGENT_ID` (provenance label; a lock belongs to one server process, so sessions sharing the label still hold separate leases, and a crashed session's leases expire with their TTL, 30 minutes by default), `SYNAPSE_PROJECT` (pin a repo root), `SYNAPSE_ROOTS=ignore` (skip MCP roots; see below), `SYNAPSE_NAMESPACE`, `SYNAPSE_DB_DIR` (default `~/.synapse`). The hook reads `SYNAPSE_DB_DIR`, `SYNAPSE_PROJECT` and `SYNAPSE_NAMESPACE` the same way. `install` copies the ones set in the `synapse` MCP entry into the hook command, so rerun it after changing them, and write them as literal values: a host that expands `${VAR}` for the server leaves it unexpanded in the hook command. Codex withholds the shell's environment from MCP servers but not from hooks, so its generated entry lists the three in `env_vars`, and a value exported in the shell reaches the server as it reaches the hook. On Windows, set them in the environment that starts the host instead.

### Project routing

The namespace resolves as: **`SYNAPSE_PROJECT`** (a path) → else the **git root of the server's working directory** → else `default`. Hosts start the stdio server with the open workspace as cwd, so the git-root default isolates projects automatically; set `SYNAPSE_PROJECT` only for hosts that launch outside the repo or to force a specific root. A host that advertises MCP roots routes by its first root instead, and a failed or timed-out `roots/list` stops the server rather than guess from cwd. FastMCP's multi-server proxy advertises roots it cannot serve outside a request, so the installer sets `SYNAPSE_ROOTS=ignore` only on hosts verified to start the server in the workspace: OpenHands, where the key is the launch directory (a session whose `OPENHANDS_WORK_DIR` names another directory needs `SYNAPSE_PROJECT`), and Deep Agents Code project installs not rooted at the home directory. Any other non-empty value stops the server. The hook never sees MCP roots, so it routes by `SYNAPSE_PROJECT`, then the session's cwd.

## Distribution

`synapse` ships through the agent-surface registry as a **first-party MCP** (no submodule pin):

1. **`npm run install:synapse`** (repo root) builds synapse and links `synapse-bridge` and `synapse-hook` into `~/.local/bin`; the databases under `~/.synapse` persist. There is no service on any platform. The installer also removes what v0.4 left behind: it stops a running v0.4 sidecar, deletes the `synapse-sidecar` link and `~/.synapse/{sidecar.json,sidecar.lock,token}`, and on macOS retires the `local.synapse` launchd agent. When a v0.4 sidecar does not answer within a second or reports another pid, the installer stops nothing and warns; stop that process yourself.
2. **`agent-surface build` / `install`** writes or safely merges the `synapse` stdio entry into all 25 generated MCP hosts; [docs/reference/targets.md](../../docs/reference/targets.md) is the per-host matrix. For Claude Code, Codex and Droid it also merges one PostToolUse entry that runs `~/.local/bin/synapse-hook`, beside any hooks already there: `.claude/settings.json`, `.codex/hooks.json`, and `.factory/hooks.json` (or `.factory/settings.json` when that file holds the hooks and `hooks.json` does not exist), under the user's home or the project. A rerun changes nothing. The Codex entry also approves Synapse's tools by default, because the generated `approval_policy = "never"` refuses any MCP call that needs approval.
3. **Codex**: trust the hook once with `/hooks` in an interactive session. Codex runs an untrusted hook nowhere, and the entry stays the same across Synapse upgrades.
4. **External or secret-bearing MCPs** remain opt-in: a non-first-party MCP service renders only when requested with `--category mcps --service <id>`.
5. **Update** = re-run step 1, then step 2, then restart host sessions: a running session keeps the server it started with until it exits.

### Coverage boundary

Antigravity desktop and DSH intentionally have no generated Synapse route. Use the Antigravity CLI plugin target for that family; DSH remains skills-only while its developer-preview profile contract changes. All other implemented targets are represented in the generated matrix. Only Claude Code, Codex and Droid get the hook; the other hosts recall explicitly.

## Host acceptance

`node mcps/synapse/scripts/host-acceptance.mjs [claude[=model]] [codex[=model]] [droid[=model]]` (after `npm run build`; droid needs `FACTORY_API_KEY`) runs each host headless in a temp project with the hook registered at project scope and no Synapse MCP server. Another agent writes a random marker while the session sleeps; PASS means the session repeats the marker, its cursor has passed it, and one more hook run prints nothing. Rerun it when a host's major version changes.

| Host | Version | Result (2026-11-05) |
|---|---|---|
| Claude Code | 2.1.309 | PASS (`claude -p`, sonnet) |
| Codex | codex-cli 0.166.0 | PASS (`codex exec --dangerously-bypass-hook-trust`, gpt-6-luna) |
| Droid | 1.2.0 | PASS (`droid exec`, deepseek-v4.1-flash) |

Interactive sessions load the same hook files as these headless runs, per each host's hook documentation: Claude Code reads its settings files in both modes; Codex reads `hooks.json` in both but runs a hook only once it is trusted (step 3); Droid reads `hooks.json`, or `settings.json` without it, in both.

## Troubleshooting

- `agent-surface doctor` reports whether `synapse-bridge` and `synapse-hook` are linked and whether each of the three hosts' user-scope files holds the hook entry.
- No records after tool calls: check that another agent has written in this project (`memory_recall`), that this session has made at least two tool calls since that write (the first sets its starting point), and on Codex that the hook is trusted.
- A hook failure exits 1 with one `[synapse-hook] <reason>` line on stderr; hosts show it and carry on, and it never blocks the tool call.

## Security / threat model

- **Local only**: stdio between a host and its own server process; nothing listens on the network, and no token or discovery file exists.
- **Identity is provenance, not auth**: derived per session; cooperative single-user trust. It does **not** defend against a hostile same-user process, which is out of scope for a local dev tool.
- **Stored content is untrusted data**, returned as quoted JSON or under the hook's untrusted-data header and never as instructions; tool descriptions are static. Agents must treat recalled memory as evidence, never commands (poisoning defense; see MINJA).
- **No secrets**: content is stored as written, so agents are told never to store secrets, and `memory_forget` scrubs a leaked record. The data directory is owner-only (mode 700, an owner-only ACL on Windows); DB files are mode 600.
- **Isolation is physical**: one SQLite file per canonical git-root hash + one global file. A project cannot read another's file unless an agent **explicitly names it** (`memory_recall({project})`, read-only IDs and target-project cursor).
- **Do not store**: secrets, raw tool output/transcripts, PII, speculation. Keep records compact.

## Layout

`src/{contract,model,store,tools,server,hook,identity,namespace,fsguard,clock}.ts` · `schema.sql` · `scripts/host-acceptance.mjs` · `test/{store,server,multiprocess,hook,roots-routing}.test.ts` · `test/fixtures/hooks/` (recorded host payloads)
