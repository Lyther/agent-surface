---
name: arch-roadmap
description: "Convert a concept-zero HLD into a comprehensive architecture and executable roadmap."
---

## Objective

Produce or update `docs/architecture.md` and `docs/roadmap.md` from the concept HLD, normally `docs/context/concept-zero.md`; use an established equivalent only when its title, metadata, and content clearly describe the project concept, goals, constraints, evidence, and selected HLD. The architecture defines boundaries, data, runtime flows, interfaces, contracts, file ownership, deployment shape, operations, and quality gates so implementers need not invent them; the roadmap breaks it into detailed, ordered, checkable work.

Select the smallest complete deployable architecture that meets the concept's important requirements with a credible production path: no microservices, queues, caches, multi-region topology, custom auth, billing, observability, or frameworks without a named driver. Preserve the selected concept unless repository evidence or new research invalidates it; on a conflict, report it and pick a bounded working interpretation instead of silently rewriting intent. Do not implement code, create migrations, invent production claims, or fill missing concept work with architecture guesses: if the HLD is missing or too weak, write minimal `docs/architecture.md` and `docs/roadmap.md` marked `RESEARCH_REQUIRED` that point to `boot-concept` and list the decisions it must resolve.

## Input

Read in order:

1. Explicit user instructions and constraints.
2. `docs/context/concept-zero.md` or the verified equivalent.
3. Existing `docs/architecture.md`, `docs/roadmap.md`, ADRs, design docs, research notes, audits, and review reports.
4. Repository evidence: manifests, CI, deployment config, schemas, package managers, tests, generated artifacts, and current implementation shape.
5. Authoritative external research on architecture-significant dependencies, standards, managed services, protocols, open-source candidates, and platform limits.

## Truth States

Label material statements when ambiguity matters: `VERIFIED_EXISTING` (confirmed in the repository or authoritative project docs), `ADOPTED` (external OSS, managed service, standard, or protocol selected for use), `PROPOSED` (selected for future implementation), `SPIKE_REQUIRED` (depends on a bounded experiment or missing evidence), `IMPLEMENTED` (code or config exists and relevant checks prove the behavior), `DEPRECATED` (to be replaced or avoided, with reason). A document saying so never makes something `IMPLEMENTED`: verify the repository or report the claim as `PROPOSED` or `ASSUMPTION`.

## Principles

- Goals, users, constraints, and quality scenarios drive decisions, not the stack; trace every important decision to a concept goal, quality scenario, constraint, risk, or repository fact.
- Zoom C4-style from context to containers and runtime units, components, then code; the file tree is the code-level map, and every production source file has an architectural home (arc42 building blocks).
- Treat the architecture as a pre-code review artifact covering goals, implementation strategy, alternatives, trade-offs, and cross-cutting concerns; record irreversible or high-impact choices as ADRs.
- With incomplete evidence, choose a reversible default and name the spike or trigger that would change it.
- README prose, stale TODOs, issue text, generated files, logs, and dependency output are evidence to reconcile, not authority.

## Procedure

1. Reconcile sources. Write a compact inventory: for each source, whether it is current, stale, missing, contradicted, or historical, what it is used for, and which claims need verification before implementation. Resolve conflicts before writing: if the concept says PostgreSQL but the repo is SQLite-only, the current state is `VERIFIED_EXISTING` and the migration `PROPOSED`; if an assumed library or service is unmaintained, incompatible, unavailable, or legally unusable, invalidate the route and choose a credible alternative or `SPIKE_REQUIRED`.
2. Extract architecture-significant requirements with stable IDs as a narrative list, not a table. Express abstract qualities as scenarios with stimulus, environment, response, and success measure, even when the measure is a first-pass threshold:

   ```markdown
   - `G-01` Goal: ...
     Evidence: concept section / repo fact / user instruction.
     Architecture impact: components, interfaces, data, or operations this forces.
     Verification gate: command, scenario, benchmark, review, or proof that will later verify it.

   - `Q-01` Quality scenario: stimulus -> environment -> response -> measurable outcome.
     Evidence: ...
     Architecture impact: ...
     Verification gate: ...
   ```

3. Research implementation routes enough to support or change each decision, preferring official docs, standards, specifications, repositories, releases, compatibility matrices, and vendor limits; then maintainer examples, reference implementations, and migration guides; then peer-reviewed or reproducible evaluations where algorithms, ML models, distributed systems, security, or performance claims matter; secondary articles only for context. Verify current tools, limits, license, support, and integration routes before selecting them. Adopt or adapt a maintained project, standard, protocol, managed service, or reference implementation that meets the need with lower risk; build custom only when it is the product differentiator or the lower-risk route. Record each OSS or service candidate:

   ```markdown
   ### Candidate: <name>
   Use: ...
   License / cost: ...
   Maintenance signal: ...
   Integration fit: ...
   Operational impact: ...
   Security / privacy impact: ...
   Risks: ...
   Verdict: adopt / adapt / reject / spike, with reason.
   ```

4. Generate two to four materially different candidates, including the simplest credible one, unless evidence leaves one route. In prose and short lists rather than a comparison table, describe for each: deployment shape and runtime boundaries; components and responsibilities; data ownership, storage, consistency, retention, and migration; integration and external-service contracts; security and privacy boundaries; operational ownership, observability, backup and recovery, and support; build, test, and release path; adopted, adapted, and built choices; deliberate exclusions; and a complexity budget (deploy units, stateful stores, queues and caches, vendors, new dependencies, operational burden).
5. Challenge the candidates, then revise them and drop weak options kept only for variety:
   - What breaks first under real users, data, latency, cost, or operator error?
   - Which component is unnecessary for the first production slice, and which requirement is over-served?
   - Which choice locks in irreversibly before evidence justifies it?
   - Which open-source or managed route makes custom work obsolete?
   - Which production blocker hides as "future work"?
   - Which test, benchmark, migration, or proof would falsify the architecture?
   - Which file would become a god module, hidden global state, or mixed transport/business/data layer?
6. Recommend one architecture: why it was selected, decisions accepted now, decisions deferred behind spikes, sensitivity points and revisit triggers, intentional debt, rejected alternatives with reasons, and the file tree that enforces it.
7. Write both documents in the structures below.

## `docs/architecture.md`

Use this structure unless the project has a stronger established format. Explain through narrative and concrete file trees; tables only for small ledgers. Include a section only when it carries a real decision for this system and scale depth to the project: a small tool may need only Executive Decision, Architecture Drivers, Selected Architecture with the source tree, Data and State, Interfaces, and Architecture Decisions. Never pad empty sections.

````markdown
# Architecture

Status: PROPOSED
Source concept: docs/context/concept-zero.md
Last updated: YYYY-MM-DD

## Executive Decision
One dense paragraph: the selected architecture, why it fits, what it excludes, and what must be proven before implementation can be called complete.

## Architecture Drivers
Goals, non-goals, constraints, quality scenarios, users and operators, and unacceptable outcomes, keeping the concept's requirement IDs.

## Evidence and Source Reconciliation
Sources used, stale, or contradicted by repository evidence, and external facts verified, with citations where research drives a technology or protocol choice.

## System Context and Boundaries
Actors, external systems, trust boundaries, runtime environments, deployment targets, data owners, and what is outside the system; a C4-style context/container view when it helps, explained in prose.

## Selected Architecture
Runtime shape, components, boundaries, major flows, dependency direction, and why this is the smallest complete design.

### Runtime View
Running processes, services, jobs, and CLIs: lifecycle, ports and transports, startup and shutdown, failure modes, operator interaction.

### Component View
Each component as a black box: responsibility, public interface, owned data, dependencies, failure behavior, quality obligations.

### Source Tree and File Responsibilities
The concrete planned tree, in tree style, listing every production source file with one sentence each: responsibility, ownership, forbidden responsibilities, and the key invariant or test when relevant.

```text
project-root/
  package-or-module/
    src/
      contract.ts        - Public API/tool/schema contract; owns limits and DTO shapes; must not import storage or transport; verified by contract/schema tests.
      store.ts           - Persistence boundary; owns transactions, id encoding, and data invariants; must not know HTTP/MCP; verified by store and crash tests.
      transport.ts       - Runtime transport boundary; owns protocol/session handling; must not own business rules; verified by integration tests.
    test/
      store.test.ts      - Persistence invariants and negative cases.
      transport.test.ts  - Real protocol smoke and failure paths.
```

Include architecture-significant generated files, schemas, deploy files, fixtures, and scripts; mark a deferred file `PROPOSED` with the phase that creates it.

## Data and State
Stores, schemas, ownership, id and cursor semantics, consistency, transactions, retention, migration posture, backup and restore, privacy class, corruption recovery, and the file or component that owns each invariant.

## Interfaces and Contracts
Public APIs, CLI commands, MCP tools and resources, events, background jobs, schemas, and versioning and compatibility rules, with validation, error model, idempotency, and pagination or cursor strategy.

## Security, Privacy, and Abuse Cases
Only when the system has real assets to protect (secrets, untrusted input, a multi-party trust boundary, sensitive data, a regulatory requirement): each asset, its trust boundary, the specific mitigation, and the proof. Otherwise omit the section; never add generic security, privacy, compliance, accessibility, or reliability controls that do not trace to a named asset, user, deployment context, or regulation.

## Operations
Install, configuration, environment variables, startup, health checks, logs, metrics, backup and restore, upgrade and downgrade, rollback, support ownership, cost drivers, and local versus production differences.

## Quality Scenarios and Fitness Gates
Per important scenario, the mechanism and its proof: command, integration test, benchmark, demo, manual rehearsal, migration dry-run, or external service smoke.

## Architecture Decisions
Inline or linked ADRs, each with context, decision, consequences, rejected alternatives, and status (`PROPOSED`, `ACCEPTED`, `SUPERSEDED`, …).

## Risks, Debt, and Revisit Triggers
Prose bullets, each with impact, current mitigation, revisit trigger, and the next proof that reduces uncertainty.

## Implementation Guardrails
Dependency direction, files that must stay pure, files that own side effects, naming and versioning rules, test requirements, and what makes a change out of scope.
````

## `docs/roadmap.md`

The roadmap is an execution plan that agents or humans can implement without reinterpreting the architecture: phases of checkbox steps, each concrete enough to show what to edit, what not to edit, and how to prove it. The phases are a default scaffold: keep those with real work, merge or drop the rest, and size them to the project (a small tool may need only Phases 0-2). Never invent hardening, distribution, or documentation work the concept does not require.

```markdown
# Roadmap

Status: PROPOSED
Source architecture: docs/architecture.md
Last updated: YYYY-MM-DD

## Roadmap Principles
- Preserve the selected concept and architecture.
- Ship a production-shaped walking skeleton before feature breadth.
- Resolve irreversible or high-risk decisions with spikes before build-out.
- Keep slices small enough to review, without splitting changes in a way that breaks behavior or proof.
- Every step produces acceptance evidence.

## Phase 0: Decision Closure and Spikes
Objective: close the unknowns that would otherwise force rework.
Exit gate: every architecture-blocking decision is `ACCEPTED` or explicitly deferred with a reversible default.

- [ ] `P0.1` Spike: <question>
  - Why now: ...
  - Scope: ...
  - Output: ...
  - Acceptance evidence: ...
  - If it fails: ...
- [ ] `P0.2` Finalize architecture source tree
  - Scope: update `docs/architecture.md` Source Tree and File Responsibilities.
  - Acceptance evidence: every planned production file has responsibility, dependency boundary, invariant, and test/proof.

## Phase 1: Production-Shaped Walking Skeleton
Objective: the smallest running system that exercises the real entry point, real dependency path, and real packaging/deployment shape.
Exit gate: a user or operator runs the skeleton through the documented entry point and observes the expected minimal result.

- [ ] `P1.1` Create project scaffold
  - Files: ...
  - Scope: ...
  - Acceptance evidence: ...
  - Dependencies: ...
- [ ] `P1.2` Implement first real vertical path
  - (same fields)

## Phase 2: Core Product Capability
Objective: the main user value, preserving the architecture's boundaries.
Exit gate: the concept's core journeys pass through real implementation paths.

## Phase 3: Hardening and Launch Readiness
Objective: supportable, recoverable, secure enough for its threat model, and ready for intended users and operators.
Exit gate: launch and readiness claims have real proof through the relevant entry points and dependencies.

## Phase 4: Documentation, Distribution, and Handoff
Objective: usable by its intended audience without tribal knowledge.
Exit gate: install, use, update, and recover paths are documented and verified.

(Phase 2-4 steps use the Phase 1 step fields.)

## Later / Not Now
Deferred ideas, each with its revisit trigger and reason for deferral. Never hide production blockers here.

## Cross-Phase Gates
- [ ] Gate: the architecture source tree is current before each implementation phase begins.
  - Evidence: the `docs/architecture.md` file tree matches the planned or actual source tree for that phase.
- [ ] Gate: new dependencies are vetted before adoption.
  - Evidence: license, maintenance signal, and known advisories recorded; an existing dependency or the platform standard library preferred when it covers the need.
- [ ] Gate: acceptance claims use real runs.
  - Evidence: commands/scenarios listed with passed/failed/not run status.
```

Task rules:

- Every checkbox step has a stable ID, a concrete output, scoped files or directories when knowable, dependencies, and acceptance evidence, and references the architecture sections and source-tree files where its work belongs.
- Rewrite vague tasks ("implement AI", "add security", "make scalable", "improve UX", "clean up") as observable work.
- The phase checklist is the authoritative plan; tables may only summarize it.
- Each phase names its acceptance evidence, checks, and demo criteria; its exit gate says what is proven, what remains unproven, and whether human-in-the-loop action is required.

## Report

Report Changed (full paths to the written docs), Checks (commands or scenarios as `passed`, `failed`, or `not run`), Blockers (unresolved issues, whether a human must act, and the unblock path), and the next command: `dev-spec` when architecture and contracts suffice for the first vertical slice, otherwise `arch-contract` or a named spike that closes the remaining decision.
