# Goose Adapter

Generates Goose recipe YAML files from `commands/*.md`.

## Outputs

- `recipes/<command>.yaml` for project-local recipe loading or a configured `GOOSE_RECIPE_PATH`.

## Notes

- Goose recipes are project-oriented in this adapter. Use `--dest` for installs into a recipe directory.

## First-party MCP (generated)

Goose configures MCP as YAML `extensions` (`type: stdio`) in the user-global `~/.config/goose/config.yaml`. agent-surface generates and **non-destructively merges** Synapse + Grimoire there on a user-scope install (`install --target goose --scope user --category mcps`): existing keys, comments, and your other extensions are preserved; re-running is a no-op. External or secret-bearing MCPs remain opt-in. Run `npm run install:synapse` / `npm run install:grimoire` first to build the binaries. The merged block looks like:

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
