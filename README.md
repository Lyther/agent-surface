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
npm run check
npm run test
npm run doctor
npm run build -- --target cline --dry-run
npm run build -- --target antigravity --dry-run
npm run build -- --target gemini-cli --dry-run
node scripts/agent-surface.mjs install --target cline --scope project --dry-run
node scripts/agent-surface.mjs install --target antigravity --scope user --dry-run
node scripts/agent-surface.mjs install --target gemini-cli --scope project --dry-run
```

`install` is dry-run-only for now. It prints the files that would be written, stale managed files that would be removed, and the manifest path that would track generated files. Live writes stay blocked until the dry-run plans and manifest cleanup are reviewed.

GitHub install smoke path:

```bash
npx github:Lyther/agent-surface check
npx github:Lyther/agent-surface inventory
```

## Next Milestone

Focus adapters in this order:

1. `cline`
2. `antigravity`
3. `gemini-cli`

These targets have the clearest command/workflow primitives right now. Add `agent-surface install --target <target> --dry-run` before writing to live dotfolders.
