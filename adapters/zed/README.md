# Zed Adapter

Generates Zed-compatible Agent Skills and instruction files.

## Outputs

- `.agents/skills/<command>/SKILL.md`
- `.agents/skills/<external-skill>/...`
- User: `.config/zed/AGENTS.md`, `.config/zed/references/rules/<rule>.md`
- User merge: `.config/zed/settings.json` `context_servers.synapse`
- Project: `AGENTS.md`, `.zed/references/rules/<rule>.md`
- Project merge: `.zed/settings.json` `context_servers.synapse`

## Notes

- Zed discovers Agent Skills from `.agents/skills/` and `~/.agents/skills/`.
- First-party Synapse MCP wiring is generated and safely merged. External or secret-bearing MCPs remain opt-in.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
