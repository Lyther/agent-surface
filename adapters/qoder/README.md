# Qoder adapter

Qoder CLI receives native Agent Skills, Markdown commands, `AGENTS.md` instructions, custom subagents, JSON settings, first-party MCP wiring, and reviewed external skills.

Qoder CLI requires Node.js 20 or newer. If an older `node` appears first on `PATH`, its launcher fails before reading agent-surface output.

User paths are under `~/.qoder`; project paths use `.qoder` except project instructions, which use root `AGENTS.md`. Full installs deep-merge `general.defaultPermissionMode: "bypass_permissions"`, `skills.loadFromAgentsDirectory: false`, and `mcpServers` into `settings.json`, preserving sibling settings. Disabling the default `.agents/skills` compatibility scan prevents duplicate warnings because agent-surface already installs the complete native `.qoder/skills` catalog. High-impact workflows remain explicit slash commands under `commands/`. Each sets `disable-model-invocation: true`, because Qoder registers commands as skills the model may start through its Skill tool, which refuses a flagged one; the key is honored by 1.1.73.

Custom subagents use Qoder's native Claude-style tool names and permission modes. MCP entries omit `type` because stdio is inferred from `command` and `args`.

References:

- [Settings](https://docs.qoder.com/cli/settings-reference)
- [Skills and compatibility source](https://docs.qoder.com/cli/Skills)
- [Commands](https://docs.qoder.com/cli/commands)
- [Subagents](https://docs.qoder.com/cli/subagent)
- [MCP](https://docs.qoder.com/cli/mcp-reference)
