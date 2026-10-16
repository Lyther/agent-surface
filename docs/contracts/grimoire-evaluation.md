# Grimoire Evaluation Contract

Status: baseline observed, the retrieval defect fixed, and the fix confirmed on a held-out set, 2026-10-16; task ROI not measured.
Scope: [Grimoire effectiveness amendment](../context/concept-zero.md#grimoire-effectiveness-amendment). This supplements, not replaces, the existing [MCP contract](../../mcps/grimoire/api-contract.md) and [typed schemas](../../mcps/grimoire/src/contract.ts).

## Observed Baseline

Source `e44121f8a0f5796bc59c616b813ff3c79d1d5295`; isolated approved Linux development environment, Node 22.23.2, MCP SDK 1.32.1, schema-3 corpus of 1,137 skills from five pinned packs. The 30 existing reviewed queries concern one pack and are not held out. Actual stdio MCP and approved-provider calls were used; no target activity was executed.

| Arm | Target hit@1 | Target hit@5 | MRR@5 | Model cells completed |
|---|---:|---:|---:|---:|
| Literal query | 19/30 | 24/30 | 0.711 | Not applicable |
| Luna query/selection | 17/30 | 22/30 | 0.644 | 30/30 |
| GLM-5.1 query/selection | 21/30 | 26/30 | 0.778 | 30/30 |

Warm literal MCP search p50/p95 was 1.63/2.56 ms; initialize was 208.34 ms. The two-call model path p50 was 3.46/12.14 seconds respectively. Main provider totals were 61,020 reported tokens, not a verified bill. A GLM-5.2 preflight continuation failed with HTTP 429; the second model was explicitly amended before measurement. No automatic fallback or retry altered the sample.

Expected IDs were hidden from models. The probe exposed the production search tool/schema and text results, not initialization instructions, full skill bodies or a native coding harness. All model selections were returned IDs or `NONE`; single JSON fences were accepted and counted separately. These results do not rank the models, establish population-wide relevance, or measure task success. Alternative relevant documents were incompletely labelled; exact paired hit@5 tests did not establish an advantage.

The actual reader's [term construction](../../mcps/grimoire/src/store.ts) uses [FTS5 implicit conjunction](https://www.sqlite.org/fts5.html). Post-hoc real calls showed that `service` or `setup` can exclude an intended document before ranking; concise keywords restore it. Joined versus split `spearphishing` also matters. The current repository regression floor passes. This is an observed existing robustness limit, not a newly introduced regression.

## Shipped Change

The reader's [term construction](../../mcps/grimoire/src/store.ts) required every query term, which [FTS5 reads as a conjunction](https://www.sqlite.org/fts5.html), so `service` or `setup` excluded an intended document before ranking and joined versus split `spearphishing` also decided a match. Terms are now OR-ed with filler words dropped, so an unmatched term no longer excludes a document, and weighted BM25 orders the candidates by term rarity, frequency, document length and column rather than by how many terms matched. Measured on the pinned cybersecurity pack over the same 30 reviewed queries:

| Arm | Target hit@1 | Target hit@5 | MRR@5 | Out-of-corpus queries returning a hit |
|---|---:|---:|---:|---:|
| Every term required | 19/30 | 0.800 | 0.711 | 0/12 |
| Any term, BM25 ranked | 23/30 | 0.967 | 0.836 | 11/12 |

Two alternatives were measured and rejected: dropping filler words alone recovered one of six reworded queries, and allowing one unmatched term reached 0.933 hit@5 but left rank 1 unchanged while growing the query with each term. Caller-side keyword guidance was not run as a separate arm, because the tool description already requested keywords and models still over-expanded.

The cost is accepted, not solved: a query no skill covers used to return nothing and now returns its nearest matches. No threshold separates them — intended hits scored as low as 4.1 while unrelated top hits reached 20.1, and a corpus-vocabulary gate removed only two of eleven. The duty to judge a hit therefore sits in the tool description and api-contract, which state that hits are ranked candidates rather than a verdict that one fits. Regression floors rose to 0.85 hit@5 and 0.75 MRR, which the conjunctive query fails, and seven sentence-shaped queries became fixtures. `spearphishing` remains unretrieved from `spear phishing`: that is tokenization, separately owned.

Those figures cover the 30 diagnostic cases the change was measured on, so they are tuned rather than validated, and they are not evidence of task benefit. The held-out confirmation is below.

Private receipts are retained under `.agent-surface/research/2026-10-16-grimoire-evaluation/`: preregistration, exact scripts, runtime/corpus manifest, all measured calls, deterministic order, usage and separate diagnostics. They are not distributed assets. The [diagram evidence](../diagrams/evidence.md) links the implemented owners.

## Held-Out Relevance

The shipped reader was then confirmed on a set built after it, against graded relevance rather than one expected ID. Fifty-two requests span six domains — security 12, reverse engineering 8, offensive/CTF 10, engineering leadership 8, static analysis 4, adjacent coding 10 — in keyword, single-sentence and paragraph wording independent of skill titles. None of the 30 diagnostic queries was reused. For each request the top ten under the conjunctive query and the top ten under the shipped query were pooled, de-duplicated and shuffled with a fixed seed, so a grader saw a candidate's id, name and description with no score, rank, domain or indication of which query produced it. Two independent blind sessions graded every candidate 2 (an agent doing this task should load this skill), 1 (partially useful) or 0, and each candidate keeps the lower of the two grades. Over 533 judgments with none missing, the graders matched exactly on 91.6% and reached kappa 0.86 on useful versus not. By final grade, 33 requests have a direct skill, 9 are partial only, and 10 have none — the no-skill controls. Both arms then ran against the frozen five-pack index, and the shipped arm was re-run through the real compiled reader at `aab5020`, which reproduced its top five for all 52 requests.

| Arm | Useful at 1 | Useful in top 5 | Direct in top 5 | nDCG@5 | Empty results | Uncovered requests returning a hit |
|---|---:|---:|---:|---:|---:|---:|
| Every term required | 11/42 | 11/42 | 10/33 | 0.180 | 29/42 | 1/10 |
| Any term, BM25 ranked | 29/42 | 40/42 | 30/33 | 0.650 | 0/42 | 10/10 |

Useful retrieval holds across domains (security 10/11, reverse engineering 8/8, offensive 10/10, leadership 5/5, static analysis 4/4, adjacent coding 3/4). Two covered requests still return nothing useful, both long paragraphs whose common words lift unrelated documents: a PCI remediation request that has a direct skill, and a React re-render request with partial coverage only. That is the paraphrase and sibling-collision class already named as the hybrid-retrieval trigger, not a new failure.

The accepted cost was then measured on the caller side rather than assumed. Each request's real text result, the production server instructions and the production tool descriptions went to two models, which chose one returned id or `NONE`. Both abstained on 10/10 uncovered requests with no invalid id; on the 33 direct requests one chose the direct skill 28 times and the other 30, with zero and one irrelevant choice. Score thresholds remain useless for this on held-out data: an uncovered request's top hit scored 9.4 to 35.5 while the first useful hit on a covered request scored 10.7 to 42.4, and the highest uncovered score exceeds 38 of the 40 covered useful-hit scores. Judgement stays with the caller and with the tool description, as the interface section requires.

Limits. Grades are model-authored: the two rater roles were independent blind sessions of the same model, so agreement measures one grader's consistency under blinding, not human or cross-family agreement; the operator accepted dual blind model grading as this phase's review standard. Graders judged name and description only, while retrieval also matches the body. The requests were authored in-project before the labels and never tuned against results, but they are not an independent population. The caller arm replayed real results into one decision: no model issued its own search, retried, or loaded a skill. Coverage classes describe the pooled candidates, so "uncovered" means no useful candidate was pooled, not absent from the corpus. One repetition per cell. Private receipts, scripts and the reproduction commands are under `.agent-surface/research/2026-10-16-grimoire-gr1/`.

This satisfies the held-out relevance condition in the decision rules below. It permits the native task comparison; it does not predict its outcome.

## Data and State

Domain/data: REQUIRED, existing ownership retained. No database migration or new production entity is selected.

| Record | Owner and identity | Invariant |
|---|---|---|
| Corpus | Existing indexer; schema version, pack commits and source hashes in its manifest | Frozen per comparison; runtime reader never rebuilds it; notices and file provenance remain intact. |
| Evaluation task | Experiment owner; stable case ID and public/authorized source | Task description is independent of the expected skill title; accepted IDs/relevance grades are hidden from models. Multiple useful skills and no-skill outcomes are representable. |
| Attempt | Experiment owner; case, arm, repetition, model/harness and order | Failed/missing/aborted attempts remain in the denominator; no replacement with a successful retry. |
| Result | Actual MCP/provider response or official task verifier | Retrieval rank, selection, availability/use, task reward, timing and usage are different fields and claims. |

Use simple retained JSON/JSONL and existing manifests, not a new schema registry or evaluation service. Preserve the preregistration and separate analysis amendments. Do not retain credentials, hidden reasoning, unrelated private content or raw operator memory. Source commits identify code; transfer digests identify immutable corpus bundles where useful, not every mutable report.

## Interfaces and Mapping

Interfaces: REQUIRED, existing MCP contract retained. `SearchInput` validates query and k; `Store.search` owns candidate eligibility/ranking; model helpers map rows to `SkillHit`; the server exposes the result. Keep four tool names, current input limits, IDs, statuses, provenance and file retrieval unchanged. Scores are ranking values, not confidence probabilities. No query may become executable SQL/FTS syntax.

The controlled provider probe maps the real MCP schema to a provider function tool, executes the returned arguments through the real MCP server and returns its text mirror. Report any omission of native initialization instructions or other tools. This mapping is not native-harness acceptance. A later native trial must actually load/search/get/use material and produce an independently scored result.

An empty successful search is not a transport failure. `INDEX_MISSING`/`INDEX_STALE`, schema rejection, provider errors and deadline failures remain distinguishable. Neither missing usage nor a provider status may be converted into a successful quality/cost claim. Any additional retry has a frozen cap and contributes time/tokens; failed attempts stay recorded. Existing error/repair behavior is not weakened for a candidate.

## Comparison and Decision

1. Preserve the 30-case baseline as diagnostic data; the shipped change was measured on it and is therefore tuned, not validated. Build a new multi-pack set from independently worded task requests, with reviewed relevance and no-skill controls. Review pooled candidate documents before knowing which algorithm returned them. Do not tune and evaluate on the same labels. For the retrieval phase this was met with in-project wording and two blind model grading sessions, which the operator accepted as the review; the task phase still requires an official public or authorized task source and its own verifier.
2. Compare production behavior with the smallest intervention. Caller concise-query/retry guidance and server lexical relaxation are separate arms, not a combined unexplained change. BM25 weight tuning cannot fix candidate exclusion by itself. Hybrid/embedding/reranking research follows only if simpler candidates leave a measured useful-retrieval gap.
3. Freeze source/index/model/harness, tool access, budgets, scorer, order, exclusions and practical decision criteria before candidate outcomes. Match total allowances, including retries/children. Use paired observations; one run is exploratory. Repeat a prespecified cohort, not only winning cases, before a dependable-gain claim.
4. Measure graded useful-result retrieval, target-ID hit rates as a diagnostic, no-skill false positives, valid calls, selection, latency, result bytes and provider usage. Negative-query precision matters when relaxing conjunction. Do not silently discard an unrelated or contradictory result because it improves recall.
5. A credible retrieval improvement advances to official task-verifier comparison; it does not itself prove task benefit. Keep raw, direct relevant skill, current retrieval and candidate retrieval distinct. Direct-skill provision is an oracle-assisted diagnostic, not autonomous retrieval.
6. Prefer the smaller solution when useful outcomes are indistinguishable within the experiment's precision and it costs less. A mixed/null result can leave production unchanged. A narrowly reproduced bug may be fixed with its own affected-path proof without pretending the small corpus establishes a general uplift.

No production dependency, schema/DTO change, new CLI flag or profile change was taken: the shipped change is term eligibility and two descriptions, so `CONTRACT_VERSION` stays 1.0.0. Keep any further implementation's compatibility and regression tests proportional to the changed boundary.

## Category ROI Boundary

Compare raw native harness, general assets and general plus one category in fresh HOME/workspaces. First isolate instruction ROI with identical applications/services; an entire-profile comparison that adds tools is a different treatment. General installation precedes category installation within an arm because general is a reset. Inspect actual manifests and loaded bodies, not only intended flags.

Use the official task environment, task inputs and verifier. The [SkillsBench repository](https://github.com/benchflow-ai/skillsbench) and existing official benchmark runners are reuse candidates; no replacement scorer is proposed. Freeze domain/resource inclusion before model outcomes. Coding, source-security, black-box security, modding and private operations need different appropriate populations, not one aggregate score. Do not disable normal tools in the baseline or carry solutions/memory between arms.

Category redesign follows verified contribution or harm, not asset size alone. The [roadmap](../roadmap.md#phase-gr-grimoire-and-asset-effectiveness) keeps native task ROI, hook experiments and lower-priority Synapse research separate from this completed retrieval baseline.
