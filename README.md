# agent-surface

Typed source and adapter compiler for coding-agent surfaces.

Write commands, rules, and ignore files once in the repo source tree, then render them into the native formats used by Claude Code, Codex, Cursor, Cline, Kilo, Antigravity, and other agent hosts.

## What it does

- **Source primitive compiler**: `commands/`, `rules/`, and `ignores/` are rendered per target by explicit producers.
- **Target adapter outputs**: each target receives the files it natively understands (commands, workflows, skills, instructions, plugins, rules, or ignore files).
- **Sync-aware install**: dry-run previews, project-only gating for project-scoped artifacts, manifest tracking, and backups.

## Supported targets

Implemented:

- Claude Code
- Codex
- Cursor
- Cline
- Kilo
- Antigravity CLI
- Antigravity (legacy workflows)
- GitHub Copilot
- VS Code
- OpenCode
- Trae
- Gemini CLI (legacy transition export)

Planned: Droid, Goose, Grok Build, Pi, Pool, VSCodium, Windsurf, Zed.

Out of scope: Roo Code (EoL), Xcode.

## Project layout

```text
commands/          User-invoked reusable procedures
rules/             Always-on or scoped behavior policy
subagents/         Reserved for future agent definitions
mcps/              Reserved for future MCP server definitions
ignores/           Project ignore files (.cursorignore, .kilocodeignore, .clineignore)
registry/          Target and source-kind policy
schemas/           JSON schemas for registry and workflow artifacts
scripts/           CLI compiler and helper modules
tests/             Integration tests
adapters/          Per-target READMEs and context
external/          Optional git-submodule skill/service packs
```

## Quick start

```bash
npm ci
npm run inventory   # Show source counts
npm run check       # Validate source, registry, and generated outputs
npm test            # Run integration tests
npm run build -- --target all
```

Dry-run an install before writing anything live:

```bash
node scripts/agent-surface.mjs install --target claude-code --scope user --dry-run
node scripts/agent-surface.mjs install --target cursor --scope user --dry-run
```

Project-scope artifacts such as ignore files must be installed with `--dest`:

```bash
node scripts/agent-surface.mjs install --target cursor --dest /path/to/project --dry-run
node scripts/agent-surface.mjs install --target cursor --dest /path/to/project
```

## Checks

```bash
npm run check              # Full validation
npm run check:commands     # Command metadata and references
npm run check:generated    # Generated output correctness
npm run check:rules        # Rule scenario budgets
npm test                   # Integration tests
npm run doctor             # Project health summary
```

## CLI essentials

Registry and phase inspection:

```bash
node scripts/agent-surface.mjs commands --json
node scripts/agent-surface.mjs commands --phase ship --json
```

Build a target:

```bash
node scripts/agent-surface.mjs build --target antigravity-cli --dry-run
node scripts/agent-surface.mjs build --target cline --dry-run
```

## Install behavior

- Install is sync-oriented: existing files are overwritten by default.
- Project-only artifacts (`ignores/`) are skipped on user-scope installs; use `--dest` to install them into a project.
- Manifests track generated files so stale outputs can be removed on the next install.
- Backups are written to `.agent-surface/backups/` before overwrite or removal.

## Source-kind policy

`registry/source-kinds.json` records each active primitive's `load_mode`, `install_scopes`, and `source_dir`. `check` validates the registry, and `install` uses source-kind install scopes instead of per-output special cases.

## Upgrade notes

- Use `antigravity-cli` as the current Google CLI target. `gemini-cli` is kept only as a legacy transition export.

## Workflow kernel (optional)

Multi-role workflow state lives under `.agent-surface/workflows/<run_id>/`.

- `workflow-orchestrator` — long-running monitor that routes BOSS, worker, reviewer, judger, rescue, QA, and close roles.
- `workflow-boss` — plans the next coherent batch.
- `workflow-reviewer` — gates acceptance before `ship-commit`.
- `workflow-doctor` — validates run state before acting on it.
- `workflow-close` — archives metrics and unresolved risks.

Use `agent-surface run` and `agent-surface workflow patch begin/end/verify` to capture evidence mechanically.

## Adapter READMEs

Per-target details live in `adapters/<target>/README.md`.

## License

MIT
