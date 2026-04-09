## OBJECTIVE

**THE BOARDROOM MIRROR.**
Code is the engine. Research is the story. Business is the reason to exist.
**Your Goal**: Produce a comprehensive, evidence-backed report of the entire project across technology, research, business, and cross-cutting risks.
**The Boundary**: Read-only by default. Write a Markdown artifact only when `--write` is requested.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*A full-project report can drown in detail. Synthesize; do not dump.*

1. **Evidence First**:
    - Start with `docs/context/`, `docs/architecture.md`, `docs/roadmap.md`, `README*`, manuals, whitebooks, whitepapers, and leader-facing docs.
    - Then read manifests, key entrypoints, core modules, tests, and recent git state.
2. **Compare Claims to Reality**:
    - Do not compare docs to docs. Compare concept claims to code, tests, demos, and runnable artifacts.
3. **Use Web Search Selectively**:
    - Use it for publication fit, benchmark norms, market comparables, and best-practice guidance.
    - Do not waste time searching for facts already visible in the repo.
4. **Forced I/O — No Passive Reading**:
    - When tool execution is available (bash, CLI, file-read tools), you MUST use them to gather evidence. Do not claim to have "read" or "reviewed" a file without physically opening it via a tool call.
    - Every factual assertion about the codebase must trace to a specific tool invocation (file read, grep, ls, git command, or test execution). If you cannot execute tools, explicitly mark report confidence as `Low (no tool access)` and note which claims are unverified.
    - Passive pattern matching on filenames or directory structure is NOT evidence of implementation.

## SYNTAX

```text
/report [target] [--focus <areas>] [--depth quick|standard|deep] [--audience eng|research|exec|full] [--with-web auto|off|required] [--write <path>]
```

## PARAMETERS

| Parameter | Default | Description |
|-----------|---------|-------------|
| `[target]` | `.` | Project root or subdirectory to analyze |
| `--focus <areas>` | `tech,research,business,cross` | Comma-separated report lenses |
| `--depth` | `standard` | `quick` = fast scan, `standard` = balanced, `deep` = broader repo/doc review + more web research |
| `--audience` | `full` | `eng`, `research`, `exec`, or `full` |
| `--with-web` | `auto` | `auto` = search only where it materially improves the report, `off` = repo-only, `required` = must supplement with external sources |
| `--write <path>` | none | Optionally write the report to a Markdown artifact |

## WHEN TO INVOKE

- Before a major checkpoint, demo, paper draft, investor update, or leadership review
- When `docs/context/` exists and you need a reality check against implementation
- When the project feels directionally right but you need a precise gap/risk map

## PROTOCOL

### Phase 0: Evidence Inventory

*No report without a corpus. No corpus without tool execution.*

1. **Discover Project Structure** (mandatory tool calls):
    - Execute: `find . -maxdepth 3 -type f \( -name "*.md" -o -name "*.toml" -o -name "*.json" -o -name "*.yaml" -o -name "*.lock" \) | head -40` to inventory docs and manifests.
    - Execute: `ls -la` at project root to confirm top-level layout.
    - If `docs/context/` exists, read each file inside it. If missing, fall back to `README*`, `docs/architecture.md`, `docs/roadmap.md`.
2. **Extract Claims**:
    - From the concept/architecture docs, extract up to **8 core claims** the project makes about itself: features, capabilities, architecture decisions, research contributions, and business goals.
    - Cache these claims internally as the verification checklist for Phase 1.
3. **Snapshot Reality**:
    - Read manifests (`package.json`, `Cargo.toml`, `pyproject.toml`, etc.) to identify actual stack, dependencies, and version constraints.
    - Execute: `git log --oneline -20` and `git diff --stat HEAD~5` (if git is available) to detect active development areas, stale modules, and recent velocity.
    - Read `AGENTS.md`, `.cursor/lessons.md`, `.cursor/mission.md` if present.
4. **Confidence Label**:
    - If concept docs are weak or missing, explicitly mark the report confidence as reduced.
    - If tool execution is unavailable, mark confidence as `Low (no tool access)`.

### Phase 1: Technology Analysis

*What did we say we would build, what actually exists, and how healthy is it?*

1. **Project Purpose**:
    - Summarize what the project does in plain language.
2. **Progress vs Concept — Probed Verification**:
    - For EACH claim extracted in Phase 0, execute a probe command to find physical evidence:
        - Claim says "async pipeline"? → `grep -rnI "async\|await" src/ | head -10`
        - Claim says "RBAC"? → `grep -rnI "auth\|role\|permission" src/ | head -10`
        - Claim says "reproducible tests"? → `ls Makefile Dockerfile` or `pytest --collect-only 2>&1 | tail -5`
    - Build the verification matrix:
        - concept claim
        - probe command executed
        - evidence found (filepath + stdout excerpt, or `[NOT OBSERVED]`)
        - status: implemented / partial / missing
        - risk: critical / high / medium / low (critical = blocks demo or delivery; high = blocks research or business claim; medium = technical debt; low = cosmetic or nice-to-have)
        - notable gap
3. **Doc/Code Drift**:
    - Identify mismatches between `docs/context/`, architecture/roadmap docs, and actual implementation found during probing.
4. **Security & Dependency Baseline** (mandatory, cannot be skipped):
    - Execute: `grep -rnI "password\|secret\|API_KEY\|api_key\|PRIVATE_KEY\|token.*=.*['\"]" src/ --include="*.py" --include="*.js" --include="*.ts" --include="*.rs" --include="*.go" | head -20`
    - Execute: `grep -rnI "TODO.*[Ss]ecur\|FIXME\|HACK\|XXX" src/ | head -15`
    - Check dependency pinning: are lockfiles (`Cargo.lock`, `package-lock.json`, `poetry.lock`, `uv.lock`) present and committed?
    - Check for known-vulnerable or wildcard dependency ranges in manifests.
    - If nothing found, state "No hardcoded secrets or critical FIXMEs detected in grep scan" — do not silently omit this section.
5. **Potential Issues**:
    - Surface technical risks, weak testing, missing metrics, unclear ownership, brittle dependencies, and delivery blockers.
6. **Key Design Failures**:
    - Call out architecture mistakes, wrong abstractions, unclear boundaries, missing interfaces, or feedback loops that will cause pain later.
7. **Improvements & Next Steps**:
    - Recommend the highest-leverage technical changes.
8. **Others (agent decides)**:
    - Include demo readiness, operational readiness, documentation quality, and dependency health when relevant.

### Phase 2: Research Analysis

*Is this just a project, or is it publishable work?*

1. **Research Worthiness**:
    - Assess whether the project is valuable enough to stand as an academic research artifact.
    - Judge novelty, significance, differentiation, and technical depth.
2. **Contribution Story**:
    - Extract the likely paper/story:
        - problem
        - insight
        - method/system
        - why it matters
3. **Experiment Design & Metrics**:
    - Check whether experiments, baselines, ablations, artifact packaging, and metrics are sufficient.
    - Flag missing controls, weak evaluation, missing baselines, missing failure analysis, or absent reproducibility guidance.
4. **Reviewer Challenge Map**:
    - Predict hard reviewer questions:
        - novelty skepticism
        - missing baselines
        - weak metrics
        - unrealistic assumptions
        - artifact reproducibility gaps
        - scope mismatch between claims and evidence
5. **Research Improvements**:
    - Recommend how to strengthen the evaluation, artifact, story, and threats-to-validity treatment.
6. **Publication Fit**:
    - If `--with-web` is `auto` or `required`, search for venue norms, benchmark expectations, and likely publication homes.
    - Recommend venue types, not just names: systems, security, HCI, ML systems, applied AI, tooling, workshop vs conference.
7. **Others (agent decides)**:
    - Include artifact evaluation readiness, reproducibility packaging, ethics, and dataset concerns when relevant.

### Phase 3: Business Analysis

*Why should anyone care enough to fund, adopt, or buy this?*

1. **Objectives & Value**:
    - State the product objective and key value clearly.
2. **Leader-Facing Materials**:
    - Check whether the repo contains a usable project brief, manual, whitebook, whitepaper, or similar leader-facing documentation.
    - If absent, say so directly.
3. **Demo Readiness**:
    - Identify what can be demonstrated now, what is fake/mock, and what would break in a live demo.
4. **User Stories & Selling Narrative**:
    - Infer primary users, pain points, and the most credible user stories.
    - Explain how the product would be positioned or sold.
5. **Business Risks**:
    - Call out unclear ICP, missing differentiation, lack of ROI proof, weak onboarding, or missing proof of value.
6. **Others (agent decides)**:
    - Include moat, adoption blockers, compliance concerns, product packaging, and pricing hypotheses when evidence supports it.

### Phase 4: Cross-Cutting Synthesis

*The most important part is the contradiction map.*

1. **Overall Status**:
    - Assign a simple status per lens: green / amber / red.
2. **Top Contradictions**:
    - Identify where technology, research, and business narratives disagree.
3. **Decisions Required**:
    - Surface the few decisions that unblock the most progress.
4. **Next Steps**:
    - Recommend a concrete 7-day, 30-day, and 90-day sequence.
5. **Audience Tuning**:
    - `eng`: go deeper on code, architecture, and delivery risk.
    - `research`: go deeper on novelty, baselines, metrics, and venue fit.
    - `exec`: compress detail, emphasize status, risk, differentiation, and decisions.
    - `full`: include all lenses at balanced depth.

### Phase 5: Optional Web Research

*Use the internet only where repo evidence stops.*

1. **`--with-web off`**:
    - No web research. Repo-only analysis.
2. **`--with-web auto`**:
    - Search only for:
        - publication/venue fit (acceptance rates, scope, deadlines)
        - benchmark and artifact-evaluation expectations for identified target venues
        - comparable open-source projects when the repo makes differentiation claims
        - best-practice guidance for specific identified weak spots (not generic tutorials)
    - Do NOT search for generic best practices, prompt engineering guides, or tutorial content.
3. **`--with-web required`**:
    - Use web research for all `depends on you` fields that benefit from external context.
4. **Citation Rule**:
    - If web research is used, cite every external claim inline.

### Phase 6: Optional Artifact Output

*Chat first. Artifact only on request.*

1. **Default**:
    - Return the full report in chat.
2. **`--write <path>`**:
    - Write the same report to the requested Markdown path.
    - Prefer paths like `docs/reports/YYYY-MM-DD-project-report.md`.
    - Do not invent a file path if one was not requested.

## OUTPUT FORMAT

**The Project Report**

```markdown
# 📊 PROJECT REPORT

## Executive Summary
- **Overall Status**: Amber
- **Audience**: full
- **Confidence**: Medium (tool access: yes; docs coverage: partial)
- **One-liner**: This project builds X for Y by doing Z.
- **Top Risks**: weak evaluation, doc/code drift, unclear demo path

## Technology Analysis

### What This Project Does
- Builds an agent-driven evaluation platform that turns project intent into implementation, verification, and reporting loops.

### Progress vs Concept (Probed)
| Concept Claim | Probe | Evidence | Status | Risk | Gap |
|---------------|-------|----------|--------|------|-----|
| Research-grade evaluation workflow | `grep -rnI "eval\|benchmark" src/` | `src/eval/runner.py:12`, `src/eval/metrics.py:45` | partial | high | benchmark menu exists, but experiment pipeline not frozen |
| Async agent orchestration | `grep -rnI "async\|await" src/` | `[NOT OBSERVED]` | missing | critical | no async code found despite architecture doc claims |

### Security & Dependency Baseline
- **Hardcoded Secrets**: No hardcoded secrets detected in grep scan.
- **Critical TODOs**: `src/auth/handler.py:88: TODO Security: validate JWT expiry` — HIGH.
- **Dependency Pinning**: `poetry.lock` present and committed. No wildcard ranges in `pyproject.toml`.
- **Supply Chain**: 47 direct dependencies; no advisory scan run (recommend `pip-audit` or `cargo-audit`).

### Gaps Between Documents and Code
- `docs/context/` promises a broader end-to-end workflow than the current runnable implementation proves.

### Potential Issues
- Critical success claims may rely more on planning/docs than on executable validation artifacts.

### Key Design Failures
- The strategy layer may be clearer than the delivery layer; architecture intent is stronger than hard execution evidence.

### Improvements
- Define one canonical demo path, one canonical evaluation path, and one canonical source of truth for project status.

### Next Steps
- Freeze the MVP surface, connect concept claims to executable checks, and make the demo path reproducible.

### Additional Technical Observations
- Documentation quality is high, but evidence quality must stay ahead of narrative quality.

## Research Analysis

### Is It Research-Worthy?
- Potentially yes, if the novelty is in the evaluation/reporting loop and the work is backed by reproducible evidence and baselines.

### Contributions & Story
- The strongest story is: identify concept/code drift early, quantify progress, and convert agentic engineering work into research-grade evidence.

### Experiment Design & Metrics
- The report should demand baselines, ablations, reproducibility packaging, cost/time metrics, and failure analysis before claiming research maturity.

### Reviewer Challenge Map
- Expect reviewers to ask: what is novel, what is measured, what baseline is beaten, and how reproducible is the artifact?

### Research Improvements
- Add explicit baselines, a benchmarked evaluation harness, a threats-to-validity section, and artifact reproduction instructions.

### Publication Fit
- Best early fit is workshop or applied systems/security venue; top-tier conference fit needs stronger empirical evidence.

### Additional Research Observations
- If the artifact is easier to admire than to rerun, reviewers will punish it.

## Business Analysis

### Objectives & Key Value
- The product value is faster project understanding, sharper gap detection, and better leadership-facing reporting.

### Leader-Facing Materials
- Architecture and roadmap docs may exist, but an executive brief and demo script are usually the missing business-layer assets.

### What We Can Demonstrate Now
- We can demonstrate project scanning, concept-vs-code gap analysis, and a prioritized action report.

### User Stories & Selling Narrative
- As an engineering or research lead, I want one command that tells me what this project is, how real it is, where it is weak, and what to do next.

### Additional Business Observations
- The clearest buyer/user story is internal platform leverage first, external productization second.

## Cross-Cutting

### Decisions Required
- Decide whether the primary near-term goal is product demo readiness, research publication readiness, or internal technical due diligence.

### 7 / 30 / 90 Day Plan
- 7 days: define canonical demo and evidence checklist.
- 30 days: close the biggest concept/code gaps and add measurable evaluation.
- 90 days: harden the artifact, refine the story, and prepare leadership/reviewer-facing materials.

### Sources
- Include only when web research is used; cite each external claim inline and list referenced URLs here.

### Follow-up Commands
- `qa-review` for code-risk review
- `qa-measure` for metrics and benchmarking
- `ops-doctor` for repo integrity
- `ops-docs` for documentation cleanup
- `arch-roadmap` for concept-to-plan restructuring
```

## EXECUTION RULES

1. **READ-ONLY BY DEFAULT**: Do not edit files unless `--write` is explicitly requested.
2. **EVIDENCE FIRST**: Separate observed facts from inference. Do not invent missing project history, customers, or results.
3. **COMPARE CLAIMS TO CODE**: The primary job is reality-checking documents against implementation.
4. **USE WEB SEARCH WHERE IT PAYS OFF**: Especially for publication fit, benchmark standards, market comparables, and best-practice remediation ideas.
5. **REDUCE CONFIDENCE WHEN INPUTS ARE THIN**: Missing `docs/context/` or weak documentation must lower confidence, not increase guesswork.
6. **NO SPECIALIST DUPLICATION**: `/report` synthesizes; it does not replace deep-dive commands.
7. **ACTIONABLE ENDING**: Always end with concrete improvements, decisions, and next steps.
8. **CITE OR MARK UNOBSERVED**: Every factual claim in the report must trace to a specific file path, command output, git artifact, or search result. If evidence was sought but not found, write `[NOT OBSERVED]` in the relevant field. Never infer existence from naming conventions, doc promises, or adjacency to other evidence.
9. **FORCED TOOL I/O**: When shell or file-read tools are available, you MUST use them for evidence gathering. Do not substitute tool execution with assertions like "based on the project structure" or "likely implemented in". If a probe command returns empty, record the empty result honestly. The only acceptable evidence sources are: tool output (stdout/stderr), file contents read via tool, git command output, and web search results.

## RELATED COMMANDS

- `boot-context` loads working context before focused tasks.
- `arch-roadmap` turns `docs/context/` into an architecture and execution plan.
- `qa-review` performs strict code-risk review.
- `qa-measure` performs metrics and benchmarking work.
- `ops-doctor` checks repo health and sync integrity.
- `ops-docs` cleans and compresses documentation.
- `ops-deps` audits dependency freshness and supply-chain health.

## NON-GOALS

- Not a replacement for a security review (but includes a mandatory security baseline probe)
- Not a replacement for benchmark execution
- Not a pure docs audit
- Not a roadmap generator
- Not a business plan hallucination engine
