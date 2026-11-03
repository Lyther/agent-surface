---
name: stellaris-implement
description: "Translate Stellaris mod designs into defensive Paradox Script."
---

## Objective

Translate a design (ADR) into high-quality, defensive Paradox Script (`.txt`). The engine is fragile: assume every scope is null, every target is missing, and every bracket is unbalanced until proven otherwise.

## Rules

1. Generate one file content block at a time.
2. Write the logic; never leave placeholders such as `# logic goes here`.
3. Indent with tabs (standard Paradox) or 4 spaces, consistently.

## 1. Files

Create the files in the manifest, all under `src/`, each starting with the standard header:

```pdx
# ==============================================================================
# MOD: [Mod Name]
# FILE: [Relative Path from src/]
# PURPOSE: [Brief Description]
# ==============================================================================
```

If a file contains `events`, its first functional line is `namespace = [NS]`, matching the project prefix defined in `init`.

## 2. Logic

Write PDX script from the `design` pseudocode:

1. Never run an effect on a scope without checking that it exists:

    ```pdx
    if = {
        limit = { exists = owner type = country }
        owner = { ... }
    }
    ```

2. Inside iterators (`every_system`, `random_planet`), always use `limit = { }` in the effect block to prevent scope leaks that affect the wrong target.
3. No magic numbers: a value used more than twice becomes a `@scripted_variables` entry, e.g. `cost = @[NS]_tier1_cost`, defined at the top of the file or in `common/scripted_variables`.
4. Never write raw English text in `title` or `desc`: `title = "[NS]_event_1_title" # TODO: LOC`.

## 3. Self-Check

Before output, verify:

1. `{` and `}` balance; an imbalance causes silent crashes.
2. No “curly quotes” exist; only standard ASCII `""`.
3. For every `add_modifier = [NS]_mod`, `common/modifiers/[NS]_modifiers.txt` is planned.

## Output

```pdx
# ==============================================================================
# MOD: Stellaris Expanded
# FILE: events/[NS]_anomaly_events.txt
# ==============================================================================

namespace = [NS]

# [NS].1 - The Discovery
country_event = {
    id = [NS].1
    title = "[NS]_event_1_title" # TODO: LOC
    desc = "[NS]_event_1_desc"   # TODO: LOC
    picture = GFX_evt_mining_station

    is_triggered_only = yes

    trigger = {
        exists = owner
        owner = { is_ai = no }
    }

    immediate = {
        owner = {
            log = "DEBUG: [NS].1 fired for [This.GetName]"
            add_resource = {
                minerals = @[NS]_reward_tier_1
            }
        }
    }

    option = {
        name = "[NS]_event_1_opt_a" # TODO: LOC
        custom_tooltip = "[NS]_event_1_opt_a_tt"
    }
}

```
