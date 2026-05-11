## OBJECTIVE

Validate the active agent-surface workflow state before any role acts on it.

`workflow-doctor` is read-only. It diagnoses state drift, stale artifacts, invalid schemas, lock problems, branch/base mismatches, missing evidence, and unsafe compatibility copies.

## CANONICAL PATHS

```text
.agent-surface/workflows/current.json
.agent-surface/workflows/<run_id>/run.json
.agent-surface/workflows/<run_id>/events.ndjson
.agent-surface/workflows/<run_id>/lock
.agent-surface/workflows/<run_id>/boss.json
.agent-surface/workflows/<run_id>/worker.json
.agent-surface/workflows/<run_id>/reviewer.json
.agent-surface/workflows/<run_id>/judger.json
.agent-surface/workflows/<run_id>/rescue.json
.agent-surface/workflows/<run_id>/rounds/<round_id>/
```

`.cursor/.workflow/` is an adapter compatibility surface only. It must not override canonical `.agent-surface/workflows/` state.

## CHECKS

1. Resolve active run from `.agent-surface/workflows/current.json`.
2. Confirm `run.json` exists and has `schema_version: workflow.v3`.
3. Validate `run_id`, `branch`, `base_commit`, `base_tree_hash`, `current_round`, and `workflow_next_command`.
4. Verify current git branch and base commit/tree binding.
5. Verify lock owner, role, timestamp, and stale-lock policy.
6. Parse every present role artifact before reading free text.
7. Validate role artifact `schema_version`, `workflow.run_id`, `workflow.round_id`, `workflow.owner`, and `workflow.next_command`.
8. Validate parent artifact hashes before trusting downstream artifacts.
9. Validate `events.ndjson` is append-only parseable JSONL and references existing artifacts.
10. Confirm evidence refs exist and hashes match for completed worker tasks.
11. Confirm patch refs exist and hashes match for completed worker tasks.
12. Confirm root role files match the latest canonical round artifacts.
13. Report `.cursor/.workflow/` compatibility files as stale if they disagree with canonical artifacts.
14. Confirm workflow state is gitignored.

## OUTPUT

```json
{
  "status": "PASS|WARN|FAIL",
  "run_id": "id or null",
  "canonical_dir": ".agent-surface/workflows/<run_id>",
  "issues": [
    {
      "severity": "blocker|major|minor",
      "check": "short check name",
      "evidence": "file/path/field",
      "fix": "concrete next action"
    }
  ],
  "next_command": "workflow-boss|dev-feature|dev-fix|dev-chore|dev-refactor|qa-trace|qa-review|workflow-reviewer|workflow-judger|workflow-rescue|workflow-close|null"
}
```

## HARD RULES

1. Do not repair artifacts.
2. Do not delete locks.
3. Do not choose the newest file by mtime.
4. Do not trust `.cursor/.workflow/` when canonical `.agent-surface/workflows/` exists.
5. If canonical and compatibility artifacts disagree, canonical wins and status is at least `WARN`.
