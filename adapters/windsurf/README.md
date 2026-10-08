# Windsurf Adapter

Generates Windsurf workflows, rules, and local skills.

Status: deprecated. Devin Desktop (formerly Windsurf) removed the Cascade harness in 3.9.19 on 2026-09-08 ([changelog](https://docs.devin.ai/desktop/changelog)). This adapter targets existing Cascade installs only; it is not Devin Local or CLI support. `--target all` leaves it out and says so, `build` refuses it, and an explicit `install --target windsurf` still works. Install plans show the `WINDSURF_CASCADE_LEGACY` and `WINDSURF_RULE_SIZE_LIMITS` notices.

Cascade documents a 6,000-character global rules file and 12,000 characters per workspace rule file ([limits](https://docs.devin.ai/desktop/cascade/memories)). The installer refuses a selected rules file over its scope's limit before writing anything (`OUTPUT_LIMIT_EXCEEDED`): user-scope rules and any development rules exceed them, while a project-scope general install fits. At user scope, leave rules out with `--category skills,commands-as-workflows,external,mcps`.

Devin CLI 3000.11.3 lists this adapter's user skills, `global_rules.md` and `mcp_config.json` through its default imports, and the same kinds of files from the targets `--target all` keeps, so agent-surface has no separate Devin target. That is listing evidence only: no signed-in Devin task was run ([contract](../../docs/contracts/runtime-refresh.md#cascade-compatibility-and-devin)).

## Outputs

- User: `.codeium/windsurf/global_workflows/<command>.md`
- User: `.codeium/windsurf/memories/global_rules.md`
- User: `.codeium/windsurf/references/rules/<rule>.md`
- User: `.codeium/windsurf/skills/<name>/SKILL.md`
- User: `.codeium/windsurf/skills/<external-skill>/...`
- User merge: `.codeium/windsurf/mcp_config.json` `mcpServers.{synapse,grimoire}`
- Project: `.windsurf/workflows/<command>.md`
- Project: `.devin/rules/agent-surface.md`
- Project: `.windsurf/references/rules/<rule>.md`
- Project: `.windsurf/skills/<name>/SKILL.md`
- Project: `.windsurf/skills/<external-skill>/...`
- Project merge: `.windsurf/mcp_config.json` `mcpServers.{synapse,grimoire}`

## Notes

- Canonical skills remain auto-discoverable. Only available high-impact commands render as manual workflows.
- First-party MCP wiring (Synapse and Grimoire) is generated and safely merged. External or secret-bearing MCPs remain opt-in.
- Generated rules bundle only always-on policy. Scoped language policies are reference files for project-aware commands.
