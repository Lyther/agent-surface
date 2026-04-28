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

### Phase 0: Workflow mode (role-file handoff, v2 batched)

1. **Workflow Detection**:
    - If `.cursor/.workflow/boss.json` exists and the route is `fix`, workflow mode is ON.
    - If no workflow folder exists, behave exactly like normal `dev-fix`.
2. **Load Active Handoff**:
    - Load `.cursor/.workflow/boss.json`. The new shape (`schema_version: workflow.v2`) carries a `tasks` array — a queue of 1 to N atomic fixes plus a `batch_policy` block.
    - If `reviewer.json`, `judger.json`, or `rescue.json` exists and `workflow.next_command = 'dev-fix'`, treat it as the latest rework handoff layered on top of `boss.json`. Rework names *which task IDs* to redo, not the whole batch.
    - If more than one rework file points back to `dev-fix`, prefer the newest by mtime; treat older ones as stale.
    - Reuse the stored FILESCOPE, AC, and runner context instead of asking the human to paste them again.
    - If role files disagree on `workflow.run_id`, stop and route to `workflow-boss` instead of guessing.
3. **Iterate the Task Queue (Burn As Many As Possible)**:
    - Process tasks in array order, respecting `depends_on`.
    - For each task:
      a. Write the regression test (Phase 1) — must FAIL first.
      b. Apply the patch (Phase 2).
      c. Run the task's `verify` commands; capture evidence under `.cursor/.workflow/evidence/<task_id>.log`.
      d. If green → mark **completed**, append to `tasks_processed`, continue.
      e. If red → mark **blocked** with a structured blocker, stop the round.
    - **Stop conditions** (priority order): blocker → context_pressure (`batch_policy.context_pressure_threshold_pct`, default 70) → queue_empty → drift_check (every `batch_policy.drift_check_every` completed tasks). Respect `batch_policy.max_tasks_per_round` if set.
4. **Write Worker Artifact (v2 batched)**:
    - Persist `.cursor/.workflow/worker.json` using the same shape as `dev-feature` (see that file's Phase 0 for the full schema). Each task entry must include the regression proof (test that was failing → now passing).
    - Set `workflow.next_command = 'workflow-reviewer'`.
    - Do not repeat the JSON body in chat — summarize: `Round done: M/N fixes shipped; stop_reason=<reason>`.
    - Role-file ownership is strict: the worker role may only create or replace `.cursor/.workflow/worker.json`.
5. **No Forced Commit in Workflow Mode**:
    - In workflow mode, hand off via `worker.json` + runner evidence first.
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
  - Record the per-task fix results in `.cursor/.workflow/worker.json` (v2 shape — see `dev-feature` Phase 0).
  - Each task entry must carry its regression proof (failing → passing test) under `evidence_refs`.
  - Set the next recommended command to `workflow-reviewer`.
  - Preserve `boss.workflow.run_id` in `worker.json.workflow.run_id`.
  - Do not force a commit before reviewer handoff unless the user explicitly requests it.
  - Do not dump the `worker.json` contents in chat; summarize: `Round done: M/N fixes shipped; stop_reason=<reason>; next: workflow-reviewer`.
- **Workflow mode OFF**:
  - Proceed with the normal fix proof flow and hand off to `ship-commit` when ready. Do not auto-commit here.

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
> Workflow File: `.cursor/.workflow/worker.json`
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

1. Regression test first — for every task in the batch, not just the first.
2. Minimal patch only. Don't refactor neighboring code while you're in there.
3. In workflow mode, write the worker artifact to `.cursor/.workflow/worker.json` before handing off to `workflow-reviewer`.
4. In workflow mode, write only `.cursor/.workflow/worker.json`; never modify another role file.
5. **BURN THE QUEUE** but stop on the first hard blocker. Don't skip a failing fix to do the next one — that creates partial-merge ambiguity.
6. **STOP SOONER UNDER PRESSURE**: ≥30 distinct files, ≥5 verify cycles, or context degradation → stop with `stop_reason=context_pressure` even if no blocker.
