# Kimi Code adapter

The adapter maps agent-surface sources onto Kimi Code's native skills, instruction files, custom agents, and MCP configuration. It supports the Kimi Code CLI (TUI, print and web) and the official Kimi Code for VS Code extension (in VS Code and Cursor) as one target because they share Kimi's data home when `KIMI_CODE_HOME` is the same. Kimi Code Desktop is not targeted.

Last local inventory: Kimi Code CLI `2.1.1` on macOS arm64, 2026-10-19, where `kimi doctor` accepted the generated user `config.toml`, both first-party MCP servers connected at user scope and in a trusted project, and the six generated agents parsed (no model call); earlier, CLI `0.29.1` and Moonshot's Cursor extension `0.6.4` on 2026-07-27. `kimi doctor` accepted the installed `config.toml` and `tui.toml`. In a disposable project install, the live TUI connected both first-party MCP servers and activated the generated `/skill:ops-flow`; a model-backed print-mode run called `mcp__synapse__lock_list` through the generated project `mcp.json`. No extension-originated task or MCP call was run.

## Generated paths

User scope, rooted at `$KIMI_CODE_HOME` or `~/.kimi-code`:

- canonical skills: `skills/<name>/SKILL.md`
- manual commands: explicit-only flow skills in `skills/<command>/SKILL.md`
- external Agent Skills: `skills/<skill>/...`
- always-on instructions: `AGENTS.md`
- scoped rule references: `references/rules/<rule>.md`
- custom agents: `agents/<name>.md`
- MCP: `mcp.json`
- terminal policy merge: `config.toml`
- extension policy merge: VS Code and Cursor user `settings.json`

Project scope:

- canonical skills: `.kimi-code/skills/<name>/SKILL.md`
- manual commands: explicit-only flow skills in `.kimi-code/skills/<command>/SKILL.md`
- external Agent Skills: `.kimi-code/skills/<skill>/...`
- always-on instructions: the root `AGENTS.md`, shared with the other hosts that read it
- scoped rule references: `.kimi-code/references/rules/<rule>.md`
- custom agents: `.kimi-code/agents/<name>.md`
- MCP: `.kimi-code/mcp.json`, which Kimi Code 2.1.1 reads from the launch directory rather than the git root, once the folder is trusted at its "Trust this folder?" prompt

Kimi Code reads `.kimi-code/AGENTS.md` and `AGENTS.md` in every directory from the git root down to the launch directory, so a project's rules live in the shared root `AGENTS.md` alone. Kimi Code 2.2.0 on macOS arm64, 2026-10-19, first TUI screen without sign-in, in a project installed for Codex, Qwen Code and Kimi Code with `--category development`: with the earlier `.kimi-code/AGENTS.md` beside the root file it warned "AGENTS.md total 60.3 KB exceeds the recommended 32 KB"; with the shared file alone it shows no warning. The development document is 30,814 bytes, so a user plus project install of that profile still loads two copies and warns. A project install retires an earlier `.kimi-code/AGENTS.md`. When the root `AGENTS.md` is the project's own rather than agent-surface's, as one created by Kimi Code's `/init` is, the whole project install now stops with `UNOWNED_DESTINATION` before writing anything, where earlier releases installed beside it: move the file aside and rerun, or install only `--category skills`. Use the same `--category` as the other hosts sharing the file, since a narrower selection rewrites it with a `SHARED_CONTRIBUTION_REPLACED` warning.

Project installs write no `config.toml`: 2.1.1 on macOS arm64 reads and validates it only from `KIMI_CODE_HOME` (`kimi doctor` ignores a project copy, and the TUI's `/status` keeps its default with one). `.kimi-code/local.toml` is not a project counterpart either; Kimi writes it itself and its schema holds only `workspace.additional_dir`. Project installs before 2026-10-19 merged `default_permission_mode` and `merge_all_available_skills` into an unread `.kimi-code/config.toml`; delete those keys, or the file if nothing else uses it.

An explicit `--dest` relocates the selected scope, including conventional VS Code and Cursor settings subtrees for a user-scope install. A default user install honors `KIMI_CODE_HOME`; the extension itself has no separate setting for that environment variable.

## Runtime contracts

Kimi Code discovers directory-form skills from the Kimi-specific user and project roots. Canonical skills are emitted unchanged and remain model-invocable. Available high-impact commands declare `type: flow` and `disableModelInvocation: true`, so they require explicit `/skill:<name>` invocation. Full user installs also set `merge_all_available_skills = true`; Kimi reads `config.toml` only from `KIMI_CODE_HOME`, so project installs write no copy of it.

Custom agent files contain Kimi's `name`, `description`, and `tools` frontmatter plus the source prompt. Read-only roles allow Kimi's inspection, search, web, todo, question, and skill tools; read-write roles add file editing; shell workers allow the full tool surface. The files are intended for Kimi's native sub-agent delegation. `--agent` or `--agent-file` can also select one as the main agent in print mode or the TUI; agent-surface does not configure that.

Kimi's TUI, web runtime, and extension share `config.toml`, `mcp.json`, authentication state, and sessions when they use the same `KIMI_CODE_HOME`. They must not operate on the same session concurrently because the shared session store has no cross-process lock.

Full user installs merge `default_permission_mode = "auto"` into Kimi's `config.toml`; there is no project Auto. The official extension does not expose persistent Auto mode; its highest persistent setting is `kimi.yoloMode`, which maps to Kimi's YOLO permission mode. Full user installs set that property to `true` in both VS Code and Cursor settings while preserving all sibling settings. Category-only MCP installs preserve both host-wide permission settings.

First-party secretless MCP services are non-destructively merged into `mcpServers` in the native `mcp.json` format. Kimi infers the stdio transport from `command` and `args`, so generated entries omit the unsupported cross-runtime `type` field. External or secret-bearing MCP services remain opt-in.

## Shared and separate state

Shared through `KIMI_CODE_HOME`:

- provider/model config and terminal permission defaults
- MCP servers
- login state
- skills and custom agents
- sessions and session index

Owned by the editor host:

- `kimi.yoloMode` and other VS Code settings
- editor diff baselines and extension UI state
- the remote machine's Kimi home when the extension runs under SSH, WSL, or a dev container

## Not generated

Plugins, hooks, themes, provider/model credentials, login state, session data, editor diff baselines, and extension UI state are not generated. Kimi supports several of these surfaces, but agent-surface has no matching source primitive or they are runtime-owned or credential-bearing.

## References

- [Kimi Code data locations](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/data-locations.html)
- [Kimi Code Agent Skills](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html)
- [Kimi Code agents and sub-agents](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html)
- [Kimi Code MCP](https://moonshotai.github.io/kimi-code/en/customization/mcp.html)
- [Kimi Code configuration files](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files.html)
- [Kimi Code VS Code extension configuration sharing](https://github.com/MoonshotAI/kimi-code/blob/77618e38c35a81e26134b3f83eb7f2b460c0ee05/apps/vscode/README.md)
