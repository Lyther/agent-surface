# Codex adapter

Current implementation renders command sources to Codex skills and global Codex instructions.

Implemented target paths:

- user: `~/.agents/skills/<command>/SKILL.md`
- user: `~/.agents/skills/<command>/agents/openai.yaml`
- user: `~/.codex/AGENTS.md`

The `openai.yaml` sidecar keeps generated command skills explicit-only in Codex. MCP configuration is not mutated automatically; use `codex mcp add` or review `~/.codex/config.toml` manually before adding servers.

Do not flatten every command into a Codex skill permanently. Use wrappers only when Codex has no native command/workflow primitive for the target behavior.
