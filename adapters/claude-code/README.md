# Claude Code adapter

Current implementation renders command sources to Claude Code command files and a local Claude plugin package.

Implemented target paths:

- user: `~/.claude/commands/<group>/<name>.md`
- project: `.claude/commands/<group>/<name>.md`
- user package: `~/.agent-surface/claude-plugin/agent-surface/`
- subagents: `~/.claude/agents/<name>.md` (user) / `.claude/agents/<name>.md` (project), rendered from `subagents/*.md` with YAML frontmatter (`name`, `description`, `tools`; `model` inherits). These are standalone agent files, not plugin-shipped agents.

The plugin package follows the Claude Code plugin directory layout:

- `.claude-plugin/plugin.json`
- `commands/<group>/<name>.md`
- `README.md`

Load it for local testing with:

```bash
claude --plugin-dir ~/.agent-surface/claude-plugin/agent-surface
```
