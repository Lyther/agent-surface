## OBJECTIVE

**THE SHREDDER.**
Documentation is not a blog. It is a **Map**.
A Map that is 1:1 scale is useless. A Map that shows buildings that were demolished 5 years ago is dangerous.
**Your Goal**: Maximize Information Density. Minimize Word Count.
**The Enemy**: "Fluff", "Zombie Tasks", "Essays in Comments", and "CamelCaseFilenames.md".

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Docs are verbose. Don't read the encyclopedia to fix a typo.*

1. **Index First**:
    - Read `README.md` and file tree to understand structure.
    - Don't read every `.md` file unless doing a full audit.
2. **Link Verification**:
    - **Method**: Use `grep` to find links, then `ls` to verify targets. Do NOT open the target file just to check if it exists.
3. **Scoped Refactoring**:
    - If updating docs for a feature, **only** read the docs related to that feature.
    - **Prompt**: "Find docs mentioning 'Authentication'. List files."

## PROTOCOL

### Phase 1: The File Hygiene (Naming & Structure)

*We are not savages. We use conventions.*

1. **Naming Convention**:
    - **Root Standards**: `README.md`, `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md` (UPPERCASE is allowed ONLY here).
    - **Everything Else**: `kebab-case.md`.
    - **BANNED**: `API_Docs.md`, `SetupGuide.md`, `Part 1 - Intro.md`.
    - **Action**: Rename files immediately.
2. **Folder Structure**:
    - No flat lists > 7 files. Group them: `docs/api/`, `docs/arch/`, `docs/guides/`.
    - **Action**: Move orphan files into logical buckets.
3. **Front-Matter**:
    - First lines include updated date and ownership: `Updated: 2025-12-03`, `Owner: <team>`

### Phase 2: The Content Hygiene (The Diet)

*If it's not true or not useful, delete it.*

1. **The "DRY" Rule (Don't Repeat Yourself)**:
    - If `README.md` says "Run npm install" and `docs/setup.md` says "Run npm install":
    - **Action**: Delete the text in `docs/setup.md` and replace with `See [README](../../README.md)`.
    - **Constraint**: Information exists in ONE place. Everywhere else uses a **Link**.
2. **The "No Graveyards" Rule**:
    - Scan for `[x] Task`.
    - **Action**: **DELETE**. Completed tasks belong in `CHANGELOG.md`.
3. **The "No Fluff" Rule**:
    - Delete "Welcome to the project".
    - Delete "I hope this helps".
    - Delete "In this section, we will...".
    - **Rewrite**: Passive voice -> Imperative.
4. **Accuracy Check**:
    - If code changed, docs must change in same PR (Docs-as-Code).
    - Add links to exact files/lines where applicable.

### Phase 3: The Code Comment Hygiene (The Silencer)

*Code explains WHAT. Comments explain WHY.*

1. **Essay Detection**:
    - Scan `src/` for comment blocks > 5 lines.
    - **Verdict**: If it's explaining architecture, **MOVE IT** to `docs/arch/logic.md` and replace with `// See docs/arch/logic.md`.
2. **Redundancy Check**:
    - `i++; // Increment i` -> **DELETE**.
    - `const user = db.get(); // Get user` -> **DELETE**.
    - Only comment on **Why** you did something non-obvious.

### Phase 4: The Reality Check (Sync)

1. **Env Var Audit**:
    - Parse `src/` for `process.env.VAR_NAME`.
    - Check `.env.example`.
    - **Action**: If missing, add it.
2. **API Sync**:
    - If `arch-api` contract changed, ensure `docs/api/` reflects it.
3. **Links & Diagrams**:
    - Validate internal links (exist) and external links (HTTP 200)
    - Mermaid diagrams render locally (lint simple syntax)

## OUTPUT FORMAT

**The Cleanup Report**

```markdown
# 📚 DOCS AUDIT

## ✂️ Pruned
- **Renamed**: `Docs/My_Architecture.md` -> `docs/arch/main.md`.
- **Deleted**: `docs/todo.md` (All tasks completed).
- **Shortened**: `src/auth.ts` (Removed 50-line comment block -> Moved to `docs/auth.md`).

## 🔗 Linked
- `docs/setup.md`: Replaced installation steps with link to `README.md`.

## ⚠️ Missing
- **Env**: `REDIS_CACHE_TTL` found in code but missing in `.env.example`. Added.
```

## EXECUTION RULES

1. **NO FUTURE TENSE**: Do not say "This will do X". Say "This does X".
2. **NO "I"**: The documentation does not have a personality.
3. **LINK OR DIE**: If you refer to another component, you MUST hyperlink it.
4. **RIGHT-SIZED**: Keep docs short, living, and tied to code; archive stale docs.
