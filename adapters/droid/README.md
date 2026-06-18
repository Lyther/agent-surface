# Droid Adapter

Droid support targets Factory's current `.factory/` project/user surfaces.

## Outputs

- `commands/*.md` -> `.factory/commands/<command>.md`
- `rules/*.mdc` -> `AGENTS.md` for project installs, `.factory/AGENTS.md` for user installs
- `subagents/*.md` -> `.factory/droids/<name>.md`
- optional external MCP wiring -> `.factory/mcp.json`
- optional external skill packs -> `.factory/skills/<skill>/...`

Commands stay commands. They are intentionally not converted to skills because
agent-surface commands use a flat prefixed namespace such as `ops-flow` and
`workflow-boss`.

## External Packs

The Droid adapter wires selected optional upstream projects instead of leaving
their submodules inert:

- `agentmemory` is rendered as an MCP server using the locally patched
  `~/.local/bin/agentmemory-mcp` binary.
- `sanyuan-skills`, `andrej-karpathy-skills`, `ctf-skills`, and the selected
  `pua` skills are copied into `.factory/skills/`.

The adapter does not copy whole upstream repositories into Droid output. It
copies native skill directories and the MCP registration needed for Droid to
use them.

External skill directories are optional: they render only when the corresponding
`external/*` submodule checkout is present. Packaged npm installs still render
the core Droid command, rule, subagent, and MCP surfaces without bundling those
submodule payloads.
