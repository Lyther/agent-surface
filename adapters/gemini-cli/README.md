# Gemini CLI legacy adapter

Current implementation keeps legacy Gemini CLI compatibility by rendering command sources to TOML command files, global context, and normalized subagents.

Implemented target paths:

- user/project: `.gemini/commands/**/*.toml`
- user/project: `.gemini/GEMINI.md` for always-on rules
- user/project: `.gemini/references/rules/<rule>.md` for scoped language references
- user/project: `.gemini/agents/*.md`
- user/project merge: `.gemini/settings.json` `mcpServers.synapse`

First-party Synapse MCP wiring is generated and safely merged. External or secret-bearing MCPs remain opt-in.

Google announced that consumer Gemini CLI users should migrate to Antigravity CLI by June 18, 2026, while enterprise/API-key Gemini CLI access can remain usable. This adapter is therefore a legacy compatibility target. Use `antigravity-cli` when you want the current `~/.gemini/config/plugins/agent-surface` Antigravity plugin package instead of direct `.gemini` project/user files.

Generated `GEMINI.md` bundles only `alwaysApply: true` rules, including cybersecurity policy. Scoped language policies are reference files for project-aware commands.
