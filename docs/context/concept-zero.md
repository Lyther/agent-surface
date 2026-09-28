# Concept Zero: Runtime Identity and Compatibility Refresh

Status: PROPOSED DESIGN; USER DIRECTION ACCEPTED; IMPLEMENTATION NOT STARTED
Last updated: 2026-09-28
Baseline: `main` at `3dbdbfe9c67fa7a95cf72a25280d2aa588782956`

## Executive Decision

Keep agent-surface as a canonical-practice compiler, native-adapter catalog and managed installer. This batch makes runtime identity, security-aware release selection, lifecycle and proof boundaries explicit; repairs demonstrated path/format defects; separates different harnesses hidden behind one editor brand; and adds a controlled successor path for Antigravity workflows. Retain OpenHands V1 CLI, but recommend it only for existing users. Expand Grok Build only where native contracts and task evidence justify it; evaluate Grok Bot as a separate private workplace pilot. Do not build a runtime manager, vulnerability scanner, provider router, scheduler, saved-profile engine, or universal permissions layer.

The previous [concept](../history/2026-09-02-runtime-portfolio-concept.md) and [roadmap](../history/2026-09-21-runtime-portfolio-roadmap.md) are historical. Their completed work is not reopened, and their old version/target counts are not the baseline for this batch. The current source has 26 implemented outputs: 25 runtime/host adapters plus the build-only plugin exporter.

## Problem and Evidence

Users can receive syntactically valid assets that the selected harness never loads. Editor branding now spans native, CLI-backed, hosted and compatibility modes; a populated home can mask missing native output. Release channels also say little about whether a specific vulnerability is fixed. The required outcome is a precise, usable integration, not a larger catalog or an unqualified compatibility score.

| ID | Claim or decision | Evidence | Confidence / impact |
|---|---|---|---|
| `E-RT-01` | FACT: existing support/generation fields already separate some concerns, but lack component-specific qualification. | `registry/target-capabilities.json`; `schemas/target-capabilities.schema.json` | High source confidence; extend rather than replace these records. |
| `E-RT-02` | USER_DECISION: security-required newer public or preview releases may take precedence over a named stable channel. DSH is urgent. | Operator correction, 2026-09-28; advisory reconciliation in [research](concept-zero-research.md) | Policy accepted; exact affected/fixed versions and exploitation claims require attributable evidence. |
| `E-RT-03` | FACT: Cascade and Devin Local do not share all customization behavior. | [Devin Local](https://docs.devin.ai/desktop/devin-local), [Cascade rules](https://docs.devin.ai/desktop/cascade/memories) | Separate the harness contract; do not infer parity from the same desktop shell. |
| `E-RT-04` | FACT: actual user/general Cascade output is 9,539 characters; current documented global limit is 6,000. Development is 30,348 against 6,000 global / 12,000 per workspace file. | `rules.mjs`, `targets.mjs`; [native limits](https://docs.devin.ai/desktop/cascade/memories) | Source/render evidence, not observed truncation. Global and project limits differ; oversized selected output blocks. |
| `E-RT-05` | FACT: Antigravity workflows have a November 1, 2026 retirement notice. USER_DECISION: warn and support the successor. | [Official migration](https://antigravity.google/docs/migration/workflows-to-skills/) | Time-bound surface migration; not product retirement. |
| `E-RT-06` | FACT: OpenHands V1 CLI is no longer actively maintained. USER_DECISION: keep it, reduce recommendation. | [Upstream status](https://github.com/OpenHands/OpenHands-CLI/commit/954f2ba646e8d749261a8f2b2b7e3031fa39be9f) | Retained compatibility target, not automatic Canvas/SDK substitution. |
| `E-RT-07` | FACT: Poolside personal instructions use AGENTS.md; current producer uses .poolside. Zed and Trae claims need platform/edition boundaries. | `roots.mjs`; [Poolside](https://docs.poolside.ai/agent-instructions), [Zed](https://zed.dev/docs/ai/instructions), [Trae CN](https://docs.trae.cn/cli_skills) | Bounded mapping repairs, not a global root resolver redesign. |
| `E-RT-08` | FACT: Grok Build has custom-agent types; our generated subset omits them. Grok Bot has a distinct persistent workspace. | [Build agents](https://docs.x.ai/build/features/subagents), [Bot computer](https://docs.x.ai/grok-bot/computer-and-apps) | Native expansion and private pilot are different deliverables. |
| `E-RT-09` | FACT: the installer reads ownership only from the target's own manifest. A differing unowned file is overwritten and an identical one adopted; a rules-only install can replace a shared `AGENTS.md` carrying another target's development rules; one target's reset can delete shared command skills another target still claims. Shared config merging preserves unknown sibling keys, which is a different contract. | `install.mjs` action selection, category guard and stale cleanup versus `merge.mjs`; reproduced with disposable roots during review | Installer-wide ownership protection precedes new path migrations; do not claim existing overwrite protection. |

Evidence dates and unresolved external details belong in [concept-zero-research.md](concept-zero-research.md). Native behavior not exercised during this design remains unqualified. No vulnerability reproduction, credentials, provider calls, runtime installation or GUI operation is needed to define the design.

## Users and Stakeholders

- Operator: distribute selected practices to actual used harnesses without unexpected services, account changes or lost user content.
- Maintainer: repair a target independently, select a security-appropriate release, and state what is proven without maintaining competing catalogs.
- Skill author: keep one canonical procedure and companions; do not fork prose by vendor or weaken explicit-only commands.
- Implementation peer: receive file ownership, decision gates, migration behavior and observable acceptance criteria before coding.
- Native runtime/MOMO owner: retain responsibility for client installation, accounts, environment selection and deployment. Runtime upgrades are an urgent separate operation when a confirmed advisory requires them.

## Goals, Non-Goals, and Constraints

- `G-RT-01` Security-aware release selection. Distinguish channel, version, known fixed range, and actual qualification; do not retain a vulnerable version merely because it is labelled stable.
- `G-RT-02` Unambiguous runtime identity. Identify product, executing harness, surface, scope and platform; separate selectors when different harnesses require different producers.
- `G-RT-03` Timely Antigravity migration. Display the retirement notice now and qualify the supported replacement before November 1 without implicit execution of manual commands in a clean profile. Other targets' manual-only skill copies in a shared workspace are listed as warnings; whether Antigravity loads them is recorded evidence, not part of this guarantee.
- `G-RT-04` Preserve OpenHands compatibility. Keep build/install/selection and owned assets while lowering its recommendation; no retirement cleanup or Canvas relabeling.
- `G-RT-05` Correct demonstrated mapping defects. Repair Poolside and scoped host/edition/path claims while protecting new destinations and existing unrelated configuration.
- `G-RT-06` Evidence-backed qualification. Keep upstream support, generated output, discovery, task behavior and enforcement claims distinguishable.
- `G-RT-07` Selective next-generation integration. Qualify Grok Build native roles and define a private Grok Bot pilot; admit other runtimes only for a concrete distinct workflow.
- `C-RT-01` Preserve the Node/Ajv compiler, existing format libraries, canonical sources, categories, managed manifests, service-selection semantics and operator execution policy.
- `C-RT-02` Keep design and implementation separate. This change writes design artifacts only; implementation, local commits, publication and deployment retain their own scopes.
- `C-RT-03` Keep regular build/install offline with respect to client release/advisory discovery. Do not execute a potentially affected client just to ask its version.
- `N-RT-01` No automatic client upgrades, account migration, cloud connector enrollment, vulnerability feed service, new persistent store, generic policy engine or orchestration runtime.
- `N-RT-02` No saved-profile reconciliation engine or category-union redesign. Plans become clearer; existing general-reset and partial-install semantics remain.

## Unacceptable Outcomes

- Calling an older named-stable release safe without checking the reported advisory, or calling a latest release fixed without an affected/fixed-range source.
- Representing Cascade and Devin Local as one proven harness because their files or shell overlap.
- Silently truncating rules, moving mandatory global policy into on-demand references, or describing project rules as global protection.
- Continuing to advertise a retired workflow format as current, or migrating a manual command into an automatically invoked skill.
- Removing OpenHands from selection or erasing its managed files merely because recommendation decreases.
- Overwriting or adopting an operator-owned file, silently erasing another target's category contribution, deleting a file another target still claims, or purging an old route before successor proof and a selected migration.
- Treating a provider login, model response, copied file, or historical peer claim as current native acceptance.

## Glossary

**Target** is a stable compiler selector and manifest owner. **Component/harness** is the actual consumer of an asset, not necessarily the editor brand. **Surface** is a native facility such as skills, commands or instructions. **Lifecycle** is upstream active/preview/legacy state; **recommendation** is our advice, separate from implemented status. **Qualification** is dated evidence for one version, component, platform, scope and scenario. **Release selection** chooses a concrete client build; it is not client installation. **Migration** changes owned paths/formats under a previewed operation; it is not a license to modify foreign settings.

## Critical Journeys and Quality Scenarios

- `Q-RT-01` A reported critical runtime issue arrives: before the next affected execution, the runtime owner identifies the exact product and advisory, checks affected/fixed ranges, and records either a verified fixed build or an unresolved hold. Neither a channel name nor a public PoC is substituted for exploitation evidence.
- `Q-RT-02` An operator selects a harness: the plan names the actual component and scope; a fresh profile discovers only the intended generated assets. A co-installed profile tests fallback and precedence rather than masking an omission.
- `Q-RT-03` An Antigravity workflow user previews an install: the dated notice is visible before writes. The replacement supports explicit invocation and companion access; the first successor release retains old owned workflow files, and archiving them is outside this batch ([contract](../contracts/runtime-refresh.md#antigravity)).
- `Q-RT-04` A destination already contains unowned content: the selected target reports a conflict before any write, with a recoverable operator action. A shared generated file that carries another target's category contribution is regenerated for the requested selection with a visible warning naming what was dropped, and cleanup never deletes a file another target still claims. Repeat installation after a resolved migration is idempotent.
- `Q-RT-05` An OpenHands user selects it directly or through all targets: support and ownership stay unchanged, a legacy recommendation is shown, and no first-party MCP selection changes.
- `Q-RT-06` A known rule-size limit is exceeded: the affected output cannot be presented as full native policy. The plan names the limit and a supported alternative or blocker; no automatic summarization or truncation occurs.
- `Q-RT-07` A cloud Bot pilot runs: only selected non-sensitive artifacts enter the workspace; shared account access is understood; the resulting artifact and cancellation/routine lifecycle are observed. No local-device or security-isolation claim follows from a cloud result.

## Research Landscape and Adopt/Adapt/Build

- **Adopt native Agent Skills and plugin managers where their consumed contract is proven.** They reduce custom packaging, but frontmatter portability does not establish identical invocation or tool restrictions. [Agent Skills specification](https://agentskills.io/specification).
- **Adapt existing producers, registries and format libraries.** These already own source loading, output syntax and shared-config merges. No new dependency is selected in this design.
- **Use native runtime release/advisory sources and external lifecycle owners.** A manually reviewed security choice is sufficient for this batch; building a second package updater or CVE database is not.
- **Retain Grimoire/Synapse boundaries.** Retrieval and durable runtime memory are not part of a target-identity migration. No MCP protocol, database or service implementation change is proposed.
- **Pilot persistent workplace products separately.** Grok Bot and similar systems can support long-lived work, but have cloud/account state and import contracts unlike local filesystem adapters. No provider or cost advantage is assumed.

## Candidate Concepts

### A. Documentation-only refresh

Correct descriptions and recommend current releases without changing native output. Cheapest, but Poolside's wrong filename, oversized Cascade rules and the Antigravity retirement remain user-visible failures. Rejected as the complete batch; metadata is still a useful first vertical slice.

### B. Identity-explicit adapters with bounded migrations

Retain the compiler, add small lifecycle/qualification metadata, expose selected-target notices, repair demonstrated paths, and separate real harness contracts. Use native managers and existing manifests; add only the checks required by each migration. Selected: it solves the concrete failures without owning runtime operation.

### C. Universal runtime/profile manager

Own client updates, vulnerability feeds, provider accounts, profile reconciliation and cloud jobs. This could centralize more operations but duplicates runtime/MOMO responsibilities, adds persistent state and converts a compiler refresh into a control plane. Rejected. Shared portable skills alone are also insufficient because they cannot replace native policy, commands and MCP configuration.

## Selected Concept HLD

Canonical sources and pinned external packs feed the existing short-lived Node compiler. The target registry remains the selector/build/install authority; capabilities carry component identity, lifecycle advice and bounded evidence. Pure adapters render supported native files; the installer previews writes, notices, conflicts and removals before applying managed output and named config merges. No new deployment unit or stateful service is introduced.

Security release decisions sit before runtime qualification and deployment, not inside skill compilation. Prefer a verified fixed current release over an affected stable channel, including a supported preview build when that is the available fixed line. Keep its preview label and separate task proof. An unverified advisory report is escalated promptly without inventing an affected range.

Existing target IDs do not silently change harness meaning. Retain `windsurf` for deprecated Cascade compatibility; admit one `devin` artifact target for the shared Local/CLI harness, with separate client qualification. Exclude explicitly deprecated targets from `all` in a deliberate selector change, while retaining explicit selection; that change lands together with Devin's `all` admission. This does not exclude OpenHands: it remains implemented with a legacy recommendation only. Antigravity's successor candidate is native `trigger: manual` rules, not an automatically invoked skill or a guessed flag. Exact producer changes and migration rules follow in architecture/contracts; absent native evidence is a named spike, not speculative code.

## First Production Slice

The first implementation slice is metadata and visible notices, followed by installer ownership protection as a separate patch and then the Poolside route repair. Together they prove the existing entry point can describe the correct component/lifecycle without altering unrelated generated bytes, and that installs and a real owned-path migration preserve unowned and other-owner content. They do not wait for GUI or cloud work. The operator runs the Antigravity GUI qualification in parallel. The urgent DSH upgrade is done; its native requalification is deferred. Antigravity's warning does not wait for its successor acceptance.

## Open Questions and Handoff

Native file/schema and effective-invocation unknowns are bounded implementation prerequisites, not product decisions to guess. The research ledger identifies their sources and the roadmap assigns them. DSH's critical advisory and Cascade's removal from current Desktop are now source-verified, and the installed DSH was upgraded past the affected range. Still required: qualify native Devin roots; prove Antigravity manual-only behavior; verify Grok native role schema and restrictions; keep Grok Bot import/account qualification separate; and requalify DSH natively in a later batch.

`arch-roadmap` carries every `G-RT`/`Q-RT` requirement into a scoped step with files and evidence. `arch-contract` defines the metadata, notice and migration boundaries using existing schemas and installer ownership, with no new transport or database. The implementation peer starts with `dev-spec` for the first bounded slice, not a whole-portfolio rewrite.
