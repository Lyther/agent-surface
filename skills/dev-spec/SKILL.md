---
name: dev-spec
description: "Define a development change with discriminating RED tests that fail for the intended behavioral reason before implementation."
---

## OBJECTIVE

Turn a requirement into executable checks that fail on the current tree and pass only when the requested behavior is correct.

This is a development workflow: it defines the contract and writes RED tests or interfaces before production implementation. It does not certify an existing implementation and does not replace `verify-test`, `verify-prove`, or `verify-readiness`.

For architecture-first work, run `dev-spec` in a fresh session after `arch-roadmap`, preferably with a model family different from the architecture and core implementer. Carry the accepted roadmap and public contracts, not the previous model's hidden reasoning or conversation. Model diversity is supporting independence, not an oracle.

## INPUTS

- Exact user outcome and acceptance criteria.
- Current behavior through the real entry point.
- Interfaces, inputs, outputs, errors, and invariants.
- Risk surfaces such as auth, money, persistence, concurrency, parsing, and idempotency.

If a material product or architecture choice remains unresolved, use `ops-ask` before fixing it into tests.

## DISCRIMINATION GATE

A development spec is accepted only when:

- each new test fails on the current tree for the intended behavioral reason, not only because a symbol or dependency is missing;
- success behavior is represented, and failure, boundary, and invariant behavior wherever the requirement or an observed failure names it;
- expectations come from the requirement, a standard, a human-locked example, or an independent property rather than copied implementation output, and no case adds a requirement the request does not state;
- a constant-returning stub, weakened assertion, skipped path, or transcript-only result cannot satisfy it;
- the test uses the real implementation and data path unless a substitute passes the repository's necessity gate;
- the planned implementation can remain proportionate to the requested maturity.

## PROTOCOL

1. **Ground expected behavior.** Derive outcomes from the user requirement, accepted roadmap or contract, standards, and human-locked examples before using implementation details as an oracle.
2. **Locate the contract.** Read the current entry point, tests, types, public docs, and callers to preserve compatibility and place the checks.
3. **Write the behavior table.**

```text
Case | Input/state | Observable outcome | Error/effect | Invariant
```

4. **Choose independent oracles.** Prefer standards-derived vectors, state invariants, metamorphic relations, or externally observable outcomes.
5. **Write the smallest test set that distinguishes the next slice.** For an initial architecture-first path, cover only the runnable core slice so `dev-core` can finish with normal gates green. Do not generate a broad future suite merely to increase coverage.
6. **Run the focused test on the current tree.** Capture the exact intended failure.
7. **Run an anti-cheat probe when risk warrants it.** Confirm a trivial constant or no-op implementation would still fail.
8. **Stop before production implementation.** Hand an initial architecture-first slice to `dev-core`, an established path to `dev-feature`, or a regression to `dev-fix`.

## TEST SHAPES

- Example tests for named product behavior.
- Property tests for broad input domains and invariants.
- Metamorphic tests when no simple expected output exists.
- Contract tests at public boundaries.
- Real integration tests when the behavior depends on persistence, auth, networking, or another component.

Test substitutes are default-denied. A justified substitute remains diagnostic and cannot prove the replaced boundary; unavailable real prerequisites make that proof `BLOCKED`.

## VERDICT

- `PASS`: the focused RED run failed for the intended reason and the discrimination gate is satisfied.
- `FAIL`: the test passed prematurely, failed for setup/import reasons, used a circular oracle, or can be cheated trivially.
- `BLOCKED`: the real dependency or environment needed to define the behavior is unavailable.

## OUTPUT

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
