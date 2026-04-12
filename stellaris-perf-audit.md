## OBJECTIVE

**THE WATCHMAKER**: Ensure the mod runs smoothly in the Late Game (Year 2400+) without compromising **Accessibility** (UI Clarity & AI Capability).
**Philosophy**: **O(1) > O(N).** "Lag is a bug." Prioritize architectural shifts (Events) over micro-optimizations.
**Constraint**: **Accessibility First.** An optimization that breaks Tooltips or AI behavior is a failure.

## PROTOCOL

### Phase 1: Static Analysis (The Kill List)

**Action**: Scan `src/` for "Lag Generators".

| Severity | Pattern | Context | Why it Kills |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | `any_pop` / `every_pop` | `on_daily` / `on_monthly` | Iterates 10k+ entities/tick. **STRICTLY BANNED**. |
| **CRITICAL** | `any_ship` / `every_ship` | Global Scope | Iterates 5k+ objects. Use `any_owned_ship` instead. |
| **HIGH** | `mean_time_to_happen` | Common Events | The engine evaluates probability constantly. |
| **MEDIUM** | `count_pop` / `count_x` | `trigger` | Expensive to count dynamically. Cache in variables. |
| **LOW** | `log = "..."` | Loops | String I/O is slow. Remove before shipping. |

### Phase 2: Accessibility Guard (The Contract)

**Action**: Before applying any fix, verify the "Contract" of the feature.

1. **Tooltip Integrity (Player Accessibility)**:
    - **Risk**: Replacing `count_pop > 10` with `var:pop_cache > 10` breaks the auto-generated tooltip (Player sees "Variable > 10").
    - **Fix**: You **MUST** add `custom_tooltip = "[NS]_requires_10_pops"` whenever utilizing cached variables or complex optimizations in triggers.
2. **AI Capability (System Accessibility)**:
    - **Risk**: Moving logic from `every_country` to `every_player` kills the feature for AI.
    - **Fix**: Explicitly decide: Is this Player Only? If no, use `limit = { is_ai = yes }` in the optimized loop.
3. **Logic Equivalence**:
    - **Risk**: Moving `MTTH = 120 months` to `on_yearly_pulse`.
    - **Fix**: Adjust random weight (`random = 10`) to roughly match the original frequency.

### Phase 3: The Optimization Strategies

**Strategy A: The Pulse Shift (MTTH → Deterministic)**

- **Old**: Event polling `mean_time_to_happen` daily.
- **New**: Hook to `on_yearly_pulse` (or `on_tech_researched`).
- **Gain**: 360 checks/year → 1 check/year.

**Strategy B: Short-Circuiting (The Filter)**

- **Logic**: The Engine evaluates triggers Top-to-Bottom. Fail Fast.
- **Action**: Reorder triggers by cost (Cheapest First).
    1. `is_ai = no` (Boolean: Instant)
    2. `has_tech = x` (Lookup: Fast)
    3. `any_planet = { ... }` (Iterator: Slow)

**Strategy C: Scope Caching (The Snapshot)**

- **Scenario**: Checking `count_pop` in a monthly economic script.
- **Fix**:
    1. **Write**: Update `[NS]_pop_var` only on `on_pop_growth` / `on_pop_decline`.
    2. **Read**: Check variable in the monthly script.

## OUTPUT TEMPLATE (Audit Report)

```markdown
## ⏱️ PERF AUDIT: [NS]

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

## EXECUTION RULES

1. **No Ghost Code**: Delete old slow code. Do not comment it out.
2. **Explicit Intent**: Add `# OPTIMIZATION:` comments explaining why complex triggers exist.
3. **Pre-Triggers**: ALWAYS check if the `on_action` supports C++ `pre_triggers` (e.g., `is_ai`, `host_has_dlc`) and use them.
