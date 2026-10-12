# Kilo adapter

Canonical skills use Kilo's native skill root. Available high-impact commands remain custom command files; rules and subagents retain their native surfaces.

Implemented target paths:

- user: `~/.config/kilo/commands/*.md`
- user: `~/.kilo/skills/<name>/SKILL.md`
- user: `~/.config/kilo/agents/*.md`
- user: `~/.config/kilo/rules/*.md` for the 6 always-on rules
- user: `~/.config/kilo/references/rules/*.md` for scoped language references
- user merge: `~/.config/kilo/kilo.jsonc` `instructions += "~/.config/kilo/rules/<rule>.md"` for always-on rules and `mcp.{synapse,grimoire}` for first-party MCP
- project: `.kilo/commands/*.md`
- project: `.kilo/skills/<name>/SKILL.md`
- project: `.kilo/agents/*.md`
- project: `.kilo/rules/*.md` for the 6 always-on rules
- project: `.kilo/references/rules/*.md` for scoped language references
- project merge: `kilo.jsonc` `instructions += ".kilo/rules/<rule>.md"` for always-on rules and `mcp.{synapse,grimoire}` for first-party MCP
- project: `.kilocodeignore` (rendered from `ignores/default.ignore`; user-scope installs skip it as non-applicable)
- custom: any reviewed `--dest` path

Kilo workflows are Markdown slash commands. The extension Rules UI is backed by the `instructions` array in `kilo.jsonc`, so the installer merges an explicit ordered list of generated always-on rule files and preserves unrelated top-level config keys. Full installs deliberately own `permission` and `share`: `permission` is merged with `{ "*": "allow" }` (an existing narrower entry such as a per-tool `ask` survives the merge, because kilo declares no `replaceRootProperties`), and sharing is disabled. Category-only MCP or rule installs leave those host-wide controls untouched. Older generated `AGENTS.md` and `agent-surface.md` rule outputs are removed as stale managed files during full installs when the manifest proves they are safe to remove.

Kilo resolves a relative `instructions` entry against the project directory, even in the user config, and expands a leading `~/`. User entries therefore name the rules by home path. An install that selects rules drops the `./rules/<rule>.md` entries earlier versions wrote, registers the home path of each rule it selects, and keeps the operator's own entries. Qualified on Kilo CLI 7.8.8 (Linux x64, 2026-10-12) with one model turn per case:

- An entry `./rules/<probe>.md` in the user config loaded the project's `rules/<probe>.md`, never `~/.config/kilo/rules/<probe>.md`. With the entry removed, the project file did not load.
- An absolute entry loaded.
- A `~/.config/kilo/rules/<probe>.md` entry loaded from a project subdirectory.

Build/check previews include a generated `kilo.jsonc` so the `dist/kilo` tree is self-contained. Live installs merge `kilo.jsonc` instead of overwriting user config. Cybersecurity policy is always-on; scoped language policies are reference files only, and project-aware commands decide whether to attach them.

First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into the top-level `mcp` map. External or secret-bearing MCPs remain opt-in. Canonical skills and reviewed external skill packs use Kilo's native skill root; manual commands are not copied into the skill catalog.

The current subagent batch emits `subagents/{boss,researcher,analyzer,adversary,reviewer,worker}.md` as Kilo `mode: subagent` markdown files. Runtime/model assignment is intentionally prompt-level or user-configured. `agent-surface` should not add provider-specific model keys to `kilo.jsonc` unless Kilo's current schema accepts them. For monitored workflow runs, prefer explicit launch prompts such as `kilo run --dir <repo> --model <provider/model> --agent code --format json` and instruct the Kilo worker to use Task-tool subagents only when the BOSS filescope marks the work as parallel-safe.

`anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Kilo skill roots by default. Future access should be explicit command/workflow conversion or a just-in-time MCP service.
