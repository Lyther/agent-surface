## OBJECTIVE

Run a health check on the `~/.cursor/commands` repo itself.
Find broken references, token budget violations, rules drift, stale exports, and cross-IDE sync integrity.

## PROTOCOL

### Check 1: Workflow map reachability

- Parse `boot-workflow.md` for all `[prefix-name]` nodes (bracketed text).
- Resolve each node to `prefix-name.md` at the commands root. Must be an exact match.
- Report: unreachable nodes (file missing) and orphan commands (file exists but not in any map).

### Check 2: Token budget (oversized files)

- Flag any `.md` command file over 400 lines.
- Flag any `.cursor/rules/*.mdc` file over 500 lines.
- Report: file path + line count.

### Check 3: Rules source-of-truth

- Verify `.cursor/rules/*.mdc` files exist and each has valid `---` frontmatter with `alwaysApply` or `globs`.
- Run `scripts/sync-commands.sh` and confirm generated `.cursorrules`, `.geminirules`, `AGENTS.md`, `GEMINI.md`, and repo `.gemini/commands/**/*.toml` exports are present.
- Diff generated `.cursorrules` against concatenated `.cursor/rules/0[0-9]-*.mdc` (frontmatter stripped). Report drift.

### Check 4: Broken internal references

- Grep all `*.md` files, `.cursorrules`, `.geminirules`, `AGENTS.md`, and `.cursor/rules/*.mdc` for backtick-quoted command names.
- Verify each referenced command file exists at the root.
- Check for old-style folder refs (`[0-9]{2}-[A-Z]+/`) — should be zero.
- Report: broken refs with file and line number.

### Check 5: Stale version pins

- Scan all files for version strings: `Python 3.x`, `Node x`, `Postgres x`, `node:x`, `python:x`.
- Flag any version older than current stable.
- Report: file, line, current pin, suggested update.

### Check 6: Domain module structure

- For `stellaris-` prefixed commands: verify `.stellarisrules` exists.
- Report: domain modules missing rules files.

### Check 7: Cross-IDE sync integrity

- Verify `~/.codex/AGENTS.md` exists and is non-empty.
- Verify `~/.agents/skills/` contains one exported skill per syncable root command plus generated compatibility aliases, each with `SKILL.md` and `agents/openai.yaml`.
- Verify `GEMINI.md` exists and is non-empty.
- Verify `.gemini/commands/` has `.toml` files matching exported command count (syncable root commands plus generated compatibility aliases).
- Verify `~/.gemini/GEMINI.md` exists and is non-empty.
- Verify `~/.gemini/commands/` has `.toml` files matching exported command count (syncable root commands plus generated compatibility aliases).
- Verify `~/.gemini/antigravity/global_workflows/` has `.md` files matching exported command count (syncable root commands plus generated compatibility aliases).
- Verify `~/.claude/CLAUDE.md` exists and `~/.claude/commands/` has `.md` files matching exported command count (syncable root commands plus generated compatibility aliases).
- Current compatibility alias set: `dev-component` -> `dev-feature`.
- Report: missing or stale targets.

### Check 8: AGENTS.md learned sections

- Verify `AGENTS.md` contains `## Learned User Preferences` and `## Learned Workspace Facts` sections.
- Verify neither section exceeds 12 bullets.
- Report: missing sections or bullet overflow.

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
  11 .mdc files, all valid frontmatter
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

[CHECK 7] Cross-IDE sync
  codex: AGENTS.md OK, exported skills count matches source + aliases
  gemini: repo GEMINI.md OK, repo .gemini commands count matches source + aliases, ~/.gemini/GEMINI.md OK, global toml count matches
  antigravity: exported workflow count matches source + aliases
  claude: CLAUDE.md OK, exported command count matches source + aliases
  OR
  MISSING: ~/.codex/AGENTS.md does not exist
  MISSING: ~/.agents/skills does not contain synced Codex skills
  MISSING: .gemini/commands does not contain synced Gemini workspace commands

[CHECK 8] AGENTS.md learned sections
  Learned User Preferences: 12 bullets
  Learned Workspace Facts: 10 bullets
  OR
  MISSING: ## Learned Workspace Facts section not found
```

## EXECUTION RULES

1. Read-only. Do not fix issues, only report them.
2. Run all checks in a single pass.
3. Exit with a summary count: `N errors, M warnings`.
