# Gemini CLI adapter

Current implementation renders command sources to Gemini CLI TOML command files, global context, and normalized subagents.

Implemented target paths:

- user/project: `.gemini/commands/**/*.toml`
- user/project: `.gemini/GEMINI.md`
- user/project: `.gemini/agents/*.md`

MCP settings are not mutated automatically. Add MCP servers through Gemini CLI or a reviewed `settings.json` change.

Google announced that consumer Gemini CLI users should migrate to Antigravity CLI by June 18, 2026, but Gemini CLI 0.46.0 is the locally verified command surface for native `.gemini` commands, subagents, skills, hooks, and extensions. Use `antigravity-cli` when you want the generated `~/.gemini/extensions/agent-surface` package instead of direct `.gemini` project/user files.
