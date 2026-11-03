---
name: ops-docs
description: "Align, restructure, and rewrite repository docs, including moves, merges, deletions, and missing docs, or write one requested handoff, technical report, whitepaper, product SOP, or runbook. Security engagement reports go to ops-pentest-report."
---

## Objective

Make documentation true, usable, and proportionate to its audience. Choose the mode from the requested outcome:

- Repository mode maintains the canonical doc set: align claims, remove drift and duplication, restructure files, and write missing docs.
- Standalone mode produces one self-contained handoff, technical report, whitepaper, or project dossier that reads outside the repository.

A request to create, write, produce, hand off, or publish a document authorizes drafting it now; return only a plan or outline when asked for one. For an ambiguous repository-wide cleanup, propose the concrete plan first; `--write` or `--apply` executes it. Never silently turn a repository cleanup into a handoff or publication.

## Rules

1. Verify claims against code, manifests, entrypoints, CLI help, schemas, tests, artifacts, and accepted decisions before polishing style. Never invent facts, results, owners, acceptance, compatibility, or readiness.
2. Give each repository fact one canonical home; link to it instead of keeping competing reference tables or procedures.
3. A standalone document is a dated derivative: it may restate the facts an outside reader needs, but it names its source revision and evidence cutoff and never becomes a second evolving source of truth.
4. Self-contained means sufficient, not maximal: include what the reader needs to understand, decide, integrate, or operate; omit ceremonial and empty sections. Set no document-count targets.
5. Mark material unknowns with their impact and the owner or evidence needed. Keep the artifact in draft while an unresolved fact blocks its purpose.
6. Structure is in scope: move, merge, rename, create, or delete files when that is the smallest clear fix, preserving the only copy of every still-true fact.
7. Create an SRS, PRD, BRD, MRD, SDD, ICD, formal V&V plan, or enterprise catalog only when requested or externally required.

## Repository Mode

1. Reconstruct reality: inspect the repository type, maturity, file tree, manifests, real entrypoints, existing docs, tests, and recent history. Skim broadly; deep-read only documents being changed or claims needing verification.
2. Diagnose in order: drift and contradictions; duplicate or competing sources of truth; missing, dead, or misplaced docs; mixed reader needs and poor information architecture; buried conclusions, padding, and unclear language. Classify reader needs with Diataxis (tutorial, how-to, reference, explanation) as a compass, but use the smallest document set and layout that keeps each page coherent instead of forcing four folders onto a small project.
3. Plan or execute: the default repository-wide output is a concrete file-level plan; execute when asked to edit, rewrite, apply, or write. When a path is named, mutate only that path plus necessary inbound-link repairs. Align claims before polishing prose, relocate live facts before deleting obsolete files, update inbound links after moves or renames, and preserve unrelated user changes and useful authorial voice. Add architecture, contract, roadmap, threat-model, or runbook documents only when the project earns them.
4. Verify: reconcile every changed factual claim to evidence; run documented commands or mark them illustrative; check links across the affected documentation set; confirm each moved fact has one authoritative home; leave no orphaned files, stale references, or unresolved placeholders.

## Standalone Mode

Use it for any document meant to travel without the repository: product or engineering handoff, ownership transfer, project dossier, technical report, whitepaper, SOP, or operational runbook.

Before drafting, resolve the document type and audience; the decision, transfer, or question it supports; scope, non-goals, status, and confidentiality; source revision, artifact versions, and evidence cutoff; and the output path and format when specified. Ask one focused question only when the answer materially changes scope, authority, disclosure, or the central argument; otherwise write the best complete draft and label the gap.

Every artifact contains, in reader-appropriate order:

1. An identity block answering what the document is (title, document type), which revision the reader holds (version or status, date issued), who it is for (audience, classification, owner), and what it rests on (evidence cutoff, source baseline). These are information requirements, not field names: a genre-specific skill may name its own fields and omit an item only where its template says so explicitly, as the runbook profile does.
2. An executive summary or abstract that stands on its own.
3. Context, terminology, scope, and non-goals.
4. The current capability or subject, with the architecture, flow, interfaces, or examples needed to understand it.
5. Evidence, verification, and the boundary of what was actually proven.
6. Limitations, risks, unresolved decisions, and material tradeoffs.
7. Provenance and references that remain usable outside the repository.

Add only the modules the document's job requires:

| Type | Add |
|---|---|
| Product or engineering handoff | Delivered artifacts, setup/integration workflow, acceptance criteria and evidence, owners, support boundary, change control, next actions |
| Technical report | Research question, method, environment/data, results, analysis, reproducibility |
| Whitepaper | Decision context, problem, proposed approach, alternatives, adoption implications, recommendation |
| Project dossier | User value, capabilities, architecture, interfaces, operating model, evidence, roadmap boundary |
| Product SOP or operational runbook | Purpose and outcome, scope, roles, prerequisites, numbered steps with per-step expected results, verification, rollback, escalation, and review cadence — structure and profile choice in `references/sop-template.md` |

Create no companion documents unless requested. Leave no essential context behind repo-relative links, private shorthand, undefined acronyms, or undocumented conversations; an external artifact may stay separate when the document gives its immutable identifier or version, owner, access path, purpose, and verification method.

Verify the finished artifact as if the repository and prior conversation were unavailable: the intended reader understands the project and the conclusion; the receiver can perform the stated integration, acceptance, or next action; every material claim has nearby evidence or a named source; commands, links, citations, figures, captions, and cross-references work outside the repository; readiness, ownership, support, security, and limitations are stated without overclaiming; sensitive material is omitted or redacted without hiding its effect on the conclusion.

## Writing

Lead with the outcome or operative fact. Use one idea per paragraph, scannable headings, and imperative present tense for procedures. Use commands, examples, tables, and diagrams only when they carry information. Define each term once and use it consistently. Use appendices only for necessary dense material. Keep front-door docs short; reference and standalone artifacts may be as long as their verified subject requires.

## Output

- Repository plan: the exact files to align, rewrite, merge, move, create, delete, or leave, each with evidence and the reason.
- After repository edits: changed files, verified claims, commands and links checked, unresolved evidence gaps, and structural moves.
- Standalone: one finished artifact at the requested path; without a path, choose a clear repository-local filename and report it. State its source baseline, evidence cutoff, status, and blocking unknowns inside the artifact, not only in chat. The artifact is the output; never substitute a documentation plan, section checklist, or narration about what it should contain.

## Related

- `arch-roadmap`, `arch-contract`, and `arch-diagram` author specialized architecture material this skill may integrate.
- `ops-report` produces a project status report for discussion; this skill produces documents built to travel.
- `ops-pentest-report` owns authorized-engagement security reports, finding registers, and retest records, which carry marking, scoring, evidence-integrity, and retest rules this skill does not apply.
- `ops-clean` handles repository debt beyond documentation; `ops-doctor` checks source, registry, and generated health; `boot-concept` establishes a missing product concept before documentation claims it.
