---
name: boot-new
phase: observe
description: "Bootstrap a new project from a user vision into a working structure."
---
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
4. **UI intent**:
    - Product UI default: Rust (Leptos) or Python (Reflex).
    - Internal admin/ops/review console default: React with the repo's existing stack; if greenfield and the user wants ByteDance-style frontend, prefer Arco or Semi with a Modern.js/Rsbuild/Rspack-compatible scaffold.
    - Existing repo: preserve the manifest-proven stack instead of migrating for taste.
    - Do not place raw web assets in source except minimal interop shims or repo-established frontend source files.

### Phase 2: Git Foundation

**Logic**: Ensure version control is strict and clean.

1. **Init**: Run `git init` if `.git` is missing.
2. **`.gitignore` Generation**:
    - **Action**: dynamically generate based on the detected languages (Rust/Python/Node).
    - **System Trash**: `.DS_Store`, `Thumbs.db`.
    - **Build Artifacts**: `target/`, `dist/`, `build/`, `node_modules/`, `venv/`, `__pycache__/`.
    - **Lockfiles**: do not globally ignore `*.lock`; commit lockfiles when the project ecosystem expects reproducible application installs. Ignore only generated lockfiles when explicit repo policy says so.
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
        - `.roorules`, `.clinerules`, `.traerules`, `.windsurfrules` (other tool-local overlays)
        - `.cursorignore` (Cursor ignore file)
        - Private/local-only agent overlays.
        - `*.code-workspace` (Workspace file)
    - **Portable Instructions**: Project policy decides whether `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or equivalent instruction files are committed. Private memory, local workflow state, and user-specific overlays are always ignored.
    - **Safety Check**: If a private/local-only agentic file is already tracked, stop and untrack it before proceeding.
3. **Env Safety**:
    - If `.env` exists: **IMMEDIATELY CHECK** if it is in `.gitignore`. If not, STOP and warn the user.
    - Generate `.env.example` with dummy values for all keys found in `.env` (or expected keys).
4. **Add `LICENSE`**: Choose an explicit license.
5. **Add `README.md`**: Generate a README.md file with the project description, usage instructions, and any other relevant information.

### Phase 3: IDE Standardization (The Vibe)

**Logic**: Configure the editor to be the strict enforcer.

1. **`.editorconfig`**:
    - **Instruction**: Generate a file that enforces:
        - Global: `root=true`, UTF-8, LF, `insert_final_newline`, `trim_trailing_whitespace`, `indent_style=space`, `indent_size=4`.
        - **Overrides**: 2 spaces for Web/Config (JSON/YAML/HTML/JS/CSS); Tabs for Makefile/Go; 72 chars for git commit messages.
2. **`.cursorignore`**:
    - **Logic**: Exclude large files and real secrets from agent context by default.
    - **Include**: lockfiles (`*.lock`, `package-lock.json`, `uv.lock`), build artifacts (`target/`, `dist/`, `node_modules/`, `venv/`, `__pycache__/`), large assets (`*.wasm`, `*.so`, `*.dylib`, media files).
    - **Always exclude**: `.env`, `.env.*` except `.env.example`, `secrets/`, `*.pem`, `*.key`, credential stores, private tokens, and local-only workflow state.
    - **Env shape**: use `.env.example`. If real env shape is required, inspect key names only with explicit user approval and redact values.
3. **`<project-name>.code-workspace`**:
    - Analyze the project’s code and manifests, then auto-generate or update a VS Code `.code-workspace` with: folders, search/files excludes, `formatOnSave`, per-language default formatters/linters, common build/test/lint tasks, and required launch configurations.
    - Output valid JSONC only.
4. **Agentic Rules (`.cursor/rules/` scaffolding)**:
    - **MANDATORY**: Scaffold `.cursor/rules/` in the target project with `.mdc` files.
    - **Source**: Copy or adapt templates from the active agent-surface `rules/*.mdc` policy sources when the target project needs local rule overlays.
    - **Cross-tool**: Generate `AGENTS.md` at project root for local cross-tool compatibility (gitignored).
    - **Gemini/Antigravity**: create local-only generated instruction overlays from the active agent-surface rules when the host needs them; keep those overlays gitignored.
    - **Legacy**: If the project needs `.cursorrules` for older tooling, generate it from the project-local `.cursor/rules/` overlay with the project's own script and keep it gitignored.
    - **Git Scope**: Treat all of these as local project overlays only. They belong in `.gitignore`, not in the remote repository.

### Phase 4: Entrypoint Standardization

**Logic**: Detect the language, enforce the ecosystem standard.

- **IF Rust**:
  - Ensure `Cargo.toml` exists.
  - Setup `clippy` in CI/hooks.
- **IF Python**:
  - **MANDATORY**: Use `uv` (Astral).
  - Run `uv init`.
  - Reject `requirements.txt` unless legacy constraints exist.
- **IF Go**:
  - Ensure `go.mod` exists; run `go mod init <module-path>` if missing.
  - **MANDATORY formatters**: `gofumpt` (stricter superset of gofmt) + `goimports` (import hygiene). Plain `gofmt` alone is insufficient.
  - **MANDATORY linter**: `golangci-lint` configured with the strict-linter recipe from `rules/12-go.mdc` (in agent-surface source, or the rendered host equivalent) — not the 6-linter minimum. The recipe enables `gosec`, `exhaustive`, `errorlint`, `gocritic`, `revive`, `unparam`, `bodyclose`, `contextcheck`, `nilerr`, `usestdlibvars`, `prealloc`, `dupl`, `goconst`, `unused`, plus complexity/cyclop/funlen/gocognit gates. For greenfield projects with no existing config, seed the project's `.golangci.yml` from that recipe verbatim; preserve any stricter config already present.
  - **MANDATORY security scanner**: `govulncheck` in CI, blocking on known-vuln dependencies.
  - **Pin**: record `go` toolchain line in `go.mod`; pin the golangci-lint CI action and linter version explicitly using the current v2-compatible action for new projects. Prefer the repo's existing pinned version when present.
  - **Excludes**: add `issues.exclude-dirs` for vendored fixtures (`tests/fixtures/`) so linter doesn't run on non-code YAML.
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
    - **Go hooks**: `gofumpt`, `goimports`, `go-mod-tidy`, `go-vet`, `golangci-lint`. Use the **active fork** `TekWizely/pre-commit-golang` — the older `dnephin/pre-commit-golang` is archived (upstream abandoned ~2023) and MUST NOT be used for new projects. If the active fork's hook set is insufficient, prefer a `local` hook that calls `make lint` directly rather than pulling in an archived dep.
    - **Commit message policy**: if Cursor or Claude Code injects attribution without the author's intent, generate a local hook that removes only those Cursor/Claude Code advertising trailers or signatures. Do not strip unrelated human co-authors or unrelated vendor names.
    - **Commit range policy**: if the project needs CI enforcement, generate a range checker that rejects the same Cursor/Claude Code attribution patterns. This protects against local hook drift without turning commit history checks into a broad vendor-name blocklist.
3. **Scaffold Project Rules**:
    - Copy or adapt policy templates from active agent-surface rules into the project's local rule overlay when needed.
    - Generate `AGENTS.md` at project root for local cross-tool compatibility.
    - Generate Gemini/Antigravity local-only overlays from the active policy sources when needed.
    - Keep all agentic rule files ignored and unstaged. They are for local assistant context, not remote source control.
4. **Customize if Needed**: Add project-specific rules in `.cursor/rules/` or `.agent/rules/` directories.

### Phase 6: Vibe Coding Infrastructure (The Brain)

**Logic**: Setup the "Context Injection" and "Verification" loops. Without this, the Agent is blind.

1. **Ensure `.cursor/` exists (Locally)**:
    - Create the folder so the user can drop private context files if needed.
    - Keep `.cursor/` gitignored. Local memory, lessons, and review notes must never be pushed.
    - If the workflow command set is used, `.agent-surface/workflows/<run_id>/` contains the canonical local-only handoff files. `.cursor/.workflow/` is Cursor compatibility only.
2. **Create `docs/context/README.md`**:
    - **Content**: Insert a template explaining: "DUMP CONTEXT HERE. Paste raw requirements, emails, or brain dumps. The AI reads this folder to understand *Intent*."
3. **Bootstrap CI (Minimal)**:
    - **Action**: Generate `.github/workflows/ci.yml`.
    - **Logic**: "Fail Fast".
    - **Steps**: Checkout with full history -> Check commit messages with `scripts/check-commit-range.sh` -> Setup Cache -> Lint (Strict) -> Test (Unit).
    - **Constraint**: Pin versions (for example `ubuntu-24.04` or the project-approved runner image, and pinned actions). Do not describe floating `latest` runner tags as pinned.
    - **GitHub Actions range check**: use `fetch-depth: 0`. For pull requests, check `origin/${GITHUB_BASE_REF}..HEAD`; for pushes, check `${{ github.event.before }}..HEAD` and fall back to `HEAD` when the before SHA is all zeros. This status check is mandatory for protected branches.

### Phase 7: UI Target Scaffold (web | desktop | mobile)

**RULE**: One command set, multiple targets via `ui_target`; one product shape via `ui_intent`.

Parameters:

```text
ui_target = web | desktop | mobile
ui_intent = product | admin-tool | existing
ui_library = arco | semi | repo-default
```

1. **Select Target**:
    - Default: `ui_target=web`
    - Supported: `web` | `desktop` | `mobile`
2. **Select Intent**:
    - `product`: Use Leptos/Reflex unless the user or repo policy chooses another stack.
    - `admin-tool`: For internal dashboards, review consoles, monitoring tools, and workflow control planes, use React with existing repo conventions. For greenfield ByteDance-style admin work, choose Arco or Semi; use Modern.js/Rsbuild/Rspack only when requested or already present.
    - `existing`: Read `package.json`, app routing, theme files, component library imports, table/data-fetching patterns, and tests. Preserve the current framework and library, including TanStack Table/Query or route-loader patterns when already present.
3. **Admin Tool Shape**:
    - Pages: List, Detail, Action.
    - List: filter form, table, pagination, status tag/badge, batch actions.
    - Detail: drawer or side panel with descriptions, tabs, logs/timeline, and evidence links.
    - Action: confirmation modal/form with visible state transitions and error handling.
    - State: URL query for filters/pagination/sort; server-state layer for remote data; local state only for transient UI.
    - Visualization: use VisActor (`VChart`/`VTable`) when dashboards or high-density analytical tables justify it.
4. **Adapters**:
    - **desktop**: Tauri shell wrapping Leptos/Reflex app (WebView). Generate minimal Tauri config (app name, bundle identifiers), ignore platform-specific signing keys.
    - **mobile**: Prefer Tauri Mobile; fallback: Capacitor WebView hosting Leptos/Reflex build. Generate minimal Capacitor config if used.
    - For admin-tool React shells, use desktop/mobile WebView only if the user explicitly needs it; do not create extra shells by default.
5. **Tasks (Makefile additions)**:
    - `make dev:web` → run web dev server
    - `make dev:desktop` → tauri dev
    - `make dev:mobile` → mobile dev (emulator/simulator if available)
    - `make build:web` → web production build
    - `make build:desktop` → tauri build (creates installers)
    - `make build:mobile` → mobile build (platform toolchain required)
6. **Excludes & Packaging**:
    - Ensure `.cursorignore`/`.gitignore` exclude platform build artifacts (`src-tauri/target/`, `android/`, `ios/`, `dist/`).
    - Do not commit generated installers or store metadata.
7. **Security**:
    - Configure CSP consistent with app shell (no `'unsafe-inline'`).
    - No secrets in app bundle; runtime env injection only.

## EXECUTION RULES

1. **NO PLACEHOLDERS**: Write working skeleton code.
2. **SILENT FIXES**: If a config file is malformed, fix it. Don't ask.
3. **IDEMPOTENCY**: Running this command twice should not break anything; it should only ensure state compliance.
4. **TOKEN ECONOMY**: Do not generate massive boilerplate comments. Code explains itself.
5. **TRASH COLLECTION**: If `.claude`, `.vscode` exist, ensure they are in `.gitignore` immediately.
6. **DOCS**: Keep docs technical and tied to code.
7. **LOCAL AI FILES ONLY**: Project AI files are allowed, but they must stay local-only and gitignored. Remote repos must not contain agentic rules, memories, or assistant-specific config.
