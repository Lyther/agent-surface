# Per-Target Transport Smoke Runbook (T2.5)

Goal: before documenting a host as "synapse wired", prove `synapse-bridge` actually runs under that host — tools/list resolves, a remember→recall round-trip works, and a peer write's `resources/updated` push arrives. This is the per-host acceptance floor; the in-process bridge test (`test/bridge.test.ts`) covers the transport generically, but each host has its own MCP config shape and launch cwd, so a recorded pass per host is required.

## Prerequisites

- `node install.mjs` has run: `~/.local/bin/synapse-bridge` and `~/.local/bin/synapse-sidecar` exist, the launchd sidecar is up, and `curl http://127.0.0.1:4319/health` returns `{"ok":true}`.
- The host's MCP config has been generated/merged by `node scripts/agent-surface.mjs install --target <host> --category mcps` (first-party `synapse` entry only; external/secret-bearing MCPs stay opt-in).

## Per-host check (run once per target before marking it wired)

For each host below, launch a fresh agent session **in a real project directory** (so the
bridge derives the right project namespace) and run these three steps from inside the host:

1. **tools/list** — the host's MCP status / tool inventory lists 7 synapse tools (`memory_remember`, `memory_recall`, `memory_get`, `memory_forget`, `lock_acquire`, `lock_release`, `lock_list`). If fewer than 7 appear, the bridge did not connect to the sidecar.
2. **remember → recall round-trip** — call `memory_remember({content:"smoke: <host>"})`, then `memory_recall({query:"smoke"})`; the record must return with matching `agentId` and `store:"project"`.
3. **realtime push** — in a second session of the same host on the same project, subscribe to the project changes resource; from the first session write a record; the subscriber must receive `resources/updated` (push). If the host ignores push, the cursor-pull floor (`memory_recall({since})`) must still return the new record.

## Host matrix

Config merge is proven by the repo-root `tests/suites/install.test.mjs`; current paths live in [`docs/reference/targets.md`](../../../../docs/reference/targets.md). The columns below record the separate native transport proof. A host is wired only when all three transport columns pass.

| Host | tools/list | round-trip | push | Status / evidence |
|---|---|---|---|---|
| Antigravity CLI | | | | config-verified |
| Claude Code | | | | config-verified |
| Cline | | | | config-verified |
| Codex | | | | config-verified |
| GitHub Copilot | | | | config-verified |
| Cursor | | | | config-verified |
| Deep Agents Code | | | | config-verified |
| Droid | | | | config-verified |
| Goose | | | | config-verified |
| Grok Build | | | | config-verified |
| Kilo | | | | config-verified |
| Kimi Code | | | | config-verified |
| Kiro | | | | config-verified |
| OpenCode | | | | config-verified |
| OpenHands | | | | config-verified |
| Poolside | | | | config-verified |
| Qoder | | | | config-verified |
| Qwen Code | | | | config-verified |
| Trae | | | | config-verified |
| VS Code | | | | config-verified |
| Windsurf | | | | config-verified |
| Zed | | | | config-verified |

The in-process `test/bridge.test.ts` proves the stdio bridge transport generically (tools/list, remember→recall proxy, forwarded `resources/updated`) under a spawned bridge subprocess; the per-host live smoke above confirms each host's specific launch cwd and config shape do not break that transport. Until a host's live smoke is recorded, its documentation must say "config-verified, transport-pending" rather than "wired".

## Out-of-workspace launch (P4.3)

Hosts that launch stdio servers outside the workspace (e.g. some IDEs spawn MCP servers from the user home) must still isolate to the right project. The bridge resolves the project key from, in order: `SYNAPSE_PROJECT` env → the host's first MCP root (`file://` URI) → cwd git-root. Verify by launching the host with a workspace root that differs from the bridge spawn cwd and confirming the write lands in the workspace-derived project DB (`~/.synapse/<hash>.sqlite` for the workspace, not the spawn-cwd hash).

## Coverage boundary

Antigravity desktop, DSH, and Pi intentionally have no generated Synapse route. Use the Antigravity CLI target for that family; DSH remains skills-only; Pi has no verified declarative stdio MCP config. Add a row only when the canonical capability matrix gains a generated route.
