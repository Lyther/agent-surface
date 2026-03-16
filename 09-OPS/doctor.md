# COMMAND: DOCTOR

# ALIAS: health, lint-repo, check-commands, self-check

## OBJECTIVE

Run a health check on the `~/.cursor/commands` repo itself.
Find broken references, alias collisions, dead nodes, oversized files, and drift between generated outputs.

## PROTOCOL

### Check 1: Workflow map reachability

- Parse `00-BOOT/workflow.md` for all `[CAT/CMD]` nodes (bracketed text matching `XX-NAME/command`).
- Resolve each node to `CAT/CMD.md`. Must be an exact match per the command protocol.
- Report: unreachable nodes (file missing) and orphan commands (file exists but not in any map).

### Check 2: Alias collisions

- Extract `# ALIAS:` lines from every command `.md` file.
- Detect duplicates across files.
- Report: which aliases collide and which files claim them.

### Check 3: Token budget (oversized files)

- Flag any `.md` command file over 400 lines.
- Flag `.cursorrules` or `.geminirules` if over 500 lines.
- Report: file path + line count.

### Check 4: Rules drift

- Compare `.cursorrules` vs `.geminirules`: report sections present in one but missing in the other.
- If `scripts/sync-commands.sh` exists, check that `map_category()` covers all top-level directories (excluding dotfiles).
- Report: unmapped categories and stale mappings.

### Check 5: Broken internal references

- Grep `.cursorrules` and `00-BOOT/context.md` for path-like references (backtick-quoted paths ending in `.md`).
- Check each referenced path exists either in this repo or is clearly a target-project reference (e.g., `docs/architecture.md`).
- Report: broken refs that are neither repo files nor documented target-project patterns.

### Check 6: Domain module structure

- For each `2[0-9]-*` directory (domain modules like `20-STELLARIS`):
  - Verify a matching rules file exists (e.g., `.stellarisrules`).
  - Verify `sync-commands.sh` SKIPs the directory.
- Report: domain modules missing rules files or sync exclusions.

## OUTPUT FORMAT

```text
DOCTOR REPORT — ~/.cursor/commands

[CHECK 1] Workflow reachability
  ✅ All 18 nodes resolve
  OR
  🔴 MISSING: 01-ARCH/contract (referenced in workflow map)
  ⚠️  ORPHAN: F9-OPS/tap-gardener (not in any workflow map)

[CHECK 2] Alias collisions
  ✅ No collisions (54 unique aliases)
  OR
  🔴 COLLISION: "fix" claimed by 02-DEV/fix.md AND 09-OPS/debug.md

[CHECK 3] Token budget
  ✅ All files under limits
  OR
  ⚠️  11-LINT/shell.md: 399 lines (approaching 400 limit)

[CHECK 4] Rules drift
  ✅ .cursorrules and .geminirules aligned
  OR
  ⚠️  DRIFT: Section "12. CHECKPOINTING" in .cursorrules, missing in .geminirules

[CHECK 5] Broken refs
  ✅ No broken internal references
  OR
  🔴 BROKEN: `.cursorrules` references `01-ARCH/contract` — file does not exist

[CHECK 6] Domain modules
  ✅ 20-STELLARIS: .stellarisrules exists, sync skips directory
  OR
  🔴 MISSING: 20-STELLARIS has no matching rules file
```

## EXECUTION RULES

1. Read-only. Do not fix issues, only report them.
2. Run all checks in a single pass.
3. Exit with a summary count: `N errors, M warnings`.
