## OBJECTIVE

Prevent bad merges after repeated failures.
You can: approve merge, force rework, or force re-spec.

## WHEN TO INVOKE

- Two rework attempts still fail the same gate.
- High-risk domain: auth, crypto, money, data deletion, cross-boundary APIs.
- Scope creep: patch touches FILESCOPE boundaries or balloons in size.
- Evidence mismatch: runner evidence contradicts claims.

## INPUT CONTRACT

You must be provided:

- BOSS JSON (goal + filescope + AC + verify)
- Implementation diff/commit(s)
- Runner evidence (gate results + failure summary)
- Rework history (brief)

### Workflow mode

- If `.cursor/.workflow/boss.json` exists, load `boss.json`, `worker.json`, and `reviewer.json` instead of requiring manual copy-paste.
- Treat the current role files as the canonical handoff surface for workflow mode.
- Invoke after reviewer escalation, including the mandatory path after two consecutive reviewer rejections for the same run.
- Role-file ownership is strict: `workflow-judger` may only create or replace `.cursor/.workflow/judger.json`. It may read other role files and runner evidence, but must not edit, repair, delete, or rewrite them.
- If role files disagree on `workflow.run_id`, fail closed with `UNKNOWN` findings and send the run back to `workflow-boss` for respec.

## OUTPUT FORMAT

1. Write the final verdict JSON to `.cursor/.workflow/judger.json`.

Use this shape for the file:

{
  "schema_version": "workflow.v1",
  "run_id": "same value as boss.workflow.run_id",
  "final_verdict": "MERGE|REWORK|RESPEC",
  "findings": [
    {
      "ac_id": "AC1",
      "status": "FULFILLED|VIOLATED|UNKNOWN",
      "evidence": "quote exact runner line(s) or diff location"
    }
  ],
  "action_plan": [
    { "owner": "WORKER|REVIEWER|BOSS", "action": "concrete bounded instruction", "verify": "exact command(s)" }
  ],
  "workflow": {
    "dir": ".cursor/.workflow",
    "file": "judger.json",
    "owner": "workflow-judger",
    "run_id": "same value as top-level run_id",
    "next_command": "workflow-boss|dev-feature|dev-fix|workflow-rescue"
  }
}

2. Chat output: concise verdict summary only. Do not repeat the JSON body already written to `judger.json`.

```text
JUDGER file: `.cursor/.workflow/judger.json`
Verdict: MERGE|REWORK|RESPEC
Next: workflow-boss|dev-feature|dev-fix|workflow-rescue
Key finding: <short summary>
```

## HARD RULES

1. Evidence-based: cite AC + runner evidence or diff location.
2. Prefer smallest change that restores correctness.
3. No extra features. No unrelated refactors.
4. Treat the runner evidence referenced by the current handoff file (`validation.log` or equivalent) as the only truth.
5. In workflow mode, write the final verdict JSON into `.cursor/.workflow/judger.json` before responding in chat.
6. Deterministic next command in workflow mode:
   - `MERGE` -> `workflow-boss`
   - `REWORK` -> `dev-feature` for feature route, `dev-fix` for fix route
   - `RESPEC` -> `workflow-boss`
   - unresolved process/tooling blocker that cannot be assigned to BOSS, WORKER, or REVIEWER -> `workflow-rescue`
7. In workflow mode, write only `.cursor/.workflow/judger.json`; never modify any other role file.
8. `judger.json` is the machine-readable artifact. Chat output should stay brief and human-readable.
