# agent-surface

Typed source and adapter compiler for coding-agent rules, commands, skills, subagents, hooks, MCP config, settings, ignores, and plugin bundles.

## Model

`commands/` is the canonical home for user-invoked reusable procedures. Target adapters may render the same source as Claude commands, Gemini commands, Cline workflows, Antigravity workflows, Codex skills, or another native primitive.

`rules/` contains always-on or scoped behavior policy.

The other source folders are kept deliberately so new agent primitives can be added without reshaping the project:

- `skills/`
- `subagents/`
- `hooks/`
- `mcps/`
- `settings/`
- `ignores/`
- `plugins/`
- `registry/`
- `schemas/`

## Current Scope

In scope:

- Claude Code
- Codex
- Gemini CLI
- Cline
- Antigravity
- OpenCode, behind primitive verification
- VS Code generic settings
- Cursor
- GitHub Copilot
- Trae

Out of scope:

- Roo Code
- Windsurf
- VSCodium
- Positron
- Void

## Commands

```bash
npm run inventory
npm run build -- --target cline --dry-run
npm run build -- --target antigravity --dry-run
```

## Next Milestone

Focus adapters in this order:

1. `cline`
2. `antigravity`
3. `gemini-cli`

These targets have the clearest command/workflow primitives right now. Add `agent-surface install --target <target> --dry-run` before writing to live dotfolders.
