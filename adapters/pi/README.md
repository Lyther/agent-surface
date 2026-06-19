# Pi Adapter

Generates Pi Agent Skills and instruction files.

## Outputs

- User: `.pi/agent/skills/<command>/SKILL.md`, `.pi/agent/AGENTS.md`
- Project: `.pi/skills/<command>/SKILL.md`, `AGENTS.md`
- External skills mirror into the same skill root.

## Notes

- Pi supports the Agent Skills format and reads `AGENTS.md`.
- Subagents are not generated because Pi does not enable sub-agent behavior by default.
