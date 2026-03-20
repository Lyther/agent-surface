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
    - Avoid "cleanup" or "refactoring" unrelated code (do that later in `refactor`).
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

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| Fixing without test | Regression test first |
| "Refactoring" while fixing | Atomic fix only |
| Suppressing error | Handling error |
| Editing test to pass | Editing code to pass |
