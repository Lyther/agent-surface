# OpenCode adapter

Current implementation renders command sources to OpenCode custom commands, normalized subagent sources to OpenCode agents, and rule sources to OpenCode instructions.

Implemented target paths:

- user: `~/.config/opencode/commands/*.md`
- user: `~/.config/opencode/agents/<name>.md`
- user: `~/.config/opencode/AGENTS.md`
- project: `.opencode/commands/*.md`
- project: `.opencode/agents/<name>.md`
- project: `AGENTS.md`

Native MCP and skill support is not currently generated; local user wiring for optional services belongs in the host config.

Native plugin packaging remains future generated-surface work:

- `opencode mcp`
- `opencode plugin`
