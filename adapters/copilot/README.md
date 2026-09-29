# GitHub Copilot adapter

This target covers current Copilot CLI customization in the default `~/.copilot` (`COPILOT_HOME` is not followed). User installs also write one VS Code profile instruction file, which only VS Code's Local agent reads; the Copilot Agent Host reads `~/.copilot/copilot-instructions.md` instead, which is not qualified here.

User scope:

- `~/.copilot/skills/<name>/SKILL.md`
- `~/.copilot/agents/<name>.agent.md`
- `~/.copilot/copilot-instructions.md`
- `~/.copilot/mcp-config.json`
- the VS Code user `instructions/agent-surface-copilot.instructions.md`

Project scope uses `.github/skills`, `.github/agents`, `.github/copilot-instructions.md`, and `.mcp.json`. Canonical and reviewed external skills use the same native skill roots. High-impact workflows remain explicit-invocation skills.

Custom-agent access maps to Copilot's `read`, `search`, `edit`, and `*` tool aliases. Copilot has no persistent allow-all setting equivalent to other hosts; headless real runs must pass `--allow-all` (or `COPILOT_ALLOW_ALL=true`) and record that invocation.

First-party secretless MCP servers are non-destructively merged as command-plus-args entries. External or secret-bearing MCP services remain opt-in.

References:

- [CLI configuration directories](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference)
- [Agent Skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
- [Custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents)
