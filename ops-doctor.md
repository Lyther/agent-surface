## OBJECTIVE

Run a health check on the `~/.cursor/commands` repo itself.
Find broken references, token budget violations, rules drift, and stale exports.

## PROTOCOL

### Check 1: Workflow map reachability

- Parse `boot-workflow.md` for all `[prefix-name]` nodes (bracketed text).
- Resolve each node to `prefix-name.md` at the commands root. Must be an exact match.
- Report: unreachable nodes (file missing) and orphan commands (file exists but not in any map).

### Check 2: Token budget (oversized files)

- Flag any `.md` command file over 400 lines.
- Flag any `.cursor/rules/*.mdc` file over 200 lines.
- Report: file path + line count.

### Check 3: Rules source-of-truth

- Verify `.cursor/rules/*.mdc` files exist and each has valid `---` frontmatter with `alwaysApply`.
- Run `scripts/sync-commands.sh` and confirm generated `.cursorrules`, `.geminirules`, `AGENTS.md` are non-empty.
- Diff generated `.cursorrules` against concatenated `.cursor/rules/*.mdc` (frontmatter stripped). Report drift.

### Check 4: Broken internal references

- Grep all `*.md` files, `.cursorrules`, `.geminirules`, and `.cursor/rules/*.mdc` for backtick-quoted paths ending in `.md` or matching `prefix-name` patterns.
- Verify each referenced command file exists at the root.
- Report: broken refs with file and line number.

### Check 5: Stale version pins

- Scan all files for version strings: `Python 3.x`, `Node x`, `Postgres x`, `node:x`, `python:x`.
- Flag any version older than current stable.
- Report: file, line, current pin, suggested update.

### Check 6: Domain module structure

- For `stellaris-` prefixed commands: verify `.stellarisrules` exists.
- Report: domain modules missing rules files.

## OUTPUT FORMAT

```text
DOCTOR REPORT — ~/.cursor/commands

[CHECK 1] Workflow reachability
  All N nodes resolve
  OR
  MISSING: arch-contract (referenced in workflow map)
  ORPHAN: ai-tap-gardener (not in any workflow map)

[CHECK 2] Token budget
  All files under limits
  OR
  lint-shell.md: 399 lines (approaching 400 limit)

[CHECK 3] Rules source-of-truth
  6 .mdc files, all valid frontmatter
  Generated exports match source
  OR
  DRIFT: .cursorrules differs from .cursor/rules/ source

[CHECK 4] Broken refs
  No broken internal references
  OR
  BROKEN: dev-feature.md:18 references `arch-contract` — file does not exist

[CHECK 5] Version pins
  No stale pins
  OR
  STALE: boot-repro.md:44 — python:3.12 (current stable: 3.13)

[CHECK 6] Domain modules
  stellaris: .stellarisrules exists
```

## EXECUTION RULES

1. Read-only. Do not fix issues, only report them.
2. Run all checks in a single pass.
3. Exit with a summary count: `N errors, M warnings`.
