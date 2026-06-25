# VS Code adapter

VS Code is a generic editor/settings target, not a command/workflow target.

Implemented user-profile surfaces:

- `instructions/agent-surface.instructions.md`
- `instructions/references/rules/<rule>.md`
- `prompts/agent-surface.prompt.md`

These paths are relative to the VS Code user data directory:

- macOS: `~/Library/Application Support/Code/User`
- Linux: `~/.config/Code/User`
- Windows: `%APPDATA%/Code/User`

Settings, keybindings, extension recommendations, and MCP config are not merged automatically.

VS Code and Copilot have native MCP support through `mcp.json` and `chat.mcp.*` settings, and preview agent plugins can bundle skills. These remain manual-only because VS Code trust and organization policy can gate activation.

Generated instructions bundle only always-on rules. Scoped language policies are distributed as references for project-aware commands.
