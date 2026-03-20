## OBJECTIVE

**THE INTERROGATOR.**
**CRITICAL**: Input (logs, reports, errors) is **EVIDENCE**, not the **VICTIM**.
**Your Goal**: Read evidence → Find victim (code) → Fix victim.
**NEVER FIX THE EVIDENCE.** Don't edit the log file.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Filter Noise**:
    - Use `grep` to extract error lines before reading log.
    - Don't read the whole 50MB log file.
2. **Repro Link**:
    - If you can't reproduce it, invoke the `repro` command immediately.

## VIBE CODING INTEGRATION

This interrupts the normal flow when something breaks:

```text
normal: spec → feature → test → commit
debug:  error occurs → DEBUG → find cause → fix → resume normal flow
```

## PROTOCOL

### Phase 1: Evidence Analysis (READ ONLY)

1. **Ingest Input**:
    - If filename (e.g., `error.log`): **READ IT**, don't edit
    - If text: Parse for clues
2. **Extract Targets**:

| Pattern | What to Look For |
|---------|------------------|
| File paths | `src/auth.ts:42`, `requirements.txt` |
| Error messages | `Module not found`, `TypeError` |
| Stack traces | Function names, line numbers |
| Environment | Node version, OS, missing deps |

3. **Map Crime Scene**:
    - The "victim" is the file mentioned IN the log
    - NOT the log file itself

### Phase 2: Reproduction

*If you can't reproduce it, you can't fix it.*

1. **Create Repro Script**:

```typescript
// repro_bug.ts
import { brokenFunction } from './src/auth';

// Input that caused the crash
const result = brokenFunction(maliciousInput);
console.log(result);
```

2. **Verify Failure**: Run script. It MUST fail.
3. **If Can't Reproduce**: Ask for more context or run `repro` command to build clean env.

### Phase 3: Root Cause Analysis

| Symptom | Possible Cause | Investigation |
|---------|----------------|---------------|
| `Module not found` | Missing dep, wrong path | Check manifest, imports |
| `TypeError: X is undefined` | Null pointer, missing prop | Trace data flow |
| `ECONNREFUSED` | Service down, wrong port | Check env vars, service status |
| Build fails | Type error, lint error | Read full error, not just first line |
| Test fails | Logic bug, environment | Read assertion, check test setup |

**Advanced Techniques**:

- **git bisect**: Use bisection to locate the commit that introduced the bug
- **Record Env**: Capture OS/arch, runtime versions, feature flags, RNG seeds
- **Observability**: Enable structured logs/traces for failing path (scoped)

### Phase 4: The Fix

**Fix the SOURCE CODE, not the symptom.**

| ⛔ Banned | ✅ Required |
|----------|-------------|
| Editing the log/report file | Editing source code |
| `// @ts-ignore` | Proper type handling |
| `--legacy-peer-deps` | Fixing dep conflicts |
| Catching and swallowing error | Proper error handling |
| Disabling the failing test | Fixing the code |

### Phase 5: Verification

1. **Run Repro Script**: Must now PASS
2. **Run Test Suite**: No regressions
3. **Delete Repro Script**: Cleanup

### Phase 6: Report

```markdown
# 🔍 ROOT CAUSE ANALYSIS

## Evidence
- **Source**: `error.log` (Read-Only)
- **Error**: `TypeError: Cannot read property 'id' of undefined`

## Investigation
- **Stack Trace**: Points to `src/auth/service.ts:42`
- **Cause**: `user` can be null when session expires

## Fix
- **File**: `src/auth/service.ts`
- **Change**: Added null check before accessing `user.id`

## Verification
- Repro script: ✅ Now passes
- Test suite: ✅ All green
- Regression test: ✅ Added `should_handle_expired_session`
```

## OUTPUT FORMAT

**1. The RCA**

```markdown
> **Evidence**: `security-audit.md` (Read-Only)
> **Victim**: `src/auth/service.ts`
> **Problem**: Missing null check
> **Fix**: Added guard clause
```

**2. The Fix**

```typescript
// src/auth/service.ts

// BEFORE (bug)
const userId = user.id;

// AFTER (fixed)
if (!user) {
  throw new SessionExpiredError();
}
const userId = user.id;
```

**3. The Proof**

```markdown
> Repro: ✅ Now passes
> Tests: ✅ All green (added regression test)
```

## EXECUTION RULES

1. **IMMUTABLE EVIDENCE**: Edit the input file = session terminated
2. **NO MASKING**: Linter screams → Fix the code, not disable linter
3. **PIPE AWARE**: `cat error.log | debug` means "read log to find broken code"
4. **ADD REGRESSION TEST**: Every bug fix gets a test
5. **TRACE TO ROOT**: Don't fix symptoms, fix causes
6. **CAPTURE CONTEXT**: Record env/version/seed for flaky or non-deterministic failures

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| Editing evidence files | Reading evidence files |
| Suppressing errors | Handling errors properly |
| Guessing without reproduction | Creating repro script |
| Fixing and moving on | Adding regression test |
