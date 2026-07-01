---
name: ops-docs
phase: improve
description: "Aggressively align, restructure, and rewrite project docs to a clean, right-sized, single-source-of-truth set — including file/folder moves, merges, deletions, and the missing docs. Concise by default; comprehensive only where earned; heavyweight/old-school types only on request."
---
## OBJECTIVE

**MAKE THE DOCS WORTH READING — AND KEEP THEM TRUE.** A newcomer should grasp the project in minutes; an expert should trust it as reference; nothing should contradict the code. Most repo docs fail all three: stale, dense, fluffy, duplicated, or mixing four jobs in one page.

This command is **aggressive and structural by default**. It does not file a polite report, tweak a few sentences, and call clean docs "leave". It reads the repo and the code, decides the *right* doc set and layout, then **rewrites prose, cuts dead weight, splits mixed pages, merges duplicates, deletes legacy, renames/moves files and folders, and writes the missing docs** — bound only by evidence. Default run = a concrete plan you approve; `--write` executes it.

Two non-negotiables the timid pass forgets:

- **Alignment is the job, not a bonus.** Reconciling every doc to the current code/CLI/config/manifests is the baseline. Stale docs are worse than none — they actively mislead and erode trust. Drift is the **highest-severity defect**.
- **Structure is in scope.** File/folder moves, merges, deletions, renames, and new files are expected outputs — not edge cases. "Only edit inside existing files" is the wrong altitude.

The bar: **clean, clear, true, one home per fact.** Concise by default; comprehensive only where complexity earns it. Every page a human can read in the time it deserves — and not one paragraph longer.

## THE PRIME DEFECT: DRIFT (align first)

Before style, fix truth. For **every** doc, reconcile each factual claim against the evidence — manifests, entrypoints, CLI `--help`, config keys, schemas, tests, `git log`. A claim that contradicts the code is fixed or deleted, never left. "No defect found" is only valid **after** the code cross-check — a doc you did not verify against the code is *unverified*, not *clean*.

**Single source of truth (SSOT):** each fact lives in exactly one authoritative home; everywhere else **links**. Duplication is debt and a drift generator (the copies rot independently). The most common violation: a front-door/README that **re-hosts** the CLI table, API reference, env-var list, or full source tree that a reference doc already owns — inline reference in a README is a defect; link to the canonical home instead.

## THE MAP — Diátaxis (classify before you write)

Four kinds of docs, four reader needs. **Never mix them in one page** — blurring them is the single biggest cause of unreadable docs. Diátaxis is a *compass, not a cage*: apply with sense, not ceremony.

| Mode | Reader need | Belongs | Does NOT belong |
|---|---|---|---|
| **Tutorial** | *Learning* — "teach me" | A guided, on-rails first success | Options, theory, edge cases |
| **How-to** | *A task* — "help me do X" | Direct steps for a competent user | Teaching fundamentals, background |
| **Reference** | *Facts* — "look it up" | Neutral, complete, structured (tables, signatures) | Opinion, narrative, instructions |
| **Explanation** | *Understanding* — "why" | Context, design, tradeoffs, decisions | Step-by-step, exhaustive params |

Diagnose by asking *which need does this paragraph serve* — then move it to the page that owns that need.

## THE HOUSE STYLE — clean and clear, less is more

- **Lede first (inverted pyramid).** First 1–3 lines answer what it is / why it matters / how to start. Same rule per section and paragraph. A 100-word run-on opener is a buried lede even if it's line 1.
- **One idea per paragraph. One job per page.** Short paragraphs, lists, scannable headings that summarize (not "Overview").
- **Cut, don't pad.** No "Welcome", "In this section we will", "simply", "as you can see", hedging, or restating the heading. Say it in 5 words, not 20.
- **Imperative + present tense.** "Run X." not "You can run X." No first person.
- **Show, don't tell.** A copy-paste command that runs beats a paragraph describing it. Every command/code block must actually work.
- **Tables for matrices only.** Compare N things across M dimensions. Never table prose; never inline a reference table the canonical doc owns — link it.
- **One canonical home.** Each fact in one place; link, don't copy.

**Comprehensive ≠ verbose.** Comprehensive docs are *complete and sectioned*, not padded. Depth where decisions live; brevity everywhere else.

## CONCISION BUDGETS (so "concise" is measurable)

| Doc | Target | Read time |
|---|---|---|
| README | ≤ ~150 lines; value + quickstart in the first screen | ~2 min scan |
| How-to / tutorial | one task, ~1 screen | minutes |
| CONTRIBUTING / dev loop | the actual loop, ≤ ~1 screen | ~2 min |
| CHANGELOG | one entry per release, newest first | lookup |
| Reference (CLI/API/config) | as long as the surface; tabular, zero padding | lookup |
| Architecture / design | comprehensive, but every section ledes | ~10 min |
| Roadmap | comprehensive, phased, checkable | ~5 min |
| ADR | ~1 page, one decision | ~2 min |

Over budget is a smell: cut, split by Diátaxis mode, or push detail down a level. Reference and the comprehensive set may run long **only** if dense and non-padded.

## DECIDE THE DOC SET — three classes, named types

Do **not** propose a generic enterprise catalog. Derive the *minimal sufficient* set from what the repo actually is (library / CLI / service / compiler / monorepo) and its maturity. Classify each candidate into one of three classes:

**A. Concise by default** — front-line docs, kept tight:

- `README.md` (front door: what, why, install, first run, where to go next — links to the reference, never re-hosts it)
- how-tos / tutorials for the project's main jobs · `CONTRIBUTING.md` / dev-loop · `CHANGELOG.md` (keepachangelog + semver) · per-component `README`s next to code.

**B. Comprehensive by nature** — earn their length; sectioned, every section ledes:

- `docs/architecture.md` (arc42/C4 shape: drivers, context, components + boundaries, data, interfaces, decisions, risks, source-tree ownership) · `docs/roadmap.md` · `docs/data-model.md` · `docs/api-contract.md` (OpenAPI/GraphQL/proto) · ADRs under `docs/decisions/` (MADR, one decision/file) · threat model · runbook.
- Add one only when real complexity/risk justifies it. A pre-production prototype does not need a runbook.

**C. Heavyweight / "old-school" — ON REQUEST ONLY.** Do **not** auto-generate these; add only when the user explicitly asks, or a named external driver requires it (regulated industry, government/defense contract, formal audit, contractual deliverable). Name them, don't fabricate them:

- `SRS` (IEEE 830) · `PRD` / `BRD` / `MRD` · `SDD` / `SDS` (IEEE 1016) · `ICD` · `SPMP` · formal `RFC` process · formal test plan / `V&V` plan.
- Rationale: in lean/agile contexts these add overhead without proportional value; requirements/design increasingly live as ADRs, OpenAPI, and code. Offer them; don't impose them.

Introduce Diátaxis folders (`docs/how-to/`, `docs/reference/`, …) only once the set is large enough to need them; a small repo keeps a flat `docs/`.

## THE EXTERNAL, SELF-CONTAINED REPORT (the all-in-one "presents outside the codebase" doc)

Sometimes the project must present itself to readers **outside the repo** — a paper appendix, a library dossier for adopters, an external technical review. That artifact is **not** a Diátaxis in-repo page, **not** an OKR (an OKR is a goals/objectives-and-key-results planning artifact — different job), and **not** a design doc (internal; it gets *reframed* for outside readers). Name it by intent:

- **Technical Report** — objective, academic/engineering tone; informs and documents; no persuasion. Fits research repos and results write-ups.
- **Whitepaper** — authoritative but persuasive; builds confidence for technical decision-makers; ~5–20 pages.

Treat it as a **DERIVED, published, self-contained artifact**, synthesized from the canonical in-repo set (architecture + concept + interfaces + results) — **never a second source of truth** (that would re-introduce the drift SSOT forbids). Rules:

- **Self-contained:** inline what an outside reader needs; **no repo-relative links** that break outside the tree; define terms it uses.
- **Derived + dated + provenance:** state it is generated from the canonical docs at a commit/date; regenerate rather than hand-maintain in parallel.
- **On request:** produce it only when external presentation is actually needed; keep the in-repo canonical docs as the SSOT it is rendered from.

## PROTOCOL

### 1. Recon (cheap, evidence-first)

Read, don't guess: manifests, the file tree + real entrypoints, every existing `*.md`, `git log -15`, tests. Determine repo type, maturity, public surface, audiences. Token-thrifty: skim tree + ledes; deep-read the docs you will touch. Subagents may fan out, but their "clean" verdict is a hint — you still reconcile against code before trusting it.

### 2. Diagnose (truth → structure → style)

Per doc, in order:

- **Drift/misalignment** (top severity) — claims vs code/CLI/config/manifests/tests. Verify, don't assume.
- **Structural** — duplication across files (name the canonical home), legacy/dead docs (removed features, all-boxes-checked, superseded), name collisions, mixed-mode pages, wrong location (belongs next to code / in another doc), missing Tier-A/B docs, wrong class (heavyweight doc nothing references).
- **Style** — buried lede, fluff/over-budget, prose-as-table, inlined reference that should link.
Then decide the **set + layout**: the smallest set of files/folders that is clean, true, and complete.

### 3. Plan (default output)

Emit the plan and stop (unless `--write`). Group moves by class (below). Lead with what matters most — usually the front door and the worst drift.

### 4. Execute (`--write` / `--apply`)

Apply the moves. Rewrite from evidence — every claim traces to a file, command, or config value; gaps get `[TODO: needs <owner/input>]`, never invention. **Relocate before deleting** — never destroy the only copy of a true fact. On any move/rename, **update every inbound link** and remove emptied folders. Preserve correct content and the author's voice; edit for clarity, not for its own sake.

### 5. Verify

Reconcile changed claims to code. Links resolve (scan the whole set). Every command/code block runs (or is marked illustrative). Each doc within budget and single-mode. No orphaned files or dangling links from moves. Report read-times before→after.

## THE MOVES (what "aggressive + structural" does)

**In-file:** hoist the lede · cut fluff · tighten (20→5 words; passive→imperative) · un-mix (split multi-mode pages) · de-stale (reconcile or delete every drifted claim) · show (command + output over description) · de-table / tableize.

**Structural (file/folder):**

- **Merge** true duplicates into one canonical doc. Do **not** merge *complementary* docs that serve different Diátaxis needs (e.g. a policy doc and a runtime-config doc) — dedupe their overlapping sections via link instead.
- **Dedupe → link:** collapse repeated content to one home + links (the SSOT fix; the usual README/reference offender).
- **Delete** legacy/dead/superseded docs (relocate any surviving true fact first).
- **Rename/move** to kill name collisions, put per-component docs next to code, and flatten needless single-file folders — fixing inbound links.
- **Create** the missing docs the repo needs (front door, dev loop, an absent architecture for a non-trivial system), in the right mode and budget.

## THE COMPREHENSIVE SET (curate, don't merely tidy)

These prevent re-deriving decisions; keep them complete, every section leded, scannable. Hand *authoring* to the specialist commands; this command is the **curator/editor** — and curating still means aggressive de-staling, deduping, splitting, and restructuring. "Curate" is not "leave alone."

- **architecture** (arc42/C4) · **roadmap** · **data-model** / **api-contract** · **ADRs** (MADR). Author/refresh via arch-roadmap / arch-model / arch-api / arch-diagram; reconcile and integrate here.

## EXECUTION RULES

1. **Aggressive, structural, bounded.** Rewrite hard and move files; never invent facts, never delete the only copy of a true fact (relocate + link), never flatten a comprehensive doc into a stub.
2. **Align first.** Reconcile every touched doc to the code; treat drift as the top defect. "Leave" requires proof: in-budget **and** reconciled **and** single-mode **and** non-duplicative.
3. **One canonical home.** Deduplicate to a single source + links; a front door links to the reference, never re-hosts it.
4. **Decide the set + layout.** Propose the minimal set and the file/folder structure the repo needs; refuse premature/enterprise docs nothing references.
5. **Right mode, right budget.** One Diátaxis job per page; honor budgets; comprehensive only where earned.
6. **Heavyweight types on request only.** SRS/PRD/BRD/MRD/SDD/ICD/SPMP/formal-RFC — named, offered, never auto-generated.
7. **The external report is derived.** A self-contained Technical Report / Whitepaper is rendered from the canonical set on request, not maintained as a parallel truth.
8. **Test the instructions.** Run the commands you document; if it doesn't run, it isn't done.
9. **Default is plan; `--write` executes.** `--audit` reports hygiene only. Scope to one doc/path with `/ops-docs <path>`.

## OUTPUT

**Plan (default):**

```markdown
# DOCS PLAN: {project}  ·  type: {library|cli|service|…}  ·  maturity: {…}
## Align (drift — do first)
- docs/x.md — CLI table lists 6 cmds; code has 8 (build-calibration-gold, …) → reconcile to `bfm --help`.
## Rewrite / Split
- README.md — buried 100-word lede + re-hosts CLI+env reference tables (owned by interfaces.md) → cut to front door (~90ln), link canonical.
## Structural (files/folders)
- Merge: docs/a.md + docs/b.md (true dup) → docs/a.md.
- Rename: docs/diagrams/architecture.md → docs/diagrams.md (name collision); fix 2 inbound links; drop empty folder.
- Delete: docs/legacy-gp.md (superseded); relocate its one live fact to architecture.md.
- Create: CONTRIBUTING.md (missing dev loop).
## External report (on request)
- Technical Report — derived from architecture + concept + results; self-contained; only if presenting outside the repo.
## Leave (proven: in-budget, reconciled, single-mode, non-dup)
- docs/reference/*.md.
```

**After `--write`:** per file — moves applied, read-time before→after, claims reconciled, links/commands checked, any `[TODO]`, files created/renamed/deleted with inbound links fixed.

## RELATED

- arch-roadmap · arch-api · arch-model · arch-diagram — author the comprehensive set this command curates.
- ops-clean — repo-wide hygiene beyond docs. · ops-doctor — source/registry/generated health. · boot-concept — when the *concept* is missing, not just the docs.

## NON-GOALS

- Not a generator of enterprise paperwork nothing reads: SRS/PRD/BRD/MRD/SDD/ICD/SPMP/formal-RFC are **on request only**.
- Not a content fabricator — writes from evidence, marks gaps.
- Not a timid pass — it does not leave drifted or duplicated docs in place, and it does not restrict itself to in-file edits when the layout is the problem.
- Not a style linter — it rewrites for clarity; leave mechanical lint to linters.
