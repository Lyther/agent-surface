# Trae CLI adapter

The `trae-cli` target covers Trae CLI 2.0 (`traecli`, for TRAE Enterprise), which reads `~/.trae` and the project's `.trae` directory. `TRAE_HOME` is not followed.

User scope:

- skills and explicit-only compatibility skills: `~/.trae/skills/<name>/SKILL.md`, co-owned with `trae`
- subagents: `~/.trae/agents/<name>.md`
- config merge: `~/.trae/traecli.toml` with `approval_policy = "never"`, `default_permissions = ":danger-full-access"` and first-party `mcp_servers`, preserving unrelated settings

Project scope (`--dest`): `.trae/skills`, `.trae/agents` (read only in trusted projects) and `.trae/rules/<rule>.md` with `.trae/references/rules`, co-owned with the IDE targets.

Notes:

- The CLI documents no user-level instruction folder; it reads `AGENTS.md` files and project rules, so user installs write no rules. Where it reads a global `AGENTS.md` is unverified.
- The first `trae-cli` install adopts the `traecli.toml` servers the pre-split `trae` target recorded, so a general install prunes the optional ones among them and keeps the first-party servers. `trae` releases them once `trae-cli` has installed.
- Trae CLI 1.0 (`trae_cli.yaml`, `~/.traecli`) is not targeted; CLI 2.0 migrates its files itself.
- The `~/.trae/agents`, `.trae/agents` and `$TRAE_HOME/skills` routes come from the installed `traecli` 0.201.6 binary, which embeds them and no `.traecli` skills or agents path; the CLI 2.0 pages document only `traecli.toml` and `TRAE_HOME`. That build lists the servers merged into `~/.trae/traecli.toml` as enabled (`traecli mcp list`, 2026-09-30). Rendered offline with a placeholder model catalog and provider (no sign-in, no model call), that build's prompt input lists the six project skills and both project rules; agent loading and the user roots are not runtime-tested, and model-backed use needs a TRAE Enterprise flagship plan.

References:

- [Trae CLI config file](https://docs.trae.cn/cli_config-file)
- [Trae CLI environment variables](https://docs.trae.cn/cli_environment-variables)
