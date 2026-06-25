# Zed Adapter

Generates Zed-compatible Agent Skills and instruction files.

## Outputs

- `.agents/skills/<command>/SKILL.md`
- `.agents/skills/<external-skill>/...`
- User: `.config/zed/AGENTS.md`, `.config/zed/references/rules/<rule>.md`
- Project: `AGENTS.md`, `.zed/references/rules/<rule>.md`

## Notes

- Zed discovers Agent Skills from `.agents/skills/` and `~/.agents/skills/`.
- MCP context-server settings remain manual because they require settings-file merges.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
