# VS Code adapter

VS Code uses native Agent Skills for both safe reusable procedures and available high-impact manual workflows.

Implemented user-profile surfaces:

- `instructions/agent-surface.instructions.md`
- `instructions/references/rules/<rule>.md`
- `mcp.json` with `servers.{synapse,grimoire}`

Canonical skills, manual workflows, and reviewed external skill packs install under `~/.agents/skills/`, one of the built-in user-scope skill locations in the 1.116.0 build. Manual workflows carry `disable-model-invocation: true`, which that build describes as keeping a workflow out of automatic loading and available to trigger explicitly.

Prompt files are no longer generated. They were the legacy Local-agent route, current Agent Host sessions do not load them, and the files agent-surface wrote used a `<name>.md` suffix that route does not recognize either. Existing ones are removed by the normal manifest cleanup on the next install.

Because `~/.agents/skills/` is read by several runtimes that spell explicit invocation differently, the generated body names no invocation syntax; the explicit-only guarantee is carried by the metadata each host reads. Installation and the retirement of the prompt route are verified; discovery and invocation inside a live VS Code session are not yet.

These paths are relative to the VS Code user data directory:

- macOS: `~/Library/Application Support/Code/User`
- Linux: `~/.config/Code/User`
- Windows: `%APPDATA%/Code/User`

Settings, keybindings, and extension recommendations are not merged automatically. First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into `mcp.json`; external or secret-bearing MCPs remain opt-in.

VS Code and Copilot have native MCP and Agent Skills support. Policy-gated extension activation remains outside agent-surface.

Generated instructions bundle only always-on rules. Scoped language policies are distributed as references for project-aware commands.
