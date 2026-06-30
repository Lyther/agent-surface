# Poolside Adapter

Generates Poolside local skills and instruction files.

## Outputs

- User: `.config/poolside/skills/<command>/SKILL.md`, `.config/poolside/.poolside`, `.config/poolside/references/rules/<rule>.md`
- Project: `.poolside/skills/<command>/SKILL.md`, `AGENTS.md`, `.poolside/references/rules/<rule>.md`
- External skills mirror into the same skill root.

## Notes

- Poolside scans local Agent Skills directories including `~/.config/poolside/skills/`, `.poolside/skills/`, and `.agents/skills/`.
- Synapse MCP wiring is pending: Poolside MCP support is documented through settings YAML, but agent-surface does not yet have a verified safe YAML merge path for Poolside settings.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
