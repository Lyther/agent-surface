# Cline adapter

Current implementation renders command sources to Cline workflow files and generated rules.

Implemented target paths:

- user: `~/.cline/data/workflows/*.md`
- user: `~/.cline/rules/agent-surface.md`
- project: `.clinerules/workflows/*.md`
- project: `.clinerules/agent-surface.md`
- project: `.clineignore` (rendered from `ignores/default.ignore`; user-scope installs skip it as non-applicable)
- custom: any reviewed `--dest` path

Cline built-in slash commands are not treated as a custom command-file primitive.

Native MCP support is not currently generated; local user wiring for optional services belongs in the host config.

Native skills are experimental in Cline. External `SKILL.md` packs are not generated for Cline yet; generated command sources continue to render as workflows.

The user-global output uses Cline's current `~/.cline` data root. Project installs keep the documented `.clinerules` compatibility surface until the project workflow path is verified by a live Cline probe.
