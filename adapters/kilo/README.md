# Kilo adapter

Current implementation renders command sources to Kilo workflow files and generated instructions.

Implemented target paths:

- user: `~/.config/kilo/commands/*.md`
- user: `~/.config/kilo/agents/*.md`
- user: `~/.config/kilo/AGENTS.md`
- user: `~/.config/kilo/rules/*.md`
- user merge: `~/.config/kilo/kilo.jsonc` `instructions += "./rules/<rule>.md"` in source order
- project: `.kilo/commands/*.md`
- project: `.kilo/agents/*.md`
- project: `AGENTS.md`
- project: `.kilo/rules/*.md`
- project merge: `kilo.jsonc` `instructions += ".kilo/rules/<rule>.md"` in source order
- project: `.kilocodeignore` (rendered from `ignores/default.ignore`; user-scope installs skip it as non-applicable)
- custom: any reviewed `--dest` path

Kilo workflows are Markdown slash commands. Kilo automatically loads `AGENTS.md`, but the extension Rules UI is backed by the `instructions` array in `kilo.jsonc`, so the installer merges an explicit ordered list of generated rule files and preserves existing config keys. Older generated `agent-surface.md` rule entries are removed from `instructions` during migration because the matching managed file is removed as stale output.

Native MCP and skill support is not currently generated; local user wiring for optional services belongs in the host config. Kilo workflows are the target name for command sources; native skills remain separate `SKILL.md` directories.

The current subagent batch emits `subagents/{boss,researcher,analyzer,adversary,reviewer,worker}.md` as Kilo `mode: subagent` markdown files. Runtime/model assignment is intentionally prompt-level or user-configured. `agent-surface` should not add provider-specific model keys to `kilo.jsonc` unless Kilo's current schema accepts them. For monitored workflow runs, prefer explicit launch prompts such as `kilo run --dir <repo> --model <provider/model> --agent code --format json` and instruct the Kilo worker to use Task-tool subagents only when the BOSS filescope marks the work as parallel-safe.
