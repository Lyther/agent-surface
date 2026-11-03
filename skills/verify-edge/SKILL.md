---
name: verify-edge
description: "Budgeted hostile I/O and edge harnesses that must catch real faults."
---

## Objective

Prove trust-boundary I/O (parsers, APIs, configs, uploads) fails closed under hostile or extreme input. A fuzz or edge pass that finds nothing and never catches a planted fault is inadequate detection, not proof of safety; "ran fuzz for N minutes" never passes without invariants and discrimination.

PASS requires:

- targets limited to the highest-blast-radius surfaces (default at most 3);
- at least one harness with a seed, a budget, and shrink-on-fail;
- at least one discrimination check: a known-bad input or injected fault is rejected or handled without corruption;
- findings classified by severity, with Critical/High fixed or the claim narrowed.

## Procedure

1. Rank surfaces by blast radius: parsers and deserializers at trust boundaries; auth, token, path, and config-merge inputs; public write APIs and file or path operations; multi-tenant or multi-agent shared state. Take the top 3 unless the user expands scope; never fuzz everything.
2. Build harnesses with repo-native property or fuzz tools (`fast-check`, `hypothesis`, `cargo fuzz`, `go test -fuzz`). Each records its entry point and invariant ("never panic", "never corrupt store", "always DomainError"), seed, and time or iteration budget (default at most 5 minutes unless the user sets one), and shrinks failures to the smallest failing input.
3. Run only the fault classes that apply, each with a command and result (an OWASP laundry list is not evidence):

   | Class | Examples |
   |---|---|
   | Structural | empty, huge, truncated, wrong types |
   | Boundary | MAX_INT±1, NaN, unicode/RTL, long strings |
   | Injection | path escape, SQLi/command where inputs reach sinks |
   | Merge/clobber | sibling-key preservation, hostile JSONC/YAML shapes |
   | Resource | bounded large payload within a local sandbox |

4. Optional environment chaos, when network, disk, or memory claims exist: dependency latency or timeout, permission denied or missing file, and full disk only in disposable environments. Contain the blast radius (local, staging, containers) and inject only into the resolved target the task or live environment selection names; before a production fault, bound the blast radius, define abort conditions, and verify rollback.
5. Discriminate before PASS: plant or reuse one known-bad input the contract says must be rejected and confirm the harness or suite detects it instead of reporting success. An accepted bad case, or one that corrupts state, is FAIL.

Hand suite-wide oracle quality to `verify-coverage` and shipped journeys to `verify-prove`.

## Output

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
