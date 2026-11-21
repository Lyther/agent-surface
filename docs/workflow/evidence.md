# Workflow default: evidence ledger

What backs the default route and the optional modes in the `boot-workflow` skill. A source counts here only when its existence, authors and headline figures were checked against the published abstract or page on 2026-11-21. That check does not re-run or audit any study. Every row carries the caveat that limits how far a routing rule may lean on it.

Kinds: measured study (M), vendor benchmark (V), vendor self-report (S).

## Verified

| Claim | Kind | Source | Caveat |
|---|---|---|---|
| Letting subagents run concurrently costs 1.41-3.31x the tokens and lengthens runtime in 14 of 15 agent-by-benchmark cells; gains appear only on the longest tasks | M | arXiv 2610.10263 | 2,124 runs over 354 tasks, three vendor harnesses of that month. Results are tied to each harness's native concurrency mechanism. |
| Review direction matters: a stronger model reviewing a weaker one gained about 18 points; the reverse lost 8.6 | M | arXiv 2607.21656 | 116 tasks, one benchmark, two model versions now superseded. The paper says other versions are untested. |
| Test-driven loops lift accuracy by 15.5-23.7 points with capable backbones; a weak test author erases the gain | M | arXiv 2605.17242 | Abstract only was read. 20 web full-stack apps. |
| Human-written tests let a constrained repair loop reach 88.8% (Lite) and 94.3% (Verified) | M | arXiv 2510.23761 | Older than a year, 2025 models. Seven test-hacking cases in 800 runs. |
| Isolated worktrees with a central manager beat a single agent on long tasks (+25.6 and +14.7 points) | M | arXiv 2603.21489 | Long-horizon benchmarks only. Isolation-versus-instructions detail comes from a secondary summary. |
| A checker only helps when it can observe the failure; about one build in seven fails to boot with no tools, and a boot probe fixes most of that cheaply | M | arXiv 2608.28795 | Single author, custom minimal agent. The screenshot gain over a plain shell does not survive multiple-comparison correction. |
| Planning helps weaker models stay on track and trims redundant work for stronger ones | M | arXiv 2609.20804 | 176 settings, but the models are mid-size open models, not frontier coding models. "Little accuracy change for strong models" is not shown. |
| Specs raise merge rate as tickets touch more files (70% without vs 80-85% at 3-5 files; 50% vs 80% at 6+); overall 72% without vs 80-84% with | V | uvik.net, spec-driven development benchmark | 50 Python tickets, one team, one model, fixed time boxes. The page presents 3 files as an observation, not a cutoff. |
| Native subagents added cost with no accuracy gain on small suites; one suite dropped sharply | M | arXiv 2606.10662 | 10 tasks, 3 runs each, high variance; the authors propose a competing system. |
| Splitting sequential planning across agents degraded results by 39-70% on a planning benchmark | M | arXiv 2512.08296 | Earlier-generation models. The 17.2x vs 4.4x error-amplification figure is not a significant predictor. A "tool count above 16" threshold is not in the paper. |
| An independent fresh-context critic adds 5.9-9.5 points on a terminal benchmark at 1.13-1.25x cost | M | arXiv 2610.34577 | Seven non-US models, 31-task subset, a Qwen critic. |
| Instruction-following drops when instructions conflict with a model's prior; project and user instructions outrank tool and skill descriptions | M | arXiv 2608.11727 | Headline verified; the per-category rates were not. Explains why prose rules are a weak enforcement layer. |
| LLM-written context files did not help (-0.5% and -2%, not significant); developer-written ones gained 2.4% (p=0.21) at up to 19% more cost | M | arXiv 2602.11988 | Three models. Neither effect is significant. |
| A context file cut runtime 28.6% and output tokens 16.6% with similar completion | M | arXiv 2601.20404 | 10 repositories, 124 PRs. |
| Repeated self-verification was the weakest of the verification styles tested | M | arXiv 2610.03984 | One small model. "Differential" there means scoring a patch against its reverted tree, not a reference-binary oracle. |
| Review beat the stronger model alone in only 9 of 96 directions | M | arXiv 2610.15897 | 12 open-weight models, 3B-72B, zero-shot rewrites. |
| Harness choice alone swung one benchmark by up to 44 points and cost by over 20x | M | arXiv 2610.32131 | Three lightweight models, 100 tasks. |
| Verification is at most about 14% of agent output in sampled trajectories | M | arXiv 2610.39193 | Correlational preliminary data inside a system paper; the 45-task subset is small. |
| The vendor removed more than 80% of its coding-agent system prompt with no benchmark named | S | vendor post, 2026-07-24 | Self-report, not a measurement. |

## Unverified

No routing rule leans on these. They were named in the operator's reports and could not be read, or were read and not reproduced.

- No source read: MACBench, Asuka-Bench, a 17.8% visual-critic result, CHI 2026 field studies, TDAD, TestSuiteBench, ImpossibleBench, a 23.6%-to-5.3% reward-hacking result, SpecGuard, PROBE, CodeDelegator, AOrchestra, WatchPoint, vendor benchmarks from the agent-product companies, practitioner posts on three-strike limits and unattended loops, and the formal-verification papers (VeruSAGE, VerusEval, VeriBench, VeriContest).
- Figures that failed to reproduce: the "about 3% reduction" and "overturned" readings of the context-file study; a 0.513 R-squared in the scaling study; a -3.0 point average in the review study; forbid/require rates of 20.8% and 23.8% in the instruction-following study.
- Overstated by a report: screenshots help on visible failures (the study's own correction applies); the differential-verification paper as support for reference-oracle checks.
- No controlled study found for: prototype-first versus incremental build order, implementation-time spike-then-rewrite, two versus three repair attempts, or any file-count cutoff for planning.

## What this means for the map

- The default route and the qualitative plan-first signal rest on the verification-surface, planning and spec-benchmark rows. The file-count cutoff is open, so the map uses none.
- Parallel width and subagents are optional because concurrency and native subagents cost more than they return on short tasks.
- Models in the review, concurrency and planning rows are one generation old; re-run them before claiming they hold for current models.
- The operator decided on 2026-11-22 to add no "reviewer at least as capable as the writer" rule, because review strength does not track coding strength across model families. The review-direction row stays as evidence; the map keeps only the different-family reviewer guidance.
