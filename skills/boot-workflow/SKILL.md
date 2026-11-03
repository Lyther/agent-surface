---
name: boot-workflow
description: "Show the risk-adaptive agent-surface workflow map, execution profiles, formal-ledger boundary, and next-command rules without starting implementation."
---

## Objective

Explain the available execution shapes and identify the next workflow. This skill neither implements work nor starts a workflow.

```text
understand -> choose the lightest safe profile -> execute -> verify -> review when required -> prove only the frozen candidate
```

## Profile Map

```text
                              [ops-flow]
                                  |
          +-----------+-----------+------------+-------------+
          |           |                        |             |
          v           v                        v             v
       direct      standard                 reviewed      orchestrated
   current owner   one owner         one writer + one QA   formal ledger
          |           |                        |             |
          +-----------+------------------------+-------------+
                                  |
                                  v
                            stable candidate
                                  |
                                  v
                               release
                    artifact + real proof + readiness
```

| Profile | Use for | Shape |
|---|---|---|
| direct | a tiny, obvious, reversible change with an obvious check | inspect -> edit -> focused check -> report |
| standard (default) | ordinary bounded implementation | one owner: locate -> implement -> verify -> self-review -> report; no BOSS, formal ledger, external reviewer, judger, or rescue role |
| reviewed | security-sensitive changes, public/shared contracts, or meaningful regression cost | writer -> verify -> read-only reviewer; a defect returns to the writer, then verify and review again; at most two rework cycles, after which repeated substantive disagreement needs a human decision or route change |
| orchestrated | at least two independent writable workstreams, or a long-running dependency graph that needs durable local state | `workflow-orchestrator` -> `workflow-boss` -> isolated worker sessions -> integration owner -> `workflow-reviewer`; `workflow-judger` only after repeated substantive failure; `workflow-rescue` only for exceptional spec/context/runtime breakdown |
| release | readiness, deployment, artifact, or formal acceptance claims | freeze candidate -> build shipped bits -> real dependency path -> independent QA -> readiness verdict; no release-grade proof for unstable intermediate patches |

Parallel writers require separate worktrees and disjoint files, generated outputs, lockfiles, migrations, ports, databases, and fixtures.

Supporting paths:

```text
audit    -> qa-review | qa-audit | qa-trace | ops-report
parallel -> ops-swarm for independent read-only or isolated probes
ship     -> ship-commit | ship-artifact | ship-cicd | ship-release | ship-deploy
```

Architecture-first development may use a staged model boundary without starting the formal ledger:

```text
arch-roadmap [family A] -> dev-spec [fresh family B] -> dev-core [family A, xhigh/max]
  -> pause -> dev-feature [family A at lower effort, or family C]
```

The first spec covers the runnable core slice; repeat `dev-spec` for later slices when independence is worth the handoff cost.

Invoke `ops-flow` for the evidence-backed routing object. High risk normally upgrades `standard` to `reviewed`; it does not automatically create several writers. Orchestration is for real parallel width or durable long-running/release state.

## Formal Ledger

The formal `workflow.v3` ledger belongs only to the `orchestrated` and `release` profiles:

```text
.agent-surface/workflows/current.json
.agent-surface/workflows/<run_id>/run.json
.agent-surface/workflows/<run_id>/events.ndjson
.agent-surface/workflows/<run_id>/rounds/round-<round_id>/
.agent-surface/workflows/<run_id>/boss.json
.agent-surface/workflows/<run_id>/worker.json
.agent-surface/workflows/<run_id>/reviewer.json
.agent-surface/workflows/<run_id>/judger.json
.agent-surface/workflows/<run_id>/rescue.json
.agent-surface/workflows/<run_id>/agents.json
```

- Workflow state is project-local and gitignored; never commit it. `run.json` plus `events.ndjson` is authoritative; root role files are latest-role views, and canonical round artifacts retain history.
- One active formal run per project. Never choose a handoff by mtime or chat history. Every role owns only its own artifact and allowed source files.
- Create, advance, and close formal state only with `init`, `apply`, and `close`, and validate with `doctor` before every transition:

```bash
agent-surface workflow init --run <run_id>
agent-surface workflow apply --role <role> --run <run_id> --artifact <path>
agent-surface workflow close --run <run_id> --state closed|quarantined|aborted
agent-surface workflow doctor --run <run_id>
```

- Task-state buckets are mutually exclusive: a task cannot be active, accepted, rework, deferred, or closed at the same time.
- Patch manifests are required when partial merge or concurrent writable task isolation is part of the plan; they are not ceremony for a simple single-owner patch.
- `agents.json` is mutable runtime state under `workflow.monitor.v2`; it records liveness and materialized outputs, not product acceptance.
- A stalled session is an execution failure; it does not make the product task human-blocked.

Artifact shapes live with their owning commands; load the owner instead of duplicating them here: `workflow-boss` (spec and task queue), the route-specific `dev-*` worker (worker artifact), `workflow-reviewer` (independent per-task verdict), `workflow-judger` (repeated-failure decision), `workflow-rescue` (exceptional recovery or human escalation), `workflow-close` (terminal run transition), and `workflow-doctor` (CLI schema, event-chain, task-state, patch-hash, and liveness checks, plus the manual checks the CLI skips).

## Runtime Control

Invoke `workflow-runtime` only when the selected profile delegates to a runtime that has not already passed a current task-shaped probe. That command owns CLI/version/help checks, resolved model identity, repository read/command/write/artifact probes, permission and output-shape evidence, provider-family independence, and liveness and cancellation behavior. Keep no volatile model catalog in this map; re-probe model and provider availability.

## Command Protocol

```text
1. Command is present in current context -> execute it.
2. Generated command exists on disk -> read that target-native command -> execute it.
3. Source checkout is agent-surface -> read commands/<name>.md -> execute it.
4. Unknown command -> ask; never invent a process.
```

## Red Flags

Return to `ops-flow` when BOSS is being started for a small sequential fix; two writers need the same file or generated output; workflow artifacts outnumber materialized product outputs; no agent produced a plan, diff, command result, or artifact before its liveness deadline; a candidate is being formally proven while source is still changing; runtimes called independent resolve to the same model family; or a schema-valid run contains contradictory task dispositions.

## Output

```text
Profile: direct|standard|reviewed|orchestrated|release|audit|parallel|ship
Why: <short evidence>
Roles: <minimal required roles>
Formal ledger: yes|no
Runtime probe: required|not required
Next: <one command>
```
