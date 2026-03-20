## OBJECTIVE

**THE ATOMIC SURGEON.**
Git history is a story, not a dump.
**Your Job**: Dissect current changes into logical, atomic units.
**The Enemy**: "WIP", "Update files", `git commit -a -m "fix"`.
**The Law**: If I cannot revert a specific feature without breaking unrelated changes, YOU FAILED.
**Critical Note**: Most of the git commands are interactive, if you can't input/output the terminal, you should use pipe commands to avoid the interactive mode.

## VIBE CODING INTEGRATION

This is the **checkpoint** in the iteration loop:

```text
spec → feature → test → COMMIT → next iteration
```

Commit frequently. Atomic commits enable easy rollback and bisection.

## PROTOCOL

### Phase 1: Pre-Flight Hygiene

*Don't wait for pre-commit hook to fail. Fix first.*

1. **Format & Lint**:

    ```bash
    npm run format  # or cargo fmt, ruff format
    npm run lint    # or cargo clippy, ruff check
    ```

    If these change files → FIX NOW before proceeding

2. **Untracked Files**:

    ```bash
    git status
    ```

    New files? Decide: Keep (add) or Trash (delete/ignore)

3. **Tests**:
    - Run focused tests for touched areas; ensure green

### Phase 2: Classification

*Read the diff. Understand the diff.*

1. **Scan Changes**:

    ```bash
    git diff --name-only
    ```

2. **Bucket Sorting**:

    | Bucket | Files | Commit Type |
    |--------|-------|-------------|
    | **A: Config** | `package.json`, `Dockerfile` | `chore:` |
    | **B: Docs** | `README.md`, `docs/*` | `docs:` |
    | **C: Logic** | `src/*` features/fixes | `feat:` or `fix:` |
    | **D: Refactor** | Renames, style changes | `refactor:` |
    | **E: Tests** | Spec-only changes | `test:` |

3. **Conflict Check**:
    - Does Bucket C contain TWO unrelated features?
    - If yes → Split into `C1` and `C2`

### Phase 3: Atomic Execution

**Loop for each bucket**:

1. **Stage**: `git add [FILES_IN_BUCKET]`
    - ⛔ NEVER use `git add .` or `git add -A`

2. **Craft Message** (Conventional Commits):

    | Type | Usage |
    |------|-------|
    | `feat:` | New capability |
    | `fix:` | Bug fix |
    | `docs:` | Documentation only |
    | `chore:` | Config, build, deps |
    | `refactor:` | Code change, same behavior |
    | `test:` | Test only changes |
    | `perf:` | Performance improvement |

    **Format**:

    ```text
    type(scope): subject (<50 chars, imperative)

    [optional body explaining WHY]

    [optional footer: Fixes #123]
    ```

3. **Sign & Commit**:

    ```bash
    git commit -S -m "type(scope): subject"
    ```

4. **Handle Hook Failure**:
    - Read error → Fix file → Re-add → Retry
    - ⛔ NEVER use `--no-verify`

### Phase 4: Push

1. **Rebase Check**:

    ```bash
    git fetch origin main
    git rebase origin/main  # Don't create merge commits for sync
    ```

2. **Push**:

    ```bash
    git push
    ```

3. **PR Hygiene**:
    - Small PRs (≤ 400 LOC), clear description, link mission/spec

## OUTPUT FORMAT

**The Commit Log**

```markdown
# 📦 COMMIT PLAN

## 1. Chore (Config)
- **Files**: `package.json`, `package-lock.json`
- **Message**: `chore(deps): update axios to 1.6.0`

## 2. Feature (Main Work)
- **Files**: `src/auth/login.ts`, `src/auth/types.ts`
- **Message**: `feat(auth): implement JWT validation`

## 3. Test (Verification)
- **Files**: `tests/auth/login.spec.ts`
- **Message**: `test(auth): add login flow tests`

## Execution
```bash
git add package.json package-lock.json
git commit -S -m "chore(deps): update axios to 1.6.0"

git add src/auth/
git commit -S -m "feat(auth): implement JWT validation"

git add tests/auth/
git commit -S -m "test(auth): add login flow tests"

git push
```

## EXECUTION RULES

1. **ATOMICITY**: Unrelated changes = Separate commits. Always.
2. **NO WIP**: Not done? Use `git stash`. Don't commit "WIP".
3. **EXPLAIN WHY**: Complex diff → Body is mandatory.
4. **PRE-COMMIT RESPECT**: Hook complains → Fix the issue.
5. **IMPERATIVE MOOD**: "Add X", not "Added X" or "Adds X".
6. **SIGNED COMMITS**: All commits must be signed and verifiable.

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| `git add .` | Explicit file staging |
| `git commit -a` | Selective staging |
| `--no-verify` | Fixing hook issues |
| "WIP" commits | Stash or complete work |
| "Fix stuff" messages | Descriptive messages |
| Mixing unrelated changes | Atomic commits |
