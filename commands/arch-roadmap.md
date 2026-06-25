---
name: arch-roadmap
phase: decide
description: "Convert a concept-zero HLD into architecture decisions and a staged roadmap."
---
## Objective

Produce or update:

- `docs/architecture.md`
- `docs/roadmap.md`

Use the concept HLD as the source of truth. The normal input is `docs/context/concept-zero.md`; if the project has an established equivalent, use it only when its title, metadata, and content clearly describe the project concept, goals, constraints, evidence, and selected HLD.

This command does not implement code, create migrations, invent production claims, or replace missing concept work with architecture guesses. If the HLD is missing or too weak, write a short `RESEARCH_REQUIRED` result that explains what `boot-concept` must resolve before architecture and roadmap can be trusted.

## Decision Standard

Act as a principal architect turning an evidence-backed concept into an execution plan. The job is not to pick fashionable technology. The job is to make the smallest set of architecture decisions that can satisfy the concept's important requirements with a credible production path.

Architecture work must preserve the selected concept unless repository evidence or new research invalidates it. If the concept is contradicted by the live repo, current docs, or authoritative external evidence, report the conflict and pick a bounded working interpretation rather than silently rewriting intent.

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

| State | Meaning |
|---|---|
| `VERIFIED_EXISTING` | Confirmed in the repository or authoritative project docs. |
| `ADOPTED` | External OSS, managed service, standard, or protocol selected for use. |
| `PROPOSED` | Architecture or roadmap choice selected for future implementation. |
| `SPIKE_REQUIRED` | Decision depends on a bounded experiment or missing evidence. |
| `IMPLEMENTED` | Code/config exists and relevant checks prove the behavior. |
| `DEPRECATED` | Existing path should be replaced or avoided, with reason. |

Never use `IMPLEMENTED` because a document says so. Verify the repo or report the claim as `PROPOSED` / `ASSUMPTION`.

## Architecture Principles

- Concept before stack: goals, users, constraints, and quality scenarios drive architecture decisions.
- Evidence before commitment: verify current tools, limits, license, support, and integration routes before selecting them.
- Adopt or adapt before build: use existing OSS, standards, protocols, managed services, or reference implementations unless custom work is the real product differentiator or the lower-risk route.
- Minimum sufficient architecture: prefer the simplest deployable system that satisfies the concept. Avoid premature microservices, queues, caches, multi-region topology, custom auth, custom billing, custom observability, or bespoke frameworks unless a named driver requires them.
- Traceability: every important architecture decision must trace back to a concept goal, quality scenario, constraint, risk, or repository fact.
- Reversibility: when evidence is incomplete, choose a reversible default and define the spike or trigger that would change the decision.
- Roadmaps ship proof, not vibes: each phase needs acceptance evidence, checks, demo criteria, and explicit exit gates.

## Protocol

### 0. Source Reconciliation

Create a compact source inventory:

| Source | Status | Used for | Notes |
|---|---|---|---|
| `docs/context/concept-zero.md` | current / stale / missing | concept HLD | ... |
| `docs/architecture.md` | existing / absent | prior decisions | ... |
| `docs/roadmap.md` | existing / absent | prior plan | ... |
| repo evidence | current | implementation facts | ... |

Resolve conflicts before writing outputs:

- If the concept says "PostgreSQL" but the repo is SQLite-only, mark current state as `VERIFIED_EXISTING` and the migration as `PROPOSED`.
- If the concept assumes a library or service that is unmaintained, incompatible, unavailable, or legally unusable, invalidate that route and choose a credible alternative or `SPIKE_REQUIRED`.
- If no concept HLD exists, do not produce a confident architecture. Write the smallest useful `docs/architecture.md` / `docs/roadmap.md` that points to `boot-concept` and lists the missing decisions.

### 1. Extract Architecture-Significant Requirements

From the concept, extract stable requirement IDs.

| ID | Type | Requirement | Evidence | Architecture impact |
|---|---|---|---|---|
| `G-01` | goal | ... | concept section / source | ... |
| `Q-01` | quality scenario | stimulus -> response -> measure | source | ... |
| `C-01` | constraint | ... | user / repo / law / platform | ... |
| `N-01` | non-goal | ... | concept | avoids scope ... |

Use quality scenarios for abstract qualities. A useful scenario names the stimulus, environment, response, and success measure, even when the measure is a first-pass threshold that needs later validation.

### 2. Research Implementation Routes

Research only architecture-significant choices and only enough to change or support a decision. Prefer primary sources:

1. Official docs, standards, specifications, project repositories, releases, compatibility matrices, and vendor limits.
2. Maintainer-authored examples, reference implementations, and migration guides.
3. Peer-reviewed or reproducible evaluations when algorithms, ML models, distributed systems, security, or performance claims matter.
4. Secondary articles only for context, not final authority.

For OSS and services, record the decision-relevant facts:

| Candidate | Use | License / cost | Maintenance | Integration fit | Risk | Verdict |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | adopt / adapt / reject / spike |

Reject custom implementations when a maintained project, standard, protocol, or managed service satisfies the need with lower risk.

### 3. Generate Candidate Architectures

Produce two to four materially different candidates unless evidence clearly leaves only one credible route. Include the simplest credible candidate.

For each candidate:

- deployment shape and runtime boundaries;
- major components and responsibilities;
- data ownership, storage, and consistency model;
- integration and external-service contracts;
- security and privacy boundaries;
- operational ownership, observability, backup/recovery, and support model;
- build/test/release path;
- adoption/adaptation/build choices;
- what it deliberately excludes.

Add a complexity budget:

| Candidate | Deploy units | Stateful stores | Queues/caches | External vendors | New dependencies | Ops burden |
|---|---:|---:|---:|---:|---:|---|
| ... | ... | ... | ... | ... | ... | low / medium / high |

### 4. Challenge and Revise

Run an adversarial pass before selecting:

- What breaks first under real users, real data, real latency, real cost, or operator error?
- Which component is unnecessary for the first production slice?
- Which requirement is over-served by the candidate?
- Which choice creates irreversible lock-in before evidence justifies it?
- Which open-source or managed route makes custom work obsolete?
- Which risk is being hidden as "future work" but blocks production?
- Which test, benchmark, migration, or proof would falsify the architecture?

Revise candidates after the challenge. Do not preserve weak options just to show variety.

### 5. Select the Architecture

Make one recommendation. Use a compact decision matrix:

| Criterion | Weight | Candidate A | Candidate B | Candidate C | Notes |
|---|---:|---:|---:|---:|---|
| concept fit | high | ... | ... | ... | ... |
| first-slice speed | medium | ... | ... | ... | ... |
| operational simplicity | high | ... | ... | ... | ... |
| reversibility | medium | ... | ... | ... | ... |
| risk reduction | high | ... | ... | ... | ... |

Then state:

- selected architecture and why;
- decisions that are accepted now;
- decisions deferred behind spikes;
- sensitivity points and revisit triggers;
- known debt that is intentional;
- rejected alternatives and why.

## `docs/architecture.md` Structure

Use this structure unless the project has a stronger established format.

```markdown
# Architecture

## Status
Status: PROPOSED
Source concept: docs/context/concept-zero.md
Last updated: YYYY-MM-DD

## Executive Decision
One dense paragraph describing the selected architecture, why it fits, and what is intentionally not included.

## Source and Evidence Inventory
| Source | Status | Used for | Notes |
|---|---|---|---|

## Requirements Traceability
| ID | Requirement | Architecture response | Verification / gate |
|---|---|---|---|

## System Context
Users, operators, external systems, trust boundaries, and primary flows.

## Selected Architecture
Component responsibilities, runtime boundaries, data flow, deployment shape, and integration contracts. Prefer concise C4-style context/container/component views when they add clarity; do not draw every code-level class.

## Data and State
System-of-record choices, lifecycle, retention, migration posture, backup, consistency, privacy classification, and failure behavior.

## Technology Decisions
| Area | Decision | State | Rationale | Alternatives rejected |
|---|---|---|---|---|

## Open Source / Service Adoption
| Capability | Adopt / adapt / build | Selected route | Evidence | Risk |
|---|---|---|---|---|

## Quality Scenarios and Fitness Gates
| Scenario | Architecture mechanism | Evidence to collect | Gate |
|---|---|---|---|

## Security, Privacy, and Compliance
Assets, trust boundaries, auth/authz, secrets, dependency risk, auditability, abuse cases, and compliance assumptions required by the concept or repo evidence.

## Operations
Deployment, config, observability, alerts, backup/restore, incident response, rollback, support ownership, and cost drivers.

## Risks, Debt, and Revisit Triggers
| Item | Impact | Trigger | Owner / next proof |
|---|---|---|---|

## ADR Index
| Decision | Status | Link / section |
|---|---|---|
```

## `docs/roadmap.md` Structure

The roadmap must be staged, evidence-driven, and implementable by agents or humans without reinterpreting the architecture.

```markdown
# Roadmap

## Status
Status: PROPOSED
Source architecture: docs/architecture.md
Last updated: YYYY-MM-DD

## Roadmap Principles
- Preserve the selected concept.
- Ship a production-shaped walking skeleton before feature breadth.
- Resolve irreversible or high-risk decisions with spikes before build-out.
- Each task must have acceptance evidence.

## Phase 0: Decision Closure and Spikes
| Task | Why now | Output | Acceptance evidence |
|---|---|---|---|

## Phase 1: Production-Shaped Walking Skeleton
| Task | Scope | Acceptance evidence | Dependencies |
|---|---|---|---|

## Phase 2: Core Product Capability
| Task | Scope | Acceptance evidence | Dependencies |
|---|---|---|---|

## Phase 3: Hardening and Launch Readiness
| Task | Scope | Acceptance evidence | Dependencies |
|---|---|---|---|

## Later / Not Now
| Idea | Revisit trigger | Reason deferred |
|---|---|---|

## Cross-Phase Gates
| Gate | Required before | Evidence |
|---|---|---|
```

Task rows must include observable acceptance evidence: a test, command, demo, benchmark, document, migration dry-run, deployment proof, or operator rehearsal. Avoid vague tasks such as "implement AI", "add security", "make scalable", or "improve UX".

## Completion Report

Final response must include:

- Changed: full paths to written docs.
- Checks: commands or scenario checks run as `passed`, `failed`, or `not run`.
- Blockers: only unresolved issues, including whether human input is required and exactly how to unblock.
- Next command: usually `arch-api`, `arch-model`, `workflow-boss`, or a named spike only when the roadmap gates justify it.
