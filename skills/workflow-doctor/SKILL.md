---
name: workflow-doctor
description: "Validate active workflow state before any role acts on it."
---

## Objective

Validate the active agent-surface workflow state before any role acts on it. Stay read-only: run `agent-surface workflow doctor`, then the checks that command does not perform.

```text
.agent-surface/workflows/current.json
.agent-surface/workflows/<run_id>/run.json
.agent-surface/workflows/<run_id>/events.ndjson
.agent-surface/workflows/<run_id>/boss.json
.agent-surface/workflows/<run_id>/worker.json
.agent-surface/workflows/<run_id>/reviewer.json
.agent-surface/workflows/<run_id>/judger.json
.agent-surface/workflows/<run_id>/rescue.json
.agent-surface/workflows/<run_id>/agents.json
.agent-surface/workflows/<run_id>/rounds/<round_id>/
```

`.cursor/.workflow/` is an adapter compatibility surface only; it never overrides canonical `.agent-surface/workflows/` state.

## Checks

Resolve `<run_id>` from `.agent-surface/workflows/current.json`, then run `agent-surface workflow doctor --run <run_id>`. It fails when:

1. `run.json` or `events.ndjson` is missing, `run.json` fails `workflow.run.schema.json`, or its `run_id` is not `<run_id>`.
2. An `events.ndjson` line is not JSON, fails the event schema, names another run, or breaks the `prev_event_hash`/`event_hash` chain.
3. A root or `rounds/round-<n>/boss.json` fails the boss schema or coherence rules, names another run or round, has no `workflow-boss` event carrying its hash, or (root copy) differs from the latest canonical round.
4. A root `worker.json`, `reviewer.json`, `judger.json`, or `rescue.json` fails its schema; doctor checks nothing else about these files.
5. Task buckets in `run.json` overlap, hold a task ID that no event-backed BOSS artifact defines, or miss a task from the latest event-backed BOSS. Prior-round accepted/closed IDs may remain.
6. `agents.json`, when present, fails `workflow.monitor.v2`, names another run or an unknown task, gives concurrent writers a shared workspace or overlapping filescope, exceeds the retry budget, holds a stalled agent, lists a materialized output that is missing, outside the run, empty, a control file, older than the attempt, or future-dated, has out-of-order or future timestamps, or exceeds the first-output, no-progress, or role timeout.
7. An active run's `run.json.workflow_next_command` differs from the latest event's `to`, meaning `run.json` was edited by hand or an apply did not finish.

Verify by hand, because the command does not: `current.json`; branch and base commit against git; parent artifact hashes; evidence files; that every non-boss role artifact was applied (an unapplied artifact passes); non-boss canonical round copies; `.cursor/.workflow/` copies; and that `.agent-surface/workflows/` is gitignored.

## Rules

1. Do not repair artifacts, and do not choose the newest file by mtime.
2. Do not trust `.cursor/.workflow/` when canonical `.agent-surface/workflows/` exists. If canonical and compatibility artifacts disagree, canonical wins and status is at least `WARN`.
3. A schema-valid but contradictory task disposition is `FAIL`.
4. A stale running session is `FAIL` for further automatic routing; mark or terminate it before the next transition. It is not automatically a product blocker.

## Output

```json
{
  "status": "PASS|WARN|FAIL",
  "run_id": "id or null",
  "canonical_dir": ".agent-surface/workflows/<run_id>",
  "issues": [
    { "severity": "blocker|major|minor", "check": "short check name", "evidence": "file/path/field", "fix": "concrete next action" }
  ],
  "next_command": "workflow-boss|dev-feature|dev-fix|dev-chore|dev-refactor|qa-trace|qa-review|workflow-reviewer|workflow-judger|workflow-rescue|workflow-close|null"
}
```
