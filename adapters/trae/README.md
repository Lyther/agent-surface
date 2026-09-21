# Trae adapter

The target covers Trae/TraeCode's documented skills, rules, Markdown subagents, IDE MCP JSON, and TraeCode CLI TOML.

User scope:

- `~/.trae/skills/<name>/SKILL.md`
- `~/.traecli/skills/<name>/SKILL.md`
- `~/.trae/user_rules.md` plus current `~/.trae-cn/user_rules/*.md`
- `~/.trae-cn/agents/<name>.md` and `~/.traecli/agents/<name>.md`
- `~/.trae/mcp.json`
- `~/.trae/traecli.toml`

Under `--dest` the same layout lands in the chosen directory: `.trae/skills` and `.traecli/skills`, `.trae/agents` and `.traecli/agents`, `.trae/rules` and `.trae/references/rules/*.md` plus the retained `.trae/user_rules.md`, and `.trae/mcp.json`. Current official TraeCode documentation requires enabling the IDE Subagents directory beta toggle if it is not already active; the CLI discovers its `.traecli` routes directly and can also consume the IDE-compatible `.trae` routes.

The CLI TOML merge sets `approval_policy = "never"`, `default_permissions = ":danger-full-access"`, and first-party `mcp_servers` while preserving unrelated settings. The IDE JSON MCP route remains generated separately. High-impact workflows stay explicit-invocation compatibility skills.

References:

- [TraeCode subagents](https://docs.trae.cn/ide_subagents)
- [TraeCode CLI skills](https://docs.trae.cn/cli_skills)
- [TraeCode CLI agents](https://docs.trae.cn/cli_agent)
- [TraeCode CLI config](https://docs.trae.cn/cli_config-file)
- [Trae rules](https://docs.trae.cn/ide_rules)
