---
name: workflow-close
description: "Close an accepted or aborted workflow run while preserving history."
---

## Objective

Close an accepted or intentionally aborted workflow run without deleting its canonical history: summarize the run, record metrics, preserve unresolved risks, and record the close event.

## Input

```text
.agent-surface/workflows/current.json
.agent-surface/workflows/<run_id>/run.json
.agent-surface/workflows/<run_id>/events.ndjson
.agent-surface/workflows/<run_id>/boss.json
.agent-surface/workflows/<run_id>/reviewer.json
.agent-surface/workflows/<run_id>/judger.json when present
```

Run `workflow-doctor` first as the required structural check, and do not close a run with blocking doctor findings unless the user explicitly asks to abort or quarantine it. Use `ops-report` or `ops-learn` only as helper analysis for summaries or lesson candidates, with output in this skill's close format; unless the user explicitly asks, edit no global memory, run no shipping commands, and change no workflow state outside the close artifacts.

## Procedure

1. Choose the state: `closed` (accepted work is merged or intentionally complete), `quarantined` (artifacts are useful but unsafe to continue automatically), or `aborted` (the user or policy stopped the run before completion). While required role artifacts are missing, only `aborted` is allowed.
2. Write `.agent-surface/workflows/<run_id>/run-summary.md` and `.agent-surface/workflows/<run_id>/metrics.json` with `tasks_total`, `tasks_accepted`, `tasks_reworked`, `tasks_deferred`, `tasks_closed`, `review_reject_count`, `judger_escalation_count`, `rescue_count`, `verify_command_count`, `failed_verify_count`, `scope_violations_caught`, `artifact_validation_failures`, and `human_interventions`.
3. Record the close state with `agent-surface workflow close --run <run_id> --state closed|quarantined|aborted`. It sets `run.json.status`, clears `workflow_next_command`, appends the close event, and clears `current.json` when it names the run; it refuses a run whose `run.json` or event chain is invalid, and a run already closed in another state. Never hand-edit `run.json`, `events.ndjson`, or `current.json`.

## Rules

1. Never delete `.agent-surface/workflows/<run_id>/`.
2. Do not claim work shipped; shipping belongs to the `ship-*` commands.
3. Preserve readiness boundaries: a closed run means the accepted tasks passed review, not that the work is production-ready, deployed, or pushed. Do not upgrade `stable`/`production-ready`/`release-ready`/`E2E passed` claims in the summary; readiness stays unproven until `ship-commit` and the push/MR/release gate run with real-run proof. Record any surviving readiness claim as an unresolved risk.
4. Extract lessons as candidates only; edit global memory or rule files only when the user explicitly asks.

## Output

```text
Workflow closed: <run_id>
State: closed|quarantined|aborted
Summary: .agent-surface/workflows/<run_id>/run-summary.md
Metrics: .agent-surface/workflows/<run_id>/metrics.json
Unresolved risks: N
```
