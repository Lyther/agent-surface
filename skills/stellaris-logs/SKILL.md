---
name: stellaris-logs
description: "Turn Stellaris logs into deterministic fixes."
---

## Objective

Turn Stellaris logs into deterministic fixes for syntax, missing keys, wrong scopes, and broken localisation. Never edit logs; fix mod files in one loop at a time: apply the smallest fix, re-run, re-check `error.log`. Never guess syntax: vanilla outranks `ref/syntax_docs`, which outranks the web.

## 1. Evidence

Read only. Ask the user for `error.log` (required), `game.log` (optional), the mod root path (to map errors back to `src/`), and the Stellaris user dir (usually `~/Documents/Paradox Interactive/Stellaris/`).

## 2. Triage

Classify each error line into one bucket:

| Bucket | Typical log clue | Usual cause |
|--------|-------------------|-------------|
| Parse/Syntax | `Unexpected token` / `Malformed token` | `{}` imbalance, stray `=`, wrong nesting |
| Unknown Trigger/Effect | `Unknown trigger` / `Unknown effect` | typos, wrong scope, version mismatch |
| Missing Localisation | Key shows raw (`[NS]_foo`) | missing key, wrong file header, missing BOM |
| Duplicate Keys | `Duplicate key` | multiple defs loaded, soft override collision |
| Missing Asset | `Could not find texture` / `GFX_...` | `.gfx` not registered, wrong path/case |

## 3. Pinpoint

Use the file path and line references in the logs when present. If the logs are vague, search the mod repo for the failing key (`[NS]_...`), the failing id (`[NS].###`), or the missing asset name (`GFX_[NS]_...`).

## 4. Fix Patterns

- Missing localisation: ensure the `.yml` is UTF-8 with BOM and its header is correct (`l_english:` etc.), then add the missing key with `:0`.
- Unknown trigger/effect: verify the scope (country/planet/system/ship) and move logic if needed; cross-check `ref/syntax_docs` (if present) before inventing syntax.
- Parse errors: check bracket balance first, then smart quotes.

## Output

```markdown
## STELLARIS LOG REPORT

### Evidence
- `error.log`: [provided]
- `game.log`: [provided / missing]

### Findings
- 🔴 [Error line] → Victim: `src/...` → Fix: [one sentence]
- 🟡 [Warning line] → Victim: `src/...` → Fix: [one sentence]

### Next Run
- Re-launch game with only this mod enabled.
- Re-check `error.log` for regressions.
```
