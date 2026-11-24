# OpenHands Adapter

Generates OpenHands AgentSkills, instructions, external AgentSkills, and user-scope MCP wiring.

Status: deprecated 2026-11-24. Upstream no longer maintains the OpenHands V1 CLI this adapter targets ([project status](https://github.com/OpenHands/OpenHands-CLI#project-status); the docs say the same in OpenHands/docs PR #1059) and recommends Agent Canvas (`@openhands/agent-canvas`, BETA), which this adapter does not target. `--target all` leaves it out; an explicit `--target openhands` still installs and builds it for existing CLI users, and existing installs and manifests stay in place. The adapter does not write Agent Canvas MCP config: Canvas keeps MCP servers in its server's settings API, not `~/.openhands/mcp.json`. Install and build plans show the `OPENHANDS_DEPRECATED` notice.

## Outputs

- User: `~/.agents/skills/<name>/SKILL.md`
- User: `~/.openhands/skills/agent-surface-rules.md`
- User: `~/.openhands/references/rules/<rule>.md`
- User merge: `~/.openhands/mcp.json` `mcpServers.{synapse,grimoire}`
- Project: `.agents/skills/<name>/SKILL.md`
- Project: `AGENTS.md`
- Project: `.openhands/references/rules/<rule>.md`
- External skills: user/project `.agents/skills/<external-skill>/...`

## Existing installs

agent-surface leaves an existing OpenHands install in place. `--target all` does not touch it, and an explicit `--target openhands` only rewrites what it still renders.

- `~/.agents/skills` and project `.agents/skills` are shared with other targets and stay. Agent Canvas reads them too.
- The install record is `~/.agent-surface/openhands-manifest.json` for user scope and `<project>/.agent-surface/openhands-manifest.json` for project scope. The path comes from `scripts/agent-surface/install.mjs` (`manifestPath`), and the user root is the home directory (`scripts/agent-surface/roots.mjs`, `installRootUserOrProject`).
- To drop the OpenHands-specific install, run these steps in order, with the scope the install was made with:
  1. Run `install --target openhands` at that scope (user: `--scope user --allow-scope-root`; project: `--scope project --dest <project>`). It prunes the skills and references this record claims that the repo no longer has. The steps below remove the files it rewrites.
  2. Delete `~/.openhands/skills/agent-surface-rules.md`. Delete the synapse and grimoire entries in `~/.openhands/mcp.json`. Delete the files under `~/.openhands/references/rules/` if present; they exist only when the install included the `development` category. For project scope, do the same with `<project>/.openhands/references/rules/`.
  3. Delete `~/.agent-surface/openhands-manifest.json`, or remove the `managed` entries whose `output` starts with `.agents/skills/` or `.openhands/` and the `config_entries` entry for `.openhands/mcp.json`.
- Until step 1 runs, this record keeps the files openhands wrote for a skill removed from the repo, such as `.agents/skills/<name>/SKILL.md`. Every `--target all` run retains them as claimed by openhands.

## Notes

- OpenHands' SDK loads `~/.agents/skills` before `~/.openhands/skills`, so canonical and external skills use the shared AgentSkills root that Codex and Zed also consume.
- Available high-impact commands use explicit-invocation compatibility skills with `disable-model-invocation: true`, which OpenHands CLI 1.16.0 (SDK 1.21.0) does not enforce: its skill model has no such field, so with `--category development` the SDK lists ship-deploy, ship-release, ship-commit, ops-nuke and boot-facade among the skills the model may load, and the `invoke_skill` tool it attaches loads any listed skill (macOS arm64, 2026-10-19). Each body still says the workflow must be selected explicitly. The `OPENHANDS_MANUAL_SKILLS_MODEL_INVOCABLE` install notice says how to leave them out; because user skills share `~/.agents/skills`, every target installed there must leave the development category out for the skills to go.
- Project-level always-on rules use root `AGENTS.md`. User-scope rules render as one legacy OpenHands skill because CLI 1.16.0 (SDK 1.21.0) loads user skills but no user-global `AGENTS.md`: with markers in `~/AGENTS.md`, `~/.openhands/AGENTS.md`, `~/.agents/AGENTS.md` and `~/.config/openhands/AGENTS.md`, the SDK's rendered prompt held none of them (macOS arm64, 2026-10-19).
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into `~/.openhands/mcp.json`; external or secret-bearing MCPs remain opt-in.
- With two or more MCP servers, OpenHands 1.16.0 proxies them through FastMCP, which advertises MCP roots it cannot serve. The generated Synapse entry therefore sets `SYNAPSE_ROOTS=ignore`, and Synapse keys the project by the directory OpenHands was launched from, its workspace unless `OPENHANDS_WORK_DIR` names another one. With the generated Grimoire and Synapse entries, the SDK's `create_mcp_tools` connected both, 11 tools (macOS arm64, 2026-10-19); without the setting, Synapse failed startup and only Grimoire's 4 tools loaded.
- OpenHands plugins, hooks, setup scripts, ACP, and model/runtime settings are not generated in this adapter. They remain project-owned surfaces until there is a concrete use case and live proof.
