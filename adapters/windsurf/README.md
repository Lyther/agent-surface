# Windsurf Adapter

Generates Windsurf workflows, rules, and local skills.

## Outputs

- User: `.codeium/windsurf/global_workflows/<command>.md`
- User: `.codeium/windsurf/memories/global_rules.md`
- User: `.codeium/windsurf/references/rules/<rule>.md`
- User: `.codeium/windsurf/skills/<external-skill>/...`
- Project: `.windsurf/workflows/<command>.md`
- Project: `.devin/rules/agent-surface.md`
- Project: `.windsurf/references/rules/<rule>.md`
- Project: `.windsurf/skills/<external-skill>/...`

## Notes

- Commands render as workflows because Windsurf invokes reusable workflows with slash-command syntax.
- MCP config remains manual until safe merge behavior is implemented.
- Generated rules bundle only always-on policy. Scoped language policies are reference files for project-aware commands.
