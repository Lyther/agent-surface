# Cursor adapter

The target covers the Cursor desktop editor. [Cursor CLI](https://cursor.com/docs/cli/using) documents only project `.cursor/rules` and `mcp.json`, so for the CLI only MCP and, through `--dest`, project rules are documented; the home-directory surfaces below are unverified there. Cloud Agents are not targeted.

Native surfaces:

- global commands: `~/.cursor/commands/*.md`
- global canonical and reviewed external skills: `~/.cursor/skills/`
- global subagents: `~/.cursor/agents/*.md`
- global rules: `~/.cursor/rules/*.mdc` (Cursor documents `.cursor/rules` as project rules and User Rules as a settings entry; loading from the home directory is undocumented and unverified, and existing files are retained)
- MCP: `~/.cursor/mcp.json` / `.cursor/mcp.json` `mcpServers.{synapse,grimoire}`
- project ignore: `.cursorignore` (rendered from `ignores/default.ignore`; emitted in `build` and by project-scope `--dest` installs. User-scope installs skip it as non-applicable. It uses `.gitignore` syntax and blocks indexing/Agent/Tab/@-mentions but not terminal or MCP tool access.)

First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.

The current subagent batch emits `subagents/{boss,researcher,analyzer,adversary,reviewer,worker}.md` to `.cursor/agents/*.md` with Cursor's documented Markdown frontmatter shape (`name`, `description`, `model`, `readonly`, `is_background`). Runtime launch probes must call `cursor agent ...`; do not use a bare `agent` command because Grok Build also has an `agent`-named surface.

Canonical skills remain available for Cursor's automatic skill discovery. Only available high-impact workflows remain native commands. Cursor's current docs cover commands only through `/migrate-to-skills`, which converts user-level and workspace-level commands and keeps their explicit invocation; command loading is not runtime-tested.
