## OBJECTIVE

**THE CONTEXT CANNON.**
Session memory is brittle. Durable memory lives in `AGENTS.md`; tactical memory lives in `.cursor/lessons.md`; live state lives in the repo.
**Your Goal**: Reload durable memory, active work, and code reality before touching anything.
**The Law**: Memory first. Architecture second. Hot files third.

## MEMORY MODEL

1. **Durable Memory**:
    - `AGENTS.md` stores stable user preferences and workspace facts.
2. **Tactical Memory**:
    - `.cursor/lessons.md` stores local anti-patterns, gotchas, and engineering lessons.
3. **Active State**:
    - `.cursor/mission.md`, `.cursor/review-log.md`, recent commits, and the working tree describe the current task.
4. **Plugin State**:
    - `.cursor/hooks/state/continual-learning*.json` is freshness/index metadata for the continual-learning plugin, not instruction content.

## PROTOCOL

### Phase 0: The Prime Directive (Anti-Hallucination)

*You are an intelligent agent, but you are not perfect. You must adhere to reality.*

1. **NO LYING**: If you don't know, ask. Never invent files, imports, or commands.
2. **NO LAZINESS**: Read the full file. Do not assume content.
3. **NO CHEATING**: Do not modify tests to pass code. Fix the code.
4. **NO STALE MEMORY**: Reload durable memory before planning. Do not trust recollection from earlier sessions.
5. **STRATEGY MASKING**: Do NOT hide your reasoning. Be explicit about *why* you are doing something.

### Phase 0.25: Memory Reload (Durable First)

*Load what survives the chat window before reading code.*

1. **Durable Agent Memory**:
    - Read `AGENTS.md` first (if it exists).
    - Prioritize `## Learned User Preferences` and `## Learned Workspace Facts`.
    - Treat those sections as the durable source of truth for stable preferences and workspace facts.
    - If `AGENTS.md` is mostly generated rule text, use the learned sections as the memory payload and load rule authority separately.
2. **Surface-Specific Rules**:
    - If `.cursor/rules/*.mdc` exists, treat it as authoritative over generated exports.
    - Otherwise read `GEMINI.md`, `CLAUDE.md`, and `.cursorrules` if they exist.
    - Use generated exports as agent-surface views, not as a substitute for durable learned memory or authoritative rule sources.
3. **Continual-Learning Health**:
    - If `.cursor/hooks/state/continual-learning.json` exists, inspect `lastRunAtMs`, `turnsSinceLastRun`, and related freshness signals.
    - If `.cursor/hooks/state/continual-learning-index.json` exists, note whether transcript indexing is active/recent.
    - Do **NOT** treat these JSON files as instructions; they are plugin-owned state.
4. **Tactical Lessons**:
    - Read `.cursor/lessons.md` (if it exists).
    - Use it for local anti-patterns, tooling gotchas, and immediate engineering lessons.
5. **Mission & Review State**:
    - Read `.cursor/mission.md` and `.cursor/review-log.md` if they exist.
    - **Output**: "Active mission: [Name]. Review state: [Pending/None]."

### Phase 0.5: Sanity & Repo Check

- Detect repository root (`git rev-parse --show-toplevel`) or note "not a git repo".
- Record runtime environment: OS, shell, CPU arch, and toolchain hints (uv/cargo/node present?).
- Prefer absolute paths in outputs; avoid echoing large code blocks — cite file paths.
- If durable memory conflicts with older notes, prefer `AGENTS.md` for stable behavior and use mission/review files for current-task overrides.

### Phase 1: The Project Skeleton (Architecture)

*Understand the shape before touching the clay.*

1. **Architecture Check**:
    - Read `docs/architecture.md` (if exists)
    - Read `docs/roadmap.md` (if exists)
    - **Output**: "Project uses [Stack]. Current phase: [Phase]."

2. **Dependency Inventory (Hallucination Check)**:
    - Read `package.json` / `Cargo.toml` / `pyproject.toml`.
    - **Rule**: If a library is NOT in these files, you CANNOT import it.
    - **Action**: List major deps (frameworks, ORMs). Ignore dev-deps for context summary.

3. **Convention Detection**:
    - Reuse the instruction files loaded in Phase 0.25.
    - Read `.editorconfig`, `tsconfig.json`, `eslint.config.js`
    - Also detect: `ruff.toml`, `.pre-commit-config.yaml`, `.dockerignore`, `docker-compose.yml`
    - **Output**: "Code style: [Style]. Strict mode: [Yes/No]."

### Phase 2: The Current Delta

*What changed most recently, and what is still in motion?*

1. **Recent Changes**:
    - Run `git log --oneline -10` (or read recent commits).
    - Run `git status --porcelain` (what's modified?).
    - **Output**: "Last commits: [Summary]. Uncommitted: [Files]."
2. **Working Surface**:
    - Identify which directories and files are actually hot right now.
    - Separate active work from stale residue.
3. **Memory Drift Check**:
    - If continual-learning state suggests pending transcript deltas, note that durable memory may lag recent chats.
    - **Action**: After finishing the task, capture durable changes with `ops-learn` or the continual-learning flow.

### Phase 3: The Hot Zones (Relevant Files)

*Load the specific areas we'll touch.*

1. **Target Files**:
    - If mission specifies files → Read them.
    - If user mentions files → Read them.
    - **Rule**: Read the WHOLE file, not snippets.

2. **Related Files (Dependency Graph)**:
    - Read direct imports/interfaces (1 level deep).
    - Read associated test files (`src/foo.ts` -> `tests/foo.spec.ts`).
    - **Cap**: Don't exceed 10 files in initial load.

### Phase 4: The Constraints (Non-Negotiables)

*What CAN'T we change?*

1. **API Contracts**:
    - Read `arch-api` or OpenAPI spec.
    - **Note**: External interfaces are frozen unless explicitly changing them.

2. **Data Models**:
    - Read `arch-model` or schema files.
    - **Note**: Breaking changes require migration plan.

## OUTPUT FORMAT

**The Context Report**

```markdown
# 🎯 CONTEXT LOADED

## Memory
- **Durable**: `AGENTS.md` loaded; learned preferences and workspace facts available
- **Surface Rules**: authoritative rule source loaded first; generated exports reused where present
- **Tactical**: `.cursor/lessons.md` loaded
- **Plugin State**: continual-learning active; memory freshness checked

## Project
- **Stack**: Node/TypeScript + PostgreSQL
- **Phase**: MVP (Phase 1)
- **Style**: ESM, strict TypeScript, Prettier
- **Containers**: docker compose detected; .dockerignore present

## Current Delta
- **Mission**: Implement user authentication
- **Status**: Spec written, implementation pending
- **Last Commit**: "feat: add user model" (2h ago)
- **Uncommitted**: src/auth/service.ts, tests/auth/login.spec.ts

## Tactical Lessons
- Don't use moment.js (use date-fns)
- Check manifest before importing
- PostgreSQL columns are case-insensitive

## Hot Files (Loaded)
- `src/auth/service.ts` (target)
- `src/auth/controller.ts` (target)
- `src/domain/models.ts` (reference)
- `tests/auth/login.spec.ts` (test)

## Constraints
- UserDTO shape is frozen (external API contract)
- PostgreSQL only (no switching to Mongo)

## Ready
Awaiting instruction.
```

## EXECUTION RULES

1. **ALWAYS RUN ON SESSION START**: First command of any coding session should be `context` or similar.
2. **MEMORY BEFORE CODE**: Load `AGENTS.md` learned sections → authoritative rules (if present) → generated surface rules → continual-learning state → `.cursor/lessons.md` → mission/review state before reading implementation files.
3. **REFRESH AFTER BREAKS**: If > 30 min since last interaction, reload context.
4. **SELECTIVE DEPTH**: For small tasks, light context. For major features, full context.
5. **NO ASSUMPTIONS**: If a file isn't loaded, don't guess its contents.
6. **REFERENCES OVER DUMPS**: Prefer citing file paths/sections over pasting large code blocks.
