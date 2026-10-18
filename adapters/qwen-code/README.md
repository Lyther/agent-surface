# Qwen Code adapter

Qwen Code receives native Agent Skills, current Markdown commands, `QWEN.md` instructions, custom subagents, JSON settings, first-party MCP wiring, and reviewed external skills.

Qwen Code requires Node.js 22 or newer. Project MCP definitions require the runtime's one-time `qwen mcp approve <name>` trust step before they connect.

User paths live under `~/.qwen`; project paths use `.qwen` plus root `QWEN.md`. Full installs deep-merge `tools.approvalMode: "yolo"` and `mcpServers` into `settings.json`, preserving sibling settings. High-impact workflows remain explicit slash commands under `commands/`. Each sets `disable-model-invocation: true`, because Qwen Code otherwise lists a custom command among the skills the model may start; its command schema accepts the key from 0.22.3 and 0.25.2 honors it.

Subagent access maps to native Qwen tool names and `plan`, `auto-edit`, or `yolo` approval modes. MCP entries omit `type` because stdio is inferred from `command` and `args`.

References:

- [Skills](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/)
- [Commands](https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/)
- [Subagents](https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/)
- [MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/)
