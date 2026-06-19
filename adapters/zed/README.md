# Zed Adapter

Generates Zed-compatible Agent Skills and instruction files.

## Outputs

- `.agents/skills/<command>/SKILL.md`
- `.agents/skills/<external-skill>/...`
- User: `.config/zed/AGENTS.md`
- Project: `AGENTS.md`

## Notes

- Zed discovers Agent Skills from `.agents/skills/` and `~/.agents/skills/`.
- MCP context-server settings remain manual because they require settings-file merges.
