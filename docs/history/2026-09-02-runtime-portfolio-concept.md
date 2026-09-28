# Historical Concept: September Runtime Portfolio Refresh

Historical snapshot preserved on 2026-09-28. The active concept is [concept-zero.md](../context/concept-zero.md). Implementation and qualification statements below describe their original review period, not the current release matrix.

Status: ACCEPTED AND IMPLEMENTED; REAL-RUNTIME QUALIFICATION PARTIAL
Last updated: 2026-09-02

## Executive Decision

`agent-surface` remains a curated source-to-native compiler, not a catalog of every product that calls itself an agent. This refresh adds four materially useful runtimes with documented declarative surfaces: DeepSeek Harness (`dsh`), Qoder, Qwen Code, and Kiro. It removes VSCodium as a standalone target because VSCodium has no native agent runtime and its usable AI surface depends on separately installed extensions. It upgrades GitHub Copilot to the current CLI contract, migrates Grok Build to TOML, repairs Antigravity CLI plugin placement, and aligns Trae's IDE/CLI skills, rules, subagents, MCP, and permission routes. DSH is deliberately skills-only until its plugin/MCP profile contract stabilizes. Amp, Auggie, Warp, and Crush remain credible next-wave candidates. Z.ai is a model plan/provider and configuration helper, not a runtime target.

## Problem and Evidence

| ID | Claim | Evidence | Confidence | Impact |
|---|---|---|---|---|
| `E-01` | The pre-refresh registry implemented 22 targets and was last reviewed on 2026-08-06. | Git baseline; `registry/targets.json`; `registry/target-capabilities.json` | High | The refresh modifies that known baseline rather than redesigning every adapter. |
| `E-02` | DeepSeek Harness is an official open-source runtime, but its maintainers explicitly call it developer preview with breaking changes expected. | [DeepSeek Harness repository](https://github.com/deepseek-ai/deepseek-harness) | High | Add only the stable filesystem skill contract now; do not encode unstable Cordis profile internals. |
| `E-03` | DSH discovers project/user skills from `.dsh/skills` and `.agents/skills`; its MCP client is profile-wide and workspace-scoped MCP remains unresolved. | [DSH skills](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md); [workspace MCP RFC](https://github.com/deepseek-ai/deepseek-harness/discussions/941) | High | Skills are implementable; MCP is deferred rather than approximated. |
| `E-04` | Qoder CLI natively supports skills, commands, agents, `AGENTS.md`, JSON MCP settings, headless execution, and full-access permission mode. | [Skills](https://docs.qoder.com/cli/Skills); [commands](https://docs.qoder.com/cli/commands); [subagents](https://docs.qoder.com/cli/subagent); [MCP](https://docs.qoder.com/cli/mcp-reference) | High | Qoder qualifies for a full adapter using existing renderer and JSON merge primitives. |
| `E-05` | Qwen Code natively supports skills, Markdown commands, Claude-compatible subagents, JSON MCP settings, and headless runs. | [Qwen Code](https://github.com/QwenLM/qwen-code); [skills](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/); [subagents](https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/); [MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/) | High | Qwen Code qualifies for a full adapter with no new config parser. |
| `E-06` | Kiro shares `.kiro` configuration across IDE and CLI and supports skills, steering, custom agents, and JSON MCP settings. | [Kiro docs](https://kiro.dev/docs/); [configuration scopes](https://kiro.dev/docs/cli/chat/configuration/); [skills](https://kiro.dev/docs/cli/skills/); [MCP](https://kiro.dev/docs/mcp/configuration/) | High | One Kiro target covers its IDE/CLI surfaces. |
| `E-07` | Copilot CLI is GA and now supports native skills, custom agents/subagents, plugins, and MCP under `~/.copilot`. | [Copilot CLI config](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference); [skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills); [agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents) | High | The existing IDE-only Copilot adapter is materially incomplete and must be upgraded. |
| `E-08` | Grok Build now uses `~/.grok/config.toml` / `.grok/config.toml`, not `.grok/settings.json`, for skills and MCP. | [Grok settings](https://docs.x.ai/build/settings); [MCP](https://docs.x.ai/build/features/mcp-servers); [skills and plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces) | High | Current generated MCP is ignored in an isolated Grok install; migrate the adapter. |
| `E-09` | Antigravity CLI stages CLI plugins under `~/.gemini/antigravity-cli/plugins`; the current generated directory validates but `agy plugin list` reports no imported plugin. | [Antigravity CLI plugins](https://antigravity.google/docs/cli/plugins/); local `agy 1.1.13` probe | High | Move the CLI target to the active discovery root and prove plugin discovery. |
| `E-10` | Gemini CLI stopped serving individual accounts on 2026-06-18 and Antigravity CLI is its successor; enterprise/API-key operation remains. | [Gemini CLI transition announcement](https://github.com/google-gemini/gemini-cli/discussions/28017) | High | Do not add Gemini CLI as a new general target. |
| `E-11` | Roo Code's repository was archived on 2026-05-15 and iFlow CLI announced shutdown on 2026-04-17. | [Roo Code repository](https://github.com/RooCodeInc/Roo-Code); [iFlow CLI repository](https://github.com/iflow-ai/iflow-cli) | High | Keep both out of scope despite past popularity. |
| `E-12` | VSCodium disables Copilot features by default and cannot use Microsoft's extension marketplace under normal terms. | [VSCodium extensions](https://github.com/VSCodium/vscodium/blob/master/docs/extensions.md); [Copilot setup caveat](https://github.com/VSCodium/vscodium/blob/master/docs/ext-github-copilot.md) | High | A standalone generated target does not prove a consuming runtime and is not worth maintaining. |
| `E-13` | Z.ai documents integrations for other coding tools and provides `@z_ai/coding-helper`; it does not publish a distinct coding-agent runtime. | [Z.ai supported tools](https://docs.z.ai/devpack/tool/others); [Coding Tool Helper](https://docs.z.ai/devpack/extension/coding-tool-helper) | High | Provider/model wiring remains user-owned; no fictitious `z-ai` target. |
| `E-14` | Amp, Auggie, Warp, and Crush all have current native skills and/or MCP surfaces. | [Amp skills](https://ampcode.com/docs/customize/skills); [Auggie skills](https://docs.augmentcode.com/cli/skills); [Warp](https://docs.warp.dev/); [Crush](https://github.com/charmbracelet/crush) | High | Keep as researched planned candidates; revisit after the first slice has real proof. |
| `E-15` | Current TraeCode CLI uses `.traecli/skills`, `.traecli/agents`, and `~/.trae/traecli.toml`; it also reads Trae IDE project skills, rules, and MCP routes under `.trae/`. | [CLI skills](https://docs.trae.cn/cli_skills); [CLI agents](https://docs.trae.cn/cli_agent); [CLI config](https://docs.trae.cn/cli_config-file); [CLI memory/rules compatibility](https://docs.trae.cn/cli_memories) | High | Emit native CLI routes while retaining the IDE-compatible routes one target already owns. |

## Users and Stakeholders

| Actor | Need | Constraints | Success signal |
|---|---|---|---|
| Operator | One command to distribute the same useful skill, rule, agent, and MCP surfaces to the runtimes actually used. | Host formats and lifecycle change quickly; user config must survive merges. | A full install produces native, discoverable files and real host probes succeed. |
| Skill/workflow author | One canonical source rather than runtime-specific copies. | Manual-only workflows must remain explicit; reusable skills should remain model-invocable. | Generated output is derived from one canonical artifact and passes reference checks. |
| Maintainer | A portfolio small enough to keep current. | No speculative compatibility layer or runtime-specific framework. | Each target has primary-source evidence, an owner, and a bounded native adapter. |
| Runtime user | Features work in the selected host rather than merely existing on disk. | Login, subscription, region, or provider availability can block live proof. | Native discovery plus a task-shaped run reaches the expected world state. |

## Goals, Non-Goals, and Constraints

| ID | Type | Statement | Evidence |
|---|---|---|---|
| `G-01` | Goal | Keep a current, high-value runtime portfolio with explicit add, keep, modify, planned, and retired decisions. | User request; `E-01` to `E-14` |
| `G-02` | Goal | Add DSH, Qoder, Qwen Code, and Kiro using only verified native surfaces. | `E-02` to `E-06` |
| `G-03` | Goal | Repair Copilot, Grok Build, Antigravity CLI, and Trae where current native contracts exceed or contradict generated output. | `E-07` to `E-09`; `E-15` |
| `G-04` | Goal | Remove VSCodium and let strict-sync prune its owned files on the next full install. | `E-12`; existing manifest contract |
| `C-01` | Constraint | Preserve the existing Node/Ajv compiler stack and registry/producer architecture; use maintained format libraries instead of local parsers. | `package.json`; `docs/architecture.md` |
| `C-02` | Constraint | Keep JSONC, YAML, and TOML merges thin and format-library-backed; add no general compatibility framework. | User simplicity requirement; current merge architecture |
| `C-03` | Constraint | A preview runtime may expose a smaller honest surface; unsupported capabilities must not be faked. | DSH lifecycle evidence; test policy |
| `N-01` | Non-goal | Configure model providers, API keys, subscriptions, pricing plans, or default models. | Z.ai/provider distinction; secret ownership contract |
| `N-02` | Non-goal | Add every credible runtime in one change. | Simplicity and real-proof requirements |
| `N-03` | Non-goal | Rebuild a universal agent configuration manager or introduce an adapter DSL. | Existing table-driven adapter is sufficient |

## Unacceptable Outcomes

| Outcome | Why it matters | Prevention / detection |
|---|---|---|
| A target is marked implemented while its runtime cannot discover the output. | Repeats the current Grok/Antigravity failure. | Isolated install plus native inventory/discovery command; mark blocked when authentication prevents execution. |
| A removed target leaves owned configuration indefinitely. | Deletion would be cosmetic and stale behavior would persist. | Full-install strict-sync regression for retired routes. |
| A preview or proprietary host forces a large generic abstraction. | Maintenance cost exceeds user value. | Limit adapters to verified files and existing merge formats; defer the rest. |
| Provider configuration is mistaken for a runtime. | Produces a fake target with no consuming host. | Runtime qualification requires an executable host and native customization contract. |
| Peer Grimoire work is accepted from its handoff summary alone. | The current branch includes a separate 431-line behavior change. | Review `fc7fd4e..5dcc388` independently and fix confirmed defects before final proof. |

## Glossary

| Term | Meaning |
|---|---|
| Runtime target | An executable agent host with a documented native customization surface. |
| Full adapter | Generates all currently useful, representable native surfaces for a target. |
| Limited adapter | Generates a deliberately smaller verified subset, with omitted surfaces documented. |
| Planned candidate | Credible and researched, but deferred until integration shape or real-run prerequisites justify implementation. |
| Retired target | Removed from `in_scope`; previously owned output is eligible for strict-sync pruning. |

## Critical Journeys

| Journey | Current pain | Proposed experience | Evidence needed |
|---|---|---|---|
| Add a current runtime | Ad hoc registry, adapter, docs, and test edits can drift. | One bounded adapter entry plus capabilities record and native discovery proof. | `check`, generated output, isolated install, runtime inventory. |
| Upgrade a changed host | Old config files remain syntactically valid but are ignored. | Migrate only the affected route and prune the obsolete owned entry. | Pre-fix isolated failure, post-fix native discovery. |
| Retire a host | Stale files/config may survive. | Remove registry/adapter/docs and let manifest ownership clean the old route. | Full-sync removal test. |
| Use skills without context bloat | Large skill catalogs can overload prompts. | Native progressive loading or Grimoire JIT retrieval; no always-on corpus dump. | Native skill listing and task-shaped invocation. |

## Quality Scenarios

| ID | Scenario | Measure | Later architecture gate |
|---|---|---|---|
| `Q-01` | A target is added or changed -> registry, producer, capability, docs, and generated outputs remain coherent. | `check` and `check:generated` pass with no token drift. | Registry coherence tests. |
| `Q-02` | A user has unrelated host config -> install updates only agent-surface-owned entries. | Unknown sibling values survive semantically; malformed config blocks. | Real merge tests. |
| `Q-03` | A runtime starts after isolated installation -> it discovers a canonical skill and both configured MCPs when the target claims MCP. | Native inventory succeeds; a task-shaped run calls the skill/MCP and writes exact expected bytes. | `workflow-runtime`/`verify-prove`. |
| `Q-04` | A target is retired -> next full sync removes only its owned files/routes. | Obsolete managed paths absent; unrelated user files remain. | Strict-sync regression. |
| `Q-05` | DSH changes during developer preview -> the adapter does not depend on internal profile composition. | Skills remain discoverable from documented filesystem roots; no generated MCP claim. | Pinned clean-room DSH skill probe. |

## Research Landscape

| Capability | Candidate route | Evidence | Verdict |
|---|---|---|---|
| Plugin-native preview harness | DSH | `E-02`, `E-03` | Add limited skills-only target. |
| Full Alibaba coding runtime | Qwen Code | `E-05` | Add full target. |
| Full Qoder agent runtime | Qoder | `E-04` | Add full target. |
| Unified AWS IDE/CLI agent | Kiro | `E-06` | Add full target. |
| Current GitHub agent host | Copilot CLI | `E-07` | Upgrade existing target. |
| Current xAI terminal agent | Grok Build | `E-08` | Keep and migrate config. |
| Current Google terminal agent | Antigravity CLI | `E-09`, `E-10` | Keep and repair discovery path. |
| Additional mature agents | Amp, Auggie, Warp, Crush | `E-14` | Planned next wave after live probes. |
| Retired agents | Gemini CLI, Roo Code, iFlow CLI | `E-10`, `E-11` | Out of scope. |
| Provider/helper | Z.ai Coding Plan/helper | `E-13` | Not a runtime target. |

## Adopt / Adapt / Build Decisions

| Capability | Decision | Rationale | Risk |
|---|---|---|---|
| Runtime representation | Adapt existing `targets` table and registries. | The current design already enforces producer/registry coherence. | Table growth remains manual but reviewable. |
| Skills | Adopt each host's native Agent Skills roots. | Shared format and progressive loading minimize custom rendering. | Hosts interpret optional frontmatter differently; capability notes must stay precise. |
| Agents | Adapt normalized subagents into host-native Markdown/JSON only where documented. | Reuses the current six roles without inventing orchestration. | Tool-name mappings can drift and need native inventory proof. |
| MCP | Reuse existing non-destructive merge formats. | Qoder, Qwen, Kiro, and Copilot use JSON maps; Grok uses TOML already supported in principle. | Grok needs a small target-specific TOML shape. |
| Lifecycle | Build a small documented qualification rule, not an automated popularity score. | Support quality depends on contracts and proof, not stars. | Periodic human research remains necessary. |

## Candidate Concepts

### Candidate A: Keep all 22 and append every credible runtime

This maximizes logo count but turns one refresh into seven or more unproven adapters, preserves VSCodium despite no native agent, and encourages shallow config support. Rejected because maintenance and real-run proof scale with every host.

### Candidate B: Curated first slice with explicit lifecycle states

Add four high-value runtimes, remove one redundant target, repair known stale adapters, and record the next wave. The compiler architecture stays flat, with maintained format libraries owning syntax. Selected because it expands meaningful coverage while keeping every implementation reviewable.

### Candidate C: Only shared `.agents/skills` and no target adapters

This is attractive for DSH, Crush, Amp, and other shared-skill readers, but it loses rules, custom agents, MCP, command semantics, host policy, ownership, and discovery proof. Rejected as the sole model; shared roots remain a useful implementation detail for limited targets.

## Adversarial Review

| Finding | Revision |
|---|---|
| DSH's plugin architecture tempts a generic plugin compiler while the upstream contract is explicitly unstable. | Limit DSH to native skill roots and record MCP as deferred. |
| Z.ai's product pages list many tools and can be mistaken for a Z.ai runtime. | Require an executable host; classify Z.ai as provider/helper. |
| Removing VSCodium could exclude users who manually install compatible extensions. | Keep VSCodium documented as an unsupported VS Code fork; users can target a custom destination, but no dedicated lifecycle promise remains. |
| A four-target addition can still create duplicated renderers. | Reuse vanilla skills, instruction documents, Claude-compatible agent files, and existing JSON merge formats; add host-specific renderers only when schemas differ materially. |
| The peer Grimoire commit could destabilize the same branch. | Complete independent max-effort review and remediation before portfolio verification. |

## Selected Concept HLD

The compiler remains one Node process with five authoritative inputs: canonical skills, explicit commands, rules, normalized subagents, and optional services. Runtime qualification is a documented portfolio decision backed by primary sources and a native proof boundary. The target registry identifies current, planned, and out-of-scope hosts; the capability registry records exactly which native surfaces each host supports; the adapter table maps only those surfaces to existing render/merge primitives. Install manifests continue to own cleanup and non-destructive updates.

The selected post-refresh portfolio has 25 implemented targets: 21 retained existing targets, four additions, and one removal from the current 22. Qoder, Qwen Code, and Kiro receive full skills/rules-or-instructions/agents/MCP coverage. DSH receives skills and reviewed external skills only. Copilot, Grok Build, Antigravity CLI, and Trae are modified in place. VSCodium, Gemini CLI, Roo Code, and iFlow CLI are retired/out of scope. Amp, Auggie, Warp, and Crush remain researched planned candidates.

Maintained JSONC, TOML, and YAML libraries own config and frontmatter syntax; no new service, database, daemon, adapter DSL, provider layer, or runtime security framework is introduced. Model/provider credentials stay outside agent-surface. Runtime execution proof uses disposable installs and real host CLIs; missing login or subscriptions produce `BLOCKED`, not substitute-backed success.

## First Production Slice

1. Implemented: portfolio and native surface contracts are frozen in registries and documentation.
2. Implemented: DSH, Qoder, Qwen Code, and Kiro reuse existing roots/render/merge functions.
3. Implemented: Copilot, Grok Build, Antigravity CLI, and Trae are upgraded; VSCodium is retired with cleanup-only manifest reconciliation.
4. Implemented: the remote test's real-`HOME` leak and confirmed peer Grimoire defects are remediated.
5. Implemented and verified at the deterministic boundary: remote root/package gates and isolated installs pass. Native proof is intentionally partial where Qoder, Kiro, and Trae require login or Qwen has no authentication type configured.

## Open Questions and Spikes

| Question | Why it matters | How to resolve | Owner / next command |
|---|---|---|---|
| Does DSH stabilize a declarative user/project MCP profile contract? | It determines whether Synapse and Grimoire can be added without owning Cordis internals. | Recheck official release/docs after developer preview changes. | Later runtime refresh |
| Which of Amp, Auggie, Warp, and Crush has the highest actual operator value? | All are credible; adding all would dilute proof effort. | Install/probe on the ops server and rank by real use before the next wave. | Planned spike |
| Can every proprietary addition complete a real task on this device? | Qoder and Kiro may require human login or subscription. | Run native inventory first; request only literal login HITL. | `workflow-runtime` |

## Handoff to Architecture and Roadmap

`arch-roadmap` and `arch-contract` preserve the 25-target portfolio, limited DSH contract, VSCodium cleanup, thin format-library boundary, and real native discovery as the acceptance boundary. The target/capability registries remain canonical domain state and the adapter table remains the implementation mapping; no public API or datastore was added.
