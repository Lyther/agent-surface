# Kilo adapter

Current implementation renders command sources to Kilo workflow files and generated instructions.

Implemented target paths:

- user: `~/.config/kilo/commands/*.md`
- user: `~/.config/kilo/AGENTS.md`
- user: `~/.config/kilo/rules/*.md`
- user merge: `~/.config/kilo/kilo.jsonc` `instructions += "./rules/<rule>.md"` in source order
- project: `.kilo/commands/*.md`
- project: `AGENTS.md`
- project: `.kilo/rules/*.md`
- project merge: `kilo.jsonc` `instructions += ".kilo/rules/<rule>.md"` in source order
- custom: any reviewed `--dest` path

Kilo workflows are Markdown slash commands. Kilo automatically loads `AGENTS.md`, but the extension Rules UI is backed by the `instructions` array in `kilo.jsonc`, so the installer merges an explicit ordered list of generated rule files and preserves existing config keys. Older generated `agent-surface.md` rule entries are removed from `instructions` during migration because the matching managed file is removed as stale output.

This adapter does not mutate MCP config, providers, or tool permissions.
