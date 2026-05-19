# Cursor adapter

Native surfaces:

- global commands: `~/.cursor/commands/*.md`
- global rules: `~/.cursor/rules/*.mdc`

MCP config is not mutated automatically. Review `~/.cursor/mcp.json` separately because it can contain secrets and live tool access.

Skill support is tracked as manual in `registry/target-capabilities.json`; Cursor currently receives generated reusable behavior through command and rule files.
