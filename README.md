# agent-surface

Typed source and adapter compiler for coding-agent surfaces.

Write commands, rules, subagents, external packs, and ignore files once in the repo source tree, then render them into the native formats used by Claude Code, Codex, Deep Agents Code, Cursor, Droid, Cline, Kilo, Antigravity, Goose, Grok Build, Pi, Poolside, Windsurf, Zed, and other agent hosts.

## What it does

- **Source primitive compiler**: `commands/`, `rules/`, `subagents/`, external packs, and `ignores/` are rendered per target by explicit producers.
- **Target adapter outputs**: each target receives the files it natively understands (commands, workflows, skills, instructions, plugins, rules, subagents, MCP config, or ignore files).
- **Optional external wiring**: selected upstream packs in `external/` can be rendered into native target surfaces instead of remaining inert submodules.
- **Sync-aware install**: dry-run previews, project-only gating for project-scoped artifacts, manifest tracking, and backups.

## Supported targets

Implemented:

- Claude Code
- Codex
- Deep Agents Code
- Cursor
- Droid
- Cline
- Kilo
- Antigravity CLI
- Antigravity (legacy workflows)
- Gemini CLI
- GitHub Copilot
- VS Code
- VSCodium
- OpenCode
- Trae
- Goose
- Grok Build
- Pi
- Poolside
- Windsurf
- Zed

Planned: none.

Out of scope: Roo Code (EoL), Xcode.

## Project layout

```text
commands/          User-invoked reusable procedures
rules/             Always-on or scoped behavior policy
subagents/         Normalized subagent definitions
mcps/              Reserved for future MCP server definitions
ignores/           Project ignore files (.cursorignore, .kilocodeignore, .clineignore)
registry/          Target, capability, and source-kind policy
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
node scripts/agent-surface.mjs install --target deepagents --scope user --dry-run
node scripts/agent-surface.mjs install --target droid --scope user --dry-run
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

Install selected runtimes and categories:

```bash
node scripts/agent-surface.mjs install --runtime codex,kilo --category rules --dest /path/to/project --dry-run
node scripts/agent-surface.mjs install --runtime deepagents --category skills --category subagents --dest /path/to/project --dry-run
node scripts/agent-surface.mjs install --runtime deepagents --category mcps --service agentmemory --dest /path/to/project --dry-run
node scripts/agent-surface.mjs install --runtime pool,zed --category external --dest /path/to/project --dry-run
```

## Install behavior

- Install is sync-oriented: existing files are overwritten by default.
- `--target` and `--runtime` accept repeated or comma-separated runtime IDs.
- `--category` accepts repeated or comma-separated output categories such as `skills`, `rules`, `subagents`, `commands`, `recipes`, `mcps`, `external`, `instructions`, `prompts`, `plugins`, and `ignores`.
- `--service <id>` narrows `--category mcps` to a specific optional MCP service from `registry/optional-services.json`.
- Project-only artifacts (`ignores/`) are skipped on user-scope installs; use `--dest` to install them into a project.
- Droid user installs write `.factory/commands/`, `.factory/droids/`, `.factory/skills/`, `.factory/mcp.json`, and `.factory/AGENTS.md`; project installs write project `AGENTS.md` plus project `.factory/` assets.
- Deep Agents user installs write `~/.deepagents/<agent>/`; project installs write `.deepagents/`. Use `--agent <name>` to select a non-default user agent directory.
- Goose installs are project-oriented and render `recipes/<command>.yaml`.
- Grok Build, Pi, Poolside, Windsurf, and Zed render command sources as native skills or workflows plus target-specific instruction files.
- Required external skill packs are `ctf-skills`, `anthropic-cybersecurity-skills`, `claude-osint`, and `codex-redteam-mode`; optional/caution packs remain registered for `sanyuan-skills`, `andrej-karpathy-skills`, and `pua`.
- External skill packs are built and checked with each capable target, but live installs require an explicit `--category external` to avoid surprise writes of thousands of upstream files.
- DeepAudit is not registered as an MCP asset until an upstream MCP server contract is available; process-boundary tooling without MCP config is intentionally not emitted as `mcps`.
- Manifests track generated files so stale outputs can be removed on the next install.
- Backups are written to `.agent-surface/backups/` before overwrite or removal.

## Source-kind policy

`registry/source-kinds.json` records each active primitive's `load_mode`, `install_scopes`, and `source_dir`. `check` validates the registry, and `install` uses source-kind install scopes instead of per-output special cases.

`registry/target-capabilities.json` records the researched native surfaces for each implemented target and the generated render tokens that are intentionally active. `check` fails if that capability registry drifts from `registry/targets.json`.

## Subagents

`subagents/` contains the first workflow-oriented subagent batch: `boss`, `researcher`, `analyzer`, `adversary`, `reviewer`, and `worker`. They emit to:

- Claude Code: `.claude/agents/<name>.md`
- Codex: `.codex/agents/<name>.toml`
- Deep Agents Code: `.deepagents/agents/worker/AGENTS.md` for the worker profile; read-only roles are not emitted because Deep Agents Code files cannot represent per-subagent tool restrictions.
- Cursor: `.cursor/agents/<name>.md`
- Kilo user installs: `~/.config/kilo/agents/<name>.md`
- Kilo project installs: `.kilo/agents/<name>.md`
- Gemini CLI: `.gemini/agents/<name>.md`
- Google CLI extension target: `~/.gemini/extensions/agent-surface/agents/<name>.md`
- OpenCode user installs: `~/.config/opencode/agents/<name>.md`
- OpenCode project installs: `.opencode/agents/<name>.md`

Cursor runtime launches must use the full `cursor agent ...` command shape; do not treat a bare `agent` command as Cursor because Grok Build also uses an `agent`-named surface. Desktop Antigravity remains a supervised UI surface; the current file-based Google CLI extension output is validated through Gemini CLI.

## Upgrade notes

- `gemini-cli` emits native `.gemini` commands, context, and agents.
- `antigravity-cli` is kept as the Google CLI extension target for the Gemini/Antigravity transition and emits `~/.gemini/extensions/agent-surface`.

## Workflow kernel (optional)

Multi-role workflow state lives under `.agent-surface/workflows/<run_id>/`.

- `workflow-orchestrator` — long-running monitor that routes BOSS, worker, reviewer, judger, rescue, QA, and close roles.
- `workflow-boss` — plans the next coherent batch.
- `workflow-reviewer` — gates acceptance before `ship-commit`.
- `workflow-doctor` — validates run state before acting on it.
- `workflow-close` — archives metrics and unresolved risks.

Maintenance commands:

- `ops-doctor` — health check for source, registry, generated surfaces, and local manifests.
- `ops-clean` — evidence-driven repository hygiene for docs, scripts, assets, naming, structure, generated debris, and stale maintenance residue.

Use `agent-surface run` and `agent-surface workflow patch begin/end/verify` to capture evidence mechanically.

## Adapter READMEs

Per-target details live in `adapters/<target>/README.md`.

## License

MIT
