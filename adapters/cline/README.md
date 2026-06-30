# Cline adapter

Current implementation renders command sources to Cline workflow files and generated rules.

Implemented target paths:

- user: `~/.cline/data/workflows/*.md`
- user: `~/.cline/rules/agent-surface.md`
- user: `~/.cline/rules/references/rules/<rule>.md`
- project: `.clinerules/workflows/*.md`
- project: `.clinerules/agent-surface.md`
- project: `.clinerules/references/rules/<rule>.md`
- user/project merge: `.cline/mcp.json` `mcpServers.{synapse,grimoire}`
- project: `.clineignore` (rendered from `ignores/default.ignore`; user-scope installs skip it as non-applicable)
- custom: any reviewed `--dest` path

Cline built-in slash commands are not treated as a custom command-file primitive.

First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.

Native skills are experimental in Cline. External `SKILL.md` packs are not generated for Cline yet; generated command sources continue to render as workflows.

The bundled Cline rule file includes only always-on rules. Scoped language policies are colocated as references and should be copied or attached only when the target project matches their globs.

The user-global output uses Cline's current `~/.cline` data root. Project installs keep the documented `.clinerules` compatibility surface until the project workflow path is verified by a live Cline probe.
