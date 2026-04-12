## OBJECTIVE

**THE ARCHITECT**: Initialize a professional "Source-to-Distribution" Stellaris modding environment.
**Philosophy**: We separate "Raw Code" (Source) from "Game Ready" (Dist) to enable automated hygiene (BOM encoding, cleanup).

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Scaffold First**: Generate folder structure + config first. No content files unless asked.
2. **Atomic Setup**: After scaffold, stop and ask before generating `scripts/build.py`.
3. **Idempotent**: Running init twice should only enforce state, not destroy work.

## VIBE CODING FOUNDATION

This command creates the mod repo structure so future `design` → `implement` → `translate` runs are deterministic.

## PROTOCOL

### Phase 1: Context & Metadata

**Input**: Ask user for:

1. `Mod Name` (Display Name).
2. `Namespace Prefix` (2-5 characters, unique, e.g., `TECH`, `VOID`).
3. `Stellaris User Directory`:
    - Windows: `%USERPROFILE%\Documents\Paradox Interactive\Stellaris\mod`
    - macOS/Linux: `~/Documents/Paradox Interactive/Stellaris/mod`
4. `Stellaris Game Install Path` (for `uplink` / vanilla reference) (optional but recommended).
5. `Steam Workshop Path` (for reference mods) (optional).

### Phase 2: The Scaffold (Source-Dist Separation)

1. **Directory Structure**:
    - `src/`: The workspace.
        - `common/`, `events/`, `interface/`, `gfx/`, `localisation/english/`.
    - `dist/`: The build output (Gitignored).
    - `scripts/`: Automation tools.
    - `ref/`: Context storage.
    - `.cursor/`: Local AI scratchpad (Gitignored).
2. **Git Setup**:
    - `git init` (if missing).
    - `.gitignore`: Add `dist/`, `*.log`, `.DS_Store`, `Thumbs.db`, `__pycache__/`, `.vscode/`, `.cursor/`, `.cursorrules`, `*.code-workspace`.
    - **Submodule**: `git submodule add https://github.com/OldEnt/stellaris-triggers-modifiers-effects-list.git ref/syntax_docs`.

### Phase 3: The Toolchain (scripts/build.py)

**Action**: Generate a robust Python script (`scripts/build.py`) that:

1. **Cleans**: Wipes `dist/` before build.
2. **Copies**: Recursively copies `src/` to `dist/`.
3. **Enforces Encoding**:
    - Detects `.yml` files in `localisation/`.
    - **Forces save as UTF-8-SIG (BOM)**.
4. **Sanitizes**: Removes dev files (`.psd`, `.gitkeep`).
5. **Installs**: Copies `descriptor.mod` to the Stellaris User Directory (from Phase 1 input).

### Phase 4: Configuration & Linking

1. **Generate `src/descriptor.mod`**, example:

    ```text
    version="0.1.0"
    tags={ "Gameplay" "Balance" }
    name="[Mod Name]"
    supported_version="v4.2.*"
    ```

2. **Generate `.cursor/mod-context.json`** (Gitignored): Store the prefix and paths:
    - `namespace_prefix`
    - `stellaris_user_dir`
    - `stellaris_game_path` (if provided)
    - `workshop_path` (if provided)
3. **Create Workspace File**:
    - **File**: `[mod-name].code-workspace`
    - **Include**:
        - Root folder
        - Search excludes: `dist/`, `.git/`, `ref/syntax_docs/`
        - Formatting defaults (no raw web assets; this is a mod repo)
        - Tasks (optional): `build` → `python scripts/build.py`
4. **Symlink Rules**:
    - **Goal**: Use Clausewitz rules for the mod repo (not the global default rules).
    - **Windows (PowerShell)**:
        - **Copy (always works)**: `Copy-Item -Force "$env:USERPROFILE\.cursor\commands\.stellarisrules" ".cursorrules"`
        - **Symlink (requires Developer Mode or admin)**: `New-Item -ItemType SymbolicLink -Path ".cursorrules" -Target "$env:USERPROFILE\.cursor\commands\.stellarisrules" -Force`
    - **macOS/Linux**: `ln -sf ~/.cursor/commands/.stellarisrules .cursorrules`
    - **Result**: Enforces Clausewitz strictness locally in the mod repo.

## EXECUTION RULES

1. **No Dummy Content**: Do not generate empty event files unless asked.
2. **Build Script**: Must be standalone (stdlib only).
3. **Namespace Check**: Warn if prefix is >5 characters (efficiency).
