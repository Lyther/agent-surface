# Claude Code adapter

Current implementation renders command sources to Claude Code command files.

Implemented target paths:

- user: `~/.claude/commands/<group>/<name>.md`
- project: `.claude/commands/<group>/<name>.md`

Subagents and MCP config are not currently generated. Configure Claude Code agents and MCP servers through Claude Code's native commands or reviewed host config.
