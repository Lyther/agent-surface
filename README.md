# agent-surface

Typed source and adapter compiler for coding-agent surfaces.

Write commands, rules, subagents, external packs, and ignore files once in the repo source tree, then render them into the native formats used by Claude Code, Codex, Deep Agents Code, Cursor, Droid, Cline, Kilo, Antigravity, Goose, Grok Build, Pi, Poolside, Windsurf, Zed, and other agent hosts.

## What it does

- **Source primitive compiler**: `commands/`, `rules/`, `subagents/`, external packs, and `ignores/` are rendered per target by explicit producers.
- **Target adapter outputs**: each target receives the files it natively understands (commands, workflows, skills, instructions, plugins, rules, subagents, MCP config, or ignore files).
- **Optional external wiring**: selected upstream packs in `external/` can be rendered into native target surfaces instead of remaining inert submodules.
- **Sync-aware install**: dry-run previews, project-only gating for project-scoped artifacts, manifest tracking, and backups.

## Supported targets

Compatibility is ranked from 1 to 5 based on how much of the `agent-surface` source model is represented by native or close-native target surfaces. Counts are from the current default user-scope `npm run build -- --target all` output; project-only or install-only surfaces are noted explicitly.

| Target | Build files | Commands / workflows | Rules / instructions | Agents / subagents | Skills / external packs | Config / ignores / prompts | Compatibility |
|---|---:|---|---|---|---|---|---:|
| Claude Code | 3722 | 66 native `.claude/commands/<group>/<name>.md` | None | 6 `.claude/agents/*.md` | External `.claude/skills/*` | Synapse MCP in `.claude.json` | 4/5 |
| Codex | 3794 | 66 command skills in `.agents/skills/*` | `.codex/AGENTS.md` plus 5 scoped language refs in `.codex/references/rules/*.md` | 6 `.codex/agents/*.toml` | External `.agents/skills/*` | Synapse MCP in `.codex/config.toml` | 5/5 |
| Deep Agents Code | 3723 | 66 command skills in `.deepagents/agent/skills/*` | `.deepagents/agent/AGENTS.md` plus 5 scoped language refs | Worker only at `.deepagents/agent/agents/worker/AGENTS.md` | External `.deepagents/agent/skills/*` | `.deepagents/.mcp.json` | 4/5 |
| Cursor | 86 | 66 native `.cursor/commands/*.md` | 12 native scoped `.cursor/rules/*.mdc` | 6 `.cursor/agents/*.md` | None | `.cursor/mcp.json`; `.cursorignore` | 5/5 |
| Droid | 3728 | 66 native `.factory/commands/*.md` | `.factory/AGENTS.md` plus 5 scoped language refs | 6 `.factory/droids/*.md` | External `.factory/skills/*` | `.factory/mcp.json` | 5/5 |
| Cline | 74 | 66 workflows in `.cline/data/workflows/*.md` | `.cline/rules/agent-surface.md` plus 5 scoped language refs | None | None | `.cline/mcp.json`; `.clineignore` | 4/5 |
| Kilo | 86 | 66 workflows in `.config/kilo/commands/*.md` | 7 always-on `.config/kilo/rules/*.md` plus 5 scoped language refs | 6 `.config/kilo/agents/*.md` | None | Synapse MCP + instructions in `kilo.jsonc`; `.kilocodeignore` | 5/5 |
| Antigravity CLI | 3735 | 66 plugin skills in `config/plugins/agent-surface/skills/*.md` | 7 always-on `config/plugins/agent-surface/rules/*.md` plus 5 scoped language refs | 6 `config/plugins/agent-surface/agents/*.md` | External plugin skills | `config/plugins/agent-surface/plugin.json` | 5/5 |
| Antigravity (legacy workflows) | 66 | 66 `global_workflows/*.md` | None | None | None | None | 2/5 |
| GitHub Copilot | 6 | None | `instructions/agent-surface-copilot.instructions.md` plus 5 scoped language refs | None | None | None | 2/5 |
| VS Code | 8 | None | `instructions/agent-surface.instructions.md` plus 5 scoped language refs | None | None | `mcp.json`; `prompts/agent-surface.prompt.md` | 2/5 |
| VSCodium | 7 | None | `instructions/agent-surface.instructions.md` plus 5 scoped language refs | None | None | `prompts/agent-surface.prompt.md` | 2/5 |
| OpenCode | 79 | 66 native `.config/opencode/commands/*.md` | `.config/opencode/AGENTS.md` plus 5 scoped language refs | 6 `.config/opencode/agents/*.md` | None | Synapse MCP in `.config/opencode/opencode.json` | 5/5 |
| Trae | 7 | None | `.trae/user_rules.md` plus 5 scoped language refs | None | None | `.trae/mcp.json` | 2/5 |
| Goose | 66 | 66 recipes in `recipes/*.yaml` | None | None | None | None | 3/5 |
| Grok Build | 3715 | 66 command skills in `.grok/skills/*` | Project install emits `AGENTS.md`; default user build emits none | None | External `.grok/skills/*` | None | 4/5 |
| Pi | 3721 | 66 command skills in `.pi/agent/skills/*` | `.pi/agent/AGENTS.md` plus 5 scoped language refs | None | External `.pi/agent/skills/*` | None | 4/5 |
| Poolside | 3721 | 66 command skills in `.config/poolside/skills/*` | `.config/poolside/.poolside` plus 5 scoped language refs | None | External `.config/poolside/skills/*` | None | 4/5 |
| Windsurf | 3722 | 66 workflows in `.codeium/windsurf/global_workflows/*.md` | `.codeium/windsurf/memories/global_rules.md` plus 5 scoped language refs | None | External `.codeium/windsurf/skills/*` | `.codeium/windsurf/mcp_config.json` | 4/5 |
| Zed | 3722 | 66 command skills in `.agents/skills/*` | `.config/zed/AGENTS.md` plus 5 scoped language refs | None | External `.agents/skills/*` | Synapse MCP in `.config/zed/settings.json` | 4/5 |

Bundled instruction targets include only `alwaysApply: true` rules inline. Cybersecurity (`04`) is always-on for security review and harness development; language rules (`10`-`14`) are emitted as separate reference files under each target's config tree and are selected by project-aware commands such as `boot-new`. Cursor keeps all 12 files as native `.mdc` rules; Kilo config-merges the 7 always-on rules and keeps the 5 scoped language policies as references. No legacy compact core rule is emitted in source or generated target outputs.

Planned: none.

Out of scope: Gemini CLI (EoL; use Antigravity CLI), Roo Code (EoL), Xcode.

## Project layout

```text
commands/          User-invoked reusable procedures
rules/             Always-on or scoped behavior policy
subagents/         Normalized subagent definitions
mcps/              First-party MCP services such as Synapse
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
- First-party secretless MCPs such as Synapse are generated by default for targets with verified MCP config surfaces and are merged into existing host config during install; external or secret-bearing MCPs remain opt-in through `--category mcps --service <id>`.
- Droid user installs write `.factory/commands/`, `.factory/droids/`, `.factory/skills/`, `.factory/AGENTS.md`, and `.factory/references/rules/` scoped rule references, and merge Synapse into `.factory/mcp.json`; project installs write project `AGENTS.md` plus project `.factory/` assets.
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
- Antigravity CLI plugin target: `~/.gemini/config/plugins/agent-surface/agents/<name>.md`
- OpenCode user installs: `~/.config/opencode/agents/<name>.md`
- OpenCode project installs: `.opencode/agents/<name>.md`

Cursor runtime launches must use the full `cursor agent ...` command shape; do not treat a bare `agent` command as Cursor because Grok Build also uses an `agent`-named surface. Desktop Antigravity remains a supervised UI surface; the Antigravity CLI target is a validated `agy` plugin package.

## Upgrade notes

- Gemini CLI is EoL in this project. Use `antigravity-cli`, the current Google CLI target; it emits the Antigravity CLI plugin under `~/.gemini/config/plugins/agent-surface`. Validate it with `agy plugin validate ~/.gemini/config/plugins/agent-surface`.

## Workflow kernel (optional)

Multi-role workflow state lives under `.agent-surface/workflows/<run_id>/`.

- `workflow-orchestrator` — long-running monitor that routes BOSS, worker, reviewer, judger, rescue, QA, and close roles.
- `workflow-boss` — plans the next coherent batch.
- `workflow-reviewer` — gates acceptance before `ship-commit`.
- `workflow-doctor` — validates run state before acting on it.
- `workflow-close` — archives metrics and unresolved risks.
- `verify-readiness` — certifies scoped stable, production-ready, E2E, deployment-ready, and all-features-supported claims with real evidence.

Maintenance commands:

- `ops-doctor` — health check for source, registry, generated surfaces, and local manifests.
- `ops-clean` — evidence-driven repository hygiene for docs, scripts, assets, naming, structure, generated debris, and stale maintenance residue.

Use `agent-surface run` and `agent-surface workflow patch begin/end/verify` to capture evidence mechanically.

## Adapter READMEs

Per-target details live in `adapters/<target>/README.md`.

## License

MIT
