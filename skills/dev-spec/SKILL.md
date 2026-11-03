---
name: dev-spec
description: "Define a development change with discriminating RED tests that fail for the intended behavioral reason before implementation."
---

## Objective

Turn a requirement into executable checks that fail on the current tree and pass only when the requested behavior is correct. This defines the contract and writes RED tests or interfaces before production implementation; it does not certify existing code or replace `verify-test`, `verify-prove`, or `verify-readiness`.

For architecture-first work, run it in a fresh session after `arch-roadmap`, preferably with a model family different from the architect and core implementer, carrying the accepted roadmap and public contracts but not the previous model's hidden reasoning or conversation. Model diversity supports independence; it is not an oracle.

## Input

- The exact user outcome and acceptance criteria.
- Current behavior through the real entry point.
- Interfaces, inputs, outputs, errors, and invariants.
- Risk surfaces such as auth, money, persistence, concurrency, parsing, and idempotency.

Resolve a material open product or architecture choice through `ops-ask` before fixing it into tests.

## Gate

Accept the spec only when:

- each new test fails on the current tree for the intended behavioral reason, not just a missing symbol or dependency;
- success behavior is covered, plus failure, boundary, and invariant behavior wherever the requirement or an observed failure names it;
- expectations come from the requirement, a standard, a human-locked example, or an independent property, never copied implementation output, and no case adds a requirement the request does not state;
- a constant-returning stub, weakened assertion, skipped path, or transcript-only result cannot satisfy it;
- tests use the real implementation and data path; a substitute must pass the necessity gate in `06-test-policy`, stays diagnostic, and never proves the replaced boundary, and unavailable real prerequisites make that proof `BLOCKED`;
- the planned implementation can stay proportionate to the requested maturity.

## Procedure

1. Derive expected outcomes from the user requirement, accepted roadmap or contract, standards, and human-locked examples before treating implementation details as an oracle.
2. Read the current entry point, tests, types, public docs, and callers to preserve compatibility and place the checks.
3. Write the behavior table:

   ```text
   Case | Input/state | Observable outcome | Error/effect | Invariant
   ```

4. Choose independent oracles: standards-derived vectors, state invariants, metamorphic relations, or externally observable outcomes. Shapes: examples for named behavior, properties for broad input domains and invariants, metamorphic tests when no simple expected output exists, contract tests at public boundaries, real integration tests when behavior depends on persistence, auth, networking, or another component.
5. Write the smallest test set that distinguishes the next slice. For an initial architecture-first path, cover only the runnable core slice so `dev-core` can finish with normal gates green; never generate a broad future suite to raise coverage.
6. Run the focused test on the current tree and capture the exact intended failure.
7. When risk warrants it, confirm a trivial constant or no-op implementation would still fail.
8. Stop before production implementation: hand an initial architecture-first slice to `dev-core`, an established path to `dev-feature`, or a regression to `dev-fix`.

Verdict: `PASS` when the focused RED run failed for the intended reason and the gate holds; `FAIL` when a test passed prematurely, failed for setup or import reasons, used a circular oracle, or can be cheated trivially; `BLOCKED` when the real dependency or environment needed to define the behavior is unavailable.

## Output

```markdown
## Contract
- Outcome:
- Preserved behavior:
- Cases and invariants:
- Independence: session, model family when known, and oracle sources

## RED Evidence
- Command:
- Intended failure:
- Anti-cheat result:

## Proof Boundary
- Real components exercised:
- Blocked or substitute-backed boundaries:

## Verdict
PASS | FAIL | BLOCKED
```
