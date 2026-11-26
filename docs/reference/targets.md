# Target matrix (reference)

Every host `agent-surface` renders into, and how much of the source model each represents. Lifecycle, security and compatibility notices live in `registry/target-capabilities.json`; `install` and `build` plans and `doctor` print them. Compatibility is 1-5: how much of the source model maps to native or close-native surfaces. Project-only or install-only surfaces are noted. First-party MCP services (Synapse and Grimoire) auto-wire non-destructively into all 25 MCP-capable hosts across JSON, TOML, and YAML config families. The counts below describe the general sync plus `--category development,cybersecurity`, a subset of what `--category everything` installs. The default install alone delivers the six general-purpose skills, no manual-only workflows, and no subagents.

| Target | Auto-invocable skills | Manual-only workflows | Rules / instructions | Agents / subagents | External / MCP / ignores | Compat |
|---|---|---|---|---|---|---:|
| Claude Code | 53 `.claude/skills/*/SKILL.md` | 4 explicit-only skills | `.claude/agent-surface/rules.md`, imported by `CLAUDE.md` | 6 `.claude/agents/*.md` | External skills; Synapse + Grimoire in `.claude.json`; Synapse hook in `.claude/settings.json` | 5 |
| Codex | 53 `.agents/skills/*/SKILL.md` with implicit sidecars | 4 explicit-only `.agents/skills/*/SKILL.md` with non-implicit sidecars | `~/.codex/AGENTS.md`, or a project's `AGENTS.md` | 6 `.codex/agents/*.toml` | External skills; Synapse + Grimoire in `.codex/config.toml`; Synapse hook in `.codex/hooks.json` | 5 |
| Deep Agents Code | 53 `.deepagents/agent/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | `.deepagents/agent/AGENTS.md` | 6 `.deepagents/agent/agents/*/AGENTS.md` | External skills; Synapse + Grimoire in `.deepagents/.mcp.json` | 4 |
| Cursor | 53 `.cursor/skills/*/SKILL.md` | 4 `.cursor/commands/*.md` | 8 `~/.cursor/rules/agent-surface-*.mdc` (loading unverified) | 6 `.cursor/agents/*.md` | External skills; Synapse + Grimoire; `.cursorignore` | 5 |
| Droid | 53 `.agents/skills/*/SKILL.md` | 4 `.factory/commands/*.md` | `.factory/AGENTS.md` | 4 `.factory/droids/*.md`; Droid's built-in explorer and worker kept | External skills; Synapse + Grimoire; Synapse hook in `.factory/hooks.json` | 5 |
| Cline | 53 `.cline/skills/*/SKILL.md` | 4 `~/Documents/Cline/Workflows/*.md` | Cline rules | 6 `.cline/agents/*.yaml` | External skills; Synapse + Grimoire; `.clineignore` | 5 |
| Kilo | 53 `~/.kilo/skills/*/SKILL.md` | 4 `.config/kilo/commands/*.md` | 8 `.config/kilo/rules/agent-surface-*.md`, merged into `instructions` | 6 `.config/kilo/agents/*.md` | External skills; Synapse + Grimoire; whole-object full-access permission; sharing disabled; `.kilocodeignore` | 5 |
| Kimi Code | 53 `$KIMI_CODE_HOME/skills/*/SKILL.md` | 4 explicit-only flow skills | `AGENTS.md` | 6 custom agents | External skills; Synapse + Grimoire; auto permissions | 5 |
| Qoder | 53 `.qoder/skills/*/SKILL.md` | 4 `.qoder/commands/*.md` | `AGENTS.md` | 6 `.qoder/agents/*.md` | External skills; Synapse + Grimoire; bypass permissions; duplicate compatibility scan disabled | 5 |
| Qwen Code | 53 `.qwen/skills/*/SKILL.md` | 4 `.qwen/commands/*.md` | `QWEN.md` (user) or `AGENTS.md` (project) | 6 `.qwen/agents/*.md` | External skills; Synapse + Grimoire; yolo permissions | 5 |
| Kiro | 53 `.kiro/skills/*/SKILL.md` | 4 manual steering workflows | 8 `.kiro/steering/agent-surface-*.md` | 6 `.kiro/agents/*.md` | External skills; Synapse + Grimoire; capability permissions | 5 |
| DSH | 53 `.dsh/skills/*/SKILL.md` | None | None | None | External skills; Developer Preview skills-only boundary | 3 |
| Antigravity CLI | 53 staged-plugin `skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | 8 plugin rules | 6 plugin agents | External plugin skills; Synapse + Grimoire | 5 |
| Antigravity | 53 `~/.gemini/config/skills/*/SKILL.md` | 4 legacy workflows | None | None | External skills | 4 |
| GitHub Copilot | 53 `~/.copilot/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | CLI instructions; shared VS Code profile instructions | 6 `.copilot/agents/*.agent.md` | External skills; Synapse + Grimoire | 5 |
| VS Code | 53 shared `~/.agents/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills in the same root | Profile instructions | None | External skills; Synapse + Grimoire in the VS Code user profile | 4 |
| OpenCode | 53 `.config/opencode/skills/*/SKILL.md` | 4 `.config/opencode/commands/*.md` | `AGENTS.md` | 6 agents | External skills; Synapse + Grimoire; whole-object full-access permission; sharing disabled | 5 |
| OpenHands | 53 `.agents/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | User rules or project `AGENTS.md` | None | External skills; Synapse + Grimoire | 4 |
| Trae (international IDE) | 53 `.trae/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | `.trae/user_rules.md` | 6 `.trae-cn/agents/*.md` (co-owned with Trae CN) | External skills; Synapse + Grimoire in the IDE's `User/mcp.json` | 5 |
| Trae CN | 53 `.trae-cn/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | 8 `.trae-cn/user_rules/agent-surface-*.md` | 6 `.trae-cn/agents/*.md` (co-owned with Trae) | External skills; Synapse + Grimoire in the IDE's `User/mcp.json` | 5 |
| Trae CLI | 53 `.trae/skills/*/SKILL.md` (co-owned with Trae) | 4 explicit-invocation compatibility skills | 8 `.trae/rules/agent-surface-*.md` | 6 `.trae/agents/*.md` | External skills; Synapse + Grimoire and full CLI policy in `.trae/traecli.toml` | 5 |
| Goose | 53 `.agents/skills/*/SKILL.md` | 4 compatibility skills in user builds; project installs use `.goose/recipes/*.yaml` | None | None | External skills; Synapse + Grimoire in user config | 4 |
| Grok Build | 53 `.grok/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | `.grok/AGENTS.md` (user) or project `AGENTS.md` | 6 `.grok/agents/*.md` | External skills; Synapse + Grimoire in `.grok/config.toml` | 5 |
| Pi | 53 `.pi/agent/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | `.pi/agent/AGENTS.md` | None | External skills; Synapse + Grimoire in `.pi/agent/mcp.json` | 4 |
| Poolside | 53 `.config/poolside/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | `.config/poolside/AGENTS.md` | None | External skills; Synapse + Grimoire | 4 |
| Zed | 53 `.agents/skills/*/SKILL.md` | 4 explicit-invocation compatibility skills | `AGENTS.md` in `.config/zed` (Windows: `AppData/Roaming/Zed`) | None | External skills; Synapse + Grimoire | 4 |

Every rule applies to every request, and every install that selects rules writes all eight; asset categories add none. Most targets bundle the rules into one instruction document; Cursor, Kilo, Kiro, Antigravity CLI, Trae CN and Trae CLI, and project installs of Trae, write one file per rule. Those folders also hold the operator's own rules, so each file is named `agent-surface-<rule>` and never takes an operator rule's name; Antigravity CLI's plugin folder holds only agent-surface's files and keeps `<rule>.md`. Cursor's `.mdc` files go under `~/.cursor/rules`, a home-directory location Cursor does not document.

Generated-file presence proves only distribution. `workflow-runtime` separately grades host discovery, native invocation, authentication, full-autonomy execution, exact materialized world state, output contract, and MCP tool calls. A target may therefore be generated while its installed CLI is `BLOCKED`, `PARTIAL`, or `UNREACHABLE` on a particular machine.

Targets with a native command, workflow, prompt, recipe, or explicit-only skill surface use it. The compatibility-skill targets receive `disable-model-invocation: true` plus an explicit-invocation instruction, but runtime enforcement of that metadata is host-dependent and is not claimed by generated-file checks.

## Synapse Hook Notes

Claude Code, Codex and Droid also get one PostToolUse entry running `~/.local/bin/synapse-hook`, merged beside the user's own hooks: after each tool call it adds the Synapse records other agents wrote since the session's previous call to the model's context. Droid reads `.factory/hooks.json` when it exists and the `hooks` key of `.factory/settings.json` otherwise, so the entry goes where Droid will read it. Codex runs a hook only after the user trusts it once through `/hooks`, and its generated `mcp_servers.synapse` table sets `default_tools_approval_mode = "approve"` because `approval_policy = "never"` refuses MCP calls that need approval, and lists `SYNAPSE_DB_DIR`, `SYNAPSE_PROJECT` and `SYNAPSE_NAMESPACE` in `env_vars` because Codex withholds the shell's environment from MCP servers but not from hooks. Pruning Synapse removes only that entry. The other hosts recall explicitly; see [mcps/synapse/README.md](../../mcps/synapse/README.md).

## Cline Notes

Cline CLI and the IDE extension share `~/Documents/Cline/Workflows` and `~/Documents/Cline/Rules`, but only the CLI and Cline's SDK-based extension (the Next bundle, rolling out from 4.1.0) read the shared `~/.cline/data/settings/cline_mcp_settings.json`; the pre-SDK extension that 3.x and most 4.x installs run reads `settings/cline_mcp_settings.json` under its IDE's `globalStorage`. agent-surface merges first-party MCP entries into the shared route and into each per-IDE route whose IDE has Cline present, lists skipped routes, and prunes the retired `.cline/mcp.json` route when it owns those entries. On Windows, scope-derived installs honor `%APPDATA%`; explicit `--dest` installs relocate the conventional `AppData/Roaming` subtree under the destination. Project workflows and bundled rules retain the supported `.clinerules` roots, while project agents and skills use `.cline/`.

The Cline `subagents` render token consumes the repository's existing `subagents/*.md` source primitive and emits Cline Configured Agents as `.cline/agents/*.yaml`. It does not refer to Cline's separate built-in `spawn_agent` delegation feature.

Live Cline CLI `3.0.46` probes on 2026-07-25 used its OpenRouter provider with auto-approval. The CLI called `synapse__lock_list` and `grimoire__grimoire_search` through its configured MCP route and returned the required exact result. Running Cursor extension hosts reloaded their updated global-storage config and logged both servers, but no extension-originated MCP tool call was run; extension task-level MCP behavior therefore remains unproven.

Current headless Cline resolves a generated workflow by stem, such as `/workflow-runtime`; `/workflow-runtime.md` falls through as ordinary prompt text. A loaded runtime-audit workflow also cannot safely launch `cline` from inside its own active Cline daemon: the nested process collides with inherited hub state and can produce a false `UNREACHABLE` verdict. `workflow-runtime` now requires bounded inputs, honors inspect-only requests, and blocks same-family self-probes pending an external driver.

Cline's built-in `spawn_agent` delegation is runtime behavior and needs no generated file, so it is neither a missing mapping nor the meaning of the `subagents` render token. Hooks, plugins, scheduling/cron specs, connectors, provider settings, and persistent agent-team state are real Cline configuration or state surfaces but are not generated; agent-surface has no matching source primitive for those surfaces, and several are executable, credential-bearing, or runtime-owned.

## Kimi Code Notes

Kimi Code's TUI, web runtime, and official VS Code-compatible extension share `config.toml`, `mcp.json`, login state, skills, custom agents, and sessions when they resolve the same `KIMI_CODE_HOME` (default `~/.kimi-code`). The extension has no separate home-path setting. Remote extension hosts use the remote machine's home, and the same session must not be opened concurrently because the session store has no cross-process lock.

The target uses Kimi-specific roots rather than generic `.agents` roots so its skills, agents and settings remain isolated from other hosts; only a project's always-on rules share the root `AGENTS.md` that Kimi reads beside `.kimi-code/AGENTS.md`. Canonical `skills/*/SKILL.md` files are emitted unchanged and remain model-invocable. The five committed high-impact commands and any ignored local command overlays become explicit-only `type: flow` skills with `disableModelInvocation: true`. Subagent sources become native custom-agent Markdown with access-specific tool allowlists.

Permission configuration is deliberately split. Full user installs merge `default_permission_mode = "auto"` into Kimi's `config.toml` for unattended terminal/web execution; Kimi reads `config.toml` only from `KIMI_CODE_HOME`, so project installs write none and there is no project Auto. The official extension exposes only the persistent `kimi.yoloMode` toggle, so user installs set that to `true` in VS Code and Cursor settings while preserving sibling settings. YOLO approves regular tool calls but is not mislabeled as Auto; category-only MCP installs leave both host-wide permission controls untouched.

Live Kimi CLI `0.29.1` probes on 2026-07-27 started the generated project target in the TUI, connected both first-party MCP servers, activated `/skill:ops-flow`, returned its IRON LAW, and called `mcp__synapse__lock_list` through the generated project `mcp.json`. Cursor extension `0.6.4` was inventoried and its shared-home contract was verified from installed code and official documentation, but no extension-originated task or MCP call was run.

## OpenHands Notes

OpenHands support was added from live probes of the installed CLI/SDK. `openhands mcp add` writes `~/.openhands/mcp.json` with an `mcpServers` map, and the CLI accepts the same JSON shape that agent-surface already renders. The SDK loader found project AgentSkills in `.agents/skills`, root `AGENTS.md` as the project instruction file, and user skills in `~/.agents/skills` before `~/.openhands/skills`. Because of that lookup order, user-scope command/external skills intentionally use the shared `.agents/skills` root; OpenHands-specific user rules live in `~/.openhands/skills/agent-surface-rules.md`.

Not generated in the first adapter: plugins (`.plugin/` / `.claude-plugin/`), hooks (`.openhands/hooks.json`), setup scripts, ACP agent wiring, and model/runtime settings. Those are real OpenHands surfaces, but they remain project-owned until a concrete use case and live proof justify adding them.

Planned after live qualification: Amp, Auggie, Crush, Warp.

Out of scope: Gemini CLI (individual-account EoL; use Antigravity CLI), iFlow CLI (shutdown), Roo Code (archived), VSCodium (no maintained native agent runtime), Xcode.
