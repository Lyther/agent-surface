# Cline adapter

The adapter maps agent-surface sources onto Cline's current file-backed configuration surfaces.

Last runtime probe: Cline CLI `3.0.46` on 2026-07-25. With auto-approval and its configured OpenRouter provider, the CLI called both first-party MCPs and returned the required exact result. Running Cursor extension hosts reloaded both MCP registrations from their global-storage route, but an extension-originated tool call was not run.

## Generated paths

User scope:

- canonical skills: `~/.cline/skills/<name>/SKILL.md`
- manual workflows: `~/Documents/Cline/Workflows/*.md`
- rules: `~/Documents/Cline/Rules/agent-surface.md`
- scoped rule references: `~/Documents/Cline/Rules/references/rules/<rule>.md`
- configured agents: `~/.cline/agents/*.yaml`
- external Agent Skills: `~/.cline/skills/<skill>/...`
- MCP (CLI): `~/.cline/data/settings/cline_mcp_settings.json`
- MCP (VS Code, Cursor and Windsurf extensions): the Cline extension's `globalStorage/.../settings/cline_mcp_settings.json` in each IDE where Cline is present

Project scope:

- canonical skills: `.cline/skills/<name>/SKILL.md`
- manual workflows: `.clinerules/workflows/*.md`
- rules: `.clinerules/agent-surface.md`
- scoped rule references: `.clinerules/references/rules/<rule>.md`
- configured agents: `.cline/agents/*.yaml`
- external Agent Skills: `.cline/skills/<skill>/...`
- ignore policy: `.clineignore`

`--dest` relocates the selected scope's relative paths under the reviewed destination.

## Runtime contracts

Safe reusable procedures are native Agent Skills and can be selected through Cline's skill tool. Only available high-impact commands remain workflows; invoke those by stem and do not add the `.md` suffix.

`registry/targets.json` records normalized render classes, not Cline product labels. The Cline mappings are:

| Render token | agent-surface input | Cline output |
|---|---|---|
| `skills` | `skills/*/SKILL.md` | Agent Skill directories |
| `commands-as-workflows` | `commands/*.md` | workflow Markdown |
| `rules` | `rules/*.mdc` | bundled rules and scoped references |
| `subagents` | `subagents/*.md` | Configured Agent YAML |
| `ignores` | `ignores/*` | `.clineignore` |
| `external` | pinned external skill packs | Agent Skill directories |
| `mcps` | registry-backed MCP services | shared MCP settings |

The repository therefore does have a `subagents` source primitive. For Cline, that primitive compiles to Configured Agents in `.cline/agents/*.yaml`. Cline Configured Agents contain `name`, `description`, an optional tool allowlist, and a non-empty prompt body. The adapter translates normalized subagent access into Cline tool aliases:

- `read-only`: read, search, and skill activation
- `read-write`: read-only tools plus editor tools
- `read-write-shell`: read-write tools plus command execution

Configured Agents are distinct from Cline's built-in `spawn_agent` delegation and persistent agent teams. `spawn_agent` is runtime behavior and needs no generated definition file; agent-team state is created and owned by Cline at runtime.

The bundled rule file contains only always-on rules. Cline's rule loader reads direct files from each rules root and does not recursively activate `references/rules/`; scoped policies remain reference-only until a matching project workflow attaches them.

MCP is user-global but not stored in one shared file. Only the CLI and Cline's SDK-based extension (the Next bundle, rolling out from 4.1.0) read `~/.cline/data/settings/cline_mcp_settings.json`; the pre-SDK extension that 3.x and most 4.x installs run reads `settings/cline_mcp_settings.json` under its IDE's `globalStorage`. The installer non-destructively merges Synapse and Grimoire into the shared route and into each per-IDE route whose IDE has Cline present. Cline counts as present when `~/.vscode/extensions`, `~/.cursor/extensions` or `~/.windsurf/extensions` holds a `saoudrizwan.claude-dev-<version>` folder, or a symlink to one, that the IDE has not marked obsolete. Extension storage is not a signal, because IDEs keep it after an uninstall, and Cline in a custom extensions directory is not detected. Plans list skipped per-IDE routes with the reason, a full install prunes servers agent-surface merged into a route whose IDE has no Cline, and an unreadable extensions folder or `.obsolete` list, or an extension folder that cannot be resolved, blocks the plan. An explicit `--dest` install checks only its destination. No Devin Desktop route is written. Scope-derived Windows installs honor `%APPDATA%`; explicit `--dest` installs relocate the conventional `AppData/Roaming` subtree. None of the current loaders use the older `.cline/mcp.json` route. External or secret-bearing MCP services remain opt-in.

The shared `~/Documents/Cline/Workflows` and `~/Documents/Cline/Rules` directories are discovered by both the CLI and IDE extension. Project workflows retain the supported `.clinerules/workflows` compatibility route. Runtime-audit workflows must use another runtime as the driver; recursively starting Cline from an active Cline workflow inherits hub state and is invalid qualification evidence.

## Not generated

Hooks, plugins, cron specs and scheduling, connectors, provider/model settings, and persistent agent-team state are not generated. agent-surface has no matching source primitive for those configuration or state surfaces. They remain user-, project-, or runtime-owned; executable hooks/plugins and credential-bearing connector/provider settings must not be synthesized from unrelated command, rule, or subagent sources.

Cline's built-in `spawn_agent` subagents are supported by the Cline runtime but are not a configuration surface. They are neither generated nor missing: the generated `subagents` render token refers specifically to Configured Agent YAML.

`.clineignore` is still emitted for project compatibility, but Cline marks the feature for deprecation. The adapter should migrate only after Cline exposes a replacement with equivalent project exclusion behavior.
