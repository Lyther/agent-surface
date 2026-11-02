---
name: verify-test
description: "Run the suite and detect whether it was weakened, faked, or bypassed to go green."
---

## OBJECTIVE

Run the relevant tests, interpret the evidence honestly, and detect the ways a green result can be a lie.

A passing suite is not proof by itself. AI-written changes routinely go green by weakening assertions, skipping the failing test, mocking away the real path, or asserting the buggy output. This command makes those moves visible instead of celebrating the checkmark.

## CORE RULE

Green is a claim, not a verdict.

PASS requires all of:

- The evidence-bearing scope ran the real implementation with real or disposable real dependencies, isolated state, and passed.
- The suite was not weakened to pass this change: no newly skipped/`xfail`/`only`/deleted tests, no loosened assertions, no disabled gate.
- For fix/regression work, a test exists that **fails on the pre-fix tree** and passes after — proof it catches the bug.
- Nondeterministic paths ran enough times to show stability, with seeds captured.
- Every substitute for a called boundary is inventoried and has a `SUBSTITUTE_JUSTIFICATION`; its results are excluded from PASS evidence for the boundary it replaces.

FAIL if green was achieved by removing a gate, diluting an assertion, substituting any required path, using an unjustified substitute, calling a substitute-backed suite E2E/integration/real, or a "regression" test that also passes on the unpatched code.

## INPUTS

- Scope: changed paths, module, command, adapter, or the whole suite.
- Test/coverage commands and container/service tooling the repo provides.
- Baseline: the pre-change tree (or protected branch) for skip/assert/regression diffing.
- Risk surface: auth, money, persistence, concurrency, secrets, external I/O.
- Substitute inventory: mocks, fakes, fixtures, stubs, spies, emulators, in-memory implementations, monkeypatches, recorded/synthetic responses, sandboxes, test modes, and renamed equivalents.

Missing integration tooling, credentials, services, or environments are `BLOCKED` for that layer — never a silent pass on a substitute.

## PROTOCOL

### Phase 1: Clean Room

1. Set the test environment explicitly (`NODE_ENV=test`, `APP_ENV=test`, or equivalent).
2. Reset and seed state (DB / queue / blob) before the suite; no shared `localhost` databases.
3. Integration layers use real or disposable real dependencies (Testcontainers, disposable service). Any substituted required component makes that layer non-integration and ineligible for evidence.
4. Record identity when the suite builds/installs an artifact; hand shipped-artifact and clean-room journey proof to `verify-prove`.

### Phase 2: Layered Run (fail fast, then widen)

1. Run the smallest relevant scope first (unit), then integration against real dependencies.
2. Assert outcomes in the world, not the transcript: for integration paths, confirm the row/file/event exists by querying the backing service — a 200 or a "success" log is not proof.
3. Cover each supported mode/engine/version claimed by the change with at least one scenario; list modes not exercised as gaps.

### Phase 3: Anti-Deception Audit (required)

Diff the suite against the baseline and inspect how green was achieved:

- **Skip/exclusion sweep**: new `skip` / `xfail` / `.only` / `it.skip` / `t.Skip` / deleted or renamed tests since baseline. Any that hide the change's behavior is a REJECT-level finding; a skip without a tracked reason is unacceptable.
- **Assertion strength**: no assertion loosened, no `assert True` / `expect(true).toBe(true)` / "does not throw" as the sole check on a trust boundary, no mock-was-called as the only assertion on a critical path.
- **Oracle honesty**: expected values trace to the spec, not pasted from current (possibly buggy) output; snapshots reviewed, not blindly regenerated in the same change that altered behavior.
- **Substitute sweep**: search code, config, helpers, and service setup for every non-real replacement regardless of label. Include test modes and local servers that imitate a dependency.
- **Necessity records**: each substitute has a complete `SUBSTITUTE_JUSTIFICATION`. "Fast", "easy", "hermetic", "offline", "CI", "flaky service", or "missing credentials" is not necessity. Missing records invalidate the affected test.
- **Reality classification**: a substitute-backed result counts only for the real code it exercised; it never proves the replaced code, service, data path, or external effect. A constructed input that the real component reads is an input, not a substitute.
- **Gate integrity**: no disabled lint/type/coverage gate, no `continue-on-error` slipped into CI, no weakened threshold.

If the change is a fix, prove the regression test bites: run the test against the pre-fix tree (revert the fix), confirm it FAILS, restore the fix, confirm it PASSES. A regression test that is green on the unpatched code is a false negative — REJECT.

### Phase 4: Flake & Determinism

1. On failure, retry up to 3×: passes on retry → **FLAKY**, report it (a 1%-flaky test is broken, not passing); still fails → **BROKEN**, stop pretending.
2. Print and pin RNG seeds and time-sensitive inputs; re-run with the same seed when supported. Reject assertions on `now()` / `random()` without a seeded or injected clock.

### Phase 5: Discrimination & Gap Handoff

1. When the claim rests on "tests prove it," require `verify-coverage` discrimination evidence (surviving fault = FAIL), not a coverage percentage.
2. List untested failure paths that the requirements or an observed failure name, ranked by blast radius.
3. Hand hostile-input harnesses to `verify-edge`, shipped-journey proof to `verify-prove`, broad readiness certification to `verify-readiness`.

## OUTPUT FORMAT

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

## HARD RULES

1. **Fix work needs a test that fails on the unpatched tree.** No pre-fix failure, no regression proof.
2. **Never modify tests to go green.** Weakened assertions, new skips, deleted gates, or diluted thresholds are FAIL, not housekeeping.
3. **Outcome over transcript** for integration paths: query the backing service; a response body or log line is not proof.
4. **No substitute-backed proof of a replaced boundary.** Labels do not matter; each necessary substitute needs a justification.
5. **No network in unit; isolated DB/state for integration** — ephemeral or transactional, not a shared host database.
6. **Flaky is broken.** Report FLAKY/BROKEN honestly; do not average away a nondeterministic failure.
7. Missing real prerequisites → `BLOCKED` for that layer, never a silent substitute or downgraded claim.
8. Hand discrimination to `verify-coverage`, hostile I/O to `verify-edge`, shipped journeys to `verify-prove`.
