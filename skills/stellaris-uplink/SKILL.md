---
name: stellaris-uplink
description: "Ingest and cross-reference Stellaris reference data."
---

## Objective

Before writing a single line, ingest gold-standard vanilla data and cross-reference it with the syntax submodule and reference mods. Never guess syntax: vanilla outranks the reference mod (ID 281990), which outranks the wiki.

## Rules

1. Read with absolute paths, but refer to relative paths (`common/...`) in conversation.
2. Always state the input scope explicitly (e.g. `root = country`).

## 1. Target Acquisition

For a feature request (e.g. "I want a Colossus that turns planets into Food"):

1. Read `.cursor/mod-context.json` for `stellaris_game_path` and `workshop_path`.
2. Find the closest existing mechanic in `[stellaris_game_path]/common` or `events`, reading `00_[feature].txt` first as the gold standard for structure.
3. For a complex feature, check `[workshop_path]/content/281990/[ModID]` (if available and configured) to see how other modders solved the specific problem, e.g. how they hooked the UI.

## 2. Syntax and Feasibility

1. Search `ref/syntax_docs` (the Stellaris syntax list) with `rg` for the triggers and effects found in vanilla, and verify scope compatibility (e.g. does `create_army` work in `planet` scope?).
2. When logic seems hardcoded or "too magical" (war, peace, pathfinding), search `site:stellaris.paradoxwikis.com [Keyword] conditions` and `site:forum.paradoxplaza.com [Keyword] hardcoded` to confirm whether `common/defines` limits exist or the change requires C++ access.

## Output

A concise feasibility and risk report in Markdown:

```markdown
## CONTEXT REPORT: [Feature Name]

### 1. Vanilla Prototype
- **File**: `common/[folder]/00_[file].txt`
- **Mechanism**: Uses `on_action` (Pulse) OR `mean_time_to_happen` (MTTH)?

### 2. Syntax Check
- **Scope**: [Planet / Country / Ship / System]
- **Hardcoded Limits**: [None Found / UI Locked / Logic Locked]

### 3. Implementation Strategy
- **Risk Level**: [🟢 Extension / 🟡 Soft Override / 🔴 Hard Overwrite]
- **Recommended Path**: [e.g., "Create common/scripted_effects/my_effect.txt and hook to on_tech_researched"]

```
