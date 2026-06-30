# Trae adapter

Current implementation writes the global Trae user rules file.

Implemented target path:

- `~/.trae/user_rules.md`
- `~/.trae/references/rules/<rule>.md`
- `~/.trae/mcp.json` `mcpServers.synapse`

Known project-level surfaces:

- `.trae/project_rules.md`
- `.trae/mcp.json`

First-party Synapse MCP wiring is generated and safely merged. External or secret-bearing MCPs remain opt-in. Native skills remain manual until the live config shape is verified again.

Generated Trae rules bundle only always-on rules. Scoped language policies are distributed as references for project-aware commands.
