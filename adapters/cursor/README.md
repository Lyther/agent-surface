# Cursor adapter

Native surfaces:

- global commands: `~/.cursor/commands/*.md`
- global subagents: `~/.cursor/agents/*.md`
- global rules: `~/.cursor/rules/*.mdc`
- MCP: `~/.cursor/mcp.json` / `.cursor/mcp.json` `mcpServers.synapse`
- project ignore: `.cursorignore` (rendered from `ignores/default.ignore`; emitted in `build` and by project-scope `--dest` installs. User-scope installs skip it as non-applicable. It uses `.gitignore` syntax and blocks indexing/Agent/Tab/@-mentions but not terminal or MCP tool access.)

First-party Synapse MCP wiring is generated and safely merged. External or secret-bearing MCPs remain opt-in.

The current subagent batch emits `subagents/{boss,researcher,analyzer,adversary,reviewer,worker}.md` to `.cursor/agents/*.md` with Cursor's documented Markdown frontmatter shape (`name`, `description`, `model`, `readonly`, `is_background`). Runtime launch probes must call `cursor agent ...`; do not use a bare `agent` command because Grok Build also has an `agent`-named surface.

Skill support is not currently implemented as a generated surface; Cursor receives reusable behavior through command, subagent, and rule files.
