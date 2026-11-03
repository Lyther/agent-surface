---
name: boot-concept
description: "Research and write the concept-zero high-level design for a project."
---

## Objective

Create or update `docs/context/concept-zero.md`, the canonical concept-level HLD for a new or existing project. It answers: what problem is solved, for whom, what success and unacceptable failure look like, what the system must and must not do, which existing products, OSS projects, standards, papers, protocols, managed services, and reference implementations already cover the problem, which concept is selected and why, what remains uncertain before detailed architecture, and what credible path leads to real production use.

Capture the concept, the evidence, and the decision. Write no source code, detailed schemas, endpoint-level APIs, migrations, UI mockups, or task-level plans, and present screenshots, snippets, scaffolds, or API schemas as concept work only when they are existing evidence. Never create `docs/architecture.md` or `docs/roadmap.md`; `arch-roadmap` derives them from this document.

## Modes

- `boot-concept check`: read-only inventory of existing context, evidence gaps, contradictions, and whether a credible concept HLD can be written.
- `boot-concept run`: write or update `docs/context/concept-zero.md`; add `docs/context/concept-zero-research.md` only when the evidence ledger would dominate the main document.
- Bare `boot-concept`: check first, then run when the inputs are coherent enough. When product intent is ambiguous, state a working assumption and continue unless the next step would lock in the wrong product.

## Authority

Be skeptical without inflating process: the document should be dense enough to prevent bad architecture and small enough to stay read. You may narrow implementation scope to preserve the core outcome and production path, and recommend adoption, adaptation, procurement, partnership, or research instead of custom development. Never silently change the target problem, users, hard constraints, legal obligations, or explicit user decisions. Research, challenge, and recommend one direction instead of handing the user an unfiltered option list; ask only when alternatives represent different product intent that evidence cannot resolve.

## Input

1. The user brief, goals, constraints, corrections, and explicit exclusions.
2. Existing `docs/context/`, `docs/design/`, `docs/research/`, `docs/adr/`, and project-specific equivalents.
3. Prior concepts, PRDs, architecture docs, roadmaps, reviews, ADRs, benchmark notes, incident notes, and feasibility reports.
4. Repository evidence when implementation exists: manifests, tests, CI, schemas, package managers, deployment config, APIs, data models, and runtime boundaries.
5. Authoritative external research.

Detect concept-HLD equivalents by content, not name; still write `docs/context/concept-zero.md` unless the project has a stronger established convention.

## Labels

Label material statements when the distinction matters: `FACT` (repository evidence, authoritative docs, or cited research), `USER_DECISION` (chosen by the user or project authority), `INFERENCE` (derived from facts, reasoning stated), `ASSUMPTION` (unverified working premise), `PROPOSAL` (selected or candidate design choice), `OPEN_QUESTION` (unresolved), `INVALIDATED` (contradicted by evidence). Never invent users, requirements, metrics, benchmarks, user research, legal obligations or analysis, performance, maintenance status, repository state, production readiness, or implementation status.

## Principles

- Define users, outcomes, scope, and failure modes before selecting technology.
- Select the smallest coherent system that creates real user value and survives production constraints; reject microservices, event buses, custom auth, bespoke billing, custom databases, multi-region deployment, heavy governance, and large framework stacks unless a named driver requires them. When a static site, CLI, local script, or single-process service suffices, say so.
- Optimize the few architecture characteristics that matter most and make the trade-offs explicit.
- Defer expensive irreversible choices when a small spike or staged rollout can resolve the uncertainty.
- Give every critical capability a credible real implementation, data, integration, deployment, support, and cost route.

## Research

Research every claim and choice that can materially change feasibility, architecture, cost, user access, schedule, legal posture, or operations. Source order: official standards, specifications, vendor docs, project repositories, release notes, datasets, protocol docs, and primary product material; maintainer examples, reference implementations, and migration guides; peer-reviewed papers and author-maintained implementations; reproducible independent evaluations; secondary analysis for context only.

For current tools and services, verify the latest relevant release, maintenance state, platform support, documented limits, pricing or cost shape when relevant, license, compatibility, operating model, and ecosystem health. For OSS, check whether it can be used directly, wrapped, extended through supported APIs, or only forked. Stop when each critical capability has at least one credible route, materially different approaches are represented, more sources no longer change the decision, and known gaps are explicit; never research just to add citations.

## Procedure

1. Frame:
   - Inventory context documents, repository evidence, and external research needs.
   - State the problem in product language, without implementation vocabulary.
   - Identify users, operators, administrators, buyers, developers, affected external parties, and excluded audiences.
   - Separate goals, non-goals, constraints, preferences, assumptions, and open questions.
   - Define unacceptable outcomes: user exclusion, data loss, unbounded cost, unsafe behavior, operational fragility, lock-in, or dependence on a nonexistent capability.
   - Write a glossary for overloaded domain terms.

   If inputs contradict each other on user, problem, or a hard constraint, record the conflict and proceed on a stated working interpretation only when that is safe and reversible.
2. Plan research across the applicable categories only:
   - Problem and user evidence: current workflow, pain, failure cost, access constraints, devices, localization, bandwidth, data sensitivity.
   - Comparable systems: commercial products, internal systems, OSS projects, reference architectures, failed approaches, adoption barriers.
   - OSS prior art: maintenance, license, governance, contributors, security posture, documentation, extension points, migration or replacement path.
   - Technical literature: assumptions, datasets, metrics, hardware, reproduction, source availability, domain mismatch, maintained implementation route.
   - Standards and ecosystem: protocols, formats, accessibility, platform policy, regulatory obligations, interoperability.
   - Production feasibility: data sources, integrations, deployment environments, compute, storage, support model, cost drivers, failure modes.
3. Record evidence in a concise table in `docs/context/concept-zero.md`, or in `docs/context/concept-zero-research.md` linked from it when the table would dominate. Every important dependency, service, standard, model, dataset, protocol, and paper needs enough evidence to justify adoption, adaptation, rejection, or a spike.

   | ID | Claim / question | Source | Date / version | Finding | Confidence | Impact |
   |---|---|---|---|---|---|---|
   | `E-01` | ... | official docs / repo / paper | ... | ... | high / medium / low | ... |

4. Capture architecture-significant requirements before candidate designs. Make quality scenarios concrete enough to test later; when no precise number is known, use the best current threshold and mark it `ASSUMPTION` or `SPIKE_REQUIRED`.

   | ID | Type | Statement | Evidence | Notes |
   |---|---|---|---|---|
   | `G-01` | goal | ... | ... | ... |
   | `N-01` | non-goal | ... | ... | ... |
   | `C-01` | constraint | ... | ... | ... |
   | `Q-01` | quality scenario | stimulus -> response -> measure | ... | ... |

5. Map prior art as a landscape, not a shopping list:

   | Capability | Existing route | Adopt / adapt / build | Evidence | Rejection / risk |
   |---|---|---|---|---|
   | ... | OSS / standard / service / paper | ... | ... | ... |

   Default to adopting maintained OSS, standards, protocols, managed services, and reference implementations. Build custom only when the capability is the product differentiator; available routes are incompatible, abandoned, unsafe, legally unusable, or more complex than implementing it; the project needs a narrow wrapper rather than a general platform; or a spike shows custom work is cheaper and less risky.
6. Generate two or three materially different concepts, including the simplest credible one, unless only one credible path exists. For each: user-facing experience and main workflow; system boundary and external dependencies; major subsystems and data flow at HLD level; adopted OSS, services, and standards; what is intentionally not built; production path and operating model; the strongest risk and how to falsify it.
7. Challenge the candidates, then revise them, dropping weak concepts kept for symmetry:
   - What makes this concept fail in its first real deployment?
   - Which component is overkill for the first release?
   - Which existing OSS, service, or standard makes custom work unnecessary?
   - Which claimed dependency is unmaintained, unavailable, incompatible, or too expensive?
   - Which quality attribute is optimized without user or business evidence?
   - Which production blocker hides as "future work"?
   - Which simpler concept preserves the core outcome?
8. Select one concept and state why: goals it satisfies, non-goals and deferred scope, adopted, adapted, and built capabilities, unresolved assumptions and spikes, intentionally accepted risk and debt, rejected alternatives, and triggers that would reopen the decision.

## Template

Use this structure for `docs/context/concept-zero.md` unless an established project format is stronger. State the selected concept early and show evidence after it; prefer tables where they replace prose; keep sections short when the decision is simple, since empty template ceremony is worse than a concise documented decision.

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

## Report

If no write is safe, produce a check report with the exact blockers and how a human can unblock them. Otherwise report Changed (full paths to the written files), Checks (commands or scenarios as `passed`, `failed`, or `not run`), Blockers (unresolved issues, whether a human must act, and the unblock path), and the next command, normally `arch-roadmap` once `concept-zero.md` is complete.
