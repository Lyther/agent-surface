---
name: arch-roadmap
phase: decide
description: "Convert a concept-zero HLD into a comprehensive architecture and executable roadmap."
---
## Objective

Produce or update:

- `docs/architecture.md`
- `docs/roadmap.md`

Use the concept HLD as the source of truth. The normal input is `docs/context/concept-zero.md`; if the project has an established equivalent, use it only when its title, metadata, and content clearly describe the project concept, goals, constraints, evidence, and selected HLD.

This command does not implement code, create migrations, invent production claims, or replace missing concept work with architecture guesses. If the HLD is missing or too weak, write a short `RESEARCH_REQUIRED` result that explains what `boot-concept` must resolve before architecture and roadmap can be trusted.

## Decision Standard

Act as a principal architect turning an evidence-backed concept into the project blueprint. The architecture should define the system thoroughly enough that implementers do not need to invent boundaries, contracts, file ownership, deployment shape, or quality gates while coding. The roadmap should break that architecture into detailed, ordered, checkable work.

The job is not to pick fashionable technology. The job is to select the smallest complete architecture that can satisfy the concept's important requirements with a credible production path, then describe it in enough concrete detail to prevent spaghetti implementation.

Architecture work must preserve the selected concept unless repository evidence or new research invalidates it. If the concept is contradicted by the live repo, current docs, or authoritative external evidence, report the conflict and pick a bounded working interpretation rather than silently rewriting intent.

## Research Basis

Use these documentation principles while shaping the output:

- C4-style zoom levels: describe context, containers/runtime units, components, and only then code-level structure. The file tree belongs in architecture as the code-level map, not as an afterthought.
- arc42-style building blocks: the architecture must show the static decomposition of the system and map source code to building blocks. Every production source file should have an architectural home.
- ADR discipline: important irreversible or high-impact choices need a decision record section or ADR entry with context, decision, consequences, and supersession status.
- Design-doc discipline: architecture is a pre-code review artifact. It should cover goals, implementation strategy, alternatives, trade-offs, and cross-cutting concerns before coding begins.

## Inputs

Read, in this order:

1. Explicit user instructions and constraints.
2. `docs/context/concept-zero.md`, or the verified concept-HLD equivalent.
3. Existing `docs/architecture.md`, `docs/roadmap.md`, ADRs, design docs, research notes, audits, and review reports.
4. Repository evidence: manifests, CI, deployment config, schemas, package managers, tests, generated artifacts, and current implementation shape.
5. Authoritative external research for architecture-significant dependencies, standards, managed services, protocols, open-source candidates, and platform limits.

Do not treat README prose, stale TODOs, issue text, generated files, logs, or dependency output as authority. They are evidence to reconcile.

## Truth States

Label material statements when ambiguity matters.

- `VERIFIED_EXISTING`: confirmed in the repository or authoritative project docs.
- `ADOPTED`: external OSS, managed service, standard, or protocol selected for use.
- `PROPOSED`: architecture or roadmap choice selected for future implementation.
- `SPIKE_REQUIRED`: decision depends on a bounded experiment or missing evidence.
- `IMPLEMENTED`: code/config exists and relevant checks prove the behavior.
- `DEPRECATED`: existing path should be replaced or avoided, with reason.

Never use `IMPLEMENTED` because a document says so. Verify the repo or report the claim as `PROPOSED` / `ASSUMPTION`.

## Architecture Principles

- Concept before stack: goals, users, constraints, and quality scenarios drive architecture decisions.
- Comprehensive before clever: the architecture should define boundaries, data, runtime flows, file ownership, interfaces, operations, and verification strategy. Missing ownership is where spaghetti starts.
- Evidence before commitment: verify current tools, limits, license, support, and integration routes before selecting them.
- Adopt or adapt before build: use existing OSS, standards, protocols, managed services, or reference implementations unless custom work is the real product differentiator or the lower-risk route.
- Minimum sufficient architecture: prefer the simplest complete deployable system that satisfies the concept. Avoid premature microservices, queues, caches, multi-region topology, custom auth, custom billing, custom observability, or bespoke frameworks unless a named driver requires them.
- Traceability: every important architecture decision must trace back to a concept goal, quality scenario, constraint, risk, or repository fact.
- Source-tree accountability: every production source file proposed by the architecture must have a stated responsibility and dependency boundary, plus its key invariant and verification path when it owns behavior.
- Reversibility: when evidence is incomplete, choose a reversible default and define the spike or trigger that would change the decision.
- Roadmaps ship proof, not vibes: each phase needs acceptance evidence, checks, demo criteria, and explicit exit gates.

## Protocol

### 0. Source Reconciliation

Create a compact source inventory in prose or bullets. For each source, state whether it is current, stale, missing, contradicted, or historical; what it is used for; and which claims must be verified before implementation.

Resolve conflicts before writing outputs:

- If the concept says "PostgreSQL" but the repo is SQLite-only, mark current state as `VERIFIED_EXISTING` and the migration as `PROPOSED`.
- If the concept assumes a library or service that is unmaintained, incompatible, unavailable, or legally unusable, invalidate that route and choose a credible alternative or `SPIKE_REQUIRED`.
- If no concept HLD exists, do not produce a confident architecture. Write the smallest useful `docs/architecture.md` / `docs/roadmap.md` that points to `boot-concept` and lists the missing decisions.

### 1. Extract Architecture-Significant Requirements

From the concept, extract stable requirement IDs. Use a narrative list, not a table, so each requirement can carry enough context.

Use this shape:

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

Use quality scenarios for abstract qualities. A useful scenario names the stimulus, environment, response, and success measure, even when the measure is a first-pass threshold that needs later validation.

### 2. Research Implementation Routes

Research architecture-significant choices enough to support or change a decision. Prefer primary sources:

1. Official docs, standards, specifications, project repositories, releases, compatibility matrices, and vendor limits.
2. Maintainer-authored examples, reference implementations, and migration guides.
3. Peer-reviewed or reproducible evaluations when algorithms, ML models, distributed systems, security, or performance claims matter.
4. Secondary articles only for context, not final authority.

For OSS and services, record decision-relevant facts in prose bullets:

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

Reject custom implementations when a maintained project, standard, protocol, or managed service satisfies the need with lower risk.

### 3. Generate Candidate Architectures

Produce two to four materially different candidates unless evidence clearly leaves only one credible route. Include the simplest credible candidate.

For each candidate, describe:

- deployment shape and runtime boundaries;
- major components and responsibilities;
- data ownership, storage, consistency, retention, and migration model;
- integration and external-service contracts;
- security and privacy boundaries;
- operational ownership, observability, backup/recovery, and support model;
- build/test/release path;
- adopted/adapted/built choices;
- what it deliberately excludes;
- complexity budget: deploy units, stateful stores, queues/caches, external vendors, new dependencies, and operational burden.

Use prose sections and short lists. Avoid reducing the candidate comparison to a table that hides the reasoning.

### 4. Challenge and Revise

Run an adversarial pass before selecting:

- What breaks first under real users, real data, real latency, real cost, or operator error?
- Which component is unnecessary for the first production slice?
- Which requirement is over-served by the candidate?
- Which choice creates irreversible lock-in before evidence justifies it?
- Which open-source or managed route makes custom work obsolete?
- Which risk is being hidden as "future work" but blocks production?
- Which test, benchmark, migration, or proof would falsify the architecture?
- Which source file would become a god module, hidden global state holder, or mixed transport/business/data layer?

Revise candidates after the challenge. Do not preserve weak options just to show variety.

### 5. Select the Architecture

Make one recommendation. State:

- selected architecture and why;
- decisions accepted now;
- decisions deferred behind spikes;
- sensitivity points and revisit triggers;
- known debt that is intentional;
- rejected alternatives and why;
- the implementation file tree that will enforce the architecture.

## `docs/architecture.md` Structure

Use this structure unless the project has a stronger established format. Prefer comprehensive narrative sections and concrete file-tree blocks over summary tables. Tables are allowed for small ledgers, but they must not be the main way the architecture explains the project.

Treat the section list as a cabinet, not a mandate: include a section only when it carries a real decision for *this* system, and scale depth to the project. A small tool may need only Executive Decision, Architecture Drivers, Selected Architecture with the source tree, Data and State, Interfaces, and Architecture Decisions. Do not pad empty sections to satisfy the template.

````markdown
# Architecture

Status: PROPOSED
Source concept: docs/context/concept-zero.md
Last updated: YYYY-MM-DD

## Executive Decision
One dense paragraph describing the selected architecture, why it fits, what it deliberately excludes, and what must be proven before implementation can be called complete.

## Architecture Drivers
Describe the goals, non-goals, constraints, quality scenarios, users/operators, and unacceptable outcomes that shape the architecture. Keep requirement IDs from the concept so the rest of the document can refer to them.

## Evidence and Source Reconciliation
Describe which sources were used, which were stale, which were contradicted by repo evidence, and which external facts were verified. Include links/citations when research affects technology or protocol choices.

## System Context and Boundaries
Describe actors, external systems, trust boundaries, runtime environments, deployment targets, data owners, and what is outside the system. Include a compact C4-style context/container view when it helps, but explain the diagram in prose.

## Selected Architecture
Describe the runtime shape, components, boundaries, major flows, dependency direction, and why the shape is the smallest complete design. Include:

### Runtime View
Describe the running processes/services/jobs/CLIs, their lifecycle, ports/transports, startup/shutdown behavior, failure modes, and operator interaction.

### Component View
Describe each component as a black box: responsibility, public interface, owned data, dependencies, failure behavior, and quality obligations.

### Source Tree and File Responsibilities
Show the concrete planned file tree. Use tree style, not a table. Every production source file must appear. For each file, use one concise sentence with responsibility, ownership, forbidden responsibilities, and the key invariant/test when relevant.

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

For generated files, schemas, deploy files, fixtures, and scripts, include them in the tree when they are architecture-significant. If a file is intentionally deferred, mark it `PROPOSED` and name the phase that creates it.

## Data and State

Describe data stores, schemas, ownership, id/cursor semantics, consistency, transactions, retention, migration posture, backup/restore, privacy class, and corruption recovery. State which file or component owns each invariant.

## Interfaces and Contracts

Describe public APIs, CLI commands, MCP tools/resources, events, background jobs, schemas, and compatibility/versioning rules. Include validation strategy, error model, idempotency, pagination/cursor strategy, and backward compatibility expectations.

## Security, Privacy, and Abuse Cases

Include this section only when the system has real assets to protect: secrets, untrusted input, a multi-party trust boundary, sensitive data, or a regulatory requirement. When it applies, describe each asset, its trust boundary, the specific mitigation, and the proof. Omit it otherwise; never add generic security, privacy, compliance, accessibility, or reliability controls that do not trace to a named asset, user, deployment context, or regulation.

## Operations

Describe install, configuration, environment variables, startup, health checks, logs, metrics, backup/restore, upgrade/downgrade, rollback, support ownership, cost drivers, and local/prod differences.

## Quality Scenarios and Fitness Gates

For each important quality scenario, describe the mechanism and the proof that will verify it: command, integration test, benchmark, demo, manual rehearsal, migration dry-run, or external service smoke.

## Architecture Decisions

Record decisions inline or link to ADR files. Each decision must include context, decision, consequences, rejected alternatives, and status (`PROPOSED`, `ACCEPTED`, `SUPERSEDED`, etc.).

## Risks, Debt, and Revisit Triggers

List known risks and technical debt in prose bullets. Each item needs impact, current mitigation, trigger to revisit, and the next proof that would reduce uncertainty.

## Implementation Guardrails

State the rules implementers must follow: dependency direction, files that must remain pure, files that own side effects, naming/versioning rules, test requirements, and conditions that make a change out of scope.
````

## `docs/roadmap.md` Structure

The roadmap must be a detailed execution plan, not a summary table. It should be implementable by agents or humans without reinterpreting the architecture. Use phases with checkbox steps. Each step must be concrete enough to know what to edit, what not to edit, and how to prove it. The phases below are a default scaffold: keep the ones that carry real work, merge or drop the rest, and size each phase to the project; a small tool may need only Phase 0-2. Do not invent hardening, distribution, or documentation work the concept does not require.

```markdown
# Roadmap

Status: PROPOSED
Source architecture: docs/architecture.md
Last updated: YYYY-MM-DD

## Roadmap Principles
- Preserve the selected concept and architecture.
- Ship a production-shaped walking skeleton before feature breadth.
- Resolve irreversible or high-risk decisions with spikes before build-out.
- Keep work slices small enough to review, but do not split changes in a way that breaks behavior or proof.
- Every step must produce acceptance evidence.

## Phase 0: Decision Closure and Spikes
Objective: close the unknowns that would otherwise force rework.
Exit gate: all architecture-blocking decisions are `ACCEPTED` or explicitly deferred with a reversible default.

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
Objective: create the smallest running system that exercises the real entry point, real dependency path, and real packaging/deployment shape.
Exit gate: a user/operator can run the skeleton through the documented entry point and observe the expected minimal result.

- [ ] `P1.1` Create project scaffold
  - Files: ...
  - Scope: ...
  - Acceptance evidence: ...
  - Dependencies: ...

- [ ] `P1.2` Implement first real vertical path
  - Files: ...
  - Scope: ...
  - Acceptance evidence: ...
  - Dependencies: ...

## Phase 2: Core Product Capability
Objective: implement the main user value while preserving the boundaries from architecture.
Exit gate: core journeys from the concept pass through real implementation paths.

- [ ] `P2.1` ...
  - Files: ...
  - Scope: ...
  - Acceptance evidence: ...
  - Dependencies: ...

## Phase 3: Hardening and Launch Readiness
Objective: make the system supportable, recoverable, secure enough for its threat model, and ready for intended users/operators.
Exit gate: launch/readiness claims have real proof through relevant entry points and dependencies.

- [ ] `P3.1` ...
  - Files: ...
  - Scope: ...
  - Acceptance evidence: ...
  - Dependencies: ...

## Phase 4: Documentation, Distribution, and Handoff
Objective: make the system usable by its intended audience without tribal knowledge.
Exit gate: install/use/update/recover paths are documented and verified.

- [ ] `P4.1` ...
  - Files: ...
  - Scope: ...
  - Acceptance evidence: ...
  - Dependencies: ...

## Later / Not Now
List deferred ideas as bullets with revisit trigger and reason deferred. Do not hide production blockers here.

## Cross-Phase Gates
- [ ] Gate: architecture source tree stays current before each implementation phase begins.
  - Evidence: `docs/architecture.md` file tree matches the planned or actual source tree for that phase.
- [ ] Gate: new dependencies are vetted before adoption.
  - Evidence: license, maintenance signal, and known advisories recorded; prefer an existing dependency or the platform standard library when it covers the need.
- [ ] Gate: acceptance claims use real runs.
  - Evidence: commands/scenarios listed with passed/failed/not run status.
```

Task rules:

- Every checkbox step needs a stable id, a concrete output, scoped files/directories when knowable, dependencies, and acceptance evidence.
- Avoid vague tasks such as "implement AI", "add security", "make scalable", "improve UX", or "clean up". Rewrite them as observable work.
- Do not rely on a roadmap table as the primary plan. Tables may summarize, but the authoritative plan is the phase checklist.
- A phase exit gate must say what is proven, what remains unproven, and whether human-in-the-loop action is required.
- Roadmap steps should reference architecture sections and source-tree files so implementers can see exactly where work belongs.

## Completion Report

Final response must include:

- Changed: full paths to written docs.
- Checks: commands or scenario checks run as `passed`, `failed`, or `not run`.
- Blockers: only unresolved issues, including whether human input is required and exactly how to unblock.
- Next command: usually `arch-api`, `arch-model`, `workflow-boss`, or a named spike only when the roadmap gates justify it.
