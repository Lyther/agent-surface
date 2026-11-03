---
name: qa-measure
description: "Collect hard performance and resource measurements."
---

## Objective

Extract hard numbers (latency, throughput, CPU, memory) from the system. Stop at the data: do not fix the code.

## Rules

1. Same input gives the same result envelope; if variance exceeds 10%, fix the environment.
2. Never remove work users rely on just to meet a budget.
3. Use synthetic or anonymized data with realistic distributions (payload sizes, cache-miss ratios); never production dumps in CI.
4. Emit metrics and traces tagged by scenario and version, and link them to commits.

## 1. Budgets and SLOs

Define SLIs (P50/P95/P99 latency, error rate, throughput, memory/CPU) and SLOs (e.g. P95 < 300ms for `/api/orders`, error rate < 0.1%) for critical paths only (auth, checkout, search), with per-endpoint or per-function perf budgets that include payload sizes.

## 2. Baseline

- Make local and CI runs deterministic: pin the CPU governor, disable turbo if possible, fix input datasets and RNG seeds, and isolate noisy neighbors (containers).
- Profile with `clinic flame`, `0x`, or the built-in profiler (Node/TS); `py-spy` or `scalene` (Python); `pprof` or `perf` (Rust/Go).
- Run `EXPLAIN (ANALYZE, BUFFERS)` on hot queries; flag seq scans on hot paths, missing indexes on filter/join keys, and missing statement timeouts.

## 3. Load and Stress

Run steady-state (baseline), spike (burst), and soak (hours) scenarios with `k6`, `wrk`, `vegeta`, or Locust, gating on P95/P99 and error rate with k6 thresholds. Recommend a CI perf check that ratchets those thresholds; adding it is a separate change.

## 4. Hotspots

Profile the measured path (flamegraph, top-down call stack, allocation profile) and name the hotspots with their share of time or memory. List likely causes, such as N+1 queries, unbounded result sets, missing pooling, or allocation churn, as hypotheses for a later fix. Do not change code here.

## Output

```markdown
> Route: `POST /checkout`
> Baseline: P50 120ms, P95 480ms, error rate 0.1% (CPU 65%), 3 runs, variance 4%
> Hotspot: product lookup, 38% of request time (flamegraph: perf/checkout.svg)
> Hypothesis: N+1 queries in `loadProducts`; candidate fix: batch query
```

Attach the profile and the load script (`scripts/load/checkout.js`).
