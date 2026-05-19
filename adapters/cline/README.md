# Cline adapter

Current implementation renders command sources to Cline workflow files and generated rules.

Implemented target paths:

- user: `~/Documents/Cline/Workflows/*.md`
- user: `~/Documents/Cline/Rules/agent-surface.md`
- project: `.clinerules/workflows/*.md`
- project: `.clinerules/agent-surface.md`
- custom: any reviewed `--dest` path

Cline built-in slash commands are not treated as a custom command-file primitive.

Native MCP support is tracked in `registry/target-capabilities.json`. Local user wiring currently includes `agentmemory` in `~/.cline/data/settings/cline_mcp_settings.json` with approval lists empty by default.

Native skills are experimental in Cline. Optional external `SKILL.md` packs are mirrored locally into `~/.cline/skills/`; generated command sources continue to render as workflows.
