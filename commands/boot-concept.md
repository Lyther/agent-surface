---
name: boot-concept
aliases:
  - concept-zero
phase: bootstrap
description: "Research and write the concept-zero high-level design for a project."
---
## Objective

Create or update `docs/context/concept-zero.md`, the canonical concept-level HLD for a new or existing project. `docs/architecture.md` and `docs/roadmap.md` should be derived from this document by `arch-roadmap`, not invented in parallel.

The concept HLD answers:

- what problem is being solved;
- for whom;
- what success and unacceptable failure look like;
- what the system must and must not do;
- which existing products, OSS projects, standards, papers, protocols, managed services, and reference implementations already cover the problem;
- which concept is selected and why;
- what remains uncertain before detailed architecture;
- what credible path exists to real production use.

Do not write source code, detailed schemas, endpoint-by-endpoint APIs, migration files, UI mockups, or task-level implementation plans. Capture the concept, the evidence, and the decision.

## Modes

- `boot-concept check`: read-only inventory of existing context, evidence gaps, contradictions, and whether a credible concept HLD can be written.
- `boot-concept run`: write or update `docs/context/concept-zero.md`; write `docs/context/concept-zero-research.md` only when the evidence ledger is too large for the main document.
- Bare `boot-concept`: perform the check first, then proceed with `run` when the inputs are coherent enough. If product intent is ambiguous, state a working assumption and continue unless the next step would lock in the wrong product.

## Decision Standard

Act as a product-minded principal architect and research lead. Be skeptical, but do not inflate process. The best concept-zero document is dense enough to prevent bad architecture and small enough to stay read.

You may narrow implementation scope to preserve the core outcome and production path. You may recommend adoption, adaptation, procurement, partnership, or research instead of custom development.

You may not silently change the target problem, users, hard constraints, legal obligations, or explicit user decisions. Do not ask the user to choose from an unfiltered option list. Research, challenge, and recommend one direction. Ask only when alternatives represent different product intent and evidence cannot resolve the choice.

## Inputs

Use:

1. The user brief, goals, constraints, corrections, and explicit exclusions.
2. Existing `docs/context/`, `docs/design/`, `docs/research/`, `docs/adr/`, and project-specific equivalents.
3. Prior concepts, PRDs, architecture docs, roadmaps, reviews, ADRs, benchmark notes, incident notes, and feasibility reports.
4. Repository evidence when implementation already exists: manifests, tests, CI, schemas, package managers, deployment config, APIs, data models, and runtime boundaries.
5. Authoritative external research.

Detect concept-HLD equivalents by content, not just name. However, the preferred output filename is always `docs/context/concept-zero.md` unless the project has a stronger established convention.

## Truth and Evidence Model

Label material statements when the distinction matters.

| Label | Meaning |
|---|---|
| `FACT` | Supported by repository evidence, authoritative docs, or cited research. |
| `USER_DECISION` | Explicitly chosen by the user or project authority. |
| `INFERENCE` | Derived from facts with stated reasoning. |
| `ASSUMPTION` | Necessary working premise that remains unverified. |
| `PROPOSAL` | Selected or candidate design choice for future implementation. |
| `OPEN_QUESTION` | Decision or fact still unresolved. |
| `INVALIDATED` | Prior claim or option contradicted by evidence. |

Never invent users, requirements, metrics, legal obligations, performance, maintenance status, repo state, production readiness, or implementation status. A polished statement is not proof.

## Principles

- Problem before architecture: define users, outcomes, scope, and failure modes before selecting technology.
- Evidence before commitment: verify current tool/service/library status, license, compatibility, limits, and operating model before relying on it.
- Adopt or adapt before build: prefer maintained OSS, standards, protocols, managed services, and reference implementations unless custom work is the differentiating product or lower-risk route.
- Minimum sufficient concept: select the smallest coherent system that can create real user value and survive production constraints.
- Less is more: reject microservices, event buses, custom auth, bespoke billing, custom databases, multi-region deployment, heavy governance, and large framework stacks unless a named driver requires them.
- Trade-offs over checklists: optimize the few architecture characteristics that matter most, and make the trade-offs explicit.
- Adversarial revision: challenge the first plausible concept before selecting it.
- Reversibility and learning: defer expensive irreversible choices when a small spike or staged rollout can resolve uncertainty.
- No fake production path: every critical capability needs a credible real implementation, data, integration, deployment, support, and cost route.

## Research Policy

Research all claims and choices that can materially alter feasibility, architecture, cost, user access, schedule, legal posture, or operations.

Use this source order:

1. Official standards, specifications, vendor docs, project repositories, release notes, datasets, protocol docs, and primary product material.
2. Maintainer-authored examples, reference implementations, and migration guides.
3. Peer-reviewed papers and author-maintained implementations.
4. Reproducible independent evaluations.
5. Secondary analysis for context only.

For current tools and services, verify the latest relevant release, maintenance state, platform support, documented limits, pricing/cost shape when relevant, license, and ecosystem health. For OSS, check whether the project can be used directly, wrapped, extended through supported APIs, or only forked.

Stop research when each critical capability has at least one credible route, materially different approaches are represented, additional sources no longer change the decision, and known gaps are explicit. Do not continue research just to increase citation count.

## Protocol

### 0. Inventory and Frame

1. Inventory context documents, current repo evidence, and external research needs.
2. Write the problem statement in product language, without implementation vocabulary.
3. Identify users, operators, administrators, buyers, developers, affected external parties, and excluded audiences.
4. Separate goals, non-goals, constraints, preferences, assumptions, and open questions.
5. Define unacceptable outcomes: user exclusion, data loss, unbounded cost, unsafe behavior, operational fragility, lock-in, or dependence on a nonexistent capability.
6. Create a glossary for overloaded domain terms.

Framing gate: if inputs contradict on user, problem, or hard constraint, record the conflict and proceed with a stated working interpretation only when it is safe and reversible.

### 1. Build the Research Plan

Cover only applicable categories:

- Problem and user evidence: current workflow, pain, failure cost, access constraints, devices, localization, bandwidth, data sensitivity.
- Comparable systems: commercial products, internal systems, OSS projects, reference architectures, failed approaches, adoption barriers.
- OSS prior art: maintenance, license, governance, contributors, security posture, documentation, extension points, migration/replacement path.
- Technical literature: assumptions, datasets, metrics, hardware, reproduction, source availability, domain mismatch, maintained implementation route.
- Standards and ecosystem constraints: protocols, formats, accessibility, platform policy, regulatory obligations, interoperability.
- Production feasibility: data sources, integrations, deployment environments, compute, storage, support model, cost drivers, failure modes.

### 2. Record Evidence

Keep a concise evidence table in `docs/context/concept-zero.md`. If the table would dominate the document, create `docs/context/concept-zero-research.md` and link it from the main HLD.

| ID | Claim / question | Source | Date / version | Finding | Confidence | Impact |
|---|---|---|---|---|---|---|
| `E-01` | ... | official docs / repo / paper | ... | ... | high / medium / low | ... |

Every important dependency, service, standard, model, dataset, protocol, and paper must have enough evidence to justify adoption, adaptation, rejection, or a spike.

### 3. Define Requirements and Quality Scenarios

Capture architecture-significant requirements before candidate designs.

| ID | Type | Statement | Evidence | Notes |
|---|---|---|---|---|
| `G-01` | goal | ... | ... | ... |
| `N-01` | non-goal | ... | ... | ... |
| `C-01` | constraint | ... | ... | ... |
| `Q-01` | quality scenario | stimulus -> response -> measure | ... | ... |

Quality scenarios should be concrete enough to test later. Use a best current threshold when a precise number is not yet known, and mark it as `ASSUMPTION` or `SPIKE_REQUIRED`.

### 4. Research Prior Art and Adopt/Adapt/Build

Create a landscape, not a shopping list.

| Capability | Existing route | Adopt / adapt / build | Evidence | Rejection / risk |
|---|---|---|---|---|
| ... | OSS / standard / service / paper | ... | ... | ... |

Default to adoption. Use custom build only when:

- the capability is the product differentiator;
- available routes are incompatible, abandoned, unsafe, legally unusable, or more complex than implementation;
- the project needs a narrow wrapper rather than a general platform;
- a spike shows custom work is cheaper and less risky.

### 5. Generate Candidate Concepts

Produce two or three materially different concepts unless only one credible path exists. Include the simplest credible concept.

For each candidate, state:

- user-facing experience and main workflow;
- system boundary and external dependencies;
- major subsystems and data flow at HLD level;
- adopted OSS/services/standards;
- what is intentionally not built;
- production path and operating model;
- strongest risk and how to falsify it.

### 6. Challenge and Revise

Before selection, ask:

- What makes this concept fail in the first real deployment?
- Which component is overkill for the first release?
- Which existing OSS/service/standard makes custom work unnecessary?
- Which claimed dependency is unmaintained, unavailable, incompatible, or too expensive?
- Which quality attribute is being optimized without user or business evidence?
- Which risk is hidden as "future work" but blocks production?
- Which simpler concept preserves the core outcome?

Revise the candidates. Do not keep weak concepts for symmetry.

### 7. Select the Concept

Pick one concept and explain why. Include:

- selected concept;
- goals it satisfies;
- non-goals and deferred scope;
- adopted/adapted/built capabilities;
- unresolved assumptions and spikes;
- risk/debt accepted intentionally;
- alternatives rejected;
- triggers that would reopen the decision.

## `docs/context/concept-zero.md` Template

Use this structure unless an established project format is stronger.

```markdown
# Concept Zero

Status: PROPOSED
Last updated: YYYY-MM-DD

## Executive Decision
One dense paragraph: selected concept, target user, core value, production path, and what is deliberately not included.

## Problem and Evidence
| ID | Claim | Evidence | Confidence | Impact |
|---|---|---|---|---|

## Users and Stakeholders
| Actor | Need | Constraints | Success signal |
|---|---|---|---|

## Goals, Non-Goals, and Constraints
| ID | Type | Statement | Evidence |
|---|---|---|---|

## Unacceptable Outcomes
| Outcome | Why it matters | Prevention / detection |
|---|---|---|

## Glossary
| Term | Meaning |
|---|---|

## Critical Journeys
| Journey | Current pain | Proposed experience | Evidence needed |
|---|---|---|---|

## Quality Scenarios
| ID | Scenario | Measure | Later architecture gate |
|---|---|---|---|

## Research Landscape
| Capability | Candidate route | Evidence | Verdict |
|---|---|---|---|

## Adopt / Adapt / Build Decisions
| Capability | Decision | Rationale | Risk |
|---|---|---|---|

## Candidate Concepts
### Candidate A: ...
...

## Adversarial Review
| Finding | Revision |
|---|---|

## Selected Concept HLD
System boundary, subsystems, data, integrations, deployment shape, operations, required risk posture, cost drivers, and failure behavior at high level.

## First Production Slice
The smallest production-shaped release that proves the concept with real data, real users or operators, real checks, and realistic deployment constraints.

## Open Questions and Spikes
| Question | Why it matters | How to resolve | Owner / next command |
|---|---|---|---|

## Handoff to Architecture and Roadmap
Decisions, quality scenarios, risks, and spikes that `arch-roadmap` must carry forward into `docs/architecture.md` and `docs/roadmap.md`.
```

## Output Rules

- High information density beats length. Use tables when they reduce prose.
- Do not over-design small projects. If a static site, CLI, local script, or single-process service satisfies the concept, say so.
- Do not require every section to be long. Empty template ceremony is worse than a concise documented decision.
- Do not bury the recommendation after pages of options. State the selected concept early and show evidence after it.
- Do not invent benchmarks, user research, production status, or legal analysis.
- Do not present screenshots, code snippets, generated scaffolds, or API schemas as concept work unless they are existing evidence.
- Do not create `architecture.md` or `roadmap.md`; hand off to `arch-roadmap`.
- If no write is safe, produce a check report with exact blockers and how a human can unblock them.

## Completion Report

Final response must include:

- Changed: full paths to written files.
- Checks: commands or scenario checks run as `passed`, `failed`, or `not run`.
- Blockers: unresolved issues only, including whether human input is required and exactly how to unblock.
- Next command: normally `arch-roadmap` when `concept-zero.md` is complete.
