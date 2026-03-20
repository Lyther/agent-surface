## OBJECTIVE

**NO PLACE TO HIDE.**
Code that isn't executed by tests is a bug waiting to happen.
**Your Goal**: Identify **Logic Gaps**, **Unreachable Code**, and **Sad Paths** that are ignored by the test suite.
**The Standard**: 100% Branch Coverage on Domain Logic. 0% Coverage on Boilerplate is fine.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Targeted Analysis**:
    - Don't paste the full LCOV report.
    - **Prompt**: "Summarize coverage for `src/auth`. Ignore UI components."
2. **Gap Visualization**:
    - Show the *exact lines* missed, not just the percentage.

## PROTOCOL

### Phase 1: Measurement

1. **Run Coverage Tool**:
    - **TS/JS**: `npm test -- --coverage`
    - **Python**: `pytest --cov=src`
    - **Rust**: `cargo tarpaulin`
2. **Filter Noise**:
    - Exclude: `*.d.ts`, `migrations/`, `config/`, `test/`.

### Phase 2: Analysis (The Gaps)

1. **Identify Misses**:
    - **Branch Miss**: `if (user.isAdmin)` covered, `else` not covered.
    - **Function Miss**: Entire function unused in tests.
    - **Statement Miss**: Error handling catch blocks often missed.
2. **Categorize**:
    - **Critical**: Domain logic, Auth, Money. -> **MUST FIX**.
    - **Trivial**: Logging, simple getters. -> **IGNORE**.

### Phase 3: Remediation

1. **Write Tests**:
    - Use `verify-spec` command to generate tests for the missing paths.
    - Focus on **Edge Cases** and **Error States**.
2. **Delete Dead Code**:
    - If code is unreachable and unreachable in production -> **DELETE**.

## OUTPUT FORMAT

```markdown
# ☂️ COVERAGE REPORT

## Summary
- **Overall**: 85%
- **Critical Gaps**: 2 found

## Gaps
1. **`src/auth/service.ts`**:
   - Lines 45-48: `catch (e) { ... }` (Database connection error)
   - *Risk*: We don't know if the app handles DB downtime gracefully.
   - *Action*: Add test case simulating DB failure.

2. **`src/utils/math.ts`**:
   - Lines 12-15: `if (value < 0)`
   - *Risk*: Negative value handling untested.
   - *Action*: Add test case `expect(calc(-1)).toThrow()`.
```

## EXECUTION RULES

1. **IGNORE BOILERPLATE**: Do not obsess over 100% coverage on DTOs.
2. **FOCUS ON BRANCHES**: Line coverage is a vanity metric. Branch coverage matters.
3. **NO CHEATING**: Do not write tests just to touch lines. Test behavior.
