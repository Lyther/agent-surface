---
name: stellaris-perf-audit
description: "Audit Stellaris mod performance without sacrificing clarity or AI behavior."
---

## Objective

Keep the mod smooth in the late game (year 2400+) without compromising accessibility: UI clarity and AI capability. Lag is a bug; prefer O(1) over O(N), and architectural shifts (events) over micro-optimizations. An optimization that breaks tooltips or AI behavior is a failure.

## Rules

1. Delete replaced slow code; never comment it out.
2. Add `# OPTIMIZATION:` comments explaining why complex triggers exist.
3. Always check whether the `on_action` supports C++ `pre_triggers` (e.g. `is_ai`, `host_has_dlc`), and use them.

## 1. Static Analysis

Scan `src/` for lag generators:

| Severity | Pattern | Context | Cost |
| :--- | :--- | :--- | :--- |
| CRITICAL | `any_pop` / `every_pop` | `on_daily` / `on_monthly` | Iterates 10k+ entities per tick; strictly banned. |
| CRITICAL | `any_ship` / `every_ship` | Global scope | Iterates 5k+ objects; use `any_owned_ship` instead. |
| HIGH | `mean_time_to_happen` | Common events | The engine evaluates probability constantly. |
| MEDIUM | `count_pop` / `count_x` | `trigger` | Expensive to count dynamically; cache in variables. |
| LOW | `log = "..."` | Loops | String I/O is slow; remove before shipping. |

## 2. Accessibility Guard

Before applying any fix, verify the feature's contract:

1. Tooltip integrity: replacing `count_pop > 10` with `var:pop_cache > 10` breaks the auto-generated tooltip (the player sees "Variable > 10"). Add `custom_tooltip = "[NS]_requires_10_pops"` whenever a trigger uses cached variables or complex optimizations.
2. AI capability: moving logic from `every_country` to `every_player` kills the feature for AI. Decide explicitly whether it is player-only; if not, use `limit = { is_ai = yes }` in the optimized loop.
3. Logic equivalence: when moving `MTTH = 120 months` to `on_yearly_pulse`, adjust the random weight (`random = 10`) to roughly match the original frequency.

## 3. Strategies

- Pulse shift (MTTH to deterministic): replace an event polling `mean_time_to_happen` daily with a hook on `on_yearly_pulse` (or `on_tech_researched`): 360 checks/year become 1 check/year.
- Short-circuiting: the engine evaluates triggers top to bottom, so fail fast by ordering them cheapest first: `is_ai = no` (boolean, instant), then `has_tech = x` (lookup, fast), then `any_planet = { ... }` (iterator, slow).
- Scope caching: instead of checking `count_pop` in a monthly economic script, write `[NS]_pop_var` only on `on_pop_growth` / `on_pop_decline` and read the variable in the monthly script.

## Output

```markdown
## PERF AUDIT: [NS]

### 1. Hotspots Detected
- 🔴 **CRITICAL**: `events/[NS]_economy.txt` uses `any_pop` in `on_monthly_pulse`.
- 🟡 **WARNING**: `[NS]_event_5` relies on legacy `mean_time_to_happen`.

### 2. Accessibility Verification
- [ ] **UI**: [NS]_event_5 tooltip relies on complex triggers.
- [ ] **Plan**: Wrap optimized triggers in `custom_tooltip` to preserve player info.

### 3. Refactor Plan
- **Action**: Refactor [NS]_economy to use `on_planet_survey` (Event-Driven).
- **Action**: Convert [NS]_event_5 to `on_yearly_pulse` with `random = 15`.
```
