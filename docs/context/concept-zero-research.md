# Runtime Refresh Research and Decisions

Status: SOURCE-BACKED DESIGN INPUT; NATIVE QUALIFICATION OUTSTANDING
Cutoff: 2026-09-28, Asia/Singapore
Baseline: `3dbdbfe9c67fa7a95cf72a25280d2aa588782956`
Consumers: [concept](concept-zero.md), [architecture](../architecture.md), [roadmap](../roadmap.md), [contract](../contracts/runtime-refresh.md).

This is the durable decision ledger for this batch, not a new runtime inventory or security database. The prior 26-target research and this turn's three independent packets are retained locally under `.agent-surface/research/2026-09-28-runtime-review/` and `.agent-surface/research/2026-09-28-runtime-design/`; those ignored artifacts are optional replay material, not a dependency of this handoff. Public sources and exact repository touchpoints below carry the decisions. Apart from the DSH security upgrade recorded below, no runtime upgrade, native acceptance, GUI interaction, provider request or security exploit was performed in this design turn.

## Source Reconciliation

- CURRENT: target/adaptor/capability registries, root helpers, renderers and installer at the baseline; 26 implemented outputs, including one build-only export. Two existing operator edits in the workflow rule and runtime catalog were preserved.
- HISTORICAL: the earlier concept, architecture and completed roadmap now live under [history](../history/2026-09-21-runtime-portfolio-roadmap.md). Their acceptance versions do not qualify the newest releases.
- CORRECTED: prior research left Cascade retirement uncertain; a dated changelog explicitly resolves it. Prior OpenHands removal options are superseded by the user's retain-and-downgrade decision.
- CORRECTED: the previous Antigravity successor suggestion did not establish manual-only skill semantics. Native manual rules are now the selected candidate; automatic conversion is rejected for manual commands.
- SEPARATE: latest package, stable-channel pointer, security-fixed boundary, installed version and qualified version. No one value substitutes for the others.
- UNVERIFIED: active exploitation, native successor behavior, GUI loaders and cloud imports. These are not invented PASS results. The workstation's DSH installation is now identified and upgraded; its native behavior is not requalified.

## Security-First Release Choice

The user authorizes security-required newer public/preview releases instead of a vulnerable stable channel. Prefer a current security-appropriate release, retain its actual channel/maturity label, and recheck package identity and advisories immediately before deployment. This is a release procedure, not a requirement to implement a version comparator or updater in agent-surface.

**DSH is a confirmed critical case.** CVE-2026-82533 / GHSA-8m2g-8cgm-3vcp identifies official DeepSeek Harness, including the recorded `0.1.1-rc.2` baseline. The CNA's custom version range is before `0.1.2-alpha.1`, with CVSS 4.0 severity 9.4. The issue crosses the agent-control authentication/confinement boundary. Its presence does not establish that this workstation was compromised. [CVE record](https://cveawg.mitre.org/api/cve/CVE-2026-82533), [CNA advisory](https://www.vulncheck.com/advisories/deepseek-harness-alpha-1-authentication-bypass-via-host-header-spoofing).

The vendor's fix release is `dsh-v0.1.2-alpha.1`; the original researchers describe a successful remediation retest. Current npm metadata does not contain that exact version, so it is not a usable npm install instruction. At this cutoff, the exact scoped package's `latest` and `next` point to `0.1.7-rc.2`; the corresponding vendor prerelease exists. It is the current qualification candidate, not certified safe. [Fix release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.1), [researcher disclosure](https://www.ox.security/blog/cve-2026-82533-deepseek-harness-ai-agent-sandbox-escape/), [package metadata](https://registry.npmjs.org/@deepseek-ai%2Fdsh), [current release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2).

**Exploitation in the wild remains unverified.** S1 found controlled exploit/retest evidence but no attributable incident or matching entry in the September 27 CISA KEV snapshot. Absence from KEV is not proof of no attacks. Critical remediation does not wait for that stronger claim. GHSA is unreviewed and lacks package/version mapping, so a clean Dependabot result is not clearance. [GHSA](https://github.com/advisories/GHSA-8m2g-8cgm-3vcp), [official KEV source](https://github.com/cisagov/kev-data).

Keep DSH's skills-only preview adapter. Hold new affected-client execution, including discovery experiments; identify installed package/build using non-executing metadata where possible. Runtime/MOMO owns the update, followed by exact-build discovery and a bounded real task. Do not downgrade below the verified affected boundary when a newer build has a regression. Its [current safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/SAFETY.md) still limits security assurances. This fixes neither every vulnerability nor every integration.

**Workstation record, 2026-09-28.** Package metadata, read without executing the client, identified `@deepseek-ai/dsh@0.1.1-rc.2`, inside the affected range. The authorized upgrade installed `0.1.7-rc.2` globally from the npm registry with certificate verification enforced. Afterward the installed metadata and the new build's version output both reported `0.1.7-rc.2`; the package defines no lifecycle scripts, and no process, listener or launch job from the old build remained. The bounded skills-only task was not run, so DSH stays unqualified natively; `RT0.1` defers that requalification beyond this batch.

The prior review observed Claude stable `2.1.274` versus latest `2.1.283`, and Grok Build latest public `1.0.40` without a verified named stable pointer. The user permits newer candidates. Do not assert those older Claude/Grok versions have a particular CVE without a matching advisory. Exact candidate selection is refreshed in `RT0.1`, not frozen by this document.

## Cascade and Devin

Windsurf became Devin Desktop; the shell branding alone is not the harness contract. The stable Desktop changelog explicitly removes Cascade in `3.9.19` on September 8, 2026. Desktop `3.10.35` is therefore not a current Cascade qualification baseline. Devin Local and CLI share a documented harness, but still need separate client evidence. [Desktop changelog](https://docs.devin.ai/desktop/changelog), [Local overview](https://docs.devin.ai/desktop/devin-local), [CLI stable releases](https://docs.devin.ai/cli/changelog/stable).

Selected design: preserve `windsurf` as deprecated Cascade compatibility; add `devin` as the single Local/CLI artifact writer. Use `devin-local` and `devin-cli` only as qualification component IDs. No alias, profile copy or manifest adoption. Explicit deprecated selection remains possible; build/install `all` visibly excludes deprecated targets. This intentional selection change prevents an obsolete adapter with unrepresentable global policy from breaking ordinary current-target operations. It lands in the same change as Devin's `all` admission, so no default selection holds both harnesses, and a profile without a Cascade overlap never loses both; until then `windsurf` stays in `all` with a legacy notice. OpenHands stays implemented and included because its recommendation is a different axis.

Cascade global rules allow 6,000 characters, workspace files 12,000 each. The prior coordinator's real selected-context renders measured 9,539 general and 30,348 development characters; no truncation behavior was runtime-tested. Project general fits; global general does not. The current project aggregate is already `.devin/rules/agent-surface.md`, while other outputs still use legacy paths. [Cascade rules](https://docs.devin.ai/desktop/cascade/memories), [root implementation](../../scripts/agent-surface/roots.mjs).

Project partitioning into complete per-source rules was considered and is not scheduled in this batch: no retained Cascade user needs it, and it is not a global workaround. Global full-policy requests must fail before mutation until a semantics-preserving global route exists. No generated summary, delayed skill read, enterprise-wide install or guessed sibling file satisfies that ordinary-user contract. Build must validate before its current output-directory deletion.

For new Devin output: native user/project rule directories, `C/skills` / `.devin/skills`, and dedicated `mcp_config.json` files. `C` is the documented config directory for the platform. Manual commands use `triggers: [user]`, not another host's frontmatter. Dedicated MCP files apply from CLI v3000.3 / Local 3.6. The older Local overview and general FAQ disagree with the dedicated reference; do not fan out writes to every historical path. [Rules](https://docs.devin.ai/cli/extensibility/rules), [skills](https://docs.devin.ai/cli/extensibility/skills/creating-skills), [MCP](https://docs.devin.ai/cli/extensibility/mcp/configuration), [imports](https://docs.devin.ai/cli/reference/configuration/read-config-from).

Omitted `model` on a custom Devin agent means the default router/admin setting, not guaranteed parent-model inheritance. Native custom-agent output stays deferred until role/model semantics are settled. `allowed-tools` on a subagent is a restriction; on an inline skill it can be preapproval instead. [Subagent contract](https://docs.devin.ai/cli/subagents).

## Antigravity Successor

November 1, 2026 retires the workflow format, not Antigravity. The official migration scans modern workflow roots, archives originals and enables autonomous skills. It does not qualify our historical `antigravity/global_workflows` path. Skills remain a documented shared IDE/2.0 surface. [Migration](https://antigravity.google/docs/migration/workflows-to-skills/), [IDE workflow notice](https://antigravity.google/docs/ide/workflows/), [skills](https://antigravity.google/docs/skills).

The skills manual lists workspace `.agents/skills` (legacy `.agent/skills`), global `~/.gemini/config/skills` for 2.0/IDE (legacy `~/.gemini/antigravity/skills`) and `~/.gemini/antigravity-cli/skills` for the CLI. It documents only `name` and `description` frontmatter, and skills are invoked autonomously. User-global `~/.agents/skills` is not listed, so manual-only skills that other targets write there are outside Antigravity's documented discovery unless the home directory itself is opened as the workspace, while the same skills in a workspace `.agents/skills` are inside it.

Do not depend on undocumented `disable-model-invocation` behavior for 2.0. Select native rules with `trigger: manual` as the protected-command replacement candidate, using explicit `@` selection instead of promising slash parity. The rules manual describes global `~/.gemini/config/rules/*.md`, project `.agents/rules/*.md`, and a 24,000-byte expanded per-file limit. Native qualification must prove the chosen product loads it manually. The documented 20,000-token aggregate budget also means per-file fit alone does not prove complete active policy retention; this first slice does not add always-on rules. [Rules](https://antigravity.google/docs/rules/).

Keep the `antigravity` ID for these shared skills/manual-rule surfaces and `antigravity-cli` for its separate staged plugin. Do not add a duplicate 2.0 target merely to own the same skills. Broader 2.0 agents, MCP and plugins can follow after separate contracts; [subagent docs](https://antigravity.google/docs/subagents/) cover 2.0/CLI, not standalone IDE. [Plugin registration](https://antigravity.google/docs/plugins/) is not identical to staging files.

Warn immediately; prove the replacement before November 1; preserve legacy workflow bytes/ownership in the initial migration release. Never run the vendor migration command automatically. Foreign destinations, source-name collisions and an old category selector that omits the replacement must fail or retain old state as the contract specifies. No clock-triggered filesystem cleanup.

## Retained OpenHands

The V1 CLI README and status commit explicitly end active maintenance. That statement is not about Canvas or the SDK. The user decision is to retain the CLI: keep `status: implemented`, build/install, `--target openhands`, `--target all`, paths and manifests. Set capability recommendation to `legacy`; explain the exact component. No removal or Canvas rebranding is pending. [CLI status](https://github.com/OpenHands/OpenHands-CLI#project-status), [status commit](https://github.com/OpenHands/OpenHands-CLI/commit/954f2ba646e8d749261a8f2b2b7e3031fa39be9f), [CLI MCP](https://docs.openhands.dev/openhands/usage/cli/mcp-servers).

## Other Bounded Corrections

| Target / decision | Source-backed discrepancy | Action and proof boundary |
|---|---|---|
| Poolside | Personal instructions are `AGENTS.md`, not the emitted `.poolside`. | Owned-route migration on top of `RT2.0` ownership, and default/XDG discovery. [Manual](https://docs.poolside.ai/agent-instructions) |
| Codex | Current ordinary user install is valid; project metadata overstates `.codex/AGENTS.md`. | Narrow advertised scope first; no project implementation by implication. [Discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance) |
| VS Code | Local profile instructions do not qualify every Agent Host; co-installed Copilot can mask omissions. | Label executing harness; defer GUI behavior until a real host test. [Instructions](https://code.visualstudio.com/docs/agent-customization/custom-instructions) |
| Cursor | Native file rules are documented at workspace scope; global User Rules are settings-managed. | Correct claim; preserve existing files pending an explicit qualified transition. [Rules](https://cursor.com/docs/rules) |
| Zed | Windows instructions use AppData, not unconditional `.config/zed`. | Platform helper and actual Windows qualification; distinguish ACP guests. [Instructions](https://zed.dev/docs/ai/instructions) |
| Trae | CN and global roots, CLI generations and alias behavior are mixed. | Resolve selected edition; no broadcast copies. [CN skills](https://docs.trae.cn/cli_skills) |
| Cline | New Devin user-data route is absent from extra IDE MCP destinations. | Verify actual installed extension route; preserve unrelated editors/settings. [Cline MCP](https://docs.cline.bot/mcp/configuring-mcp-servers) |
| Kimi / Kiro / OpenCode / Pi | Restrictions, harness labels, manual-skill semantics or namespace descriptions aged. | Metadata-only correction against selected release source; no native expansion implied. |

All other existing targets are retained at their current scoped support pending their own qualification. There is no evidence-based reason here to delete them solely for release age. Keep explicit out-of-scope entries narrow: consumer Gemini migration does not mean all Gemini CLI usage is EOL, and VSCodium is an integration-boundary choice. No existing asset-domain category is removed or broadened.

## Grok and the Next Iteration

Grok Build's native custom agents are a concrete missing producer; the prior filtered local inspect found canonical roles only through Claude compatibility loading. Resolve its real agent format, inherited model and effective tool restrictions before generation; qualify a clean root and co-installation separately. [Native agents](https://docs.x.ai/build/features/subagents), [discovery](https://docs.x.ai/build/features/skills-plugins-marketplaces).

Grok Bot merits a private, non-sensitive persistent-workplace pilot, not a guessed filesystem adapter. Its account shares computer/files/sign-ins between Bots; local-computer execution is separate. Start with a manually imported task bundle and verifiable artifact, then cancellation/partial failure, then an optional routine whose Test run is real execution. No account isolation, Windows-local acceptance or cost benefit follows from cloud success. [Computer](https://docs.x.ai/grok-bot/computer-and-apps), [routines](https://docs.x.ai/grok-bot/skills-routines-and-automations), [security](https://docs.x.ai/grok-bot/approvals-security-and-privacy).

Amp and Auggie remain loader-first candidates: existing shared skills may be sufficient. Vibe and Junie are follow-up candidates when a real workflow justifies native deltas. ACP, MCP, skills and plugins solve different boundaries; no universal control plane is selected. Learned state stays runtime-owned; only reviewed reusable procedures are promoted into this repo. Saved profiles and atomic category union remain separate design work because current manifests do not implement either.

## Cross-Review Corrections, 2026-09-28

Two review rounds on the first draft changed these decisions; the [contract](../contracts/runtime-refresh.md) now carries their normative form.

- **Ownership is installer-wide.** Disposable-root reproductions showed that identical unowned files are adopted, a rules-only install erases another target's development rules in a shared `AGENTS.md`, and one target's reset deletes command skills another target still claims. A new-destination guard for migrations alone would leave all three, so `RT2.0` implements ownership for every whole-file output before `RT2.1` and `RT2.3`. A later review withdrew the cross-owner category veto of the previous draft: eight targets render identical project `AGENTS.md` bodies under different host titles, so the veto locked co-owners out of any general reset. Co-owned files are now regenerated with a `SHARED_CONTRIBUTION_REPLACED` warning, and the shared header is target-neutral.
- **No backup store.** Removal of an old owned route requires bytes equal to the replacement. A differing route blocks with `MIGRATION_SOURCE_CONFLICT` while native discovery is unproven, and is retained with a `LEGACY_FILE_RETAINED` plan warning once the client is proven to ignore it.
- **Co-discovery warns.** `--scope project --dest` already makes Antigravity write a workspace `.agents/skills`, so a blocking co-discovery check would permanently refuse project-scope `all` development installs over a hazard that is unqualified rather than demonstrated. `RT2.3` lists co-discovered manual command skills as plan warnings, and `RT0.3` evidence decides whether any block is justified.
- **Shared-root notices follow the destination.** `--scope user --dest <workspace>` writes into a workspace, so the notice is derived from selected outputs and the resolved install root, not from the scope label.
- **Cutover invariant.** Windsurf's deprecation, `all` exclusion and size guard land in the same change as Devin's `all` admission, so `all` never holds both harnesses; build availability is enforced from the registry's `build_supported` field.
- **No permanent `all` refusal.** A third review found two more blocks that `all` would always meet: the retired Antigravity workflow selector and the Devin/Cascade overlap. Both now block only an explicit selection of the affected target, or a run left with nothing to install; within `all` the target is listed as not applicable or excluded under the same label (`WORKFLOW_SELECTOR_RETIRED`, `CASCADE_TRANSITION_REQUIRED`). A fourth review showed that excluding Devin still left an existing Cascade profile with neither harness in `all`, so the overlap is read from the co-discovered files themselves, the transition that clears it is named, and the invariant is scoped to profiles without that overlap. The manual-only acceptance criteria are scoped to a clean Antigravity profile, and co-installed loading is recorded as evidence.
- **Scheduling.** `RT0.3` GUI evidence starts now, owned by the operator; Cascade project partitioning is dropped from this batch; the DSH upgrade closed the urgent part of `RT0.1`.

## Disposition and Remaining Evidence

| ID | Resolved decision | Still required before claiming runtime support |
|---|---|---|
| `RT0.1` | Security fixes outrank a vulnerable stable channel; DSH critical advisory identified; installed build upgraded from `0.1.1-rc.2` to `0.1.7-rc.2`. | Exact-build native requalification, deferred beyond this batch; wild exploitation remains unverified. |
| `RT0.2` | Separate Cascade compatibility from one Devin writer. | Versioned roots, platform behavior, imports/ownership collision and Local/CLI loader proof. |
| `RT0.3` | Native Antigravity manual rule is the candidate; no autonomous conversion. | Product-specific explicit-only invocation and expanded-size/companion proof. |
| `RT1.1` | Small capability extension and notices, not a new registry engine. | Implementation schema, semantic validation and presentation tests. |
| `RT2.0` | Ownership from every manifest in the install root; no adoption; contribution warning, neutral shared header and cleanup protection. | Real disposable-root regression cases through the CLI. |
| `RT3.2` | Grok native agents are worthwhile; Bot is a separate pilot. | Agent schema/policy tests; actual private Bot import/account/task evidence. |

The design is implementable in slices even when a later native proof is unavailable. An unavailable GUI account blocks only its corresponding support claim, not the warning, metadata or independent path repair. No human action is required to review these documents; authenticated GUI/cloud sessions may be required by later acceptance.
