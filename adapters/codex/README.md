# Codex adapter

Current implementation renders command sources to Codex skills, normalized subagent sources to Codex custom agents, and rule sources to global Codex instructions.

Implemented target paths:

- user: `~/.agents/skills/<command>/SKILL.md`
- user: `~/.agents/skills/<command>/agents/openai.yaml`
- user/project: `.codex/agents/<name>.toml`
- user: `~/.codex/AGENTS.md` for always-on rules
- user: `~/.codex/references/rules/<rule>.md` for scoped language references
- user/project merge: `.codex/config.toml` `[mcp_servers.synapse]`

The `openai.yaml` sidecar keeps generated command skills explicit-only in Codex. Custom agents render as standalone TOML files with `name`, `description`, `developer_instructions`, and `sandbox_mode`.

External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Codex skill roots by default.

Generated `AGENTS.md` intentionally bundles only `alwaysApply: true` rules, including cybersecurity policy. Language policies are emitted as references for project-aware commands to attach when the current repository files match their globs.

First-party Synapse MCP wiring is generated and safely merged into `config.toml`. External or secret-bearing MCPs remain opt-in.

Do not flatten every command into a Codex skill permanently. Use wrappers only when Codex has no native command/workflow primitive for the target behavior.
