# VS Code adapter

VS Code is a generic editor/settings target, not a command/workflow target.

Implemented user-profile surfaces:

- `instructions/agent-surface.instructions.md`
- `prompts/agent-surface.prompt.md`

These paths are relative to the VS Code user data directory:

- macOS: `~/Library/Application Support/Code/User`
- Linux: `~/.config/Code/User`
- Windows: `%APPDATA%/Code/User`

Settings, keybindings, extension recommendations, and MCP config are not merged automatically.
