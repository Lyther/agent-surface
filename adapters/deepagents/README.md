# Deep Agents adapter

Deep Agents Code target for `agent-surface`.

## Generated surfaces

- `skills/*/SKILL.md` -> Deep Agents Code skills:
  - user: `~/.deepagents/<agent>/skills/<name>/SKILL.md`
  - project: `.deepagents/skills/<name>/SKILL.md`
- `rules/*.mdc` -> Deep Agents Code instructions:
  - user: `~/.deepagents/<agent>/AGENTS.md`
  - project: `.deepagents/AGENTS.md`
- scoped language rules -> references:
  - user: `~/.deepagents/<agent>/references/rules/<rule>.md`
  - project: `.deepagents/references/rules/<rule>.md`
- `subagents/worker.md` -> Deep Agents Code worker subagent:
  - user: `~/.deepagents/<agent>/agents/worker/AGENTS.md`
  - project: `.deepagents/agents/worker/AGENTS.md`
- first-party Synapse and Grimoire MCP -> `.deepagents/.mcp.json` by default; external MCP services render only when explicitly requested with `--category mcps --service <id>`.

`<agent>` defaults to `agent` and can be changed with `--agent <name>`.

## Intentional limits

Deep Agents Code subagent files support `name`, `description`, optional `model`, and a markdown system prompt. They do not support per-subagent tool restrictions in `AGENTS.md` frontmatter, so read-only roles are not emitted. The `worker` profile is emitted because its normalized access is `read-write-shell`, matching inherited Deep Agents Code tools.

External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Deep Agents Code skill roots by default.

Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`; Deep Agents Code enforcement remains unproven.

dcode 0.1.86 mounts every MCP server through FastMCP's proxy, which advertises MCP roots and then answers `roots/list` with an error, so Synapse's bridge cannot route by roots and fails closed. A project install sets `SYNAPSE_ROOTS=ignore` on Synapse: dcode starts trusted project servers in the session directory, so the bridge keys the project by cwd. User-level servers start in dcode's server work directory instead, so a user-scope Synapse does not connect; use a project install for Synapse. With dcode's own `get_mcp_tools` (2026-10-19), the project config connected Synapse (7 tools) and Grimoire (4), and the user config connected only Grimoire.

Generated instruction files bundle only `alwaysApply: true` rules, including cybersecurity policy. Scoped language policies are reference files for project-aware commands such as `boot-new`.

## References

- Deep Agents Code overview: <https://docs.langchain.com/oss/python/deepagents/code/overview>
- Data locations: <https://docs.langchain.com/oss/python/deepagents/code/data-locations>
- MCP tools: <https://docs.langchain.com/oss/python/deepagents/code/mcp-tools>
