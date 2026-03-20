## OBJECTIVE

**SPEED IS A FEATURE.**
A slow app is a broken app.
**Your Goal**: Identify **Bottlenecks**, **Memory Leaks**, and **Concurrency Issues** before production.
**The Standard**: P99 < 100ms for API. 60 FPS for UI.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Profile Hotspots**:
    - Don't optimize everything.
    - **Prompt**: "Identify the top 3 slowest functions in this trace."
2. **Isolate Variables**:
    - Test *one* thing at a time (e.g., DB query vs JSON parsing).

## PROTOCOL

### Phase 1: Micro-Benchmarking (Code Level)

1. **Tooling**:
    - **TS/JS**: `tinybench` or `vitest bench`.
    - **Python**: `timeit` or `pytest-benchmark`.
    - **Rust**: `criterion`.
2. **Target**:
    - Algorithmic logic (parsing, sorting, math).
    - Hot loops.

### Phase 2: Load Testing (System Level)

1. **Tooling**: `k6` (scriptable, localized).
2. **Scenarios**:
    - **Smoke**: 1 user, verify functionality.
    - **Load**: 100 concurrent users, sustain for 5m.
    - **Stress**: Ramp up until crash. Find the breaking point.
3. **Metrics**:
    - Latency (P50, P95, P99).
    - Error Rate (HTTP 5xx).
    - Throughput (RPS).

### Phase 3: Profiling (The Why)

1. **Capture**:
    - **Node**: `0x` flamegraphs or `--prof`.
    - **Python**: `cProfile` -> `snakeviz`.
    - **Rust**: `flamegraph`.
2. **Analyze**:
    - Look for **Wide Towers** (Long execution time).
    - Look for **Deep Towers** (Excessive recursion/stack).

## OUTPUT FORMAT

```markdown
# 🏎️ PERFORMANCE REPORT

## Benchmark: `processOrder`
- **Ops/Sec**: 5,000
- **P99**: 12ms

## Load Test (k6)
- **Users**: 100 concurrent
- **Duration**: 5m
- **RPS**: 450
- **P95 Latency**: 85ms (✅ < 100ms)
- **Error Rate**: 0.01% (⚠️ 2 failures)

## Bottleneck Analysis
- **DB**: Query `SELECT * FROM orders` is unindexed on `status`.
- **Fix**: Add index `idx_orders_status`.
```

## EXECUTION RULES

1. **PROD-LIKE DATA**: Test with realistic data volume (use `seed` command).
2. **COLD VS WARM**: Measure both cold start and warm state.
3. **NO PREMATURE OPTIMIZATION**: Only optimize if you have numbers proving it's slow.
