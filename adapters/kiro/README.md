# Kiro adapter

One Kiro target covers Kiro IDE 1.x and Kiro CLI package 2.x on its V3 agent engine ("CLI 3.0", selected with `--v3` or `--agent-engine v3`), because they share the current `.kiro` formats. The CLI's V1 and V2 engines and Kiro Web and Mobile are not targeted. It generates native Agent Skills, steering, Markdown custom agents, capability permissions, first-party MCP wiring, and reviewed external skills.

Always-on and file-matched source rules map to steering inclusion modes, and high-impact workflows map to `inclusion: manual`, invoked as `#command-<name>` or from `/` completion. Each generated custom agent lists all steering files as `file://` resources, which Kiro loads when the agent starts, so those agents receive the manual workflows too. Kiro's [steering page](https://kiro.dev/docs/steering/) says Kiro CLI V3 honors all four inclusion modes, while V1/V2 load only `always` files automatically and exclude `fileMatch` and `manual` ones; a custom agent's `file://` resources load the steering files they list whatever their mode. Neither behavior is runtime-tested here: Kiro CLI 2.32.0 needs a login before it lists agents or MCP servers. The plan's `KIRO_MANUAL_STEERING_AUTOLOADED` notice says so; the selections that write these workflow files are `--category development` and, when the local `commands/ops-server.md` overlay exists, `--category private`. Custom agents map normalized access to current tool tags and capability rules.

User installs emit `~/.kiro/settings/permissions.yaml` with `capability: all` / `effect: allow`. Headless acceptance selects the V3 engine: `kiro-cli chat --v3 --no-interactive --trust-all-tools`; immutable Kiro restrictions still apply. MCP lives at `.kiro/settings/mcp.json` in the selected user or project root.

References:

- [Skills](https://kiro.dev/docs/cli/skills/)
- [Steering](https://kiro.dev/docs/steering/)
- [CLI 3.0](https://kiro.dev/docs/cli/v3/)
- [Custom agents](https://kiro.dev/docs/custom-agents/configuration-reference/)
- [Permissions](https://kiro.dev/docs/cli/chat/permissions/)
- [Headless mode](https://kiro.dev/docs/cli/headless/)
