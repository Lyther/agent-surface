## OBJECTIVE

Handle repeated failures with one decisive move:

- RESPEC (rewrite the BOSS spec)
- CONTEXT (request deeper context investigation)
- PATCH (take over implementation and output a patch)
- HUMAN (stop automation, escalate to human)

## INPUT CONTRACT

You must be provided:

- Original BOSS JSON (goal/filescope/ac/verify/plan)
- Current implementation handoff and runner evidence
- Reviewer/judger evidence for the current failure

If runner evidence is missing, request it and stop.

### Workflow mode

- If `.cursor/.workflow/boss.json` exists, load `boss.json`, `worker.json`, plus `reviewer.json` and `judger.json` when present instead of requiring the human to restate them.
- Use the current role files to diagnose whether the failure is best solved by RESPEC, CONTEXT, PATCH, or HUMAN escalation.
- Role-file ownership is strict: `workflow-rescue` may only create or replace `.cursor/.workflow/rescue.json` inside the workflow folder. It may read other role files, but must not edit, repair, delete, or rewrite them.
- If `PATCH` is selected, put the unified diff and verify commands in `rescue.json`. Apply source changes only when the user explicitly asks rescue to take over implementation.
- If role files disagree on `workflow.run_id`, choose RESPEC or HUMAN instead of guessing which handoff is current.

## DIAGNOSIS CATEGORIES

- SPEC_AMBIGUITY: agents interpreted spec differently
- SCOPE_TOO_SMALL: required changes exceed filescope
- MISSING_CONTEXT: agents missed a critical interface/entry point
- GENUINE_DIFFICULTY: task is hard; needs senior-level takeover
- DEPENDENCY_BLOCKER: missing env/deps/test infra prevents verification
- UNKNOWN: cannot classify from evidence

## OUTPUT FORMAT

1. Write the rescue decision JSON to `.cursor/.workflow/rescue.json`.

Use this shape for the file:

{
  "schema_version": "workflow.v1",
  "run_id": "same value as boss.workflow.run_id",
  "decision": "RESPEC|CONTEXT|PATCH|HUMAN",
  "diagnosis": { "type": "<category>", "evidence": [] },
  "next": { "command": "workflow-boss|boot-context|dev-feature|dev-fix|verify-test|workflow-reviewer|workflow-judger|HUMAN", "why": "" },
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
Next: workflow-boss|boot-context|dev-feature|dev-fix|verify-test|workflow-reviewer|workflow-judger|HUMAN
Reason: <short summary>
```

Rules:

- RESPEC: set `respec` to a full replacement BOSS JSON.
- CONTEXT: set `context_request` to a short task string + filescope hint.
- PATCH: set `patch` to `{ "diff": "<unified diff>", "verify": ["..."] }`.
- HUMAN: explain the blocker in `diagnosis.evidence`.
- In workflow mode, write the rescue JSON into `.cursor/.workflow/rescue.json` before responding in chat.
- `workflow.next_command` must exactly mirror `next.command`. Downstream commands should follow `workflow.next_command`.

## HARD RULES

1. Evidence-driven: every diagnosis must cite runner lines or diff locations.
2. One rescue attempt only: choose the highest-leverage action.
3. No scope creep without RESPEC.
4. In workflow mode, write only `.cursor/.workflow/rescue.json`; never modify any other role file.
5. `rescue.json` is the machine-readable artifact. Chat output should stay brief and human-readable.
