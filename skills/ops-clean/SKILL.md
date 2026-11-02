---
name: ops-clean
description: "Remove accumulated repository debt across design, code, tests, dependencies, scripts, docs, assets, structure, and generated residue."
---

## OBJECTIVE

Reduce accumulated project complexity and maintenance cost while preserving the accepted product contract.

`dev-chore` catches bounded quality drift during active development. `ops-clean` handles repository-wide debt that has already accumulated: duplicate implementation, wrong abstractions, hand-rolled wheels, misleading tests, dead scripts, temporary files, stale dependencies, structural clutter, and documentation or generated residue.

## INPUT

```text
ops-clean [target]
  [--domain design|code|tests|dependencies|scripts|docs|assets|structure|generated|all]
  [--mode inspect|plan|apply]
  [--depth quick|standard|deep]
```

Defaults: `--domain all --mode apply --depth standard` when the user requests cleanup; otherwise inspect only.

## CONTRACT GATE

Before deleting or consolidating:

- state the current maturity and user-visible contract, and judge every item against the user's requirements and plan: agent-written specs, review findings, and docs are not requirements unless the user accepted them;
- identify the real build, test, package, and runtime entry points;
- preserve unrelated dirty work;
- establish the cheapest relevant baseline;
- distinguish tracked source, generated output, ignored local state, and external/vendor content.

If a cleanup would intentionally change supported behavior, public contracts, persistent data, or architecture, route that item through `dev-fix`, `dev-refactor`, or an architecture workflow. Do not hide a redesign inside hygiene work.

## NET SIMPLIFICATION GATE

A successful apply must make the preserved behavior easier to own, not merely rearrange it.

- Name the concrete owner, implementation, layer, dependency, configuration axis, script, test framework, or failure mode being removed or consolidated.
- Prefer deletion and consolidation before rewriting. A new abstraction is justified only when it replaces existing concepts or is required to preserve the accepted contract.
- Compare before and after with concrete nouns; do not invent a complexity score or optimize raw line count.
- Do not claim simplification for renames, moves, formatting, or added wrappers that leave the same responsibilities and failure modes in place.
- Run the real primary path after behavior-adjacent simplification.

## QUALITY DOMAINS

### Design

- A known-wrong premise that later code keeps patching around.
- Abstractions, layers, services, adapters, factories, compatibility paths, flags, or configuration axes with no current requirement.
- Restrictions with no stated basis (an observed failure, a measured external limit, or a stated requirement): caps, limits, timeouts, gates, guards, refusals, allowlists, and validation layers, including a second layer that enforces what another boundary already enforces.
- Fields, values, events, options, and schema that nothing produces or consumes.
- Multiple owners or sources of truth for the same state or decision.
- Production or enterprise machinery imposed on prototype, MVP, or core scope without evidence.

### Code

- Duplicate implementations, parallel utilities, copied logic, dead branches, unreachable paths, and obsolete compatibility code.
- Wrapper layers that add names but no policy, transformation, isolation, or reuse.
- Hand-built parsing, scheduling, storage, protocol, security, or domain logic when the existing stack or a proven library already solves the requirement.
- Defensive branches, error paths, and comments for states that cannot occur, or that another boundary already handles.

### Tests

- Tests that cannot catch the defect they claim to cover.
- Tautological assertions, implementation-copy oracles, mock-only boundary proof, unjustified substitutes, skipped/xfail residue, flaky tests, duplicate cases, and snapshots no one can review.
- Test-only helpers or fixtures that outlive all consumers, and tests that only pin a restriction or path being removed.
- Broad test frameworks whose maintenance cost exceeds the behavior they protect.

Do not delete a failing test merely because its product behavior is inconvenient. Resolve whether the contract or implementation is wrong.

### Dependencies

- Unused, duplicated, abandoned, unpinned, vulnerable, or unjustifiably heavy packages.
- A local wheel that should be replaced by an existing dependency.
- A dependency that should be replaced by a small local implementation.

Before adding or replacing a dependency, compare maintenance, license, advisories, install scripts or native code, transitive footprint, compatibility, API fit, and lockfile impact. Popularity alone is not proof, and dependency replacement must reduce total complexity.

### Scripts and Tooling

- One-off investigation scripts, temporary migrations, debug launchers, stale generators, duplicate CI helpers, and commands no real workflow calls.
- Tooling that reproduces an ecosystem command without project-specific value.
- Formatter, linter, or build configurations that overlap or fight the repository's actual gate.

### Docs and Assets

- Stale, contradictory, duplicated, generated, placeholder, or assistant-residue documentation.
- History, evidence, review transcripts, and handoff notes kept in living docs, and designs nobody is building.
- Unreferenced images, media, samples, reports, archives, and copied vendor material.
- Names and locations that obscure ownership or the canonical source.

### Structure and Generated State

- Empty directories, abandoned modules, old migrations, temp files, caches, coverage output, packaged archives, editor debris, and generated files committed without a repository contract.
- Build outputs or host distributions that should be regenerated rather than hand-edited.
- Local agent state accidentally tracked as project source.

## METHOD

1. **Inventory cheaply.** Use manifests, dependency graphs, references, imports, build scripts, test discovery, package contents, and version-control history before reading every file.
2. **Find ownership.** For each candidate, identify its producer, consumers, replacement, and user-visible effect; for a restriction, its basis.
3. **Choose an action.**

```text
keep | simplify | consolidate | replace | move | delete | defer
```

4. **Order by leverage.** Remove wrong foundations and duplicate ownership before polishing leaves.
5. **Apply in reviewable batches.** One coherent concern per batch, removing replaced code, tests, docs, and schema together; re-run the cheapest rejecting check after each.
6. **Regenerate owned outputs through the canonical producer.**
7. **Run the relevant repository gates and one real primary workflow when behavior-adjacent code changed.** After removing a restriction, run the path it restricted and report what changed.

Deletion evidence may be imports/references, runtime discovery, package manifests, generated ownership, history, and focused probes. Absence from one text search is not sufficient when the repository uses reflection, plugin or generated registration, or has external consumers.

## STOP CONDITIONS

Use `ops-ask` for the affected items, and continue with the rest, when:

- two artifacts appear to own the same contract but the canonical owner is unclear;
- removal changes a public or persistent contract;
- a proposed replacement introduces a material dependency or architecture decision;
- dirty work overlaps the cleanup target and cannot be preserved;
- the current design is so compromised that bounded cleanup is more expensive than a respawn assessment.

Use `ops-nuke` only for the last case after the user explicitly selects a full respawn.

## OUTPUT

```markdown
## Contract
- Maturity:
- Preserved behavior:
- Domains:
- Baseline:

## Actions
| Item | Evidence | Action | Effect | Check |
| --- | --- | --- | --- | --- |

## Deferred
- Item:
- Missing evidence or required decision:

## Result
- Removed or consolidated:
- Complexity reduced:
- Size: lines before -> after for source, tests, and docs (reported, not a target)
- Checks:
- Real workflow:
```

`ops-clean` does not commit, distribute, publish, deploy, or replace the default branch unless the user separately requests that workflow.
