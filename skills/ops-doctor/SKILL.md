---
name: ops-doctor
description: "Run a health check on the agent-surface repository and local generated surfaces."
---

## Objective

Diagnose whether `agent-surface` is internally consistent and whether the local generated surfaces match the current compiler model. This check is read-only: report drift; never fix issues, edit files, install surfaces, delete files, prune branches, or repair docs. Prefer repo scripts over ad hoc validators, and record failed probes separately from missing evidence.

## Input

`ops-doctor [target] [--scope repo|local|all] [--depth quick|standard|full] [--ci]`

- `target`: repository root or subdirectory; default `.`.
- `--scope` (default `all`): `repo` checks source, registry, and compiler state; `local` checks installed user surfaces; `all` runs both.
- `--depth` (default `standard`): `quick` runs cheap probes; `standard` adds generated checks and install dry-runs; `full` also runs tests and the full build.
- `--ci` (default off): machine-readable mode; exit non-zero only for errors, not for ordinary local-install warnings.

## 1. Repository Baseline

```bash
pwd
git status --short --branch
node scripts/agent-surface.mjs inventory
node scripts/agent-surface.mjs doctor
```

Report the current branch and dirty state, source counts for `skills`, manual `commands`, `rules`, `ignores`, `external`, and `schemas`, and the local tool availability `doctor` reports. A dirty worktree is an error only when the requested health claim depends on a clean tree.

## 2. Source and Registry Integrity

```bash
npm run check
npm run check:skills
npm run check:commands
```

Report skill and manual-command counts with metadata status, broken workflow references, registry/schema validation errors, source-kind drift, and adapter/registry render-token drift.

## 3. Generated Surface Integrity

Run `npm run check:generated` and report one line per target: generated output count, failed target validations, missing native carrier files, and unexpected duplicate output paths.

Expected target families: native command/workflow targets `claude-code`, `cline`, `kilo`, `antigravity`, `cursor`; skill/plugin targets `codex`, `antigravity-cli`; instruction/rules targets `copilot`, `vscode`, `opencode`, `trae`. Do not expect removed primitive producers (`mcps`, generated hooks) unless the compiler has reintroduced them.

## 4. Rule Budget

Run `npm run check:rules` and report hard failures, soft budget warnings, and scenarios over target but under the hard limit. Report soft warnings as warnings, not failures, unless `--ci` policy says otherwise.

## 5. Install Dry-Runs

For `--depth standard|full`, dry-run representative user installs:

```bash
node scripts/agent-surface.mjs install --target claude-code --scope user --dry-run
node scripts/agent-surface.mjs install --target codex --scope user --dry-run
node scripts/agent-surface.mjs install --target cursor --scope user --dry-run
node scripts/agent-surface.mjs install --target kilo --scope user --dry-run
node scripts/agent-surface.mjs install --target antigravity-cli --scope user --dry-run
```

For project-only ignore surfaces, dry-run with an explicit project destination:

```bash
node scripts/agent-surface.mjs install --target cursor --dest /tmp/agent-surface-doctor-project --dry-run
node scripts/agent-surface.mjs install --target kilo --dest /tmp/agent-surface-doctor-project --dry-run
node scripts/agent-surface.mjs install --target cline --dest /tmp/agent-surface-doctor-project --dry-run
```

Report blocked writes, stale managed removals, missing manifests, and project-only artifacts skipped on user-scope installs. Dry-run only; never add `--allow-scope-root` from `ops-doctor`.

## 6. Local Distribution Drift

For `--scope local|all`, inspect installed manifests without editing them:

| Target | User manifest |
|---|---|
| `claude-code` | `~/.agent-surface/claude-code-manifest.json` |
| `codex` | `~/.agent-surface/codex-manifest.json` |
| `cursor` | `~/.agent-surface/cursor-manifest.json` |
| `kilo` | `~/.agent-surface/kilo-manifest.json` |
| `antigravity` | `~/.gemini/.agent-surface/antigravity-manifest.json` |
| `antigravity-cli` | `~/.gemini/.agent-surface/antigravity-cli-manifest.json` |
| `vscode` / `copilot` | `~/.agent-surface/vscode-manifest.json`, `~/.agent-surface/copilot-manifest.json` |

For each manifest, verify that the JSON parses, that `target` matches the manifest name, and that managed paths still exist; report the manifest's age if it predates the latest source commit. A missing local manifest is a warning unless the user claims that target is installed.

## 7. Full Verification

For `--depth full`, run these sequentially, never in parallel, because `npm test` and `build` both touch `dist/`:

```bash
npm test
npm run build -- --target all
git diff --check
npm pack --dry-run --json
```

## Output

```text
DOCTOR REPORT — agent-surface

Scope: repo|local|all
Depth: quick|standard|full

[CHECK 1] Repository baseline
  branch: docs/headless-provider-routing
  worktree: clean|dirty
  inventory: commands=N rules=N ignores=N external=N schemas=N

[CHECK 2] Source and registry integrity
  check: passed|failed
  commands: passed|failed

[CHECK 3] Generated surfaces
  claude-code: N outputs ok
  codex: N outputs ok
  ...

[CHECK 4] Rule budget
  hard failures: N
  warnings: N

[CHECK 5] Install dry-runs
  claude-code: ok|blocked
  cursor project ignore surface: ok|blocked

[CHECK 6] Local distribution drift
  codex: manifest present, managed paths ok
  antigravity-cli: missing manifest (warning)

[CHECK 7] Full verification
  npm test: passed|failed|not run
  build all: passed|failed|not run

Summary: N errors, M warnings
```
