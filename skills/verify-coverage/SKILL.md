---
name: verify-coverage
description: "Judge whether tests discriminate real faults — not whether lines were touched."
---

## Objective

Measure whether the suite would catch lies, stubs, and real faults, not whether code merely executed. Use it when someone asks "are the tests good enough?", after `dev-spec` or `verify-test`, or before `verify-prove` or `verify-readiness` when acceptance depends on the suite. Line or branch coverage is an input signal only, never a PASS criterion by itself: a high-coverage green suite can still be circular (the same author wrote code and tests), weakly oracled, or blind to production-kill paths.

PASS requires:

- critical domain and trust-boundary paths have tests asserting observable outcomes or invariants;
- at least one evidence-bearing discrimination check shows the suite fails on a real pre-fix or known-bug implementation, or under a real dependency failure;
- untested sad paths on Critical/High surfaces are listed as gaps;
- no new test exists solely to touch lines, weaken assertions, or green a gate; fix oracles and discrimination rather than adding weak examples.

FAIL when discrimination was not attempted on the scoped critical surface, the suite stays green under a realistic injected fault, or a Critical/High surface is `UNPROTECTED` or has a `SURVIVING_FAULT`.

## Input

- Scope: package, module, command, adapter, MCP, or changed paths.
- Risk surface: auth, money, merge/install, persistence, concurrency, secrets, external I/O.
- The repo's suite commands and coverage tooling.
- Known bugs, prior incidents, or characterization tests, if any.

Missing tooling is never a free PASS: report that discrimination method `BLOCKED` and use another, or fail the "tests are good enough" claim.

## Procedure

1. Start from risk, not a global percentage. List the Critical and High surfaces in scope (auth, money, merge/clobber, install identity, persistence, secrets, concurrency, parsers at trust boundaries), map each to the tests claiming to protect it, and mark surfaces with none `UNPROTECTED`.
2. Measure as support only: run the repo's coverage tool when available (e.g. `npm test -- --coverage`, `pytest --cov`, `cargo tarpaulin` or `cargo llvm-cov`); filter generated code, migrations, pure config, type-only files, and test helpers; record branch misses on Critical/High surfaces only, ignoring boilerplate getters and log lines unless they gate security or data integrity.
3. Discriminate (required) with at least one method that fits the stack, preferring computational sensors:

   | Method | Evidence role | Prefer when |
   |---|---|---|
   | Real pre-fix or historical buggy tree | PASS evidence: the suite catches behavior that actually existed | regression after a fix or incident |
   | Real disposable dependency failure | PASS evidence: the real boundary handles down, denied, or timeout states | service integration paths |
   | Property or invariant check on the real implementation | PASS evidence: real code preserves the invariant across generated inputs | parsers, merges, balances, idempotency |
   | Mutation, planted fault, or stubbed success | diagnostic only: may expose a weak oracle | challenging recent tests |
   | Assertion-weakening probe | diagnostic only: may expose assertion fragility | recent AI-authored tests |

   The suite must fail on the real faulty behavior; if it stays green, record `SURVIVING_FAULT` (FAIL). A planted fault or other substitute needs a `SUBSTITUTE_JUSTIFICATION` (`06-test-policy`), and diagnostics are asymmetric: surviving one can reject the quality claim, but killing one never contributes PASS evidence. With no real-fault method available, the verdict for the "tests are good enough" claim is `BLOCKED`.
4. Audit oracles on tests that cover Critical/High paths: they assert observable behavior or environment outcomes, not only that a function was called; none relies on `expect(true)`, empty asserts, snapshot-of-nothing, or "does not throw" as the sole check on a trust boundary; on high-risk paths the oracle is independent of the implementation (human-locked spec expectations, standards-derived vectors, preexisting failing characterizations, or independent properties). A fixture that replaces real data is a substitute and cannot prove that data path. AI-authored tests written in the same session as the implementation stay suspect until a discrimination check passes.
5. Classify each gap:

   | Class | Meaning | Gate impact |
   |---|---|---|
   | `KILL` | untested or undiscriminated path that can break production or trust | FAIL |
   | `SAD` | a failure the supported path can hit (auth, I/O, input) is unhandled or untested | FAIL for readiness-adjacent claims; fix or defer explicitly |
   | `EDGE` | boundary or input class untested | fix or hand to `verify-edge` |
   | `NOISE` | boilerplate | ignore with a one-line reason; report unreachable or dead code for deletion instead |

Hand remaining hostile I/O to `verify-edge` and shipped-bit proof to `verify-prove`.

## Output

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
