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

Native result, Antigravity CLI 1.4.2 on macOS arm64, 2026-10-19: for a skill body over 24,000 bytes, `plugin validate --json` warns that "only the first 24000 are loaded", and the end it drops is where skills keep their closing rules. Validation only; no agent session was run to observe the cut. Four of the nine warnings above were canonical skills and none is now: `npm run check` rejects a canonical skill body over the limit, and `arch-diagram`, `dev-feature`, `lint-kernel` and `ops-swarm` keep their background, templates and send checklist in `references/`. The other five are external skills, which by the validator's account load cut short: from ctf-skills, `ctf-crypto` (38,318 bytes) and `ctf-forensics` (35,973) lose their later technique sections and `ctf-misc` (25,470) the end of its cipher-identification workflow and its last four tricks; `diagram-design` (29,826) loses its create, import, output and export steps; and `sigma` (24,729) from sanyuan-skills loses the end of its notes.

The install command creates Antigravity's runtime-owned imported copy and registry entry; agent-surface owns only the staged source above. The prior direct `~/.gemini/config/plugins/agent-surface` output could validate as a directory without being registered, so agent-surface no longer writes that route. Gemini CLI is also retired from the target portfolio and is not valid proof for this adapter.

Reference: [Antigravity CLI plugins](https://antigravity.google/docs/cli/plugins/)
