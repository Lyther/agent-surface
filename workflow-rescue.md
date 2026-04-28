## OBJECTIVE

Handle repeated failures with one decisive move, **per task**:

- RESPEC (rewrite the BOSS spec for the stuck task — or the whole batch if the batch premise is broken)
- CONTEXT (request deeper context investigation)
- PATCH (take over implementation for one or more tasks and output a unified diff)
- HUMAN (stop automation, escalate to human)

`workflow-rescue` is the role that admits the spec is wrong, the context is incomplete, or the problem genuinely requires a senior human. Don't be heroic — `MERGE_PARTIAL` happens at the judger; if it reaches you, the *automated* options have run out.

## INPUT CONTRACT

You must be provided:

- Original BOSS JSON v2 (goal/filescope/tasks/ac/verify/plan)
- Current implementation handoff (`worker.json` v2) and runner evidence
- Reviewer/judger evidence for the current failure (per-task verdicts, escalated_task_ids)

If runner evidence is missing, request it and stop.

### Workflow mode

- If `.cursor/.workflow/boss.json` exists, load `boss.json`, `worker.json`, plus `reviewer.json` and `judger.json` when present instead of requiring the human to restate them.
- Use the current role files to diagnose whether the failure is best solved by RESPEC, CONTEXT, PATCH, or HUMAN escalation, **task by task**.
- Role-file ownership is strict: `workflow-rescue` may only create or replace `.cursor/.workflow/rescue.json` inside the workflow folder. It may read other role files, but must not edit, repair, delete, or rewrite them.
- If `PATCH` is selected, put the unified diff and verify commands in `rescue.json`, scoped to the specific task IDs being patched. Apply source changes only when the user explicitly asks rescue to take over implementation.
- If role files disagree on `workflow.run_id`, choose RESPEC or HUMAN instead of guessing which handoff is current.

## DIAGNOSIS CATEGORIES

Apply per task (or per batch if the failure is structural):

- SPEC_AMBIGUITY: agents interpreted the task spec differently
- SCOPE_TOO_SMALL: required changes for the task exceed its narrowed FILESCOPE
- SCOPE_TOO_LARGE: the task is internally two tasks; split it via RESPEC
- MISSING_CONTEXT: agents missed a critical interface/entry point
- GENUINE_DIFFICULTY: task is hard; needs senior-level takeover (use PATCH)
- DEPENDENCY_BLOCKER: missing env/deps/test infra prevents verification
- BATCH_PREMISE_BROKEN: the batch goal itself is wrong; RESPEC the entire run
- UNKNOWN: cannot classify from evidence

## OUTPUT FORMAT

1. Write the rescue decision JSON to `.cursor/.workflow/rescue.json`.

Use this shape (v2):

{
  "schema_version": "workflow.v2",
  "run_id": "same value as boss.workflow.run_id",
  "decision": "RESPEC|CONTEXT|PATCH|HUMAN",
  "scope": "task|batch",
  "target_task_ids": ["T7"],
  "diagnosis": {
    "type": "<category>",
    "evidence": []
  },
  "next": {
    "command": "workflow-boss|boot-context|dev-feature|dev-fix|verify-test|workflow-reviewer|workflow-judger|HUMAN",
    "why": ""
  },
  "respec": null,
  "context_request": null,
  "patch": null,
  "workflow": {
    "dir": ".cursor/.workflow",
    "file": "rescue.json",
    "owner": "workflow-rescue",
    "run_id": "same value as top-level run_id",
    "next_command": "workflow-boss|boot-context|dev-feature|dev-fix|verify-test|workflow-reviewer|workflow-judger|HUMAN"
  }
}

2. Chat output: concise rescue summary only. Do not repeat the JSON body already written to `rescue.json`.

```text
RESCUE file: `.cursor/.workflow/rescue.json`
Decision: RESPEC|CONTEXT|PATCH|HUMAN
Scope: task|batch  (targets: T7)
Next: workflow-boss|boot-context|dev-feature|dev-fix|verify-test|workflow-reviewer|workflow-judger|HUMAN
Reason: <short summary>
```

Per-decision payload rules:

- **RESPEC**: set `respec` to either a full replacement BOSS JSON (`scope: batch`) or a partial patch listing only the affected `tasks[]` entries (`scope: task`). Always set `target_task_ids`.
- **CONTEXT**: set `context_request` to `{ "task_ids": [...], "task": "short investigation prompt", "filescope_hint": [...] }`.
- **PATCH**: set `patch` to `{ "task_ids": [...], "diff": "<unified diff>", "verify": ["..."] }`. The diff must be applicable cleanly to the current worktree.
- **HUMAN**: explain the blocker in `diagnosis.evidence`. Do not invent diffs or specs.
- In workflow mode, write the rescue JSON into `.cursor/.workflow/rescue.json` before responding in chat.
- `workflow.next_command` must exactly mirror `next.command`. Downstream commands follow `workflow.next_command`.

## HARD RULES

1. Evidence-driven: every diagnosis must cite runner lines or diff locations from the actual evidence files.
2. One rescue attempt only: choose the highest-leverage action. Don't queue three rescues for one task.
3. No scope creep without RESPEC. If the task needs files outside its FILESCOPE, that's RESPEC, not silent widening.
4. **Prefer task-scoped over batch-scoped** rescue when only one or two tasks are stuck. Don't burn the whole batch because of T7.
5. **Don't PATCH lightly.** PATCH means rescue is now implementing instead of the worker. Use it when GENUINE_DIFFICULTY is real and the user has authorized takeover, or when the patch is small and the rest of the batch is healthy.
6. In workflow mode, write only `.cursor/.workflow/rescue.json`; never modify any other role file.
7. `rescue.json` is the machine-readable artifact. Chat output stays brief and human-readable.
