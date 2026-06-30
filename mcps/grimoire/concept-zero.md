# Concept Zero — grimoire

Status: PROPOSED
Last updated: 2026-06-30

> `grimoire` is a naming PROPOSAL (a book of procedures fetched on demand; sibling to `synapse`). Rename freely; the concept is independent of the name.

## Executive Decision

`grimoire` is a **first-party, read-only, stateless stdio MCP server** that serves a **large library of Agent Skills just-in-time** through **namespaced** tools at escalating context cost — `grimoire_list` (names/derived-categories), `grimoire_search` (BM25 top-k), `grimoire_get` (one `SKILL.md` body + supporting-file manifest + provenance), and `grimoire_file_get` (a skill's referenced `scripts/`/`references/`/`assets/` files — the pack ships 3,404 of them). It exists because large packs (the pinned `anthropic-cybersecurity-skills` = **754 skills / 36 MB**, `FACT`) cannot be mirrored into runtime native skill catalogs: the blocker is **selection, not context** — no model reliably picks the right skill from 750+ always-listed entries, and bounded-catalog runtimes silently drop most of them (Zed dropped **697/864**, Codex truncates **857→204**; `FACT`, measured this session). grimoire keeps **one small tool surface** in startup context and returns the matching skill on demand, so it works on **any MCP-capable runtime** and scales to thousands of skills. It is the MCP reification of Anthropic's own **Tool Search Tool** pattern (defer-loading + BM25; `FACT`). It deliberately does **not** execute skills, does not use embeddings in v0, and reuses the **first-party MCP distribution rails already shipped for `synapse`** (registry `first_party` entry + per-target stdio wiring). Hard precondition (`USER_DECISION`, in progress by peer): the large pack is **deferred from every native skill catalog** — grimoire is the *only* access path, or the startup-overflow returns.

## Problem and Evidence

| ID | Claim | Evidence | Conf | Impact |
|---|---|---|---|---|
| E-01 | `anthropic-cybersecurity-skills` = 754 `SKILL.md`, 36 MB; name+description catalog = 83 KB (~29K tokens); bodies up to 53 KB | measured this session (`find`/byte-sum) | high | catalog is the cost driver, not bodies |
| E-02 | Bounded-catalog runtimes silently drop most: **Zed** 50 KB desc budget → **697/864 dropped (~81%)**; 100 KB per-skill body cap (offensive-osint failed); frontmatter required (red-team-command-doctrine failed) | live Zed warning (screenshot) | high | full native install is lossy/broken |
| E-03 | **Codex** 2%-ctx/8000-char floor → 857 installed self-reported as **204**; description >1024 chars rejected | live `codex exec` probe | high | even "graceful" runtimes truncate hard |
| E-04 | **Pool/Grok/Gemini** inject the entire catalog (no cap) → ~29K-token permanent tax; Pool enforces desc≤1024 + frontmatter | live `pool` log + agent probes | high | unbounded runtimes pay a heavy always-on tax |
| E-05 | **Claude Code** lists name+description within **1% of context**; on overflow "descriptions for least-used skills are dropped" and shortening "can strip the keywords Claude needs to match your request" | code.claude.com/docs/en/skills | high | Anthropic confirms the *selection* failure at scale |
| E-06 | Anthropic **Tool Search Tool** = canonical JIT discovery: `defer_loading` + **BM25/regex** backend; selection Opus 4 49%→74%, Opus 4.5 79.5%→88.1%; ~85% context reduction | anthropic.com/engineering/advanced-tool-use | high | endorses list/search/get + BM25; the pattern to copy |
| E-07 | **Agent Skills spec** (open since 2025-12-18): `name` required (1–64, slug, == dir), `description` required (1–1024 chars); sizes are **recommendations** (body <5000 tokens), not hard limits; unknown keys ignored | agentskills.io/specification | high | defines index fields + what to validate vs warn |
| E-08 | Prior art is partial: `agentskills-mcp` (Apache-2.0, no `search`/top-k, FlowLLM+LLM dep), `mcp-skill-server` (execution-focused, no search, non-spec), vercel `find-skills` (remote discovery/install, not JIT-serve). **No official skill-search MCP.** | repo/docs survey | med | thin custom build justified; reference for ranking |
| E-09 | agent-surface already has first-party MCP distribution (registry `first_party` → rendered/merged across the ~13 MCP hosts synapse covers) and a proven `node:sqlite` FTS5/BM25 store (synapse) | this session | high | distribution + retrieval are adopt-not-build |

## Users and Stakeholders

| Actor | Need | Constraints | Success signal |
|---|---|---|---|
| Coding agent (the model) | Find + load the *right* security/forensics/red-team procedure mid-task | Can only attend over a few choices; calls tools by description | Reaches the right skill via search→get, not from stale prior knowledge |
| Developer/operator | Access 750+ expert skills without bloating every session | Many runtimes; some non-lazy | Skills available on demand; zero startup degradation |
| agent-surface maintainer | One pack-agnostic mechanism, distributed via existing rails | "Less is more"; no per-runtime catalog hacks | One MCP entry replaces 754 native-skill emissions everywhere |
| Excluded | Runtimes with no MCP support (vscodium/copilot instructions-only, goose recipes) | — | Out of scope — not skill-capable anyway |

## Goals, Non-Goals, and Constraints

| ID | Type | Statement | Evidence |
|---|---|---|---|
| G-01 | goal | Serve large skill packs on demand without injecting them into native startup catalogs | E-01..E-05 |
| G-02 | goal | The model reliably *selects* the right skill among 750+ (selection accuracy, not just context fit) | E-05, E-06 |
| G-03 | goal | Pack-agnostic: index any configured skill roots (cybersecurity now, others later) | USER_DECISION |
| G-04 | goal | Universal reach + zero new infra: reuse synapse's first-party MCP distribution rails | E-09 |
| G-05 | goal | Read-only, stateless, single-process-per-client; no sidecar/realtime/concurrency | INFERENCE (read-only ⇒ no shared writer) |
| C-01 | constraint | Tool surface = `grimoire_list` + `grimoire_search` + `grimoire_get` + `grimoire_file_get` (namespaced); `list` required; `file_get` required (every skill ships supporting files) | USER_DECISION + peer review |
| C-04 | constraint | Stable composite ids `"<pack>:<skillName>"`; every record carries provenance back to the pinned pack; missing index → `INDEX_MISSING` error, never a false-empty catalog | peer review |
| C-02 | constraint | The pack must be **deferred from all native skill catalogs**; grimoire is the sole path | USER_DECISION (peer revert in progress) |
| C-03 | constraint | Stack matches synapse: TypeScript, `@modelcontextprotocol/sdk` pinned `>=1.24.0 <2`, `node:sqlite` FTS5, Node ≥22.17 | E-09 |
| N-01 | non-goal | Not a skill **executor** — serves content; does not run `scripts/` | scope |
| N-02 | non-goal | Does not replace native skills for *small curated* sets (a handful of always-on skills stays native) | INFERENCE |
| N-03 | non-goal | No embeddings/vector DB in v0 (deferred behind a measured trigger) | E-06, research |

## Unacceptable Outcomes

| Outcome | Why it matters | Prevention / detection |
|---|---|---|
| Pack still mirrored into native catalogs **and** served by grimoire | Reintroduces the 29K-token overflow + double-listing | C-02 gate; an agent-surface `check` rule asserts no `skill_roots` for grimoire-served packs |
| Model never calls grimoire and answers security tasks from memory | Defeats the purpose; stale/unsafe procedures | Tool/`instructions` wording: "search before any security/forensics/red-team task; don't rely on prior knowledge" (E-06) |
| `grimoire_list` dumps all 754 entries into one result | Recreates the catalog-overflow inside a tool result | `list` is paginated/derived-category + name-only; `search` is the primary path (research §4c) |
| Missing/stale index reported as an **empty catalog** | Agent sees "no skills" → silent non-use (the failure we're avoiding) | Return structured `INDEX_MISSING`/`INDEX_STALE` + remediation hint, not empty (C-04) |
| Skill served without its supporting files | Procedure references `references/`,`scripts/`,`assets/` it can't fetch → unusable | `grimoire_get` returns a file manifest; `grimoire_file_get` fetches them (C-01) |
| Malformed skills crash the index or inject prompt | Pack has real defects (E-02) | Index-time **metadata** validation (skip missing-frontmatter, warn+truncate desc>1024, warn oversize body); body kept **raw**, safety is the response format (labeled "reference, not instructions"), not char-stripping |
| Retrieval misses the right skill (vocabulary mismatch) | Model gets wrong/no skill | Curate descriptions for trigger keywords; should-trigger eval harness; hybrid as measured upgrade (N-03) |

## Glossary

| Term | Meaning |
|---|---|
| Skill | An Agent-Skills `SKILL.md` (YAML frontmatter `name`+`description` + Markdown body) ± `scripts/`,`references/`,`assets/` |
| Catalog | The name+description list a runtime injects at startup so the model knows what skills exist |
| Selection | The model choosing the correct skill for a task — the bottleneck this solves |
| Progressive disclosure | Load metadata first, body on demand — native to Agent Skills; grimoire moves it behind a tool |
| Defer | Exclude a skill from the native catalog so it's reachable *only* via the search tool (Anthropic `defer_loading`) |

## Critical Journeys

| Journey | Current pain | Proposed experience |
|---|---|---|
| Agent hits "investigate this PCAP for C2" | 750-skill catalog truncated/unbrowsable → wrong or no skill | `grimoire_search("c2 beaconing pcap")` → top-5 → `grimoire_get(id)` → `grimoire_file_get` its references → follows the procedure |
| Agent wants the security taxonomy | No way to see all without flooding context | `grimoire_list({category:"forensics"})` → bounded names+summaries (derived categories) |
| Operator adds a new pack | Re-mirror N skills into every runtime's native dir; hits caps | Add a skill root to grimoire's index config; rebuild index; all runtimes get it via one MCP |

## Quality Scenarios

| ID | Scenario | Measure | Architecture gate |
|---|---|---|---|
| Q-01 | 750-skill library; agent given a security task | The matching skill is reachable via `grimoire_search`→`grimoire_get`(+`grimoire_file_get`); startup cost = the grimoire tool defs (~hundreds of bytes), not 750 catalog entries | live MCP smoke (Q-04) proves the tool *path*; retrieval *quality* is gated by Q-03 — no universal "≤2 calls" claim |
| Q-02 | Index build over a pack with malformed skills | 0 crashes; missing-frontmatter **skipped** (logged), desc>1024 **truncated+warned**, body>guidance **warned**; body/files kept **raw** (no char-stripping) | validation step with a report |
| Q-03 | `grimoire_search` retrieval quality | **hit@5 ≥ X% and MRR ≥ Y** on a committed `test/fixtures/queries/*.json` (should-trigger / should-not-trigger) set | eval harness in CI; trigger hybrid only if lexical-miss material (N-03) |
| Q-04 | Runs on any MCP-capable target | tools/list + a `search`→`get`→`file_get` round-trip works via the stdio entry on each wired host | per-target smoke (reuse synapse runbook) |
| Q-05 | Index missing/stale at query time | `grimoire_search`/`grimoire_list` return `INDEX_MISSING`/`INDEX_STALE` + remediation, never empty | error-path test |

## Research Landscape

| Capability | Candidate route | Evidence | Verdict |
|---|---|---|---|
| JIT skill discovery pattern | Anthropic Tool Search Tool (defer + BM25) | E-06 | **Adopt the pattern** (reify as MCP tools) |
| Skill-serving MCP server | agentskills-mcp / mcp-skill-server / vercel find-skills | E-08 | **Reject as base** (no top-k search / exec-focused / different problem) → thin build |
| Retrieval | `node:sqlite` FTS5 / BM25 | E-06, E-09, research §3 | **Adopt** (lexical v0; Anthropic ships BM25 as default) |
| Semantic retrieval | embeddings + brute-force cosine / sqlite-vec | research §3 | **Defer** behind a measured lexical-miss trigger (754 docs ⇒ no vector index needed) |
| Distribution | agent-surface first-party MCP rails | E-09 | **Adopt** (registry `first_party` + bridge-style stdio wiring) |
| MCP transport/server | `@modelcontextprotocol/sdk` low-level Server over stdio | E-09 | **Adopt** (read-only ⇒ stdio per client; no sidecar) |

## Adopt / Adapt / Build Decisions

| Capability | Decision | Rationale | Risk |
|---|---|---|---|
| MCP server runtime | adopt SDK + build thin server | no maintained fit (E-08); narrow wrapper | low |
| Index/retrieval | adopt node:sqlite FTS5/BM25; build the indexer | zero-dep, proven in synapse, BM25 = Anthropic default | vocab mismatch (mitigated) |
| Distribution | adopt synapse rails | already shipped; one entry, all targets | none new |
| Embeddings | defer | premature for 754 identifier-heavy docs | re-open if eval fails |
| Skill execution | not built | read-only by design (N-01) | — |

## Candidate Concepts

### Candidate A — Convert pack to commands/workflows (user-explicit only)

Render the 754 skills as slash-commands. **Rejected as primary**: several runtimes *merge commands→skills* (Claude/Codex/Droid/Kilo) so "commands" = skills = same overflow; 754 commands are unbrowsable by humans too; per-target fragile. Useful only as a narrow explicit escape hatch on runtimes with a truly separate, lazy command surface. (This is the subject of Task B's de-duplication, not the large-pack fix.)

### Candidate B — JIT skills MCP (`grimoire`) — **SELECTED**

One read-only stdio MCP server + a build-on-install FTS5 index over configured skill roots; `grimoire_list`/`grimoire_search`/`grimoire_get`/`grimoire_file_get`; distributed via first-party rails; pack deferred from native catalogs. Universal, scale-free, attention-correct, reuses existing infra.

### Candidate C — Curate a small native subset (~20–50 top skills)

Keep a hand-picked few as native skills, drop the rest. **Rejected as the solution**: arbitrary curation loses ~700 skills, doesn't scale, and re-incurs per-runtime caps for the kept set. May *complement* B (a tiny always-on "use grimoire for security work" pointer skill), but is not the mechanism.

## Adversarial Review

| Finding | Revision |
|---|---|
| If the runtime's native loader still lists the pack, grimoire just adds a second path → overflow persists | Make C-02 (defer from native catalogs) a hard precondition + a `check` rule; grimoire is sole path |
| Model may not call the search tool | Description/`instructions` written as an explicit routing rule (E-06); optional 1-line rules pointer; readOnlyHint annotation |
| `grimoire_list` over 754 re-floods context | `list` is name-only + derived-category + paginated; `search` top-k is the documented primary path |
| BM25 misses synonym/paraphrase queries from a model caller | curate trigger-keyword descriptions; should-trigger eval (Q-03); hybrid only if measured (N-03) |
| `get` returns body but the procedure needs `references/`/`scripts/`/`assets/` | `grimoire_get` returns a supporting-file manifest; `grimoire_file_get({id,path})` fetches each on demand (C-01) |
| Missing/stale index looks like "no skills" | structured `INDEX_MISSING`/`INDEX_STALE` + remediation, never a false-empty (C-04) |
| Yet another bespoke server to maintain | thin (one stdio server + indexer); no maintained alternative fits (E-08); shares synapse's stack/rails |

## Selected Concept HLD

- **Boundary**: a single read-only stdio MCP process per host client. No network, no shared state, no sidecar (read-only ⇒ none of synapse's single-writer/realtime machinery is needed).
- **Index (build-on-install)** (`PROPOSAL`, decided): a `node:sqlite` FTS5 DB **built on install from the pinned submodule source** — no prebuilt index in the repo (avoids bloat + stale-index risk). Columns weight `name`^ + `description`^ + `body` (low). Pack-agnostic. An `index_meta` row records service id, pack `sourceCommit`, file count, source hash, schema version, build time. Metadata validation at build; body/files stored raw (Q-02). Rebuilt by `npm run install:grimoire`; if a required pack's source is absent the install **fails (exit 1)** rather than silently succeeding, and the indexer builds into a temp db + atomic-renames so a failed rebuild never corrupts an existing index. On a machine with no built index the server reports `INDEX_MISSING` (never a false-empty catalog).
- **Stable IDs + provenance** (`PROPOSAL`): ids are stable composite strings `"<pack>:<skillName>"` (e.g. `anthropic-cybersecurity-skills:detecting-command-and-control-over-dns`) — collision-proof across packs, stable across rebuilds, never row ids. `grimoire_get` returns provenance (`pack`, `skillName`, `sourcePath`, `sourceCommit`, `sha256`, `indexedAt`) so an answer can be audited back to the pinned pack vs a local fork. `search` results stay compact (`id, pack, name, summary, score`).
- **Tools** (≤4; **namespaced** to avoid host-flattened collisions with the native "skills" concept; model-controlled; `readOnlyHint`; `outputSchema`+`structuredContent`+text dual-return):
  - `grimoire_list({ category?, cursor? })` → paginated `[{id, pack, name, summary}]`; categories **mechanically derived** from skill-name prefixes/domains, tagged `categorySource: "derived"` (the pack ships no taxonomy) — or omitted for prefix-only filtering.
  - `grimoire_search({ query, k? })` → BM25 top-k `[{id, pack, name, summary, score}]` — the **primary** path.
  - `grimoire_get({ id })` → full `SKILL.md` body **+ a manifest of supporting files** (`scripts/`,`references/`,`assets/` relative paths) + provenance.
  - `grimoire_file_get({ id, path })` → the content of one supporting file. Required: the pack ships **3,404** supporting files and every skill has some — without this grimoire is a partial skill host (a skill that says "see `references/api-reference.md`" is unusable). MCP `resource_link` deferred (client support uneven).
- **Why this surface**: `search` is primary (bounded, ranked); `list` is the taxonomy/browse fallback (name-only + derived-category + paginated, never re-floods); `get` loads one body + tells the model which supporting files exist; `file_get` fetches them on demand. Escalating context cost; `list` does not make `search` redundant (listing 750 names recreates the selection problem).
- **Discovery**: server `instructions` + each tool's `description` steer "for security/forensics/red-team/CTF/IR work, `grimoire_search` first; don't answer from memory." Optional one-line rules pointer.
- **Distribution**: registry `first_party` `kind:"mcp"` entry → rendered/merged across the **full MCP host set synapse covers** (Claude Code, Codex, Deep Agents, Cursor, Droid, Kilo, OpenCode, VS Code, Zed, …) — identical rails, zero new infra; a `served_by` link declares which source-pack grimoire indexes. Only genuinely non-MCP targets (instructions/recipes-only) are uncovered.
- **Operations**: `npm run install:grimoire` (build index from pinned source + link the stdio binary), mirroring synapse's installer. Cost driver: the tool defs + an on-disk index; negligible runtime.
- **Failure behavior**: missing/stale index → tools return a structured `INDEX_MISSING` / `INDEX_STALE` error with a remediation hint (`npm run install:grimoire`), **not** an empty catalog (which reads as "no skills" → silent non-use, the failure we're avoiding). Process stays alive. Malformed skill → skipped at build (logged); oversize body → `grimoire_get` returns the one body, large supporting files fetched via `grimoire_file_get`.

## First Production Slice

Build-on-install an FTS5 index of the pinned `anthropic-cybersecurity-skills` (754 skills + 3,404 supporting files); ship a stdio server exposing `grimoire_list`/`grimoire_search`/`grimoire_get`/`grimoire_file_get`; wire one first-party registry entry through the full synapse MCP host set; prove a real `grimoire_search("detect cobalt strike beacon") → grimoire_get → grimoire_file_get(references/…)` round-trip returns the correct skill **and its referenced files**, with the pack absent from all native catalogs. v0 smoke covers at least one generated host (Droid) and one merge host (Cursor); full coverage requires the host-family matrix in the roadmap.

## Open Questions and Spikes

| Question | Why it matters | How to resolve | Next |
|---|---|---|---|
| Set Q-03 thresholds (hit@5 X%, MRR Y) | Defines the retrieval acceptance gate | label `test/fixtures/queries/*.json`; measure the BM25 baseline | spike before GA |
| `grimoire_file_get` vs MCP `resource_link` long-term | resource_link is cleaner where clients support it | per-target smoke (Q-04); keep `file_get` as the reliable v0 | arch |
| Name (`grimoire` vs other) | cosmetic | user pick | user |
| Should a tiny "pointer skill" be the only native skill (Candidate C complement)? | Improves discovery on skill-native runtimes | decide in arch | arch |

*Resolved during review (see HLD):* index posture = **build-on-install from pinned source**; big-body/supporting-file delivery = **`grimoire_get` manifest + `grimoire_file_get`**; category taxonomy = **mechanically derived from name prefixes, tagged `categorySource:"derived"`**.

## Handoff to Architecture and Roadmap

Carry forward: the **four-tool** contract (`grimoire_list`/`search`/`get`/`file_get`, namespaced) + escalating-context rationale (C-01); **stable `<pack>:<skillName>` ids + per-record provenance + the `INDEX_MISSING`/`INDEX_STALE` error model** (C-04); BM25/FTS5-first with a deferred, eval-gated hybrid measured by **hit@5/MRR on committed query fixtures** (N-03, Q-03); **build-on-install** index from pinned source + `index_meta` + metadata validation (raw content) (Q-02); read-only stdio server (no sidecar) reusing synapse's first-party distribution + stack (G-04/G-05, C-03); the hard "defer from native catalogs" precondition + a `check` rule (C-02); per-target smoke + discovery wording. `arch-roadmap` → `architecture.md`/`roadmap.md`; `arch-api`/`arch-model` specify the tool I/O (incl. `grimoire_file_get` + provenance fields) and the index schema (incl. `index_meta`). Per peer P3: the implementation docs should use a **concrete file tree + phased checklist**, not broad tables (evidence tables stay in this concept).
