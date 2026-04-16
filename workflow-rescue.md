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

- If `.cursor/.workflow/boss.json` exists, load `boss.json`, the current implementation handoff file (`worker.json` or `debugger.json`), plus `reviewer.json` and `judger.json` when present instead of requiring the human to restate them.
- Use the current role files to diagnose whether the failure is best solved by RESPEC, CONTEXT, PATCH, or HUMAN escalation.

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
  "decision": "RESPEC|CONTEXT|PATCH|HUMAN",
  "diagnosis": { "type": "<category>", "evidence": [] },
  "next": { "command": "workflow-boss|boot-context|dev-feature|dev-fix|verify-test|workflow-reviewer|workflow-judger|HUMAN", "why": "" },
  "respec": null,
  "context_request": null,
  "patch": null,
  "workflow": {
    "dir": ".cursor/.workflow",
    "file": "rescue.json",
    "next_command": "workflow-boss|boot-context|dev-feature|dev-fix|verify-test|workflow-reviewer|workflow-judger|HUMAN"
  }
}

2. Chat output: concise rescue summary only. Do not repeat the JSON body already written to `rescue.json`.

```text
RESCUE written: `.cursor/.workflow/rescue.json`
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
4. `rescue.json` is the machine-readable artifact. Chat output should stay brief and human-readable.
