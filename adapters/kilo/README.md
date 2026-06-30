# Kilo adapter

Current implementation renders command sources to Kilo workflow files, generated always-on rules, scoped rule references, and subagents.

Implemented target paths:

- user: `~/.config/kilo/commands/*.md`
- user: `~/.config/kilo/agents/*.md`
- user: `~/.config/kilo/rules/*.md` for the 7 always-on rules
- user: `~/.config/kilo/references/rules/*.md` for scoped language references
- user merge: `~/.config/kilo/kilo.jsonc` `instructions += "./rules/<rule>.md"` for always-on rules and `mcp.{synapse,grimoire}` for first-party MCP
- project: `.kilo/commands/*.md`
- project: `.kilo/agents/*.md`
- project: `.kilo/rules/*.md` for the 7 always-on rules
- project: `.kilo/references/rules/*.md` for scoped language references
- project merge: `kilo.jsonc` `instructions += ".kilo/rules/<rule>.md"` for always-on rules and `mcp.{synapse,grimoire}` for first-party MCP
- project: `.kilocodeignore` (rendered from `ignores/default.ignore`; user-scope installs skip it as non-applicable)
- custom: any reviewed `--dest` path

Kilo workflows are Markdown slash commands. The extension Rules UI is backed by the `instructions` array in `kilo.jsonc`, so the installer merges an explicit ordered list of generated always-on rule files and preserves existing config keys. Older generated `AGENTS.md` and `agent-surface.md` rule outputs are removed as stale managed files during full installs when the manifest proves they are safe to remove.

Build/check previews include a generated `kilo.jsonc` so the `dist/kilo` tree is self-contained. Live installs merge `kilo.jsonc` instead of overwriting user config. Cybersecurity policy is always-on; scoped language policies are reference files only, and project-aware commands decide whether to attach them.

First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into the top-level `mcp` map. External or secret-bearing MCPs remain opt-in. Kilo workflows are the target name for command sources; agent-surface does not emit Kilo-native skills by default.

The current subagent batch emits `subagents/{boss,researcher,analyzer,adversary,reviewer,worker}.md` as Kilo `mode: subagent` markdown files. Runtime/model assignment is intentionally prompt-level or user-configured. `agent-surface` should not add provider-specific model keys to `kilo.jsonc` unless Kilo's current schema accepts them. For monitored workflow runs, prefer explicit launch prompts such as `kilo run --dir <repo> --model <provider/model> --agent code --format json` and instruct the Kilo worker to use Task-tool subagents only when the BOSS filescope marks the work as parallel-safe.

`anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Kilo skill roots by default. Future access should be explicit command/workflow conversion or a just-in-time MCP service.
