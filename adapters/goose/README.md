# Goose Adapter

Generates Goose recipe YAML files from `commands/*.md`.

## Outputs

- `recipes/<command>.yaml` for project-local recipe loading or a configured `GOOSE_RECIPE_PATH`.

## Notes

- Goose recipes are project-oriented in this adapter. Use `--dest` for installs into a recipe directory.
- MCP and extension wiring stays manual until a concrete local config merge policy is added.
