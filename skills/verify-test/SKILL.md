---
name: verify-test
description: "Run the suite and detect whether it was weakened, faked, or bypassed to go green."
---

## Objective

Run the relevant tests, interpret the evidence honestly, and expose how a green result can lie: weakened assertions, skipped failing tests, mocked-away real paths, or assertions on buggy output. Green is a claim, not a verdict. No substitute-backed proof of a replaced boundary: labels do not matter, and each necessary substitute needs a justification (`06-test-policy`).

PASS requires all of:

- the evidence-bearing scope ran the real implementation with real or disposable real dependencies and isolated state, and passed;
- the suite was not weakened for this change: no newly skipped, `xfail`, `only`, or deleted tests, loosened assertions, diluted thresholds, or disabled gates;
- for fix or regression work, a test that fails on the pre-fix tree and passes after;
- nondeterministic paths ran enough times to show stability, with seeds captured;
- every substitute for a called boundary is inventoried with a `SUBSTITUTE_JUSTIFICATION`, and its results are excluded from PASS evidence for the boundary it replaces.

FAIL when green came from removing a gate, diluting an assertion, substituting a required path, an unjustified substitute, calling a substitute-backed suite E2E, integration, or real, or a "regression" test that also passes on the unpatched code.

## Input

- Scope: changed paths, module, command, adapter, or the whole suite.
- The repo's test and coverage commands and container or service tooling.
- Baseline: the pre-change tree or protected branch, for skip, assertion, and regression diffs.
- Risk surface: auth, money, persistence, concurrency, secrets, external I/O.
- Substitute inventory: mocks, fakes, stubs, spies, emulators, in-memory implementations, monkeypatches, recorded responses, sandboxes, and test modes, under any name; a fixture or other input the real component reads is not one.

Missing integration tooling, credentials, services, or environments make that layer `BLOCKED`, never a silent pass on a substitute or a downgraded claim.

## Procedure

1. Clean room:
   - Set the test environment explicitly (`NODE_ENV=test`, `APP_ENV=test`, or equivalent).
   - Reset and seed state (database, queue, blob) before the suite. Unit tests use no network; integration tests use isolated ephemeral or transactional state, never a shared `localhost` or host database.
   - Run integration layers against real or disposable real dependencies (Testcontainers, a disposable service); a substituted required component makes that layer non-integration and ineligible as evidence.
   - Record identity when the suite builds or installs an artifact; hand shipped-artifact and clean-room journey proof to `verify-prove`.
2. Layered run: the smallest relevant scope (unit) first, then integration against real dependencies. For integration paths, assert outcomes in the world by querying the backing service for the row, file, or event; a 200, response body, or "success" log is not proof. Cover each supported mode, engine, or version the change claims with at least one scenario, and list unexercised modes as gaps.
3. Anti-deception audit (required), diffing the suite against the baseline:
   - Skips: new `skip`, `xfail`, `.only`, `it.skip`, `t.Skip`, or deleted or renamed tests since baseline. One that hides the change's behavior is a REJECT-level finding; a skip without a tracked reason is unacceptable.
   - Assertions: none loosened; no `assert True`, `expect(true).toBe(true)`, or "does not throw" as the sole check on a trust boundary; no mock-was-called as the only assertion on a critical path.
   - Oracles: expected values trace to the spec, not pasted from current, possibly buggy output; snapshots are reviewed, not regenerated blindly in the change that altered behavior.
   - Substitutes: search code, config, helpers, and service setup for every non-real replacement regardless of label, including test modes and local servers that imitate a dependency. Each needs a complete `SUBSTITUTE_JUSTIFICATION`; "fast", "easy", "hermetic", "offline", "CI", "flaky service", or "missing credentials" is not necessity, and a missing record invalidates the affected test. A substitute-backed result counts only for the real code it exercised, never for the replaced code, service, data path, or external effect; a constructed input the real component reads is an input, not a substitute.
   - Gates: no disabled lint, type, or coverage gate, no `continue-on-error` slipped into CI, no weakened threshold.
   - Regression bite, for a fix: revert the fix, confirm the regression test FAILS, restore the fix, confirm it PASSES. A regression test green on the unpatched code is a false negative: REJECT.
4. Flake and determinism: retry a failure up to 3 times; passing on retry is FLAKY (report it; a 1%-flaky test is broken, not passing), still failing is BROKEN. Never average away a nondeterministic failure. Print and pin RNG seeds and time-sensitive inputs, rerun with the same seed when supported, and reject assertions on `now()` or `random()` without a seeded or injected clock.
5. Gaps and handoff: when the claim rests on "tests prove it", require `verify-coverage` discrimination evidence (a surviving fault is FAIL), not a coverage percentage. List untested failure paths that the requirements or an observed failure name, ranked by blast radius. Hand hostile-input harnesses to `verify-edge`, shipped-journey proof to `verify-prove`, and broad readiness certification to `verify-readiness`.

## Output

```markdown
# TEST RESULTS

## Run
- Unit: PASS
- Integration (real deps): PASS — end-state verified (order row present)
- Modes not exercised: exporter v2

## Anti-deception audit
- Skips/xfail/deleted since baseline: none | <list>
- Loosened assertions / disabled gates: none | <list>
- Regression test fails on pre-fix tree: yes | no (no = REJECT)
- Substitutes found: none | <symbol/path + label>
- Necessity record: n/a | valid | invalid (invalid = FAIL)
- Substitute-backed results excluded from evidence: yes | no (no = FAIL)
- Required real layers missing: none | BLOCKED <layer + unblock path>

## Flake
- retries: 0 | FLAKY <test> | BROKEN <test>
- seeds: <captured>

## Gaps
- <uncovered sad path> — severity

## Verdict
PASS | FAIL | BLOCKED
```
