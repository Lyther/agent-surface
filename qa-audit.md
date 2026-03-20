## OBJECTIVE

**ENTROPY REDUCTION & TOTAL STERILIZATION.**
Codebases rot. Files accumulate like dust.
**REVIEW** checks the logic. **SEC** checks the locks. **AUDIT** takes out the trash.
**Your Goal**: Eliminate **Non-Code Garbage**, **Structural Rot**, and **Metadata Decay**.
**The Standard**: If a file cannot justify its existence, it is deleted. If a link is dead, it is flagged.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Don't list every file. Summarize the rot.*

1. **Summary Only**:
    - **Prompt**: "Scan `src/` for unused files. Return count and top 5 offenders, not the whole list."
2. **Focus Areas**:
    - "Audit `assets/` for unused images." (Targeted)

## VIBE CODING INTEGRATION

AI-assisted development generates unique garbage:

- Orphaned files from abandoned experiments
- Outdated configs from stack decisions that changed
- Dead imports and unused dependencies
- Stale documentation that doesn't match code
- "Chat residue" (verbose comments, overly defensive code)

## PROTOCOL

### Phase 1: The Filesystem Forensics (OS & Editor Artifacts)

*The ghosts of developers past. Kill them.*

1. **OS Garbage Collection**:
    - **Target**: `.DS_Store` (Mac), `Thumbs.db` (Windows), `desktop.ini`, `__pycache__` (if not ignored)
    - **Action**: **DELETE**. Then verify `.gitignore` prevents their return
    - *Note*: `.DS_Store` leaks directory structure. This is hygiene AND security
2. **Editor Detritus**:
    - **Target**: `.idea/`, `.vscode/` (unless strictly shared), `*.swp` (Vim), `*~` (Backup), `*.log`
    - **Action**: **DELETE**. These belong in your global gitignore, not the repo
3. **Empty Shells**:
    - **Scan**: Recursively find empty directories
    - **Action**: **DELETE**. Git doesn't track them; they are noise
4. **Permission Audit (The Executable Bit)**:
    - **Scan**: Find files with `chmod +x` (755)
    - **Rule**: If it is NOT a shell script (`.sh`, `.py`, `.pl`) or binary, **STRIP IT** (`chmod -x`)
    - *Constraint*: Markdown, JSON, and source code files should NEVER be executable

### Phase 2: The Script Hygiene (Shell Rot)

*Scripts are the duct tape of the repo. Inspect the tape.*

1. **Shebang & Mode Check**:
    - **Target**: All `*.sh` files
    - **Rule**: Must have `set -e` (Exit on error) and `set -o pipefail`
    - **Verdict**: Missing safety flags = **[UNSAFE]**. Flag it
2. **Path Hardcoding**:
    - **Grep**: `/home/`, `/Users/`, `/C:/`
    - **Verdict**: **[FRAGILE]**. Scripts must use relative paths (`$(dirname "$0")`) or env vars
3. **Interpreter Hygiene**:
    - **Check**: direct calls to `python` or `node`
    - **Action**: Suggest `python3` or `node` (version pinned) or `/usr/bin/env`
4. **One-off Scripts Ban**:
    - **Policy**: If a script is intended to run once, it should not live in repo (move to runbook/gist)

### Phase 3: The Documentation Rot (Link & Asset Sync)

*Docs that lie are worse than no docs.*

1. **Link Rot Analysis**:
    - **Scan**: Parse `README.md` and `docs/*.md`
    - **Action**: HTTP HEAD check on external links; file existence check on internal links
    - **Verdict**: 404 = **[DEAD LINK]**. Flag for removal
2. **Asset Integrity (The Orphanage)**:
    - **Scan A**: Find images (`![]()`) referenced in Markdown. Do they exist?
    - **Scan B**: Find files in `assets/` or `images/`. Are they referenced anywhere in the code/docs?
    - **Action**: Unreferenced assets = **[BLOAT]**. DELETE
3. **Docs Naming & Scope**:
    - **Rule**: kebab-case for docs (exceptions: `README.md`, `LICENSE`, `CHANGELOG.md`)
    - **Rule**: Avoid over-documentation; keep short, living docs tied to code

### Phase 4: The Configuration Orphanage (Project Bloat)

*Tools we stopped using 3 years ago but forgot to bury.*

1. **Orphaned Config Detection**:
    - **Scan**: `babel.config.js`, `tsconfig.json`, `.eslintrc`, `jest.config.js`, `.dockerignore`
    - **Cross-Check**: Is the corresponding tool (`babel`, `typescript`, `eslint`, `jest`, `docker`) in `package.json` or active?
    - **Action**: Config exists but tool is missing -> **DELETE**. It is a ghost
2. **Lockfile Sync**:
    - **Check**: Is `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `go.sum` older than `package.json` / `go.mod`?
    - **Verdict**: **[OUT OF SYNC]**. Recommend regeneration
3. **Build Artifact Exorcism**:
    - **Rule**: Never commit build artifacts (`dist/`, `build/`, `target/`); ensure `.gitignore` covers them

### Phase 5: The Git Hygiene (History & Branches)

1. **Large File Hunt**:
    - **Scan**: Files > 1MB committed to history (not LFS)
    - **Action**: **FLAG**. Recommend `git-filter-repo`
2. **Ignored-but-Tracked**:
    - **Cmd**: `git ls-files -i --exclude-standard`
    - **Meaning**: You ignored it, but you committed it anyway
    - **Action**: `git rm --cached`

### Phase 6: The Repository Vital Signs (Stats)

*Numbers don't lie. Patterns do.*

1. **Debt Counter**:
    - **Grep**: `TODO`, `FIXME`, `HACK`, `XXX`, `BUG`
    - **Action**: Count occurrences. High density = **[DEBT RISK]**
2. **File Naming Convention**:
    - **Scan**: Are filenames consistent? (e.g., all `kebab-case` or all `snake_case` per dir)
    - **Verdict**: Mixed casing = **[SLOPPY]**. Flag for rename
3. **Symlink Sanity**:
    - **Scan**: Find all symlinks (`find . -type l`)
    - **Check**: Do they point to valid targets?
    - **Action**: Broken link = **[DEAD LINK]**. DELETE

## OUTPUT FORMAT

**The Forensic Report**

```markdown
# 🧹 AUDIT REPORT: DIRTY

## 1. 🗑️ GARBAGE COLLECTION
- **[OS]** Deleted 4 `.DS_Store` files.
- **[Empty]** Removed `src/utils/legacy/` (empty dir).
- **[Perms]** Stripped +x from `README.md`, `src/utils.ts`.

## 2. 🧟 ZOMBIE FILES
- **[Orphan Config]** `.travis.yml` exists, but GitHub Actions is used. DELETE.
- **[Dead Asset]** `docs/img/old_architecture.png` is never referenced. DELETE.

## 3. 🕸️ DOC ROT
- **[404]** `README.md`: Link to "Demo" (http://demo.app) is dead.
- **[Broken Ref]** `CONTRIBUTING.md`: References `./scripts/setup.sh` which does not exist.

## 4. 🐚 SCRIPT HYGIENE
- **[Unsafe]** `scripts/deploy.sh` missing `set -e`.
- **[Hardcoded]** `scripts/init.sh` references `/Users/catherine/projects`.

## 5. 📉 VITAL SIGNS
- **[Debt]** Found 42 `TODO`s, 12 `FIXME`s. High debt in `src/auth/`.
- **[Naming]** Mixed casing in `src/components/`: `Button.tsx` vs `user_card.tsx`.

## VERDICT
**CLEANUP REQUIRED.**
Run `audit --fix` to auto-delete garbage and strip permissions.
Run `nuke` to perform deep cleaning of entire directories.
```

## EXECUTION RULES

1. **AUTO-FIX SAFE**: For OS artifacts (`.DS_Store`), Empty Dirs, and Permissions, you may auto-fix immediately
2. **AUTO-FIX UNSAFE**: For Dead Assets or Orphaned Configs, you MUST ask for confirmation before deletion
3. **BINARY EXCLUSION**: Do not scan `node_modules`, `target`, `vendor`, or `.git` internal directories
4. **NO LOGIC CHECKS**: Do not critique the code style. That is for `REVIEW`. Do not check for keys. That is for `SEC`. Only check for **existence validity**
5. **ALIGN RULES**: Enforce `.cursorrules` (no one-off scripts in repo; kebab-case docs; no raw web assets)
