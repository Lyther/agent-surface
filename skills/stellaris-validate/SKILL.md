---
name: stellaris-validate
description: "Catch Stellaris mod failures before launch."
---

## Objective

Catch Stellaris mod failures before launch: encoding, namespaces, scope, and performance landmines. BOM violations and bracket imbalance are P0 hard failures.

## 1. Inputs

Ask the user for the mod repo root (contains `src/`), the Stellaris user dir for logs (usually `~/Documents/Paradox Interactive/Stellaris/`), and the target namespace prefix `[NS]`. If paths aren't provided, stop and ask; never guess.

## 2. Encoding and Localisation (Hard Failures)

- Every `.yml` under `src/localisation/**` is UTF-8 with BOM.
- Each file starts with `l_english:` (or the language-appropriate `l_x:`).
- Keys are `[NS]_...:0 "..."`, never missing `:0`.

## 3. Script Integrity (Silent Crashes)

- If a file crashes load with no clear error, assume `{}` imbalance first.
- Reject any `“ ”` and `‘ ’` in `.txt/.gui/.yml`.
- If a file contains `*_event = { ... }`, require `namespace = [NS]` near the top.

## 4. Namespace Hygiene

- Events use `id = [NS].###`; flags, variables, modifiers, and localisation keys use `[NS]_...`.
- For a tweak, prefer `z_[NS]_*.txt` soft overrides over overwriting vanilla filenames.

## 5. Performance

- Reject `any_pop` / `every_pop` / `every_ship` under frequent `on_actions` (daily/monthly) and redesign; anything O(N) in a pulse becomes event-driven.
- Order triggers cheapest to most expensive and short-circuit early.

## Output

```markdown
## STELLARIS VALIDATION REPORT: [Mod Name] ([NS])

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
