# Zed Adapter

Generates Zed-compatible Agent Skills and instruction files.

## Outputs

- `.agents/skills/<command>/SKILL.md`
- `.agents/skills/<external-skill>/...`
- User: `.config/zed/AGENTS.md`, `.config/zed/references/rules/<rule>.md`
- User merge: `.config/zed/settings.json` `context_servers.{synapse,grimoire}`
- Project: `AGENTS.md`, `.zed/references/rules/<rule>.md`
- Project merge: `.zed/settings.json` `context_servers.{synapse,grimoire}`

## Notes

- Zed discovers Agent Skills from `.agents/skills/` and `~/.agents/skills/`.
- External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Zed skill roots by default.
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
