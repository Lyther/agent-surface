## OBJECTIVE

**THE QUANTIFIED REALITY.**
You cannot improve what you cannot measure.
**Your Goal**: Extract hard numbers (Latency, Throughput, CPU/Mem) from the system.
**Boundary**: Stop at the data. Do not fix the code yet.

## PROTOCOL

### Phase 1: Budgets & SLIs/SLOs

1. **Define SLIs**: P50/P95/P99 latency, error rate, throughput, memory/CPU
2. **Set SLOs**: e.g., P95 < 300ms for `/api/orders`, error rate < 0.1%
3. **Scope**: Critical paths only (auth, checkout, search)
4. **Perf Budgets**: Per endpoint/function; include payload sizes

### Phase 2: Baseline Measurement

1. **Local/CI Determinism**:
    - Pin CPU governor; disable turbo if possible
    - Fix input datasets and RNG seeds; isolate noisy neighbors (containers)
2. **Profilers**:
    - **Node/TS**: `clinic flame`, `0x`, built-in profiler
    - **Python**: `py-spy`, `scalene`
    - **Rust/Go**: `pprof`, `perf`
3. **DB Explainability**:
    - Use `EXPLAIN (ANALYZE, BUFFERS)`; forbid seq scans on hot paths
    - Verify indexes on filter/join keys; add statement timeouts

### Phase 3: Load & Stress

1. **Load Tools**:
    - `k6`, `wrk`, `vegeta`, Locust
2. **Scenarios**:
    - Steady-state (baseline), spike (burst), soak (hours)
3. **Data Fidelity**:
    - Anonymized, realistic distributions (payload sizes, cache miss ratios)
4. **Thresholds**:
    - Gate on P95/P99 and error rate; k6 thresholds in CI

### Phase 4: Optimization Loop

1. **Identify Hotspots**: Flamegraphs, top-down call stacks
2. **Hypothesis -> Change -> Measure**: One change at a time
3. **Cache & Concurrency**:
    - Add bounded caches with eviction and TTLs
    - Apply backpressure; timeouts with jittered retries; circuit breakers
4. **Memory & GC**:
    - Track allocations; avoid large object churn; pool where sensible

### Phase 5: Database & I/O Hygiene

1. **N+1**: Replace with prefetch/batch queries
2. **Connection Pooling**: Size per CPU and DB limits; avoid thundering herds
3. **Prepared Statements**: Reuse plans for hot queries
4. **Pagination & Streaming**: Avoid loading entire datasets; stream/chunk

## OUTPUT FORMAT

**1. Perf Report**

```markdown
> Route: `POST /checkout`
> Baseline: P50 120ms, P95 480ms (CPU 65%)
> After: P50 90ms, P95 220ms (CPU 52%)
> Change: Added read-through cache for product lookup (TTL 60s, size 10k)
```

**2. Artifact**

Attach flamegraph SVG and load test script (`scripts/load/checkout.js`).

## EXECUTION RULES

1. **REPEATABILITY**: Same input -> same result envelope. If variance > 10%, fix environment
2. **NO CHEATING**: Do not remove work that users rely on just to meet budgets
3. **REGRESSION GUARD**: Add perf check to CI with threshold ratchet (P95/P99 + error rate)
4. **OBSERVABILITY**: Emit metrics/traces; tag by scenario and version; link to commits
5. **DATA SAFETY**: Use synthetic or anonymized data; never prod dumps in CI
