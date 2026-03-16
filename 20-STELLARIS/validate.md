# COMMAND: STELLARIS VALIDATE

# ALIAS: validate, check, sanity, doctor

## OBJECTIVE

**THE INSPECTOR**: Catch Stellaris-mod failures before launch: encoding, namespaces, scope, and performance landmines.

## PROTOCOL

### Phase 1: Inputs (Ask for paths)

Ask user for:

1. Mod repo root (contains `src/`).
2. Stellaris user dir (for logs): usually `~/Documents/Paradox Interactive/Stellaris/`.
3. Target namespace prefix `[NS]`.

### Phase 2: Encoding & Localisation (Hard Failures)

1. **BOM Law**:
    - Every `.yml` under `src/localisation/**` must be **UTF-8 with BOM**.
2. **Header Law**:
    - File must start with `l_english:` (or language-appropriate `l_x:`).
3. **Key Law**:
    - Keys must be `[NS]_...:0 "..."` (no missing `:0`).

### Phase 3: Script Integrity (Silent Crashes)

1. **Bracket Balance**:
    - If a file crashes load with no clear error, assume `{}` imbalance first.
2. **Curly Quotes**:
    - Reject any `“ ”` and `‘ ’` in `.txt/.gui/.yml`.
3. **Event Namespace**:
    - If file contains `*_event = { ... }`, require `namespace = [NS]` near top.

### Phase 4: Namespace Hygiene (Compatibility)

1. **IDs & Keys**:
    - Events: `id = [NS].###`
    - Flags/variables/modifiers/localisation keys: `[NS]_...`
2. **Soft Overrides**:
    - If the feature is a tweak, prefer `z_[NS]_*.txt` over overwriting vanilla filenames.

### Phase 5: Performance Kill-Switch

1. **BANNED HOT PATH**:
    - `any_pop` / `every_pop` / `every_ship` under frequent `on_actions` (daily/monthly) → reject and redesign.
2. **Fail Fast**:
    - Order triggers cheapest-to-expensive; short-circuit early.

## OUTPUT FORMAT

```markdown
## ✅ STELLARIS VALIDATION REPORT: [Mod Name] ([NS])

### Encoding
- [ ] localisation BOM ok
- [ ] localisation headers ok

### Script Integrity
- [ ] no curly quotes
- [ ] event namespace ok
- [ ] bracket balance ok

### Namespace Hygiene
- [ ] IDs/flags/vars/modifiers are `[NS]_...`
- [ ] no hard overwrites unless explicitly approved

### Performance
- [ ] no pop/ship iterators on daily/monthly hooks
```

## EXECUTION RULES

1. **No Guessing**: If paths aren’t provided, stop and ask.
2. **Hard Fail**: BOM violations and bracket imbalance are P0.
3. **Perf > Clever**: If it’s O(N) in a pulse, redesign to event-driven.
