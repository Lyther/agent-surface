# agent-surface

Typed source and adapter compiler for coding-agent surfaces.

Current implementation: command-source compiler for Cline, Antigravity, and Gemini CLI. Planned surfaces include rules, skills, subagents, hooks, MCP config, settings, ignores, and plugin bundles.

## Model

`commands/` is the canonical home for user-invoked reusable procedures. Target adapters may render the same source as Claude commands, Gemini commands, Cline workflows, Antigravity workflows, Codex skills, or another native primitive.

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

## Commands

```bash
npm run inventory
npm run check
npm run check:commands
npm run check:rules
npm run test
npm run doctor
npm run build -- --target cline --dry-run
npm run build -- --target antigravity --dry-run
npm run build -- --target gemini-cli --dry-run
node scripts/agent-surface.mjs build --target gemini-cli --pack all --dry-run
node scripts/agent-surface.mjs build --target cline --pack destructive --dry-run
node scripts/agent-surface.mjs commands --json
node scripts/agent-surface.mjs commands --phase ship --json
node scripts/agent-surface.mjs commands --risk writes --json
node scripts/agent-surface.mjs commands --pack all --json
node scripts/agent-surface.mjs check
node scripts/agent-surface.mjs check commands
node scripts/agent-surface.mjs install --target cline --pack default --scope project --dry-run
node scripts/agent-surface.mjs install --target antigravity --scope user --dry-run
node scripts/agent-surface.mjs install --target gemini-cli --scope project --dry-run
node scripts/agent-surface.mjs install --target cline --dest /tmp/agent-surface-cline
node scripts/agent-surface.mjs install --target cline --scope project --allow-scope-root
node scripts/agent-surface.mjs run --task T1 --class build_test --timeout 120000 --out .agent-surface/workflows/<run_id>/rounds/round-001/evidence/T1 -- npm test
node scripts/agent-surface.mjs workflow patch begin --run <run_id> --round 1 --task T1 --file src/example.ts
node scripts/agent-surface.mjs workflow patch end --run <run_id> --round 1 --task T1
node scripts/agent-surface.mjs workflow patch verify --run <run_id> --round 1 --task T1
```

Rule scenario checks:

```bash
node scripts/agent-surface.mjs check rules --scenario python-source
node scripts/agent-surface.mjs check rules --scenario python-tooling
node scripts/agent-surface.mjs check rules --scenario rust-source
node scripts/agent-surface.mjs check rules --scenario go-ci
node scripts/agent-surface.mjs check rules --scenario typescript-eslint
node scripts/agent-surface.mjs check rules --scenario shell-script
```

`install` prints the files it will write, stale managed files it will remove, blocked paths, and the manifest path that tracks generated files. Live writes require explicit `--dest` or `--allow-scope-root` after reviewing the dry run. Existing unmanaged files block the install. Managed files changed since the last manifest block the install. Overwrites and stale managed removals are backed up under `.agent-surface/backups/`.

`run` requires explicit approval for `network`, `filesystem_destructive`, `deployment`, and `database_mutation` command classes through `--approved <class>` or `AGENT_SURFACE_APPROVED_CLASSES`.

Command frontmatter can declare `name`, `aliases`, `phase`, `risk`, `packs`, `default_export`, `approval_classes`, and `description`. `commands --json` emits the resolved registry with target paths and marks metadata as `frontmatter` or `inferred`. `commands --phase` and `commands --risk` filter that registry for routers such as `/flow`. `check commands` validates metadata and command-like references. `build` and `install` use `--pack default` unless told otherwise. `--pack all` renders every command source; named packs render the default set plus commands explicitly assigned to that pack.

## Workflow Kernel

Canonical workflow state lives under `.agent-surface/workflows/<run_id>/`.

Cursor-specific `.cursor/.workflow/` files are compatibility artifacts only; canonical `.agent-surface` state wins when they disagree.

Start with `/flow` when the right path is unclear. Use `workflow-doctor` before acting on an existing run, and `workflow-close` to archive metrics and unresolved risks after an accepted or aborted run.

Workflow-aware workers currently include `dev-feature`, `dev-fix`, `dev-chore`, and `dev-refactor`.

Use `agent-surface run` for workflow verification commands so stdout, stderr, hashes, timing, exit code, cwd, and git tree are captured as evidence by tooling instead of by model self-report.

Use `agent-surface workflow patch begin/end/verify` around each task so `patch_ref`, `patch_hash`, `pre_tree_hash`, `post_tree_hash`, changed files, and clean-apply proof are captured mechanically.

`workflow doctor` validates workflow role artifacts, event hash chains, and patch manifests, including patch refs and patch content hashes.

GitHub install smoke path:

```bash
npx github:Lyther/agent-surface check
npx github:Lyther/agent-surface inventory
```

## Next Milestone

Focus adapters in this order:

1. `cline`
2. `antigravity`
3. `gemini-cli`

These targets have the clearest command/workflow primitives right now. Next, test one real target path at a time before installing into daily-use dotfolders.
