# Grimoire Evaluation View

Date: 2026-10-16. Source: `e44121f8a0f5796bc59c616b813ff3c79d1d5295`.
Scope: retrieval experiment and the proposed task-outcome comparison, not a whole-project atlas.

## View Plan

| View | Audience | Question | State | Why retain it |
|---|---|---|---|---|
| [Grimoire evaluation](grimoire-evaluation.svg) | Maintainer and experiment peer | Where was the retrieval failure, and what proof is still missing? | Measured flow above; proposed task comparison below | Prevents fast MCP calls or a target-ID score being confused with native task benefit. |

The SVG is the editable source and browser-renderable artifact. Its text equivalent is below. No hosted renderer or private architecture upload is needed.

## Evidence Ledger

| ID | Kind / responsibility | State | Evidence and limitation |
|---|---|---|---|
| T | Dataset: task wording and hidden reviewed IDs | OBSERVED | Existing [30 queries](../../mcps/grimoire/test/fixtures/queries/real-pack.json); one pack only, searched against five packs. Not held-out relevance. |
| P | External provider: generate query and choose a returned ID | OBSERVED | Private 2026-10-16 experiment receipts; 60 completed cells, two actual models. Direct API probe, not a native coding harness. |
| M | Process: stdio tool validation/result delivery | OBSERVED | [Server](../../mcps/grimoire/src/server.ts), [schemas](../../mcps/grimoire/src/contract.ts); actual SDK initialize/callTool/close. |
| S | Reader: term eligibility and ranking | CHANGED | [Store.search / ftsQuery](../../mcps/grimoire/src/store.ts); real calls diagnosed the conjunction, which now matches any term and ranks by BM25. |
| I | Datastore: frozen self-contained skill corpus | OBSERVED | [Schema/tokenizer](../../mcps/grimoire/src/model.ts), private snapshot manifest and integrity check; 1,137 skills, schema 3. Shared live index unchanged. |
| R | Evidence: hits and selected ID | OBSERVED | [Baseline contract](../contracts/grimoire-evaluation.md#observed-baseline); target-ID metrics only. Full skill task execution not measured. |
| C | Candidate: any-term matching with BM25 ranking | IMPLEMENTED | [Shipped change](../contracts/grimoire-evaluation.md#shipped-change); measured against two rejected alternatives on the 30 diagnostic cases, not a held-out set. |
| V | Evaluation: held-out relevance then native task verifier | PROPOSED | [Decision contract](../contracts/grimoire-evaluation.md#comparison-and-decision), [Phase GR](../roadmap.md#phase-gr-grimoire-and-asset-effectiveness). Official verifier/environment qualification still pending. |

## Text Alternative and Boundaries

Measured: a task description enters the approved model API; the model emits one search call. The actual stdio MCP server validates it, and the reader queries the frozen local SQLite FTS5 index. Every lexical term was required before weighted BM25 ranking, which is where a relevant skill was lost; any term is now eligible and ranking carries the breadth. Real returned hits go back to the model for ID selection. Credentials go only to the approved provider, never into task prompts or retained outputs. The baseline also sends literal task wording directly to the same MCP search.

Baseline target hit@5 under the conjunctive reader: literal 24/30; one model's queries 22/30; the other's 26/30. Warm literal search p50/p95: 1.63/2.56 ms. Literal hit@5 is now 29/30. These numbers do not establish task success, corpus-wide recall, a model advantage or a host context-limit defect.

Proposed: independently labelled multi-pack tasks confirm the shipped reader against reviewed alternatives and no-skill controls, then a native-harness task with its official verifier. No new search service, cache, store, default profile or universal harness framework is selected. Computer use is outside this work.
