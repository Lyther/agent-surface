# Per-Target Transport Smoke Runbook (T2.5)

Goal: before documenting a host as "synapse wired", prove `synapse-bridge` actually runs
under that host — tools/list resolves, a remember→recall round-trip works, and a peer
write's `resources/updated` push arrives. This is the per-host acceptance floor; the
in-process bridge test (`test/bridge.test.ts`) covers the transport generically, but each
host has its own MCP config shape and launch cwd, so a recorded pass per host is required.

## Prerequisites

- `sh install.sh` has run: `~/.local/bin/synapse-bridge` and `~/.local/bin/synapse-sidecar`
  exist, the launchd sidecar is up, and `curl http://127.0.0.1:4319/health` returns
  `{"ok":true}`.
- The host's MCP config has been generated/merged by
  `node scripts/agent-surface.mjs install --target <host> --category mcps` (first-party
  `synapse` entry only; external/secret-bearing MCPs stay opt-in).

## Per-host check (run once per target before marking it wired)

For each host below, launch a fresh agent session **in a real project directory** (so the
bridge derives the right project namespace) and run these three steps from inside the host:

1. **tools/list** — the host's MCP status / tool inventory lists 7 synapse tools
   (`memory_remember`, `memory_recall`, `memory_get`, `memory_forget`,
   `lock_acquire`, `lock_release`, `lock_list`). If fewer than 7 appear, the bridge did
   not connect to the sidecar.
2. **remember → recall round-trip** — call `memory_remember({content:"smoke: <host>"})`,
   then `memory_recall({query:"smoke"})`; the record must return with matching `agentId`
   and `store:"project"`.
3. **realtime push** — in a second session of the same host on the same project,
   subscribe to the project changes resource; from the first session write a record; the
   subscriber must receive `resources/updated` (push). If the host ignores push, the
   cursor-pull floor (`memory_recall({since})`) must still return the new record.

## Host matrix

The **config-merge** column is proven by `tests/agent-surface.test.mjs` (non-destructive
merge + idempotent re-merge for every host below). The **transport** columns are the live
per-host smoke that this runbook governs: run the three steps above in each host and
record the result. A host is **wired** only when all three transport columns pass; until
then it is **config-verified** (the synapse entry is correctly generated/merged) but
**transport-pending**.

| Host | MCP config (generated/merged) | config-merge | tools/list | round-trip | push | Status |
|---|---|---|---|---|---|---|
| droid | `.factory/mcp.json` `mcpServers.synapse` | ✅ tested | ✅ | ✅ | ✅ | wired (in-process bridge test) |
| deepagents | `.deepagents/.mcp.json` `mcpServers.synapse` | ✅ tested | ✅ | ✅ | ✅ | wired (in-process bridge test) |
| claude-code | `.mcp.json` / `~/.claude.json` `mcpServers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| codex | `.codex/config.toml` `mcp_servers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| cursor | `.cursor/mcp.json` `mcpServers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| gemini-cli | `.gemini/settings.json` `mcpServers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| cline | `.cline/mcp.json` `mcpServers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| kilo | `kilo.jsonc` `mcp.synapse` | ✅ tested | pending | pending | pending | config-verified |
| opencode | `.opencode/opencode.json` `mcp.synapse` | ✅ tested | pending | pending | pending | config-verified |
| vscode | `mcp.json` `servers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| trae | `.trae/mcp.json` `mcpServers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| windsurf | `.windsurf/mcp_config.json` (project) / `~/.codeium/windsurf/mcp_config.json` (user) `mcpServers.synapse` | ✅ tested | pending | pending | pending | config-verified |
| zed | `.zed/settings.json` `context_servers.synapse` | ✅ tested | pending | pending | pending | config-verified |

The in-process `test/bridge.test.ts` proves the stdio bridge transport generically
(tools/list, remember→recall proxy, forwarded `resources/updated`) under a spawned
bridge subprocess; the per-host live smoke above confirms each host's specific launch
cwd and config shape do not break that transport. Until a host's live smoke is recorded,
its documentation must say "config-verified, transport-pending" rather than "wired".

## Out-of-workspace launch (P4.3)

Hosts that launch stdio servers outside the workspace (e.g. some IDEs spawn MCP servers
from the user home) must still isolate to the right project. The bridge resolves the
project key from, in order: `SYNAPSE_PROJECT` env → the host's first MCP root (`file://`
URI) → cwd git-root. Verify by launching the host with a workspace root that differs from
the bridge spawn cwd and confirming the write lands in the workspace-derived project DB
(`~/.synapse/<hash>.sqlite` for the workspace, not the spawn-cwd hash).

## Pending targets (P3.4)

Not yet wired; recorded reasons:

- **Antigravity CLI/desktop** — plugin MCP shape under investigation; use the
  `antigravity-cli` target for plugin assets until a verified merge path lands.
- **Poolside** — settings-YAML safe merge not yet implemented (YAML merge producer needed).
- **Copilot CLI** — MCP surface not yet exposed by the runtime.
- **VSCodium** — extension/MCP policy parity with VS Code under review.
- **Goose / Grok Build / Pi** — MCP surface not yet verified.

When one of these lands a verified merge path, add a row to the matrix above and a
per-host pass record.
