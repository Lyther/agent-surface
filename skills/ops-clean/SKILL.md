---
name: ops-clean
description: "Remove accumulated repository debt across design, code, tests, dependencies, scripts, docs, assets, structure, and generated residue."
---

## Objective

Reduce accumulated complexity and maintenance cost while preserving the accepted product contract. `dev-chore` catches bounded drift during active development; `ops-clean` removes repository-wide debt that has already accumulated, in the domains below.

## Input

`ops-clean [target] [--domain design|code|tests|dependencies|scripts|docs|assets|structure|generated|all] [--mode inspect|plan|apply] [--depth quick|standard|deep]`

Defaults: `--domain all --mode apply --depth standard` when the user requests cleanup; otherwise inspect only.

## Contract Gate

Before deleting or consolidating:

- State the current maturity and user-visible contract, and judge every item against the user's requirements and plan; agent-written specs, review findings, and docs are not requirements unless the user accepted them.
- Identify the real build, test, package, and runtime entry points.
- Preserve unrelated dirty work.
- Establish the cheapest relevant baseline.
- Distinguish tracked source, generated output, ignored local state, and external or vendor content.

Route an item that would intentionally change supported behavior, public contracts, persistent data, or architecture through `dev-fix`, `dev-refactor`, or an architecture workflow; never hide a redesign inside hygiene work.

## Net Simplification

An apply must make the preserved behavior easier to own, not merely rearrange it.

- Name the concrete owner, implementation, layer, dependency, configuration axis, script, test framework, or failure mode removed or consolidated, and compare before and after in those nouns; invent no complexity score and do not optimize raw line count.
- Prefer deletion and consolidation over rewriting; add an abstraction only when it replaces existing concepts or the accepted contract requires it.
- Renames, moves, formatting, and added wrappers that leave the same responsibilities and failure modes in place are not simplification.

## Domains

- Design: a known-wrong premise that later code keeps patching around; abstractions, layers, services, adapters, factories, compatibility paths, flags, or configuration axes with no current requirement; restrictions with no stated basis (an observed failure, a measured external limit, or a stated requirement), meaning caps, limits, timeouts, gates, guards, refusals, allowlists, and validation layers, including a second layer that enforces what another boundary already enforces; fields, values, events, options, and schema that nothing produces or consumes; multiple owners or sources of truth for the same state or decision; production or enterprise machinery imposed on prototype, MVP, or core scope without evidence.
- Code: duplicate implementations, parallel utilities, copied logic, dead branches, unreachable paths, and obsolete compatibility code; wrappers that add names but no policy, transformation, isolation, or reuse; hand-built parsing, scheduling, storage, protocol, security, or domain logic that the existing stack or a proven library already solves; defensive branches, error paths, and comments for states that cannot occur or that another boundary already handles.
- Tests: tests that cannot catch the defect they claim to cover; tautological assertions, implementation-copy oracles, mock-only boundary proof, unjustified substitutes, skipped/xfail residue, flaky tests, duplicate cases, and snapshots no one can review; test-only helpers or fixtures that outlive all consumers, and tests that only pin a restriction or path being removed; broad test frameworks that cost more to maintain than the behavior they protect. Never delete a failing test merely because its product behavior is inconvenient; resolve whether the contract or the implementation is wrong.
- Dependencies: unused, duplicated, abandoned, unpinned, vulnerable, or unjustifiably heavy packages; a local wheel that an existing dependency should replace, or a dependency that a small local implementation should replace. Before adding or replacing one, compare maintenance, license, advisories, install scripts or native code, transitive footprint, compatibility, API fit, and lockfile impact; popularity alone is not proof, and a replacement must reduce total complexity.
- Scripts and tooling: one-off investigation scripts, temporary migrations, debug launchers, stale generators, duplicate CI helpers, and commands no real workflow calls; tooling that reproduces an ecosystem command without project-specific value; formatter, linter, or build configurations that overlap or fight the repository's actual gate.
- Docs and assets: stale, contradictory, duplicated, generated, placeholder, or assistant-residue docs; history, evidence, review transcripts, and handoff notes kept in living docs, and designs nobody is building; unreferenced images, media, samples, reports, archives, and copied vendor material; names and locations that obscure ownership or the canonical source.
- Structure and generated state: empty directories, abandoned modules, old migrations, temp files, caches, coverage output, packaged archives, editor debris, and generated files committed without a repository contract; build outputs or host distributions that should be regenerated rather than hand-edited; local agent state accidentally tracked as project source.

## Method

1. Inventory cheaply from manifests, dependency graphs, references, imports, build scripts, test discovery, package contents, and version-control history before reading every file.
2. For each candidate, identify its producer, consumers, replacement, and user-visible effect; for a restriction, its basis.
3. Choose an action: `keep | simplify | consolidate | replace | move | delete | defer`.
4. Order by leverage: remove wrong foundations and duplicate ownership before polishing leaves.
5. Apply in reviewable batches of one coherent concern, removing replaced code, tests, docs, and schema together; rerun the cheapest rejecting check after each batch.
6. Regenerate owned outputs through the canonical producer.
7. Run the relevant repository gates, plus one real primary workflow when behavior-adjacent code changed. After removing a restriction, run the path it restricted and report what changed.

Deletion evidence may be imports or references, runtime discovery, package manifests, generated ownership, history, and focused probes. Absence from one text search is not enough when the repository uses reflection or plugin or generated registration, or has external consumers.

## Stop Conditions

Use `ops-ask` for the affected items, and continue with the rest, when:

- two artifacts appear to own the same contract and the canonical owner is unclear;
- removal changes a public or persistent contract;
- a proposed replacement introduces a material dependency or architecture decision;
- dirty work overlaps the cleanup target and cannot be preserved;
- the current design is so compromised that bounded cleanup costs more than a respawn assessment.

Use `ops-nuke` only for the last case, after the user explicitly selects a full respawn.

## Output

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
