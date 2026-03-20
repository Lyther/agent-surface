## OBJECTIVE

**THE CONTEXT CANNON.**
AI has no memory between sessions. You must reload the battlefield map every time.
**Your Goal**: Systematically load the project state into context for effective vibe coding.
**The Law**: Never assume. Always verify. Read before you write.

## PROTOCOL

### Phase 0: The Prime Directive (Anti-Hallucination)

*You are an intelligent agent, but you are not perfect. You must adhere to reality.*

1. **NO LYING**: If you don't know, ask. Never invent files, imports, or commands.
2. **NO LAZINESS**: Read the full file. Do not assume content.
3. **NO CHEATING**: Do not modify tests to pass code. Fix the code.
4. **STRATEGY MASKING**: Do NOT hide your reasoning. Be explicit about *why* you are doing something.

### Phase 0.5: Sanity & Repo Check

- Detect repository root (`git rev-parse --show-toplevel`) or note "not a git repo".
- Record runtime environment: OS, shell, CPU arch, and toolchain hints (uv/cargo/node present?).
- Prefer absolute paths in outputs; avoid echoing large code blocks — cite file paths.

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
    - Read `.cursorrules` (project-specific)
    - Read `.editorconfig`, `tsconfig.json`, `eslint.config.js`
    - Also detect: `ruff.toml`, `.pre-commit-config.yaml`, `.dockerignore`, `docker-compose.yml`
    - **Output**: "Code style: [Style]. Strict mode: [Yes/No]."

### Phase 2: The Active Mission (Current State)

*What are we working on RIGHT NOW?*

1. **Mission File**:
    - Read `.cursor/mission.md` (if exists)
    - **Output**: "Active mission: [Name]. Status: [Status]."

2. **Lessons Learned**:
    - Read `.cursor/lessons.md` (if exists)
    - **Note**: Known anti-patterns and gotchas for this codebase.

3. **Recent Changes**:
    - Run `git log --oneline -10` (or read recent commits).
    - Run `git status --porcelain` (what's modified?).
    - **Output**: "Last commits: [Summary]. Uncommitted: [Files]."

4. **Review State**:
    - Read `.cursor/review-log.md` (if exists).
    - **Note**: What's been reviewed, what's pending.

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

## WORKFLOW MAP

*Where are we in the cycle?*

```text
       [boot-new]
             ↓
[boot-context] → [arch-roadmap] → [arch-model] → [arch-api]
                                        ↓
                                  [arch-breakdown]
                                        ↓
                                  ┌→ [dev-feature] ──┐
                                  |       ↓          |
[ops-monitor] ← [ship-deploy]    | [verify-test]    |
     ↑                ↑          |       ↓          |
[ops-debug] ──→ [dev-fix] ───────┴─ [dev-refactor] ←┘
     ↑
 [qa-pentest]
```

## OUTPUT FORMAT

**The Context Report**

```markdown
# 🎯 CONTEXT LOADED

## Project
- **Stack**: Node/TypeScript + PostgreSQL
- **Phase**: MVP (Phase 1)
- **Style**: ESM, strict TypeScript, Prettier
- **Containers**: docker compose detected; .dockerignore present

## Current State
- **Mission**: Implement user authentication
- **Status**: Spec written, implementation pending
- **Last Commit**: "feat: add user model" (2h ago)
- **Uncommitted**: src/auth/service.ts, tests/auth/login.spec.ts

## Lessons (from .cursor/lessons.md)
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
2. **REFRESH AFTER BREAKS**: If > 30 min since last interaction, reload context.
3. **SELECTIVE DEPTH**: For small tasks, light context. For major features, full context.
4. **NO ASSUMPTIONS**: If a file isn't loaded, don't guess its contents.
5. **REFERENCES OVER DUMPS**: Prefer citing file paths/sections over pasting large code blocks.
