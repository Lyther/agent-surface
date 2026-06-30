---
name: dev-refactor
phase: build
description: "Reduce complexity while preserving behavior exactly."
---
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

## COMMAND REUSE

Use existing commands as helper functions when they improve behavior preservation:

- `boot-context`: stale or missing local context.
- `arch-model`, `arch-api`, `arch-roadmap`: understand boundaries before restructuring.
- `lint-python`, `lint-rust`, `lint-go`, `lint-typescript`, `lint-shell`, `lint-kernel`: language-specific checks for touched files.
- `verify-test`, `verify-spec`, `verify-coverage`, `verify-performance`: pre/post behavior and performance proof.
- `qa-review`: independent review for public API, config, or broad module moves.
- `ops-swarm`: parallel non-blocking analysis/check packets only when FILESCOPE isolation is clear.

In workflow mode, helper command output is evidence, not the final format. Keep writing `worker.json`, evidence refs, patch refs, and the normal `workflow.next_command = "workflow-reviewer"`.

## WORKFLOW MODE

Workflow mode is ON when `.agent-surface/workflows/<run_id>/run.json` is active, lock is valid, `.agent-surface/workflows/<run_id>/boss.json` uses `schema_version: workflow.v3`, and `boss.workflow.route = "refactor"`.

Protocol:

1. Load `run.json`, `boss.json`, and latest reviewer/judger/rescue handoff when `workflow.next_command = "dev-refactor"`.
2. Start from `boss.context_capsule` and inspect only deltas unless evidence is missing, stale, contradictory, or changed since BOSS captured it.
3. Process only active task IDs, respecting dependencies and FILESCOPE.
4. Capture pre-change proof: tests, lint, typecheck, behavior snapshot, or explicit reason the proof is unavailable.
5. If coverage is weak, add pinning tests before changing structure.
6. Apply one structural transformation at a time. Preserve public API unless BOSS AC explicitly permits a rename/move.
7. Run task verify commands through:

```text
agent-surface run --task <task_id> --class <class> --timeout <ms> --out .agent-surface/workflows/<run_id>/rounds/round-<round_id>/evidence/<task_id> -- <command...>
```

8. Wrap each task with `agent-surface workflow patch begin/end/verify` so patches, tree hashes, changed files, and clean-apply proof are generated mechanically.
9. Before marking a task blocked, apply the Blocker Discipline section below.
10. Write canonical worker artifact to `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/worker.json` and latest copy to `.agent-surface/workflows/<run_id>/worker.json`.
11. Set `workflow.owner = "dev-refactor"` and `workflow.next_command = "workflow-reviewer"`.
12. Advance the ledger with `agent-surface workflow apply --role dev-refactor --run <run_id> --artifact .agent-surface/workflows/<run_id>/worker.json`; this appends the transition event and sets `run.json.workflow_next_command`. Do not hand-edit `run.json`.

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
      "status": "PASS",
      "files_changed": [],
      "name_status_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.name-status.txt",
      "patch_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.patch",
      "patch_hash": "sha256:...",
      "pre_tree_hash": "1111111111111111111111111111111111111111",
      "post_tree_hash": "2222222222222222222222222222222222222222",
      "applies_cleanly": true,
      "evidence_refs": [],
      "verify_results": [],
      "behavior_preservation": {
        "pre_change_evidence": [],
        "post_change_evidence": [],
        "api_changed": false
      }
    }
  ],
  "skipped": [],
  "remaining": [],
  "stop_reason": "queue_empty",
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

## BLOCKER DISCIPLINE

Do not emit a blocker until you have attempted the safe discovery or repair available to the worker.

- Not blockers: repo discovery, selecting verify commands from manifests/Makefiles/CI, scoped format/lint/test failures in owned files, and documentation alignment for public behavior in FILESCOPE. Resolve these before stopping.
- Conditional worker-owned recovery: generated artifact refresh is allowed only when BOSS assigned generated outputs or the repo's generator/check explicitly requires it; record the generator command and keep the normal generated-file gate green.
- Human-required blockers: secrets or credential access, dependency risk that cannot be researched or accepted from available evidence, destructive commands, database mutation, deployment, production data, approval-gated network calls, product decisions not inferable from BOSS/user evidence, or files outside FILESCOPE.
- Repeated failure: after two focused correction attempts on the same task, stop with `blocker.type="repeated_failure"`, `resolution_class="human_required"` unless the next safe action is purely mechanical, and include the failed attempts.
- Every blocker should include `type`, `detail`, `needs`, `resolution_class` (`auto_resolvable` or `human_required`), `attempts`, and `recommended_decision`. Legacy v3 artifacts may omit the last three fields, but new worker output should include them.

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
