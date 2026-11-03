---
name: stellaris-init
description: "Initialize a source-to-distribution Stellaris modding environment."
---

## Objective

Initialize a Stellaris mod repository that separates source (`src/`) from game-ready output (`dist/`), so a build step can enforce hygiene such as BOM encoding and cleanup.

## Rules

1. Scaffold folders and config first; generate no content files, including empty event files, unless asked.
2. After the scaffold, stop and ask before generating `scripts/build.py`.
3. Stay idempotent: running init twice only enforces state and never destroys work.
4. Keep assistant files local: `.cursor/`, `.cursor/mod-context.json`, `.cursorrules`, and any other assistant-specific overlays stay gitignored and are never committed or pushed.

## 1. Inputs

Ask the user for:

1. Mod name (display name).
2. Namespace prefix: 2-5 characters, unique, e.g. `TECH`, `VOID`. Warn when it exceeds 5 characters.
3. Stellaris user directory: Windows `%USERPROFILE%\Documents\Paradox Interactive\Stellaris\mod`; macOS/Linux `~/Documents/Paradox Interactive/Stellaris/mod`.
4. Stellaris game install path, for `uplink` and vanilla reference (optional but recommended).
5. Steam Workshop path, for reference mods (optional).

## 2. Scaffold

- Create `src/` (the workspace) with `common/`, `events/`, `interface/`, `gfx/`, `localisation/english/`; `dist/` (build output, gitignored); `scripts/` (automation); `ref/` (context storage); and `.cursor/` (local AI scratchpad, gitignored).
- Run `git init` if the repository is missing.
- Add to `.gitignore`: `dist/`, `*.log`, `.DS_Store`, `Thumbs.db`, `__pycache__/`, `.vscode/`, `.cursor/`, `.claude/`, `.gemini/`, `.agent/`, `.cursorrules`, `.geminirules`, `.roorules`, `.clinerules`, `.traerules`, `.windsurfrules`, `.stellarisrules`, `.cursorignore`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `*.code-workspace`.
- Add the syntax reference: `git submodule add https://github.com/OldEnt/stellaris-triggers-modifiers-effects-list.git ref/syntax_docs`.

## 3. Build Script

`scripts/build.py` is standalone (stdlib only) and:

1. Wipes `dist/` before the build.
2. Copies `src/` to `dist/` recursively.
3. Saves every `.yml` file in `localisation/` as UTF-8-SIG (BOM).
4. Removes dev files (`.psd`, `.gitkeep`).
5. Copies `descriptor.mod` to the Stellaris user directory from the inputs.

## 4. Configuration and Linking

1. Generate `src/descriptor.mod`, for example:

    ```text
    version="0.1.0"
    tags={ "Gameplay" "Balance" }
    name="[Mod Name]"
    supported_version="v4.2.*"
    ```

2. Generate `.cursor/mod-context.json` (gitignored, local-only assistant context, never committed) storing `namespace_prefix`, `stellaris_user_dir`, and, if provided, `stellaris_game_path` and `workshop_path`.
3. Create `[mod-name].code-workspace` with the root folder, search excludes `dist/`, `.git/`, `ref/syntax_docs/`, formatting defaults (no raw web assets; this is a mod repo), and optionally a `build` task running `python scripts/build.py`.
4. Link the Clausewitz rules into the mod repo, instead of the global default rules, as a local-only, gitignored file that enforces Clausewitz strictness:
    - Windows (PowerShell) copy, always works: `Copy-Item -Force "$env:USERPROFILE\.cursor\commands\.stellarisrules" ".cursorrules"`
    - Windows symlink, requires Developer Mode or admin: `New-Item -ItemType SymbolicLink -Path ".cursorrules" -Target "$env:USERPROFILE\.cursor\commands\.stellarisrules" -Force`
    - macOS/Linux: `ln -sf ~/.cursor/commands/.stellarisrules .cursorrules`
