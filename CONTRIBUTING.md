# Contributing

agent-surface compiles one source tree into 27 agent-host targets. Architecture: [docs/architecture.md](docs/architecture.md). Registries are the source of truth; `check` + `test` gate every change.

## Setup

```bash
npm ci
npm run check   # registry/schema/producer coherence
npm test        # full suite: build, check, install matrix, MCP wiring
```

The root compiler uses locked Ajv and JSONC/TOML/YAML format dependencies and supports Node >= 20.12. The MCP packages under `mcps/` need Node >= 22.17 (`node:sqlite`).

## The loop

1. Edit the authored source, not `dist/`.
2. `npm run check && npm test` — both must pass.
3. `npm run build -- --target <t>` and inspect `dist/<t>/` to eyeball output.
4. Branch, commit atomically (imperative subject), open a PR. Never commit to `main`; never push without the maintainer's go.

## Adding things

- **Command / rule / subagent** - add the file under `commands/`, `rules/`, or `subagents/`. It renders only through adapters that declare that source surface; update normalized subagent target flags when adding a target. Run `check` + `test`.
- **Target** — add the adapter entry (+ its producers) to `scripts/agent-surface/targets.mjs`, its render fns to `scripts/agent-surface/render.mjs`, and its install root to `scripts/agent-surface/roots.mjs`; then a matching entry in **`registry/targets.json`** (`renders` tokens) and **`registry/target-capabilities.json`** (`generated_render_tokens` + `surfaces`). The three must agree — `check` enforces it. Add an `adapters/<target>/README.md` and snapshot assertions in `tests/`.
- **MCP wiring for a host** — add `mcpConfig` to the adapter in `targets.mjs` (`relativeOutput`, `format`, `defaultEnabled`; `scopes`/`emitOutput` as needed), with the merge logic in `scripts/agent-surface/merge.mjs`, and add the `mcps` token to both registries. New config formats need a **non-destructive merge** that preserves siblings/comments, is idempotent, and **blocks (never corrupts)** on an ambiguous shape — plus a merge test. Then classify the target `generated` in `surfaces.mcp`.
- **External skill pack** — add it as a pinned submodule under `external/` and a `skill-pack` entry with `skill_roots` in `registry/optional-services.json`. Large packs that shouldn't load at startup stay `source-pack` (no `skill_roots`) and are served by an MCP via `served_by`.
- **First-party MCP service** — build it under `mcps/<name>/` (own `package.json`/tests/`install.mjs`) and declare it `first_party kind:"mcp"` in `optional-services.json`. It rides the shared distribution rails into all MCP-capable hosts.

## Rules

- **Merge, never clobber.** The compiler owns only the keys it writes; user sibling values and comments outside regenerated owned subtrees are preserved.
- **Honest matrix.** Every target is `generated` / `manual` / `not-generated` / `not-applicable` with a reason in `target-capabilities.json` — no silent gaps.
- **Evidence, not invention.** Docs claims trace to a file/command/config; unknowns are marked, not guessed.
- **CI is the gate.** `check`, `test`, `build --target all`, and the MCP package suites must be green before merge.

## Writing rules, skills, and commands

Every always-on rule is paid on every turn of every host, every skill description in every session, and a skill body each time it loads. Longer context and more instructions lower compliance ([IFScale](https://arxiv.org/abs/2507.11538), [Levy 2024](https://arxiv.org/abs/2402.14848), [Context Rot](https://research.trychroma.com/context-rot)), and focused skills outperform exhaustive ones ([SkillsBench](https://arxiv.org/abs/2602.12670)). Write for a capable model: keep only what it would get wrong without the line.

- **Budget.** Keep the always-on bundle well under the hosts' limits (Codex reads 32 KiB of a project `AGENTS.md`; `check rules` reports approximate tokens). A skill description is one or two sentences, trigger first, saying what the skill does and when to use it rather than a sibling. A `SKILL.md` body stays under 500 lines and about 5,000 tokens; reference material moves into `references/` files, one level deep ([Agent Skills](https://agentskills.io/specification)).
- **One home per rule.** State each obligation once and point to it (`06-test-policy`, `05-tooling`); copies drift, and contradictions make a model pick one arbitrarily or spend reasoning reconciling them. Skills and commands install on hosts that render no rules, so one states inline what it depends on (a report's fields, a gate's command); a rule pointer only supplements it.
- **Plain imperatives.** One concrete instruction per sentence (a command, path, or value), positive where possible, with its scope stated. No rationale essays, slogans, personas, hype, or ALL-CAPS emphasis: emphasis makes models over-apply a rule. Put the most important lines first.
- **Add on evidence.** Add an instruction for an observed failure mode, a precedence or trust boundary, tool use, or completion criteria; delete one the model already follows, but never drop a concrete, failure-preventing instruction only to hit a token target. To judge a block, remove it and rerun the same task.
- **No contradictions.** When two instructions can collide, say which wins. Snippets must run as written, and every referenced skill, command, flag, or file must exist; adapters include, rewrite, or fail on a dangling command reference rather than emit it.
- **Enforce never-rules in tooling.** A ban that matters belongs in a hook, deny rule, or check, with the prose pointing to it.
- **Author guidance stays here.** Advice about writing rules belongs in this file, not in always-on rules.

## Commit-message hook

`hooks/strip-ai-attribution.sh` removes AI attribution, co-author trailers, and vendor advertising from commit messages; `tests/suites/hooks.test.mjs` covers it. It is not installed by `npm ci`. To run it on every commit in this checkout:

```bash
git config core.hooksPath hooks
printf '#!/bin/sh\nexec "$(dirname "$0")/strip-ai-attribution.sh" "$1"\n' > hooks/prepare-commit-msg
chmod +x hooks/prepare-commit-msg
```

`hooks/prepare-commit-msg` is ignored by Git, so the wrapper stays local. Use `strip-ai-attribution.sh --check <file>` to reject instead of rewrite.
