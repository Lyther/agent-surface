# OpenCode adapter

Current implementation writes global OpenCode instructions.

Implemented target path:

- `~/.config/opencode/AGENTS.md`

Native MCP and skill support is tracked in `registry/target-capabilities.json`. Local user wiring currently includes `agentmemory` in `~/.config/opencode/opencode.json` and optional external `SKILL.md` packs in `~/.config/opencode/skills/`.

Locally observed CLI primitives remain future generated-surface work:

- `opencode agent`
- `opencode mcp`
- `opencode plugin`
