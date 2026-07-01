# OpenCode adapter

Current implementation renders command sources to OpenCode custom commands, normalized subagent sources to OpenCode agents, and rule sources to OpenCode instructions.

Implemented target paths:

- user: `~/.config/opencode/commands/*.md`
- user: `~/.config/opencode/agents/<name>.md`
- user: `~/.config/opencode/AGENTS.md` for always-on rules
- user: `~/.config/opencode/references/rules/<rule>.md`
- user merge: `~/.config/opencode/opencode.json` `mcp.{synapse,grimoire}`
- project: `.opencode/commands/*.md`
- project: `.opencode/agents/<name>.md`
- project: `AGENTS.md` plus `.opencode/references/rules/<rule>.md`
- project merge: `.opencode/opencode.json` `mcp.{synapse,grimoire}`

First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.

Native plugin packaging remains future generated-surface work:

- `opencode mcp`
- `opencode plugin`

Generated instruction files bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
