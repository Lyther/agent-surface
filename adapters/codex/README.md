# Codex adapter

Canonical skills are emitted unchanged to Codex, normalized subagent sources become custom agents, and rule sources become global instructions. Codex documents that its CLI and IDE extension share one configuration, and that the ChatGPT desktop app shares their MCP configuration, so one target covers them; the extension and desktop app are backed only by that documentation here, and Codex cloud is not targeted. Installs go to the default `~/.codex` and `~/.agents`; `CODEX_HOME` is not followed, and project paths exist only through `--dest`.

Implemented target paths:

- user: `~/.agents/skills/<name>/SKILL.md`
- user: `~/.agents/skills/<name>/agents/openai.yaml`
- explicit-only skills: `~/.agents/skills/<name>/SKILL.md`
- explicit-only policy: `~/.agents/skills/<name>/agents/openai.yaml`
- user (project via `--dest`): `.codex/agents/<name>.toml`
- user: `~/.codex/AGENTS.md` for always-on rules (a `--dest` project install also writes `.codex/AGENTS.md` there, which Codex does not discover; Codex reads a project's `AGENTS.md` files from the repository root down)
- user: `~/.codex/references/rules/<rule>.md` for scoped language references
- user (project via `--dest`) merge: `.codex/config.toml` `[mcp_servers.{synapse,grimoire}]`, plus `approval_policy = "never"` and `sandbox_mode = "danger-full-access"`

Canonical skills and explicit-only high-impact workflows share the Agent Skills root. Their `agents/openai.yaml` sets `allow_implicit_invocation` to `true` or `false`; explicit-only workflows remain available through `$<name>` but Codex does not invoke them automatically. Custom agents render as standalone TOML files with `name`, `description`, `developer_instructions`, and `sandbox_mode`.

External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Codex skill roots by default.

Generated `AGENTS.md` intentionally bundles only `alwaysApply: true` rules, including cybersecurity policy. Language policies are emitted as references for project-aware commands to attach when the current repository files match their globs.

First-party MCP wiring (Synapse and Grimoire) is generated and safely merged into `config.toml`. Codex reads a project's config only in trusted projects. External or secret-bearing MCPs remain opt-in.
