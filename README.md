# agent-surface

Write your coding-agent setup **once**, render it into **every** agent host.

Reusable workflows, rules, subagents, external skill packs, ignore files, and first-party MCP services live once in this repo's source tree. `agent-surface` compiles them into the native formats of twenty-seven host targets - Claude Code, Codex, Cursor, Droid, Kilo, Kimi Code, Qoder, Qwen Code, Kiro, DSH, Zed, OpenCode, OpenHands, and more - so you maintain one source instead of twenty-seven bespoke configs.

It is a **source compiler**, not an app: there is no `src/`. Typed source primitives in → host-native surfaces out, validated by `check` and tracked by per-target manifests.

## Quick start

```bash
git submodule update --init --recursive   # external skill packs; check and tests read them
npm ci
npm run check                      # validate source, registry, generated output
npm run install:mcps               # installs, builds and links the Synapse/Grimoire servers the tests need
# one-time prerequisite for npm test: installs OpenOSINT (and uv, if absent) so the Qwen MCP case finds them
node scripts/agent-surface.mjs install --target droid --dest "$(mktemp -d)" --category mcps --service openosint -y
npm test                           # integration tests
npm run build -- --target all      # render every target into dist/
```

`npm test` also needs `python3` >= 3.11 on PATH: the generated Codex TOML is checked against Python's `tomllib`, an oracle independent of the generator, and macOS's `/usr/bin/python3` is 3.9. The check also tries `python3.13`, `python3.12` and `python3.11`, and otherwise fails naming this requirement.

`-y` lets the install run the prerequisite recipes: `uv` comes from Homebrew when `brew` is on PATH (macOS), otherwise from Astral's standalone installer (`curl`, into `~/.local/bin`; the only route on Linux), then `uv tool install openosint==2.27.0` with its provider extras. Both need network access and write to your real profile; skip them only if `uv` and `openosint-mcp` are already installed.

Preview an install before touching disk, then apply it:

```bash
node scripts/agent-surface.mjs install --target claude-code --scope user --dry-run
node scripts/agent-surface.mjs install --target claude-code --scope user --allow-scope-root
npm run install:mcps               # build + link the Synapse/Grimoire binaries the wired MCP configs point at
```

`install --no-mcps` renders every non-MCP output (skills, rules, commands, agents) and nothing else: no MCP server is wired, pruned or provisioned, no Synapse hook or launcher is written, and only `--dest` is touched. It is for render-only installs such as evaluation arms and CI, and it refuses `--service` and `--category mcps`.

The `install` step wires each host's MCP *config* to point at `~/.local/bin/synapse-bridge` and `~/.local/bin/grimoire-server`, and when either binary is missing it builds and links it through the registry recipe before writing any config. `npm run install:mcps` is the manual path: run it to rebuild the binaries after pulling MCP changes.

## What it does

- **Compiles source primitives** — `skills/`, manual-only `commands/`, `rules/`, `subagents/`, external packs, and `ignores/` become per-target outputs via explicit producers.
- **Speaks each host natively** — each target gets the surfaces it understands: commands, workflows, skills, instructions, plugins, rules, subagents, MCP config, or ignore files.
- **Wires first-party MCP** - Synapse (shared memory) and Grimoire (just-in-time skill retrieval) auto-merge, secretlessly and non-destructively, into all 25 MCP-capable hosts (JSON, TOML, and YAML config families).
- **Installs deterministically** — dry-run previews, project-scope gating, manifest tracking, generated-file strict-sync, and non-destructive config merges that preserve unknown sibling entries.

## Supported targets

Twenty-seven targets, ranked 1–5 by how much of the source model maps to native surfaces. The general sync delivers the six general-purpose skills and the first-party MCP wiring; with `--category development` (see [Install behavior](#install-behavior)) full adapters receive the canonical skill catalog, configured external skill packs, and every high-impact manual command; the intentionally limited DSH adapter receives skills only. Commands use a native explicit surface where one exists and an explicit-invocation compatibility skill otherwise.

**Full matrix - per-target surfaces and MCP wiring: [docs/reference/targets.md](docs/reference/targets.md).**

One additional target, `codex-plugin`, is an export format rather than a host: `build` renders a portable plugin package and the local marketplace manifest a host's own plugin manager consumes, and `install` refuses it. See [adapters/codex-plugin/README.md](adapters/codex-plugin/README.md).

Planned and out-of-scope hosts are listed at the end of [docs/reference/targets.md](docs/reference/targets.md).

## Project layout

```text
skills/      - Vanilla Agent Skills, model-invocable by default; a skill is a directory and may carry the reference material its SKILL.md points at
commands/    - High-impact workflows that require explicit user invocation
rules/       - Always-on or scoped behavior policy
subagents/   - Normalized subagent definitions
mcps/        - First-party MCP services (synapse, grimoire)
ignores/     - Project ignore templates
registry/    - Target, capability, asset-category, optional-service, and source-kind policy
schemas/     - JSON schemas for registry and workflow artifacts
scripts/     - CLI compiler and helpers
adapters/    - Per-target install docs (one README each)
hooks/       - Commit-message hook that strips AI attribution (install: CONTRIBUTING.md)
tests/       - Suites behind `npm test`: build, check, install matrix, MCP wiring
external/    - Reviewed git-submodule sources; registries decide what is distributed or indexed
```

The development profile includes five subagent roles:

| Role | Useful assignment |
|---|---|
| `explorer` | Locate and explain code, interfaces, and call paths. |
| `researcher` | Resolve a question using current primary sources and relevant probes. |
| `worker` | Deliver an implementation or artifact and check its behavior. |
| `reviewer` | Independently assess a change, design, or assumption. |
| `verifier` | Run a specific acceptance scenario or substantial test task. |

These are choices for delegation, not a required sequence. The parent handles planning and integration and can use the same role with different domain skills; each host's own settings pick a subagent's model. Small tasks can stay in the parent.

## Commands

```bash
node scripts/agent-surface.mjs inventory          # source counts
node scripts/agent-surface.mjs check              # full validation (skills, manual commands, rules, generated, registry)
node scripts/agent-surface.mjs doctor             # repo health summary
node scripts/agent-surface.mjs skills --json      # auto-invocable skill catalog (add --phase <phase> to filter)
node scripts/agent-surface.mjs commands --json    # explicit-only command catalog
node scripts/agent-surface.mjs build --target <t> --dry-run
node scripts/agent-surface.mjs install --target <t> --scope user --dry-run
```

`install` accepts repeated/comma-separated `--target` (or `--runtime`) IDs and `--category` selectors. Output selectors are `commands`, `rules`, `subagents`, `skills`, `recipes`, `mcps`, `external`, `instructions`, `prompts`, `plugins`, `ignores`, and `commands-as-workflows`. Asset selectors are `development`, `cybersecurity`, `private`; run asset and output selectors as separate installs. Omitting `--category` performs the general full sync; opt-in asset categories remain explicit. `--category everything` performs one full sync whose result is the general baseline plus `external` and every asset category, with the first-party MCPs, the categorized MCPs (Chrome DevTools, FenJing, OpenOSINT), and no optional service. `everything` and `--target all` must each be supplied alone, so `--category everything,development` and `--target all,codex` are rejected, and `--service` cannot accompany `everything`. `--category all` is retired and fails, because it was the general sync under a name that read like the full profile. `--service <id>` narrows the MCP services in an MCP or asset-category install without filtering its other assets.

## Install behavior

- Sync-oriented: existing managed files are overwritten; manifests let stale outputs be pruned on the next install.
- Ownership comes from every manifest in the install root. An existing file that no manifest claims blocks the install (`UNOWNED_DESTINATION`) instead of being overwritten; move or remove it and rerun. A file several targets own stays until the last owner releases it, and an interrupted install can be rerun to finish.
- `--target all` at project scope (the default) leaves out the hosts that only install into the home directory (codex, vscode, cursor, antigravity, antigravity-cli, trae, trae-cn, trae-cli) and prints one line for each; name one explicitly, or pass `--dest`, to plan it.
- A plan prints `counts:` per target and a `plan total:` over several; it lists only the files it would write or whose permissions it would change (execute bits only, from the file's own mode) and counts the unchanged ones and the stale paths already gone (`already gone`, apart from `remove`), so a re-run on an installed root is short.
- Project-only artifacts (`ignores/`) are skipped on user-scope installs — pass `--dest <project>` to write them.
- A live write to the real scope root needs `--allow-scope-root` (or an explicit `--dest`) after a dry-run.
- First-party secretless MCPs (Synapse, Grimoire) are generated by default for MCP-capable targets and **merged** into existing host config. Categorized MCPs require their asset category; other external/secret-bearing MCPs require `--category mcps --service <id>`.
- A full install establishes the general baseline. `--category everything` is the full profile in one command; omitting `--category` is still the general reset. From a clean profile it matches the three steps below. On an existing profile it is a single pass with no intermediate removal: each host keeps the fields its merge does not render (Codex keeps compatible operator fields such as `enabled = false` and `startup_timeout_sec` on a managed entry, which the sequence loses; transport keys such as `url` and `http_headers` are cleared when the entry returns to stdio), resets the fields its renderer writes (Kilo and OpenCode `enabled`; Goose `enabled` and `timeout`), and keeps unmanaged sibling entries. Otherwise `--category external` adds optional general skill packs; `--category development` adds coding workflows, development rules, subagents, and tools; `--category cybersecurity` adds the declared CTF/red-team packs and cybersecurity MCPs; `--category private` remains explicit. To build the profile in steps, run the general install first and then each desired category. A later general install intentionally removes previously managed opt-in files and config entries so the sequence defines the final profile. Large `source-pack` catalogs (`anthropic-cybersecurity-skills`, `rev-skills`, `hack-skills`) are not emitted into startup skill roots and are served just-in-time by Grimoire instead. Grimoire stays one on-demand index over every registered source pack; categories control native files and MCP selection, not row-level visibility inside that index.
- Install manifests in `.agent-surface/<target>-manifest.json` track generated files and owned MCP config entries. Full installs overwrite current generated assets, remove previously owned stale assets, and preserve unknown sibling config entries. Merged host policy fields are persistent operator settings, not reverse-restored lifecycle state.

For all assets with only the two primary MCPs, run the three steps instead of `everything`: the general full sync, then `--category external`, then `--category development,cybersecurity,private --service synapse,grimoire`. The initial full sync removes previously managed optional MCP entries; a service-filtered install by itself is additive and does not uninstall unselected services.

[REA](docs/runbooks/rea.md) adds optional reverse-engineering tools through `--category mcps --service rea`. Build the reviewed source revision first; the installer detects it and registers `rea mcp` without adding it to any default or asset-category profile.

## First-party MCP services

Built from `mcps/`, installed once, then auto-wired (non-destructive merge) into all 25 MCP-capable hosts across JSON/TOML/YAML config families - see [docs/reference/targets.md](docs/reference/targets.md):

- **Synapse** — shared multi-agent memory + file-lock coordination.
- **Grimoire** — read-only, just-in-time retrieval over large Agent-Skill packs (`anthropic-cybersecurity-skills`, `rev-skills`, and `hack-skills`) so the model searches instead of loading those catalogs at startup.

`install` provisions both before it wires anything: a missing binary is built and linked into `~/.local/bin` by the same run that merges each server into every host's MCP config, so one command is enough. (Synapse needs no service: its bridge autostarts the shared sidecar on first use.) `npm run install:mcps` still builds them directly, and `npm run install:synapse` / `install:grimoire` build just one. Details: [mcps/synapse/README.md](mcps/synapse/README.md), [mcps/grimoire/README.md](mcps/grimoire/README.md).

## Workflow kernel (optional)

`ops-flow` chooses the lightest safe profile: direct, standard single-owner development, writer-plus-reviewer, formal orchestration, or release proof. Only orchestrated/release profiles use the durable ledger under `.agent-surface/workflows/<run_id>/`; `workflow-runtime` qualifies external/native runtimes, `workflow-doctor` rejects schema, task-state, and liveness drift, and `verify-readiness` gates production-ready claims on real evidence.

Architecture-heavy work can stage model independence without the formal ledger: `arch-roadmap` (family A) -> `dev-spec` (fresh family B) -> `dev-core` (family A at xhigh/max) -> pause -> `dev-feature` (family A at lower effort or family C). `dev-core` proves one runnable architectural spine and stops before feature breadth.

`workflow-runtime` treats generated artifacts, skill discovery, provider authentication, permission mode, tool execution, world-state materialization, output shape, and MCP calls as separate gates. Generated subagents take the session's tools and permission mode on every host. Kilo and OpenCode config explicitly disables automatic session sharing. Kimi Code uses terminal Auto mode and the extension's highest persistent mode, YOLO. Codex receives canonical and manual workflows through its standard `.agents/skills` root: canonical skills, including the private `ops-server` skill when installed, allow implicit invocation, while the five committed high-impact workflows set `allow_implicit_invocation: false` and remain available through explicit `$<name>` invocation.

## More

- Per-target install detail: `adapters/<target>/README.md`.
- Source-kind and capability policy: `registry/source-kinds.json`, `registry/target-capabilities.json`.

## License

MIT
