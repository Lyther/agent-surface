---
name: dev-refactor
description: "Reduce complexity while preserving behavior exactly."
---

## Objective

Reduce complexity while preserving behavior exactly. Refactor only after current behavior is pinned by existing tests, explicit pinning tests, or a reviewer-approved proof; if behavior must change, route to `dev-feature` or `dev-fix`.

Use it when the BOSS route is `refactor`, the target surface is narrow with an explicit FILESCOPE, tests are already green or the task includes pinning-test AC, and the change is structure-only: extraction, renaming, deduplication, moving code, dependency inversion, or local simplification. Do not use it for new feature behavior, bug fixes or semantic changes, public API changes without explicit AC, or large module rewrites without a staged plan.

## Helpers

- `boot-context`: stale or missing local context.
- `dev-chore`: direction, reuse, single-ownership, proportional-complexity/risk, and user-outcome checkpoint when restructuring starts adding rather than removing conceptual weight.
- `arch-contract`, `arch-roadmap`: understand boundaries before restructuring.
- `lint-python`, `lint-rust`, `lint-go`, `lint-typescript`, `lint-shell`, `lint-kernel`: touched files.
- `dev-spec`, `verify-test`, `verify-coverage`, `verify-performance`: pre/post behavior and performance proof.
- `qa-review`: independent review for public API, config, or broad module moves.
- `ops-swarm`: parallel non-blocking analysis/check packets, only with clear FILESCOPE isolation.

In workflow mode, helper output is evidence, not the output format: `dev-refactor` keeps worker-artifact ownership, applies `dev-chore` findings itself, and still writes `worker.json`, evidence refs, patch refs, and `workflow.next_command = "workflow-reviewer"`.

## Workflow Mode

Workflow mode is ON when `.agent-surface/workflows/<run_id>/run.json` is active, `.agent-surface/workflows/<run_id>/boss.json` uses `schema_version: workflow.v3`, and `boss.workflow.route = "refactor"`.

1. Load `run.json`, `boss.json`, and the latest reviewer/judger/rescue handoff when `workflow.next_command = "dev-refactor"`.
2. Start from `boss.context_capsule`; inspect only deltas unless evidence is missing, stale, contradictory, or changed since BOSS captured it.
3. Process only active task IDs, respecting dependencies and FILESCOPE.
4. Capture pre-change proof (tests, lint, typecheck, behavior snapshot) or an explicit reason it is unavailable; when coverage is weak, add pinning tests before changing structure.
5. Apply one structural transformation at a time. Preserve public API unless BOSS AC explicitly permits a rename or move.
6. Run task verify commands through `agent-surface run --task <task_id> --class <class> --timeout <ms> --out .agent-surface/workflows/<run_id>/rounds/round-<round_id>/evidence/<task_id> -- <command...>`.
7. When `task.patch_required=true`, wrap the task with `agent-surface workflow patch begin/end/verify`; otherwise record ordinary diff evidence and mark it ineligible for partial merge.
8. Apply Blocker Discipline before marking a task blocked.
9. Write the canonical `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/worker.json` and the latest copy `.agent-surface/workflows/<run_id>/worker.json`, with `workflow.owner = "dev-refactor"` and `workflow.next_command = "workflow-reviewer"`.
10. Advance the ledger with `agent-surface workflow apply --role dev-refactor --run <run_id> --artifact .agent-surface/workflows/<run_id>/worker.json`; this appends the transition event and sets `run.json.workflow_next_command`. Never hand-edit `run.json`.

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
      "patch_required": true,
      "files_changed": [],
      "name_status_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.name-status.txt",
      "patch_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.patch",
      "patch_hash": "sha256:...",
      "pre_tree_hash": "1111111111111111111111111111111111111111",
      "post_tree_hash": "2222222222222222222222222222222222222222",
      "applies_cleanly": true,
      "evidence_refs": [],
      "verify_results": [],
      "behavior_preservation": { "pre_change_evidence": [], "post_change_evidence": [], "api_changed": false }
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

Without an active workflow, keep the refactor narrow and reversible, run the cheapest behavior-preserving checks before and after, and do not auto-commit.

## Blocker Discipline

Attempt the safe discovery or repair available to you before emitting a blocker.

- Not blockers; resolve them: repo discovery, choosing verify commands from manifests/Makefiles/CI, scoped format/lint/test failures in owned files, and documentation alignment for public behavior in FILESCOPE.
- Refresh generated artifacts only when BOSS assigned generated outputs or the repo's generator/check requires it; record the generator command and keep the generated-file gate green.
- Human-required: a literal human-only login/device action, a product decision not inferable from BOSS/user evidence, or required work outside FILESCOPE that cannot be split safely. In-scope secret use, dependency work, destructive commands, database mutation, deployment, production data, and network calls proceed under the distribution's full-execution consent.
- Repeated failure: after two focused correction attempts on one task, stop with `blocker.type="repeated_failure"` and `resolution_class="human_required"` unless the next safe action is purely mechanical; include the failed attempts.
- Every blocker should include `type`, `detail`, `needs`, `resolution_class` (`auto_resolvable` or `human_required`), `attempts`, and `recommended_decision`. Legacy v3 artifacts may omit the last three, but new worker output includes them.

## Safety

- Add no features and hide no bug fixes in a refactor; change public API only when BOSS AC explicitly allows it. If behavior must change, stop and route to `workflow-boss` for route correction.
- Never weaken tests, linters, compiler settings, auth checks, or security checks to pass.
- Edit no workflow artifacts besides `worker.json`, per-task patches, and evidence files; the role's event comes from `workflow apply`.

## Output

```text
Worker file: .agent-surface/workflows/<run_id>/worker.json
Round done: M/N refactors completed; stop_reason=<reason>; next: workflow-reviewer
Changed: <short file list>
Checks: <command -> passed/failed/not run>
```
