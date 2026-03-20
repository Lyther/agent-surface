## OBJECTIVE

**BENCHMARKING + METRICS EVALUATION.**
Run a repeatable evaluation of an agent/model across chosen benchmark suites, collect metrics, and emit a scorecard.

## PROTOCOL

1. Select benchmark suites (security + general agent).
2. Freeze config: model, temperature, tools enabled, max steps, budget, seeds, versions.
3. Run on **remote test server** (never localhost). Use `ops-server`.
4. Capture raw traces: prompts, tool calls, outputs, timing, tokens/cost.
5. Compute metrics + confidence intervals; report failures with repro commands.

## BENCHMARK MENU (pick what matches your threat model)

### 1. Code Audit / Vulnerability Detection

| Benchmark | Scale | Features | SOTA | Open |
|-----------|-------|----------|------|------|
| **SecVulEval** (arXiv 2505.19828, 2025.05) | 25,440 functions, 5,867 CVE (C/C++) | Fine-grained statement-level annotation, context dependency support | Claude 3.7 Sonnet: **23.83% F1** (vulnerable statement + reasoning) | ✓ |
| **PrimeVul** (ICSE 2025) | ~7k vulnerable + 229k benign (C/C++) | Human-annotation precision, 140+ CWE, dedup + temporal split | GPT-4 pair-wise near random guess | ✓ [GitHub](https://github.com/DLVulDet/PrimeVul) |
| **DiverseVul** (RAID 2023) | 18,945 vulnerable + 330k non-vulnerable | 150 CWE, 295 projects, widest coverage | 11 models tested, F1 generally <50%, poor generalization | ✓ |
| **VulBench** (OpenReview) | CTF + MAGMA + Devign + D2A + Big-Vul mixed | Multi-source fusion, includes root cause annotation | 16 LLM + 6 traditional models, LLM > DL but still unusable | ✓ |
| **OWASP Benchmark** | Java ~3000 test cases, Python v0.1 | Executable web app, supports SAST/DAST/IAST | Tool evaluation, not model benchmark | ✓ [owasp.org](https://owasp.org/www-project-benchmark/) |

**Links:**

- OWASP Java: <https://github.com/OWASP-Benchmark/BenchmarkJava>
- OWASP Python: <https://github.com/OWASP-Benchmark/BenchmarkPython>

### 2. Agentic Coding

| Benchmark | Scale | Features | SOTA | Open |
|-----------|-------|----------|------|------|
| **SWE-bench Verified** | 500 tasks (human verified) | Real GitHub issues, Docker-based eval | Claude Opus 4.5 + Live-SWE-agent: **79.2%**; Trae Agent (ByteDance): **75.2%** | ✓ [swebench.com](https://www.swebench.com/) |
| **SWE-bench Pro** (Scale AI) | 731 tasks | Multi-language, multi-repo, long horizon, anti-contamination (GPL repos) | Claude Opus 4.1: ~35%, GPT-5: ~38% (major drop vs Verified) | ✓ [scale.com](https://scale.com/leaderboard/swe_bench_pro_public) |
| **SWE-rebench** | Continuously updated | Real-time SOTA tracking, standardized SWE-Agent scaffold | Gemini 3 Pro: 56.5%; DeepSeek v3.2: open-source SOTA; Claude Sonnet 4.5: 55.1% pass@5 | ✓ [swe-rebench.com](https://swe-rebench.com) |
| **Live-SWE-agent** | Same as Verified + Pro | Agent can self-evolve at runtime, self-create tools | Claude Opus 4.5: 79.2%; Claude Sonnet 4.5 on Pro: 45.8% | ✓ [live-swe-agent.github.io](https://live-swe-agent.github.io/) |
| **SWE-bench Multimodal** (ICLR 2025) | Visual software domain | Multimodal issues (with screenshots) | Private test set, requires sb-cli submission | ✓ |

### 3. Security Testing / Penetration Testing

#### CTF Benchmarks

| Benchmark | Scale | Features | SOTA | Open |
|-----------|-------|----------|------|------|
| **Cybench** (ICLR 2025) | 40 tasks (professional CTF) | 2022-2024 competition problems, First Solve Time as difficulty metric, subtask support | Claude 4.5 Sonnet: ~50%; US/UK AISI officially adopted | ✓ [cybench.github.io](https://cybench.github.io/) |
| **NYU CTF Bench** (NeurIPS 2024) | Extensible | Rich metadata, supports automation framework | GPT-4o + EnIGMA: significant improvement | ✓ [nyu-llm-ctf.github.io](https://nyu-llm-ctf.github.io/) |
| **HackSynth Benchmark** | 200 challenges (PicoCTF + OverTheWire) | Standardized CTF dataset, heuristic solver validation | Dual-module agent (planner + summarizer) | ✓ |
| **CAIBench** (arXiv 2510.24317) | Meta-benchmark (integrates Cybench + NYU + Base + RCTF2) | First robotics security CTF, Cyber Range multi-stage penetration | Alias1 matches SOTA | ✓ |
| **AutoPenBench** | Multi-stage network penetration | VM environment, multi-step attack chain | pass@3 evaluation | ✓ |

#### Real Vulnerability Benchmarks

| Benchmark | Scale | Features | SOTA | Open |
|-----------|-------|----------|------|------|
| **CVE-Bench** (ICML 2025 Spotlight) | 40 critical CVE (Web apps) | Sandbox framework, 8 standard attack types, zero-day/one-day scenarios | SOTA agent: **13%** exploit success rate | ✓ [github.com/uiuc-kang-lab/cve-bench](https://github.com/uiuc-kang-lab/cve-bench) |
| **BountyBench** (Stanford CRFM, 2025) | 25 systems, 40 bug bounties ($10-$30,485) | Detect/Exploit/Patch three tasks, 9/10 OWASP Top 10 | Codex CLI o3-high: Detect 12.5%, Patch 90%; Claude 3.7 Sonnet: Exploit 67.5% | ✓ [crfm.stanford.edu](https://crfm.stanford.edu/2025/05/21/bountybench.html) |

#### Other Security Benchmarks

| Benchmark | Purpose |
|-----------|---------|
| **CyberMetric** | ~10k MCQ covering pentesting/cryptography/network security |
| **CTIBench** | Threat intelligence understanding (CTI MCQ + CTI RCM, 2500 questions) |
| **Agent Security Bench (ASB)** (ICLR 2025) | Agent attack/defense formalization benchmark (DPI, IPI, Memory Poisoning, Backdoor) |

### 4. Security / Misuse / Red Team

- **CyberSecEval 4 (2025)**: <https://meta-llama.github.io/PurpleLlama/CyberSecEval/docs/user_guide/getting_started>
- **AI-Pentest-Benchmark (2024/2025)**: <https://github.com/isamu-isozaki/AI-Pentest-Benchmark>
- **HarmBench (2024)**: <https://github.com/centerforaisafety/HarmBench>

### 5. General Agent / Tool Use (baselines)

- **WebArena** (web navigation agents): <https://webarena.dev/>
- **GAIA** (general assistant reasoning + tool use): <https://gaia-benchmark.github.io/>
- **BFCL (Berkeley Function-Calling Leaderboard)** (tool/function calling quality): <https://gorilla.cs.berkeley.edu/leaderboard.html>

## METRICS SPECIFICATION

### Effectiveness (Core Capability)

| Metric | Definition | Rationale | Reference |
|--------|------------|-----------|-----------|
| **Success Rate** | `# solved / # total` | Baseline capability indicator | Cybench, SWE-bench |
| **pass@k** | Probability of at least one success in k independent attempts | Evaluates stochastic agent's true upper bound | SWE-bench Verified |
| **Unique Solve Rate** | Proportion of tasks solved only by this agent (all others failed) | Measures differentiated capability | ARTEMIS |
| **Precision** | `# true positives / # reported findings` | Avoid FP flooding | ARTEMIS (82% precision) |
| **Recall** | `# true positives / # ground truth vulnerabilities` | Miss rate | SecVulEval |
| **Severity-Weighted Success** | Success rate weighted by CVSS score | Higher weight for critical vulns | BountyBench ($-impact) |
| **CWE/OWASP Coverage** | Number of CWE types / OWASP Top 10 categories successfully covered | Capability breadth | BountyBench (9/10 OWASP) |

### Efficiency (Resource Consumption)

| Metric | Definition | Rationale |
|--------|------------|-----------|
| **Time-to-Compromise (TTC)** | Wall-clock time from task start to first success | Benchmark against human First Solve Time |
| **Step Count** | Action-observation rounds to complete task | Reasoning efficiency |
| **Tool-call Count** | Total tool invocations (breakdown by tool type) | Tool usage pattern analysis |
| **Token Usage** | Input/Output tokens (distinguish cached vs uncached) | Cost estimation basis |
| **Cost per Success** | `total_cost / # successes` | Economic viability, ref ARTEMIS $18.21/hr |
| **Latency p50/p95** | Single-step response time distribution | Real-time assessment |
| **Context Window Utilization** | `avg_context_length / max_context_window` | Long horizon task bottleneck |

### Safety & Policy Compliance

| Metric | Definition | Rationale |
|--------|------------|-----------|
| **False Refusal Rate (FRR)** | Proportion of refusals on legitimate tasks | Capability loss from over-safety |
| **Out-of-Scope Rate** | Proportion of attempts attacking non-target systems | Behavior boundary control |
| **Dangerous Action Rate** | Proportion of destructive operations (DROP TABLE, rm -rf, etc.) | Guardrail effectiveness |
| **Attack vs Defense (A/D Ratio)** | Success rate difference on defended vs undefended variants | Adversarial capability assessment |

### Reliability & Reproducibility

| Metric | Definition | Rationale |
|--------|------------|-----------|
| **Variance (σ)** | Success rate standard deviation across seeds | Result stability |
| **Crash Rate** | Proportion of abnormal agent terminations | Robustness |
| **Tool Error Rate** | Proportion of failed/timed-out tool calls | Infrastructure reliability |
| **Retry Rate** | Proportion of tasks requiring retry | First-attempt success capability |
| **Max Step Saturation** | Proportion of tasks hitting step limit without completion | Step budget sufficiency |

### Task-Specific Metrics (select by scenario)

#### Penetration Testing / CTF

| Metric | Definition |
|--------|------------|
| **Flag Capture Rate** | Proportion of correctly extracted flags |
| **Subtask Completion** | Breakdown by stage (recon → exploit → post-exploit) |
| **Attack Chain Length** | Average length of successful attack chains |
| **Lateral Movement Success** | Cross-host penetration success rate |

#### Vulnerability Detection / Code Audit

| Metric | Definition |
|--------|------------|
| **Statement-level F1** | Vulnerability statement localization accuracy |
| **Root Cause Accuracy** | Proportion of correctly identified root causes |
| **Patch Validity Rate** | Proportion of generated patches passing tests |

#### Bug Bounty (BountyBench style)

| Metric | Definition |
|--------|------------|
| **Dollar Value Captured** | Total bounty amount successfully obtained |
| **Detect → Exploit → Patch Pipeline** | Success rate for each stage |

---

## EVALUATION PROTOCOL

### Pre-run Checklist

```markdown
- [ ] Remote host accessible (never localhost)
- [ ] Proxy configured (if network-dependent tasks)
- [ ] Docker images pulled / VMs provisioned
- [ ] Benchmark suite version pinned
- [ ] Budget cap set
- [ ] Logging enabled (full trace mode)
- [ ] Baseline results available for comparison
```

### Execution Flow

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Setup      │────▶│  Run Loop   │────▶│  Teardown   │
│  (per task) │     │  (agent)    │     │  (cleanup)  │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │
      ▼                   ▼                   ▼
 - Spawn container   - Action-Obs loop   - Stop containers
 - Hydrate DB        - Log all calls     - Collect artifacts
 - Start services    - Check invariants  - Compute metrics
```

### Logging Requirements

Each episode must record:

1. **Input**: task description, starter files, environment state
2. **Trace**: `[(timestamp, action, observation, tokens, latency), ...]`
3. **Output**: final submission, success/fail, evaluator feedback
4. **Meta**: total time, total cost, crash/error events

---

## OUTPUT FORMAT

```markdown
# 📊 BENCH REPORT

## Meta
| Field | Value |
|-------|-------|
| Report ID | `{uuid}` |
| Date | `{ISO8601}` |
| Evaluator | `{name/system}` |
| Git SHA | `{commit}` |

## Configuration
| Parameter | Value |
|-----------|-------|
| Model | |
| Scaffold | |
| Temperature | |
| Max Steps | |
| Max Tokens | |
| Timeout (per task) | |
| Budget Cap | |
| Tools Enabled | |
| Remote Host | |
| Proxy | |
| Benchmark Suite(s) | |
| Task Count | |
| Seed(s) | |

## Results Summary

### Effectiveness
| Metric | Value | Baseline | Δ |
|--------|-------|----------|---|
| Success Rate | | | |
| pass@1 / pass@3 | | | |
| Precision | | | |
| Recall | | | |
| Unique Solves | | | |

### Efficiency
| Metric | Value |
|--------|-------|
| TTC (median) | |
| Steps (mean ± σ) | |
| Tool Calls (mean) | |
| Tokens (input/output) | |
| Cost per Success | |
| Latency p50/p95 | |

### Safety
| Metric | Value |
|--------|-------|
| FRR | |
| Out-of-Scope | |
| Dangerous Actions | |

### Reliability
| Metric | Value |
|--------|-------|
| σ (Success Rate) | |
| Crash Rate | |
| Tool Error Rate | |
| Max Step Saturation | |

## Breakdown

### By Suite
| Suite | n | Success | TTC | Cost |
|-------|---|---------|-----|------|
| | | | | |

### By Task Category
| Category | n | Success | Common Failure |
|----------|---|---------|----------------|
| | | | |

### By Difficulty (FST / CVSS)
| Difficulty | n | Success |
|------------|---|---------|
| Easy (<15min FST / CVSS <7) | | |
| Medium (15min-1hr / CVSS 7-9) | | |
| Hard (>1hr / CVSS ≥9) | | |

### Failure Mode Analysis
| Failure Type | Count | % | Example Task |
|--------------|-------|---|--------------|
| Insufficient Exploration | | | |
| Wrong Tool Selection | | | |
| Context Overflow | | | |
| Hallucinated Action | | | |
| Timeout | | | |
| Guardrail Block | | | |

## Reproducibility

### Environment
\`\`\`bash
# Docker image / VM spec
# Exact versions
\`\`\`

### Execution Command
\`\`\`bash
# ssh + proxy + run command
\`\`\`

### Artifacts
| Artifact | Location |
|----------|----------|
| Raw Traces | `{path}` |
| Logs | `{path}` |
| Parsed Results | `{path}` |

## Notes
- Deviations from standard protocol:
- Known issues:
- Observations:

## Appendix
- [ ] Full task list with per-task results
- [ ] Cost breakdown by model call
- [ ] Tool usage distribution chart
```

---

## PROMPT PAYLOAD (Evaluation Orchestrator)

```text
You are an evaluation orchestrator. Execute the benchmark and produce a BENCH REPORT.

## Hard Rules
1. All execution on REMOTE host only. Reference: `ops-server`
2. Proxy required for network tasks: `export https_proxy=...`
3. Full trace logging mandatory.
4. Stop on budget cap hit.
5. Report ALL metrics specified in METRICS SPECIFICATION.

## Inputs
- Model: {{model}}
- Scaffold: {{scaffold}}
- Suites: {{suites}}
- Tasks (optional filter): {{tasks}}
- Seeds: {{seeds}}
- Max steps: {{max_steps}}
- Budget: {{budget}}

## Outputs
1. SSH command sequence (copy-pastable)
2. BENCH REPORT in specified format
3. Artifact locations

## Example Command
\`\`\`bash
ssh devbox "cd /eval && \
  export https_proxy=http://proxy:8080 && \
  python run_bench.py \
    --model {{model}} \
    --scaffold {{scaffold}} \
    --suite {{suites}} \
    --seeds 42,43,44 \
    --max-steps {{max_steps}} \
    --budget {{budget}} \
    --output /results/$(date +%Y%m%d_%H%M%S)"
\`\`\`
```

---

## BASELINE REFERENCE (2025 SOTA)

| Benchmark | Task Type | SOTA Agent | Success | Cost/Success |
|-----------|-----------|------------|---------|--------------|
| SWE-bench Verified | Code repair | Claude Opus 4.5 + Live-SWE | 79.2% | ~$0.50 |
| SWE-bench Pro | Code repair (hard) | Claude Sonnet 4.5 | 45.8% | - |
| Cybench | CTF (pro) | Claude 4.5 Sonnet | ~50% | - |
| BountyBench Detect | Zero-day detection | Codex CLI o3-high | 12.5% | - |
| BountyBench Exploit | Known vuln exploit | Claude 3.7 Sonnet | 67.5% | - |
| BountyBench Patch | Vuln patching | Codex CLI | 90% | - |
| CVE-Bench | Real CVE exploit | SOTA agent | 13% | - |
| ARTEMIS (real network) | Enterprise pentest | GPT-5 + custom | 82% precision, 9 vulns | $18.21/hr |

---

## CHANGELOG

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-30 | Initial release with comprehensive metrics framework |
