## OBJECTIVE

Perform bounded maintenance work: dependency updates, configuration tweaks, formatting, generated metadata refreshes, and dead-code cleanup.

No production behavior changes. If the work requires behavior changes, route to `dev-feature` or `dev-fix`.

## WHEN TO USE

- BOSS route is `chore`.
- The task is maintenance-only and has explicit FILESCOPE.
- Dependency work has user approval and a rollback path.
- Repo-wide formatting or autofix has explicit approval.

## WHEN NOT TO USE

- Runtime behavior changes.
- Security remediations that alter authorization, validation, crypto, payment, or data mutation behavior.
- Broad dependency upgrades without changelog/advisory review.
- Unscoped `prettier --write .`, `eslint --fix .`, `cargo fix`, or lockfile churn.

## WORKFLOW MODE

Workflow mode is ON when `.agent-surface/workflows/<run_id>/run.json` is active, lock is valid, `.agent-surface/workflows/<run_id>/boss.json` uses `schema_version: workflow.v3`, and `boss.workflow.route = "chore"`.

Protocol:

1. Load `run.json`, `boss.json`, and latest reviewer/judger/rescue handoff when `workflow.next_command = "dev-chore"`.
2. Process only active task IDs, respecting dependencies and FILESCOPE.
3. Scope autofix commands to the task FILESCOPE. Repo-wide autofix requires explicit BOSS approval.
4. Dependency updates require manifest/lockfile intent, changelog or advisory note, and rollback note.
5. Run task verify commands through:

```text
agent-surface run --task <task_id> --class <class> --timeout <ms> --out .agent-surface/workflows/<run_id>/rounds/round-<round_id>/evidence/<task_id> -- <command...>
```

6. Create per-task patches under `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/patches/`.
7. Write canonical worker artifact to `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/worker.json` and latest copy to `.agent-surface/workflows/<run_id>/worker.json`.
8. Set `workflow.owner = "dev-chore"` and `workflow.next_command = "workflow-reviewer"`.

Worker artifact shape:

```json
{
  "schema_version": "workflow.v3",
  "run_id": "<run_id>",
  "round_id": 1,
  "worker": "dev-chore",
  "tasks_processed": [
    {
      "task_id": "T1",
      "status": "PASS|BLOCKED|DEFERRED",
      "files_changed": [],
      "patch_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.patch",
      "patch_hash": "sha256:...",
      "evidence_refs": [],
      "verification": [],
      "scope_notes": [],
      "dependency_notes": [],
      "rollback": ""
    }
  ],
  "skipped": [],
  "remaining": [],
  "stop_reason": "queue_empty|blocker|context_pressure|drift_check|max_tasks_cap",
  "workflow": {
    "dir": ".agent-surface/workflows/<run_id>",
    "file": "worker.json",
    "owner": "dev-chore",
    "run_id": "<run_id>",
    "round_id": 1,
    "parent_artifact_hashes": ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "next_command": "workflow-reviewer"
  }
}
```

## DIRECT MODE

If no active workflow exists, perform the smallest maintenance change that satisfies the user request. Do not auto-commit. Report changed files and checks.

## SAFETY RULES

- Do not change production logic.
- Do not weaken tests, linters, compiler settings, auth checks, or security checks to pass.
- Do not run dependency update, repo-wide formatting, destructive cleanup, or network commands without explicit approval.
- Do not edit workflow artifacts outside `worker.json`, per-task patches, evidence files, and this role's event.
- If a chore exposes a required behavior change, stop and route to `workflow-boss` for route correction.

## CHAT OUTPUT

```text
Worker file: .agent-surface/workflows/<run_id>/worker.json
Round done: M/N chores completed; stop_reason=<reason>; next: workflow-reviewer
Changed: <short file list>
Checks: <command -> passed/failed/not run>
```
