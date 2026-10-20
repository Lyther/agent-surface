# OpenCode adapter

The target is OpenCode (npm `opencode-ai`) in its default `~/.config/opencode` or project roots. OpenCode documents a terminal interface, desktop app and IDE extension; the latter two are backed only by that documentation here. agent-surface does not write into `OPENCODE_CONFIG_DIR`. OpenCode 1 loads it as an extra directory after those roots, so definitions there can override the generated ones. OpenCode 2 reads it instead of `~/.config/opencode`, so while it is set a user install goes unread. While `XDG_CONFIG_HOME` is set, OpenCode 1.19.3 and 2.0.32 read only `$XDG_CONFIG_HOME/opencode` as their user root, as `debug paths` and `debug config` show, while a user install writes `~/.config/opencode`. As for Goose, the installing shell's environment is not followed, because the client's environment is not known at install time. Instead, a user plan carries the derived `OPENCODE_XDG_CONFIG_HOME_SET` notice when `XDG_CONFIG_HOME` resolves elsewhere, and `OPENCODE_CONFIG_DIR_SET` when `OPENCODE_CONFIG_DIR` names a directory other than the written root. A project install is outside both notices. OpenCode 2 (npm `@opencode/cli`) runs as the same `opencode` command, reads the same roots and accepts the generated files: on macOS arm64, OpenCode 2.0.32 found all 74 skills, 5 commands and 6 agents of a `--category development,cybersecurity,modding` install at user and at project scope, connected every MCP server whose binary was installed, and normalized the version 1 `permission` and `mcp` keys in memory without a warning (`debug config`, `mcp list` and `GET /api/{skill,command,agent,mcp}`; no model call). OpenCode 1.19.3 gave the same listings. Canonical skills use OpenCode's native skill root. Available high-impact commands remain custom commands; normalized subagents and rules use their native OpenCode surfaces.

Implemented target paths:

- user: `~/.config/opencode/commands/*.md`
- user: `~/.config/opencode/skills/<name>/SKILL.md`
- user: `~/.config/opencode/agents/<name>.md`
- user: `~/.config/opencode/AGENTS.md` for always-on rules
- user: `~/.config/opencode/references/rules/<rule>.md`
- user merge: `~/.config/opencode/opencode.json` `mcp.{synapse,grimoire}`
- project: `.opencode/commands/*.md`
- project: `.opencode/skills/<name>/SKILL.md`
- project: `.opencode/agents/<name>.md`
- project: `AGENTS.md` plus `.opencode/references/rules/<rule>.md`
- project merge: `.opencode/opencode.json` `mcp.{synapse,grimoire}`

First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in. Reviewed external skill packs use the same native skill roots as canonical skills.

Full installs deliberately own `permission` and `share`: `permission` is replaced as a whole with `{ "*": "allow" }` so narrower pre-existing rules cannot restore approval prompts, while unrelated top-level settings are preserved and sharing is disabled. MCP-only installs leave those host-wide controls untouched. That guarantee covers the version 1 `permission` key only: a `permissions` list written for OpenCode 2 is preserved, OpenCode 2 still applies its narrower rules after the generated allow, and OpenCode 1 rejects a file that carries one (`V2 permissions are not supported by OpenCode V1`).

Native plugin packaging remains future generated-surface work:

- `opencode mcp`
- `opencode plugin`

Each command carries its source description as frontmatter, which OpenCode lists beside it. On macOS arm64 with a `--category development` project install, OpenCode 1.19.3's `debug config` and OpenCode 2.0.32's `GET /api/command` list the five descriptions, where they listed none before. No model call was made.

Generated instruction files bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
