# Claude Code adapter

Current implementation renders command sources to Claude Code command files and normalized subagent sources to Claude Code subagents.

Implemented target paths:

- user: `~/.claude/commands/<group>/<name>.md`
- project: `.claude/commands/<group>/<name>.md`
- user: `~/.claude/agents/<name>.md`
- project: `.claude/agents/<name>.md`

The current subagent batch emits `subagents/{boss,researcher,analyzer,adversary,reviewer,worker}.md` to `.claude/agents/*.md`. MCP config is not currently generated; configure MCP servers through Claude Code's native commands or reviewed host config.
