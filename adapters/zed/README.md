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

- Zed discovers Agent Skills from `.agents/skills/` and `~/.agents/skills/`. A project's skills and its `.zed/settings.json`, MCP servers included, load only once the worktree is trusted; the user-level skills and `settings.json` are not gated.
- At a project root Zed's native agent reads only the first regular file it finds of `.rules`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`, `AGENT.md`, `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`, so a file with any of the earlier names keeps it off the generated `AGENTS.md`; a `.clinerules` directory, which a project `cline` install creates, is skipped, and External Agents read their own files. The `.github/copilot-instructions.md` a project `copilot` install writes is such a file. It carries the same always-on rules unless only one of the two installs selected `development`, the category that adds always-on rules.
- `<zed config>` is Zed's per-OS config directory: `~/.config/zed` on macOS and Linux (`XDG_CONFIG_HOME`, which Linux Zed honors, is not followed) and the roaming AppData `Zed` directory on Windows (`%APPDATA%\Zed` by default), resolved from the profile home like the VS Code root; a redirected `%APPDATA%` is not followed. Zed reads the personal `AGENTS.md` as instructions for its native agent only. The Windows route is not natively qualified.
- Windows installs made before the per-OS route wrote `~/.config/zed`, which Windows Zed never reads. The next full install prunes its servers from that `settings.json` and removes the old scoped rule references; an install that writes the new personal `AGENTS.md` retires the old one with it.
- A personal `%APPDATA%\Zed\AGENTS.md` you wrote yourself blocks the install as `UNOWNED_DESTINATION`; move or remove it, then rerun.
- External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Zed skill roots by default.
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
- Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`, which Zed honors for model-driven loading: it leaves them out of the skill catalog the model sees and its skill tool refuses them, while typing the slash command still runs them. Its file tools can still read the `SKILL.md`, so the flag is not a hard barrier.
- These notes were read from Zed's v1.24.2 source (macOS, Linux and Windows code paths), not from a live session: the config directory, `context_servers` entry shape, worktree trust, rules-file order and skill loading match what agent-surface writes in a default install. A Flatpak build, `XDG_CONFIG_HOME` on Linux and `--user-data-dir` move Zed's config directory elsewhere.
