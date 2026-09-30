# Trae CN adapter

The `trae-cn` target covers the Trae CN IDE, which reads `~/.trae-cn` and the project's `.trae` directory.

User scope:

- skills and explicit-only compatibility skills: `~/.trae-cn/skills/<name>/SKILL.md`
- rules: `~/.trae-cn/user_rules/<rule>.md`, plus scoped rule references in `~/.trae-cn/references/rules/`
- subagents: `~/.trae-cn/agents/<name>.md`, co-owned with `trae`
- MCP: `mcp.json` beside the IDE's per-OS `User` settings (`~/Library/Application Support/Trae CN/User/mcp.json` on macOS, `%APPDATA%\Trae CN\User\mcp.json` on Windows), written only once the IDE has created that `User` directory

Project scope (`--dest`): the same `.trae` paths as `trae`, co-owned with it.

Notes:

- The user paths follow the CN documentation. No CN build was installed to confirm them, and the `mcp.json` location comes from a third-party installer. Not runtime-tested.
- CN 3.3.63 notes that the personal edition's global skill folders of both editions are compatible, so installing `trae` and `trae-cn` together may show skills twice in an IDE that reads both.
- The first `trae-cn` install adopts the `~/.trae-cn/user_rules` files the pre-split `trae` target recorded, with their categories: a general install rewrites what it produces and removes the rest, opt-in rules included, while a category-filtered install keeps what it does not select. `trae` releases those files once `trae-cn` has installed.

References:

- [Trae CN rules](https://docs.trae.cn/ide_rules)
- [Trae CN skills](https://docs.trae.cn/ide_skills)
- [Trae CN subagents](https://docs.trae.cn/ide_subagents)
