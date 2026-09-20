# Goose Adapter

Generates native Agent Skills for safe reusable procedures. Available high-impact manual commands become Goose recipes in project scope and explicit-invocation compatibility skills in user scope, so recipes are never written directly into `$HOME`.

## Outputs

- `~/.agents/skills/<name>/SKILL.md` or `.agents/skills/<name>/SKILL.md`
- reviewed external packs under the same native skill root
- `recipes/<command>.yaml` for project-local manual recipe loading or a configured `GOOSE_RECIPE_PATH`.

## Notes

- Goose recipes are project-oriented in this adapter. Use `--dest` for installs into a recipe directory.

## First-party MCP (generated)

Goose configures MCP as YAML `extensions` (`type: stdio`) in the user-global `~/.config/goose/config.yaml`. agent-surface generates and **non-destructively merges** Synapse + Grimoire there on a user-scope install (`install --target goose --scope user --category mcps --allow-scope-root`): existing keys, comments, and your other extensions are preserved; re-running is a no-op. External or secret-bearing MCPs remain opt-in. Missing first-party binaries are built and linked through the registry recipe before any config is written. The merged block looks like:

```yaml
extensions:
  grimoire:
    name: grimoire
    type: stdio
    cmd: ~/.local/bin/grimoire-server
    args: []
    enabled: true
    timeout: 300
  synapse:
    name: synapse
    type: stdio
    cmd: ~/.local/bin/synapse-bridge
    args: []
    enabled: true
    timeout: 300
```
