# Trae adapter

The `trae` target covers the Trae international IDE (TraeCode), which reads `~/.trae`, the documented `~/.trae-cn/agents` and the project's `.trae` directory. The CN IDE (`trae-cn`) and Trae CLI 2.0 (`trae-cli`) read other roots and are separate targets.

User scope:

- skills and explicit-only compatibility skills: `~/.trae/skills/<name>/SKILL.md`
- rules: `~/.trae/user_rules.md`, plus scoped rule references in `~/.trae/references/rules/`
- subagents: `~/.trae-cn/agents/<name>.md`
- MCP: `mcp.json` beside the IDE's per-OS `User` settings (`~/Library/Application Support/Trae/User/mcp.json` on macOS, `%APPDATA%\Trae\User\mcp.json` on Windows), written only once the IDE has created that `User` directory

Project scope (`--dest`): `.trae/skills`, `.trae/agents`, `.trae/rules/<rule>.md` with `.trae/references/rules`, and `.trae/mcp.json`. Both IDE editions read these project paths, so `trae` and `trae-cn` co-own them; `trae-cli` writes the project rules, skills and agents but no project MCP file.

Notes:

- The IDE documents a `~/.trae/user_rules/` folder. The locally installed 3.5.25 build also loads the single `~/.trae/user_rules.md` (read from its app bundle), which is the route this target keeps; newer builds are unverified. Loading both would duplicate the rules.
- The international subagents page documents `~/.trae-cn/agents`, the same text as the CN page, so `trae` and `trae-cn` co-own it. IDE discovery may need the Subagents directory beta toggle. Not runtime-tested.
- The user `mcp.json` route comes from the 3.5.25 app bundle, not from the documentation; the Linux location is unverified. Project MCP in `.trae/mcp.json` is documented.
- `~/.trae/skills` is shared with `trae-cli`; installing both co-owns those files.
- Before the split this target also wrote the CN IDE's `~/.trae-cn/user_rules`, Trae CLI 1.0's `~/.traecli` copies, the CLI's `~/.trae/traecli.toml` servers and a user `~/.trae/mcp.json` that neither the macOS nor the Windows build reads. The `~/.trae-cn/user_rules` files and the `traecli.toml` servers stay claimed and untouched until `trae-cn` or `trae-cli` adopts them; that target's own install then keeps what it produces and removes or prunes the rest, opt-in files and servers included. The CLI 1.0 copies, project ones included, are removed as stale, and the servers in `~/.trae/mcp.json` are pruned.
- In a project installed before the split with optional MCP servers, run `--target trae --scope project` once before a joint `--target all --scope project`; otherwise `trae` and `trae-cn` plan different `.trae/mcp.json` merges and the joint run stops with `also planned by`.
- High-impact workflows stay explicit-invocation compatibility skills; enforcement remains unproven.

References:

- [Trae rules](https://docs.trae.ai/ide/rules)
- [Trae skills](https://docs.trae.ai/ide/skills)
- [Trae subagents](https://docs.trae.ai/ide/subagents)
- [Trae MCP servers](https://docs.trae.ai/ide/add-mcp-servers)
