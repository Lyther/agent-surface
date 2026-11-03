---
name: ops-flow
description: "Route work to direct, standard, reviewed, orchestrated, release, audit, parallel, or shipping paths using risk, ambiguity, proof, and parallelism."
---

## Objective

Choose the lightest execution path that preserves correctness and the required proof; multi-agent orchestration must earn its coordination cost. `ops-flow` classifies and routes; it does not implement, review, or ship. Prefer repository evidence over the user's or agent's estimate of task size.

## Input

`ops-flow [goal] [--risk low|medium|high|critical|auto] [--mode direct|standard|reviewed|orchestrated|release|audit|parallel|ship|auto] [--autonomy low|normal|high]`

Defaults: `--risk auto --mode auto --autonomy normal`.

## 1. Locate the Task Shape

Inside `agent-surface`, load both live procedure catalogs first:

```bash
node scripts/agent-surface.mjs skills --json
node scripts/agent-surface.mjs commands --json
```

Answer from the request and repository:

1. Is the result an edit, an investigation, a release claim, or publication?
2. Is the behavior specified, or is product or architecture intent ambiguous?
3. Does it touch authentication, authorization, cryptography, payments, secrets, migrations, production data, deployment, security findings, dependency or release gates, or destructive behavior?
4. Does acceptance need a real external dependency, built artifact, clean-room install, deployment, or live service?
5. Are there at least two writable workstreams with disjoint files, generated outputs, lockfiles, migrations, ports, databases, and fixtures?
6. What is the smallest deterministic check that can reject a wrong result?

Parallel width comes from independent workstreams, not checklist length; a sequential dependency chain has width one.

## 2. Choose One Profile

| Profile | Use when | Runtime shape | Evidence |
| --- | --- | --- | --- |
| `direct` | Trivial, obvious, reversible work with a tiny filescope | Current session; no planner or reviewer | Diff plus focused check |
| `standard` | Normal bounded implementation with clear behavior | One owner runs locate → edit → verify → self-review | Diff plus relevant repo gates |
| `reviewed` | Security-sensitive, public/shared contract, broad regression surface, or meaningful failure cost | One writer, then one independent read-only reviewer; at most two rework cycles | Writer checks plus reviewer verdict |
| `orchestrated` | Two or more genuinely independent workstreams, or a long-running dependency graph that benefits from durable state | Central orchestrator; isolated worktrees for concurrent writers; formal workflow ledger | Per-workstream evidence plus integrated QA |
| `release` | A stable candidate must support readiness, artifact, deployment, or acceptance claims | Freeze candidate → build → real proof → independent release QA | Candidate identity plus real proof bundle |
| `audit` | Unknown cause/risk, vulnerability investigation, broad claim review, or diagnosis-only request | Read-only analyst/reviewer; parallel read-only probes allowed | Findings tied to source/evidence |
| `parallel` | Independent read-only exploration or competing proposals; no shared writer state | Bounded swarm/subagents; one owner consolidates | Per-probe evidence; not a merge verdict |
| `ship` | Accepted changes only need commit, push, release, or deployment | Route-specific shipping workflow | Publication/deployment result |

- A small cross-file change is usually `standard`.
- High or critical risk requires `reviewed`; it does not by itself require multiple writers or BOSS.
- Choose `orchestrated` only when isolation or durable long-run state creates measurable leverage; never use BOSS merely because a task has several steps, and never give overlapping files or sequential tasks to multiple writers.
- Choose `release` only once the candidate is stable enough to freeze; never generate release-grade provenance for an unstable intermediate patch.
- Use `parallel` freely for read-only discovery, but keep one writer unless filescope isolation is proven.
- If a formal run is already active, run `workflow-doctor` before starting another route.

## 3. Select the Next Workflow

```text
direct/standard: dev-feature | dev-fix | dev-core | dev-chore | dev-refactor
reviewed:        route-specific dev command -> qa-review|qa-audit|qa-trace
orchestrated:    workflow-orchestrator
release:         verify-prove -> verify-readiness when the claim requires it
audit:           qa-review | qa-audit | qa-trace | ops-report
parallel:        ops-swarm
ship:            ship-commit | ship-artifact | ship-cicd | ship-release | ship-deploy
```

Use `workflow-boss` only inside an admitted `orchestrated` or `release` run, or when the user explicitly requests formal decomposition. Do not turn every QA helper into a serial phase.

For architecture-heavy development with an accepted roadmap, prefer the staged path:

```text
arch-roadmap (family A)
  -> dev-spec (fresh family B; requirement-derived RED core slice)
  -> dev-core (family A; frontier xhigh/max; runnable spine, then pause)
  -> dev-feature (family A at lower effort, or family C)
```

Repeat `dev-spec` for later behavior slices when independent specification adds value. Skip `dev-core` when the architecture and central ownership already exist, and never route a localized feature or bug through it merely because a stronger model is available.

For brownfield fixes, prefer a compact contract:

```text
Current behavior:
Expected behavior:
Must remain unchanged:
Acceptance checks:
```

Use architecture commands only when the answer would materially change the implementation. Before choosing a provider, prove the runtime can read, edit when authorized, run checks, and materialize the required output. Workflow artifacts, agent messages, and model diversity are not product progress.

## Readiness Claims

`stable`, `production-ready`, `release-ready`, `deployment-ready`, `E2E passed`, `100% implemented`, or `all features supported` require `release` profile evidence; green unit tests alone never satisfy it. Use the relevant rungs of this ladder, not every command mechanically:

```text
dev-spec / verify-test
  -> verify-coverage for Critical/High discrimination
  -> verify-edge / verify-performance when relevant
  -> verify-prove against shipped bits and real dependencies
  -> independent QA with no open Critical/High
  -> verify-readiness
```

## Autonomy

`low` and `normal` opt in to more asking. `high` is the distribution's standing policy: it must not re-add stops that policy removed, so destructive, secret-using, deploying, publishing, and other outward-facing steps within the requested scope proceed.

```text
low:    ask before assumptions, dependencies, risky commands, or protected files
normal: proceed with reversible assumptions; ask only when a choice changes behavior or authority
high:   proceed through the requested scope, including destructive, credential-using, and outward-facing
        steps; stop only for a P0 violation, an action only a human can perform (subscription login,
        device confirmation, CAPTCHA, hardware touch), a target that cannot be resolved from the task or
        live evidence, or work that is outside the scope actually requested
```

## Output

Return exactly one routing object:

```json
{
  "profile": "direct|standard|reviewed|orchestrated|release|audit|parallel|ship",
  "risk": "low|medium|high|critical",
  "autonomy": "low|normal|high",
  "why": ["short evidence-backed reason"],
  "next_command": "command name or null",
  "writer_count": 1,
  "independent_review": false,
  "real_acceptance": false,
  "parallel_width": 1,
  "max_rework_cycles": 0,
  "time_budget_minutes": 30,
  "required_evidence": [],
  "human_approval_needed": false,
  "approval_reason": null
}
```

For `orchestrated`, `parallel_width` is at least 2 or `why` names the long-running state-management need. For `reviewed`, set `independent_review=true` and `max_rework_cycles` to 1 or 2. For `release`, set `real_acceptance=true`.
