# Changelog

Notable changes to agent-surface and its first-party MCP services. Format: [Keep a Changelog](https://keepachangelog.com/); the repo is pre-1.0 and unreleased changes land on `main`.

## [Unreleased]

### Added

- **Grimoire MCP (v0.1)** — read-only, just-in-time retrieval over large Agent-Skill packs. Serves the 754-skill `anthropic-cybersecurity-skills` pack from a self-contained `node:sqlite` FTS5 index so the model searches for a skill instead of loading a 750-entry startup catalog. 4 tools (`grimoire_search`/`list`/`get`/`file_get`), build-on-install index, real-pack eval gate (hit@5 0.80 / MRR 0.686). See `mcps/grimoire/`.
- **First-party MCP auto-wiring across all 17 MCP-capable hosts** — Synapse + Grimoire are generated and **non-destructively merged** into each host's native config across JSON, TOML, and YAML families. Adds VSCodium, Grok Build, Antigravity CLI (JSON) and Goose, Poolside (YAML, via a new safe block-merge that preserves keys/comments/siblings and is idempotent). Full matrix: `docs/reference/targets.md`.
- **`doctor` MCP health** — checks linked binaries, the synapse sidecar, and grimoire **index freshness** (installed manifest pin vs the repo registry pin).
- **CI** — a Node-22 `mcp` job runs the grimoire (incl. real-pack eval) and synapse package suites + audits on every PR.

### Changed

- **`/ops:docs` command** rewritten to the Diátaxis + minimalism model: aggressive, repo-fit, opinionated on a clean/less-is-more house style (653 → 159 lines).
- **README** rewritten lean (203 → ~100 lines); the full target matrix moved to `docs/reference/targets.md`.

### Fixed

- **MCP opt-in** — `--category mcps` without `--service` now selects first-party services only; external/secret-bearing MCPs (e.g. `agentmemory`) require an explicit `--service`.
- **Install correctness** — `grimoire-index` wrapper resolves the real entrypoint (derived from `package.json#bin`); a missing required pack fails the install (exit 1) non-destructively instead of silently succeeding.

## Components

- Synapse MCP: `v0.4.0` (shared multi-agent memory + file-lock coordination) — `mcps/synapse/`.
- Grimoire MCP: `v0.1.0` (just-in-time skill retrieval) — `mcps/grimoire/`.
