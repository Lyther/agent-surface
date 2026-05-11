## OBJECTIVE

Reduce complexity while preserving behavior exactly.

Refactor only after the current behavior is pinned by existing tests, explicit pinning tests, or a reviewer-approved proof. If behavior must change, route to `dev-feature` or `dev-fix`.

## WHEN TO USE

- BOSS route is `refactor`.
- The target surface is narrow and FILESCOPE is explicit.
- Tests are already green or the task includes pinning-test acceptance criteria.
- The intended change is structure-only: extraction, renaming, deduplication, moving code, dependency inversion, or local simplification.

## WHEN NOT TO USE

- New feature behavior.
- Bug fixes or semantic changes.
- Public API changes without explicit acceptance criteria.
- Large module rewrites without a staged plan.

## WORKFLOW MODE

Workflow mode is ON when `.agent-surface/workflows/<run_id>/run.json` is active, lock is valid, `.agent-surface/workflows/<run_id>/boss.json` uses `schema_version: workflow.v3`, and `boss.workflow.route = "refactor"`.

Protocol:

1. Load `run.json`, `boss.json`, and latest reviewer/judger/rescue handoff when `workflow.next_command = "dev-refactor"`.
2. Process only active task IDs, respecting dependencies and FILESCOPE.
3. Capture pre-change proof: tests, lint, typecheck, behavior snapshot, or explicit reason the proof is unavailable.
4. If coverage is weak, add pinning tests before changing structure.
5. Apply one structural transformation at a time. Preserve public API unless BOSS AC explicitly permits a rename/move.
6. Run task verify commands through:

```text
agent-surface run --task <task_id> --class <class> --timeout <ms> --out .agent-surface/workflows/<run_id>/rounds/round-<round_id>/evidence/<task_id> -- <command...>
```

7. Create per-task patches under `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/patches/`.
8. Write canonical worker artifact to `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/worker.json` and latest copy to `.agent-surface/workflows/<run_id>/worker.json`.
9. Set `workflow.owner = "dev-refactor"` and `workflow.next_command = "workflow-reviewer"`.

Worker artifact shape:

```json
{
  "schema_version": "workflow.v3",
  "run_id": "<run_id>",
  "round_id": 1,
  "worker": "dev-refactor",
  "tasks_processed": [
    {
      "task_id": "T1",
      "status": "PASS|BLOCKED|DEFERRED",
      "files_changed": [],
      "patch_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.patch",
      "patch_hash": "sha256:...",
      "evidence_refs": [],
      "verification": [],
      "behavior_preservation": {
        "pre_change_evidence": [],
        "post_change_evidence": [],
        "api_changed": false
      },
      "risk_notes": []
    }
  ],
  "skipped": [],
  "remaining": [],
  "stop_reason": "queue_empty|blocker|context_pressure|drift_check|max_tasks_cap",
  "workflow": {
    "dir": ".agent-surface/workflows/<run_id>",
    "file": "worker.json",
    "owner": "dev-refactor",
    "run_id": "<run_id>",
    "round_id": 1,
    "parent_artifact_hashes": ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "next_command": "workflow-reviewer"
  }
}
```

## DIRECT MODE

If no active workflow exists, keep the refactor narrow and reversible. Run the cheapest behavior-preserving checks before and after. Do not auto-commit.

## SAFETY RULES

- No new features.
- No bug fixes hidden inside refactors.
- No public API changes unless BOSS AC explicitly allows them.
- Do not weaken tests, linters, compiler settings, auth checks, or security checks to pass.
- Do not edit workflow artifacts outside `worker.json`, per-task patches, evidence files, and this role's event.
- If behavior changes are necessary, stop and route to `workflow-boss` for route correction.

## CHAT OUTPUT

```text
Worker file: .agent-surface/workflows/<run_id>/worker.json
Round done: M/N refactors completed; stop_reason=<reason>; next: workflow-reviewer
Changed: <short file list>
Checks: <command -> passed/failed/not run>
```
