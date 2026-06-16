# Cursor adapter

Native surfaces:

- global commands: `~/.cursor/commands/*.md`
- global rules: `~/.cursor/rules/*.mdc`
- project ignore: `.cursorignore` (rendered from `ignores/default.ignore`; emitted in `build` and by project-scope `--dest` installs. User-scope installs skip it as non-applicable. It uses `.gitignore` syntax and blocks indexing/Agent/Tab/@-mentions but not terminal or MCP tool access.)
- project MCP config: `.cursor/mcp.json` (rendered from `mcps/*.json` into the `mcpServers` shape with `type: "stdio"`; same project-scope rule as the ignore file)
- project hooks: `.cursor/hooks.json` (version 1) plus `.cursor/hooks/audit-log.sh`, rendered from `hooks/audit-log.sh`. The example wires observe-only events (`afterFileEdit`, `afterShellExecution`, `stop`) to `sh .cursor/hooks/audit-log.sh <event>`; the script is fail-open and metadata-only (logs only a timestamp and event name, always exits 0). Same project-scope rule as the ignore/MCP files.

The generated `.cursor/mcp.json` is project-scope only and secret-free; values must use `${env:VAR}` placeholders. The user-global `~/.cursor/mcp.json` is never auto-merged because it can contain secrets and live tool access; review it separately. Install blocks (does not clobber) a pre-existing project `.cursor/mcp.json`.

Skill support is tracked as manual in `registry/target-capabilities.json`; Cursor currently receives generated reusable behavior through command and rule files.
