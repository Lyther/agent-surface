# Windsurf Adapter

Generates Windsurf workflows, rules, and local skills.

Status: Devin Desktop (formerly Windsurf) removed the Cascade harness in 3.9.19 on 2026-09-08 ([changelog](https://docs.devin.ai/desktop/changelog)). This adapter targets existing Cascade installs only; it is not Devin Local or CLI support. Cascade documents a 6,000-character global rules file and 12,000 characters per workspace rule file ([limits](https://docs.devin.ai/desktop/cascade/memories)); user-scope and development rules exceed them, while a project-scope general install fits. Install and build plans show the `WINDSURF_CASCADE_LEGACY` and `WINDSURF_RULE_SIZE_LIMITS` notices.

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
