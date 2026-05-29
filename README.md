# agent-surface

Typed source and adapter compiler for coding-agent surfaces.

Current implementation: global command, rule, skill, prompt, and plugin-package compiler for Claude Code, Codex, Antigravity CLI, Cline, Kilo, Antigravity, Cursor, GitHub Copilot, VS Code, OpenCode, and Trae. A legacy Gemini CLI transition export remains available while Google moves users to Antigravity CLI. Planned surfaces still include richer hooks, MCP config, ignores, and first-class subagent bundles.

## Model

`commands/` is the canonical home for user-invoked reusable procedures. Target adapters may render the same source as Claude commands, Antigravity CLI plugin skills, legacy Gemini commands and extensions, Cline workflows, Antigravity workflows, Cursor commands, Codex skills, Claude plugin commands, or another native primitive.

Default exports quarantine high-risk local-only commands such as `boot-facade` and `ops-nuke` through command metadata; they remain source artifacts and can be rendered only through explicit packs.

`rules/` contains always-on or scoped behavior policy.

The other source folders are kept deliberately so new agent primitives can be added without reshaping the project:

- `skills/`
- `subagents/`
- `hooks/`
- `mcps/`
- `settings/`
- `ignores/`
- `plugins/`
- `external/`
- `registry/`
- `schemas/`

## Current Scope

In scope:

- Antigravity
- Antigravity CLI
- Claude Code
- Cline
- Codex
- Cursor
- Gemini CLI legacy transition export
- GitHub Copilot
- Kilo
- OpenCode
- Trae
- VS Code

Planned but not yet implemented:

- Droid
- Goose
- Grok Build
- Pi
- Pool
- VSCodium
- Windsurf
- Zed

Will never be implemented:

- Roo Code: will be EoL'd at May 15, 2026
- Xcode: please don't torture me

## Quick Start

```bash
npm run inventory
npm run check
npm run test
npm run doctor
npm run build -- --target all
```

Use dry-run before live installs:

```bash
node scripts/agent-surface.mjs install --target claude-code --scope user --dry-run
node scripts/agent-surface.mjs install --target codex --scope user --dry-run
node scripts/agent-surface.mjs install --target antigravity-cli --scope user --dry-run
node scripts/agent-surface.mjs install --target cline --scope user --dry-run
node scripts/agent-surface.mjs install --target kilo --scope user --dry-run
node scripts/agent-surface.mjs install --target antigravity --scope user --dry-run
node scripts/agent-surface.mjs install --target cursor --scope user --dry-run
node scripts/agent-surface.mjs install --target vscode --scope user --dry-run
node scripts/agent-surface.mjs install --target copilot --scope user --dry-run
node scripts/agent-surface.mjs install --target opencode --scope user --dry-run
node scripts/agent-surface.mjs install --target trae --scope user --dry-run
node scripts/agent-surface.mjs install --target gemini-cli --scope user --dry-run # legacy transition target
```

`install` prints the files it will write, stale managed files it will remove, blocked paths, and the manifest path that tracks generated files. Live writes require explicit `--dest` or `--allow-scope-root` after reviewing the dry run. Existing unmanaged files block the install. Managed files changed since the last manifest block the install. Overwrites and stale managed removals are backed up under `.agent-surface/backups/`.

## CLI Reference

Common checks:

```bash
npm run check
npm run check:commands
npm run check:generated
npm run check:rules
npm test
```

Registry and pack inspection:

```bash
node scripts/agent-surface.mjs commands --json
node scripts/agent-surface.mjs commands --phase ship --json
node scripts/agent-surface.mjs commands --risk writes --json
node scripts/agent-surface.mjs commands --pack all --json
```

Pack-specific rendering:

```bash
node scripts/agent-surface.mjs build --target antigravity-cli --pack all --dry-run
node scripts/agent-surface.mjs build --target cline --pack destructive --dry-run
```

Workflow evidence helpers:

```bash
node scripts/agent-surface.mjs run --task T1 --class build_test --timeout 120000 --out .agent-surface/workflows/<run_id>/rounds/round-001/evidence/T1 -- npm test
node scripts/agent-surface.mjs workflow patch begin --run <run_id> --round 1 --task T1 --file src/example.ts
node scripts/agent-surface.mjs workflow patch end --run <run_id> --round 1 --task T1
node scripts/agent-surface.mjs workflow patch verify --run <run_id> --round 1 --task T1
```

`run` requires explicit approval for `network`, `filesystem_destructive`, `deployment`, and `database_mutation` command classes through `--approved <class>` or `AGENT_SURFACE_APPROVED_CLASSES`.

Command frontmatter can declare `name`, `aliases`, `phase`, `risk`, `packs`, `default_export`, `approval_classes`, and `description`. `commands --json` emits the resolved registry with target paths and marks metadata as `frontmatter` or `inferred`. `commands --phase` and `commands --risk` filter that registry for routers such as `/flow`. `check commands` validates metadata and command-like references. `build` and `install` use `--pack default` unless told otherwise. `--pack all` renders every command source; named packs render the default set plus commands explicitly assigned to that pack.

Optional external services live under `external/` as git submodules and are tracked in `registry/optional-services.json`. They are not required for core build/install. `agentmemory` and `pua` are marked optional-caution: use the locally patched `agentmemory-mcp` wiring and keep PUA narrowly enabled because it can increase token use and reduce model performance on normal tasks.

Target MCP and skill support is recorded separately in `registry/target-capabilities.json`. This is intentionally distinct from `registry/targets.json`: the compiler may render commands/rules for a target while MCPs and external `SKILL.md` packs are only local-wired or manual-only. Kilo and legacy Antigravity keep command sources under their workflow surfaces; external skills stay native `SKILL.md` directories where the host supports them.

Google announced on May 19, 2026 that consumer Gemini CLI users should migrate to Antigravity CLI before Gemini CLI stops serving those consumer requests on June 18, 2026. `agent-surface` therefore treats `antigravity-cli` as the current Google CLI target and keeps `gemini-cli` as a legacy transition export.

Global target surfaces currently generated:

- Claude Code: `~/.claude/commands/**` plus a packaged Claude plugin directory at `~/.agent-surface/claude-plugin/agent-surface/`.
- Codex: `~/.agents/skills/<command>/SKILL.md`, per-skill `agents/openai.yaml`, and `~/.codex/AGENTS.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/plugins/agent-surface/` with generated plugin skills and rules.
- Gemini CLI legacy transition export: `~/.gemini/commands/**`, `~/.gemini/GEMINI.md`, and `~/.gemini/extensions/agent-surface/` with bundled extension skills.
- Cline: `~/Documents/Cline/Workflows/*.md` and `~/Documents/Cline/Rules/agent-surface.md` for user scope; project scope still writes `.clinerules/`.
- Kilo: `~/.config/kilo/commands/*.md`, `~/.config/kilo/AGENTS.md`, ordered per-rule files under `~/.config/kilo/rules/*.md`, and a safe `kilo.jsonc.instructions` merge for user scope; project scope writes `.kilo/commands/*.md`, root `AGENTS.md`, ordered `.kilo/rules/*.md`, and project `kilo.jsonc`.
- Antigravity: `~/.gemini/antigravity/global_workflows/*.md` for legacy workflow compatibility.
- Cursor: `~/.cursor/commands/*.md` and `~/.cursor/rules/*.mdc`.
- GitHub Copilot: VS Code user-profile `instructions/agent-surface-copilot.instructions.md`.
- VS Code: user-profile `instructions/agent-surface.instructions.md` and `prompts/agent-surface.prompt.md`.
- OpenCode: `~/.config/opencode/AGENTS.md`.
- Trae: `~/.trae/user_rules.md`.

## Workflow Kernel

Canonical workflow state lives under `.agent-surface/workflows/<run_id>/`.

Cursor-specific `.cursor/.workflow/` files are compatibility artifacts only; canonical `.agent-surface` state wins when they disagree.

Start with `/flow` when the right path is unclear. For formal workflow mode, start `workflow-orchestrator`; it is the long-running monitor session that spawns BOSS, worker, reviewer, judger, rescue, QA, and close roles until the run has no remaining work or automation must stop. Use `workflow-doctor` before acting on an existing run, and `workflow-close` to archive metrics and unresolved risks after an accepted or aborted run.

`workflow-boss` should queue the largest coherent batch it can specify safely; `workflow-reviewer` gates the batch across AC compliance, security, docs, dependency hygiene, tests, config, and other QA risks before anything reaches `ship-commit`.

`workflow-orchestrator` chooses the next role, provider, model, and launch shape from the ledger, local availability, cost, speed, context, prior outcomes, and required model independence. It records local `agents.json` state and keeps monitoring until the remaining task queue is finished, closed, quarantined, aborted, or handed to a human. It does not replace BOSS, worker, reviewer, judger, rescue, or close role-file ownership.

Latency tuning is measurement-first: profile role wall time, handoff gaps, clean-pass rate, rework loops, and judger escalations from local workflow telemetry before changing model tier, batch caps, or QA routing. Workers consume BOSS `context_capsule` first, resolve worker-owned blockers before stopping, and reserve `qa-review` / `qa-sec` for escalation rather than stacking duplicate serial review by default.

For Ollama thinking models, workflow roles should hide or drop the reasoning trace, not disable thinking. Use explicit thinking for non-trivial worker/reviewer roles and never persist the `thinking` field in workflow artifacts.

Workflow-aware workers currently include `dev-feature`, `dev-fix`, `dev-chore`, and `dev-refactor`.

Use `agent-surface run` for workflow verification commands so stdout, stderr, hashes, timing, exit code, cwd, and git tree are captured as evidence by tooling instead of by model self-report.

Use `agent-surface workflow patch begin/end/verify` around each task so `patch_ref`, `patch_hash`, `pre_tree_hash`, `post_tree_hash`, changed files, and clean-apply proof are captured mechanically.

`workflow doctor` validates workflow role artifacts, event hash chains, and patch manifests, including patch refs and patch content hashes.

Experimental loop shape:

```text
Codex plans and verifies the workflow.
Claude Code owns Claude-native subagent creation and delegation.
Local Ollama-backed Claude sessions can be launched with `ollama launch claude --model <model>`.
Use worktrees when multiple workers may edit files.
Keep Codex as the final reviewer before `ship-commit`.
```

GitHub install smoke path:

```bash
npx github:Lyther/agent-surface check
npx github:Lyther/agent-surface inventory
```

## Next Milestone

Use the managed global installs in normal work, then tighten target-specific validation where the host exposes a verifier:

1. Claude Code: test standalone commands and the generated plugin with `claude --plugin-dir`.
2. Antigravity CLI: verify plugin discovery, skill discovery, and generated rule attachment once the local CLI exposes plugin install/validate commands.
3. Gemini CLI legacy export: verify `/commands reload`, extension discovery, and `~/.gemini/GEMINI.md` loading while the transition target remains supported.
4. Cline: verify global Workflows and Rules appear in the UI.
5. Kilo: verify global commands and the `kilo.jsonc` Rules entry attach in the extension or CLI.
6. Cursor, Copilot, VS Code, OpenCode, and Trae: verify the generated global instruction files are actually attached in live sessions.
