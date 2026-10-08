# Zed Adapter

Generates Zed-compatible Agent Skills and instruction files.

## Outputs

- `.agents/skills/<name>/SKILL.md`
- `.agents/skills/<external-skill>/...`
- User: `<zed config>/AGENTS.md`, `<zed config>/references/rules/<rule>.md`
- User merge: `<zed config>/settings.json` `context_servers.{synapse,grimoire}`
- Project: `AGENTS.md`, `.zed/references/rules/<rule>.md`
- Project merge: `.zed/settings.json` `context_servers.{synapse,grimoire}`

## Notes

- Zed discovers Agent Skills from `.agents/skills/` and `~/.agents/skills/`.
- `<zed config>` is Zed's per-OS config directory: `~/.config/zed` on macOS and Linux (`XDG_CONFIG_HOME`, which Linux Zed honors, is not followed) and the roaming AppData `Zed` directory on Windows (`%APPDATA%\Zed` by default), resolved from the profile home like the VS Code root; a redirected `%APPDATA%` is not followed. Zed reads the personal `AGENTS.md` as instructions for its native agent only. The Windows route is not natively qualified.
- Windows installs made before the per-OS route wrote `~/.config/zed`, which Windows Zed never reads. The next full install prunes its servers from that `settings.json` and removes the old scoped rule references; an install that writes the new personal `AGENTS.md` retires the old one with it.
- A personal `%APPDATA%\Zed\AGENTS.md` you wrote yourself blocks the install as `UNOWNED_DESTINATION`; move or remove it, then rerun.
- External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Zed skill roots by default.
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
- Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`; Zed enforcement remains unproven.
