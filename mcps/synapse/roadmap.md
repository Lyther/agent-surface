# Roadmap

Status: IMPLEMENTED (v0.5.0)
Source architecture: [architecture.md](architecture.md)
Last updated: 2026-11-05

v0.4 shipped as `synapse-v0.4.0`; its history is in git. This plan replaces its machinery. Grimoire's changes are in [../grimoire/roadmap.md](../grimoire/roadmap.md). Both land in one PR, in the order set in [docs/roadmap.md](../../docs/roadmap.md#phase-mcp-s-synapse-and-grimoire-simplification).

## Roadmap Principles

- Keep the tools and the data. Remove the machinery first, then add the hook.
- Every acceptance step is a command. A host that can't be driven headless gets a scripted interactive run, never a manual step.
- One host event (PostToolUse), one reader, and one registration module.

## Phase S0: Decisions and Spikes

Objective: settle what the hook depends on before building it.
Exit gate: ADR-16 and ADR-17 are accepted or defaulted, the payload fixtures are committed, and the hook cost is recorded.

- [x] `S0.1` Spike: capture real PostToolUse payloads and check what the model sees. Done 2026-11-05: all three hosts pass; findings under Evidence in architecture.md.
  - Why now: `hook.ts` parses these fields, and the shapes of subagent events and MCP results are undocumented.
  - Scope:
    - Set up a temp project with a temp `SYNAPSE_DB_DIR`.
    - Register a logging hook at project scope. It saves stdin and returns a random static marker as `additionalContext`.
    - Run `claude -p`, `codex exec --dangerously-bypass-hook-trust` and `droid exec` once each.
    - Use one prompt that runs a shell command, a `memory_remember` and, where the host has one, a subagent, then asks the model to repeat any marker it received.
  - Output:
    - `test/fixtures/hooks/<host>-{shell,mcp,subagent}.json`, with secrets and home paths removed;
    - per host, whether hooks fire in headless runs and whether the model repeats the marker;
    - per host, what an exit code of 1 does.
  - Acceptance evidence: the fixtures exist, and the notes record how each host identifies subagent events, or that it doesn't.
  - If it fails:
    - A host that doesn't run hooks in headless runs moves to S3.2's scripted interactive run.
    - A host that doesn't show the model the added context is dropped from the three, with that evidence recorded.
- [x] `S0.2` Decide ADR-16, the first-run baseline. Accepted: the default.
  - Default: a receiver's first hook run sets its cursors to the current max ids and delivers nothing.
  - Spike: using S0.1, check whether every host sends a `transcript_path` whose file creation time matches the session start. If all three do, the first run instead delivers rows with `ts` at or after that time.
  - Output: ADR-16 accepted in architecture.md.
- [x] `S0.3` Decide ADR-17, the Codex trust route. Accepted: option (a).
  - Options:
    - (a) the user trusts the hook once through `/hooks` after install, and the install prints that step;
    - (b) a managed hook in `requirements.toml`, which Codex trusts by policy. This spike also finds out where that file lives and who can write it.
  - Ruled out:
    - writing Codex's private trust store;
    - adding `--dangerously-bypass-hook-trust` to normal use, which skips review for every hook.
  - Output: ADR-17 accepted. S4.1 updates the README and install output to match.
- [x] `S0.4` Measure the hook's cost. Measured on the real hook after S2.2; numbers under Risks in architecture.md.
  - Scope: a stub `hook.ts` that resolves the namespace, opens the store and checks max ids, run 100 times on this machine with a project DB and 100 times without one.
  - Output: p50 and p95, recorded under Q-04. If imports dominate the time, keep zod and the SDK out of the hook's imports.
- [x] `S0.5` ADR-13 accepted by the user on 2026-11-04: no tool-result fallback.

## Phase S1: Direct Stdio Server

Objective: one server per session over the existing DBs, with the sidecar machinery gone.
Exit gate: a host config that runs `synapse-bridge` gets 7 tools and a working round trip with no sidecar process running, and `npm test` in `mcps/synapse` passes.

- [x] `S1.1` Add `server.ts`.
  - Files: `src/server.ts` (new), `package.json` bins.
  - Scope:
    - a stdio server with `SERVER_INSTRUCTIONS` and the seven tools via `tools.ts`;
    - session context from routing: env, then roots, then cwd, keeping `bridge.ts`'s fail-closed and `SYNAPSE_ROOTS` rules;
    - identity from env, then clientInfo;
    - lock owner `agentId#pid`.
  - Acceptance evidence: `server.test.ts` (spawned process) shows tools/list returns 7 tools, remember→recall works, and the server exits when stdin closes; the ported `roots-routing.test.ts` passes.
- [x] `S1.2` Trim the store, tools, contract and model.
  - Scope:
    - remove operation records, replay and the `operationId` parameters;
    - remove `onCommit`, the redactor call, `SIDECAR_FEATURES`, `OPERATION_*` and the `redactions` result;
    - stop creating the `operations` table; v0.4 files keep it for one release, so a v0.4 sidecar that outlives the upgrade keeps writing;
    - keep `memory_forget`'s scrub.
  - Acceptance evidence: `store.test.ts` passes without the deleted cases. A v0.4 fixture DB, built with the v0.4 schema and holding `operations` rows, opens with every memory, lock and `operations` row intact, and a v0.4 connection still writes memory and `operations` rows after the new store has opened and written.
- [x] `S1.3` Delete the sidecar path.
  - Files to delete: `src/{sidecar,bridge,bootstrap,redactor}.ts`, `test/{sidecar,bridge,coalescing,recovery}.test.ts`, `test/smoke/README.md`.
  - Acceptance evidence: `tsc` is clean, and `rg -n "sidecar|SYNAPSE_URL|SYNAPSE_TOKEN|SYNAPSE_PORT|operation" mcps/synapse/src` finds nothing.
- [x] `S1.4` Prove the shared store across processes (Q-03).
  - Files: `test/multiprocess.test.ts`.
  - Scope:
    - Four real server processes on one temp DB dir write concurrently, and one is killed with SIGKILL while its writes are in flight.
    - The surviving processes and a fresh one see every acknowledged row, and the full-text index matches the memory table.
    - A lease acquired after waiting on another process's write runs its full TTL from when the write lock was won.
    - A lock held by one process is refused to another until it is released or expires.
  - Acceptance evidence: the test passes.
- [x] `S1.5` Hand over from v0.4 at install.
  - Files: `install.mjs`.
  - Scope:
    - clean `dist` before the build, so no stale `sidecar.js` remains;
    - link `synapse-bridge`, plus `synapse-hook` once S2.2 exists;
    - remove the `synapse-sidecar` link;
    - stop a running v0.4 sidecar with `stop-sidecar.mjs`;
    - delete `~/.synapse/{sidecar.json,sidecar.lock,token}`.
  - Acceptance evidence: after `install.mjs` runs with a disposable `HOME`, both links exist, the `synapse-sidecar` link is gone, and none of the three files remain. The disposable `HOME` has no LaunchAgents plist, so nothing calls `launchctl`.

## Phase S2: Hook Delivery

Objective: G-01 on Claude Code, Codex and Droid.
Exit gate: `hook.test.ts` passes on the recorded payloads, and installs register the hook idempotently.

- [x] `S2.1` Add `hook_cursors` and `claimUnseen` to `store.ts`.
  - Acceptance evidence: store tests show that:
    - the first claim sets the baseline;
    - later claims return only newer live rows from both stores;
    - the session's own id is skipped, also when the byte budget stops a claim before reaching it;
    - concurrent claims from separate processes deliver each row once (Q-02).
- [x] `S2.2` Add `hook.ts` and the `synapse-hook` bin.
  - Acceptance evidence: `hook.test.ts`, run on each host's fixtures, shows that the hook:
    - stays silent with no DB, and when nothing is new;
    - delivers a new record once, then stays silent;
    - delivers a budget overflow over later runs;
    - gives a Claude Code subagent its own receiver;
    - exits 1 with one stderr line on malformed stdin.
- [x] `S2.3` Register the hook through agent-surface.
  - Files:
    - `scripts/agent-surface/synapse-hook.mjs` (new);
    - the call site in `install.mjs`;
    - `doctor.mjs`;
    - the Synapse wiring text in `registry/optional-services.json`;
    - `tests/suites/install.test.mjs`.
  - Scope:
    - user and project scope paths;
    - an idempotent merge that preserves other hooks;
    - removal of only this entry when Synapse is deselected;
    - the Droid file rule;
    - the change listed in dry-run output.
  - Acceptance evidence: install tests show that:
    - merging into settings that already hold user hooks keeps them;
    - re-running produces no diff;
    - for Droid, when `settings.json` has hooks and there is no `hooks.json`, the entry goes into `settings.json`;
    - removing the entry leaves the user's hooks in place.

## Phase S3: Host Acceptance

Objective: Q-01 through each host's real hook loader, with no person in the loop.
Exit gate: each of the three hosts is PASS, or BLOCKED with the exact blocker (for example Codex trust under ADR-17 option (a)).

- [x] `S3.1` Write `scripts/host-acceptance.mjs`.
  - Setup: a temp project with the hook registered at project scope and a temp `SYNAPSE_DB_DIR`. B has no Synapse MCP server.
  - Run: B's prompt runs `echo start`, then `sleep 8`, then `echo done`, then prints any Synapse record text it received. A waits until B's first hook run has created B's `hook_cursors` row, then writes `SYN-<random>` through `synapse-bridge`, so the marker lands after B's baseline and during the sleep.
  - Pass: B's final output contains the marker; B's `hook_cursors` row is at or past the marker's id; and running `synapse-hook` once more with B's session id prints nothing.
  - Acceptance evidence: one run per host, with the host version and result recorded in the README.
- [x] `S3.2` Check interactive parity.
  - Scope: from S0.1 and host docs, state whether interactive sessions load the same hook config. If a host's interactive mode differs, drive it through a PTY (tmux) in the same script.
  - Acceptance evidence: a parity note per host, or a scripted interactive PASS.

## Phase S4: Docs and Hand-off

- [x] `S4.1` Update the docs:
  - README: setup, which hosts get delivery, the Codex step if one remains, upgrading and restarting, troubleshooting;
  - architecture.md: status IMPLEMENTED, with proofs;
  - concept-zero.md: a line marking it superseded;
  - a CHANGELOG entry;
  - a hook note for the three targets in `docs/reference/targets.md`.
- [x] `S4.2` Pass the integration gate in [docs/roadmap.md](../../docs/roadmap.md#phase-mcp-s-synapse-and-grimoire-simplification).

## Later / Not Now

- Delete `stop-sidecar.mjs` and the hand-over, and drop v0.4's `operations` table, one release after this ships.
- Add idle wake for Claude Code through `asyncRewake`, if a workflow needs an idle agent to react unprompted.
- Add Pi and OpenCode adapters through their native extension APIs, if those hosts run alongside others.
- Add a tool-result fallback, if ADR-13 is revisited.
- Deliver lock events, if agents miss lock releases in practice.
- Private visibility stays deferred.

## Cross-Phase Gates

- [x] At the start of each phase, the architecture's source tree matches the actual tree.
- [x] No new dependency: `node:sqlite`, the MCP SDK and zod are already present.
- [x] Acceptance claims cite command runs as passed, failed or not run.
