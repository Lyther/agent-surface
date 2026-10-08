# Architecture

Status: VERIFIED_EXISTING COMPILER; PROPOSED RUNTIME-REFRESH DELTA
Source concept: [concept-zero.md](context/concept-zero.md)
Last updated: 2026-09-28
Source baseline: `3dbdbfe9c67fa7a95cf72a25280d2aa588782956`

## Executive Decision

Preserve the single-process Node compiler, canonical assets, plain target adapters, maintained format parsers, managed install manifests and separate first-party MCP products. The selected delta adds precise runtime identity/lifecycle evidence and selected-target notices, corrects known paths and rule-limit handling, separates distinct harnesses, and migrates Antigravity's retiring workflow format. Security release selection is a prerequisite to affected runtime execution, not a new automatic updater inside compilation. OpenHands remains implemented and selectable with a legacy recommendation. No new daemon, database, transport, provider manager, profile engine or universal permission system is introduced.

The [previous architecture](https://github.com/Lyther/agent-surface/blob/3dbdbfe9c67fa7a95cf72a25280d2aa588782956/docs/architecture.md) records the earlier refresh. This document distinguishes source-verified existing behavior from future contracts. Nothing in this design certifies all hosts, updates a client, or upgrades historical acceptance to current releases.

## Architecture Drivers

- `G-RT-01` Security-aware release selection: a verified patched current release wins over a vulnerable stable-channel build. Proof gate: exact advisory/product/version reconciliation before executing the client; see research ledger and roadmap `RT0.1`.
- `G-RT-02` Runtime identity: editor, harness, CLI, plugin exporter and cloud workspace are different boundaries. Proof gate: selected-root native discovery, plus controlled co-installation for changed loaders.
- `G-RT-03` Antigravity transition: a visible warning and a qualified successor are separate deliverables. Proof gate: native manual-rule invocation and skill companions before the retirement date, with owned legacy workflows retained rather than retired.
- `G-RT-04` OpenHands retention: implementation status and recommendation are different facts. Proof gate: explicit/all-target selection and existing output remain functional without retirement cleanup.
- `G-RT-05` Ownership and path correctness: no install may overwrite or adopt unowned content, silently drop another owner's category contribution, or delete a file another owner still claims; new locations follow the same rule. Proof gate: actual disposable-filesystem ownership cases, migration, conflict refusal and idempotency.
- `G-RT-06` Evidence precision: generated shape, upstream support and native results remain separate. Proof gate: schema plus source-reference checks and scenario-specific runtime evidence.
- `G-RT-07` Selective expansion: Grok roles and a private Bot pilot must solve distinct needs. Proof gate: effective role behavior or a verified cloud artifact, not a copied directory or model assertion.
- `C-RT-01` to `C-RT-03`: preserve stack, categories, ownership, service selection and operator policy; keep this change design-only and release discovery out of ordinary builds.

The concept's `Q-RT-01` through `Q-RT-07` are the quality scenarios. Gates below select only those affected by a change; unavailable GUI/cloud proof does not block an unrelated metadata or path correction.

## Evidence and Source Reconciliation

- `VERIFIED_EXISTING`: `registry/targets.json` has 26 implemented outputs, including one build-only export; the adapter table and capability registry provide the current source contract. The historical 25-target wording is not current inventory.
- `VERIFIED_EXISTING`: `support` and `generation` are already separate fields. Extend the existing capability record rather than creating parallel target catalogs.
- `VERIFIED_EXISTING`: general installation resets previously managed opt-in content; category installs preserve unselected ownership, with an aggregate-document conflict guard. An explicit service filter does not reconcile an exact MCP allowlist.
- `VERIFIED_EXISTING`: since `RT2.0`, ownership is read from every manifest in the install root plus the target's legacy entries and legacy nested manifests. An existing file nobody claims blocks as `UNOWNED_DESTINATION`, identical bytes included; a co-owned file is regenerated for the selection with a `SHARED_CONTRIBUTION_REPLACED` warning when another owner's recorded category is dropped; stale cleanup retains a file another owner still claims; every participant's pending manifest is written before the run's first mutation. Before `RT2.0`, an unowned file was overwritten or adopted and a shared file could be deleted while another manifest claimed it. Preserving unknown config siblings is a different, key-level contract.
- `VERIFIED_EXISTING`: `--dest` is an install-root override, not a universal native config-home adapter. `doctor` is a set of current probes, not a complete runtime inventory or security scanner.
- `USER_DECISION`: retain OpenHands, warn and replace Antigravity workflows, separate Cascade/Devin, and prioritize security-fixed releases including preview/public channels when necessary.
- `PROPOSED`: harness-separated producers; capability metadata and notices (`RT1.1`) and installer ownership protection (`RT2.0`) are implemented. Native unknowns remain bounded spikes, detailed in [research](context/concept-zero-research.md) and [contracts](contracts/runtime-refresh.md).

## System Context and Boundaries

Authors own canonical procedures, rules, commands, agents and pinned pack declarations. Operators select target, scope, content and services. The compiler reads those facts, renders native artifacts, and plans managed writes/config merges. Native hosts consume the installed artifacts. Synapse and Grimoire expose separate local MCP products with their own stores and lifecycles.

```text
canonical sources + pinned packs + registries
                    |
              compiler/adapter
                    |
       outputs + notices + install plan
                    |
       owned files / named config merges
                    |
          selected native harness
                    |
       optional MCP processes / task result

runtime/MOMO owner -> verified client upgrade and account setup
qualification     -> observes the selected harness, not compiler internals
```

The compiler owns generated assets and named manifest entries, not runtime accounts, provider credentials, sign-ins, native caches, learned memories, schedules or cloud computers. The existing MCP credential launcher reads an operator-selected env file into a child environment; secrets are not registry values or generated config fields. This existing delivery path is unchanged. Client installation/upgrade remains runtime/MOMO-owned, while currently supported MCP prerequisite provisioning remains installer-owned.

## Selected Architecture

### Runtime View

`node scripts/agent-surface.mjs <command>` is the existing short-lived process. `build` produces a preview or export package. `install` resolves selection, renders outputs, inspects the destination, plans writes/removals/config merges, establishes selected MCP prerequisites and applies the plan. Regular generation needs no release-feed or advisory network request.

Proposed metadata lookup supplies target labels, lifecycle notices and qualification bounds before output application. It does not launch a runtime or add a background check. Warnings are distinct from existing blocking errors. A dated retirement notice does not silently change the generated artifact at midnight; an explicit code/registry migration changes it in a reviewed release.

Native task qualification uses an independently selected, security-appropriate client. Release comparison and client updating are separate bounded operations. An affected client is not launched for discovery or even a version probe before the upgrade decision; package/installation metadata can establish identity without execution where available.

### Component View

- **Source readers:** parse canonical sources/companions and permitted external text. Own syntax and source provenance, not native paths.
- **Registry loaders:** sole loading/caching boundary for portfolio, capabilities, categories and optional services. Own JSON access, not runtime probing.
- **Target adapters:** map one named consumer contract to roots, rendering and config declarations. Own path/surface differences, not file writes or model policy.
- **Renderers/format libraries:** serialize native syntax and validate output-specific limits. No automatic rule summarization, regex-based structured-config rewriting or silent truncation.
- **Installer:** owns selection, notices in plans, destination ownership and migration checks, ownership-based cleanup and file/config application. It never adopts an unowned file into a manifest.
- **Checks:** validate schema/reference/token coherence and changed output behavior. They do not turn schema validity into native support or acceptance.
- **Qualification/deployment owner:** resolves client version and account/environment, executes the real task, and records the exact supported scenario. No production credential is put into capability evidence.

### Source Tree and File Responsibilities

All implementation work stays in these established boundaries unless a later reviewed spike proves a new module necessary. No new production runtime unit is proposed.

```text
agent-surface/
  docs/context/concept-zero.md          - Selected product concept and requirement IDs.
  docs/context/concept-zero-research.md - Dated decisions, sources, conflicts and qualification gaps.
  docs/architecture.md                  - System ownership and accepted/proposed boundaries.
  docs/roadmap.md                       - Ordered implementation tasks and real acceptance gates.
  docs/contracts/runtime-refresh.md    - Domain/interface semantics and migration decisions.
  docs/reference/targets.md             - Human-facing projection of registry facts; no second catalog.
  registry/targets.json                 - Selector and build availability and generated tokens; OpenHands remains implemented, Cascade deprecated.
  registry/target-capabilities.json     - Native support plus runtime, notice and qualification facts.
  registry/source-kinds.json            - Canonical source-kind and install-scope policy, unchanged.
  registry/*-assets.json                - Existing domain membership, unchanged by identity refresh.
  registry/{modding,private-secret}.json - Existing explicit content boundaries, unchanged.
  registry/optional-services.json       - Service definitions and provisioning, no new default MCPs.
  registry/legacy-owned.json            - Existing known legacy ownership, not guessed from paths.
  schemas/targets.schema.json           - Current selection schema; no status abuse for recommendation.
  schemas/target-capabilities.schema.json - Capability schema, including the runtime, notice and qualification extension.
  schemas/{source-kinds,asset-category,optional-services}.schema.json - Existing unchanged source/service contracts.
  scripts/agent-surface.mjs             - CLI dispatch and human output; no new transport or updater.
  scripts/agent-surface/
    registry.mjs                       - JSON loading/cache; add capability reader here, not duplicate raw reads.
    targets.mjs                        - Adapter identities/producers and selected service projection; no I/O mutation.
    roots.mjs                          - Pure scope/platform/native-root helpers; no implicit account migration.
    render.mjs                         - Native serializers, manual-only metadata and scoped rule syntax.
    install.mjs                        - Plans/notices/ownership/conflicts, writes and manifests; preserve selection semantics.
    notices.mjs                        - Stored and planner-derived notices and their wording; never blocks, never written into native files.
    check.mjs                          - Structural/semantic metadata and output contracts; no live client gate.
    doctor.mjs                         - Bounded diagnostics; no unsafe client auto-launch or upgrade.
    skills.mjs                         - Directory skills and allowed UTF-8 companions; unchanged source ownership.
    commands.mjs                       - Manual command parsing; migration retains source identity.
    rules.mjs                          - Canonical rule applicability; no target-specific prose fork.
    source-primitives.mjs              - Ignore/subagent parsing and validation, not runtime orchestration.
    postprocess.mjs                    - Existing external text normalization; no new content rewriting.
    format.mjs                         - Shared scalar/format helpers; not a policy summarizer.
    merge.mjs                          - Format-aware native config merges; unknown sibling preservation.
    jsonc.mjs                          - Existing JSONC operations backed by the selected parser.
    io.mjs                             - Filesystem/read helpers; no ownership decisions.
    fs-tree.mjs                        - Bounded source traversal; no runtime-home crawling.
    util.mjs                           - Existing validation/path/argument helpers, not a catch-all policy engine.
    proc.mjs                           - Existing process/git probes; do not call affected clients in this design.
    credentials.mjs                    - Existing credential planning/file protections; unchanged.
    provision.mjs                      - Existing MCP dependency detection; not a runtime-client catalog.
    provision-exec.mjs                 - Existing authorized MCP recipe execution; unchanged.
    mcp-env-launch.mjs                 - Existing child environment/runtime-path delivery; unchanged.
    mcp-build.mjs                      - Existing first-party MCP build prerequisites; unchanged.
    mcp-shims.mjs                      - Existing platform launch shims; unchanged.
    evidence.mjs                       - Existing bounded workflow evidence capture; no new digest mandate.
    workflow.mjs                       - Existing workflow ledger operations, outside refresh scope.
  adapters/<target>/README.md           - Native component, supported scopes, omissions and proof commands.
  tests/suites/
    check.test.mjs                     - New metadata validity and semantic-reference negatives.
    build.test.mjs                     - Actual native output, size and unrelated-output parity.
    roots.test.mjs                     - Real supported root/scope/platform mappings.
    install.test.mjs                   - Disposable ownership, migration and selection behavior.
    skill-packages.test.mjs            - Companions/update/removal contract reused by migrated skills.
    matrix.test.mjs                    - Selector/lifecycle invariants, not editorial counts for their own sake.
    live-*.test.mjs                    - Existing opt-in native boundaries; add only affected real scenarios.
  mcps/{synapse,grimoire}/              - Separate existing stores/protocols/installers; no changes in this batch.
```

The design schema was a pre-code artifact, not a new runtime schema registry. `RT1.1` moved its notice definition into the existing capability schema and removed the draft; the stored notices in `registry/target-capabilities.json` are the examples. Runtime and qualification records were dropped because no command reads them; native results live in each adapter README. Do not maintain two mutable copies.

## Data and State

### Applicability and Ownership

Domain/data: **REQUIRED**, because registry facts and install manifests persist identity/ownership. Interfaces: **REQUIRED**, because CLI selection, generated host formats and shared configuration cross boundaries. New database, network API, event transport and storage migration: **NOT_APPLICABLE**; this batch adds none.

- **Target** identity is its existing registry key. `status`, build/install availability and rendered tokens remain owned by `targets.json`. An implemented legacy client is still `implemented`.
- **Runtime metadata extension** belongs to that target's existing capability record. It names the actual component, upstream lifecycle and recommendation. No copy of `renders`, default service sets or native path functions is added.
- **Lifecycle notice** is a stable code, source and scoped applicability record. It is documentation-backed state, not proof of exploitation, a timer-driven migration or a client-version comparator.
- **Qualification** is a dated result tied to one surface, component/version, platform, scope and scenario. Not-run/blocked results are not empty successes; source-contract evidence does not inherit a task's authority.
- **Install plan** is transient: selected operations, rendered outputs, conflict diagnostics and removals. It is not desired fleet state and must not persist credentials or raw runtime inspect dumps.
- **Install manifest** remains target/scope ownership of files and named config entries. Manifests of other targets in the same install root are read as ownership claims, not rewritten. It is not a saved selection profile, rollback journal or authorization policy. Root policy values already written to host config are not automatically reversible lifecycle-owned snapshots.
- **No recovery-copy store.** A moved route's old owned file is retired with its replacement, and the category guard treats the two as one document. No backup directory, digest catalog or retention job is introduced.
- **Native runtime state** remains external. No sessions, account tokens, provider keys, learned skills or schedules are imported into registry or manifest metadata.

The [contract](contracts/runtime-refresh.md) and `schemas/target-capabilities.schema.json` define required/optional fields, source validation, notice projection and evidence limits. JSON registry updates are normal reviewed source changes; existing manifests do not require a version bump for metadata-only changes.

### Consistency and Migration

The normative steps are in the [contract's migration section](contracts/runtime-refresh.md#migration-consistency-and-recovery); this section records why they have this shape.

Preflight validates the effective category/scope-filtered outputs before applying them or provisioning dependencies. Producers run eagerly today; size measurement can be pure, but an unselected oversized rule must not throw during rendering. Build must validate its full user-scope output before deleting the old output directory; it has no filtered/project build interface.

Ownership is decided per path from every manifest in the install root, because several targets share roots such as `.agents/skills` and project `AGENTS.md`. Reading only the target's own manifest is what lets one target adopt an operator file, silently erase another target's category contribution, or delete a file another target still claims. A manifest records management ownership, not a separate per-target policy inside one physical file, so another owner's claim is not a veto: a co-owned file is regenerated for the requested selection, and the plan warns when that drops another owner's recorded category. An earlier draft made that contribution check blocking; review showed it deadlocked co-owners whose shared renders differed only in the host title, which is why the shared project `AGENTS.md` now uses one target-neutral header. Same-run equal-byte acceptance remains, a shared path keeps every claim, and cleanup retains it while any other claim remains. Config merges continue preserving unknown keys through the existing parser-backed path.

Only explicitly owned old routes can be considered for removal, and only when their bytes match the replacement; a differing old route blocks while its native discovery is unproven. Antigravity's initial successor release retains workflows owned by either current manifests or `legacy-owned.json`, including the former manifest itself; archival is separate after proof, not ordinary stale cleanup. Partial-category cleanup retains existing boundaries; an old output-kind selector must not delete a workflow without selecting its replacement. Changed target identity is not implemented as a silent alias. No generic migration registry, journal or backup store is introduced.

Manual command skills in a workspace `.agents/skills` can be autonomous to Antigravity. The planner therefore derives a shared-root notice from the selected outputs and the resolved install root, and `RT2.3` lists co-discovered protected command skills when Antigravity itself installs into the workspace, which `--scope project --dest` already allows. That check warns rather than blocks until `RT0.3` shows whether Antigravity invokes such a skill autonomously; a block would permanently refuse project-scope `all` development installs. No target is silently excluded and no shared file is rewritten to force compatibility.

The current installer is not a filesystem transaction. Preflight prevents known conflicts, but a later I/O failure can leave partial writes. Report that fact and use existing plan/log plus explicit recovery; do not claim automatic rollback or add a journal for this batch. Every participant's pending manifest is written before the run's first mutation and keeps every path the run planned to touch claimed, so an interrupted run can be repeated without deleting its own files by hand. Source rollback must not downgrade a runtime below its verified security floor.

## Interfaces and Contracts

Existing CLI grammar remains. `build`, `install`, `check`, `check generated`, `doctor`, `--target`, `--scope`, `--dest`, `--category` and `--service` retain their current meanings. No new profile flag, runtime updater, HTTP endpoint, JSON output mode or provider option is introduced by this design.

Proposed changes:

- Selected-target notices are shown by build/install previews and before live writes, with component, stable code, affected surface, date where supplied, source and next action. Informational/legacy warnings alone do not change exit status.
- Invalid output size, an unowned destination, an unreadable manifest (`MANIFEST_UNREADABLE`), or an unsupported requested migration uses the existing blocking-plan/error path and exits nonzero before mutation. A condition that only dismantling another retained target's state, or no selection at all, can clear excludes the affected target from `all` visibly and blocks only an explicit selection of it. Replacing another owner's category contribution in a shared file is a nonblocking plan warning. Avoid introducing a second error or consent framework. The contract lists the stable labels.
- Recommendation/lifecycle metadata never changes selection. `openhands` remains included in `all`. The separate explicit selector change excludes `targets.json` entries with `status: deprecated` from build/install `all`, while preserving explicit selection and reporting exclusions. Only Cascade is assigned that state in this batch, under the contract's cutover invariant; Devin CLI lists the other targets' output through its imports, so no `devin` target replaces it in `all`. Build availability is read from the registry's `build_supported` field. Build-only handling remains unchanged. Planned targets without adapters stay unavailable. No distribution is triggered by this design.
- A target's native files are the external DTOs. Metadata/notices and source records are not copied wholesale into those files. Source command identity remains intact when its native representation becomes a manual skill or manual rule. Antigravity changes from a workflow to a rule; the artifact and invocation are not mislabeled as a skill.
- `support`, `generation` and qualifications are not collapsed into a boolean. Historical or missing native proof is displayed precisely; output counts are not readiness scores.

The existing overloaded category grammar remains: standalone `all` means general reset; domain/output-kind categories cannot be mixed; explicit services override domain-derived selection without promising removal of every unselected service. Clarity changes may expose these facts, not redefine them.

Generated output should remain deterministic for a fixed source/context. Advisory refresh is an explicit maintainer action; clocks, network feeds or locally installed client versions must not silently switch producers during `build`.

## Security, Privacy, and Operations

Relevant assets are native config, unowned operator files, explicit-only commands, tool restrictions and account data. Migration collision checks protect real new-destination hazards. Parser-backed config merging, managed cleanup and current secret delivery remain. The user's full-execution policy is not changed; a host's similarly named frontmatter field is not assumed to enforce it.

Runtime release procedure: identify exact client/package and advisory; select the newest applicable fixed build from the supported public line; preserve preview/channel labeling; have the lifecycle owner update it; then record the installed build and run bounded qualification. Confirmed exploitation raises priority and forbids using affected clients for experiments. Unverified reports remain visible and urgent without fabricated CVE IDs. Recheck release metadata immediately before actual deployment because the design's dated snapshot will age.

Antigravity warning ships independently of migration completion. November 1 is a support deadline, not a delayed start date. OpenHands' lower recommendation neither removes files nor substitutes Canvas/SDK. Grok Bot is separately scoped: shared account access is not isolated by creating another Bot, local-computer execution is a separate setting, and a routine Test run performs real work.

## Quality Scenarios and Fitness Gates

- `Q-RT-01`: advisory/product/fixed-range evidence and non-executing installed-version identification where possible; actual update/qualification owned by the runtime deployment task.
- `Q-RT-02`: actual selected harness discovery from a fresh root, then controlled fallback/co-installation; exact file provenance and harmless task behavior where claimed.
- `Q-RT-03`: dated warning before writes, native successor manual-only behavior, companion access, old/new selected-route migration and no deletion under an incompatible category selector.
- `Q-RT-04`: disposable real filesystems with owned source, unowned destination (differing and identical), co-owned regeneration with its warning, individual and joint resets of co-owners, cross-owner cleanup, repeat install, unmanaged sibling, and rerun after an interrupted apply.
- `Q-RT-05`: OpenHands explicit/all selection, native output unchanged apart from `RT2.0`'s target-neutral project `AGENTS.md` header, and retained ownership; recommendation-only delta is not a cleanup path.
- `Q-RT-06`: exact output-size checks for each supported native format; project splitting does not satisfy the global contract; no silent drop or generated prose summary.
- `Q-RT-07`: private Bot import, actual companion read and verifiable artifact; cancellation and routine state separately observed. GUI/account limitations block only that pilot.

Use `npm run check`, affected suites, generated comparison and real native acceptance proportionately. Full root/package suites are required only for the changed behavior's blast radius. Do not freeze prose wording, introduce substitute-backed acceptance, or demand GUI proof for a source-only metadata correction.

## Architecture Decisions

### ADR-RT1: Security fixes outrank channel conservatism

Status: ACCEPTED USER DIRECTION. A named stable channel is preferred only while compatible with the verified security requirement. Consequence: a fixed public/preview build may be the correct baseline. Reject both blind latest-is-safe and blind stable-is-safe. Revisit on new advisory/fixed-release evidence.

### ADR-RT2: Separate consumers, reuse implementation

Status: ACCEPTED, revised 2026-10-08 after `RT0.2`. Keep `windsurf` as deprecated Cascade compatibility. Exclude deprecated selectors from `all` visibly, retain explicit use, and never retire their files as a side effect. Add no `devin` target: Devin CLI already lists the rules, skills and MCP servers of the targets `all` keeps through its default imports, and a native target would only add another copy of each. OpenHands is legacy-recommended but not deprecated. Shared helpers or paths do not establish behavioral equivalence; no alias migrates accounts, services or manifests. Exact dispositions are in the contract.

### ADR-RT3: Retain legacy, retire surfaces deliberately

Status: ACCEPTED USER DIRECTION. Keep OpenHands selectable with lower recommendation; Antigravity retires workflows, not its product. Consequence: metadata/warning work can land before native replacement proof. Reject removal by release age or recommendation rank.

### ADR-RT4: Extend existing facts, not the control plane

Status: PROPOSED. Small capability metadata and transient notices; no updater, vulnerability database, profile reconciler or runtime security framework. Consequence: deployment and native testing stay separately owned; manual review remains necessary.

### ADR-RT5: Protect destinations before writes and cleanup

Status: PROPOSED. Every whole-file output reads ownership from all manifests in its install root: unowned files block instead of being overwritten or adopted, replacing another owner's category contribution is regenerated with a warning rather than vetoed, and cleanup retains files another owner still claims. A moved route's old owned file is retired with its replacement. No general content merge, backup store or claimed atomic rollback. This is required by reproduced installer behavior, not hypothetical local-host hardening.

## Risks, Revisit Triggers, and Guardrails

- Native runtime docs can lead installed releases: resolve the actual security-appropriate build and qualify it before deployment. A source-only fix does not wait for every unrelated client.
- Some global policy limits may be unrepresentable without changing meaning: block/qualify the affected output; require an explicit reviewed alternative, not automatic compression.
- Config-home/edition aliases may be undocumented: qualify selected roots, never scan or copy into every guessed path.
- Simultaneous shared-root installations can mask omissions or collide: keep identical shared bytes and test provenance for changed discovery paths.
- Learned cloud state and credentials must remain runtime-owned. No automatic import of private local files, public templates, new connectors or scheduled publication.
- Source readers remain target-independent, renderers remain write-free, installer owns mutations, and runtime/MOMO owns client upgrades. No implementation begins by deleting unrelated dirty work or rewriting existing first-party MCP services.
