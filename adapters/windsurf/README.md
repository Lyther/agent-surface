# Windsurf Adapter

Generates Windsurf workflows, rules, and local skills.

## Outputs

- User: `.codeium/windsurf/global_workflows/<command>.md`
- User: `.codeium/windsurf/memories/global_rules.md`
- User: `.codeium/windsurf/references/rules/<rule>.md`
- User: `.codeium/windsurf/skills/<external-skill>/...`
- User merge: `.codeium/windsurf/mcp_config.json` `mcpServers.{synapse,grimoire}`
- Project: `.windsurf/workflows/<command>.md`
- Project: `.devin/rules/agent-surface.md`
- Project: `.windsurf/references/rules/<rule>.md`
- Project: `.windsurf/skills/<external-skill>/...`
- Project merge: `.windsurf/mcp_config.json` `mcpServers.{synapse,grimoire}`

## Notes

- Commands render as workflows because Windsurf invokes reusable workflows with slash-command syntax.
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.
- Generated rules bundle only always-on policy. Scoped language policies are reference files for project-aware commands.
