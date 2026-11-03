---
name: boot-new
description: "Bootstrap the smallest runnable project structure that fits the product goal, stack, and requested maturity."
---

## Objective

Create or repair a project scaffold that supports the first real end-to-end behavior and the next development step, without speculative architecture, tooling, policy, or operational machinery.

## Input

`boot-new [check|run] [--maturity prototype|mvp|core|usable|production|business|auto]`

- `check`: inspect and return the smallest coherent scaffold plan without writing.
- `run`: apply the plan, build the first runnable slice, and verify it.
- A bare invocation runs `check` first.

Resolve from the request and repository: the product outcome and first user journey; maturity level and claims; language, framework, package manager, and deployment target; data, integration, platform, licensing, and compatibility constraints; the expected entry point and acceptance command; files or local state that must stay untouched. Use `ops-ask` only when a missing answer materially changes those decisions, never for facts in manifests, lockfiles, code, or authoritative docs.

## Maturity

The scaffold for each maturity level:

- Prototype: one executable path that resolves the named uncertainty, a minimal manifest, and run instructions; no CI, deployment, plugin system, compatibility layer, editor workspace, or extensive docs unless the experiment needs them; explicitly disposable, no production claim.
- MVP: one complete primary journey on real components; standard manifest and lockfile, focused tests, basic errors and data integrity, `.gitignore`, concise run instructions; one simple configuration path; CI or packaging only when needed to deliver; defer scale, extensibility, secondary workflows, and enterprise controls.
- Core: cohesive domain boundaries, stable central interfaces, deterministic build and test commands, and the persistence and integrations the core contract requires; no peripheral shell or operational platform unless it is part of the core.
- Usable: complete primary journeys, understandable errors, recovery, accessibility, configuration, user and operator docs, plus the packaging and maintenance commands regular use needs.
- Production: deployment, migration, rollback, observability, recovery, resource limits, security controls, and performance evidence derived from the real environment, data, threat model, and SLOs; no generic checklist substitutes for those inputs.
- Business or regulated: tenancy, audit, compliance, governance, support, and organizational controls only as the actual business or regulatory contract requires, never because the project may become commercial.

## Procedure

1. Inspect manifests, lockfiles, source layout, build scripts, CI, ignores, docs, and Git status, and identify the ecosystem's normal project shape.
2. Choose the minimum structure: every directory and file has a current producer, consumer, or execution role; create no empty architecture, roadmap, context, scripts, assets, or test directories for future use.
3. Reuse the stack and ecosystem conventions; research an existing library before hand-building established parsing, protocol, scheduling, storage, security, physics, or domain logic.
4. Keep one dependency manifest, one configuration path, one primary entry point, and one command per routine action.
5. Scaffold enough product code for the first vertical slice to execute observable behavior, not just folders and configuration.
6. Verify from a clean invocation through the documented install, build, test, and run path that applies to the maturity level.

Baseline, applicable items only:

- the ecosystem-standard manifest and lockfile;
- source and test files the first slice needs;
- `.gitignore` for generated output, local tooling, credentials, real environment files, private keys, and platform debris;
- `.env.example` when environment configuration exists, with names and dummy values only;
- a concise `README.md`: purpose, prerequisites, run command, test command, current limits;
- an explicit license when distribution requires one.

Initialize Git only for a new unversioned project when version control is part of the requested setup.

## Tooling

- Use the repository's package manager and pinned tools.
- Add one formatter/linter path only when the project has selected and gated it; never overlapping formatters, import organizers, or generic pre-commit suites.
- Add CI when remote integration, collaboration, publication, or the maturity contract requires it, calling the same local commands rather than defining a second build.
- Add editor or agent configuration only when the user asks or the repository already owns it; user-local overlays stay untracked.
- Add scripts only for repeatable workflows the ecosystem's normal commands cannot express clearly.
- Add no database, cache, queue, service, container, monorepo, microservice, frontend shell, or cloud resource without a current requirement.
- Validate external input and preserve data integrity at the real trust boundaries, and match controls to reachable threats and maturity, keeping P0 requirements for auth, authorization, cryptography, payments, destructive effects, and sensitive data.

## Existing Projects

- Preserve the proven stack and conventions; never migrate technology for taste or relocate files to match this skill.
- Preserve staged, unstaged, ignored, and untracked work, and stronger established checks and controls.
- Remove or replace stale scaffold only when ownership and behavior are proven.
- Route broad accumulated cleanup to `ops-clean`, and intentional architecture or behavior changes to the relevant `arch-*` or `dev-*` workflow.
- For an `ops-nuke` respawn, the approved respawn contract overrides the historical layout; the old implementation is reference evidence, not a template.

## Output

```markdown
## Scaffold Contract
- Goal and first journey:
- Maturity:
- Stack:
- Preserved state:

## Minimal Structure
| Path | Current purpose | Producer / consumer |
| --- | --- | --- |

## Commands
- Install:
- Build/run:
- Test:

## Verification
- Scenario:
- Result:
- Blocked boundaries:

## Deferred
- Capability:
- Evidence required before adding it:
```

`COMPLETE` requires the scaffold and first vertical slice to run through the documented entry point with the applicable real components; a directory tree, generated boilerplate, or green substitute-backed test is not completion. Missing credentials or services make the affected live proof `BLOCKED`, never a reason for fake integration.
