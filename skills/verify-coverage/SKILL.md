---
name: verify-coverage
description: "Judge whether tests discriminate real faults — not whether lines were touched."
---

## OBJECTIVE

Measure whether the suite would catch lies, stubs, and real faults — not whether code was merely executed.

Use this when someone asks “are the tests good enough?”, after `dev-spec` / `verify-test`, or before `verify-prove` / `verify-readiness` when acceptance depends on the suite.

Branch or line coverage is an input signal only. A green suite with high coverage can still be circular (AI wrote code and tests), weak-oracled, or blind to production-kill paths.

## CORE RULE

Coverage without discrimination is vanity.

PASS requires:

- Critical domain / trust-boundary paths have tests that assert observable outcomes or invariants.
- At least one evidence-bearing discrimination check shows the suite fails on a real pre-fix/known-bug implementation or under a real dependency failure.
- Untested sad paths on Critical/High surfaces are listed as gaps, not ignored.
- No new tests exist solely to touch lines, weaken assertions, or green a gate.

FAIL if discrimination was not attempted on the scoped critical surface, or if the suite stays green under an injected realistic fault.

## INPUTS

- Scope: package, module, command, adapter, MCP, or changed paths.
- Risk surface: auth, money, merge/install, persistence, concurrency, secrets, external I/O.
- Existing suite commands and coverage tooling available in the repo.
- Known bugs, prior incidents, or characterization tests if any.

Missing tooling is not a free PASS. Report `BLOCKED` for that discrimination method and use another, or fail the claim that “tests are good enough.”

## PROTOCOL

### Phase 1: Risk Surface First

Do not start from a global percentage.

1. List Critical and High surfaces in scope (auth, money, merge/clobber, install identity, persistence, secrets, concurrency, parsers at trust boundaries).
2. Map each surface to the tests that claim to protect it.
3. Mark surfaces with no protective test as `UNPROTECTED`.

`UNPROTECTED` Critical/High surfaces are FAIL for any “tests are good enough” claim.

### Phase 2: Measurement (Supporting Only)

Run the repo’s coverage tool when available (e.g. `npm test -- --coverage`, `pytest --cov`, `cargo tarpaulin` / `cargo llvm-cov`).

Filter noise: generated code, migrations, pure config, type-only files, test helpers.

Record branch misses on Critical/High surfaces only. Ignore boilerplate getters and log lines unless they gate security or data integrity.

### Phase 3: Discrimination (Required)

Pick at least one method that fits the stack. Prefer computational sensors.

| Method | Evidence role | Prefer when |
|--------|---------------|-------------|
| Real pre-fix / historical buggy tree | PASS evidence: suite catches behavior that actually existed | Regression after a fix or incident |
| Real disposable dependency failure | PASS evidence: real boundary handles down/denied/timeout state | Service integration paths |
| Property / invariant check on real implementation | PASS evidence: real code preserves invariant across generated inputs | Parsers, merges, balances, idempotency |
| Mutation / planted fault / stubbed-success | Diagnostic only: may expose a weak oracle, never supply PASS evidence | Challenging recent tests |
| Assertion-weakening probe | Diagnostic only: may expose assertion fragility | Recent AI-authored tests |

Rules:

1. Prefer a real pre-fix tree, documented historical bug, or actual failure of a disposable real dependency.
2. The suite must fail for the real faulty behavior. If it stays green, record `SURVIVING_FAULT` — FAIL.
3. Do not claim discrimination from coverage percentages alone.
4. A planted fault or other substitute requires `SUBSTITUTE_JUSTIFICATION`. If the suite stays green, the diagnostic can reject the quality claim; if the suite kills it, that result still cannot contribute PASS evidence.
5. If no real-fault discrimination method is available, verdict is `BLOCKED` for the "tests are good enough" claim. Do not promote substitute diagnostics into evidence.

### Phase 4: Oracle Quality Audit

For tests that “cover” Critical/High paths, check:

- Asserts observable behavior or environment outcome — not only that a function was called.
- Does not use `expect(true)`, empty asserts, snapshot-of-nothing, or “does not throw” as the sole check on a trust boundary.
- Oracle is not circular: for high-risk paths, prefer human-locked spec expectations, standards-derived vectors, preexisting failing characterizations, or properties independent of the implementation under test. A fixture that replaces real data remains a substitute and cannot prove that data path.
- AI-authored tests written in the same session as the implementation are suspect until a discrimination check passes.

### Phase 5: Gap Classification

Classify each gap:

| Class | Meaning | Gate impact |
|-------|---------|-------------|
| `KILL` | Untested or undiscriminated path that can break production or trust | FAIL |
| `SAD` | A failure the supported path can hit (auth, I/O, input) is unhandled or untested | FAIL for readiness-adjacent claims; must fix or defer explicitly |
| `EDGE` | Boundary/input class untested | Fix or hand to `verify-edge` |
| `NOISE` | Boilerplate | IGNORE with one-line reason; report unreachable or dead code for deletion instead |

## OUTPUT FORMAT

```markdown
# COVERAGE / DISCRIMINATION REPORT

## Scope
- <paths or subsystem>

## Critical surfaces
- <surface>: protected|unprotected — <tests or gap>

## Measurement (supporting)
- Branch coverage (scoped): <n>% or not run
- Critical branch misses: <list or none>

## Discrimination
- Evidence method: real-pre-fix|historical-bug|real-dependency-failure|property
- Real faulty behavior exercised: <one sentence>
- Suite result: failed-as-required|SURVIVING_FAULT|not run
- Evidence: <command + key output ref>
- Substitute diagnostics: none | <method + justification + result, excluded from PASS>

## Oracle audit
- Suspect tests: <list or none>
- Independent oracle used: yes|no — <what>

## Gaps
- KILL: ...
- SAD: ...
- EDGE: ...
- NOISE: ...

## Verdict
PASS|FAIL|BLOCKED
```

## HARD RULES

1. Never treat line or branch percentage as a PASS criterion by itself.
2. Never write or keep tests whose only job is to touch lines or silence a coverage gate.
3. Never claim “tests are good enough” when a Critical/High surface is `UNPROTECTED` or has a `SURVIVING_FAULT`.
4. Prefer fixing oracles and discrimination over adding more weak examples.
5. Hand remaining hostile I/O to `verify-edge`; hand shipped-bit proof to `verify-prove`.
6. If discrimination tooling or environment is missing, verdict is `BLOCKED` or `FAIL` for the quality claim — not a silent skip.
7. Substitute diagnostics are asymmetric: surviving them can expose weakness, but killing them never proves real behavior or contributes PASS evidence.
