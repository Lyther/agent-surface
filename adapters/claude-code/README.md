# Claude Code adapter

Current implementation renders command sources to Claude Code command files and normalized subagent sources to Claude Code subagents.

Implemented target paths:

- user: `~/.claude/commands/<group>/<name>.md`
- project: `.claude/commands/<group>/<name>.md`
- user: `~/.claude/agents/<name>.md`
- project: `.claude/agents/<name>.md`
- user merge: `~/.claude.json` `mcpServers.{synapse,grimoire}`
- project merge: `.mcp.json` `mcpServers.{synapse,grimoire}`

The current subagent batch emits `subagents/{boss,researcher,analyzer,adversary,reviewer,worker}.md` to `.claude/agents/*.md`. First-party MCP wiring (Synapse and Grimoire) is generated and safely merged; external or secret-bearing MCPs remain opt-in.

External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Claude Code skill roots by default.
