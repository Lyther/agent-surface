# Kilo adapter

Current implementation renders command sources to Kilo workflow files and generated instructions.

Implemented target paths:

- user: `~/.config/kilo/commands/*.md`
- user: `~/.config/kilo/AGENTS.md`
- user: `~/.config/kilo/rules/agent-surface.md`
- user merge: `~/.config/kilo/kilo.jsonc` `instructions += "./rules/agent-surface.md"`
- project: `.kilo/commands/*.md`
- project: `AGENTS.md`
- project: `.kilo/rules/agent-surface.md`
- project merge: `kilo.jsonc` `instructions += ".kilo/rules/agent-surface.md"`
- custom: any reviewed `--dest` path

Kilo workflows are Markdown slash commands. Kilo automatically loads `AGENTS.md`, but the extension Rules UI is backed by the `instructions` array in `kilo.jsonc`, so the installer merges only that array entry and preserves existing config keys.

This adapter does not mutate MCP config, providers, or tool permissions.
