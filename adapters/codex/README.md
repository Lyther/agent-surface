# Codex adapter

Current implementation renders command sources to Codex skills, normalized subagent sources to Codex custom agents, and rule sources to global Codex instructions.

Implemented target paths:

- user: `~/.agents/skills/<command>/SKILL.md`
- user: `~/.agents/skills/<command>/agents/openai.yaml`
- user/project: `.codex/agents/<name>.toml`
- user: `~/.codex/AGENTS.md` for always-on rules
- user: `~/.codex/references/rules/<rule>.md` for scoped language references

The `openai.yaml` sidecar keeps generated command skills explicit-only in Codex. Custom agents render as standalone TOML files with `name`, `description`, `developer_instructions`, and `sandbox_mode`.

Generated `AGENTS.md` intentionally bundles only `alwaysApply: true` rules. Language policies are emitted as references for project-aware commands to attach when the current repository files match their globs.

MCP configuration is not mutated automatically; use Codex-native setup or review `~/.codex/config.toml` manually before adding servers.

Do not flatten every command into a Codex skill permanently. Use wrappers only when Codex has no native command/workflow primitive for the target behavior.
