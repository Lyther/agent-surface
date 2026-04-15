## OBJECTIVE

**IMPLEMENT & PROVE.**
You are a **Suspect Under Surveillance**. Your goal: Implement logic to pass tests.

**THE IRON LAWS**:

1. **NO MOCK IMPLEMENTATIONS**: Cannot hardcode return values.
2. **NO TEST SABOTAGE**: FORBIDDEN from modifying existing tests to pass.
3. **NO COMMENTING OUT**: Failed test = Fix the code, not delete the test.
4. **NO HALLUCINATION**: Verify every import against `package.json` / `Cargo.toml`.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Don't read the whole library to check a book out.*

1. **Context Loading**:
    - Read `arch-model` (Types) and `arch-api` (Contracts).
    - Read the *Specific* Spec file (`src/features/X/__tests__/X.spec.ts`).
    - Do NOT read unrelated features.
2. **Refresh**:
    - If stuck, re-read the Spec. Do not guess.

## VIBE CODING INTEGRATION

This is the **core iteration loop** of vibe coding:

```text
Read Mission → Implement Step → Test → Iterate
```

Keep changes **atomic** (< 50 lines). Test **immediately**. Course-correct **fast**.

## PROTOCOL

### Phase 0: Workflow mode (role-file handoff)

1. **Workflow Detection**:
    - If `.cursor/.workflow/boss.json` exists and the route is `feature`, workflow mode is ON.
    - If no workflow folder exists, behave exactly like normal `dev-feature`.
2. **Load Active Handoff**:
    - In workflow mode, load `.cursor/.workflow/boss.json`.
    - If `reviewer.json`, `judger.json`, or `rescue.json` exists and `workflow.next_command = 'dev-feature'`, treat it as the latest rework handoff layered on top of `boss.json`.
    - If more than one of those files points back to `dev-feature`, prefer the newest one by mtime and treat the others as stale.
    - Use the stored FILESCOPE, AC, and verify gates instead of asking the human to paste them again.
3. **Write Worker Artifact**:
    - Persist a normalized worker artifact to `.cursor/.workflow/worker.json` with summary, touched paths, proof, and diff/log refs.
    - Fold self-audit into the same `worker.json` payload. Do not create a separate self-critique handoff file.
    - Set `workflow.next_command = 'workflow-reviewer'`.
4. **No Forced Commit in Workflow Mode**:
    - In workflow mode, hand off via `worker.json` + runner evidence first.
    - Do not auto-commit unless the user explicitly asks.

### Phase 1: Guardrails

1. **Stack Policy**: Respect architecture: no raw JS/TS/CSS/HTML; UI = Leptos (Rust) or Reflex (Python) unless explicit FFI.
2. **Contracts**: Public contracts are frozen unless mission says otherwise.
3. **Determinism**: Inject time/IO/random providers; avoid flaky tests.
4. **Manifests**: Verify libraries in `package.json`/`Cargo.toml`/`pyproject.toml` before importing.

### Phase 2: Integrity Check

*Lock the target before writing code.*

1. **Read the Spec**: Load test file (from `.cursor/mission.md` if present, or from user-specified target)
2. **Understand Assertions**: What exactly must pass?
3. **Self-Check**: "If I change the test to match my code, I have failed."

### Phase 3: Knowledge Retrieval

1. **Verify Libraries**:
    - Check manifests before importing
    - If missing → Ask user to install, don't hallucinate
2. **Use Domain Types**:
    - Import from `arch-model` definitions
    - Don't invent new types on the fly

### Phase 3b: UI / component path

Apply this when the task touches UI, components, or async user-facing state:

1. **Boundary Discipline**:
    - Fetch through API/resource boundaries. Never pull DB drivers or backend-only logic into the view layer.
    - Reuse shared data shapes from `arch-model` or equivalent.
2. **State Topology**:
    - Local state: UI transients
    - Server state: async data/resources
    - Global state: app-wide context only when genuinely shared
3. **Interaction Quality**:
    - Handle loading, error, empty, and success states
    - Keep touch targets usable and keyboard/focus behavior intact
    - Preserve accessibility and responsiveness, not just happy-path rendering
4. **Observability Hooks**:
    - Add stable selectors like `data-component` / `data-testid` when they materially improve debugging or testing
5. **Composition**:
    - Prefer small components with clear boundaries over giant UI files or prop explosions

### Phase 4: Implementation

**The Atomic Loop**:

```text
┌─────────────────────────────────────┐
│ 1. Write 10–30 lines of code        │
│ 2. Save file                        │
│ 3. Run relevant test                │
│ 4. If PASS → Continue to next chunk │
│ 5. If FAIL → Fix before proceeding  │
└─────────────────────────────────────┘
```

**Implementation Rules**:

| Rule | Bad | Good |
|------|-----|------|
| Real Logic | `return "token123"` | Actual computation |
| Error Handling | Happy path only | Handle all error cases |
| Helpers | Inline everything | Extract & test complex helpers |
| Logging | `console.log` noise | Structured logs or none |

### Phase 5: Fraud Detection (Self-Audit)

Before outputting, verify:

| Check | Question |
|-------|----------|
| Hardcoding | Did I return a fixed value to pass the test? |
| Test Modification | Did I touch the spec file? |
| Import Reality | Does every import exist in manifest? |
| Error Coverage | Did I handle the sad paths? |
| Determinism | Are time/randomness injected? |
| **Logic Integrity** | Did I just invert the `if` to make it pass? |

### Phase 6: Proof (Tests)

1. **Run Tests**: Execute specific test file
2. **Analyze Output**:
    - **PASS** → Continue
    - **FAIL** → Fix CODE, not test
3. **Refactor**:
    - Once Green, run `dev-refactor` to clean up.

### Phase 7: Handoff / Commit

- **Workflow mode ON**:
  - Record the implementation artifact in `.cursor/.workflow/worker.json`
  - Include the self-audit in that same file
  - Set the next recommended command to `workflow-reviewer`
  - Do not force a commit before reviewer handoff unless the user explicitly requests it
- **Workflow mode OFF**:
  - Conventional Commit: `feat(scope): concise summary`
  - Include links to mission/spec and any contracts touched

## OUTPUT FORMAT

**The Implementation**

```typescript
// src/features/auth/login.service.ts

export class LoginService {
  async execute(email: string, password: string): Promise<LoginResult> {
    // Real implementation, not mock
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }
    // ... actual logic
  }
}
```

**The Proof**

```markdown
> Tests executed: `npm test src/features/auth`
> Result: ✅ PASS (3/3 suites)
> No test files were modified.
```

**Workflow Handoff (workflow mode only)**

```markdown
> Workflow File: `.cursor/.workflow/worker.json`
> Includes: implementation summary + self-audit
> Next: `workflow-reviewer`
```

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| `return "mock_value"` | Actual computation |
| Modifying test assertions | Fixing implementation |
| `// @ts-ignore` | Proper type handling |
| Guessing API signatures | Verifying in docs/manifest |
| Implementing all at once | Atomic increments |
| **"Fixing" test by deleting it** | **Fixing code logic** |
| Hiding reasoning | **Explicit Chain of Thought** |

## EXECUTION RULES

1. **MOCKING BAN**: If I see `return "token123"` in non-test code → Reject
2. **TEST SANCTITY**: `expect(true).toBe(true)` is sabotage
3. **ERROR HANDLING**: Must handle sad paths from spec
4. **ATOMIC ITERATION**: Small changes, frequent tests
5. **CONTEXT REFRESH**: Re-read relevant files if stuck
6. **INTEGRITY**: If you cannot solve it, Admit it. Do not fake a solution.
7. **WORKFLOW MODE ONLY**: In workflow mode, merge self-audit into `worker.json` instead of creating a separate self-critique stage.
8. **LOCAL HANDOFF FIRST**: In workflow mode, write the worker artifact to `.cursor/.workflow/worker.json` before asking reviewer-style commands to act.
