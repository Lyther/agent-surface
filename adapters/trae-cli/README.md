# Trae CLI adapter

The `trae-cli` target covers Trae CLI 2.0 (`traecli`, for TRAE Enterprise), which reads `~/.trae` and the project's `.trae` directory. `TRAE_HOME` is not followed.

User scope:

- skills and explicit-only compatibility skills: `~/.trae/skills/<name>/SKILL.md`, co-owned with `trae`
- subagents: `~/.trae/agents/<name>.md`
- rules: `~/.trae/rules/<rule>.md` with `~/.trae/references/rules`, the files a project install writes; the references are co-owned with `trae`
- config merge: `~/.trae/traecli.toml` with `approval_policy = "never"`, `default_permissions = ":danger-full-access"` and first-party `mcp_servers`, preserving unrelated settings

Project scope (`--dest`): `.trae/skills`, `.trae/agents` (read only in trusted projects) and `.trae/rules/<rule>.md` with `.trae/references/rules`, co-owned with the IDE targets.

Notes:

- The CLI documents no user-level instruction folder, but `traecli` 0.207.1 and 0.209.1 load `~/.trae/rules` the way they load a project's `.trae/rules`, and also read `~/.trae/AGENTS.md`, which agent-surface leaves to the user. They read neither IDE's `user_rules` route, so the CLI does not also load the `trae` target's `~/.trae/user_rules.md`.
- The `traecli.toml` servers the pre-split `trae` target merged stay recorded by `trae`, unpruned, until `trae-cli` records each of them; `trae` then drops its record without pruning it.
- Trae CLI 1.0 (`trae_cli.yaml`, `~/.traecli`) is not targeted; CLI 2.0 migrates its files itself.
- The `~/.trae/agents`, `.trae/agents` and `$TRAE_HOME/skills` routes come from the installed `traecli` 0.201.6 binary, which embeds them and no `.traecli` skills or agents path; the CLI 2.0 pages document only `traecli.toml` and `TRAE_HOME`. `traecli` 0.207.1-tob lists the servers merged into `~/.trae/traecli.toml` as enabled (`traecli mcp list`, 2026-09-30), and, rendered offline with a placeholder model catalog and provider (no sign-in, no model call), its prompt input lists the six project skills and both project rules. The same render on `traecli` 0.207.1 and 0.209.1 (macOS arm64, 2026-10-19) lists the user skills except the five explicit-only ones, the six user agents, and the user rules: always-apply rules inline, glob-scoped rules on demand. Project agents are not runtime-tested, and model-backed use needs a TRAE Enterprise flagship plan.

References:

- [Trae CLI config file](https://docs.trae.cn/cli_config-file)
- [Trae CLI environment variables](https://docs.trae.cn/cli_environment-variables)
