# Droid Adapter

Droid support targets Factory's current `.factory/` project/user surfaces.

## Outputs

- `skills/*/SKILL.md` -> `.agents/skills/<name>/SKILL.md`, the shared root Droid reads alongside `.factory/skills`
- `commands/*.md` -> `.factory/commands/<command>.md`
- always-on `rules/*.mdc` -> `AGENTS.md` for project installs, `.factory/AGENTS.md` for user installs
- scoped language rules -> `.factory/references/rules/<rule>.md`
- `subagents/*.md` -> `.factory/droids/<name>.md`
- first-party Synapse and Grimoire MCP wiring -> `.factory/mcp.json`
- optional external MCP wiring -> `.factory/mcp.json` only when explicitly requested
- optional external skill packs -> `.agents/skills/<skill>/...`

Canonical skills use Droid's automatic skill discovery. Available high-impact workflows stay commands.

Each command carries its source description as frontmatter, which Droid shows in its slash suggestions; without it Droid shows the body's first line. On Droid 0.244.0 (macOS arm64, user scope, `--category development`), `droid.list_commands` over `droid exec --input-format stream-jsonrpc` lists the five commands with their descriptions, where it listed each as `## OBJECTIVE` before. No message was sent to a model.

## External Packs

The Droid adapter wires selected optional upstream projects instead of leaving their submodules inert:

- `synapse` and `grimoire` are rendered by default as the first-party local MCP servers.
- External packs are copied into `.agents/skills/` by category: `sanyuan-skills` with `--category external`; `archify` and `sanyuan-development-skills` with `--category development`; `ctf-skills` and `codex-redteam-mode` with `--category cybersecurity`. The general sync copies none.
- `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Droid skill roots by default.

The adapter does not copy whole upstream repositories into Droid output. It copies native skill directories and the MCP registration needed for Droid to use them.

Generated Droid subagents render as normalized droid definitions without extra skill or MCP restrictions.

External skill directories are optional: they render only when the corresponding `external/*` submodule checkout is present.

Generated Droid instructions bundle only always-on rules. Language policies are distributed as references for project-aware commands to attach when applicable.
