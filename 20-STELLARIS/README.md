# Domain Module: STELLARIS

Paradox Script (Stellaris modding) commands. This directory is a **domain module** — a pattern for adding specialized command sets to the repo without bloating the core.

## Domain Module Convention

1. **Directory**: `2N-NAME/` where N is 0-9 (e.g., `20-STELLARIS`, `21-GODOT`, `22-UNITY`)
2. **Rules file**: `.NAMErules` at repo root (e.g., `.stellarisrules`) — symlinked into target projects as `.cursorrules`
3. **Sync exclusion**: `sync-commands.sh` `map_category()` skips `2[0-9]-*` directories (domain commands don't sync to Claude Code)
4. **Self-contained**: Domain commands reference domain rules, not core `.cursorrules`

## Files

| Command | Purpose |
|---------|---------|
| `init` | Scaffold a mod repo (src/dist separation, build script, submodules) |
| `design` | Design game mechanics from a spec |
| `implement` | Write Paradox Script from a design |
| `translate` | Generate localisation `.yml` files |
| `validate` | Check script correctness against engine constraints |
| `ui` | Build `.gui` interface definitions |
| `uplink` | Sync dist to Stellaris user directory |
| `perf-audit` | Find performance bottlenecks (pop iteration, daily pulse) |
| `logs` | Parse Stellaris error logs |
