# Roadmap: Runtime Portfolio Refresh

Status: IMPLEMENTED; REAL-RUNTIME QUALIFICATION PARTIAL
Source architecture: `docs/architecture.md`
Last updated: 2026-09-02

## Roadmap Principles

- Preserve the selected 25-target portfolio and limited DSH contract.
- Reuse the current adapter table and renderers; keep JSONC, TOML, and YAML handling as thin adapters over maintained libraries, not a new framework.
- Keep peer Grimoire review separate from runtime behavior, then verify the combined tree.
- Make generated-file proof and real-runtime proof explicit and distinct.
- Stop only for a material product decision or literal login/HITL requirement.

## Phase 0: Decision Closure and Baseline

Objective: freeze evidence, reproduce current defects, and isolate the peer delta.
Exit gate: portfolio decisions are documented; current branch and baseline failures are reproducible.

- [x] `P0.1` Inventory current portfolio and implementation
  - Files: `registry/targets.json`, `registry/target-capabilities.json`, `scripts/agent-surface/{targets,roots}.mjs`, adapter READMEs.
  - Output: pre-refresh registry and generated-host baseline, plus dirty-worktree ownership.
  - Evidence: live Git status/log/diff and registry parsing.

- [x] `P0.2` Research additions, lifecycle removals, and provider/runtime identity
  - Scope: DSH, Qoder, Qwen Code, Kiro, Copilot, Grok, Antigravity, Trae, VSCodium, Gemini CLI, Roo Code, iFlow, Z.ai, and next-wave candidates.
  - Output: primary-source evidence ledger in `docs/context/concept-zero.md`.
  - Evidence: official docs, repositories, releases, and local runtime probes dated 2026-08-31 and rechecked 2026-09-02.

- [x] `P0.3` Select concept and architecture
  - Files: `docs/context/concept-zero.md`, `docs/architecture.md`, `docs/roadmap.md`.
  - Output: selected 25-target portfolio, source ownership, interfaces, and proof boundaries.
  - Evidence: documents reconcile user decisions, current repo, and primary sources.

- [x] `P0.4` Review peer Grimoire delta at maximum effort
  - Files: exact `fc7fd4e..5dcc388` delta and affected Grimoire package/registry/doctor tests.
  - Scope: patch, security, logic, config, quality, performance, tests, docs, and dependencies; do not trust the peer handoff.
  - Acceptance evidence: finding list with file/line references; remote Grimoire tests and real multi-pack index/search; no unresolved reject-blocking finding.
  - If rejected: apply `dev-fix` only to confirmed defects, then re-review the changed delta.

- [x] `P0.5` Fix remote root-suite real-HOME leak
  - Files: `tests/suites/install.test.mjs` only unless root cause requires a test helper.
  - Scope: run the Goose user-scope dry-run against a disposable physical HOME rather than `/home/lizhao.1337` symlink state.
  - Acceptance evidence: pre-fix remote `npm test` fails at the known Goose dry-run; focused test and full root suite pass after the patch.

## Phase 1: Portfolio and Native Contracts

Objective: make registry and adapter contracts represent the selected portfolio before broad implementation.
Exit gate: all added/modified/retired IDs and render-token sets pass schema and coherence checks.

- [x] `P1.1` Update target lifecycle registry
  - Files: `registry/targets.json`, `registry/target-capabilities.json`, `schemas/targets.schema.json` only if current schema cannot express the decision.
  - Scope: add `dsh`, `qoder`, `qwen-code`, `kiro`; remove `vscodium`; add planned `amp`, `auggie`, `warp`, `crush`; add retired/out-of-scope lifecycle names.
  - Dependencies: `P0.3`.
  - Acceptance evidence: `node scripts/agent-surface.mjs check` reaches adapter-missing failures only until implementation lands, then passes.

- [x] `P1.2` Add native path functions and install roots
  - Files: `scripts/agent-surface/roots.mjs`.
  - Scope: pure user/project paths for four additions; current active paths for Grok, Copilot, Antigravity CLI, and Trae.
  - Dependencies: `P1.1`.
  - Acceptance evidence: focused roots tests cover both scopes and Windows path behavior only where existing root helpers already do.

- [x] `P1.3` Add only necessary native renderers
  - Files: `scripts/agent-surface/render.mjs`.
  - Scope: reuse vanilla skills and Claude-compatible agent format; add dedicated Qoder/Kiro/Copilot/Trae output only where official schemas differ.
  - Dependencies: `P1.1`.
  - Acceptance evidence: renderer output parses as the host's documented Markdown/JSON format and retains normalized access intent.

## Phase 2: Add Four Runtimes

Objective: implement full adapters for Qoder/Qwen/Kiro and the limited DSH adapter.
Exit gate: build/install/check pass and each target's native inventory sees the installed surfaces at the claimed boundary.

- [x] `P2.1` Implement DSH limited adapter
  - Files: `scripts/agent-surface/{targets,roots}.mjs`, `adapters/dsh/README.md`, registries, tests.
  - Scope: canonical and reviewed external skills under `.dsh/skills`; no manual commands, rules, agents, or MCP claim.
  - Implementation: complete; native DSH 0.1.1-rc.2 loaded the generated `ops-flow` skill during a real headless task.
  - Dependencies: `P1.1`, `P1.2`.
  - Acceptance evidence: pinned DSH clean-room native skill inventory lists an agent-surface skill; generated token set is exactly `skills,external`.

- [~] `P2.2` Implement Qoder adapter
  - Files: roots/targets/renderers, `adapters/qoder/README.md`, registries, focused tests.
  - Scope: skills, native commands, `AGENTS.md`/rules, custom agents, external skills, JSON MCP merge, full-access default only where host config supports it.
  - Dependencies: `P1.1` to `P1.3`.
  - Acceptance evidence: isolated `qoder` skill/agent/MCP inventory; exact task artifact when login is available, otherwise task execution `BLOCKED` with login path.
  - Implementation: complete; native skill/agent inventories and both MCP connections pass. Model task execution is blocked on `qodercli login`.

- [~] `P2.3` Implement Qwen Code adapter
  - Files: roots/targets/renderers, `adapters/qwen-code/README.md`, registries, focused tests.
  - Scope: skills, Markdown commands, `QWEN.md`/rules, native agents, external skills, JSON MCP merge.
  - Dependencies: `P1.1` to `P1.3`.
  - Acceptance evidence: `qwen` native inventory and headless task-shaped run with exact file bytes and MCP calls.
  - Implementation: complete; native Qwen 0.22.3 reports both connected MCPs and loads the generated configuration. Task execution is blocked before the first model turn because no authentication type is currently configured.

- [~] `P2.4` Implement Kiro adapter
  - Files: roots/targets/renderers, `adapters/kiro/README.md`, registries, focused tests.
  - Scope: skills, manual/always/fileMatch steering, v3 custom agents, user capability permissions, external skills, `settings/mcp.json`; no hooks/powers/spec generation.
  - Dependencies: `P1.1` to `P1.3`.
  - Acceptance evidence: Kiro CLI native context/agent/MCP inventory; task execution when login is available.
  - Implementation: complete; Kiro IDE and CLI are installed and generated surfaces pass isolated gates. Native inventory/task execution is blocked on `kiro-cli login`.

## Phase 3: Upgrade and Retire Existing Targets

Objective: remove stale routes and expose current native surfaces without widening unrelated targets.
Exit gate: each known pre-fix failure discriminates and passes after the smallest patch.

- [x] `P3.1` Upgrade Copilot to CLI/Agent Host
  - Files: Copilot adapter/roots/renderers/registries/tests/docs.
  - Scope: add `~/.copilot/agents`, `~/.copilot/mcp-config.json`, preserve current skills and still-consumed VS Code instructions.
  - Acceptance evidence: `copilot` native skills/agents/MCP inventory and task-shaped run when authenticated.
  - Implementation: complete; native Copilot loaded `ops-flow`, called Grimoire, and completed a real Synapse write after the `supersedes: 0` compatibility fix.

- [x] `P3.2` Migrate Grok Build to TOML
  - Files: Grok adapter/roots/merge mapping/tests/docs.
  - Scope: replace ignored `.grok/settings.json` with current user/project `config.toml`; no generic TOML framework beyond the documented `mcp_servers` shape.
  - Acceptance evidence: isolated pre-fix `grok inspect` has no generated MCP; post-fix inspect names both first-party MCP servers from the intended Grok config.
  - Implementation: complete; native `grok inspect --json` sees 132 skills, both MCPs, and no project permission override.

- [x] `P3.3` Repair Antigravity CLI plugin discovery
  - Files: Antigravity CLI roots/adapter/tests/docs.
  - Scope: write to active CLI staged plugin root while preserving separate desktop target behavior.
  - Acceptance evidence: pre-fix plugin validates but is absent from `agy plugin list`; post-fix plugin is listed and its skills/agents/MCP inventory is visible.
  - Implementation: complete; native `agy plugin validate`, `install`, and `list` report 103 skills, six agents, and both MCPs.

- [~] `P3.4` Add Trae IDE/CLI native routes
  - Files: Trae roots/target/renderer/registry/tests/docs.
  - Scope: dual IDE/CLI skills and agents, current native rules, IDE/CLI MCP, and CLI execution policy; no provider management.
  - Acceptance evidence: generated agent definitions match current schema; live IDE discovery remains HITL if no headless inventory exists.
  - Implementation: complete; TraeCode CLI 0.201.6 lists both MCPs from generated TOML. Skill inventory/task execution and IDE discovery remain login/HITL-bound.

- [x] `P3.5` Retire VSCodium
  - Files: target table, roots, registries, adapter directory, docs, tests.
  - Scope: remove dedicated generated output and record lifecycle rationale; do not alter VS Code.
  - Acceptance evidence: full-sync regression removes seeded VSCodium-owned files/routes and preserves an unowned sibling.

- [x] `P3.6` Repair local Kilo configuration residue
  - Files: no repository production code unless evidence shows agent-surface owned the keys.
  - Scope: remove or migrate obsolete user-owned `subagent_model` / `subagent_variant_overrides` after backup; do not build a migration engine for foreign keys.
  - Acceptance evidence: a backup was taken, only the two rejected keys were removed, and `kilo agent list --pure` exits successfully on 7.2.52.

## Phase 4: Combined Review and Proof

Objective: prove the combined peer + portfolio tree and fix only confirmed findings.
Exit gate: deterministic gates pass remotely; runtime status is explicit per target; no unresolved Critical/High finding.

- [x] `P4.1` Run `qa-self-critique` on modified files
  - Scope: incomplete work, type/logic drift, architecture duplication, substitute violations, and repo-defined format/check gates.
  - Acceptance evidence: fixes applied and focused tests remain green.

- [x] `P4.2` Run independent `qa-review`
  - Scope: complete changed diff plus peer Grimoire delta, one domain pass at a time.
  - Acceptance evidence: ACCEPTED, or a bounded finding state handed to `dev-fix`.

- [x] `P4.3` Apply minimal `dev-fix` loop
  - Scope: only confirmed review findings; regression must fail before patch when feasible.
  - Acceptance evidence: finding-specific RED -> GREEN plus impacted remote suites; repeat review until accepted or push back on scope inflation.

- [x] `P4.4` Run deterministic remote gates
  - Commands: `npm run check`, `npm test`, `npm run check:generated`, `npm run build -- --target all`, `git diff --check`, `npm pack --dry-run --json`; Grimoire and Synapse package tests under their required Node version.
  - Acceptance evidence: exact pass/fail output. Existing unrelated failures remain named rather than hidden.

- [~] `P4.5` Run native runtime probes
  - Scope: all added/modified targets plus representative retained targets; use disposable roots and real binaries.
  - Acceptance evidence: native discovery, MCP list/call where claimed, task-shaped exact artifact, and cleanup. Human login is requested only when the runtime literally requires it.

## Phase 5: Documentation, Distribution, and Handoff

Objective: make the refreshed portfolio usable without stale counts or claims.
Exit gate: docs, generated output, local distribution, and manifests agree with the accepted portfolio.

- [x] `P5.1` Synchronize user documentation
  - Files: `README.md`, `docs/reference/targets.md`, adapter READMEs, `CHANGELOG.md`, architecture count references.
  - Acceptance evidence: no stale 22/19/VSCodium/Gemini-era claims; every target row links to its real adapter contract.

- [x] `P5.2` Distribute default, optional, and server categories to implemented targets
  - Scope: use the repository installer after all gates/review pass; preserve unrelated user config and dirty external work.
  - Acceptance evidence: 25 active targets plus retired VSCodium cleanup installed with zero blockers; the next full install was byte-idempotent (`wrote=0`, `removed=0`, `merges=0`); native Antigravity validation still reports 103 skills, six agents, and two MCPs.

- [x] `P5.3` Prepare publication handoff
  - Scope: no automatic commit in `dev-feature`; report changed files, checks, runtime proof, review state, and remaining login blockers to `ship-commit`.
  - Acceptance evidence: one coherent accepted diff; peer external submodule dirt remains untouched.

## Later / Not Now

### Deferred MCP Configuration (2026-09-05)

The selected distribution includes all asset categories but only Synapse and Grimoire. Kilo's measured all-enabled startup cost is accepted; no further context optimization is requested. These external-service gaps do not block the selected profile:

- The service registry distributes stdio command/args plus resolved launch paths and local credential references (env-file delivery through the shared launcher). Arbitrary per-application settings are still not modelled.
- OpenOSINT is installed and wired by agent-surface (uv, the application, its provider extras, and the `holehe` / `sublist3r` / `sherlock` lookup binaries in its own tool environment; `phoneinfoga` via Homebrew where a package exists). Its MCP entry point still does not read `.env` itself — the shared launcher supplies the values instead. Shodan, VirusTotal, AbuseIPDB and IP2Location are verified end-to-end; Censys and GitHub are rejected under the tested configuration; HIBP and IPinfo have no values. `investigate_multi` remains the one tool pinned to a single model backend.
- IDA Pro MCP's configured executable is missing; licensed `idalib` readiness remains unverified.
- Pentest-AI's executable is missing. Its MCP client supplies the model, so a separate LLM key is not the missing configuration. Installation and activation remain deferred.

### Runtime Candidates

- Amp: strong skills, subagents, and skill-scoped MCP; revisit after a real CLI probe.
- Auggie: strong plugin/skills/MCP surface but currently beta; revisit with account access.
- Warp: strong local/cloud agent product, but account-synced configuration needs an ownership design before file generation.
- Crush: supports skills and MCP, but current executable `crushrc` is not a simple shared config merge; wait for a stable declarative route or a proven fragment mechanism.
- DSH MCP/plugin/agent profiles: wait for stable workspace-scoped configuration.
- Gemini CLI, Roo Code, and iFlow CLI: no re-entry without a material upstream lifecycle reversal.

## Cross-Phase Gates

- [x] Architecture source tree and portfolio counts stay synchronized before each implementation phase.
- [x] Config and frontmatter syntax is delegated to maintained JSONC, TOML, and YAML libraries.
- [x] Added and modified targets have primary-source evidence dated in the current refresh.
- [x] Generated output never substitutes for native discovery or task-shaped acceptance.
- [x] Intentional dirty submodules remain untouched unless the user separately scopes them.
