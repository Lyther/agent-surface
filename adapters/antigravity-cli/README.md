# Google CLI extension adapter

Render `commands/*.md` as Gemini/Antigravity-transition extension skills, package shared rules as extension context, and include normalized subagents.

Default user install target:

- `~/.gemini/extensions/agent-surface/gemini-extension.json`
- `~/.gemini/extensions/agent-surface/GEMINI.md`
- `~/.gemini/extensions/agent-surface/skills/<name>/SKILL.md`
- `~/.gemini/extensions/agent-surface/agents/<name>.md`

Google announced that consumer Gemini CLI users should migrate to Antigravity CLI by June 18, 2026. The locally verified command surface is Gemini CLI 0.46.0, whose extension reference loads extensions from `~/.gemini/extensions/<name>` with a `gemini-extension.json` manifest and optional `skills/`, `agents/`, hooks, commands, MCP, policies, and context.

The local `antigravity` binary still exposes desktop-style `chat` behavior. Treat it as interactive-supervised. Validate this generated extension with `gemini extensions validate <path>` before relying on it in live Google CLI sessions.
