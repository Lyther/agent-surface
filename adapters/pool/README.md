# Poolside Adapter

Generates Poolside local skills and instruction files.

## Outputs

- User: `.config/poolside/skills/<command>/SKILL.md`, `.config/poolside/.poolside`
- Project: `.poolside/skills/<command>/SKILL.md`, `AGENTS.md`
- External skills mirror into the same skill root.

## Notes

- Poolside scans local Agent Skills directories including `~/.config/poolside/skills/`, `.poolside/skills/`, and `.agents/skills/`.
- MCP server configuration remains manual because it can expose live tools and credentials.
