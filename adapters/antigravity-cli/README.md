# Antigravity CLI adapter

Render `commands/*.md` as Antigravity CLI plugin skills and package shared rules into the plugin.

Default user install target:

- `~/.gemini/antigravity-cli/plugins/agent-surface/plugin.json`
- `~/.gemini/antigravity-cli/plugins/agent-surface/skills/*.md`
- `~/.gemini/antigravity-cli/plugins/agent-surface/rules/*.md`

Google announced that consumer Gemini CLI users should migrate to Antigravity CLI by June 18, 2026. This target owns the latest replacement surface; the `gemini-cli` target is retained only as a legacy transition export.

The local `agy` binary observed during this migration still exposes a desktop-style CLI, so plugin install/validate should remain behind dry-run review until the local Antigravity CLI package manager is available.
