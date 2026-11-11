# External Services

This directory contains git submodules wired into local agents and IDEs around `agent-surface`. Run `git submodule update --init --recursive` before `build` or a category install: both fail on an uninitialized registered pack.

Source-packs with `status: required` and `served_by: ["grimoire"]` in the registry (currently `anthropic-cybersecurity-skills`, `rev-skills`, and `hack-skills`) must be initialized for `npm run install:grimoire`. The optional `trailofbits-static-analysis` (the static-analysis subset of `trailofbits-skills`) and `tech-leads-club` packs are served the same way when their submodules are present and skipped without error when absent. Other externals remain optional.

The authoritative optional-service inventory is `registry/optional-services.json`.

## Current Submodules

Every submodule backs an entry in `registry/optional-services.json` and follows its distribution and indexing rules. To update a pack, move its submodule to the new upstream commit and set the same commit as the entry's `commit`; `check` fails while a pack's checked-out submodule, or a required pack's staged gitlink, differs from its pin.

| Path | Upstream | Role |
| --- | --- | --- |
| `external/anthropic-cybersecurity-skills` | <https://github.com/mukul975/Anthropic-Cybersecurity-Skills.git> | `anthropic-cybersecurity-skills`: source-pack, indexed by Grimoire |
| `external/archify` | <https://github.com/tt-a1i/archify.git> | `archify`: skill-pack (opt-in) |
| `external/codex-redteam-mode` | <https://github.com/chAng-L19/codex-redteam-mode.git> | `codex-redteam-mode`: skill-pack |
| `external/ctf-skills` | <https://github.com/ljagiello/ctf-skills.git> | `ctf-skills`: skill-pack |
| `external/diagram-design` | <https://github.com/cathrynlavery/diagram-design.git> | `diagram-design`: skill-pack (opt-in), Wardley/Sankey/Gantt diagrams complementing archify |
| `external/hack-skills` | <https://github.com/yaklang/hack-skills> | `hack-skills`: source-pack, indexed by Grimoire |
| `external/no-ai-slop` | <https://github.com/petergyang/no-ai-slop.git> | `no-ai-slop`: skill-pack (opt-in), copy-editing that preserves voice/meaning |
| `external/open-code-review` | <https://github.com/alibaba/open-code-review.git> | `open-code-review`: skill-pack (opt-in), only open-code-review-delegate distributed; delegate needs the `ocr` CLI |
| `external/rea` | <https://github.com/morluto/rea.git> | `rea`: opt-in MCP; build the pinned source using the [REA setup guide](../docs/runbooks/rea.md) |
| `external/rev-skills` | <https://github.com/Lyther/rev-skills.git> | `rev-skills`: source-pack, indexed by Grimoire |
| `external/sanyuan-skills` | <https://github.com/sanyuan0704/sanyuan-skills.git> | `sanyuan-skills`: skill-pack (opt-in); `sanyuan-development-skills`: skill-pack (opt-in) |
| `external/tech-leads-club` | <https://github.com/tech-leads-club/agent-skills.git> | `tech-leads-club`: source-pack (opt-in), tech-leadership catalog under parenthesized categories, indexed by Grimoire |
| `external/trailofbits-skills` | <https://github.com/trailofbits/skills.git> | `trailofbits-static-analysis`: source-pack (opt-in), static-analysis subset indexed by Grimoire; the other skills are not used |

## Security Notes

- Do not commit private disclosure files, secrets, local MCP credentials, or generated agent config files from home-directory installs.
