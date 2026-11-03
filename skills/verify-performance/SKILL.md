---
name: verify-performance
description: "Prove latency, capacity, and concurrency against an explicit baseline — not a vanity P99."
---

## Objective

Detect bottlenecks, leaks, and concurrency failures that would break the readiness claim, measured against a stated baseline or SLO; numbers without a baseline are anecdotes, and there is no universal default such as `P99 < 100ms`.

PASS requires:

- an explicit performance claim or SLO for this scope, from docs, a prior run, or the user;
- measurement on a representative workload (production-like shape and, for a production-capacity claim, data volume; not a toy empty database unless that is the product);
- comparison to the baseline or threshold, with pass/fail criteria written before the run;
- no concurrency or correctness failure, whatever the latency.

Without an SLO or baseline, report measurements as `INFORMATIONAL` and the verdict `BLOCKED` for any "performance is production-ready" claim, or have the user set a threshold first. Never claim production performance from laptop-only runs without labeling the environment limits.

## Procedure

1. Write the contract as one sentence. Not `API should be fast.` but `POST /orders P95 ≤ 200ms at 50 RPS for 5m on staging dataset D; error rate < 0.1%; zero lost writes under 5 concurrent clients.` Record environment, dataset size, warm versus cold, concurrency, duration, and success criteria.
2. Optionally micro-benchmark algorithmic hotspots in scope (`vitest bench`, `pytest-benchmark`, `criterion`, `tinybench`), labeled as such: they do not prove system SLOs.
3. Load the system with scriptable tools (`k6`, `vegeta`, or repo harnesses), running the scenarios the claim needs: smoke (1 user or low RPS, sanity), load (target concurrency for the agreed duration), and stress (ramp to the breaking point, only when the claim includes capacity headroom). Measure P50/P95/P99 latency, error rate, throughput, and saturation signals (CPU, RSS, queue depth when available).
4. During or right after load, check correctness: no lost or duplicate writes where invariants forbid them, no auth bypass or cross-tenant bleed from races, and a short critical-path concurrency smoke if `verify-prove` has not run one. Latency PASS with correctness FAIL is FAIL.
5. Profile only when the contract fails or regresses against baseline: capture a profile (flamegraph, `cProfile`, etc.) and name the top hotspot. Do not optimize without a failing contract.

Hand journey proof to `verify-prove` and readiness certification to `verify-readiness`.

## Output

```markdown
# PERFORMANCE REPORT

## Contract
- claim: <SLO sentence>
- baseline: <prior number or none>
- environment: <...>

## Results
- scenario: ...
- P95 / P99: ...
- error rate: ...
- correctness under load: pass|fail

## Comparison
- vs baseline/SLO: pass|fail|informational

## Hotspot (if failed)
- <function or query>: evidence

## Verdict
PASS|FAIL|BLOCKED
```
