## OBJECTIVE

**THE ARCHITECT**: User provides the vision (ingredients); You build the Michelin-star kitchen.
**Your Job**: Analyze the tech stack request and generate a deterministic, high-hygiene environment optimized for "Vibe Coding" (AI-assisted flow).
**The Output**: A repository ready for iterative AI-assisted development.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Rome wasn't built in one prompt context window.*

1. **Scaffold First**: Generate the folder structure and configuration files first. Do not generate source code yet.
2. **Batch Generation**: If creating a complex app, generate 5 files at a time.
3. **Prompt**: "Created config. Now creating `src/core`. Continue?"

## VIBE CODING FOUNDATION

This command creates the **context infrastructure** that enables smooth vibe coding:

- Clear file structure → AI understands where things go
- Consistent conventions → AI produces consistent code
- Mission tracking → AI maintains focus across iterations

## PROTOCOL

### Phase 1: Context & Structure (The Skeleton)

**Logic**: Create the physical directory layout.
**Constraint**: Root is for Configuration ONLY. Source code MUST remain isolated.

1. **Analyze Request**: Determine if this is a Monorepo, a standard app, or a library based on user input.
2. **Scaffold Directories**:
    - `src/`: The logic core.
    - `tests/`: The source of truth.
    - `docs/context/`: **CRITICAL**. Create this directory for raw context dumps.
    - `docs/architecture.md` & `docs/roadmap.md`: Create empty files if they don't exist.
    - `.cursor/`: For AI memory (`review-log.md`, `nuke-state.md`, `lessons.md`).
    - `scripts/`: For task automation.
3. **Docs naming**: kebab-case for docs (exceptions: `README.md`, `LICENSE`, `CHANGELOG.md`).
4. **No raw web assets** in source; UI stacks are Rust (Leptos) or Python (Reflex).

### Phase 2: Git Foundation

**Logic**: Ensure version control is strict and clean.

1. **Init**: Run `git init` if `.git` is missing.
2. **`.gitignore` Generation**:
    - **Action**: dynamically generate based on the detected languages (Rust/Python/Node).
    - **System Trash**: `.DS_Store`, `Thumbs.db`.
    - **Build Artifacts**: `target/`, `dist/`, `build/`, `node_modules/`, `venv/`, `__pycache__/`, `*.lock` (optional, depends on stack).
    - **Sensitive**: `.env`, `*.pem`, `*.key`, `secrets/`.
    - **AI & IDE Config** (MANDATORY — all of these):
        - `.idea/` (JetBrains)
        - `.vscode/` (VS Code local settings)
        - `.claude/` (Anthropic)
        - `.obsidian/` (Notes)
        - `.cursor/` (Cursor local)
        - `.gemini/` (Gemini local)
        - `.agent/` (Antigravity local)
        - `.cursorrules` (Cursor rules symlink)
        - `.geminirules` (Gemini rules symlink)
        - `.cursorignore` (Cursor ignore file)
        - `AGENTS.md` (Agentic rules)
        - `*.code-workspace` (Workspace file)
3. **Env Safety**:
    - If `.env` exists: **IMMEDIATELY CHECK** if it is in `.gitignore`. If not, STOP and warn the user.
    - Generate `.env.example` with dummy values for all keys found in `.env` (or expected keys). Generate a `.env.example.md` file with the dummy values.
4. **Add `LICENSE`**: Choose an explicit license.
5. **Add `README.md`**: Generate a README.md file with the project description, usage instructions, and any other relevant information.

### Phase 3: IDE Standardization (The Vibe)

**Logic**: Configure the editor to be the strict enforcer.

1. **`.editorconfig`**:
    - **Instruction**: Generate a file that enforces:
        - Global: `root=true`, UTF-8, LF, `insert_final_newline`, `trim_trailing_whitespace`, `indent_style=space`, `indent_size=4`.
        - **Overrides**: 2 spaces for Web/Config (JSON/YAML/HTML/JS/CSS); Tabs for Makefile/Go; 72 chars for git commit messages.
2. **`.cursorignore`**:
    - **Logic**: Exclude ONLY large files that waste context tokens. AI needs to see configs/secrets to avoid mistakes.
    - **Include**: lockfiles (`*.lock`, `package-lock.json`, `uv.lock`), build artifacts (`target/`, `dist/`, `node_modules/`, `venv/`, `__pycache__/`), large assets (`*.wasm`, `*.so`, `*.dylib`, media files).
    - **DO NOT exclude**: `.env`, secrets, IDE configs, workspace files — AI must see these to avoid committing them or duplicating config.
3. **`<project-name>.code-workspace`**:
    - Analyze the project’s code and manifests, then auto-generate or update a VS Code `.code-workspace` with: folders, search/files excludes, `formatOnSave`, per-language default formatters/linters, common build/test/lint tasks, and required launch configurations.
    - Output valid JSONC only.
4. **Agentic Rules (`.cursor/rules/` scaffolding)**:
    - **MANDATORY**: Scaffold `.cursor/rules/` in the target project with `.mdc` files.
    - **Source**: Copy templates from `~/.cursor/commands/.cursor/rules/*.mdc` as starting points.
    - **Cross-tool**: Generate `AGENTS.md` at project root (read by Cursor, Claude Code, Copilot, Gemini).
    - **Gemini/Antigravity**: `ln -sf ~/.cursor/commands/.geminirules ./.agent/rules/gemini-rules.md`
    - **Legacy**: If the project needs `.cursorrules` for older tooling, generate it from `.cursor/rules/` via `sync-commands.sh`.

### Phase 4: Entrypoint Standardization

**Logic**: Detect the language, enforce the ecosystem standard.

- **IF Rust**:
  - Ensure `Cargo.toml` exists.
  - Setup `clippy` in CI/hooks.
- **IF Python**:
  - **MANDATORY**: Use `uv` (Astral).
  - Run `uv init`.
  - Reject `requirements.txt` unless legacy constraints exist.
- **IF Web/Node**:
  - Require `package.json` with `"type": "module"`.
  - Scripts must include: `lint`, `format`, `test`.
  - Prefer `pnpm` or `bun` for speed.

### Phase 5: Automation & Hooks (The Robot)

**Logic**: Automation over documentation.

1. **Makefile / Taskfile**:
    - Create a unified interface for commands.
    - **Standard Targets**: `dev`, `build`, `test`, `lint`, `clean`.
    - **Map**: `make dev` -> `cargo run` or `uv run python main.py` or `npm run dev`.
2. **Pre-commit**:
    - Generate `.pre-commit-config.yaml`.
    - **Mandatory Hooks**: `trailing-whitespace`, `end-of-file-fixer`, `check-yaml`.
    - **Language Hooks**: `ruff` (Python), `fmt` (Rust), `prettier` (Web).
3. **Scaffold Project Rules**:
    - Copy `.cursor/rules/*.mdc` templates into the project's `.cursor/rules/`.
    - Generate `AGENTS.md` at project root for cross-tool compatibility.
    - Symlink `.geminirules` for Gemini: `ln -sf ~/.cursor/commands/.geminirules ./.agent/rules/gemini-rules.md`
4. **Customize if Needed**: Add project-specific rules in `.cursor/rules/` or `.agent/rules/` directories.

### Phase 6: Vibe Coding Infrastructure (The Brain)

**Logic**: Setup the "Context Injection" and "Verification" loops. Without this, the Agent is blind.

1. **Ensure `.cursor/` exists (Locally)**:
    - Create the folder so the user can drop private context files if needed.
2. **Create `docs/context/README.md`**:
    - **Content**: Insert a template explaining: "DUMP CONTEXT HERE. Paste raw requirements, emails, or brain dumps. The AI reads this folder to understand *Intent*."
3. **Bootstrap CI (Minimal)**:
    - **Action**: Generate `.github/workflows/ci.yml`.
    - **Logic**: "Fail Fast".
    - **Steps**: Checkout -> Setup Cache -> Lint (Strict) -> Test (Unit).
    - **Constraint**: Pin versions (e.g., `ubuntu-latest`, `actions/checkout@v4`). Don't use mutable tags.

### Phase 7: UI Target Scaffold (web | desktop | mobile)

**RULE**: One command set, multiple targets via `ui_target` flag. Approved UI stacks remain Rust (Leptos) or Python (Reflex). No raw JS/TS/CSS/HTML except minimal interop shims.

1. **Select Target**:
    - Default: `ui_target=web`
    - Supported: `web` | `desktop` | `mobile`
2. **Adapters**:
    - **desktop**: Tauri shell wrapping Leptos/Reflex app (WebView). Generate minimal Tauri config (app name, bundle identifiers), ignore platform-specific signing keys.
    - **mobile**: Prefer Tauri Mobile; fallback: Capacitor WebView hosting Leptos/Reflex build. Generate minimal Capacitor config if used.
3. **Tasks (Makefile additions)**:
    - `make dev:web` → run web dev server
    - `make dev:desktop` → tauri dev
    - `make dev:mobile` → mobile dev (emulator/simulator if available)
    - `make build:web` → web production build
    - `make build:desktop` → tauri build (creates installers)
    - `make build:mobile` → mobile build (platform toolchain required)
4. **Excludes & Packaging**:
    - Ensure `.cursorignore`/`.gitignore` exclude platform build artifacts (`src-tauri/target/`, `android/`, `ios/`, `dist/`).
    - Do not commit generated installers or store metadata.
5. **Security**:
    - Configure CSP consistent with app shell (no `'unsafe-inline'`).
    - No secrets in app bundle; runtime env injection only.

## EXECUTION RULES

1. **NO PLACEHOLDERS**: Write working skeleton code.
2. **SILENT FIXES**: If a config file is malformed, fix it. Don't ask.
3. **IDEMPOTENCY**: Running this command twice should not break anything; it should only ensure state compliance.
4. **TOKEN ECONOMY**: Do not generate massive boilerplate comments. Code explains itself.
5. **TRASH COLLECTION**: If `.claude`, `.vscode` exist, ensure they are in `.gitignore` immediately.
6. **DOCS**: Keep docs technical and tied to code.
