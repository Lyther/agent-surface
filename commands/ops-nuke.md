## OBJECTIVE

**SAFE REPOSITORY CLEANUP.**
Produce a resumable cleanup plan for dead files, duplicates, generated artifacts, and stale dependencies. Default mode is dry-run only; deletion requires an explicit user-approved deletion manifest.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Iterative Review**:
    - **Do not** list 1000 files in one prompt.
    - Process one directory depth at a time.
    - **Prompt**: "Listing contents of `src/components`. What looks dead?"
2. **State Persistence**:
    - Write the plan to `.agent-surface/nuke/<run_id>.json` if workflow state is available, otherwise present it inline.
3. **Low-Resolution Scanning**:
    - Use `ls -R` or tree summaries initially.
    - Only read file *content* if the filename is ambiguous (e.g., `utils.ts` vs `old_utils.ts`).

## VIBE CODING INTEGRATION

AI generates cruft over time:

- Abandoned experiments that were never deleted
- Duplicate implementations from parallel attempts
- Dead code from refactoring that AI forgot to clean
- Phantom imports to packages never installed

## PROTOCOL

### Phase 0: Safeguards (Before You Delete)

1. **Dry-Run First**: Plan-only mode prints intended deletions and reasons; no writes.
2. **Protected Paths**: Never touch `.git/`, `node_modules/`, `target/`, `dist/`, build artifacts, or `.*` control dirs beyond logs.
3. **Branch Guard**: Refuse on `main`/`master` unless `--confirm`; recommend feature branch.
4. **Checkpoint**: Run `checkpoint` (tests green) before first destructive step.
5. **Symlink Safety**: Do not follow symlinks outside repo root.
6. **Approval Gate**: Do not delete, move, or uninstall anything until the user approves the deletion manifest after reviewing the dry-run.
7. **Dependency Gate**: Never uninstall dependencies automatically; propose manifest and lockfile changes with evidence.

### Phase 1: The Census (Initialize State)

1. **Check State**: Read `.agent-surface/nuke/<run_id>.json` if it exists.
      - *If Missing*: Generate a plan and present it before writing.
      - **Action**: Scan the entire repo (ignoring `node_modules`, `.git`, `dist`, `target`).
      - **Format**: Create a hierarchical checklist of EVERY folder.
      - **Mark**: All folders as `[PENDING]`.

### Phase 2: The Tribunal (Logic Extension)

*Add these sub-routines to the "Audit" step.*

**2.1 The Doppelgänger Protocol (Redundancy Detection)**
*Assume guilt until provenance is proven.*

1. **The Content Hash Check (Low Hanging Fruit)**:
    - **Action**: Calculate MD5/SHA checksums for all files in the current folder + children.
    - **Verdict**: If `Hash(A) == Hash(B)`:
        - **PROPOSE** one deletion with a per-file reason. Filename length or generic folder names are hints, not sufficient evidence.
2. **The Logic Clone Check (Semantic Redundancy)**:
    - **Scan**: Identify files with overlapping purposes (e.g., `dateUtils.ts` vs `timeHelper.ts`).
    - **Analyze**: Do they both export a function `formatDate`?
    - **Action**:
        - **MERGE**: Move unique functions from the "Helper" to the "Utils".
        - **REFACTOR**: Update all imports to point to the survivor.
        - **PROPOSE DELETE**: The empty shell of the loser, with import/use evidence.

**2.2 The Naming Hall of Shame (Heuristic Purge)**
*If the filename sounds like an apology, delete it.*

1. **Regex Execution**:
    - Target filenames matching: `/(copy|backup|old|new|temp|tmp|draft|v\d+|_v\d+)/i`.
    - **Example**: `userController_new.ts`, `api_v2_backup.js`.
    - **Action**: Mark as suspect in the manifest; never delete by filename heuristic alone.
    - **Exception**: Unless strictly required by routing (e.g., `/api/v1/user`).

### Phase 3: The Code Hygiene (Interior Decorating)

**3.1 The Commented-Out Graveyard**
*Code is for execution. Git is for history.*

1. **Scan**: Look for blocks of commented-out code > 3 lines.
2. **Verdict**:
    - Is it documentation? **KEEP**.
    - Is it dead logic? Propose deletion with proof that no live path imports or executes it.

**3.2 The "Barrel File" Trap**
*Stop creating mazes.*

1. **Scan**: `index.ts` / `index.js` files.
2. **Analyze**:
    - Does it contain *logic*? Or just `export * from './xyz'`?
    - If it just exports **ONE** file (e.g., `export * from './Button'`), it is a useless wrapper.
3. **Action**:
    - Propose deleting the `index.ts` only after imports and package exports are updated and verified.
    - **RENAME** `Button/Button.tsx` to `Button.tsx` (Flatten).
    - **UPDATE IMPORTS** accordingly.

### Phase 4: The Hallucination Check (Import Validation)

*Coding Agents often import libraries that don't exist or that you didn't install.*

1. **Ghost Dependency Scan**:
    - **Read**: `package.json` (dependencies & devDependencies).
    - **Scan**: All `import ... from 'package'` statements in `src/`.
    - **Verdict**:
        - If code imports `'moment'` but `moment` is not in `package.json`:
        - **CRITICAL ALERT**: "You are importing a ghost."
        - **Action**: **FAIL THE BUILD**. Do not auto-install. Force human decision.
2. **Unused Dependency purge**:
    - **Reverse Check**: If `lodash` is in `package.json` but **zero** files import it.
    - **Action**: **UNINSTALL**.

### Phase 5: The Smoke Test (Survival)

1. **Run**: `npm test` or `docker build . --target builder`.
2. **Failure?**:
      - If build fails, **RESTORE** the last batch from Git.
      - Mark folder as `[MANUAL_INTERVENTION]` in the log.

## OUTPUT FORMAT (The State File)

**File: `.agent-surface/nuke/<run_id>.json` or inline dry-run manifest**

```markdown
# ☢️ NUKE STATE LOG
> Status: IN PROGRESS
> Current Target: `src/components/auth/`

## 📂 Directory Audit Queue
- [x] `src/utils/` (Cleared)
    - 💀 Deleted: `date_formatter_old.ts` (Unused)
    - 💀 Deleted: `temp_test.js` (Trash)
- [ ] `src/components/auth/` <--- **CURRENT POINTER**
- [ ] `src/components/dashboard/`
- [ ] `scripts/`
- [ ] `ROOT`

## 🪦 The Graveyard (Summary)
- Total Files Deleted: 14
- Bytes Reclaimed: 240KB
- Dry-Run: true/false
```

## EXECUTION RULES

1. **NEVER IMPROVISE**: Read the log. Do the next step. Update the log. Stop.
2. **ONE STEP PER PROMPT**: Clean ONE folder per turn.
3. **GIT IS THE UNDO BUTTON**: Delete aggressively; revert if breakage.
4. **DRY-RUN BY DEFAULT**: Require explicit confirm flag to delete.
