# Contributing

agent-surface compiles one source tree into 20 agent-host targets. Architecture: [docs/architecture.md](docs/architecture.md). Registries are the source of truth; `check` + `test` gate every change.

## Setup

```bash
npm ci
npm run check   # registry/schema/producer coherence
npm test        # behaviour snapshots
```

No runtime dependencies. Node 20 runs the repo; the MCP packages under `mcps/` need Node ≥ 22.17 (`node:sqlite`).

## The loop

1. Edit the authored source, not `dist/`.
2. `npm run check && npm test` — both must pass.
3. `npm run build -- --target <t>` and inspect `dist/<t>/` to eyeball output.
4. Branch, commit atomically (imperative subject), open a PR. Never commit to `main`; never push without the maintainer's go.

## Adding things

- **Command / rule / subagent** — add the file under `commands/`, `rules/`, or `subagents/`. It renders to every target automatically. Run `check` + `test`.
- **Target** — add an adapter block in `scripts/agent-surface.mjs` (render fns + install root + producers) and a matching entry in **`registry/targets.json`** (`renders` tokens) and **`registry/target-capabilities.json`** (`generated_render_tokens` + `surfaces`). The three must agree — `check` enforces it. Add an `adapters/<target>/README.md` and snapshot assertions in `tests/`.
- **MCP wiring for a host** — add `mcpConfig` to the adapter (`relativeOutput`, `format`, `defaultEnabled`; `scopes`/`emitOutput` as needed) and add the `mcps` token to both registries. New config formats need a **non-destructive merge** that preserves siblings/comments, is idempotent, and **blocks (never corrupts)** on an ambiguous shape — plus a merge test. Then classify the target `generated` in `surfaces.mcp`.
- **External skill pack** — add it as a pinned submodule under `external/` and a `skill-pack` entry with `skill_roots` in `registry/optional-services.json`. Large packs that shouldn't load at startup stay `source-pack` (no `skill_roots`) and are served by an MCP via `served_by`.
- **First-party MCP service** — build it under `mcps/<name>/` (own `package.json`/tests/`install.sh`) and declare it `first_party kind:"mcp"` in `optional-services.json`. It rides the shared distribution rails into all MCP-capable hosts.

## Rules

- **Merge, never clobber.** The compiler owns only the keys it writes; user entries and comments are preserved.
- **Honest matrix.** Every target is `generated` / `manual` / `not-generated` / `not-applicable` with a reason in `target-capabilities.json` — no silent gaps.
- **Evidence, not invention.** Docs claims trace to a file/command/config; unknowns are marked, not guessed.
- **CI is the gate.** `check`, `test`, `build --target all`, and the MCP package suites must be green before merge.
