# Runtime Refresh Roadmap

Status: DESIGN READY FOR SCOPED IMPLEMENTATION; RT0.1 UPGRADE DONE; RT1.1, RT1.2, RT2.0 AND RT2.1 IMPLEMENTED; ALL OTHER TASKS NOT STARTED
Date: 2026-09-28; revised the same day after cross-review
Baseline: `3dbdbfe9c67fa7a95cf72a25280d2aa588782956`
Inputs: [concept](context/concept-zero.md), [research](context/concept-zero-research.md), [architecture](architecture.md), [contract](contracts/runtime-refresh.md).

The [previous completed roadmap](history/2026-09-21-runtime-portfolio-roadmap.md) is historical. This roadmap does not reopen its accepted implementations or transfer old runtime PASS evidence to new releases. It schedules design-approved corrections, bounded native spikes and separate operational work. Each task is a commit-sized concern unless its acceptance requires an atomic change; publication and deployment are not implied. Selection, notice, ownership and migration rules live in the [contract](contracts/runtime-refresh.md); tasks below reference them rather than restating them.

## Operating Constraints

`C-RT-01` (existing stack/selection/ownership), `C-RT-02` (design and implementation separation), and `C-RT-03` (offline release-independent generation) apply to every task. `N-RT-01` and `N-RT-02` exclude a new runtime control plane and profile/category reconciliation engine throughout.

- The implementing peer owns code; the coordinator reviews source and real boundary evidence. Runtime/MOMO owns client upgrades and accounts; the compiler still owns its existing MCP prerequisite provisioning. The operator owns GUI qualification.
- No broad client upgrades, production changes, public Bot templates, provider changes or new default services are bundled with metadata/adapter work. GUI sessions happen only inside the native qualification tasks.
- The two pre-existing edits from design time remain outside this batch until their owner accepts them. Re-read live state before implementation; do not reset a shared checkout.
- Use current release/advisory metadata at execution time. Security-fixed public/preview releases may supersede named stable; never relabel them stable or inherit old qualification.
- Keep domain categories, private assets, general-reset semantics and explicit two-MCP deployment profiles unchanged. A source change never triggers distribution by itself.
- No wording/count tests, substitute-backed native acceptance or speculative framework. Schema/real-file/output/native-consumer behavior are the test boundaries.

## Sequence

```text
Urgent parallel: RT0.1 DSH upgrade (done; requalification deferred), RT0.3 Antigravity GUI evidence (operator, now)
First vertical: RT1.1 metadata/notices -> RT1.2 inventory corrections
Ownership:      RT2.0 installer ownership protection (independent)
Antigravity:    RT0.3 + RT1.1 + RT2.0 -> RT2.3, before November 1
Path repair:    RT2.0 -> RT2.1 Poolside route
Cutover:        RT0.2 + RT1.1 + RT2.0 -> RT3.1 Devin; RT1.1 -> RT2.2, whose selector change and RT3.1's `all` admission land as one change
Other paths:    RT1.2 + RT2.0 -> RT2.4
Grok agents:    RT1.2 -> RT3.2
Delivery:       each completed applicable slice -> RT4.1 -> RT4.2

Separate follow-ups: RT3.3 Bot pilot, RT5.1 admission, RT5.2 comparison.
They do not block source corrections or deadline notices.
```

Unknown native behavior blocks only the corresponding expansion or readiness claim. Do not wait for every GUI runtime before shipping a truthful warning or an independently verified repair. Antigravity's notice is immediate; its qualified successor is due **before November 1, 2026**. Cascade project partitioning is not scheduled in this batch: no retained-user need is established, and the size guard does not depend on it.

## Phase 0: Bounded Evidence Gates

### RT0.1 Security-Appropriate Client Baselines

State: DSH UPGRADE DONE 2026-09-28; NATIVE REQUALIFICATION DEFERRED BEYOND THIS BATCH. Depends on: none. Covers: `G-RT-01`, `Q-RT-01`, `C-RT-03`.

The installed DSH was identified from package metadata as `@deepseek-ai/dsh@0.1.1-rc.2`, inside the CNA range for CVE-2026-82533 (`< 0.1.2-alpha.1`), without launching it. It was upgraded through the global npm install to `0.1.7-rc.2`, the current npm `latest`/`next` and a vendor prerelease, not a stable release. Afterward the installed package metadata and the new build's version output both reported `0.1.7-rc.2`; the package defines no lifecycle scripts, and no process, listener or launch job from the old build remained. The bounded skills-only native task has not run, so DSH native support remains unqualified and old proof stays historical.

Files: runtime-catalog observation and capability notice/evidence only after real proof; no DSH updater in `provision.mjs` or doctor. Operational records remain in the normal private evidence location. Use the same security-first procedure for Claude/Grok when an advisory or chosen update applies; do not invent a CVE for them.

Exit for the deferred remainder: the requalification names the exact build and result, uses no affected client for experiments and never falls back below the security boundary. Pure build/install asset work does not wait for it. A broad security audit or active-exploitation verdict is not required.

### RT0.2 Devin Native Root and Conflict Preflight

State: SPIKE_REQUIRED. Depends on: none. Covers: `G-RT-02`, `Q-RT-02`, `Q-RT-04`.

Use a current security-appropriate Devin CLI in a disposable profile. Verify the documented home/project rule roots, config directory on the selected platform, native manual skills and dedicated MCP configuration. Run from another repository for the user-scope claim. Then introduce only the relevant legacy/shared roots and observe duplicate/precedence behavior. Do not disable imports or copy an entire operator profile. Local GUI qualification remains separate.

Artifacts: source-linked qualification record; no production adapter until the root contract passes. Inspect `roots.mjs`, `targets.mjs`, `merge.mjs`, counterpart manifests. Bound unknowns: Windows home-rule route and historical Cascade MCP versions remain unqualified unless actually tested.

Exit: CLI path/schema/semantic evidence plus exact conflict cases is enough to implement that platform's native subset. A missing account/GUI blocks the applicable client, not the identity split. Stop rather than broadening into profile migration.

### RT0.3 Antigravity Manual-Rule Qualification

State: SPIKE_REQUIRED; OPERATOR-OWNED GUI; START NOW, IN PARALLEL WITH RT1.1 AND RT2.0. Depends on: none. Covers: `G-RT-03`, `Q-RT-03`, `Q-RT-06`.

On an identified Antigravity 2.0 build, qualify the documented `trigger: manual` direct-rule surface with a harmless command-sized probe. Observe that a normal related prompt does not automatically load it and explicit `@` selection does. Also establish whether the product still discovers the workflows this repository currently emits under `~/.gemini/antigravity/global_workflows`, whether it discovers skills in a workspace `.agents/skills` (the route `--scope project --dest` already writes), and whether it invokes a `disable-model-invocation: true` skill found there without an explicit request; that last result decides whether `RT2.3`'s co-discovery warning should ever block. Verify global versus project roots and any native includes used. Independently test the standalone IDE before claiming it. No release, deployment, deletion, account migration or vendor conversion command is run; `/migrate-workflows` is never run.

Each receipt records the product and exact build, the platform, the root used, the probe file's path, the prompt used, and the observed result: which file the host loaded (a tool or context record, not model narration) and the resulting artifact. IDE and 2.0 receipts are separate. Probes are harmless and produce a checkable artifact; a real deploy or destructive command is never used as a probe.

Exit: selected product/version/root/invocation and size contract demonstrated; otherwise the successor remains unqualified and old files are preserved. The warning in RT1.1 does not wait. Native CLI plugin behavior cannot substitute for 2.0/IDE evidence. Authentication or unavailable device is a real later proof blocker, not a request to weaken the manual-only contract.

## Phase 1: Small Metadata Vertical

### RT1.1 Capability Extensions and Visible Notices

State: IMPLEMENTED. Depends on: none. Covers: `G-RT-01`, `G-RT-02`, `G-RT-03`, `G-RT-04`, `G-RT-06`, `Q-RT-01`, `Q-RT-03`, `Q-RT-05`.

Promote the reviewed runtime/notice/qualification definitions into the existing capability schema; extend the existing registry loader. Add selected-target notices to build/install previews and before live mutation; reuse display in doctor without adding unsafe version probes. Add OpenHands legacy recommendation, Antigravity workflow deadline, DSH requalification notice and the Windsurf legacy Cascade notice. Add the planner-derived shared-root notice keyed on selected outputs and the resolved install root (contract, Notices). Date changes message wording only. No output producer, target selection, provider or MCP setting changes in this task.

Files: `schemas/target-capabilities.schema.json`, `registry/target-capabilities.json`, `registry.mjs`, `install.mjs`, `doctor.mjs`, relevant adapter docs/reference page, focused `check.test.mjs`/install presentation checks. The superseded design schema and examples were removed; the stored records are the examples, validated by `npm run check`.

Exit: schema validates real records; invalid references/date/evidence are rejected; selected warnings deduplicate and appear before writes; unrelated targets get no warning. The shared-root notice appears for a relocated user-scope install and not for a home-root install. OpenHands and Windsurf explicit/all selection and generated bytes remain unchanged. Check/schema/output behavior is sufficient for this metadata-only acceptance; no new native claim.

### RT1.2 Correct the Existing Capability Inventory

State: IMPLEMENTED; the release observations in `skills/ops-swarm/references/runtime-catalog.md` wait for its owner. Depends on: `RT1.1`. Covers: `G-RT-02`, `G-RT-05`, `G-RT-06`, `Q-RT-02`.

Narrow Codex project, VS Code harness, Cursor global-rule, config-home and edition claims to the actual supported contract. Distinguish package versions from Kiro harness labels; correct Kimi/OpenCode/Pi descriptions against current selected sources. Identify editor/CLI/exporter/cloud units. Retain every unaffected target and the current category boundaries. Do not remove existing files or add native features through wording.

Files: capability registry, adapter READMEs, `docs/reference/targets.md`, release observations in `skills/ops-swarm/references/runtime-catalog.md` only after coordinating its current owner. That dirty file must not be overwritten wholesale.

Exit: all current target IDs still accounted for; every new support claim links a source and identifies proof level. No inferred GUI acceptance, universal stable-version claim or untouched runtime suddenly marked qualified. Existing structural check, generated-output comparison, and a readback are enough for claim-only changes.

## Phase 2: Demonstrated Output Repairs

### RT2.0 Installer Ownership Protection

State: IMPLEMENTED. Depends on: none. Covers: `G-RT-05`, `Q-RT-04`.

Implement contract Migration steps 2, 3, 6 and 7 for every whole-file output: claims from this target's manifest, legacy entries and legacy nested manifests plus every other manifest in the same install root; `UNOWNED_DESTINATION` for unclaimed existing files, identical bytes included, with no manifest adoption; regeneration of co-owned files with a `SHARED_CONTRIBUTION_REPLACED` plan warning when another owner's recorded category is not selected; one target-neutral header for the shared project `AGENTS.md`; cross-owner stale retention judged by next manifests; every participant's pending union manifest written before the run's first mutation; `MANIFEST_UNREADABLE` for an unparsable or structurally invalid manifest, `config_entries` included; nested-manifest cleanup that lists the recorded files it leaves unclaimed. Keep the same-run differing-bytes conflict and the same-target category guard. Config merges are unchanged.

Reproducers from review: a Droid development install followed by an OpenHands rules-only install into the same project replaces the shared `AGENTS.md` and drops the development rules without saying so; OpenHands and Zed development installs followed by a Zed general reset delete every shared `.agents/skills` file OpenHands still claims (266 removals, 261 of them OpenHands-claimed, in the review reproduction); an identical unowned file is silently adopted into the manifest and a differing one is overwritten; an interrupted fresh install leaves its written files unclaimed.

Files: `install.mjs` plan, apply and presentation; the shared `AGENTS.md` title in `targets.mjs`; the `registry/legacy-owned.json` comment, which must describe nested-manifest claims; a focused `ownership.test.mjs` suite and the affected `install.test.mjs` cases, through the real CLI and disposable roots. Existing tests that encode identical-bytes adoption or cross-owner deletion change only where this contract replaces that behavior, with the reason recorded.

Exit: unowned files stay protected, identical or differing, with zero mutation; two development co-owners can each reset individually with the warning, reset jointly with identical shared bytes, and return to development without manifest edits; shared stale files survive until their last owner releases them; genuinely incompatible same-path outputs still conflict; owned, legacy-owned and nested-legacy updates, a rerun after an interrupted apply, and repeat installs behave as specified; unrelated targets' outputs and config merges are unchanged apart from the neutral shared header.

### RT2.1 Poolside Personal Route

State: IMPLEMENTED; native discovery of both routes is not yet qualified (the local `pool exec` fails with a model-not-found error). Depends on: `RT2.0`. Covers: `G-RT-05`, `Q-RT-04`.

Current personal output is `.poolside`; native documentation names `AGENTS.md`. Fix that one route and declare the old route for contract Migration step 4: remove the owned old file only after the replacement write and only when its bytes equal the replacement; otherwise block with `MIGRATION_SOURCE_CONFLICT`, or retain it with `LEGACY_FILE_RETAINED` once a recorded qualification proves the current client ignores `.poolside`. No general managed-file editor, backup store or journal.

Expected outcome: any change under `rules/` since a user's last Poolside install makes the old `.poolside` differ from the replacement render, and `rules/` changes often. Until the ignored-route qualification exists, most upgrading installs therefore stop with `MIGRATION_SOURCE_CONFLICT`; the diagnostic tells the operator to review the old file, move or remove it, and rerun. That is the intended safe outcome, not a defect.

Files: `roots.mjs`, `targets.mjs`, `install.mjs`, Poolside metadata/docs, focused roots/build/install cases.

Exit: real disposable default/XDG destinations show old/new behavior; an identical owned old route is replaced (reachable only when `rules/` is unchanged since that install); a differing old route blocks with zero mutation unless proven ignored; an unowned new destination blocks through `RT2.0`; unrelated files/config survive; a repeat install makes no change. Qualify native discovery of both routes on the chosen current client before claiming live support. Product tests prove files; they do not stand in for that loader.

### RT2.2 Windsurf Cutover: Deprecation, Size Guard and Build Availability

State: NOT STARTED. Depends on: `RT1.1`; its selector change lands in the same change as `RT3.1`'s `all` admission. Covers: `G-RT-02`, `G-RT-04`, `G-RT-05`, `Q-RT-02`, `Q-RT-05`, `Q-RT-06`.

Implement the contract's cutover invariant and build-availability rule: mark `windsurf` deprecated compatibility, preserve explicit selection/manifest, visibly exclude deprecated targets from build/install `all`, make `windsurf` `build_supported: false` and enforce that registry field in the build selector together with the `check.mjs` change. Keep OpenHands implemented/included. Measure complete output, but apply blocking checks after effective category/scope filtering and before build deletes dist or install provisions/writes. Global full-policy remains blocked; install can still select skills only. No new build filters, truncation or compact policy. The size-guard code may land earlier, but it must not block `windsurf` inside `all` before the cutover.

Files: targets registry/schema semantics, selectors in `install.mjs`, pure renderer/producer and root helpers, `check.mjs`, matrix/build/install cases; capability/adapter docs. No `retiredInstallTargets` entry or automatic old profile cleanup.

Exit: exact/over boundaries, conservative Unicode counting, `all` exclusions, build availability and explicit compatibility selection tested; old dist/destination/manifests remain unchanged on invalid selected output; unselected oversized rules do not block skills-only installation; no default `all` holds both harnesses, and none loses both for a profile without a Cascade overlap. No unsafe old client is installed for a demo. Global limitations remain visible, not a full-parity claim.

### RT2.3 Antigravity Successor Before November 1

State: NOT STARTED. Depends on: `RT0.3`, `RT1.1`, `RT2.0`. Covers: `G-RT-03`, `Q-RT-03`, `Q-RT-04`, `Q-RT-06`.

Implement the qualified native manual-rule producer and correct user/project root handling, retaining ordinary directory skills/companions. Update tokens to rules while preserving command source identity. Document `@` invocation and source/render category matching. Preserve legacy workflow files from current manifests and `legacy-owned.json`, including the former manifest, on full and partial installs; no generic stale deletion. A workflow-only old selector must not silently delete without replacement. Keep CLI plugin staging/registration unchanged. Add the `CO_DISCOVERED_MANUAL_SKILL` plan warning over installed, retained and pending outputs in the roots the product co-discovers; it neither blocks nor rewrites shared skill copies or excludes any target, and `RT0.3` evidence decides any later block.

Files: `render.mjs`, `roots.mjs`, `targets.mjs`, bounded migration policy in `install.mjs`, the `registry/legacy-owned.json` comment (legacy workflows are retained, not removed), targets/capability metadata, adapter docs, command-reference rewriting where applicable, real build/install/skill-package cases.

Exit: in a clean profile, the actual selected product discovers and invokes the successor manually, with no automatic skill fallback; a co-installed run records whether Antigravity loads other targets' manual-only copies, as evidence rather than a failure; expanded 24,000-byte limit honored; co-discovered protected command skills are listed before mutation, including for a fresh plan whose project-scope Antigravity install shares a workspace with pending protected command skills, and `--target all --scope project --category development` stays installable. Warnings identify every installed or pending owner and give the operator action. Full/repeat install with legacy-listed workflows/former manifest but no current manifest retains those files. Destination conflict and partial category/repeat retain ownership. Do not claim unsupported IDE/CLI parity from 2.0 proof. Archival is outside this batch.

### RT2.4 Remaining Platform/Edition Paths

State: IN PROGRESS; the Zed and Goose per-OS routes are implemented (Windows loading is not natively qualified; the Windows CI job plans the routes). Depends on: `RT1.2`, `RT2.0`. Covers: `G-RT-05`, `Q-RT-02`, `Q-RT-04`.

Separate small changes, one change each. Each starts with the actual versioned path contract and one real reproducer; no universal config-home layer or writes to every candidate root.

- Zed and Goose: route user config through the per-OS roots: Zed `~/.config/zed` on macOS and Linux and the roaming AppData `Zed` directory on Windows; Goose `~/.config/goose` and `AppData\Roaming\Block\goose\config`. Pre-fix Windows `~/.config` settings go through declared obsolete-route cleanup, and Zed's personal `AGENTS.md` through Migration step 4, with Zed's pinned `config_dir()` source as the evidence that Windows Zed ignores the old route.
- Trae: the selected CN, international and CLI routes.
- Cline: the per-editor MCP files, including the Devin Desktop location.

Files: corresponding `roots.mjs` helpers/adapter producers, metadata, focused roots/build/install tests. A native loader check is required only for that target's live claim.

Exit: chosen platform/edition loads the installed artifact; foreign/unmanaged state and other editors remain unchanged. Missing Windows/GUI device leaves that native result pending and does not borrow POSIX evidence. Do not bundle this phase into the deadline migration if it delays it.

## Phase 3: Selective New Capabilities

### RT3.1 Devin Local/CLI Artifact Target

State: NOT STARTED. Depends on: `RT0.2`, `RT1.1`, `RT2.0`. Covers: `G-RT-02`, `Q-RT-02`, `Q-RT-04`.

Add one `devin` adapter for the qualified native subset: complete rules, directory skills, manual command skills and dedicated MCP files. Reuse existing format-aware merge and source readers. Keep Local/CLI proof separate; custom subagents wait for model/tool-policy resolution. Detect the Cascade overlap on every Devin plan, and on `windsurf` plans for profiles holding Devin output, from the co-discovered state itself rather than a manifest, over the surfaces `RT0.2` records: an explicit Devin selection with an existing overlap, an explicit `windsurf` selection that would create one, or an explicit `windsurf,devin` selection whose plans would create one, blocks as `CASCADE_TRANSITION_REQUIRED`; `all` lists Devin as excluded under that label, naming the transition, and proceeds. A fresh nonconflicting install is the first supported journey, not a whole-profile migration.

Files: targets/capabilities/schemas, roots/render/producer, one adapter README, selected role metadata only if a later agent surface is qualified, focused build/install/matrix cases. No duplicate `devin-local`/`devin-cli` artifact writers.

Exit: generated command/skill/MCP output consumed by the actual CLI, useful harmless MCP call, manual command loading, source/companion provenance and repeat install verified. Local GUI remains a separately labelled result until run. `all` admission occurs only with implementation and native CLI evidence, with release notes for the selector delta, in the same change as `RT2.2`'s selector change per the cutover invariant.

### RT3.2 Grok Build Native Agents

State: SPIKE_REQUIRED then implementation. Depends on: `RT1.2`. Covers: `G-RT-07`, `Q-RT-02`, `G-RT-06`.

Resolve the complete current custom-agent format and exact selected release; public latest is allowed under the user's security-first policy without claiming a named stable pointer. Prove inherited model and effective role/tool restrictions; do not treat `allowed-tools` metadata as enforcement by spelling alone. Then add only the native producer/role declarations the contract supports.

Files: Grok root/render/target helpers, subagent target declarations and schema allowlists where required, capability/adapter docs, actual format and native-role acceptance.

Exit: clean-root role discovery from Grok's intended native path, then co-installed compatibility case, harmless delegated task, observed allowed/denied tool behavior. A role appearing only through `.claude/agents` fails native provenance. No provider/model default takeover or hidden dependency on the operator's populated home.

### RT3.3 Grok Bot Private Workplace Pilot

State: OPTIONAL PILOT; NOT STARTED. Depends on: none. Covers: `G-RT-07`, `Q-RT-07`, `N-RT-01`.

Select one non-sensitive documentation/release-research task and export only its needed procedure/companions. Inspect account-shared access without copying secrets; do not assume another Bot is isolated. Manual import first, no automatic dot-directory adapter or undocumented API. Local-computer access, connectors and public templates are not enabled. Test a verifiable artifact, companion read, partial failure/cancel; only then a separately selected routine with pause/delete behavior. A Test run is real work.

Files: ignored pilot plan/evidence first. A later reviewed reusable skill/export contract is possible only if the pilot proves it necessary; no production integration is assigned now.

Exit: exact product/account boundary, task input/output, observed failure/cancel and any routine state documented. Human-only login/device or unavailable UI is a legitimate proof blocker. Cloud success is not Windows-local acceptance or a cost/quality improvement claim.

## Phase 4: Qualification and Deployment

### RT4.1 Record Only Proven Support

State: NOT STARTED. Depends on: completed applicable tasks among `RT2.0`, `RT2.1`, `RT2.2`, `RT2.3`, `RT2.4`, `RT3.1`, `RT3.2`; do not wait for all. Covers: `G-RT-06`, `Q-RT-01` through `Q-RT-06`.

For each changed surface, record exact source revision, component/client/build/channel/platform/scope, scenario, outcome, artifacts and limitations through the reviewed schema. Run repo checks plus targeted/full suites proportionate to changed shared behavior. Compare generated bytes for unaffected targets. Native task and policy results remain separate from tests. An opt-in live test requested but blocked must return a non-success outcome, not silently skip to green.

Exit: each claimed surface has its own proof; deferred GUI/platform results remain explicitly not-run/blocked. No provider credentials/raw prompts in public artifacts. No blanket 26-target readiness statement.

### RT4.2 Scoped Distribution

State: NOT STARTED; deployment requires its own requested scope. Depends on: `RT4.1` for the surfaces being deployed.

Preview the established target/category/service set and current destination ownership. Show deprecated exclusions and ownership/migration conflicts; do not turn the new catalog into an unsolicited all-target or all-service expansion. Keep exact selected two-MCP profiles unless separately changed. Deploy one canary target/root, check real discovery and unchanged unrelated config, then only the requested fleet.

Exit: actual installed content/companions and chosen native behavior verified; old owned routes handled per transition contract, unowned content preserved, no runtime downgrade. Repo sync, asset deployment and client upgrade are separate claims.

## Phase 5: Follow-Up, Not Batch Blockers

### RT5.1 Loader-First Admission Queue

State: DEFERRED. Depends on: `RT1.1`. Covers: `G-RT-07`. Amp/Auggie first because they are already planned; then Vibe/Junie for demonstrated used workflows. Probe existing shared portable output before building a new adapter. Keep Warp local/cloud, ACP host bindings, and persistent-agent systems distinct. No popularity-driven default target, provider or MCP additions.

Exit for any admission: current exact component, package/license/security review, real discovery and harmless task; native-only delta justified. No agent-surface control plane, new database or generic target DSL.

### RT5.2 Task-Shaped Distribution Comparison

State: DEFERRED. Depends on: `RT4.1`. Compare direct files, native plugins and on-demand retrieval only on matched tasks and actual outcomes, including child costs when exposed. Keep failures and contaminated runs visible. Do not infer quality/cost from body size or tool-list bytes. No code change or efficiency claim is required just to close this design.

## Requirement Coverage and First Handoff

| Requirement | Tasks whose Covers line names it |
|---|---|
| `G-RT-01` | `RT0.1`, `RT1.1` |
| `G-RT-02` | `RT0.2`, `RT1.1`, `RT1.2`, `RT2.2`, `RT3.1` |
| `G-RT-03` | `RT0.3`, `RT1.1`, `RT2.3` |
| `G-RT-04` | `RT1.1`, `RT2.2` |
| `G-RT-05` | `RT1.2`, `RT2.0`, `RT2.1`, `RT2.2`, `RT2.4` |
| `G-RT-06` | `RT1.1`, `RT1.2`, `RT3.2`, `RT4.1` |
| `G-RT-07` | `RT3.2`, `RT3.3`, `RT5.1` |
| `Q-RT-01` | `RT0.1`, `RT1.1`, `RT4.1` |
| `Q-RT-02` | `RT0.2`, `RT1.2`, `RT2.2`, `RT2.4`, `RT3.1`, `RT3.2`, `RT4.1` |
| `Q-RT-03` | `RT0.3`, `RT1.1`, `RT2.3`, `RT4.1` |
| `Q-RT-04` | `RT0.2`, `RT2.0`, `RT2.1`, `RT2.3`, `RT2.4`, `RT3.1`, `RT4.1` |
| `Q-RT-05` | `RT1.1`, `RT2.2`, `RT4.1` |
| `Q-RT-06` | `RT0.3`, `RT2.2`, `RT2.3`, `RT4.1` |
| `Q-RT-07` | `RT3.3` |

Start with **`dev-spec` for RT1.1**, then RT2.0, each in its own patch; RT2.1 follows RT2.0, and RT2.3 follows once RT0.3 evidence exists. The operator runs RT0.3 now in parallel. Devin RT0.2 is the next bounded native evidence task, not an invitation to implement every optional native feature. Commit locally as requested by the implementation workflow; push/PR/distribution remain explicit subsequent scopes.

No task is marked complete by this design. Source/schema/link validation qualifies the handoff, not the runtime changes it describes.
