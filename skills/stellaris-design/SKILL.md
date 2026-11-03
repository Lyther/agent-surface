---
name: stellaris-design
description: "Design deterministic implementation paths for Stellaris mods."
---

## Objective

Cross-analyze implementation options and give a deterministic implementation path. Compatibility is currency: prefer hooks (`on_action`) over hacks (overwrites).

## Rules

1. Every flag and variable key uses the project namespace; fail generation when one is generic (e.g. `set_global_flag = story_started`).
2. Use `@scripted_variables` for all balance values.
3. Always include `exists = scope` in logic chains.

## 1. Implementation Matrix

Present 3 distinct paths for the requested feature:

| Path | Strategy | File pattern | Pros | Cons |
| :--- | :--- | :--- | :--- | :--- |
| A. The Extension (Green) | Additive | `common/` + `on_action` | 100% Compatible. Survives updates. | Limited triggers. Cannot change base logic. |
| B. The Soft Override (Yellow) | Value Merge | `z_[NS]_[VanillaName].txt` | Merges keys via load order. Good for tweaking defines. | Load Order Wars. Hard to debug "Double Entry" bugs. |
| C. The Nuclear Option (Red) | Hard Overwrite | Same filename as Vanilla | Total Control. Replaces core logic. | Incompatible. Requires manual merge every patch. |

Default to path A. Use path B only for `defines`, `map_modes`, or `name_lists`, and path C only for total conversions or modifying hardcoded AI logic.

## 2. Technical Specification

For the selected path, define the engineering constraints:

1. Scope chain: ROOT is the origin (e.g. country, pop); FROM is the target (e.g. planet, system); filter with `limit = { is_ai = no }` as a performance guard.
2. Persistence: flags as `set_country_flag = [NS]_flag_name`, variables as `set_variable = { which = [NS]_var value = 1 }`.
3. Performance budget: reject anything running on `on_daily_pulse`; reject anything using `any_pop` or `every_ship`, or move it to `on_yearly_pulse`; use `on_tech_researched` instead of a monthly check where possible.

## Output

An ADR in `docs/design/[feature].md` (or a chat snippet):

```markdown
## ADR: [Feature Name]
> Path: [A/B/C] | Namespace: [NS]

### 1. Logic Flow (Pseudocode)
TRIGGER: `on_entering_system`
LIMIT: `exists = owner` AND `owner = { is_ai = no }`
EFFECT:
  Scope to System
  If `has_star_flag = [NS]_visited`: STOP
  Else: Fire Event `[NS].100`

### 2. File Manifest
- `src/common/scripted_effects/[NS]_effects.txt`
- `src/events/[NS]_exploration_events.txt`

### 3. Data Schema
- Flag: `[NS]_system_visited` (Prevent spam)
- Variable: `@[NS]_spawn_chance = 50` (Scripted Variable)

```
