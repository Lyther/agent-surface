# Gemini CLI adapter

Current implementation renders command sources to Gemini CLI TOML command files, global context, and an extension package.

Implemented target paths:

- user/project: `.gemini/commands/**/*.toml`
- user/project: `.gemini/GEMINI.md`
- user/project: `.gemini/extensions/agent-surface/gemini-extension.json`
- user/project: `.gemini/extensions/agent-surface/GEMINI.md`
- user/project: `.gemini/extensions/agent-surface/commands/**/*.toml`

MCP settings are not mutated automatically. Add MCP servers through Gemini CLI or a reviewed `settings.json` change.
