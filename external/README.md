# External Services

This directory contains git submodules wired into local agents and IDEs around `agent-surface`. They are not part of the core compiler surface: core builds still work without initializing them.

Source-packs with `status: required` and `served_by: ["grimoire"]` in the registry (currently `anthropic-cybersecurity-skills`, `rev-skills`, and `hack-skills`) must be initialized for `npm run install:grimoire`. Other externals remain optional.

The authoritative optional-service inventory is `registry/optional-services.json`.

## Current Submodules

Registered entries come from `registry/optional-services.json` and follow its distribution and indexing rules. Reference-only checkouts are kept for evaluation and are neither distributed nor indexed.

| Path | Upstream | Role |
| --- | --- | --- |
| `external/addyosmani-agent-skills` | https://github.com/addyosmani/agent-skills.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/andrej-karpathy-skills` | https://github.com/multica-ai/andrej-karpathy-skills.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/anthropic-cybersecurity-skills` | https://github.com/mukul975/Anthropic-Cybersecurity-Skills.git | `anthropic-cybersecurity-skills`: source-pack, indexed by Grimoire |
| `external/archify` | https://github.com/tt-a1i/archify.git | `archify`: skill-pack (opt-in) |
| `external/caveman` | https://github.com/JuliusBrussee/caveman.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/claude-red` | https://github.com/SnailSploit/Claude-Red.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/codex-redteam-mode` | https://github.com/chAng-L19/codex-redteam-mode.git | `codex-redteam-mode`: skill-pack |
| `external/ctf-skills` | https://github.com/ljagiello/ctf-skills.git | `ctf-skills`: skill-pack |
| `external/dsh-pentest` | https://github.com/howmp/dsh-pentest.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/ecc` | https://github.com/affaan-m/ECC.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/graphify` | https://github.com/Graphify-Labs/graphify.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/hack-skills` | https://github.com/yaklang/hack-skills | `hack-skills`: source-pack, indexed by Grimoire |
| `external/ida-skill` | https://github.com/miunasu/IDA-Skill.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/mattpocock-skills` | https://github.com/mattpocock/skills.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/raptor` | https://github.com/gadievron/raptor.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/rev-skills` | https://github.com/Lyther/rev-skills.git | `rev-skills`: source-pack, indexed by Grimoire |
| `external/reverse-skill` | https://github.com/zhaoxuya520/reverse-skill.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/rtk` | https://github.com/rtk-ai/rtk.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/sanyuan-skills` | https://github.com/sanyuan0704/sanyuan-skills.git | `sanyuan-skills`: skill-pack (opt-in); `sanyuan-development-skills`: skill-pack (opt-in) |
| `external/superpowers` | https://github.com/obra/superpowers.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/trailofbits-skills` | https://github.com/trailofbits/skills.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/understand-anything` | https://github.com/Egonex-AI/Understand-Anything.git | reference only: not distributed or indexed; evaluated source kept pinned |
| `external/x64dbg-mcp-server` | https://github.com/duty1g/x64dbg-mcp-server.git | reference only: not distributed or indexed; evaluated source kept pinned |

## Security Notes

- Do not commit private disclosure files, secrets, local MCP credentials, or generated agent config files from home-directory installs.
