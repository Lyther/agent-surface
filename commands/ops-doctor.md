---
name: ops-doctor
phase: improve
description: "Run a health check on the agent-surface repository and local generated surfaces."
---

## OBJECTIVE

Diagnose whether `agent-surface` is internally consistent and whether the local generated surfaces match the current compiler model.

This is a read-only health check. It reports drift; it does not edit files, install surfaces, prune branches, or repair docs.

## SYNTAX

```text
/ops-doctor [target] [--scope repo|local|all] [--depth quick|standard|full] [--ci]
```

## PARAMETERS

| Parameter | Default | Description |
|---|---:|---|
| `[target]` | `.` | Repository root or subdirectory. |
| `--scope` | `all` | `repo` checks source/registry/compiler state; `local` checks installed user surfaces; `all` runs both. |
| `--depth` | `standard` | `quick` runs cheap probes; `standard` includes generated checks and install dry-runs; `full` also runs tests and full build. |
| `--ci` | off | Machine-readable mode. Exit non-zero for errors. |

## PROTOCOL

### Check 1: Repository Baseline

Run:

```bash
pwd
git status --short --branch
node scripts/agent-surface.mjs inventory
node scripts/agent-surface.mjs doctor
```

Report:

- current branch and dirty state
- source counts for `commands`, `rules`, `ignores`, `external`, and `schemas`
- local tool availability reported by `doctor`

Dirty worktree is not automatically an error. It is an error only when the requested health claim depends on a clean tree.

### Check 2: Source and Registry Integrity

Run:

```bash
npm run check
npm run check:commands
```

Report:

- command count and metadata status
- broken command references
- registry/schema validation errors
- source-kind drift
- adapter/registry render-token drift

### Check 3: Generated Surface Integrity

Run:

```bash
npm run check:generated
```

Report one line per target:

- generated output count
- failed target validations
- missing native carrier files
- unexpected duplicate output paths

Expected current target families:

- native command/workflow targets: `claude-code`, `cline`, `kilo`, `antigravity`, `gemini-cli`, `cursor`
- skill/plugin target: `codex`, `antigravity-cli`
- instruction/rules targets: `copilot`, `vscode`, `opencode`, `trae`

Do not expect removed primitive producers (`mcps`, generated hooks) unless the compiler has reintroduced them.

### Check 4: Rule Budget

Run:

```bash
npm run check:rules
```

Report:

- hard failures
- soft budget warnings
- scenarios over target but under hard limit

Soft warnings are not failures unless `--ci` policy says otherwise.

### Check 5: Install Plan Dry-Runs

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

Report:

- blocked writes
- stale managed removals
- missing manifests
- project-only artifacts skipped on user-scope installs

Dry-run only. Never add `--allow-scope-root` from `ops-doctor`.

### Check 6: Local Distribution Drift

For `--scope local|all`, inspect installed manifests without editing them:

| Target | User manifest |
|---|---|
| `claude-code` | `~/.agent-surface/claude-code-manifest.json` |
| `codex` | `~/.agent-surface/codex-manifest.json` |
| `cursor` | `~/.agent-surface/cursor-manifest.json` |
| `kilo` | `~/.agent-surface/kilo-manifest.json` |
| `antigravity` | `~/.gemini/antigravity/.agent-surface/antigravity-manifest.json` |
| `antigravity-cli` | `~/.gemini/.agent-surface/antigravity-cli-manifest.json` |
| `vscode` / `copilot` | VS Code user config `.agent-surface/*-manifest.json` |

For each manifest:

- verify JSON parses
- verify `target` matches the manifest name
- verify managed paths still exist
- report manifest age if it predates the latest source commit

Missing local manifests are warnings unless the user claims that target is installed.

### Check 7: Full Verification

For `--depth full`, run:

```bash
npm test
npm run build -- --target all
git diff --check
npm pack --dry-run --json
```

Run these sequentially. `npm test` and `build` both touch `dist/`; do not run them in parallel.

## OUTPUT FORMAT

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

## EXECUTION RULES

1. Read-only. Do not fix issues, install surfaces, delete files, or prune branches.
2. Prefer repo scripts over ad hoc validators.
3. Record failed probes separately from missing evidence.
4. Report soft rule-budget warnings as warnings, not failures.
5. If `--ci` is set, return non-zero only for errors, not ordinary local-install warnings.
