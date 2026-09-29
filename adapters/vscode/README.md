# VS Code adapter

VS Code uses native Agent Skills for both safe reusable procedures and available high-impact manual workflows. The target is the default profile of stable VS Code, read by the built-in Local agent harness; other profiles, Agent Host and cloud harnesses, Insiders and agent plugins (`chat.plugins.enabled`) are not targeted.

Implemented user-profile surfaces:

- `instructions/agent-surface.instructions.md` (Local agent only; Agent Host sessions read their harness folders, such as `~/.copilot/instructions`, instead, and a co-installed `copilot` target can mask a missing file)
- `instructions/references/rules/<rule>.md`
- `mcp.json` with `servers.{synapse,grimoire}`

Canonical skills, manual workflows, and reviewed external skill packs install under `~/.agents/skills/`, which the current VS Code documentation lists as a personal skill location without naming a harness. Manual workflows carry `disable-model-invocation: true`, which the documentation defines as invocable through the `/` slash command only.

Prompt files are no longer generated. They were the legacy Local-agent route, current Agent Host sessions do not load them, and the files agent-surface wrote used a `<name>.md` suffix that route does not recognize either. Existing ones are removed by the normal manifest cleanup on the next install.

Because `~/.agents/skills/` is read by several runtimes that spell explicit invocation differently, the generated body names no invocation syntax; the explicit-only guarantee is carried by the metadata each host reads. Installation and the retirement of the prompt route are verified; discovery and invocation inside a live VS Code session are not yet.

These paths are relative to the VS Code user data directory:

- macOS: `~/Library/Application Support/Code/User`
- Linux: `~/.config/Code/User`
- Windows: `~/AppData/Roaming/Code/User` (resolved from the profile home; `%APPDATA%` is not consulted)

Settings, keybindings, and extension recommendations are not merged automatically. First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into the profile `mcp.json`, at user scope only; external or secret-bearing MCPs remain opt-in. Agent Host sessions receive forwarded VS Code MCP config except servers that need interactive input, which is unverified for these entries.

VS Code and Copilot have native MCP and Agent Skills support. Policy-gated extension activation remains outside agent-surface.

Generated instructions bundle only always-on rules. Scoped language policies are distributed as references for project-aware commands.
