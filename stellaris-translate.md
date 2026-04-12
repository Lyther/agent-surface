## OBJECTIVE

**THE DIPLOMAT**: Manage Localisation (`.yml`) files with strict encoding discipline.
**Philosophy**: "Missing Localisation" is a bug. **UTF-8 with BOM** is the law. English is the "Source of Truth"; other languages fall back to English to prevent raw keys (e.g., `NS_event_title`) appearing in the UI.

## PROTOCOL

### Phase 1: Key Harvest (The Scan)

**Action**: Recursive scan of `src/` to identify potential keys.
**Target Patterns**:

1. **Explicit**: `title = "[NS]_key"`, `desc = "[NS]_key"`, `name = "[NS]_key"`, `text = "[NS]_key"`.
2. **Tagged**: Any line ending in `# TODO: LOC`.
3. **Modifiers**: Keys found in `common/modifiers` (e.g., `[NS]_mod_name`).
**Filter**: Ignore keys starting with `@` (Scripted Variables) or containing spaces (Raw Text).

### Phase 2: File Generation (Source of Truth)

**Action**: Generate `src/localisation/english/[namespace]_l_english.yml`.
**Format**:

```yaml
l_english:
 # Header
 [NS]_category_title:0 "Engineering"

 # Entry (Indented 1 space)
 [NS]_event_1_desc:0 "We have received a §Ystrange signal§! from [From.GetName]."
```

**Encoding**: Save as **UTF-8-SIG (with BOM)**.

### Phase 3: Multilingual Support (The English Flood)

**Input**: User Target Languages (or `all`).
**Strategy**: If translation is missing, **copy English text** to the target language file.
**Why**: It is better for a German player to see English text than `[NS]_event_desc`.

**Supported Languages Map**:

| Language | Folder Name | Header Key |
| :--- | :--- | :--- |
| **English** | `english` | `l_english:` |
| **Simp. Chinese** | `simp_chinese` | `l_simp_chinese:` |
| **Braz. Portuguese** | `braz_por` | `l_braz_por:` |
| **French** | `french` | `l_french:` |
| **German** | `german` | `l_german:` |
| **Polish** | `polish` | `l_polish:` |
| **Russian** | `russian` | `l_russian:` |
| **Spanish** | `spanish` | `l_spanish:` |
| **Japanese** | `japanese` | `l_japanese:` |
| **Korean** | `korean` | `l_korean:` |

### Phase 4: Encoding Enforcement (The BOM Guard)

**Critical Constraint**:

- **The Law**: Localisation files **MUST** be saved as **UTF-8-SIG (UTF-8 with BOM)**.
- **Consequence**: Without BOM, Stellaris ignores the file or renders garbage.
- **Action**: Remind user: "Run `python scripts/build.py` to enforce BOM encoding."

## OUTPUT TEMPLATE

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

## EXECUTION RULES

1. **Color Codes**: Use `§` (Section Sign). `§H` (Orange), `§Y` (Yellow), `§R` (Red), `§G` (Green), `§!` (Reset).
2. **Version Index**: Always use `:0` after the key.
3. **Quote Safety**: Escape inner quotes `\"`.
4. **Consistency**: One file per language code. Do not mix languages.
