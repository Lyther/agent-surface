# Kiro adapter

One Kiro target covers Kiro IDE 1.x and Kiro CLI package 2.x on its V3 agent engine ("CLI 3.0", selected with `--v3` or `--agent-engine v3`), because they share the current `.kiro` formats. The CLI's V1 and V2 engines and Kiro Web and Mobile are not targeted. It generates native Agent Skills, steering, Markdown custom agents, capability permissions, first-party MCP wiring, and reviewed external skills.

Always-on and file-matched source rules map to steering inclusion modes, and high-impact workflows map to `inclusion: manual`, invoked as `#command-<name>` or from `/` completion. Generated custom agents list their skills as `skill://` resources and no steering. Kiro's [custom agents](https://kiro.dev/docs/custom-agents/configuration-reference/) inherit the steering, skills and `AGENTS.md` of its default agent, and each steering file keeps its own inclusion mode. A `file://` resource, by contrast, loads every file it matches when the agent starts, manual workflows included. A user who sets `chat.disableInheritingDefaultResources` gets the generated agents without the `always` rules. Kiro's [steering page](https://kiro.dev/docs/steering/) says Kiro CLI V3 honors all four inclusion modes, while V1/V2 load only `always` files automatically and exclude `fileMatch` and `manual` ones. Custom agents map normalized access to current tool tags and capability rules.

On macOS arm64, Kiro CLI 2.32.0's V3 engine listed a `--category development` install at user and at project scope over `kiro-cli acp --agent-engine v3`. The listing covered:

- its 52 skills;
- its six custom agents, as modes and as delegate commands;
- its 14 steering files, each with the `always`, `fileMatch` or `manual` inclusion it declares;
- the five manual workflows, as slash commands labelled `Steering: command-<name>`. A `description` in a manual file does not change that label.

Project agents and skills shadow same-named user ones. The MCP server in that install's `mcp.json` connected. Kiro's context report for a new session lists only the four `always` files per scope. A generated agent keeps that set once its `file://` steering resources are gone. With them, switching to `boss` loaded all 14 files per scope, the `always` ones twice, at about five times the tokens. The sessions were driven with `initialize`, `session/new` and `session/set_mode`, with no login and no prompt. `kiro-cli agent list` and `mcp list` refuse to run without a login.

User installs emit `~/.kiro/settings/permissions.yaml` with `capability: all` / `effect: allow`. Headless acceptance selects the V3 engine: `kiro-cli chat --v3 --no-interactive --trust-all-tools`; immutable Kiro restrictions still apply. MCP lives at `.kiro/settings/mcp.json` in the selected user or project root.

References:

- [Skills](https://kiro.dev/docs/cli/skills/)
- [Steering](https://kiro.dev/docs/steering/)
- [CLI 3.0](https://kiro.dev/docs/cli/v3/)
- [Custom agents](https://kiro.dev/docs/custom-agents/configuration-reference/)
- [Permissions](https://kiro.dev/docs/cli/chat/permissions/)
- [Headless mode](https://kiro.dev/docs/cli/headless/)
