---
name: ops-docs
description: "Align, restructure, and rewrite repository docs, or create one self-contained handoff, technical report, whitepaper, product SOP, or operational runbook when explicitly requested. Handles moves, merges, deletions, and missing docs. Evidence-first and concise by default. For an authorized security engagement report, use ops-pentest-report instead."
---

## OBJECTIVE

Make documentation true, usable, and proportionate to its audience.

Choose the mode from the user's requested outcome:

- **Repository mode** maintains the canonical documentation set: align claims, remove drift and duplication, restructure files, and write missing docs.
- **Standalone mode** produces one self-contained handoff, technical report, whitepaper, or project dossier that can be read outside the repository.

An explicit request to create, write, produce, hand off, or publish a document authorizes drafting the artifact now. Do not return only a plan or outline unless the user asked for one. For an ambiguous repository-wide cleanup, propose the concrete plan first; `--write` or `--apply` executes it.

## CORE RULES

1. **Truth before style.** Verify claims against code, manifests, entrypoints, CLI help, schemas, tests, artifacts, and accepted decisions.
2. **One canonical home per repository fact.** Link instead of maintaining competing reference tables or procedures.
3. **A standalone document is a dated derivative.** It may restate the facts an outside reader needs, but it names its source revision and evidence cutoff rather than becoming a second evolving source of truth.
4. **Self-contained means sufficient, not maximal.** Include what the reader needs to understand, decide, integrate, or operate; omit ceremonial and empty sections.
5. **Never invent completeness.** Mark material unknowns with their impact and needed owner or evidence. Keep the artifact in draft when an unresolved fact blocks its purpose.
6. **Structure is in scope.** Move, merge, rename, create, or delete files when that is the smallest clear solution. Preserve the only copy of every still-true fact.
7. **Heavyweight paperwork is opt-in.** Do not create an SRS, PRD, BRD, MRD, SDD, ICD, formal V&V plan, or enterprise catalog unless requested or externally required.

## REPOSITORY MODE

### 1. Reconstruct Reality

Inspect the repository type, maturity, file tree, manifests, real entrypoints, existing docs, tests, and recent history. Skim broadly, then deep-read only documents being changed or claims requiring verification.

### 2. Diagnose in Order

1. Drift and contradictions.
2. Duplicate or competing sources of truth.
3. Missing, dead, or misplaced documentation.
4. Mixed reader needs and poor information architecture.
5. Buried conclusions, padding, and unclear language.

Classify reader needs with Diataxis as a compass:

| Mode | Reader need | Content |
|---|---|---|
| Tutorial | Learn | Guided first success |
| How-to | Complete a task | Direct executable steps |
| Reference | Look up facts | Neutral, complete, structured facts |
| Explanation | Understand | Context, design, decisions, and tradeoffs |

Do not force four folders onto a small project. Use the smallest document set and layout that keeps each page coherent.

### 3. Plan or Execute

Default repository-wide output is a concrete file-level plan. Execute when the user asks to edit, rewrite, apply, or write. When a path is named, keep mutations scoped to that path except for necessary inbound-link repairs.

During execution:

- align claims before polishing prose;
- relocate live facts before deleting obsolete files;
- update inbound links after moves or renames;
- preserve unrelated user changes and useful authorial voice;
- add comprehensive architecture, contract, roadmap, threat-model, or runbook documents only when the project actually earns them.

### 4. Verify

- Reconcile every changed factual claim to evidence.
- Run documented commands or mark them illustrative.
- Check links across the affected documentation set.
- Confirm moved facts have one authoritative home.
- Confirm there are no orphaned files, stale references, or unresolved placeholders.

## STANDALONE MODE

Use standalone mode when the requested result is a product or engineering handoff, ownership transfer, project dossier, technical report, whitepaper, standard operating procedure, operational runbook, or other one-for-all document intended to travel without the repository.

Before drafting, resolve from the request or evidence:

- document type and intended audience;
- the decision, transfer, or question it must support;
- scope, non-goals, status, and confidentiality;
- source revision, artifact versions, and evidence cutoff;
- output path and format when specified.

Ask one focused question only when a missing answer materially changes scope, authority, disclosure, or the document's central argument. Otherwise produce the best complete draft and label the gap.

### Shared Core

Every standalone artifact contains, in a reader-appropriate order:

1. An identity block naming title, document type, version or status, date issued, audience, classification, owner, evidence cutoff, and source baseline. These field names are the shared contract for every standalone artifact this distribution produces; a genre-specific skill extends the set rather than renaming it.
2. Executive summary or abstract that stands on its own.
3. Context, terminology, scope, and non-goals.
4. Current capability or subject, with the architecture, flow, interfaces, or examples needed to understand it.
5. Evidence, verification, and the boundary of what was actually proven.
6. Limitations, risks, unresolved decisions, and material tradeoffs.
7. Provenance and references that remain usable outside the repository.

Add only the modules required by the document's job:

| Type | Add |
|---|---|
| Product or engineering handoff | Delivered artifacts, setup/integration workflow, acceptance criteria and evidence, owners, support boundary, change control, next actions |
| Technical report | Research question, method, environment/data, results, analysis, reproducibility |
| Whitepaper | Decision context, problem, proposed approach, alternatives, adoption implications, recommendation |
| Project dossier | User value, capabilities, architecture, interfaces, operating model, evidence, roadmap boundary |
| Product SOP or operational runbook | Purpose and outcome, scope, roles, prerequisites, numbered steps with per-step expected results, verification, rollback, escalation, and review cadence — structure and profile choice in `references/sop-template.md` |

Do not create companion documents unless requested. Do not leave essential context behind repo-relative links, private shorthand, undefined acronyms, or undocumented conversations. External artifacts may remain separate when the document gives their immutable identifier or version, owner, access path, purpose, and verification method.

### Standalone Verification

Evaluate the finished artifact as if the repository and prior conversation were unavailable:

- Can the intended reader understand the project and the document's conclusion?
- Can the receiver perform the stated integration, acceptance, or next action?
- Does every material claim have nearby evidence or a named source?
- Do commands, links, citations, figures, captions, and cross-references work outside the repository?
- Are readiness, ownership, support, security, and limitations stated without overclaiming?
- Is sensitive material omitted or redacted without hiding its effect on the conclusion?

The standalone artifact itself is the primary output. Do not substitute a documentation plan, section checklist, or narration about what the document should contain.

## WRITING STANDARD

- Lead with the outcome or operative fact.
- Use one idea per paragraph and scannable headings.
- Prefer imperative present tense for procedures.
- Use commands, examples, tables, and diagrams only when they carry information.
- Define a term once and use it consistently.
- Put dense supporting material in appendices only when it is necessary.
- Keep front-door docs short; let reference and standalone artifacts be as long as their verified subject requires.

## OUTPUT

For a repository plan, report exact files to align, rewrite, merge, move, create, delete, or leave, with evidence and the reason for each action.

After repository edits, report changed files, verified claims, commands and links checked, unresolved evidence gaps, and structural moves.

For standalone mode, write one finished artifact at the requested path. When no path is given, choose a clear repository-local filename and report it. State its source baseline, evidence cutoff, status, and any blocking unknowns inside the artifact, not only in chat.

## RELATED

- `arch-roadmap`, `arch-contract`, and `arch-diagram` author specialized architecture material that this skill may integrate.
- `ops-report` produces a project status report for discussion; this skill produces documents built to travel.
- `ops-pentest-report` owns authorized-engagement security reports, which carry marking, scoring, evidence-integrity, and retest rules this skill does not apply.
- `ops-clean` handles repository debt beyond documentation.
- `ops-doctor` checks source, registry, and generated health.
- `boot-concept` establishes a missing product concept before documentation claims it.

## NON-GOALS

- No invented facts, results, owners, acceptance, compatibility, or readiness.
- No document-count targets or formatting theater.
- No forced enterprise template when a short complete artifact is enough.
- No silent conversion of a repository cleanup into a handoff or publication.
- No standalone artifact maintained as an unversioned competing source of truth.
- No engagement report, finding register, or retest record for authorized security testing; that genre belongs to `ops-pentest-report`.
