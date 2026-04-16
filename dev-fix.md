## OBJECTIVE

**THE SURGEON'S SCALPEL.**
You are fixing a confirmed bug. The diagnosis (`debug`) is done.
**Your Goal**: Apply the minimal effective patch. Restore functionality. Do no harm.
**The Law**: Every fix must be proven by a test case.

## VIBE CODING INTEGRATION

This is the **Correction** step:

```text
issue/debug → RCA → FIX → verify → commit
```

## PROTOCOL

### Phase 0: Workflow mode (role-file handoff)

1. **Workflow Detection**:
    - If `.cursor/.workflow/boss.json` exists and the route is `fix`, workflow mode is ON.
    - If no workflow folder exists, behave exactly like normal `dev-fix`.
2. **Load Active Handoff**:
    - In workflow mode, load `.cursor/.workflow/boss.json`.
    - If `reviewer.json`, `judger.json`, or `rescue.json` exists and `workflow.next_command = 'dev-fix'`, treat it as the latest rework handoff layered on top of `boss.json`.
    - If more than one of those files points back to `dev-fix`, prefer the newest one by mtime and treat the others as stale.
    - Reuse the stored FILESCOPE, AC, and runner context instead of asking the human to paste them again.
3. **Write Debugger Artifact**:
    - Persist a normalized debugger artifact to `.cursor/.workflow/debugger.json` with regression proof, touched paths, and diff/log refs.
    - Set `workflow.next_command = 'workflow-reviewer'`.
    - `debugger.json` is the machine-readable handoff. Do not repeat its JSON body in chat.
4. **No Forced Commit in Workflow Mode**:
    - In workflow mode, hand off via `debugger.json` + runner evidence first.
    - Do not auto-commit unless the user explicitly asks.

### Phase 1: The Regression Test (The Vow)

*Never fix a bug without ensuring it stays fixed.*

1. **Create Test Case**:
    - Write a test that **FAILS** due to the bug.
    - If it passes, you haven't reproduced the bug.
    - **Location**: `tests/regressions/` or next to the unit test.
2. **Verify Failure**:
    - Run the test. Confirm it fails with the *expected* error.
    - **Output**: "Test `should_handle_null_user` FAILED as expected."

### Phase 2: The Patch (The Surgery)

1. **Minimal Scope**:
    - Touch only the lines necessary.
    - Avoid "cleanup" or "refactoring" unrelated code (do that later in `dev-refactor`).
2. **Defensive Coding**:
    - Add Guard Clauses.
    - Validate inputs.
    - Handle edge cases explicitly.

### Phase 3: Verification (The Recovery)

1. **Run Regression Test**: Must PASS.
2. **Run Impacted Suite**: Run related tests to ensure no regressions.
3. **Run Full Suite**: If critical path, run everything.

### Phase 4: Clean Up

1. **Refactor**: Now that it's green, make it clean (if messy).
2. **Remove Artifacts**: Delete temporary logs or debug prints.

### Phase 5: Handoff / Commit

- **Workflow mode ON**:
  - Record the debugger artifact in `.cursor/.workflow/debugger.json`
  - Set the next recommended command to `workflow-reviewer`
  - Do not force a commit before reviewer handoff unless the user explicitly requests it
  - Do not dump the `debugger.json` contents in chat; summarize only
- **Workflow mode OFF**:
  - Proceed with the normal fix proof flow and commit only when appropriate for the task

## OUTPUT FORMAT

**1. The Fix**

```typescript
// src/services/Payment.ts
// ...
if (!user.hasCard) {
  // FIX: Added check for missing card
  throw new PaymentError('No card on file');
}
// ...
```

**2. The Proof**

```markdown
> Regression Test: `tests/regressions/issue_123.spec.ts`
> Status: ✅ PASS (Was FAIL)
> Impacted Tests: ✅ All Green
```

**Workflow Handoff (workflow mode only)**

```markdown
> Workflow File: `.cursor/.workflow/debugger.json`
> Next: `workflow-reviewer`
```

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| Fixing without test | Regression test first |
| "Refactoring" while fixing | Atomic fix only |
| Suppressing error | Handling error |
| Editing test to pass | Editing code to pass |

## EXECUTION RULES

1. Regression test first.
2. Minimal patch only.
3. In workflow mode, write the debugger artifact to `.cursor/.workflow/debugger.json` before handing off to `workflow-reviewer`.
