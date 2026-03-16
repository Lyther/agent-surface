# COMMAND: STELLARIS DESIGN

# ALIAS: design, blueprint, plan, rfc

## OBJECTIVE

**THE STRATEGIST**: Conduct Cross-Analysis to provide deterministic implementation paths.
**Philosophy**: Compatibility is currency. Spend it wisely. Always prefer "Hooks" (`on_action`) over "Hacks" (Overwrites).

## PROTOCOL

### Phase 1: The Implementation Matrix

**Action**: Present 3 distinct paths for the requested feature.

| Path | Strategy | File Pattern | Pros | Cons |
| :--- | :--- | :--- | :--- | :--- |
| **A. The Extension (Green)** | Additive | `common/` + `on_action` | **100% Compatible**. Survives updates. | Limited triggers. Cannot change base logic. |
| **B. The Soft Override (Yellow)** | Value Merge | `z_[NS]_[VanillaName].txt` | Merges keys via load order. Good for tweaking defines. | **Load Order Wars**. Hard to debug "Double Entry" bugs. |
| **C. The Nuclear Option (Red)** | Hard Overwrite | Same filename as Vanilla | **Total Control**. Replaces core logic. | **Incompatible**. Requires manual merge every patch. |

**Decision Logic**:

- Default to **Path A**.
- Use **Path B** only for `defines`, `map_modes`, or `name_lists`.
- Use **Path C** only for total conversions or modifying hardcoded AI logic.

### Phase 2: Technical Specification

**Input**: Selected Path.
**Action**: Define the Engineering Constraints.

1. **Scope Chain (The Physics)**:
    - **ROOT**: The Origin (e.g., Country, Pop).
    - **FROM**: The Target (e.g., Planet, System).
    - **Filter**: `limit = { is_ai = no }` (Performance Guard).
2. **Data Persistence (The Memory)**:
    - **Flags**: `set_country_flag = [NS]_flag_name`.
    - **Variables**: `set_variable = { which = [NS]_var value = 1 }`.
    - **Constraint**: ALL keys must use the Project Namespace.
3. **Performance Budget (The Audit)**:
    - **Pulse Check**: Is this running on `on_daily_pulse`? -> **REJECT**.
    - **Loop Check**: Does it use `any_pop` or `every_ship`? -> **REJECT** or move to `on_yearly_pulse`.
    - **Optimization**: Can we use `on_tech_researched` instead of checking every month?

### Phase 3: The Architecture Decision Record (ADR)

**Output**: A Design Document in `docs/design/[feature].md` (or chat snippet).

```markdown
## 📐 ADR: [Feature Name]
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

## EXECUTION RULES

1. **Namespace Enforcer**: Fail generation if a flag/variable is generic (e.g., `set_global_flag = story_started`).
2. **Magic Numbers**: Enforce `@scripted_variables` for all balance values.
3. **Safety First**: Always include `exists = scope` in logic chains.
