# Target matrix (reference)

Every host `agent-surface` renders into, and how much of the source model each represents. Compatibility is 1-5: how much of the source model maps to native or close-native surfaces. Project-only or install-only surfaces are noted. First-party MCP services (Synapse and Grimoire) auto-wire non-destructively into all 22 MCP-capable hosts across JSON, TOML, and YAML config families.

| Target | Auto-invocable skills | Manual-only workflows | Rules / instructions | Agents / subagents | External / MCP / ignores | Compat |
|---|---|---|---|---|---|---:|
| Claude Code | 61 `.claude/skills/*/SKILL.md` | 5 explicit-only skills | None | 6 `.claude/agents/*.md` | External skills; Synapse + Grimoire in `.claude.json` | 5 |
| Codex | 61 `.agents/skills/*/SKILL.md` with implicit sidecars | 5 explicit-only `.agents/skills/*/SKILL.md` with non-implicit sidecars | `.codex/AGENTS.md` + 6 scoped refs | 6 `.codex/agents/*.toml` | External skills; Synapse + Grimoire in `.codex/config.toml` | 5 |
| Deep Agents Code | 61 `.deepagents/agent/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | `.deepagents/agent/AGENTS.md` + 6 scoped refs | Worker only | External skills; Synapse + Grimoire in `.deepagents/.mcp.json` | 4 |
| Cursor | 61 `.cursor/skills/*/SKILL.md` | 5 `.cursor/commands/*.md` | 12 native `.cursor/rules/*.mdc` | 6 `.cursor/agents/*.md` | External skills; Synapse + Grimoire; `.cursorignore` | 5 |
| Droid | 61 `.factory/skills/*/SKILL.md` | 5 `.factory/commands/*.md` | `.factory/AGENTS.md` + 6 scoped refs | 6 `.factory/droids/*.md` | External skills; Synapse + Grimoire | 5 |
| Cline | 61 `.cline/skills/*/SKILL.md` | 5 `~/Documents/Cline/Workflows/*.md` | Cline rules + 6 scoped refs | 6 `.cline/agents/*.yaml` | External skills; Synapse + Grimoire; `.clineignore` | 5 |
| Kilo | 61 `~/.kilo/skills/*/SKILL.md` | 5 `.config/kilo/commands/*.md` | 6 always-on rules + 6 scoped refs | 6 `.config/kilo/agents/*.md` | External skills; Synapse + Grimoire; whole-object full-access permission; sharing disabled; `.kilocodeignore` | 5 |
| Kimi Code | 61 `$KIMI_CODE_HOME/skills/*/SKILL.md` | 5 explicit-only flow skills | `AGENTS.md` + 6 scoped refs | 6 custom agents | External skills; Synapse + Grimoire; auto permissions | 5 |
| Qoder | 61 `.qoder/skills/*/SKILL.md` | 5 `.qoder/commands/*.md` | `AGENTS.md` + 6 scoped refs | 6 `.qoder/agents/*.md` | External skills; Synapse + Grimoire; bypass permissions; duplicate compatibility scan disabled | 5 |
| Qwen Code | 61 `.qwen/skills/*/SKILL.md` | 5 `.qwen/commands/*.md` | `QWEN.md` + 6 scoped refs | 6 `.qwen/agents/*.md` | External skills; Synapse + Grimoire; yolo permissions | 5 |
| Kiro | 61 `.kiro/skills/*/SKILL.md` | 5 manual steering workflows | 12 steering files | 6 `.kiro/agents/*.md` | External skills; Synapse + Grimoire; capability permissions | 5 |
| DSH | 61 `.dsh/skills/*/SKILL.md` | None | None | None | External skills; Developer Preview skills-only boundary | 3 |
| Antigravity CLI | 61 staged-plugin `skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | 6 always-on rules + 6 scoped refs | 6 plugin agents | External plugin skills; Synapse + Grimoire | 5 |
| Antigravity | 61 `~/.gemini/config/skills/*/SKILL.md` | 5 legacy workflows | None | None | External skills | 4 |
| GitHub Copilot | 61 `~/.copilot/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | CLI + VS Code instructions and scoped refs | 6 `.copilot/agents/*.agent.md` | External skills; Synapse + Grimoire | 5 |
| VS Code | 61 shared `~/.agents/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills in the same root | VS Code instructions + 6 scoped refs | None | External skills; Synapse + Grimoire in the VS Code user profile | 4 |
| OpenCode | 61 `.config/opencode/skills/*/SKILL.md` | 5 `.config/opencode/commands/*.md` | `AGENTS.md` + 6 scoped refs | 6 agents | External skills; Synapse + Grimoire; whole-object full-access permission; sharing disabled | 5 |
| OpenHands | 61 `.agents/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | User rules or project `AGENTS.md`; 6 scoped refs | None | External skills; Synapse + Grimoire | 4 |
| Trae | 61 skills in each `.trae/skills` and `.traecli/skills` root | 5 explicit-invocation skills in each root | 12 native rule files + retained `user_rules.md` and 6 refs | 6 IDE + 6 CLI agents | Single-copy external skills; IDE + CLI MCP; full CLI policy | 5 |
| Goose | 61 `.agents/skills/*/SKILL.md` | 5 compatibility skills in user builds; project installs use `recipes/*.yaml` | None | None | External skills; Synapse + Grimoire in user config | 4 |
| Grok Build | 61 `.grok/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | Project `AGENTS.md` + 6 scoped refs | None | External skills; Synapse + Grimoire in `.grok/config.toml` | 4 |
| Pi | 61 `.pi/agent/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | `.pi/agent/AGENTS.md` + 6 scoped refs | None | External skills | 4 |
| Poolside | 61 `.config/poolside/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | `.poolside` instructions + 6 scoped refs | None | External skills; Synapse + Grimoire | 4 |
| Windsurf | 61 `.codeium/windsurf/skills/*/SKILL.md` | 5 global workflows | Global rules + 6 scoped refs | None | External skills; Synapse + Grimoire | 5 |
| Zed | 61 `.agents/skills/*/SKILL.md` | 5 explicit-invocation compatibility skills | `.config/zed/AGENTS.md` + 6 scoped refs | None | External skills; Synapse + Grimoire | 4 |

Bundled instruction targets inline only `alwaysApply: true` rules. Cybersecurity (`04`) and language rules (`10`–`14`) ship as separate reference files under each target's config tree for explicit or project-aware selection. Cursor keeps all 12 as native `.mdc`; Kilo config-merges the 6 always-on rules and keeps the 6 scoped policies as references.

Generated-file presence proves only distribution. `workflow-runtime` separately grades host discovery, native invocation, authentication, full-autonomy execution, exact materialized world state, output contract, and MCP tool calls. A target may therefore be generated while its installed CLI is `BLOCKED`, `PARTIAL`, or `UNREACHABLE` on a particular machine.

Targets with a native command, workflow, prompt, recipe, or explicit-only skill surface use it. The compatibility-skill targets receive `disable-model-invocation: true` plus an explicit-invocation instruction, but runtime enforcement of that metadata is host-dependent and is not claimed by generated-file checks.

## Cline Notes

Cline CLI and the IDE extension share `~/Documents/Cline/Workflows` and `~/Documents/Cline/Rules`, but they do not share one MCP settings file. The CLI reads `~/.cline/data/settings/cline_mcp_settings.json`; VS Code, Cursor, and Windsurf each read the Cline extension's `settings/cline_mcp_settings.json` under that IDE's `globalStorage`. agent-surface merges first-party MCP entries into all four routes and prunes the retired `.cline/mcp.json` route when it owns those entries. On Windows, scope-derived installs honor `%APPDATA%`; explicit `--dest` installs relocate the conventional `AppData/Roaming` subtree under the destination. Project workflows and bundled rules retain the supported `.clinerules` roots, while project agents and skills use `.cline/`.

The Cline `subagents` render token consumes the repository's existing `subagents/*.md` source primitive and emits Cline Configured Agents as `.cline/agents/*.yaml`. It does not refer to Cline's separate built-in `spawn_agent` delegation feature.

Live Cline CLI `3.0.46` probes on 2026-07-25 used its OpenRouter provider with auto-approval. The CLI called `synapse__lock_list` and `grimoire__grimoire_search` through its configured MCP route and returned the required exact result. Running Cursor extension hosts reloaded their updated global-storage config and logged both servers, but no extension-originated MCP tool call was run; extension task-level MCP behavior therefore remains unproven.

Current headless Cline resolves a generated workflow by stem, such as `/workflow-runtime`; `/workflow-runtime.md` falls through as ordinary prompt text. A loaded runtime-audit workflow also cannot safely launch `cline` from inside its own active Cline daemon: the nested process collides with inherited hub state and can produce a false `UNREACHABLE` verdict. `workflow-runtime` now requires bounded inputs, honors inspect-only requests, and blocks same-family self-probes pending an external driver.

Cline's built-in `spawn_agent` delegation is runtime behavior and needs no generated file, so it is neither a missing mapping nor the meaning of the `subagents` render token. Hooks, plugins, scheduling/cron specs, connectors, provider settings, and persistent agent-team state are real Cline configuration or state surfaces but are not generated; agent-surface has no matching source primitive for those surfaces, and several are executable, credential-bearing, or runtime-owned.

## Kimi Code Notes

Kimi Code's TUI, web runtime, and official VS Code-compatible extension share `config.toml`, `mcp.json`, login state, skills, custom agents, and sessions when they resolve the same `KIMI_CODE_HOME` (default `~/.kimi-code`). The extension has no separate home-path setting. Remote extension hosts use the remote machine's home, and the same session must not be opened concurrently because the session store has no cross-process lock.

The target uses Kimi-specific roots rather than generic `.agents` roots so user and project installs remain isolated from other hosts. Canonical `skills/*/SKILL.md` files are emitted unchanged and remain model-invocable. The five committed high-impact commands and any ignored local command overlays become explicit-only `type: flow` skills with `disableModelInvocation: true`. Subagent sources become native custom-agent Markdown with access-specific tool allowlists.

Permission configuration is deliberately split. Full installs merge `default_permission_mode = "auto"` into Kimi's TOML config for unattended terminal/web execution. The official extension exposes only the persistent `kimi.yoloMode` toggle, so user installs set that to `true` in VS Code and Cursor settings while preserving sibling settings. YOLO approves regular tool calls but is not mislabeled as Auto; category-only MCP installs leave both host-wide permission controls untouched.

Live Kimi CLI `0.29.1` probes on 2026-07-27 started the generated project target in the TUI, connected both first-party MCP servers, activated `/skill:ops-flow`, returned its IRON LAW, and called `mcp__synapse__lock_list` through the generated project `mcp.json`. Cursor extension `0.6.4` was inventoried and its shared-home contract was verified from installed code and official documentation, but no extension-originated task or MCP call was run.

## OpenHands Notes

OpenHands support was added from live probes of the installed CLI/SDK. `openhands mcp add` writes `~/.openhands/mcp.json` with an `mcpServers` map, and the CLI accepts the same JSON shape that agent-surface already renders. The SDK loader found project AgentSkills in `.agents/skills`, root `AGENTS.md` as the project instruction file, and user skills in `~/.agents/skills` before `~/.openhands/skills`. Because of that lookup order, user-scope command/external skills intentionally use the shared `.agents/skills` root; OpenHands-specific user rules live in `~/.openhands/skills/agent-surface-rules.md`.

Not generated in the first adapter: plugins (`.plugin/` / `.claude-plugin/`), hooks (`.openhands/hooks.json`), setup scripts, ACP agent wiring, and model/runtime settings. Those are real OpenHands surfaces, but they remain project-owned until a concrete use case and live proof justify adding them.

Planned after live qualification: Amp, Auggie, Crush, Warp.

Out of scope: Gemini CLI (individual-account EoL; use Antigravity CLI), iFlow CLI (shutdown), Roo Code (archived), VSCodium (no maintained native agent runtime), Xcode.
