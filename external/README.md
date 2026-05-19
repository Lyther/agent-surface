# Optional External Services

This directory contains optional git submodules that can be wired into local agents and IDEs around `agent-surface`. They are not part of the core compiler surface, and core builds must continue to work without initializing these submodules.

The authoritative optional-service inventory is `registry/optional-services.json`.

## Current Optional Submodules

| Service | Path | Kind | Local wiring |
| --- | --- | --- | --- |
| agentmemory | `external/agentmemory` | MCP memory service | Codex, Cursor, Gemini, Claude Code, and OpenCode MCP configs point at `/Users/bytedance/.local/bin/agentmemory-mcp` |
| sanyuan-skills | `external/sanyuan-skills` | skill pack | Codex/agent and Claude skill symlinks for all six skills |
| andrej-karpathy-skills | `external/andrej-karpathy-skills` | skill pack | Codex/agent and Claude skill symlinks for `karpathy-guidelines` |
| ctf-skills | `external/ctf-skills` | skill pack | Codex/agent and Claude CTF skill symlinks |
| pua | `external/pua` | behavior pack | Narrow Codex/agent and Claude wiring for `pua` and `pua-en` only |

## Security Notes

- `agentmemory` is optional-caution. The public upstream had multiple security issues in the 0.9.14 and 0.9.15 artifacts documented by the private disclosure bundle at `/tmp/agentmemory-disclosure-0.9.15/`. Use the locally patched installed binary for MCP wiring; do not replace it with npm latest without review.
- `pua` is optional-caution. It can increase token usage and may reduce model performance on ordinary tasks, so only the narrow `pua` and `pua-en` skills are wired by default.
- Do not commit private disclosure files, secrets, local MCP credentials, or generated agent config files from home-directory installs.
