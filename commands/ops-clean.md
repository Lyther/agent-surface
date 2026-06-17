---
name: ops-clean
phase: improve
description: "Evidence-driven repository hygiene: docs, scripts, assets, naming, structure, generated debris, and stale maintenance residue."
---
## OBJECTIVE

**THE EVIDENCE-DRIVEN REPO JANITOR.**

A repository decays by accumulation: stale docs, one-time scripts, duplicated instructions, obsolete assets, committed generated debris, inconsistent names, root clutter, and maintenance residue.

Your goal: lower repository noise while preserving behavior and reviewability.

CRUD actions:

```text
keep / update / move / merge / delete / defer
```

Boundary:

- Read-only by default.
- Modify only with `--mode apply --write`.
- Deletion requires evidence.
- Behavior change is out of scope.
- Unproven cleanup is deferred.

## SYNTAX

```text
/ops-clean [target] [--domain docs|scripts|assets|naming|structure|deps|generated|all] [--mode inspect|plan|apply] [--depth quick|standard|full] [--risk low|medium] [--write]
```

## PARAMETERS

| Parameter | Default | Description |
|---|---:|---|
| `[target]` | `.` | Repo root or subdirectory to inspect. |
| `--domain` | `all` | Cleanup surface. Prefer narrow domains for reviewable patches. |
| `--mode` | `inspect` | `inspect` reports findings; `plan` proposes exact edits; `apply` edits files. |
| `--depth` | `standard` | `quick` = high-confidence issues only; `standard` = normal hygiene pass; `full` = broad graph/reachability sweep. |
| `--risk` | `low` | `low` permits docs/generated/naming cleanup; `medium` permits script moves, structure moves, and dependency cleanup after stronger proof. |
| `--write` | off | Required for modifications. Without it, never edit. |

Rejected modes:

- No automatic high-risk mode.
- No silent deletion.
- No cleanup based on taste.
- No archive directory for removed files; Git history is the archive.
- No persistent deletion ledger unless the repo already has one.

## OPERATING PRINCIPLES

1. Improve repository health, not aesthetics.
2. Prefer deleting proven junk over creating `archive/`, `old/`, or `legacy/` holding pens.
3. Every non-keep action needs evidence.
4. A filename smell is a signal, not proof.
5. Docs should describe current truth, not preserve every historical design branch.
6. Durable automation belongs in documented script locations; one-time probes should be deleted or promoted.
7. Generated artifacts should be ignored or regenerated unless the repo intentionally commits them.
8. Naming alignment follows existing repository conventions.
9. Keep cleanup batches small and single-concern where feasible.
10. Run the cheapest relevant verification after mutation.
11. Never overwrite unrelated dirty worktree changes.
12. Defer ambiguous cases.

## DOMAINS

| Domain | Targets | Allowed actions | Evidence required |
|---|---|---|---|
| `docs` | README, command docs, adapter docs, guides, design notes | update, merge, delete stale docs, fix links | broken links, stale references, duplicate source-of-truth, mismatch with code/CLI/tests |
| `scripts` | shell/node/python scripts, package scripts, CI helpers | keep, move, delete one-time probes, document durable scripts | `package.json`, CI, README/docs, tests, `git grep`, executable references |
| `assets` | screenshots, reports, fixtures, temp files, local outputs, media | delete, move to fixtures, move to ignored/generated path | generation source, fixture usage, doc references, weak age signal |
| `generated` | build outputs, compiled artifacts, generated registries, reports | delete if reproducible or ignored by policy; update ignore rules | build/check output, generator config, generated markers, repo precedent |
| `naming` | command names, filenames, directory names, prefixes | mechanical rename, alias cleanup | dominant convention, stem/name mismatch, complete reference updates |
| `structure` | root clutter, folder responsibility, misplaced docs/scripts/config | move, merge, split by responsibility | import/reference graph, repo policy, existing directory taxonomy |
| `deps` | package manifests, lockfiles, unused deps, stale config | remove or update only after proof | imports, package scripts, CI, tests, config/plugin references, unused-dep tool when available |
| `all` | complete sweep | plan first; apply only low/medium gated batches | all relevant evidence |

## NON-GOALS

`ops-clean` is not:

- Architecture review — use `ops-report` or `arch-*`.
- Security audit — use `qa-sec`.
- Business/product quality review — use `qa-review`.
- Large documentation generation — use `ops-docs`.
- Dependency security program — use `ops-deps` or `qa-sec`.
- Release, distribution, branch pruning, commit, or push flow — use `ship-commit` or git directly.
- Format-everything command — use the repo formatter/linter.

## RISK MODEL

Low-risk actions allowed with `--risk low` when evidence is sufficient:

- Fix broken internal doc links.
- Merge duplicate doc paragraphs into the canonical doc.
- Delete generated reports that can be regenerated or are already ignored by precedent.
- Delete obvious local temp files that are untracked or explicitly ignored.
- Rename docs/command files when references are updated mechanically.
- Add `.gitignore` entries for generated/local artifacts.

Medium-risk actions require `--risk medium` and stronger verification:

- Delete or move scripts.
- Remove dependencies.
- Move source-adjacent config files.
- Restructure directories used by build, CI, docs, or generators.
- Delete schemas, registries, fixtures, adapter assets, or generated carriers.
- Rename command primitives consumed by generators.

Always defer:

- Source deletion that may affect runtime behavior.
- Files referenced only through dynamic loading, reflection, globbing, plugin discovery, or external consumers.
- Generated files whose generator is absent or non-deterministic.
- Scripts that may be used manually but lack documentation.
- Docs that may encode legal, compliance, release, or migration history.
- Assets that may be used externally.
- Dependency removals with unresolved import/script/CI/config ambiguity.

## PHASE 0: BASELINE

Run from the target scope:

```bash
pwd
git rev-parse --show-toplevel
git status --short --branch
git diff --name-only
git diff --cached --name-only
git ls-files | sort
git ls-files --others --exclude-standard | sort
```

If available, also collect:

```bash
rg --files -g '!.git/**' -g '!node_modules/**' -g '!dist/**' -g '!build/**' -g '!coverage/**' | sort
git ls-files -z --others --ignored --exclude-standard | xargs -0 git check-ignore -v 2>/dev/null || true
```

Read high-signal local policy and manifest files if present:

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- package/build manifests and lockfiles
- `.editorconfig` and formatter/lint configs
- CI workflows
- docs index files
- command registry files
- adapter READMEs
- schema/registry definitions

Dirty worktree rule:

- Report existing changes.
- Identify overlapping paths.
- Do not mutate overlapping paths.
- Continue only if cleanup can be scoped safely; otherwise stop at `inspect` or `plan`.

## PHASE 1: INVENTORY

Build an asset map:

```text
source roots
test roots
docs
scripts
package-manager entrypoints
CI workflows
generated outputs
schemas
registries
configs
fixtures
assets
external/vendor/submodules
ignored paths
untracked files
large files
temp-looking files
root-level clutter
empty or conceptual directories
```

For each candidate, collect reachability evidence:

```bash
git grep -n "<filename-or-stem>" -- .
git grep -n "<command-name>" -- .
git grep -n "<script-name>" -- .
```

For JavaScript/TypeScript repositories, inspect:

```bash
cat package.json
npm run
```

Treat package scripts, CI, docs, tests, compiler/generator references, and explicit manual-maintenance documentation as reachability roots.

## PHASE 2: CANDIDATE SIGNALS

A file is suspicious if one or more signals exist:

- name contains `tmp`, `temp`, `old`, `backup`, `copy`, `draft`, `probe`, `debug`, `scratch`, or `test-output`
- root-level file without clear root-level purpose
- script not referenced by package scripts, CI, docs, tests, compiler, or README
- doc references deleted paths, removed flags, old command names, or unsupported outputs
- generated artifact is committed without repo precedent
- large generated/binary file not used as fixture or documentation asset
- duplicate docs encode the same instruction with conflicting details
- schema or registry file is not read by compiler/tests
- adapter README claims outputs the compiler no longer emits
- directory mixes docs, scripts, generated outputs, fixtures, and source code
- dependency appears unused by imports/scripts/CI/tooling
- empty primitive directory implies unsupported capability

Signals alone do not justify destructive action.

## PHASE 3: CLASSIFY

Every candidate receives one classification:

| Action | Meaning |
|---|---|
| `keep` | Current, referenced, generated intentionally, or durable. |
| `update` | Useful but stale or inconsistent. |
| `move` | Useful but in the wrong location or name. |
| `merge` | Duplicated content should collapse into canonical source. |
| `delete` | Proven stale, generated, unused, duplicated, or one-time artifact. |
| `defer` | Suspicious but not proven safe to change. |

Required record:

```text
path:
action:
reason:
evidence:
negative evidence:
risk:
behavior impact:
verification:
rollback:
```

Deletion gate:

```text
A delete action requires:
1. positive stale/junk/generated/duplicate evidence
2. negative reachability evidence
3. no known external contract
4. rollback path via Git
5. relevant verification command
```

Dependency deletion gate:

```text
A dependency removal requires:
1. no static imports/usages found
2. no package script usage
3. no CI usage
4. no config/plugin usage
5. unused-dependency tool result when available
6. checks pass after removal
```

`npm audit` is a vulnerability check, not unused-dependency proof.

## PHASE 4: PLAN

In `--mode plan`, output a patch plan grouped into small batches:

1. docs: broken links, stale claims, duplicate docs
2. generated/assets: generated debris, temp outputs, stale reports
3. scripts: one-time probes, misplaced durable scripts
4. naming: mechanical command/file/directory alignment
5. structure: root clutter and responsibility moves
6. deps/config: unused dependencies and stale config
7. verification

Each batch must include:

```text
batch:
files touched:
actions:
reason:
evidence:
behavior impact: none | possible | intended
risk: low | medium
required checks:
rollback:
```

Planning rules:

- Prefer small batches over broad mixed cleanup.
- Do not mix docs rewrites with script deletion unless one directly justifies the other.
- Do not mix dependency removal with unrelated formatting.
- Do not rename and refactor behavior in the same patch.
- If a move requires many reference updates, list every reference update.
- If evidence is incomplete, classify as `defer`.

## PHASE 5: APPLY

Only execute with:

```text
--mode apply --write
```

Mutation rules:

1. Re-check git status before editing.
2. Do not touch unrelated dirty files or overlapping user changes.
3. Use `git mv` for renames.
4. Use `git rm` for tracked deletions.
5. Update references in the same batch.
6. Do not create archive directories.
7. Do not rewrite tests to bless broken behavior.
8. Stop if verification fails unless the failure is unrelated and clearly pre-existing.

Apply order:

1. low-risk doc/link fixes
2. generated/temp debris deletion
3. mechanical naming alignment
4. script moves/deletions
5. structure moves
6. dependency/config cleanup

## PHASE 6: VERIFY

Always run:

```bash
git diff --check
```

Then choose checks from repository evidence.

For docs:

```bash
npm run check:docs
npm run lint:md
npm run check:links
```

Run only commands that exist in the repository manifest.

For command/registry/generated surfaces:

```bash
npm run check:commands
npm run check:generated
```

For scripts/compiler/config changes:

```bash
npm run check
npm test
```

For dependency changes:

```bash
npm run check
npm test
npm audit --audit-level=low
```

For format/naming-only changes:

```bash
npm run format:check
npm run lint
```

Do not invent commands. If scripts differ, use the repository's actual manifest.

## AGENT-SURFACE-SPECIFIC CHECKS

When cleaning inside `agent-surface`, apply these additional gates.

### 1. Command naming

- Command file must be kebab-case.
- Command `name` must match filename stem.
- Prefix must match family:
  - `ops-*` operational commands
  - `qa-*` review/quality/security commands
  - `workflow-*` multi-step lifecycle commands
- Legacy aliases require evidence of active consumption.

### 2. Command/document parity

- Command docs must match actual command frontmatter.
- Parameters in README, registry, and docs must match command files.
- Remove docs for deleted commands.
- Update references after command renames.

### 3. Adapter claim parity

- Adapter README claims must match current generated output.
- Adapter docs must not claim unsupported producers.
- Adapter docs should distinguish implemented, planned, conceptual, and unsupported features.

### 4. Registry/schema reachability

- Every registry file must be consumed by scripts, tests, compiler, or generated output.
- Every schema must validate an existing registry or artifact class.
- Delete schema files only if no code/test/tool references them.
- If a future-facing schema is intentionally retained, document that reason.

### 5. One-time asset detection

Candidates:

```text
.tmp-*
probe-*
verify-*
scratch-*
debug-*
*-output.json
local disclosure paths
manual test reports
stale generated reports
```

Actions:

- promote to `tests/fixtures/` if durable
- promote to `scripts/` if reusable
- delete if one-time and unreferenced
- defer if external use is plausible

### 6. Source primitive emptiness

- Empty primitive directories must not imply support.
- README should distinguish conceptual primitive categories from implemented primitive categories.
- Empty dirs may be removed unless tooling expects them.

### 7. Docs density

- Root README should explain current system and entrypoints.
- Historical design notes should move to command docs, adapter docs, or be deleted if obsolete.
- Duplicated operational instructions should collapse into one canonical source.

### 8. Generated/live mismatch

If compiler, generated outputs, distribution metadata, or adapter outputs are touched, run:

```bash
npm run check
npm run check:commands
npm run check:generated
npm test
npm run build -- --target all
```

Distribution, commit, and publish remain explicit and separate. `ops-clean` must not install, commit, tag, push, or open PRs.

## OUTPUT FORMAT

```text
OPS-CLEAN REPORT

Target: .
Mode: inspect|plan|apply
Domain: docs|scripts|assets|naming|structure|deps|generated|all
Depth: quick|standard|full
Risk: low|medium

Summary:
- keep: N
- update: N
- move: N
- merge: N
- delete: N
- defer: N

Baseline:
- branch:
- dirty worktree: yes|no
- scoped around user changes: yes|no|n/a
- policy files read:
- manifests read:

Findings:
[P1] path
  action:
  reason:
  evidence:
  negative evidence:
  risk:
  behavior impact:
  verification:
  rollback:

Patch Plan:
[Batch 1] name
  files:
  actions:
  behavior impact:
  checks:
  rollback:

Applied:
- file: change summary

Checks:
- command -> passed|failed|not run

Deferred:
- path: reason not safe now

Residual Risk:
- risk:
- why acceptable or deferred:
```

Priority levels:

```text
P0 = must not apply until resolved; safety blocker
P1 = high-confidence cleanup with meaningful repo-health impact
P2 = useful cleanup, low urgency
P3 = cosmetic or weak evidence; usually defer
```
