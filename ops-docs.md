## OBJECTIVE

**THE PAPER TRAIL.**
Code without documentation is a liability. Documentation without code is fiction.
A map that is 1:1 scale is useless. A map showing demolished buildings is dangerous.
**Your Goal**: Manage the documentation lifecycle of a project — check what exists, create what's missing, update what's stale, and audit the whole tree for hygiene.
**The Boundary**: Read-only by default. Write only when `--create` or `--update` is explicitly requested. `--audit` reports but does not modify unless confirmed.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Docs are verbose. Don't read the encyclopedia to fix a typo.*

1. **Index first**: Read `README.md` and file tree to understand structure. Don't read every `.md` file unless doing a full `--audit`.
2. **Link verification**: Use `grep` to find links, then `ls` to verify targets. Do NOT open the target file just to check if it exists.
3. **Scoped operations**: If checking/creating/updating a single document type, only read docs and code relevant to that type. Don't scan the entire repo for a targeted operation.

## SYNTAX

```text
/docs [type] [--check|--create|--update|--audit] [--target <path>] [--audience eng|exec|ops|user] [--depth minimal|standard|full] [--ci]
```

## PARAMETERS

| Parameter | Default | Description |
|-----------|---------|-------------|
| `[type]` | *(none)* | Document type short name (see catalog below). **If omitted, print the full document catalog with descriptions and status per type.** |
| `--check` | *(default action)* | Scan project for this document type. Report: exists / missing / stale. If exists, report location, last modified, and drift vs current code. |
| `--create` | — | Generate the document from current project state. Requires `[type]`. |
| `--update` | — | Read existing document + diff against current code/architecture. Produce an incremental update preserving structure and content that hasn't changed. Requires `[type]`. |
| `--audit` | — | **Full documentation hygiene sweep.** Ignores `[type]`. Scans ALL docs for naming violations, stale content, broken links, DRY violations, zombie tasks, code comment essays, env var drift, and fluff. Produces a cleanup report with actionable fixes. |
| `--target <path>` | `docs/{type}.md` | Override output path. |
| `--audience` | `eng` | `eng` = developer-facing, `exec` = leadership-facing, `ops` = operations/SRE, `user` = end-user-facing. Adjusts depth, jargon, and structure. |
| `--depth` | `standard` | `minimal` = skeleton + key sections only, `standard` = production-ready, `full` = IEEE-grade exhaustive. |
| `--ci` | off | CI pipeline mode. Machine-parseable output, non-zero exit codes on violations (missing required docs, broken links, stale docs past threshold). |

## DOCUMENT CATALOG

When `/docs` is invoked with **no type argument**, print this catalog. For each type, probe the project to determine status (✅ found / ❌ missing / 🟡 stale).

### Requirements & Concept

| Short Name | Full Name | What It Answers | Typical Location |
|------------|-----------|-----------------|------------------|
| `conops` | Concept of Operations | What is this system, who uses it, and why does it exist? High-level operational picture for stakeholders. | `docs/conops.md` |
| `srs` | Software Requirements Specification | What must the system do? Functional and non-functional requirements, constraints, acceptance criteria. | `docs/srs.md` |

### Design & Architecture

| Short Name | Full Name | What It Answers | Typical Location |
|------------|-----------|-----------------|------------------|
| `sad` | Software Architecture Description | How is the system structured? Components, layers, boundaries, key decisions, tradeoffs. | `docs/architecture.md` |
| `sdd` | Software Design Document | How is the system built? Module-level design, data structures, algorithms, interfaces, error handling. The big one — full technical blueprint for handoff/delivery. | `docs/sdd.md` |
| `icd` | Interface Control Document | How do components talk to each other? API contracts, message formats, protocols, auth, versioning. | `docs/icd.md` |
| `adr` | Architecture Decision Records | Why did we choose X over Y? Lightweight per-decision docs. | `docs/decisions/adr-*.md` |

### Testing & Quality

| Short Name | Full Name | What It Answers | Typical Location |
|------------|-----------|-----------------|------------------|
| `stp` | Software Test Plan | How do we verify the system works? Test strategy, environments, coverage targets, entry/exit criteria. | `docs/test-plan.md` |
| `str` | Software Test Report | Did the system pass? Test execution results, coverage metrics, known failures, sign-off. | `docs/test-report.md` |

### Delivery & Operations

| Short Name | Full Name | What It Answers | Typical Location |
|------------|-----------|-----------------|------------------|
| `sum` | Software User Manual | How do end users use this? Installation, configuration, usage, troubleshooting, FAQ. | `docs/user-manual.md` |
| `srn` | Software Release Notes | What changed in this release? New features, breaking changes, bugfixes, migration guide, known issues. | `CHANGELOG.md` or `docs/release-notes.md` |
| `dep` | Deployment Guide | How do ops deploy this? Infrastructure requirements, deployment steps, rollback, health checks, monitoring. | `docs/deployment.md` |
| `smp` | Software Maintenance Plan | How do we keep it alive? Patching strategy, dependency update cadence, on-call procedures, escalation paths. | `docs/maintenance.md` |
| `runbook` | Operational Runbook | What do I do when it breaks? Incident response procedures, diagnostic commands, common failure modes and fixes. | `docs/runbook.md` |

### Project Management

| Short Name | Full Name | What It Answers | Typical Location |
|------------|-----------|-----------------|------------------|
| `spmp` | Software Project Management Plan | How is the project run? Milestones, roles, deliverables, risk register, communication plan. | `docs/project-plan.md` |
| `scmp` | Software Configuration Management Plan | How do we control versions and changes? Branching strategy, release process, artifact management. | `docs/scm.md` |

**Total: 15 document types across 4 lifecycle phases.**

When printing the catalog, also run a quick probe for each type:

- Check `docs/` directory and common locations for each type.
- If found: show path + last modified date.
- If not found: show ❌.
- If found but last modified > 90 days before latest git commit: show 🟡 stale.

## PROTOCOL

### Phase 0: Project Inventory (runs for all actions)

*Understand what we're working with before touching anything.*

1. **Discover project structure** (mandatory tool calls):
    - Execute: `ls docs/` and `find . -maxdepth 3 -name "*.md" | head -30` to inventory existing documentation.
    - Execute: `ls -la` at project root. Read manifests (`pyproject.toml`, `package.json`, `Cargo.toml`, etc.).
    - Execute: `git log --oneline -10` for recent activity context.
2. **Read existing concept docs** if present:
    - `docs/context/*`, `docs/architecture.md`, `README*`, `AGENTS.md`.
    - These inform the content of any document being created or updated.
3. **Identify the project's current maturity**:
    - Is this a concept-zero / early prototype / production system?
    - This determines which documents are reasonable to create vs premature.

### Phase 1: Check (`--check`, default)

*Does this document exist? Is it current?*

1. **Search** for the requested document type across common locations.
2. **If found**:
    - Report: path, file size, last modified date, last git commit touching the file.
    - Quick-scan content: does it have the expected sections for this document type?
    - Check freshness: compare last modification date vs recent code changes. If significant code changes have landed since the doc was last updated, flag as 🟡 stale and list the likely-affected sections.
3. **If not found**:
    - Report: ❌ missing.
    - Recommend: whether it's appropriate to create given the project's maturity.
    - Estimate: rough size/effort to create (skeleton vs full).

### Phase 2: Create (`--create`)

*Generate the document from the current project state.*

1. **Gather evidence** via tool calls:
    - Read relevant source files, manifests, configs, existing docs, and test files.
    - Execute probes as needed: `grep`, `find`, `cat`, `git log`.
    - Do NOT invent features, capabilities, or decisions that aren't evidenced in the codebase.
2. **Select template** based on document type (see Templates section below).
3. **Fill template** from gathered evidence:
    - Every factual claim must trace to a file path, config value, or code excerpt.
    - Sections with insufficient evidence: write the section header + `[TODO: insufficient evidence — needs input from {owner}]`.
    - Do NOT hallucinate content to fill empty sections.
4. **Write** to `--target` path or default location.
5. **Post-create summary**: list sections filled vs sections marked TODO.

### Phase 3: Update (`--update`)

*Incrementally update an existing document.*

1. **Read** the existing document in full.
2. **Gather current state** via the same evidence-gathering process as Create.
3. **Diff** the document's claims against current reality:
    - Identify sections that are still accurate (leave unchanged).
    - Identify sections that are stale (update with new evidence).
    - Identify new capabilities/components that aren't documented (add sections).
    - Identify documented capabilities that no longer exist (mark as removed or flag for review).
4. **Produce** the updated document, preserving the original structure and content where unchanged. Use `[UPDATED: YYYY-MM-DD]` markers on sections that changed.
5. **Post-update summary**: list what changed, what was added, what was flagged for removal.

### Phase 4: Audit (`--audit`)

*Documentation is a map. A 1:1 scale map is useless. A map showing demolished buildings is dangerous. Maximize information density. Minimize word count.*

The audit ignores `[type]` and sweeps the entire `docs/` tree plus code comments. It runs four sub-phases and produces a single cleanup report.

#### 4a. File Hygiene (Naming & Structure)

1. **Naming convention enforcement**:
    - Root standards: `README.md`, `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md` — UPPERCASE allowed ONLY for these.
    - Everything else: `kebab-case.md`.
    - BANNED patterns: `CamelCase.md`, `snake_Case.md`, `Part 1 - Intro.md`, spaces in filenames.
    - Execute: `find docs/ -name "*.md" | grep -E '[A-Z]|_| '` to detect violations.
    - Action: flag for rename with suggested kebab-case name.
2. **Folder structure**:
    - Flag flat directories with > 7 `.md` files. Recommend grouping into subdirectories (`docs/api/`, `docs/arch/`, `docs/guides/`).
3. **Front-matter check**:
    - Every doc should have an updated date and owner in first lines: `Updated: YYYY-MM-DD`, `Owner: {team or person}`.
    - Flag files missing front-matter.

#### 4b. Content Hygiene (The Diet)

1. **DRY violations**:
    - Detect duplicated content across docs. Execute: `grep -rnl "{common instruction}" docs/` to find repetitions.
    - If the same content appears in 2+ files: flag the secondary occurrences for replacement with a link to the canonical location.
    - Rule: information exists in ONE place. Everywhere else links to it.
2. **Zombie tasks**:
    - Execute: `grep -rn "\[x\]" docs/` to find completed task checkboxes.
    - Action: flag for deletion. Completed tasks belong in `CHANGELOG.md`, not in living docs.
3. **Fluff detection**:
    - Flag and recommend deletion: "Welcome to the project", "I hope this helps", "In this section, we will...", any content that adds zero information.
    - Flag passive voice for rewrite to imperative where it weakens clarity.
4. **Accuracy vs code**:
    - Cross-reference documented CLI commands, config keys, and env vars against actual code.
    - Flag any doc claims that no longer match the codebase.

#### 4c. Code Comment Hygiene (The Silencer)

1. **Essay detection**:
    - Detect the project's primary language(s) from manifests, then use the appropriate comment pattern:
        - Python/bash/Ruby: `#`
        - JS/TS/Rust/Go/Java/C: `//` and `/* */`
        - HTML/XML: `<!-- -->`
    - Execute language-appropriate grep, e.g.: `grep -rnc "^[[:space:]]*#" src/ --include="*.py" | awk -F: '$2 > 30 {print}'` for Python, or equivalent for other languages.
    - For comment blocks > 5 lines explaining architecture: flag for extraction to `docs/` with a pointer comment left behind.
2. **Redundancy check**:
    - Flag comments that restate what the code already says: `i++; // Increment i`, `const user = db.get(); // Get user`.
    - Rule: code explains WHAT, comments explain WHY. Comments that explain WHAT are noise.

#### 4d. Reality Check (Sync)

1. **Env var audit**:
    - Execute: `grep -roh 'process\.env\.\w\+\|os\.environ\[.\+\]\|env::\w\+' src/` (adapt to project language) to extract env var references.
    - Compare against `.env.example` or equivalent.
    - Flag env vars found in code but missing from documentation/example files.
2. **Internal link validation**:
    - Execute: `grep -roh '\[.*\](.*\.md.*)' docs/` to extract markdown links.
    - Verify each target exists via `ls`. Do NOT open target files — existence check only.
    - Flag broken links.
3. **Diagram freshness**:
    - If Mermaid or other diagram files exist, flag those not updated within 90 days of related code changes.

## TEMPLATES

Each document type has a required structure. When creating, use these as skeletons. When checking, verify these sections exist.

### conops — Concept of Operations

```markdown
# Concept of Operations: {Project Name}
## 1. Purpose
## 2. Stakeholders
## 3. Operational Context (who uses this, when, why)
## 4. Key Scenarios / Use Cases
## 5. Constraints and Assumptions
## 6. Dependencies
## 7. Success Criteria
```

### srs — Software Requirements Specification

```markdown
# Software Requirements Specification: {Project Name}
## 1. Introduction (purpose, scope, definitions)
## 2. Overall Description (product perspective, functions, user characteristics, constraints)
## 3. Functional Requirements
### 3.1 {Feature Group 1}
### 3.2 {Feature Group 2}
## 4. Non-Functional Requirements (performance, security, reliability, scalability)
## 5. Interface Requirements (APIs, CLI, UI)
## 6. Data Requirements (storage, formats, retention)
## 7. Acceptance Criteria
## 8. Appendices
```

### sad — Software Architecture Description

```markdown
# Architecture Description: {Project Name}
## 1. Overview (one-paragraph summary)
## 2. Architectural Drivers (key requirements shaping the design)
## 3. System Context (external dependencies, integrations)
## 4. Component View (modules, responsibilities, boundaries)
## 5. Data Flow (how data moves through the system)
## 6. Deployment View (infrastructure, containers, networking)
## 7. Key Decisions (with rationale — link to ADRs if they exist)
## 8. Quality Attributes (how the architecture addresses performance, security, etc.)
## 9. Known Limitations
```

### sdd — Software Design Document

```markdown
# Software Design Document: {Project Name}
## 1. Introduction (purpose, scope, audience, references)
## 2. System Overview (high-level summary, context diagram)
## 3. Architecture (component diagram, layer descriptions, key decisions)
## 4. Module Design
### 4.1 {Module 1} (responsibility, interfaces, data structures, algorithms, error handling)
### 4.2 {Module 2}
## 5. Data Design (schemas, storage, migration strategy)
## 6. Interface Design (API specs, CLI interface, message formats)
## 7. Error Handling and Logging
## 8. Security Design (auth, authz, secrets management, threat model summary)
## 9. Configuration and Environment
## 10. Testing Strategy (unit, integration, contract, e2e — reference STP if exists)
## 11. Deployment and Operations (reference dep/runbook if exists)
## 12. Dependencies (with version pins and rationale)
## 13. Known Issues and Technical Debt
## 14. Appendices (glossary, references, changelog)
```

### icd — Interface Control Document

```markdown
# Interface Control Document: {Project Name}
## 1. Overview (what interfaces this document covers)
## 2. Interface Inventory (table: interface name, type, direction, protocol)
## 3. {Interface 1}
### 3.1 Protocol and Transport
### 3.2 Authentication and Authorization
### 3.3 Request/Response Formats (with examples)
### 3.4 Error Codes and Handling
### 3.5 Rate Limits and SLAs
## 4. {Interface 2}
## 5. Versioning Strategy
## 6. Change Management
```

### adr — Architecture Decision Record

```markdown
# ADR-{NNN}: {Title}
**Status:** proposed | accepted | deprecated | superseded by ADR-{NNN}
**Date:** YYYY-MM-DD
**Context:** What is the issue or decision we need to make?
**Decision:** What did we decide?
**Rationale:** Why this option over alternatives?
**Alternatives Considered:** What else did we evaluate? Why not those?
**Consequences:** What are the tradeoffs and implications?
```

### stp — Software Test Plan

```markdown
# Test Plan: {Project Name}
## 1. Scope (what is tested, what is not)
## 2. Test Strategy (unit, integration, contract, e2e, manual)
## 3. Test Environment (infra, dependencies, test data)
## 4. Entry and Exit Criteria
## 5. Coverage Targets
## 6. Test Schedule
## 7. Roles and Responsibilities
## 8. Risk and Contingency
```

### str — Software Test Report

```markdown
# Test Report: {Project Name}
**Date:** YYYY-MM-DD
**Version Under Test:** {version}
## 1. Summary (pass/fail, coverage, key findings)
## 2. Environment
## 3. Results by Category (unit, integration, contract, e2e)
## 4. Coverage Metrics
## 5. Known Failures and Waivers
## 6. Recommendations
## 7. Sign-off
```

### sum — Software User Manual

```markdown
# User Manual: {Project Name}
## 1. Introduction (what this is, who it's for)
## 2. Getting Started (installation, prerequisites, quickstart)
## 3. Configuration
## 4. Usage
### 4.1 {Feature/Command 1}
### 4.2 {Feature/Command 2}
## 5. Troubleshooting
## 6. FAQ
## 7. Reference (CLI flags, config keys, environment variables)
```

### srn — Software Release Notes

```markdown
# Release Notes: {Project Name} v{X.Y.Z}
**Date:** YYYY-MM-DD
## Highlights
## New Features
## Breaking Changes
## Bug Fixes
## Deprecations
## Migration Guide (if breaking changes)
## Known Issues
```

### dep — Deployment Guide

```markdown
# Deployment Guide: {Project Name}
## 1. Prerequisites (infrastructure, credentials, network)
## 2. Build (how to produce the deployable artifact)
## 3. Deploy (step-by-step deployment procedure)
## 4. Verify (health checks, smoke tests)
## 5. Rollback (how to revert)
## 6. Monitoring and Alerting (what to watch, thresholds)
## 7. Scaling (horizontal/vertical, bottlenecks)
```

### runbook — Operational Runbook

```markdown
# Runbook: {Project Name}
## 1. Service Overview (what it does, SLOs, dependencies)
## 2. Common Operations (restart, drain, scale, rotate creds)
## 3. Incident Response
### 3.1 {Failure Mode 1}
- **Trigger**: what alert/condition fires (link to monitoring rule if exists)
- **Symptoms**: what the operator sees
- **Diagnosis**: commands to confirm root cause
- **Fix**: step-by-step remediation
- **Verification**: how to confirm the fix worked (health check, metric recovery, log pattern)
- **Rollback**: how to revert if the fix makes things worse
### 3.2 {Failure Mode 2}
## 4. Diagnostic Commands (copy-pasteable)
## 5. Escalation Path
## 6. Maintenance Windows
## 7. Documentation Testing (when was this runbook last exercised — Game Day / mock incident date and outcome)
```

### smp — Software Maintenance Plan

```markdown
# Maintenance Plan: {Project Name}
## 1. Maintenance Scope
## 2. Dependency Update Cadence
## 3. Security Patching SLA
## 4. Backup and Recovery
## 5. Monitoring and Health
## 6. End-of-Life Criteria
```

### scmp — Software Configuration Management Plan

```markdown
# Configuration Management Plan: {Project Name}
## 1. Version Control (branching strategy, commit conventions)
## 2. Release Process (versioning scheme, release cadence, approval)
## 3. Artifact Management (where builds go, retention)
## 4. Environment Management (dev, staging, prod configs)
## 5. Change Control (who approves what, review requirements)
```

### spmp — Software Project Management Plan

```markdown
# Project Management Plan: {Project Name}
## 1. Project Overview (objectives, scope, success criteria)
## 2. Milestones and Schedule
## 3. Roles and Responsibilities
## 4. Deliverables
## 5. Risk Register (risk, likelihood, impact, mitigation)
## 6. Communication Plan (cadence, channels, stakeholders)
## 7. Resource Allocation
## 8. Change Management
```

## EXECUTION RULES

1. **NO-ARG = CATALOG**: If no type is specified, print the full document catalog with per-type project status. Do not guess which document the user wants.
2. **READ-ONLY BY DEFAULT**: `--check` is the default action. Do not create or modify files unless `--create`, `--update`, or `--audit` with explicit confirmation is requested.
3. **EVIDENCE FIRST**: When creating or updating, every factual claim must trace to a specific file, config, or command output. Use tool calls to gather evidence.
4. **CITE OR MARK TODO**: If evidence is insufficient for a section, write the section header + a `[TODO]` marker with a note on what input is needed. Never fill sections with invented content.
5. **FORCED TOOL I/O**: When tools are available, you MUST use them for evidence gathering. Do not assert "based on the project structure" without having read the actual files.
6. **PRESERVE ON UPDATE**: When updating, do not rewrite sections that haven't changed. Preserve original content, structure, and voice. Only modify what the evidence says has drifted.
7. **MATURITY GATE**: If the project is concept-zero or early prototype, recommend against creating delivery-phase documents (dep, runbook, smp). Flag them as premature and suggest what to create instead.
8. **AUDIENCE ADAPTATION**: `eng` gets full technical detail with code references. `exec` gets high-level summaries with key decisions and risks. `ops` gets deployment, monitoring, and failure modes. `user` gets installation, usage, and troubleshooting.
9. **AUDIT IS REPORT-ONLY BY DEFAULT**: `--audit` produces a cleanup report with recommendations. It does NOT rename, delete, or rewrite files unless the user explicitly confirms individual actions. List all findings, let the user decide what to apply.
10. **AUDIT HYGIENE STANDARDS**: During `--audit`, enforce: no future tense in docs ("This does X" not "This will do X"), no first person ("I" has no place in technical docs), all cross-references must be hyperlinked, and docs must be right-sized — short, living, and tied to code.
11. **CI/CD INTEGRATION**: `--check` and `--audit` must support pipeline usage. When running in a CI context (detect via `CI=true` env var or `--ci` flag), output machine-parseable results and return non-zero exit codes on violations: exit 1 for missing required docs, exit 1 for broken links, exit 1 for stale docs past threshold. This allows gating merges on documentation health.
12. **MONITORING LINKAGE**: When creating or auditing runbooks, verify that incident response entries reference specific alert names or monitoring rules. Flag runbook entries with no link to the alerting system — a runbook that can't be found from the alert is a runbook that won't be used.

## OUTPUT FORMAT

### No-arg catalog output

```markdown
# 📄 DOCUMENT STATUS: {Project Name}

## Requirements & Concept
| Type | Name | Status | Location | Last Modified |
|------|------|--------|----------|---------------|
| conops | Concept of Operations | ❌ Missing | — | — |
| srs | Requirements Spec | 🟡 Stale | docs/srs.md | 2025-11-03 |

## Design & Architecture
| Type | Name | Status | Location | Last Modified |
|------|------|--------|----------|---------------|
| sad | Architecture Description | ✅ Current | docs/architecture.md | 2026-04-01 |
| sdd | Design Document | ❌ Missing | — | — |
| icd | Interface Control | ❌ Missing | — | — |
| adr | Decision Records | ✅ Current (3 ADRs) | docs/decisions/ | 2026-03-28 |

## Testing & Quality
...

## Delivery & Operations
...

## Recommendations
- **Create next**: `sdd` — project has architecture doc but no design-level detail.
- **Update**: `srs` — 5 months stale, 12 commits to src/ since last update.
- **Premature**: `runbook`, `smp` — project is pre-production.
```

### Create/Update output

Write the document to the target path, then summarize:

```markdown
## Post-Create Summary
- **Sections filled from evidence**: 9/12
- **Sections marked TODO**: 3 (Security Design, Scaling, Known Issues)
- **Key sources used**: docs/architecture.md, src/core/, pyproject.toml, git log
- **Recommended next action**: Fill TODO sections, then run `/docs sdd --check` to verify freshness.
```

### Audit output

```markdown
# 🧹 DOCS AUDIT: {Project Name}

## ✂️ Prune
- **Rename**: `Docs/My_Architecture.md` → `docs/arch/main.md`
- **Rename**: `docs/API_Reference.md` → `docs/api/reference.md`
- **Delete**: `docs/todo.md` — all tasks completed, move to CHANGELOG.md
- **Delete**: `src/auth.ts:12-62` — 50-line comment block → extract to `docs/auth.md`
- **Delete**: `src/db.ts:8` — `// Get user from database` (restates code)

## ✏️ Rewrite
- **Defluff**: `docs/setup.md:1` — remove "Welcome to the project! We're glad you're here."
- **DRY**: `docs/setup.md:15-20` — duplicates README.md installation steps → replace with link
- **Passive→Imperative**: `docs/guide.md:8` — "The server can be started by running..." → "Run..."

## 🔗 Fix
- **Broken link**: `docs/arch/main.md:42` → `docs/api/old-spec.md` (file deleted)
- **Missing env**: `REDIS_CACHE_TTL` found in `src/cache.ts:3` but missing from `.env.example`
- **Missing front-matter**: 4 files lack `Updated:` date — `docs/guide.md`, `docs/config.md`, ...

## 📊 Summary
| Category | Issues | Auto-fixable |
|----------|--------|--------------|
| Naming violations | 3 | Yes (rename) |
| DRY violations | 2 | Yes (replace with link) |
| Zombie tasks | 1 | Yes (delete) |
| Fluff | 4 | Yes (delete) |
| Comment essays | 1 | Manual (extract to docs/) |
| Redundant comments | 6 | Yes (delete) |
| Broken links | 1 | Manual (retarget or remove) |
| Missing env vars | 1 | Yes (add to .env.example) |
| Missing front-matter | 4 | Yes (add template) |
| Stale diagrams | 0 | — |
| **Total** | **23** | **18 auto-fixable** |
```

## RELATED COMMANDS

- `/report` for full project health assessment across tech/research/business.
- `/docs` (this command) for individual document lifecycle management.
- `qa-review` for code-level risk review.
- `ops-doctor` for repo health and sync integrity.
- `ops-deps` for dependency audit.
- `arch-roadmap` for architecture and execution planning.

## NON-GOALS

- Not a document generator that fabricates content from nothing.
- Not a style guide enforcer (use linters for that).
- Not a replacement for domain expertise — it fills from evidence, marks TODO where it can't.
- Not a compliance auditor — it checks existence and freshness, not regulatory conformance.
