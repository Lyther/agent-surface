# Poolside Adapter

Generates Poolside local skills and instruction files.

## Outputs

- User: `.config/poolside/skills/<command>/SKILL.md`, `.config/poolside/.poolside`, `.config/poolside/references/rules/<rule>.md`
- Project: `.poolside/skills/<command>/SKILL.md`, `AGENTS.md`, `.poolside/references/rules/<rule>.md`
- External skills mirror into the same skill root.

## Notes

- Poolside scans local Agent Skills directories including `~/.config/poolside/skills/`, `.poolside/skills/`, and `.agents/skills/`.
- External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Poolside skill roots by default.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.

## First-party MCP (generated)

Poolside configures MCP as YAML under `mcp_servers` in `~/.config/poolside/settings.yaml` (user) or `.poolside/settings.yaml` (project). agent-surface generates and **non-destructively merges** Synapse + Grimoire there: existing keys, comments, and your other servers are preserved; re-running is a no-op. External or secret-bearing MCPs remain opt-in. Run `npm run install:synapse` / `npm run install:grimoire` first. The merged block looks like:

```yaml
mcp_servers:
  grimoire:
    command: ~/.local/bin/grimoire-server
    args: []
  synapse:
    command: ~/.local/bin/synapse-bridge
    args: []
```
