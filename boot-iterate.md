## OBJECTIVE

Iterate on a high-entropy, SOTA-level academic/project document: enhance strengths, fix weaknesses, and generate new ideas.

Hard requirement: ground changes with live web searches and current sources. Use `date` to check the current date.

## INPUTS (MANDATORY)

- Document path(s) to edit.
- Target audience (reviewers, customers, founders, engineers).
- Non-negotiables (claims that must remain, tone constraints, length limits).
- Output mode: rewrite-in-place or produce a patch/diff.

## PROTOCOL

### Phase 0: Guardrails (no hallucination)

1. Read the full document(s). No partial reads.
2. Separate content into:
   - “grounded claims” (can be verified),
   - “speculation/vision” (allowed but must be labeled),
   - “to-delete” (incorrect, redundant, or harmful).
3. Any factual claim you cannot verify with sources dated in the current year must be softened or removed.

### Phase 1: Build a change plan (high signal)

Produce a 1-page internal plan (not a wall of text):

- Document purpose in one line.
- 5–15 key claims.
- 5–15 biggest gaps (missing comparisons, missing proofs, missing experiments, confusing structure).
- 5–15 highest-leverage improvements (ordered).

### Phase 2: Web-grounding (must use latest info)

Rules:

- Treat your training cutoff as stale. Use web search for anything that smells “state of the art”.
- Prefer sources with explicit publication/update dates in the current year.
- For each key claim, find at least 2 sources (one primary if possible).
- Record the “as-of” date for every sourced statement.

Search procedure:

1. For each key claim, create 2–3 queries that include the year:
   - Prefer domain filters for primaries (`site:arxiv.org`, `site:acm.org`, `site:ieee.org`, `site:openreview.net`, vendor blogs with changelogs, official docs).
2. Read results. Discard undated, SEO spam, or unclear provenance.
3. Convert findings into:
   - corrections (what’s wrong/outdated),
   - upgrades (what’s better now),
   - deltas (what changed since older baselines),
   - citations (URL + title + date).

### Phase 3: Multi-agent iteration (required)

Run at least 3 iterations. Each iteration must be performed by different “agents” (roles). If you are a single agent, emulate the roles and keep outputs separate.

Agent roles:

- SCOUT: web-grounding, citations, “what changed in the current year”.
- CRITIC: attacks the doc (logic gaps, missing eval, hand-wavy parts, contradictions).
- BUILDER: proposes concrete fixes (restructure, new sections, experiments, diagrams, metrics).
- INVENTOR: introduces new ideas (novel angles, stronger framing, new benchmarks, new ablations).
- EDITOR: rewrites for clarity, cohesion, and consistent voice; removes fluff.

Iteration structure:

1. SCOUT produces a “sources + deltas” memo (dated current date).
2. CRITIC produces a “blockers + risks” memo.
3. BUILDER/INVENTOR produces a “changeset proposal” (section-by-section).
4. EDITOR applies changes to the document(s).
5. Repeat, but rotate which role leads.

Conflict resolution:

- If sources contradict, surface it and present both, then choose a safe phrasing.
- If a change is speculative, label it as such and keep it out of “claims”.

### Phase 4: Ship-quality pass

1. Structure:
   - tighten the thesis,
   - move “cool ideas” into a dedicated “Future Work / Extensions” section,
   - ensure every section earns its existence.
2. Evidence:
   - add missing comparisons,
   - add concrete experiment plans (datasets, metrics, baselines, compute, failure modes),
   - remove “SOTA” claims unless sourced.
3. Style:
   - remove hype adjectives,
   - replace vagueness with specifics,
   - keep paragraphs short, headings scannable.

## OUTPUT FORMAT

Deliver all of the following:

- Updated document(s) (or a patch/diff if requested).
- A “ChangeLog” section with:
  - what changed,
  - why (short, checkable rationale),
  - what is now grounded vs speculative.
- A “Sources (as of current date)” section:
  - each entry: title, URL, publication/update date, and a 1-line relevance note.

## EXECUTION RULES

1. Web searches must be date-aware (use the latest sources; include the year in queries).
2. No made-up citations. If you didn’t find it, you don’t cite it.
3. No “SOTA” or “state of the art” claims without explicit sources.
4. Iterate at least 3 times with distinct role outputs before finalizing.
