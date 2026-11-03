---
name: stellaris-translate
description: "Manage Stellaris localisation files with strict encoding discipline."
---

## Objective

Manage localisation (`.yml`) files with strict encoding discipline. Missing localisation is a bug, and UTF-8 with BOM is mandatory. English is the source of truth; other languages fall back to English so raw keys (e.g. `NS_event_title`) never appear in the UI.

## Rules

1. Save localisation files as UTF-8-SIG (UTF-8 with BOM); without the BOM, Stellaris ignores the file or renders garbage. Remind the user: "Run `python scripts/build.py` to enforce BOM encoding."
2. Color codes use `§` (Section Sign). `§H` (Orange), `§Y` (Yellow), `§R` (Red), `§G` (Green), `§!` (Reset).
3. Always use the version index `:0` after the key.
4. Escape inner quotes as `\"`.
5. Keep one file per language code; never mix languages.

## 1. Harvest Keys

Scan `src/` recursively for potential keys:

1. Explicit: `title = "[NS]_key"`, `desc = "[NS]_key"`, `name = "[NS]_key"`, `text = "[NS]_key"`.
2. Tagged: any line ending in `# TODO: LOC`.
3. Modifiers: keys found in `common/modifiers` (e.g. `[NS]_mod_name`).

Ignore keys starting with `@` (scripted variables) or containing spaces (raw text).

## 2. English Source

Generate `src/localisation/english/[namespace]_l_english.yml`:

```yaml
l_english:
 # Header
 [NS]_category_title:0 "Engineering"

 # Entry (Indented 1 space)
 [NS]_event_1_desc:0 "We have received a §Ystrange signal§! from [From.GetName]."
```

## 3. Other Languages

For the user's target languages (or `all`), copy the English text into the target language file wherever a translation is missing; a German player should see English text, not `[NS]_event_desc`.

| Language | Folder | Header key |
| :--- | :--- | :--- |
| English | `english` | `l_english:` |
| Simp. Chinese | `simp_chinese` | `l_simp_chinese:` |
| Braz. Portuguese | `braz_por` | `l_braz_por:` |
| French | `french` | `l_french:` |
| German | `german` | `l_german:` |
| Polish | `polish` | `l_polish:` |
| Russian | `russian` | `l_russian:` |
| Spanish | `spanish` | `l_spanish:` |
| Japanese | `japanese` | `l_japanese:` |
| Korean | `korean` | `l_korean:` |

## Output

```yaml
l_english:
 # ==========================================
 # MOD: [Mod Name]
 # LANG: English
 # ==========================================

 # --- Events ---
 [NS]_anomaly_success:0 "Anomaly Found"
 [NS]_anomaly_success_desc:0 "Science Officer [Root.GetLeaderName] reports success."

 # --- Modifiers ---
 [NS]_mod_stability_add:0 "Bureaucratic Efficiency"
 [NS]_mod_stability_add_desc:0 "Pop output increased by §G10%§!."
```
