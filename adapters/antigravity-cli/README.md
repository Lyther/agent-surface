# Antigravity CLI plugin adapter

Packages canonical skills, explicit high-impact workflow skills, rules, scoped references, subagents, external skills, and first-party MCP wiring under Antigravity CLI's active staged-plugin root:

- `~/.gemini/antigravity-cli/plugins/agent-surface/plugin.json`
- `~/.gemini/antigravity-cli/plugins/agent-surface/skills/<name>/SKILL.md`
- `~/.gemini/antigravity-cli/plugins/agent-surface/agents/<name>.md`
- `~/.gemini/antigravity-cli/plugins/agent-surface/rules/<rule>.md`
- `~/.gemini/antigravity-cli/plugins/agent-surface/references/rules/<rule>.md`
- `~/.gemini/antigravity-cli/plugins/agent-surface/mcp_config.json`

Validate and register the staged plugin with:

```bash
agy plugin validate ~/.gemini/antigravity-cli/plugins/agent-surface
agy plugin install ~/.gemini/antigravity-cli/plugins/agent-surface
agy plugin list
```

Native result, Antigravity CLI 1.4.2 on macOS arm64, 2026-10-18: `plugin validate --json` on the staged user plugin in an isolated home exits 0 with six rules, six agents, two MCP servers and no errors, after each rule gained `trigger: always_on` (before: six "no valid trigger" errors and zero rules). Nine warnings remain for skill bodies over the 24,000 bytes Antigravity loads. Validation only; GUI and agent use are not tested.

The install command creates Antigravity's runtime-owned imported copy and registry entry; agent-surface owns only the staged source above. The prior direct `~/.gemini/config/plugins/agent-surface` output could validate as a directory without being registered, so agent-surface no longer writes that route. Gemini CLI is also retired from the target portfolio and is not valid proof for this adapter.

Reference: [Antigravity CLI plugins](https://antigravity.google/docs/cli/plugins/)
