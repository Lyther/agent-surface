# Cline adapter

Current implementation renders command sources to Cline workflow files and generated rules.

Implemented target paths:

- user: `~/Documents/Cline/Workflows/*.md`
- user: `~/Documents/Cline/Rules/agent-surface.md`
- project: `.clinerules/workflows/*.md`
- project: `.clinerules/agent-surface.md`
- project: `.clineignore` (rendered from `ignores/default.ignore`; user-scope installs skip it as non-applicable)
- custom: any reviewed `--dest` path

Cline built-in slash commands are not treated as a custom command-file primitive.

Native MCP support is not currently generated; local user wiring for optional services belongs in the host config.

Native skills are experimental in Cline. Optional external `SKILL.md` packs are mirrored locally into `~/.cline/skills/`; generated command sources continue to render as workflows.
