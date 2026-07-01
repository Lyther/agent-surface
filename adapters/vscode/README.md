# VS Code adapter

VS Code is a generic editor/settings target, not a command/workflow target.

Implemented user-profile surfaces:

- `instructions/agent-surface.instructions.md`
- `instructions/references/rules/<rule>.md`
- `prompts/agent-surface.prompt.md`
- `mcp.json` with `servers.{synapse,grimoire}`

These paths are relative to the VS Code user data directory:

- macOS: `~/Library/Application Support/Code/User`
- Linux: `~/.config/Code/User`
- Windows: `%APPDATA%/Code/User`

Settings, keybindings, and extension recommendations are not merged automatically. First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into `mcp.json`; external or secret-bearing MCPs remain opt-in.

VS Code and Copilot have native MCP support through `mcp.json` and `chat.mcp.*` settings, and preview agent plugins can bundle skills. Policy-gated extension activation remains outside agent-surface.

Generated instructions bundle only always-on rules. Scoped language policies are distributed as references for project-aware commands.
