# Deep Agents adapter

Deep Agents Code target for `agent-surface`.

## Generated surfaces

- `skills/*/SKILL.md` -> Deep Agents Code skills:
  - user: `~/.deepagents/<agent>/skills/<name>/SKILL.md`
  - project: `.deepagents/skills/<name>/SKILL.md`
- `rules/*.md` -> Deep Agents Code instructions:
  - user: `~/.deepagents/<agent>/AGENTS.md`
  - project: `.deepagents/AGENTS.md`
- `subagents/*.md` -> Deep Agents Code subagents:
  - user: `~/.deepagents/<agent>/agents/<name>/AGENTS.md`
  - project: `.deepagents/agents/<name>/AGENTS.md`
- first-party Synapse and Grimoire MCP -> `.deepagents/.mcp.json` by default; external MCP services render with their asset category (for example `--category development` adds chrome-devtools) or with `--category mcps --service <id>`.

`<agent>` defaults to `agent` and can be changed with `--agent <name>`.

## Intentional limits

Deep Agents Code subagent files support `name`, `description`, optional `model`, and a markdown system prompt, and no per-subagent tool settings, so every role runs with the tools it inherits.

External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Deep Agents Code skill roots by default.

Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`; Deep Agents Code enforcement remains unproven.

dcode 0.1.86 mounts every MCP server through FastMCP's proxy, which advertises MCP roots and then answers `roots/list` with an error, so Synapse's bridge cannot route by roots and fails closed. A project install sets `SYNAPSE_ROOTS=ignore` on Synapse: dcode starts trusted project servers in the session directory, so the bridge keys the project by cwd. User-level servers start in dcode's server work directory instead, so a user-scope Synapse does not connect; use a project install for Synapse. With dcode's own `get_mcp_tools` (macOS arm64, 2026-10-19), the project config connected Synapse (7 tools) and Grimoire (4), and the user config connected only Grimoire.

## References

- Deep Agents Code overview: <https://docs.langchain.com/oss/python/deepagents/code/overview>
- Data locations: <https://docs.langchain.com/oss/python/deepagents/code/data-locations>
- MCP tools: <https://docs.langchain.com/oss/python/deepagents/code/mcp-tools>
