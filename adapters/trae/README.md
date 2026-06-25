# Trae adapter

Current implementation writes the global Trae user rules file.

Implemented target path:

- `~/.trae/user_rules.md`
- `~/.trae/references/rules/<rule>.md`

Known project-level surfaces:

- `.trae/project_rules.md`
- `.trae/mcp.json`

MCP config is not mutated automatically.

MCP and skill support remain manual-only for Trae until the live config shape is verified again; reusable behavior currently ships as rules.

Generated Trae rules bundle only always-on rules. Scoped language policies are distributed as references for project-aware commands.
