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

Qualification (macOS arm64), in a disposable project holding only this target's development install:

- grok 1.0.46 (2765805b9442, 2026-10-08): `spawn_subagent` offers the six agents as `subagent_type` values. Asked to delegate to `researcher`, the parent spawned that type; its only tool calls were the spawn and the output retrieval, the child's only call was `read_file` on a probe file, and the parent reported the token written in it. With the parent on `-m grok-4.6` (the default is grok-4.7), the `researcher` and `worker` children both ran on grok-4.6. The `researcher` child's tools were `read_file`, `list_dir` and `grep`; asked to write a file under `--always-approve`, it had no tool for it and the file was not created, while the `worker` child wrote one with `write`. The `worker` keeps Grok's `search_tool` and `use_tool`, but its `search_tool` found no MCP tools although the project config wires one server.
- grok 1.0.44 (5b807183dd79, 2026-09-30 and 2026-10-08): `grok inspect --json` lists all six from `.grok/agents` in a clean project and beside Claude Code's `.claude/agents` copies, but `spawn_subagent` has no type parameter, so a delegated task runs as the built-in `general-purpose` agent; that build's documentation offers such definitions only as the session agent (`--agent <name>` or `[agent]`). Delegating to these agents needs 1.0.46; 1.0.45 was not checked.

References:

- [Grok Build settings](https://docs.x.ai/build/settings)
- [MCP servers](https://docs.x.ai/build/features/mcp-servers)
- [Skills and plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- [Subagents](https://docs.x.ai/build/features/subagents)
- [Agent definition fields](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/src/config.rs) and [discovery](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/src/discovery.rs) (source)
