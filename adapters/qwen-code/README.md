# Qwen Code adapter

Qwen Code receives native Agent Skills, current Markdown commands, `QWEN.md` or `AGENTS.md` instructions, custom subagents, JSON settings, first-party MCP wiring, and reviewed external skills.

Qwen Code requires Node.js 22 or newer. Project MCP definitions require the runtime's one-time `qwen mcp approve <name>` trust step before they connect.

User paths live under `~/.qwen`, with the rules in `~/.qwen/QWEN.md`; project paths use `.qwen` plus the root `AGENTS.md` shared with the other hosts that read it. Full installs deep-merge `tools.approvalMode: "yolo"` and `mcpServers` into `settings.json`, preserving sibling settings. High-impact workflows remain explicit slash commands under `commands/`. Each sets `disable-model-invocation: true`, because Qwen Code otherwise lists a custom command among the skills the model may start; its command schema accepts the key from 0.22.3 and 0.25.2 honors it.

Qwen Code 0.22.3 and 0.25.2 load both `QWEN.md` and `AGENTS.md` by default, from `~/.qwen` and from each directory between the working directory and the project root, so a root `QWEN.md` beside the shared `AGENTS.md` loaded the rules twice; a project install retires an earlier one. A `context.fileName` setting replaces that default list, so one that names only `QWEN.md` no longer loads the project's rules. When the root `AGENTS.md` is the project's own rather than agent-surface's, as one created by another host's `/init` is, the whole project install now stops with `UNOWNED_DESTINATION` before writing anything, where earlier releases installed beside it: move the file aside and rerun, or install only `--category skills`. Use the same `--category` as the other hosts sharing the file, since a narrower selection rewrites it with a `SHARED_CONTRIBUTION_REPLACED` warning. Qwen Code 0.25.2 on macOS arm64, 2026-10-19, first TUI screen without sign-in, in a project installed for Codex, Qwen Code and Kimi Code with `--category development`: always-on context fell from about 19,720 tokens with both files to about 12,000 with the shared file alone. It still warns above 10,000, because managed auto-memory, on by default, adds about 4,300 tokens to the development rules' 7,700; with `memory.enableManagedAutoMemory` set to `false` the warning does not appear. Everything loads either way.

Subagent access maps to native Qwen tool names and `plan`, `auto-edit`, or `yolo` approval modes. MCP entries omit `type` because stdio is inferred from `command` and `args`.

References:

- [Skills](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/)
- [Commands](https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/)
- [Subagents](https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/)
- [MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/)
