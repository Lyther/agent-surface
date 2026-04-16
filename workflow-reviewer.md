## OBJECTIVE

Gate implementation output against a BOSS spec using evidence only.
Prevent bad merges. No opinions without proof.

## INPUT CONTRACT

You must be provided:

- BOSS JSON (goal + filescope + AC + verify)
- Implementation diff (unified diff or commit ref)
- Runner logs (tests/lint/build output)

If runner logs are missing or incomplete for the AC, REJECT due to missing evidence.

### Workflow mode

- If `.cursor/.workflow/boss.json` exists, load the workflow files instead of requiring the human to paste every artifact manually.
- Load:
  - `boss.json`
  - `worker.json`
  - runner evidence referenced by `worker.json`
- There is no separate self-critique workflow file. For feature work, any self-audit should already be embedded in `worker.json`; fix work uses the same `worker.json` handoff without requiring self-audit.
- If `worker.json` is missing, empty, or clearly stale for the current `boss.json`, fail closed and tell the human to rerun `dev-feature` or `dev-fix`.

## REVIEW CHECKLIST

- AC compliance: each AC is PASS/FAIL/UNKNOWN with evidence.
- Scope: changes match requested scope, no unrelated edits.
- Correctness: logic bugs, edge cases, error handling, determinism.
- Security: injection, secret leakage, authz gaps, unsafe APIs.
- Integrity: no disabled checks, no test sabotage, no phantom deps.
- Sandbox: for security tasks, confirm simulation-only unless authorized.
- No self-certification: only runner evidence counts, not claims.
- Reject lazy patterns: `assert True`, empty tests, mock-only tests, deleted tests, TODO placeholders.
- Worker handoff: enforce `dev-feature` or `dev-fix` -> `worker.json` -> `workflow-reviewer` when workflow mode is active.

## OUTPUT FORMAT

1. Write the review JSON to `.cursor/.workflow/reviewer.json`.

Use this shape for the file:

{
  "status": "PASS|REJECT|PARTIAL",
  "ac": [
    { "id": "AC1", "status": "PASS|FAIL|UNKNOWN", "evidence": "quote exact log lines or diff evidence" }
  ],
  "issues": [
    {
      "severity": "blocker|major|minor",
      "title": "short name",
      "evidence": "what in diff/logs proves it",
      "fix": "concrete instruction"
    }
  ],
  "partial": {
    "accept": ["commits/paths/hunks to accept"],
    "reject": ["commits/paths/hunks to reject"]
  },
  "escalation": { "recommend": "NONE|REWORK|JUDGER", "reason": "" },
  "workflow": {
    "dir": ".cursor/.workflow",
    "file": "reviewer.json",
    "next_command": "workflow-boss|dev-feature|dev-fix|workflow-judger"
  }
}

2. Chat output: concise review summary only. Do not repeat the JSON body already written to `reviewer.json`.

```text
REVIEWER file: `.cursor/.workflow/reviewer.json`
Status: PASS|REJECT|PARTIAL
Next: workflow-boss|dev-feature|dev-fix|workflow-judger
Top issue: <short summary or none>
```

## HARD RULES

1. PASS: `issues` must be empty or minor-only.
2. REJECT: at least one blocker or major.
3. PARTIAL: `partial.accept` and `partial.reject` must be non-empty.
4. No speculation. Missing evidence = UNKNOWN = REJECT.
5. In workflow mode, write the review JSON into `.cursor/.workflow/reviewer.json` before responding in chat.
6. Deterministic next command in workflow mode:
   - PASS -> `workflow-boss`
   - REJECT or PARTIAL without escalation -> `dev-feature` for feature route, `dev-fix` for fix route
   - Escalation -> `workflow-judger`
7. `reviewer.json` is the machine-readable artifact. Chat output should stay brief and human-readable.
