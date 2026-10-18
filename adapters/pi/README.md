# Pi Adapter

Generates Pi Agent Skills and instruction files for the Pi coding agent CLI (npm `@earendil-works/pi-coding-agent`; the `@mariozechner` package is deprecated), in the default `~/.pi/agent` (`PI_CODING_AGENT_DIR` is not followed) or project roots.

## Outputs

- User: `.pi/agent/skills/<name>/SKILL.md`, `.pi/agent/AGENTS.md`, `.pi/agent/references/rules/<rule>.md`
- Project: `.pi/skills/<name>/SKILL.md`, `AGENTS.md`, `.pi/references/rules/<rule>.md`
- MCP: Synapse and Grimoire merge into `mcpServers` in `.pi/agent/mcp.json` (user) or `.pi/mcp.json` (project), keeping any existing servers.
- External skills mirror into the same skill root.

## Notes

- Pi supports the Agent Skills format and reads `AGENTS.md`.
- Pi 1.3.0 reads MCP servers natively and connects them when a session starts; it reads `.pi/mcp.json` only in trusted projects. Pi's default `codemode` exposure is kept, so the tools are callable from codemode scripts and are not declared to the model. `pi mcp list` connected both generated user entries; task-level use is not tested.
- Subagents are not generated because Pi does not enable sub-agent behavior by default.
- Generated instructions bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
- Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`, which Pi documents as hiding a skill from automatic selection; this is not runtime-tested. Project `.pi/skills` need project trust.
