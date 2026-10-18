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
- Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`, which OpenHands CLI 1.16.0 (SDK 1.21.0) does not enforce: its skill model has no such field, so with `--category development` the SDK lists ship-deploy, ship-release, ship-commit, ops-nuke and boot-facade among the skills the model may load, and the `invoke_skill` tool it attaches loads any listed skill (2026-10-19). Each body still says the workflow must be selected explicitly. The `OPENHANDS_MANUAL_SKILLS_MODEL_INVOCABLE` install notice says how to leave them out; because user skills share `~/.agents/skills`, every target installed there must leave the development category out for the skills to go.
- Project-level always-on rules use root `AGENTS.md`. User-scope rules render as one legacy OpenHands skill because CLI 1.16.0 (SDK 1.21.0) loads user skills but no user-global `AGENTS.md`: with markers in `~/AGENTS.md`, `~/.openhands/AGENTS.md`, `~/.agents/AGENTS.md` and `~/.config/openhands/AGENTS.md`, the SDK's rendered prompt held none of them (2026-10-19).
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into `~/.openhands/mcp.json`; external or secret-bearing MCPs remain opt-in.
- With two or more MCP servers, OpenHands 1.16.0 proxies them through FastMCP, which advertises MCP roots it cannot serve. The generated Synapse entry therefore sets `SYNAPSE_ROOTS=ignore`, and Synapse keys the project by the directory OpenHands was launched from, its workspace unless `OPENHANDS_WORK_DIR` names another one. With the generated Grimoire and Synapse entries, the SDK's `create_mcp_tools` connected both, 11 tools (2026-10-19); without the setting, Synapse failed startup and only Grimoire's 4 tools loaded.
- OpenHands plugins, hooks, setup scripts, ACP, and model/runtime settings are not generated in this adapter. They remain project-owned surfaces until there is a concrete use case and live proof.
