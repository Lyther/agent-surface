# Poolside Adapter

Generates Poolside local skills and instruction files.

## Outputs

- User: `.config/poolside/skills/<name>/SKILL.md`, `.config/poolside/AGENTS.md`, `.config/poolside/references/rules/<rule>.md`
- Project: `.poolside/skills/<name>/SKILL.md`, `AGENTS.md`, `.poolside/references/rules/<rule>.md`
- External skills mirror into the same skill root.

## Notes

- Poolside scans local Agent Skills directories including `~/.config/poolside/skills/`, `.poolside/skills/`, and `.agents/skills/`.
- External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Poolside skill roots by default.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
- Personal instructions go to Poolside's documented default, `~/.config/poolside/AGENTS.md`. Poolside honors `XDG_CONFIG_HOME` but agent-surface does not follow it, so a profile that sets it to anything other than `~/.config` will not discover this file. Earlier installs wrote `.config/poolside/.poolside`. An install that still owns that file and whose selection writes the personal instructions removes it after writing `AGENTS.md` when the two are identical. When they differ, the install stops with `MIGRATION_SOURCE_CONFLICT` and changes nothing, because no recorded qualification shows the current client ignores `.poolside` and loading both would duplicate the rules; review the old file, move or remove it, and rerun. A selection that writes no personal instructions, such as `--category skills`, leaves the old file in place and claimed. Native discovery of either route is not yet qualified.
- Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`; Poolside enforcement remains unproven.

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
