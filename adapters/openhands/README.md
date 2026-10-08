# OpenHands Adapter

Generates OpenHands AgentSkills, instructions, external AgentSkills, and user-scope MCP wiring.

Status: upstream no longer actively maintains the OpenHands V1 CLI this adapter targets ([project status](https://github.com/OpenHands/OpenHands-CLI#project-status)). The target stays implemented, selectable and included in `--target all` for existing CLI users; it does not target Agent Canvas or the SDK. Install and build plans show the `OPENHANDS_CLI_LEGACY` notice.

## Outputs

- User: `~/.agents/skills/<name>/SKILL.md`
- User: `~/.openhands/skills/agent-surface-rules.md`
- User: `~/.openhands/references/rules/<rule>.md`
- User merge: `~/.openhands/mcp.json` `mcpServers.{synapse,grimoire}`
- Project: `.agents/skills/<name>/SKILL.md`
- Project: `AGENTS.md`
- Project: `.openhands/references/rules/<rule>.md`
- External skills: user/project `.agents/skills/<external-skill>/...`

## Notes

- OpenHands' SDK loads `~/.agents/skills` before `~/.openhands/skills`, so canonical and external skills use the shared AgentSkills root that Codex and Zed also consume.
- Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`; OpenHands enforcement remains unproven.
- Project-level always-on rules use root `AGENTS.md`. User-scope rules render as one legacy OpenHands skill because the verified loader reads user skills but no user-global `AGENTS.md` path was proven.
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into `~/.openhands/mcp.json`; external or secret-bearing MCPs remain opt-in.
- OpenHands plugins, hooks, setup scripts, ACP, and model/runtime settings are not generated in this adapter. They remain project-owned surfaces until there is a concrete use case and live proof.
