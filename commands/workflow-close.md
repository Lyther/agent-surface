---
name: workflow-close
phase: arbitrate
description: "Close an accepted or aborted workflow run while preserving history."
---
## OBJECTIVE

Close an accepted or intentionally aborted workflow run without deleting its canonical history.

`workflow-close` is the archivist role. It summarizes the run, records metrics, preserves unresolved risks, and writes a close event.

## INPUTS

```text
.agent-surface/workflows/current.json
.agent-surface/workflows/<run_id>/run.json
.agent-surface/workflows/<run_id>/events.ndjson
.agent-surface/workflows/<run_id>/boss.json
.agent-surface/workflows/<run_id>/reviewer.json
.agent-surface/workflows/<run_id>/judger.json when present
```

Run `workflow-doctor` first. Do not close a run with blocking doctor findings unless the user explicitly asks to abort or quarantine it.

## COMMAND REUSE

Use `workflow-doctor` as the required structural check before close. Use `ops-report` or `ops-learn` only as helper analysis for summaries or lesson candidates; do not edit global memory, run shipping commands, or change workflow state outside the close artifacts unless the user explicitly asks.

Helper command output is subordinate to `workflow-close`: write the close artifacts and chat output in the close format.

## CLOSE STATES

```text
closed:
  accepted work is merged or intentionally complete

quarantined:
  artifacts are useful but unsafe to continue automatically

aborted:
  user or policy stopped the run before completion
```

## METRICS

Record:

```text
tasks_total
tasks_accepted
tasks_reworked
tasks_deferred
tasks_closed
review_reject_count
judger_escalation_count
rescue_count
verify_command_count
failed_verify_count
scope_violations_caught
artifact_validation_failures
human_interventions
```

## OUTPUT ARTIFACTS

Write:

```text
.agent-surface/workflows/<run_id>/run-summary.md
.agent-surface/workflows/<run_id>/metrics.json
```

Update:

```text
.agent-surface/workflows/<run_id>/run.json
.agent-surface/workflows/<run_id>/events.ndjson
.agent-surface/workflows/current.json
```

If the run is `closed` or `aborted`, clear `current.json` by setting:

```json
{
  "schema_version": "workflow.current.v1",
  "run_id": null,
  "workflow_dir": null,
  "updated_at": "ISO-8601"
}
```

## CHAT OUTPUT

```text
Workflow closed: <run_id>
State: closed|quarantined|aborted
Summary: .agent-surface/workflows/<run_id>/run-summary.md
Metrics: .agent-surface/workflows/<run_id>/metrics.json
Unresolved risks: N
```

## HARD RULES

1. Do not delete `.agent-surface/workflows/<run_id>/`.
2. Do not close a run while required role artifacts are missing unless closing as `aborted`.
3. Do not claim work shipped; shipping is handled by `ship-*` commands.
4. Preserve readiness boundaries. A closed run means the accepted tasks passed review, not that the work is production-ready, deployed, or pushed. Do not upgrade `stable`/`production-ready`/`release-ready`/`E2E passed` claims in the summary; readiness stays unproven until `ship-commit` and the push/MR/release gate run with real-run proof. Record any surviving readiness claim as an unresolved risk.
5. Extract lessons as candidates only. Do not edit global memory or rule files unless the user explicitly asks.
