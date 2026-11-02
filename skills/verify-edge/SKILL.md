---
name: verify-edge
description: "Budgeted hostile I/O and edge harnesses that must catch real faults."
---

## OBJECTIVE

Expose trust-boundary I/O and prove the system fails closed under hostile or extreme inputs.

Standard suites assume cooperation. This skill assumes parsers, APIs, configs, and uploads are under attack or entropy.

## CORE RULE

A fuzz/edge pass that finds nothing and never fails a planted fault is inadequate detection — not proof of safety.

PASS requires:

- Targets limited to the highest-blast-radius surfaces (default ≤3).
- At least one harness with seed, budget, and shrink-on-fail.
- At least one discrimination check: a known-bad input or injected fault is rejected/handled without corruption.
- Findings classified by severity; Critical/High must be fixed or force claim narrowing.

## PROTOCOL

### Phase 1: Surface Selection (Budget)

Identify and rank surfaces by blast radius:

1. Parsers and deserializers at trust boundaries.
2. Auth/token/path/config merge inputs.
3. Public write APIs and file/path operations.
4. Multi-tenant or multi-agent shared state.

Pick the top ≤3 unless the user expands scope. Do not “fuzz everything.”

### Phase 2: Harness

Prefer repo-native property/fuzz tools (`fast-check`, `hypothesis`, `cargo fuzz`, `go test -fuzz`).

Each harness must record:

- Entry point and invariant (“never panic / never corrupt store / always DomainError”).
- Seed and time/iteration budget (default ≤5 minutes unless user sets otherwise).
- Shrink/minimize on failure — report the smallest failing input, not megabytes of noise.

### Phase 3: Fault Classes (Relevant Only)

Run only classes that apply to the surface:

| Class | Examples |
|-------|----------|
| Structural | empty, huge, truncated, wrong types |
| Boundary | MAX_INT±1, NaN, unicode/RTL, long strings |
| Injection | path escape, SQLi/command where inputs reach sinks |
| Merge/clobber | sibling-key preservation, hostile JSONC/YAML shapes |
| Resource | bounded large payload within local sandbox |

Do not paste an OWASP laundry list as evidence. Each executed class needs a command and result.

### Phase 4: Environment Chaos (Optional, Scoped)

When network/disk/memory claims exist, inject bounded faults in local/staging only:

- Latency / timeout of dependencies.
- Permission denied / missing file.
- Full disk only in disposable environments.

Chaos-test only the resolved target named by the task or live environment selection. Bound blast radius, define abort conditions, and verify rollback before injecting a production fault.

### Phase 5: Discrimination

Before PASS:

1. Plant or reuse one known-bad input that the contract says must be rejected.
2. Confirm the harness or suite fails open success (detects the bad case).
3. If the bad case is accepted or corrupts state → FAIL.

## OUTPUT FORMAT

```markdown
# EDGE / HOSTILE I/O REPORT

## Targets
- <surface>: why high blast radius

## Harnesses
- <name>: tool, seed, budget, invariant

## Results
- <case>: pass|fail — minimized input — severity

## Discrimination
- known-bad input: <desc> → rejected|ACCEPTED (ACCEPT = FAIL)

## Verdict
PASS|FAIL|BLOCKED
```

## HARD RULES

1. Budget first — max 3 surfaces by default.
2. Capture seeds; shrink failures.
3. Contain blast radius (local/staging/containers).
4. No pass from “ran fuzz for N minutes” without invariants and discrimination.
5. Hand suite-wide oracle quality to `verify-coverage`; hand shipped journeys to `verify-prove`.
