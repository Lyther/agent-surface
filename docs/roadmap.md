# Runtime Refresh Roadmap

Status: DESIGN READY FOR SCOPED IMPLEMENTATION; RT0.1 UPGRADE DONE; RT0.2 DISCOVERY DONE; RT1.1, RT1.2, RT2.0, RT2.1, RT2.2, RT2.4 AND RT3.2 IMPLEMENTED; RT3.1 DROPPED; RT4.1 DONE FOR THIS BATCH; RT4.2 DISTRIBUTED 2026-10-08; RT0.3 AND RT2.3 DEFERRED TO THE COMPUTER-USE EFFORT; ALL OTHER TASKS NOT STARTED
Date: 2026-09-28; last revised 2026-10-08
Baseline: `3dbdbfe9c67fa7a95cf72a25280d2aa588782956`
Inputs: [concept](context/concept-zero.md), [research](context/concept-zero-research.md), [architecture](architecture.md), [contract](contracts/runtime-refresh.md).

Separate workstream added 2026-10-13: [Phase AS-AR](#phase-as-ar-agent-reuse-capability-trial). The bounded native spike and supervised stop have real proof; comparative capability remains untested. This does not change the runtime-refresh task dispositions or authorize deployment by checkbox.

The [previous completed roadmap](https://github.com/Lyther/agent-surface/blob/3dbdbfe9c67fa7a95cf72a25280d2aa588782956/docs/roadmap.md) is historical. This roadmap does not reopen its accepted implementations or transfer old runtime PASS evidence to new releases. It schedules design-approved corrections, bounded native spikes and separate operational work. Each task is a commit-sized concern unless its acceptance requires an atomic change; publication and deployment are not implied. Selection, notice, ownership and migration rules live in the [contract](contracts/runtime-refresh.md); tasks below reference them rather than restating them.

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
Antigravity:    RT0.3 + RT1.1 + RT2.0 -> RT2.3, before October 19
Path repair:    RT2.0 -> RT2.1 Poolside route
Cutover:        RT1.1 -> RT2.2 Cascade cutover; RT0.2 -> RT3.1 Devin (dropped: Devin CLI lists the other targets' output)
Other paths:    RT1.2 + RT2.0 -> RT2.4
Grok agents:    RT1.2 -> RT3.2
Delivery:       each completed applicable slice -> RT4.1 -> RT4.2

Separate follow-ups: RT3.3 Bot pilot, RT5.1 admission, RT5.2 comparison.
They do not block source corrections or deadline notices.
```

Unknown native behavior blocks only the corresponding expansion or readiness claim. Do not wait for every GUI runtime before shipping a truthful warning or an independently verified repair. Antigravity's notice is immediate; its qualified successor is due **before October 19, 2026**. Cascade project partitioning is not scheduled in this batch: no retained-user need is established, and the size guard does not depend on it.

## Phase 0: Bounded Evidence Gates

### RT0.1 Security-Appropriate Client Baselines

State: DSH UPGRADE DONE 2026-09-28; NATIVE REQUALIFICATION DEFERRED BEYOND THIS BATCH. Depends on: none. Covers: `G-RT-01`, `Q-RT-01`, `C-RT-03`.

The installed DSH was identified from package metadata as `@deepseek-ai/dsh@0.1.1-rc.2`, inside the CNA range for CVE-2026-82533 (`< 0.1.2-alpha.1`), without launching it. It was upgraded through the global npm install to `0.1.7-rc.2`, the current npm `latest`/`next` and a vendor prerelease, not a stable release. Afterward the installed package metadata and the new build's version output both reported `0.1.7-rc.2`; the package defines no lifecycle scripts, and no process, listener or launch job from the old build remained. The bounded skills-only native task has not run, so DSH native support remains unqualified and old proof stays historical.

Files: runtime-catalog observation and capability notice/evidence only after real proof; no DSH updater in `provision.mjs` or doctor. Operational records remain in the normal private evidence location. Use the same security-first procedure for Claude/Grok when an advisory or chosen update applies; do not invent a CVE for them.

Exit for the deferred remainder: the requalification names the exact build and result, uses no affected client for experiments and never falls back below the security boundary. Pure build/install asset work does not wait for it. A broad security audit or active-exploitation verdict is not required.

### RT0.2 Devin Native Root and Conflict Preflight

State: DONE (discovery) on Devin CLI 3000.11.3, macOS arm64, 2026-10-08: Devin CLI already lists the rules, skills and MCP servers the other targets write, through its default imports, so no `devin` target is built ([contract](contracts/runtime-refresh.md#cascade-compatibility-and-devin) has the roots and the decision). No model-backed check ran because the CLI was not signed in; Windows and Devin Desktop's Local harness were not run. Depends on: none. Covers: `G-RT-02`, `Q-RT-02`, `Q-RT-04`.

Use a current security-appropriate Devin CLI in a disposable profile. Verify the documented home/project rule roots, config directory on the selected platform, native manual skills and dedicated MCP configuration. Run from another repository for the user-scope claim. Then introduce only the relevant legacy/shared roots and observe duplicate/precedence behavior. Do not disable imports or copy an entire operator profile. Local GUI qualification remains separate.

Artifacts: source-linked qualification record; no production adapter until the root contract passes. Inspect `roots.mjs`, `targets.mjs`, `merge.mjs`, counterpart manifests. Bound unknowns: Windows home-rule route and historical Cascade MCP versions remain unqualified unless actually tested.

Exit: CLI path/schema/semantic evidence plus exact conflict cases is enough to implement that platform's native subset. A missing account/GUI blocks the applicable client, not the identity split. Stop rather than broadening into profile migration.

### RT0.3 Antigravity Manual-Rule Qualification

State: DEFERRED (user decision, 2026-10-08): this GUI-only qualification becomes the first desktop task of the separate computer-use effort, run in a disposable computer instead of the operator's profile. Depends on: none. Covers: `G-RT-03`, `Q-RT-03`, `Q-RT-06`.

On an identified Antigravity 2.0 build, qualify the documented `trigger: manual` direct-rule surface with a harmless command-sized probe. Observe that a normal related prompt does not automatically load it and explicit `@` selection does. Also establish whether the product still discovers the workflows this repository currently emits under `~/.gemini/antigravity/global_workflows`, whether it discovers skills in a workspace `.agents/skills` (the route `--scope project --dest` already writes), and whether it invokes a `disable-model-invocation: true` skill found there without an explicit request; that last result decides whether `RT2.3`'s co-discovery warning should ever block. Verify global versus project roots and any native includes used. Independently test the standalone IDE before claiming it. No release, deployment, deletion, account migration or vendor conversion command is run; `/migrate-workflows` is never run.

Each receipt records the product and exact build, the platform, the root used, the probe file's path, the prompt used, and the observed result: which file the host loaded (a tool or context record, not model narration) and the resulting artifact. IDE and 2.0 receipts are separate. Probes are harmless and produce a checkable artifact; a real deploy or destructive command is never used as a probe.

Exit: selected product/version/root/invocation and size contract demonstrated; otherwise the successor remains unqualified and old files are preserved. The warning in RT1.1 does not wait. Native CLI plugin behavior cannot substitute for 2.0/IDE evidence. Authentication or unavailable device is a real later proof blocker, not a request to weaken the manual-only contract.

## Phase 1: Small Metadata Vertical

### RT1.1 Capability Extensions and Visible Notices

State: IMPLEMENTED. Depends on: none. Covers: `G-RT-01`, `G-RT-02`, `G-RT-03`, `G-RT-04`, `G-RT-06`, `Q-RT-01`, `Q-RT-03`, `Q-RT-05`.

Promote the reviewed notice definition into the existing capability schema; extend the existing registry loader. (Runtime and qualification records were dropped on 2026-09-30; see `RT4.1`.) Add selected-target notices to build/install previews and before live mutation; reuse display in doctor without adding unsafe version probes. Add OpenHands legacy recommendation, Antigravity workflow deadline, DSH requalification notice and the Windsurf legacy Cascade notice. Add the planner-derived shared-root notice keyed on selected outputs and the resolved install root (contract, Notices). Date changes message wording only. No output producer, target selection, provider or MCP setting changes in this task.

Files: `schemas/target-capabilities.schema.json`, `registry/target-capabilities.json`, `registry.mjs`, `install.mjs`, `doctor.mjs`, relevant adapter docs/reference page, focused `check.test.mjs`/install presentation checks. The superseded design schema and examples were removed; the stored notices are the examples, validated by `npm run check`.

Exit: schema validates the stored notices; invalid references and dates are rejected; selected warnings deduplicate and appear before writes; unrelated targets get no warning. The shared-root notice appears for a relocated user-scope install and not for a home-root install. OpenHands and Windsurf explicit/all selection and generated bytes remain unchanged. Check/schema/output behavior is sufficient for this metadata-only acceptance; no new native claim.

### RT1.2 Correct the Existing Capability Inventory

State: IMPLEMENTED; the release observations in `skills/ops-swarm/references/runtime-catalog.md` wait for its owner. Depends on: `RT1.1`. Covers: `G-RT-02`, `G-RT-05`, `G-RT-06`, `Q-RT-02`.

Narrow Codex project, VS Code harness, Cursor global-rule, config-home and edition claims to the actual supported contract. Distinguish package versions from Kiro harness labels; correct Kimi/OpenCode/Pi descriptions against current selected sources. Identify editor/CLI/exporter/cloud units. Retain every unaffected target and the current category boundaries. Do not remove existing files or add native features through wording.

Files: capability registry, adapter READMEs, `docs/reference/targets.md`, release observations in `skills/ops-swarm/references/runtime-catalog.md` only after coordinating its current owner. That dirty file must not be overwritten wholesale.

Exit: all current target IDs still accounted for; every new support claim links a source and identifies proof level. No inferred GUI acceptance, universal stable-version claim or untouched runtime suddenly marked qualified. Existing structural check, generated-output comparison, and a readback are enough for claim-only changes.

## Phase 2: Demonstrated Output Repairs

### RT2.0 Installer Ownership Protection

State: IMPLEMENTED. Depends on: none. Covers: `G-RT-05`, `Q-RT-04`.

Implement contract Migration steps 2, 3, 6 and 7 for every whole-file output: claims from this target's manifest, legacy entries and legacy nested manifests plus every other manifest in the same install root; `UNOWNED_DESTINATION` for unclaimed existing files, identical bytes included, with no manifest adoption; regeneration of co-owned files with a `SHARED_CONTRIBUTION_REPLACED` plan warning when another owner's recorded category is not selected; one target-neutral header for the shared project `AGENTS.md`; cross-owner stale retention judged by next manifests; every participant's pending union manifest written before the run's first mutation; `MANIFEST_UNREADABLE` for an unparsable manifest; nested-manifest claims that never authorize a removal. Keep the same-run differing-bytes conflict and the same-target category guard. Config merges are unchanged.

Reproducers from review: a Droid development install followed by an OpenHands rules-only install into the same project replaces the shared `AGENTS.md` and drops the development rules without saying so; OpenHands and Zed development installs followed by a Zed general reset delete every shared `.agents/skills` file OpenHands still claims (266 removals, 261 of them OpenHands-claimed, in the review reproduction); an identical unowned file is silently adopted into the manifest and a differing one is overwritten; an interrupted fresh install leaves its written files unclaimed.

Files: `install.mjs` plan, apply and presentation; the shared `AGENTS.md` title in `targets.mjs`; the `registry/legacy-owned.json` comment, which must describe nested-manifest claims; a focused `ownership.test.mjs` suite and the affected `install.test.mjs` cases, through the real CLI and disposable roots. Existing tests that encode identical-bytes adoption or cross-owner deletion change only where this contract replaces that behavior, with the reason recorded.

Exit: unowned files stay protected, identical or differing, with zero mutation; two development co-owners can each reset individually with the warning, reset jointly with identical shared bytes, and return to development without manifest edits; shared stale files survive until their last owner releases them; genuinely incompatible same-path outputs still conflict; owned, legacy-owned and nested-legacy updates, a rerun after an interrupted apply, and repeat installs behave as specified; unrelated targets' outputs and config merges are unchanged apart from the neutral shared header.

### RT2.1 Poolside Personal Route

State: IMPLEMENTED; pool 1.0.2, older than the v1.0.7 switch to the global `AGENTS.md`, reads only `.poolside` (standalone-mode capture, 2026-09-30), so plans carry the `POOL_AGENTS_MD_CLIENT_FLOOR` notice; pool 1.0.16 sends both the personal `AGENTS.md` and `.poolside`, so a selection that writes `AGENTS.md` retires `.poolside` with it (simplified 2026-09-30 from a byte-equality rule that blocked most upgrades). Depends on: `RT2.0`. Covers: `G-RT-05`, `Q-RT-04`.

Current personal output is `.poolside`; native documentation names `AGENTS.md`. Fix that one route and declare the old one beside it under contract Migration step 4: the category guard reads the old route's category, and a selection that writes the replacement retires the old file. No general managed-file editor, backup store or journal.

Files: `roots.mjs`, `targets.mjs`, `install.mjs`, Poolside metadata/docs, focused roots/build/install cases.

Exit: real disposable default/XDG destinations show old/new behavior; an identical owned old route is replaced (reachable only when `rules/` is unchanged since that install); a differing old route blocks with zero mutation unless proven ignored; an unowned new destination blocks through `RT2.0`; unrelated files/config survive; a repeat install makes no change. Qualify native discovery of both routes on the chosen current client before claiming live support. Product tests prove files; they do not stand in for that loader.

### RT2.2 Windsurf Cutover: Deprecation, Size Guard and Build Availability

State: IMPLEMENTED without a Devin admission (`RT3.1` dropped): `windsurf` is `deprecated` and `build_supported: false`, build and install `all` list it as excluded, `build --target windsurf` refuses, and the planner refuses a selected Windsurf rules document over Cascade's limit (`OUTPUT_LIMIT_EXCEEDED`, before any write). No Cascade client was run; the limits are the documented ones. Depends on: `RT1.1`. Covers: `G-RT-02`, `G-RT-04`, `G-RT-05`, `Q-RT-02`, `Q-RT-05`, `Q-RT-06`.

Implement the contract's cutover invariant and build-availability rule: mark `windsurf` deprecated compatibility, preserve explicit selection/manifest, visibly exclude deprecated targets from build/install `all`, make `windsurf` `build_supported: false` and enforce that registry field in the build selector together with the `check.mjs` change. Keep OpenHands implemented/included. Measure complete output, but apply blocking checks after effective category/scope filtering and before build deletes dist or install provisions/writes. Global full-policy remains blocked; install can still select skills only. No new build filters, truncation or compact policy. The size-guard code may land earlier, but it must not block `windsurf` inside `all` before the cutover.

Files: targets registry/schema semantics, selectors in `install.mjs`, pure renderer/producer and root helpers, `check.mjs`, matrix/build/install cases; capability/adapter docs. No `retiredInstallTargets` entry or automatic old profile cleanup.

Exit: exact/over boundaries, conservative Unicode counting, `all` exclusions, build availability and explicit compatibility selection tested; old dist/destination/manifests remain unchanged on invalid selected output; unselected oversized rules do not block skills-only installation; no default `all` writes Cascade output. No unsafe old client is installed for a demo. Global limitations remain visible, not a full-parity claim.

### RT2.3 Antigravity Successor Before October 19

State: DEFERRED with `RT0.3` (user decision, 2026-10-08). Antigravity stops reading workflows on October 19, 2026, so the generated workflows go unread until the successor ships; the `ANTIGRAVITY_WORKFLOW_RETIREMENT` notice already says so, and nothing is deleted. Depends on: `RT0.3`, `RT1.1`, `RT2.0`. Covers: `G-RT-03`, `Q-RT-03`, `Q-RT-04`, `Q-RT-06`.

Implement the qualified native manual-rule producer and correct user/project root handling, retaining ordinary directory skills/companions. Update tokens to rules while preserving command source identity. Document `@` invocation and source/render category matching. Preserve legacy workflow files from current manifests and `legacy-owned.json`, including the former manifest, on full and partial installs; no generic stale deletion. A workflow-only old selector must not silently delete without replacement. Keep CLI plugin staging/registration unchanged. Build no co-discovery warning ahead of evidence: if `RT0.3` shows Antigravity invokes other targets' manual-only skills autonomously, decide then between a `CO_DISCOVERED_MANUAL_SKILL` warning and moving those skills out of the shared root.

Files: `render.mjs`, `roots.mjs`, `targets.mjs`, bounded migration policy in `install.mjs`, the `registry/legacy-owned.json` comment (legacy workflows are retained, not removed), targets/capability metadata, adapter docs, command-reference rewriting where applicable, real build/install/skill-package cases.

Exit: in a clean profile, the actual selected product discovers and invokes the successor manually, with no automatic skill fallback; a co-installed run records whether Antigravity loads other targets' manual-only copies, as evidence rather than a failure; expanded 24,000-byte limit honored; co-discovered protected command skills are listed before mutation, including for a fresh plan whose project-scope Antigravity install shares a workspace with pending protected command skills, and `--target all --scope project --category development` stays installable. Warnings identify every installed or pending owner and give the operator action. Full/repeat install with legacy-listed workflows/former manifest but no current manifest retains those files. Destination conflict and partial category/repeat retain ownership. Do not claim unsupported IDE/CLI parity from 2.0 proof. Archival is outside this batch.

### RT2.4 Remaining Platform/Edition Paths

State: IMPLEMENTED (the Zed and Goose per-OS routes, the Cline per-IDE presence guard and the Trae split); native qualification is partial: Windows loading, the international IDE's user rules file, agents root and user MCP route, and the Trae CN IDE are untested; Trae CLI 2.0 passes discovery only for its MCP config, project skills and rules (see `RT4.1`); and the Windows CI job plans the per-OS routes. Gaps found along the way are listed in `RT5.3`. Depends on: `RT1.2`, `RT2.0`. Covers: `G-RT-02`, `G-RT-05`, `Q-RT-02`, `Q-RT-04`.

Separate small changes, one change each. Each starts with the actual versioned path contract and one real reproducer; no universal config-home layer or writes to every candidate root.

- Zed and Goose: route user config through the per-OS roots: Zed `~/.config/zed` on macOS and Linux and the roaming AppData `Zed` directory on Windows; Goose `~/.config/goose` and `AppData\Roaming\Block\goose\config`. Pre-fix Windows `~/.config` settings go through declared obsolete-route cleanup, and Zed's old personal `AGENTS.md` is a moved route (Migration step 4); Zed's pinned `config_dir()` source shows Windows Zed never reads it.
- Cline: write each per-editor MCP file only for an editor where Cline is present (operator decision, 2026-09-29), Devin Desktop included under the same guard (operator decision, 2026-09-30). The pre-SDK extension that most 4.x installs still run reads its per-editor file; only the CLI and the SDK-based extension, rolling out from 4.1.0, read the shared `~/.cline` file.
- Trae: split the mixed target into three runtimes by root set (operator decision, 2026-09-29): `trae` (international IDE), `trae-cn` (CN IDE) and `trae-cli` (Trae CLI 2.0), each writing only the roots its product reads ([contract](contracts/runtime-refresh.md#target-and-runtime-identity)); the former key keeps its CN rules and CLI servers until the successor adopts them under Migration step 3. The same rule decides other editor/CLI pairs: Kilo's CLI and editor extension read the same roots, so Kilo stays one target.

Files: corresponding `roots.mjs` helpers/adapter producers, metadata, focused roots/build/install tests. A native loader check is required only for that target's live claim.

Exit: chosen platform/edition loads the installed artifact; foreign/unmanaged state and other editors remain unchanged. Missing Windows/GUI device leaves that native result pending and does not borrow POSIX evidence. Do not bundle this phase into the deadline migration if it delays it.

## Phase 3: Selective New Capabilities

### RT3.1 Devin Local/CLI Artifact Target

State: DROPPED (decision 2026-10-08) after `RT0.2`: a native target would add one more copy of every skill and server Devin CLI already imports, and removing the copies would mean turning off imports the operator may rely on. The design below is kept for a reopening, whose triggers the [contract](contracts/runtime-refresh.md#cascade-compatibility-and-devin) names. Depends on: `RT0.2`, `RT1.1`, `RT2.0`. Covers: `G-RT-02`, `Q-RT-02`, `Q-RT-04`.

Add one `devin` adapter for the qualified native subset: complete rules, directory skills, manual command skills and dedicated MCP files. Reuse existing format-aware merge and source readers. Keep Local/CLI proof separate; custom subagents wait for model/tool-policy resolution. A fresh nonconflicting install is the first supported journey, not a whole-profile migration.

Files: targets/capabilities/schemas, roots/render/producer, one adapter README, focused build/install/matrix cases. No duplicate `devin-local`/`devin-cli` artifact writers.

Exit: generated command/skill/MCP output consumed by the actual CLI, useful harmless MCP call, manual command loading, source/companion provenance and repeat install verified. Local GUI remains a separately labelled result until run.

### RT3.2 Grok Build Native Agents

State: IMPLEMENTED AND QUALIFIED on grok 1.0.46 (2765805b9442, macOS arm64, 2026-10-08): the parent delegates to the generated agents by `subagent_type`, a child runs on the parent's model, the read-only `researcher` child has no write tool, and `mcpInheritance: none` leaves the `worker` child without MCP tools (records in the adapter README). grok 1.0.44 verifies clean-root and co-installed discovery (native wins over `.claude/agents` in the same directory), but its spawn tool has no type parameter, so delegation to these agents needs 1.0.46. The generated agents and project config set no model, permission mode, `[agent]`, `[subagents]` or `[model.*]` entry. Open: the default `promptMode` (`extend` appends each role to Grok's base prompt), the bundled `reviewer` role's `default_fork_context`, Windows and `GROK_HOME` user routing, and newer builds. Depends on: `RT1.2`. Covers: `G-RT-07`, `Q-RT-02`, `G-RT-06`.

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

State: DONE for this batch (2026-10-08); GUI, Windows and untested-edition results stay unrecorded, which the contract reads as unclaimed. A full build at `3dbdbfe` and at `b3abacd` differs only in the intended outputs (`pool`, `trae` and its two successors, `grok-build`) and in the `workflow-runtime` skill, whose source changed; every other generated byte matches. A full build at `cb5b5f0` matches `b3abacd` byte for byte except that `build --target all` no longer writes the deprecated `windsurf`. The adapter READMEs record the surfaces with a native run in this batch (runtime and qualification records in the registry were dropped on 2026-09-30 because no command reads them): Grok Build agents (discovery on 1.0.44 and 1.0.46; delegated task, inherited model and tool policy pass on 1.0.46, which 1.0.44 cannot reach), Trae CLI MCP, project skills and rules (discovery pass; the skills and rules through an offline prompt render), and Poolside personal rules (discovery fail on 1.0.2, which predates the client's switch to the global `AGENTS.md`, and pass on 1.0.16; see `RT2.1`). They name the current builds: grok 1.0.46, traecli 0.207.1-tob and pool 1.0.16. Surfaces never run natively stay unrecorded, which the contract reads as unclaimed. Depends on: completed applicable tasks among `RT2.0`, `RT2.1`, `RT2.2`, `RT2.3`, `RT2.4`, `RT3.1`, `RT3.2`; do not wait for all. Covers: `G-RT-06`, `Q-RT-01` through `Q-RT-06`.

For each changed surface, record the exact client build, platform, scope, scenario, outcome and limitations in the target's adapter README. Run repo checks plus targeted/full suites proportionate to changed shared behavior. Compare generated bytes for unaffected targets. Native task and policy results remain separate from tests. An opt-in live test requested but blocked must return a non-success outcome, not silently skip to green.

Exit: each claimed surface has its own proof; deferred GUI/platform results remain explicitly not-run/blocked. No provider credentials/raw prompts in public artifacts. No blanket 26-target readiness statement.

### RT4.2 Scoped Distribution

State: DISTRIBUTED 2026-10-08 from `c39014d` at the operator's request (`--target all`, every category: a general sync, then `--category development,cybersecurity,modding,private`). Canary: a remote Linux x86_64 dev box whose home directory is a symbolic link, which refused every user-scope plan until `c39014d`; with the operator's user-local Node 22 on `PATH`, Claude Code 2.1.83 connected Synapse and Grimoire and listed the skills and agents, and pre-existing configs changed only in agent-surface's MCP entries and the documented Kilo and Grok keys. `chrome-devtools` (needs a system Chrome) and `openosint` (needs a `uv` tool install) stayed unwired there, and the Fenjing and IDA binaries are not installed there. Fleet: the operator's macOS home. Configs outside agent-surface's entries are unchanged, the international Trae IDE's unread `~/.trae/mcp.json` lost its agent-surface servers as the Trae split documents, Codex parses its config and keeps the operator's own servers, Claude Code connects every wired server except `ida-pro-mcp` (`idalib-mcp` is not installed), and grok 1.0.46 lists the six user agents, the skills and the servers. `trae-cn`'s development and cybersecurity plans were first refused because 12 of the 20 links in `~/.trae-cn/skills` sat on paths it writes. The links come from Vercel's `skills` CLI run in symlink mode with every agent selected (its `~/.agents/.skill-lock.json` lists `trae` and `trae-cn` among about 50 agents, and each link's birth time matches a lock `installedAt` from April and May 2026); the same 20 links sit in about 14 other agents' skill roots. agent-surface creates no links, Trae CN is not installed on this machine, and Trae Intl's code names no shared or CN skill root, so no Trae sync is involved. With the operator's approval the 12 colliding links were removed and the two categories installed; the other 8 links remain.

Preview the established target/category/service set and current destination ownership. Show deprecated exclusions and ownership/migration conflicts; do not turn the new catalog into an unsolicited all-target or all-service expansion. Keep exact selected two-MCP profiles unless separately changed. Deploy one canary target/root, check real discovery and unchanged unrelated config, then only the requested fleet.

Exit: actual installed content/companions and chosen native behavior verified; old owned routes handled per transition contract, unowned content preserved, no runtime downgrade. Repo sync, asset deployment and client upgrade are separate claims.

## Phase 5: Follow-Up, Not Batch Blockers

### RT5.1 Loader-First Admission Queue

State: DEFERRED. Depends on: `RT1.1`. Covers: `G-RT-07`. Amp/Auggie first because they are already planned; then Vibe/Junie for demonstrated used workflows. Probe existing shared portable output before building a new adapter. Keep Warp local/cloud, ACP host bindings, and persistent-agent systems distinct. No popularity-driven default target, provider or MCP additions.

Exit for any admission: current exact component, package/license/security review, real discovery and harmless task; native-only delta justified. No agent-surface control plane, new database or generic target DSL.

### RT5.2 Task-Shaped Distribution Comparison

State: ACTIVE EXPERIMENT, 2026-10-16, through [Phase GR](#phase-gr-grimoire-and-asset-effectiveness). The Grimoire retrieval baseline is measured; native task/category ROI is still unrun. Depends on: `RT4.1`. Compare direct files, native plugins and on-demand retrieval only on matched tasks and actual outcomes, including child costs when exposed. Keep failures and contaminated runs visible. Do not infer quality/cost from body size or tool-list bytes. No code change or efficiency claim is required just to close this design.

### RT5.3 Gaps Found During RT2.4

State: DEFERRED; none blocks a completed task. Each needs its own reproducer before a change. An item marked Fixed is done and stays listed with its date.

- Fixed 2026-10-12: Kilo personal rules. User-scope `instructions` entries were `./rules/<name>.md`, which Kilo CLI 7.8.8 resolves against the project directory, so `~/.config/kilo/rules` never loaded (a real run with a project decoy and a control, recorded in `adapters/kilo/README.md`). Entries are now `~/.config/kilo/rules/<name>.md`; an install that selects rules drops the old ones. Still open: the declared user MCP route is also computed from a context object and reads `kilo.jsonc`; plans and writes use `~/.config/kilo/kilo.jsonc`, so no install output changes.
- Fixed 2026-10-15: Cline global workflows and rules. The pre-SDK extension reads them under the OS Documents folder (PowerShell's `MyDocuments` on Windows, which follows a OneDrive backup, and `xdg-user-dir DOCUMENTS` on Linux), while the CLI and the SDK bundle read `~/Documents/Cline`. User installs write both when the OS folder is elsewhere in the home, rules go only to a folder the SDK also scans (`~/Cline/Rules` or a OneDrive Documents folder), and a file that moves with the folder keeps its category and retires its old copy.
- Fixed 2026-10-12: an unreadable destination (an MCP or Kilo config, or a managed or stale output) blocks the plan with a named line, such as `MCP config .cursor/mcp.json cannot be read (EACCES)`, instead of a bare `EACCES` error; nothing is written. A manifest directory that cannot be listed or searched, or a legacy nested manifest that cannot be checked, blocks with `MANIFEST_UNREADABLE`.
- Kept 2026-10-15: a CN-only profile keeps the development agents a pre-split `trae` install wrote to the co-owned `~/.trae-cn/agents`. Both editions' current documentation names that folder, so the `trae` claim may still serve the international IDE, and `trae-cn` does not release it; the agents stay valid.
- Fixed 2026-10-14: Test isolation. The cases that rewrite tracked sources (the registry cases in `check.test.mjs`, the subagent cases in `build.test.mjs`) run in a disposable worktree of HEAD carrying the checkout's uncommitted changes, so `tests/lib/helpers.mjs` no longer snapshots seven guarded source files and rewrites them when a run is interrupted, which had erased edits made meanwhile. The installer suites, whose live installs regenerate the shared launcher `~/.local/bin/agent-surface-mcp-env`, run under a disposable home with the operator's provisioned binaries and uv tool environments linked in, so they never rewrite the operator's launcher (2026-10-12: a run from a temporary checkout had left it pointing into that checkout; restoring a snapshot at exit instead undid concurrent installs).

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

## Phase AS-AR: Agent-Reuse Capability Trial

Status: SUPERVISED NATIVE PATH PROVEN AND HANDOFF ACCEPTED, 2026-10-13; no capability comparison or unattended qualification. Inputs: [concept amendment](context/concept-zero.md#agent-reuse-capability-amendment), [runtime evidence](context/concept-zero-research.md#agent-reuse-native-spike-2026-10-13), [architecture](architecture.md#agent-reuse-capability-trial), [contract](contracts/agent-reuse.md). MOMO's own Phase AR schedules its catalog and benchmark work; this phase supplies installation/native-boundary evidence, not a replacement roadmap.

Sequence: **AS-AR0.1 -> AS-AR0.2 -> AS-AR1.1 -> MOMO AR1/AR2**. Review the retained low/strong traces in parallel; AS-AR2.1 is an independent optional asset experiment, not a prerequisite for the delegate. All later changes preserve the existing profile, provider choices and unrelated working files. Commit, publication and fleet distribution keep their separately requested scopes.

AS-AR0.1/0.2 below describe completed acceptance, not queued reruns. One preparation owner maintains the development-host bundle; redundant-host cleanup stays with its original operator. MOMO's AR0.1 wording and AR-E19 evidence label are already corrected. No further concept research or design round blocks the accepted pilot.

### AS-AR0.1 Native Functional Spike

State: PASS for the bounded file-task route. OpenCode 1.18.15 -> pinned GH05TCREW `run_mcp`/`pa_mcp` -> Ollama Cloud `deepseek-v4.1-flash`, with native submission/retrieval, real terminal work and independently checked artifact. Owner: agent-surface implementing peer, with MOMO supplying the authorized lab/resource configuration. Covers: `G-AR-02`, `G-AR-03`, `C-AR-01`, `C-AR-02`, `Q-AR-01`. [Qualified setup and limits](runbooks/pentestagent.md).

Use GH05TCREW `87d763a9c830597e9b8c1d56293300f6961beec2` in a separate development environment. Review the resolved dependencies/advisories and install scripts at execution time, keep TLS verification enabled, record the actual Python/dependency/browser requirements and avoid optional extras not used by the trial. Resolve the approved endpoint/model from current configuration; qualify tool request -> execution -> tool-result replay, not merely text completion. Use one maintained native harness with that configured route, no premium-model substitution and no paid subagent fleet.

Create one fresh task directory and a private project-local native configuration for the selected MCP or CLI/playbook entry point. Perform one harmless scoped operation that writes an inspectable artifact, retrieve the result and verify the parent can access that file. For MCP, use the same server session and establish protocol/client compatibility; for CLI, exercise actual command execution and output retrieval. No global install, registry entry, extra MCP chaining or production target.

Deliverable: private run record and `docs/runbooks/pentestagent.md` with non-secret install/launch commands, pin, host/model identities, artifact locations and limits. Exit: real provider tool round trip plus native invocation and file/result proof. An import, provider or client error is a bounded failed route, not a reason to construct a framework. Browser/tool provisioning for a target-facing comparison remains a separate actual-environment check.

### AS-AR0.2 Lifecycle and Candidate Decision

State: PASS for the supervised environment-stop boundary; graceful cancellation FAIL, native-parent/MOMO interruption propagation NOT RUN. Real timeout and `cancel_task` probes left a child active; container stop halted its writes. Provider connection failure was retrieved under misleading `done`. Owner: agent-surface for upstream/native proof; MOMO for its own interruption path. Depends on: AS-AR0.1. Covers the supervised portion of `G-AR-03`, `Q-AR-02`.

Use disposable real processes to reproduce the source findings: `cancel_task` during outstanding work, command timeout with a child still active, native parent interruption/disconnect, and a genuine bounded provider/transport failure. Set an observation deadline before the run. Record acknowledgement separately from local quiescence, target-request cessation and any provider work already submitted. Verify that error/partial output cannot be reported as a successful task solely because upstream says `done`; failed submit responses must not provoke duplicate paid work.

For the supervised disposable comparison, a demonstrated environment-level stop is sufficient even if graceful cancellation remains defective. It does not qualify `cancel_task` or MOMO interruption propagation. If the effective stop fails, repair only the demonstrated cleanup boundary, with separate regression proof; broader rehabilitation triggers comparison with Decepticon then Strix instead. Retain any exact patch revision, and do not publish it without authorization. Unattended integration requires separate stopping proof.

Exit: one demonstrated operating/stop contract, with remaining provider-side uncertainty stated, sufficient for a bounded MOMO run. This task may reject GH05TCREW; no registration or capability claim is owed to the provisional selection.

### AS-AR1.1 Handoff and Conditional Registration

State: HANDOFF ACCEPTED by MOMO for a supervised comparison; native-only setup retained, no registry change. Agent-surface preparation is complete; actual MOMO Task integration and matched comparison remain unrun in this evidence. Owner: agent-surface preparation owner; MOMO owns consumption. Depends on: AS-AR0.1 and the supervised AS-AR0.2 stop boundary. Covers the preparation for `G-AR-01` and `G-AR-02`; capability gain remains unproven and `Q-AR-04` is not applicable without registry registration.

Hand off pin plus any patch, exact environment/launch, model/endpoint identity without credentials, the authorized task, artifacts, failure/cancellation observations and reported/unknown usage. Keep native project-local wiring if it is sufficient. Only if a reusable registry entry expresses the proven setup without new infrastructure, add explicit-only `pentestagent` in `registry/optional-services.json`, detection-only prerequisites and the existing credential path; leave category membership and defaults unchanged. No guessed runtime CWD, target or model in a global command. Do not replace `pentest-ai`.

For a registry change, exercise the actual installer into a disposable host profile and launch exactly its generated command from another CWD with a stripped PATH. Check child credentials without displaying values, unrelated config preservation and no default/category activation. Reuse affected suites and `npm run check` / `check:generated`; do not add prose assertions or a second MCP implementation. If no registry change is justified, native proof and the runbook close this task without artificial code.

The next work belongs to MOMO's existing AR1/AR2 owners:

1. Provision the selected target-facing prerequisites and prove one real MOMO Task invokes the pinned delegate, retains its returned files in Evidence and produces the enclosing answer. Record the actual parent runtime/version rather than inheriting the external spike's 1.18.15 qualification. Keep environment stop in the trial controller's cleanup path.
2. Run baseline versus A under the [matched-comparison contract](contracts/agent-reuse.md#matched-comparison). Give the parent its normal task-authorized native tools and matched resource controls in every arm; do not reuse the smoke-only permission profile or 12-step limit. Report actual delegation, scorer-confirmed solves, marginal coverage, time and available usage. Native-harness-alone and upstream-alone are optional diagnostic comparators, not prerequisites.
3. Add B and A+B independently, with native loading/use evidence for B and fresh state between arms. Repeat promising configurations before claiming reliable improvement. Wider distribution follows demonstrated value in coverage, validation, time or repeatability, not a green registration check or novelty alone.

### AS-AR2.1 Separate Methodology Experiment

State: PREPARED at the operator's 2026-10-13 request: experimental `web-api-followthrough`, adapted from pinned web-hunter, discovers with full body through OpenCode's native skill loader. Task behavior and comparative benefit NOT RUN. No category or global skill installation. Owner: MOMO experiment owner with agent-surface asset author. Trace review informs the chosen task and interpretation; it does not block this preparation. Covers: `G-AR-01`, `Q-AR-03` only after the matched experiment.

Use the original low-scoring and 50/59 Kilo traces, when available, to distinguish unvisited surfaces, attempted-unsolved work, repetition and early termination; missing traces remain unknown. The prepared asset targets observed web/API follow-through as a hypothesis, not a diagnosed cause of those scores. Retain notices/provenance, map tools to the selected runtime, take scope from the Task, and remove fixed model selection, redundant interactive consent and foreign findings-store coupling. Leave broader workflow redesign to MOMO's existing owners.

First deliver a separately selected trial asset, not a category-wide installation or extra default prompt. MOMO compares asset-on versus asset-off separately from agent reuse. Promote it into a distributed cybersecurity asset only after useful evidence and a deliberate distribution decision; otherwise keep or discard the pilot without growing the catalog.

## Phase GR: Grimoire and Asset Effectiveness

Priority accepted 2026-10-16: Grimoire first; category ROI and native-mechanism research in parallel; Synapse lower priority. Computer use is DEFERRED by the operator, who handles Antigravity/manual blockers. Existing AS-AR preparation is not repeated; the separate security-application A/B owner keeps that campaign.

Inputs: [concept](context/concept-zero.md#grimoire-effectiveness-amendment), [architecture](architecture.md#grimoire-effectiveness-experiment), [evaluation contract](contracts/grimoire-evaluation.md), [evidence view](diagrams/evidence.md). No new benchmark platform or unconditional production rewrite.

### GR0: Baseline and Failure Diagnosis

State: COMPLETE for the bounded retrieval experiment, not task acceptance. Owner: agent-surface experiment coordinator. Source `e44121f`, 1,137 real indexed skills, 30 existing reviewed queries, actual MCP calls and two qualified provider models. All 60 model cells completed; provider qualification failures and target-ID misses retained. Post-hoc lexical diagnosis is separate from the original scores. Covers `G-GR-01`, with the limitations in the contract.

### GR1: Relevance and One Retrieval Candidate

State: CANDIDATE SHIPPED on the 30 diagnostic cases; HELD-OUT RELEVANCE NOT RUN. Owner: agent-surface experiment/implementation peer. Depends on GR0. Any-word BM25 matching replaced the conjunctive query: hit@1 19/30 to 23/30, hit@5 0.800 to 0.967, MRR 0.711 to 0.836, with seven sentence-shaped queries recovered and the floors raised above the behavior they replaced. Caller-side keyword guidance was rejected as a separate arm because the tool already requested keywords. Twelve out-of-corpus controls showed the accepted cost: eleven now return a nearest match where all returned nothing, and no score threshold separates them. Remaining: freeze independently worded requests across all five packs with reviewed alternative answers and no-skill controls, keep the old 30 as diagnosis rather than held-out tuning, and confirm the shipped behavior against that set under the [promotion boundary](contracts/grimoire-evaluation.md#comparison-and-decision). Preserve all failed cells. Exit: a reviewed held-out relevance result, not mandatory embeddings or a catalog expansion.

### GR2: Native Task and Category ROI

State: PLANNED; no benchmark run. Owner: agent-surface evaluation peer, reusing the existing benchmark runner/owner. May qualify the environment while GR1 runs. First validate an official domain-matched task environment/oracle and one native tool round trip through the approved provider. Then freeze raw/general/general-plus-category arms with equal tools and total allowance. Separately compare direct-skill/current-Grimoire/candidate retrieval on task outcomes. Use official SkillsBench or the already supported official benchmark route; do not replace its verifier. Security, modding and private operations require their own appropriate populations. Exit: paired outcomes, available usage, contamination/use evidence and a reviewed ROI decision. Only a measured result activates category redesign through the same concept/architecture/contract/diagram workflow.

### GR3: Native Mechanisms and Memory Follow-Up

State: SOURCE SURVEY COMPLETE; native pilots and Synapse measurement NOT RUN. Owner: agent-surface research peer. Prototype one useful hook/mode feature in a project-local native configuration, measuring event/failure semantics and value before adding a shared source primitive. Preserve version distinctions and existing adapter evidence. Synapse follows with disposable real memory tests for update/abstention, scope and tagged recall; source hypotheses are not defects until reproduced. Neither track blocks GR1/GR2.
