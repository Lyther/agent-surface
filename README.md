# agent-surface

Typed source and adapter compiler for coding-agent surfaces.

Current implementation: global command, rule, skill, prompt, and plugin-package compiler for Claude Code, Codex, Gemini CLI, Cline, Kilo, Antigravity, Cursor, GitHub Copilot, VS Code, OpenCode, and Trae. Planned surfaces still include richer hooks, MCP config, ignores, and first-class subagent bundles.

## Model

`commands/` is the canonical home for user-invoked reusable procedures. Target adapters may render the same source as Claude commands, Gemini commands and extensions, Cline workflows, Antigravity workflows, Cursor commands, Codex skills, Claude plugin commands, or another native primitive.

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
- `registry/`
- `schemas/`

## Current Scope

In scope:

- Claude Code
- Codex
- Gemini CLI
- Cline
- Kilo
- Antigravity
- OpenCode, behind primitive verification
- VS Code generic settings
- Cursor
- GitHub Copilot
- Trae

Out of scope:

- Roo Code
- Windsurf
- VSCodium
- Positron
- Void

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
node scripts/agent-surface.mjs install --target gemini-cli --scope user --dry-run
node scripts/agent-surface.mjs install --target cline --scope user --dry-run
node scripts/agent-surface.mjs install --target kilo --scope user --dry-run
node scripts/agent-surface.mjs install --target cursor --scope user --dry-run
node scripts/agent-surface.mjs install --target vscode --scope user --dry-run
node scripts/agent-surface.mjs install --target copilot --scope user --dry-run
node scripts/agent-surface.mjs install --target opencode --scope user --dry-run
node scripts/agent-surface.mjs install --target trae --scope user --dry-run
node scripts/agent-surface.mjs install --target antigravity --scope user --dry-run
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
node scripts/agent-surface.mjs build --target gemini-cli --pack all --dry-run
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

Global target surfaces currently generated:

- Claude Code: `~/.claude/commands/**` plus a packaged Claude plugin directory at `~/.agent-surface/claude-plugin/agent-surface/`.
- Codex: `~/.agents/skills/<command>/SKILL.md`, per-skill `agents/openai.yaml`, and `~/.codex/AGENTS.md`.
- Gemini CLI: `~/.gemini/commands/**`, `~/.gemini/GEMINI.md`, and `~/.gemini/extensions/agent-surface/`.
- Cline: `~/Documents/Cline/Workflows/*.md` and `~/Documents/Cline/Rules/agent-surface.md` for user scope; project scope still writes `.clinerules/`.
- Kilo: `~/.config/kilo/commands/*.md`, `~/.config/kilo/AGENTS.md`, ordered per-rule files under `~/.config/kilo/rules/*.md`, and a safe `kilo.jsonc.instructions` merge for user scope; project scope writes `.kilo/commands/*.md`, root `AGENTS.md`, ordered `.kilo/rules/*.md`, and project `kilo.jsonc`.
- Antigravity: `~/.gemini/antigravity/global_workflows/*.md`.
- Cursor: `~/.cursor/commands/*.md` and `~/.cursor/rules/*.mdc`.
- GitHub Copilot: VS Code user-profile `instructions/agent-surface-copilot.instructions.md`.
- VS Code: user-profile `instructions/agent-surface.instructions.md` and `prompts/agent-surface.prompt.md`.
- OpenCode: `~/.config/opencode/AGENTS.md`.
- Trae: `~/.trae/user_rules.md`.

## Workflow Kernel

Canonical workflow state lives under `.agent-surface/workflows/<run_id>/`.

Cursor-specific `.cursor/.workflow/` files are compatibility artifacts only; canonical `.agent-surface` state wins when they disagree.

Start with `/flow` when the right path is unclear. Use `workflow-doctor` before acting on an existing run, and `workflow-close` to archive metrics and unresolved risks after an accepted or aborted run.

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
2. Gemini CLI: verify `/commands reload`, extension discovery, and `~/.gemini/GEMINI.md` loading.
3. Cline: verify global Workflows and Rules appear in the UI.
4. Kilo: verify global commands and the `kilo.jsonc` Rules entry attach in the extension or CLI.
5. Cursor, Copilot, VS Code, OpenCode, and Trae: verify the generated global instruction files are actually attached in live sessions.
