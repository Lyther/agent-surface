---
name: ops-docs
phase: improve
description: "Assess, restructure, and rewrite project docs to a clean, scannable, right-sized set — concise by default, comprehensive where it earns it."
---
## OBJECTIVE

**MAKE THE DOCS WORTH READING.** A newcomer should grasp the project in minutes; an expert should trust it as reference. Most repo docs fail both: stale, dense, fluffy, duplicated, or mixing four jobs in one page.

This command is **aggressive by default**. It does not file a polite report and stop. It reads the repo, decides the *right* doc set, then **rewrites prose, cuts dead weight, splits mixed pages, and writes the missing ones** — bound only by evidence. Default run = a concrete plan you approve; `--write` executes it.

The bar: **clean and clear, less is more.** Concise by default. Comprehensive only where complexity earns it (architecture, roadmap, data model, API contract, ADRs). Every page a human can read in the time it deserves — and not one paragraph longer.

## THE MAP — Diátaxis (classify before you write)

Four kinds of docs, four different reader needs. **Never mix them in one page** — blurring these is the single biggest cause of unreadable docs.

| Mode | Reader need | Belongs | Does NOT belong |
|---|---|---|---|
| **Tutorial** | *Learning* — "teach me" | A guided, on-rails first success | Options, theory, edge cases |
| **How-to** | *A task* — "help me do X" | Direct steps for a competent user | Teaching fundamentals, background |
| **Reference** | *Facts* — "look it up" | Neutral, complete, structured (tables, signatures) | Opinion, narrative, instructions |
| **Explanation** | *Understanding* — "why" | Context, design, tradeoffs, decisions | Step-by-step, exhaustive params |

Action vs cognition · study vs work. Diagnose by asking *which need does this paragraph serve* — then move it to the page that owns that need.

## THE HOUSE STYLE — clean and clear, less is more

Default voice for every doc:

- **Lede first (inverted pyramid).** First 1–3 lines answer what it is / why it matters / how to start. A reader who stops there still got the point. Same rule per section and per paragraph.
- **One idea per paragraph. One job per page.** Short paragraphs, lists, scannable headings that summarize (not "Overview").
- **Cut, don't pad.** No "Welcome", "In this section we will", "simply", "as you can see", hedging, or restating the heading. Say it in 5 words, not 20.
- **Imperative + present tense.** "Run X." not "You can run X." / "This will do Y." → "This does Y." No first person.
- **Show, don't tell.** A copy-paste command that runs beats a paragraph describing it. Every command/code block must actually work.
- **Tables for matrices only.** Use a table when comparing N things across M dimensions. Do not table prose — a 16-row "behaviors" list is bullets or, better, deleted.
- **One canonical home.** Each fact lives in exactly one place; everywhere else links to it. Duplication is debt.

**Comprehensive ≠ verbose.** The comprehensive docs (below) are *complete and sectioned*, not padded. Depth where decisions live; brevity everywhere else.

## CONCISION BUDGETS (so "concise" is measurable)

| Doc | Target | Read time |
|---|---|---|
| README | ≤ ~150 lines; value + quickstart in the first screen | ~2 min scan |
| How-to / tutorial | one task, ~1 screen | minutes |
| Reference (CLI/API/config) | as long as the surface; tabular, zero padding | lookup |
| Architecture / design | comprehensive, but every section ledes | ~10 min |
| Roadmap | comprehensive, phased, checkable | ~5 min |
| ADR | ~1 page | ~2 min |
| CONTRIBUTING / dev loop | the actual loop, ≤ ~1 screen | ~2 min |

Over budget is a smell: cut, split by Diátaxis mode, or push detail down a level.

## THE DOC SET — fit the repo, don't fill a checklist

Do **not** propose a generic catalog of enterprise docs. Derive the *minimal sufficient* set from what the repo actually is (library / CLI / service / compiler / monorepo) and its maturity. Decide:

- **Tier 0 — always:** `README.md` (the front door: what, why, install, first run, where to go next).
- **Tier 1 — any real project:** `docs/architecture.md`; a `CONTRIBUTING.md` or dev-loop doc; the one or two how-tos for the project's main jobs; reference for its public surface (CLI/API/config) when one exists.
- **Tier 2 — comprehensive, only when complexity earns it:** `docs/roadmap.md`, `docs/data-model.md`, `docs/api-contract.md`, ADRs under `docs/decisions/`, a threat model, a runbook. Add one only when there is real complexity or risk to justify it; a pre-production prototype does not need a runbook.

Per-component docs live **next to the code** (`mcps/<svc>/README.md`, `adapters/<t>/README.md`), not in a far-off tree. Introduce Diátaxis folders (`docs/how-to/`, `docs/reference/`, …) only once the set is large enough to need them; a small repo keeps a flat `docs/`.

## PROTOCOL

### 1. Recon (cheap, evidence-first)

Read, don't guess: manifests (`package.json`/`pyproject.toml`/`Cargo.toml`/…), the file tree + real entrypoints, every existing `*.md`, `git log -15`, tests. Determine repo type, maturity, public surface, and the audiences that exist. Token-thrifty: skim the tree and ledes; deep-read only the docs you will touch.

### 2. Diagnose (against the map + the style)

For each existing doc, name the defects precisely:

- **Mode-mix** — tutorial + reference + explanation crammed together → split.
- **Buried lede** — the point is in paragraph 4 → hoist it.
- **Stale** — claims contradict the code/CLI/config/manifests (the worst defect; verify against evidence).
- **Fluff / bloat** — over budget, padded prose, prose-as-table.
- **Duplication** — same content in 2+ files → keep one, link the rest.
- **Dead** — completed checkboxes, removed features, zombie TODOs.
- **Broken** — dead links, commands that don't run, drifted env vars/flags.

Then find **gaps**: docs this specific repo needs but lacks (a missing quickstart, an undocumented public CLI, no architecture for a non-trivial system). Propose the *smallest* set that closes them — not a wishlist.

### 3. Plan (default output)

Emit the plan and stop (unless `--write`). The plan is the smallest set of moves that makes the doc set clean + complete: per doc, the verdict (keep / rewrite / split / merge / delete / create), the reason, and the target read-budget. Lead with what matters most.

### 4. Execute (`--write` / `--apply`)

Apply the moves. Rewrite from evidence — every factual claim traces to a file, command output, or config value. Where evidence is missing, write the heading + `[TODO: needs <owner/input>]`; never invent. Preserve correct content and the author's voice; you are editing for clarity, not reauthoring for its own sake. Relocate before deleting — never destroy the only copy of a true fact; move it to its canonical home and link.

### 5. Verify

Links resolve. Every command/code block runs (or is marked illustrative). Claims match the code. Each doc is within budget. Report read-times before/after.

## THE REWRITE MOVES (what "aggressive" does)

- **Hoist the lede** — first lines = what/why/how-to-start; cut the runway.
- **Cut** — delete fluff, hedging, restated headings, obvious comments, sections with zero information.
- **Tighten** — 20 words → 5; passive → imperative; future → present.
- **Un-mix** — split a page that serves multiple Diátaxis needs into pages that each serve one.
- **De-stale** — reconcile every claim with the code; fix or delete drift.
- **Dedupe → link** — collapse repeats to one canonical home + links.
- **De-table / tableize** — prose-dumps that compare things → a real matrix; a "table" that's just a list → bullets or prose.
- **Show** — replace descriptions of commands with the runnable command + expected output.
- **Fill** — write the missing doc the repo needs, from evidence, in the right mode and budget.

## THE COMPREHENSIVE SET (depth that earns its length)

These exist to prevent re-deriving decisions; keep them complete, but make every section lede and stay scannable. Hand authoring to the specialist commands and keep this command as the curator/editor:

- **architecture** → drivers, context, components + boundaries, data, interfaces, decisions, risks, source-tree ownership. Author/refresh via arch-roadmap (+ arch-diagram for the views).
- **roadmap** → phased, each step with acceptance evidence + exit gate. Via arch-roadmap.
- **data-model** / **api-contract** → the schema and the frozen interface, tabular + precise. Via arch-model / arch-api.
- **ADRs** → one decision per file: context, decision, alternatives, consequences, status. ~1 page.

## EXECUTION RULES

1. **Aggressive, bounded.** Rewrite hard, but never invent facts, never delete the only copy of a true fact (relocate + link), never flatten a comprehensive doc into a stub.
2. **Evidence or TODO.** Every claim traces to the repo; gaps are marked, not fabricated.
3. **Decide the set.** Propose the minimal doc set the repo needs; refuse to generate premature/enterprise docs nothing references.
4. **Right mode, right budget.** One Diátaxis job per page; honor the concision budgets; comprehensive only where listed.
5. **One canonical home.** Deduplicate to a single source + links.
6. **Test the instructions.** Run the commands you document; if it doesn't run, it isn't done.
7. **Default is plan; `--write` executes.** `--audit` reports hygiene only (links, staleness, dupes, naming, dead content). Scope to one doc with `/ops-docs readme` (or any path).

## OUTPUT

**Plan (default):**

```markdown
# DOCS PLAN: {project}  ·  repo type: {library|cli|service|compiler|…}  ·  maturity: {…}
## Rewrite
- README.md — buried lede + 16-row prose table + stale (no grimoire); cut ~40%, hoist value+quickstart. budget ~150ln/2min
## Split
- docs/guide.md — mixes tutorial+reference → docs/how-to/<task>.md + docs/reference/<surface>.md
## Create
- docs/architecture.md — non-trivial system, no design doc → author via arch-roadmap
## Delete / Merge
- docs/todo.md — all boxes checked → move residue to CHANGELOG, delete
## Leave
- mcps/grimoire/*.md — already clean + in-budget
```

**After `--write`:** per file — moves applied, read-time before→after, claims verified, any `[TODO]` left, links/commands checked.

## RELATED

- arch-roadmap · arch-api · arch-model · arch-diagram — author the comprehensive set this command curates.
- ops-clean — repo-wide hygiene (naming, dead files, structure) beyond docs.
- ops-doctor — source/registry/generated health.
- boot-concept — when the *concept* is missing, not just the docs.

## NON-GOALS

- Not a generator of enterprise paperwork nothing reads (no SRS/ICD/SPMP unless the project genuinely needs one).
- Not a content fabricator — it writes from evidence and marks gaps.
- Not a style linter — it rewrites for clarity; leave mechanical lint to linters.
