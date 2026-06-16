# Cursor adapter

Native surfaces:

- global commands: `~/.cursor/commands/*.md`
- global rules: `~/.cursor/rules/*.mdc`
- project ignore: `.cursorignore` (rendered from `ignores/default.ignore`; emitted in `build` and by project-scope `--dest` installs. User-scope installs skip it as non-applicable. It uses `.gitignore` syntax and blocks indexing/Agent/Tab/@-mentions but not terminal or MCP tool access.)

MCP config is not mutated automatically. Review `~/.cursor/mcp.json` separately because it can contain secrets and live tool access.

Skill support is tracked as manual in `registry/target-capabilities.json`; Cursor currently receives generated reusable behavior through command and rule files.
