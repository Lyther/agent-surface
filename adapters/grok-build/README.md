# Grok Build adapter

Generates native skills, custom agents, project `AGENTS.md` instructions, external Agent Skills, and current TOML configuration.

Outputs:

- `.grok/skills/<name>/SKILL.md`
- `.grok/skills/<external-skill>/...`
- `.grok/agents/<name>.md` for the six subagents, with `--category development`
- `AGENTS.md` and `.grok/references/rules/<rule>.md` for project instructions
- `.grok/config.toml` with `mcp_servers`; user-scope installs also set `ui.permission_mode = "always-approve"`

The installer merges owned TOML fields and MCP tables while preserving unrelated top-level values, table siblings, and user-owned MCP servers. Project installs do not write the user-scoped UI permission default. The obsolete `.grok/settings.json` route is no longer generated.

Agents use Grok's camelCase frontmatter. Each normalized access tier maps to the typed `capabilityMode` (`read-only`, `read-write`, or `all` for shell access), narrowed by a `tools` allowlist of Claude-style names that Grok maps to its own tools, with `mcpInheritance: none`: Grok keeps its MCP meta-tools (`search_tool`, `use_tool`) under any `tools` allowlist, so this is what keeps the children MCP-free, as in the Claude Code render these tool lists come from. No `model` is written, so a child inherits the parent session's model, and no `permissionMode`, because Grok wires only `bypassPermissions`, which would escalate the child.

Grok always also loads `.claude/agents`, with no setting to turn that off. Within one directory the native file wins, so a project with both targets installed uses these agents; a project `.claude/agents` copy, or one in a deeper directory, shadows a user-scope native agent. Grok's bundled `reviewer` role adds high reasoning effort to any agent named `reviewer`.

Qualification (grok 1.0.40, macOS arm64, 2026-09-30): `grok inspect --json` lists all six from `.grok/agents` in a clean project and beside Claude Code's `.claude/agents` copies, and the generated files set no model or permission mode. A delegated task, the child's inherited model and the allowed and denied tool behavior of a spawned child are not yet observed: the run stopped at the account's exhausted Grok Build usage balance (HTTP 402).

References:

- [Grok Build settings](https://docs.x.ai/build/settings)
- [MCP servers](https://docs.x.ai/build/features/mcp-servers)
- [Skills and plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- [Subagents](https://docs.x.ai/build/features/subagents)
- [Agent definition fields](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/src/config.rs) and [discovery](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/src/discovery.rs) (source)
