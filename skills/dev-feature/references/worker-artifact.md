# dev-feature worker artifact (v3)

Companion reference for `dev-feature`. The batched artifact a workflow-mode round writes to
`.agent-surface/workflows/<run_id>/rounds/round-<round_id>/worker.json`, shown with one completed and one
blocked task. When to write it and what each task must record are in `SKILL.md`, Phase 0.

```json
{
  "schema_version": "workflow.v3",
  "run_id": "same value as boss.run_id",
  "round_id": 1,
  "attempt": 1,
  "worker": "dev-feature",
  "tasks_processed": [
    {
      "task_id": "T1",
      "status": "PASS",
      "patch_required": true,
      "summary": "what was done",
      "files_changed": ["src/foo.ts"],
      "name_status_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.name-status.txt",
      "patch_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.patch",
      "patch_hash": "sha256:...",
      "pre_tree_hash": "1111111111111111111111111111111111111111",
      "post_tree_hash": "2222222222222222222222222222222222222222",
      "applies_cleanly": true,
      "evidence_refs": [".agent-surface/workflows/<run_id>/rounds/round-001/evidence/T1/npm-test.stdout.log"],
      "verify_results": [
        {
          "cmd": "npm test src/foo",
          "class": "build_test",
          "cwd": "repo root",
          "timeout_ms": 120000,
          "exit_code": 0,
          "started_at": "ISO-8601",
          "duration_ms": 1234,
          "tree_hash": "2222222222222222222222222222222222222222",
          "stdout_ref": "...",
          "stdout_hash": "sha256:...",
          "stderr_ref": "...",
          "stderr_hash": "sha256:...",
          "redaction": "none|applied"
        }
      ],
      "self_audit": [
        {"check": "no test sabotage", "result": "pass"}
      ],
      "decisions": [],
      "assumptions": [],
      "known_limitations": [],
      "user_visible_behavior_changed": false,
      "contracts_touched": [],
      "blocker": null
    },
    {
      "task_id": "T2",
      "status": "BLOCKED",
      "patch_required": false,
      "summary": "partial implementation",
      "files_changed": [],
      "evidence_refs": [],
      "blocker": {
        "type": "missing_context",
        "detail": "what is wrong",
        "needs": "what would unblock",
        "resolution_class": "human_required",
        "attempts": ["rg for fixture name", "checked package scripts"],
        "recommended_decision": "ask human for missing fixture source"
      }
    }
  ],
  "skipped": [
    {"task_id": "T3", "reason": "dependency_unmet | upstream_blocker | context_pressure | max_tasks_cap | not_in_rework_scope"}
  ],
  "remaining": ["T3", "T4"],
  "stop_reason": "blocker",
  "stop_detail": "free-text — e.g., 'blocker on T2: missing fixture'",
  "workflow": {
    "dir": ".agent-surface/workflows/<run_id>",
    "file": "worker.json",
    "owner": "dev-feature",
    "run_id": "same value as top-level run_id",
    "round_id": 1,
    "parent_artifact_hashes": [
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    ],
    "next_command": "workflow-reviewer"
  }
}
```
