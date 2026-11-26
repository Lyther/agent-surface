# Architecture

Status: VERIFIED_EXISTING COMPILER; PROPOSED RUNTIME-REFRESH DELTA
Source concept: [concept-zero.md](context/concept-zero.md)
Last updated: 2026-09-28
Source baseline: `3dbdbfe9c67fa7a95cf72a25280d2aa588782956`

Separate workstream, 2026-10-13: [agent-reuse capability trial](#agent-reuse-capability-trial), accepted for a bounded experiment with one supervised MCP route observed. Its source review uses agent-surface `886f237` and MOMO `779f35a`; runtime-refresh history below does not qualify the delegate or its comparative capability.

Separate workstream, 2026-11-20: [skill quality and distribution](#skill-quality-and-distribution), PROPOSED. An evaluation lab outside the product runtime gates description, skill and delivery changes; the lab (`evals/`) is built through SQ0.6 and no cohort has run, and it does not change the compiler or installer architecture below.

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

- `VERIFIED_EXISTING`: `registry/targets.json` has 27 implemented outputs, including one build-only export; the adapter table and capability registry provide the current source contract. The historical 25-target wording is not current inventory.
- `VERIFIED_EXISTING`: `support` and `generation` are already separate fields. Extend the existing capability record rather than creating parallel target catalogs.
- `VERIFIED_EXISTING`: general installation resets previously managed opt-in content; category installs preserve unselected ownership, with an aggregate-document conflict guard. An explicit service filter does not reconcile an exact MCP allowlist.
- `VERIFIED_EXISTING`: since `RT2.0`, ownership is read from every manifest in the install root plus the target's legacy entries and legacy nested manifests. An existing file nobody claims blocks as `UNOWNED_DESTINATION`, identical bytes included; a co-owned file is regenerated for the selection; stale cleanup retains a file another owner still claims; every participant's pending manifest is written before the run's first mutation. Before `RT2.0`, an unowned file was overwritten or adopted and a shared file could be deleted while another manifest claimed it. Preserving unknown config siblings is a different, key-level contract.
- `VERIFIED_EXISTING`: `--dest` is an install-root override, not a universal native config-home adapter. `doctor` is a set of current probes, not a complete runtime inventory or security scanner.
- `USER_DECISION`: retain OpenHands, warn and replace Antigravity workflows, retire Cascade without a Devin target, and prioritize security-fixed releases including preview/public channels when necessary.
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
  registry/targets.json                 - Selector and build availability and generated tokens; OpenHands remains implemented.
  registry/target-capabilities.json     - Native support plus runtime, notice and qualification facts.
  registry/source-kinds.json            - Canonical source-kind and install-scope policy, unchanged.
  registry/*-assets.json                - Existing domain membership, unchanged by identity refresh.
  registry/private-secret.json - Existing explicit content boundary, unchanged.
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
    render.mjs                         - Native serializers, manual-only metadata and rule frontmatter.
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

### Agent-Reuse Applicability

The trial's domain/data track is **REQUIRED, satisfied by existing ownership**, not a new schema. Agent-surface owns the preparation bundle and only a later service declaration if selected; the native host owns its process connection; upstream owns process-local task handles and working-directory artifacts; MOMO owns its existing enclosing Task, Evidence and result selection. A task handle is not a MOMO Task ID and does not survive an upstream restart. No delegated-task database, journal, migration, per-file digest ledger or reconstructed inner Step history is added. The [agent-reuse contract](contracts/agent-reuse.md#data-and-state) defines retention and mapping.

### Applicability and Ownership

Domain/data: **REQUIRED**, because registry facts and install manifests persist identity/ownership. Interfaces: **REQUIRED**, because CLI selection, generated host formats and shared configuration cross boundaries. New database, network API, event transport and storage migration: **NOT_APPLICABLE**; this batch adds none.

- **Target** identity is its existing registry key. `status`, build/install availability and rendered tokens remain owned by `targets.json`. An implemented legacy client is still `implemented`.
- **Runtime metadata extension** belongs to that target's existing capability record. It names the actual component, upstream lifecycle and recommendation. No copy of `renders`, default service sets or native path functions is added.
- **Lifecycle notice** is a stable code, source and scoped applicability record. It is documentation-backed state, not proof of exploitation, a timer-driven migration or a client-version comparator.
- **Qualification** is a dated result tied to one surface, component/version, platform, scope and scenario. Not-run/blocked results are not empty successes; source-contract evidence does not inherit a task's authority.
- **Install plan** is transient: selected operations, rendered outputs, conflict diagnostics and removals. It is not desired fleet state and must not persist credentials or raw runtime inspect dumps.
- **Install manifest** remains target/scope ownership of files and named config entries. Manifests of other targets in the same install root are read as ownership claims, not rewritten. It is not a saved selection profile, rollback journal or authorization policy. Root policy values already written to host config are not automatically reversible lifecycle-owned snapshots.
- **No recovery-copy store.** A moved route's old owned file is retired with its replacement. No backup directory, digest catalog or retention job is introduced.
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

### Agent-Reuse Boundary

The trial's interface track is **REQUIRED**: the accepted route uses the upstream's pinned native MCP schemas and one existing host client; a later CLI/playbook route would use existing native command execution. Do not define a parallel JSON API or advertise conformance from source inspection. The [agent-reuse contract](contracts/agent-reuse.md#native-interface) records submission, polling, result, error and cancellation behavior; its [matched-comparison section](contracts/agent-reuse.md#matched-comparison) defines the handoff into MOMO's existing Task/Evidence/scorer owners. Initial configuration remains private and project-local; no registry or schema change is part of this design. The existing `pentest-ai` service remains a different application.

### Runtime-Refresh Boundary

Existing CLI grammar remains. `build`, `install`, `check`, `check generated`, `doctor`, `--target`, `--scope`, `--dest`, `--category` and `--service` retain their current meanings. The one new selector is `--category everything` (ADR-RT6). No runtime updater, HTTP endpoint, JSON output mode or provider option is introduced by this design.

Proposed changes:

- Selected-target notices are shown by build/install previews and before live writes, with component, stable code, affected surface, date where supplied, source and next action. Informational/legacy warnings alone do not change exit status.
- Invalid output size, an unowned destination, an unreadable manifest (`MANIFEST_UNREADABLE`), or an unsupported requested migration uses the existing blocking-plan/error path and exits nonzero before mutation. A condition that only dismantling another retained target's state, or no selection at all, can clear excludes the affected target from `all` visibly and blocks only an explicit selection of it. Replacing another owner's category contribution in a shared file is a nonblocking plan warning. Avoid introducing a second error or consent framework. The contract lists the stable labels.
- Recommendation/lifecycle metadata never changes selection. `openhands` remains included in `all`. A retired target is not selectable; a full user-scope install removes the files and MCP entries its manifest owns. Devin CLI lists the other targets' output through its imports, so no `devin` target replaces Cascade. Build-only handling remains unchanged. Planned targets without adapters stay unavailable. No distribution is triggered by this design.
- A target's native files are the external DTOs. Metadata/notices and source records are not copied wholesale into those files. Source command identity remains intact when its native representation becomes a manual skill or manual rule. Antigravity changes from a workflow to a rule; the artifact and invocation are not mislabeled as a skill.
- `support`, `generation` and qualifications are not collapsed into a boolean. Historical or missing native proof is displayed precisely; output counts are not readiness scores.

The category grammar is: omitting `--category` is the general reset; standalone `everything` is the full profile (one full sync whose live set adds `external` and every asset category); `--category all` is retired; domain/output-kind categories cannot be mixed; explicit services override domain-derived selection without promising removal of every unselected service. Clarity changes may expose these facts, not redefine them.

Generated output should remain deterministic for a fixed source/context. Advisory refresh is an explicit maintainer action; clocks, network feeds or locally installed client versions must not silently switch producers during `build`.

## Security, Privacy, and Operations

Relevant assets are native config, unowned operator files, explicit-only commands, tool restrictions and account data. Migration collision checks protect real new-destination hazards. Parser-backed config merging, managed cleanup and current secret delivery remain. The user's full-execution policy is not changed; a host's similarly named frontmatter field is not assumed to enforce it.

Runtime release procedure: identify exact client/package and advisory; select the newest applicable fixed build from the supported public line; preserve preview/channel labeling; have the lifecycle owner update it; then record the installed build and run bounded qualification. Confirmed exploitation raises priority and forbids using affected clients for experiments. Unverified reports remain visible and urgent without fabricated CVE IDs. Recheck release metadata immediately before actual deployment because the design's dated snapshot will age.

Antigravity warning ships independently of migration completion. October 19 is a support deadline, not a delayed start date. OpenHands' lower recommendation neither removes files nor substitutes Canvas/SDK. Grok Bot is separately scoped: shared account access is not isolated by creating another Bot, local-computer execution is a separate setting, and a routine Test run performs real work.

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

Status: ACCEPTED, revised 2026-11-26. Retire `windsurf`: Devin Desktop removed the Cascade harness and no Cascade client is in use, so the selector is gone and a full user-scope install removes the files and MCP entries its manifest owns, as for the earlier retired targets. Add no `devin` target: Devin CLI already lists the rules, skills and MCP servers of the targets `all` keeps through its default imports, and a native target would only add another copy of each. OpenHands is legacy-recommended and stays selectable. Shared helpers or paths do not establish behavioral equivalence; no alias migrates accounts, services or manifests. Exact dispositions are in the contract.

### ADR-RT3: Retain legacy, retire surfaces deliberately

Status: ACCEPTED USER DIRECTION. Keep OpenHands selectable with lower recommendation; Antigravity retires workflows, not its product. Consequence: metadata/warning work can land before native replacement proof. Reject removal by release age or recommendation rank.

### ADR-RT4: Extend existing facts, not the control plane

Status: PROPOSED. Small capability metadata and transient notices; no updater, vulnerability database, profile reconciler or runtime security framework. Consequence: deployment and native testing stay separately owned; manual review remains necessary.

### ADR-RT5: Protect destinations before writes and cleanup

Status: PROPOSED. Every whole-file output reads ownership from all manifests in its install root: unowned files block instead of being overwritten or adopted, replacing another owner's category contribution is regenerated with a warning rather than vetoed, and cleanup retains files another owner still claims. A moved route's old owned file is retired with its replacement. No general content merge, backup store or claimed atomic rollback. This is required by reproduced installer behavior, not hypothetical local-host hardening.

### ADR-RT6: One command for the full profile

Status: ACCEPTED, 2026-11-19. `--category everything` plans one full, non-partial sync whose live outputs are the general baseline, `external` and the four asset categories, with the first-party and categorized MCPs and no optional service; it stands alone and rejects `--service`. `--category all` is retired. Basis: on 2026-11-18 an operator ran two of the three ordered installs, and the general sync's prune stripped the external packs from all 26 targets; for a one-line edit the pair deleted 21,613 files and rewrote 21,273. A single command cannot skip a step. It reaches the sequence's state exactly from a clean profile. On an existing profile it is one pass with no intermediate removal, so each host keeps what its merge preserves: the merges edit only the fields the renderer writes, so Codex's TOML keeps compatible operator fields such as `enabled = false` and `startup_timeout_sec` on a managed entry (the sequence's general step removes the entry and loses them), clearing only the transport keys a stdio entry cannot carry (`type`, `url`, `headers`, `http_headers` and kin), while the Kilo and OpenCode `enabled` and Goose's `enabled` and `timeout` are reset to the rendered values. Unmanaged sibling entries survive everywhere. Rejected: reading `all` as the full profile, which would silently change what existing scripts do.

## Risks, Revisit Triggers, and Guardrails

- Native runtime docs can lead installed releases: resolve the actual security-appropriate build and qualify it before deployment. A source-only fix does not wait for every unrelated client.
- Some global policy limits may be unrepresentable without changing meaning: block/qualify the affected output; require an explicit reviewed alternative, not automatic compression.
- Config-home/edition aliases may be undocumented: qualify selected roots, never scan or copy into every guessed path.
- Simultaneous shared-root installations can mask omissions or collide: keep identical shared bytes and test provenance for changed discovery paths.
- Learned cloud state and credentials must remain runtime-owned. No automatic import of private local files, public templates, new connectors or scheduled publication.
- Source readers remain target-independent, renderers remain write-free, installer owns mutations, and runtime/MOMO owns client upgrades. No implementation begins by deleting unrelated dirty work or rewriting existing first-party MCP services.

## Agent-Reuse Capability Trial

Status: ACCEPTED FOR BOUNDED SPIKE; one supervised MCP route observed on 2026-10-13, derived from [the concept amendment](context/concept-zero.md#agent-reuse-capability-amendment). `G-AR-01` makes measured capability the goal; `G-AR-02` preserves existing owners; `G-AR-03` requires truthful lifecycle and provider evidence. The [research ledger](context/concept-zero-research.md#agent-reuse-native-spike-2026-10-13) records the narrow proof and remaining limits. MOMO's current `docs/api/agent-reuse.md` takes precedence over older proposals to add a whole-agent runtime driver: the selected integration is an existing ApplicationCapability plus native tools.

### Runtime and Ownership

```text
MOMO enclosing Task -> existing native harness -> project-local stdio MCP child
                                                   |
                                      GH05TCREW task loop and tools
                                                   |
                                 approved provider + authorized lab

delegate text + accessible files -> parent answer -> existing MOMO Evidence/result
```

Agent-surface owns a pinned out-of-tree installation and launch qualification for this trial; MOMO owns subsequent application lifecycle/catalog integration. The selected host starts the child with a dedicated CWD and trial-scoped provider environment on an authorized development host. Place the whole application in an existing disposable execution boundary, not merely a virtualenv. Start with one process and one active task, `--no-rag --no-mcp`, no crew/TUI/HTTP listener and no extra external tool servers. This excludes optional features, not all upstream shell authority.

The diagram is the initially tested MCP route, not a mandatory strategy boundary. A useful standalone CLI/playbook may instead run through existing native command tools. Preserve the selected loop/prompt across comparisons. For the supervised disposable trial, a demonstrated environment stop is sufficient; graceful cancellation and native-parent/MOMO interruption propagation remain separate claims.

The parent submits once, polls briefly and retrieves the result and actual files before shutdown. Shared CWD-based notes and process-local task handles make a fresh root/process per independent trial the simplest isolation; a second scheduler or tenant abstraction is unnecessary. Upstream owns its investigation loop. A parent interruption must demonstrably stop outstanding local work through the existing lifecycle boundary; if not, a narrow upstream/existing-owner repair or candidate change precedes unattended adoption. Do not infer termination from a status string, process exit or cancelled provider coroutine.

### Planned Files and Owners

```text
docs/context/concept-zero*.md      - Concept and source evidence; no runtime readiness claim.
docs/contracts/agent-reuse.md      - Native-interface use and ownership; links upstream schemas.
docs/roadmap.md                    - AS-AR proof sequence and MOMO handoff.
docs/runbooks/pentestagent.md      - Qualified supervised setup, limits and removal; no benchmark claim.
registry/optional-services.json   - CONDITIONAL: explicit pentestagent service after qualification.
tests/suites/live-launch.test.mjs - CONDITIONAL: extend the existing real launch boundary if registered.
```

No new production module is selected. Existing `targets.mjs`, `credentials.mjs`, `mcp-env-launch.mjs` and detection-only prerequisites remain the delivery mechanisms where applicable; they do not own per-task scope, CWD, billing or cancellation. If their literal command/args and current secret delivery cannot express the qualified per-project setup, keep the native project-local configuration instead of extending the registry for one trial.

MOMO retains its files: `src/momo/configs/applications.yaml` for an optional row, current runtime/tool invocation for delegation, and existing Evidence/result owners for retention. No MOMO file is changed by this design. An upstream defect belongs in a separate minimal upstream patch with its own actual-runtime regression, not a new agent-surface MCP facade.

### Accepted Handoff and Comparison

One agent-surface preparation owner maintains the canonical runbook and private development-host bundle identified there. MOMO consumes that bundle; the duplicate deployment is not a second source of truth and its original owner handles cleanup. Synapse coordination and exact-path leases keep concurrent document writers from replacing the accepted setup. This is handoff coordination, not another runtime component or qualification gate.

MOMO first proves one enclosing Task can use the delegate and retain its actual files, then runs baseline versus A, followed separately by B and A+B. Every arm uses the parent's normal native tools and matched target-facing prerequisites; none inherits the smoke profile's MCP-only permissions or 12-step limit. The [comparison contract](contracts/agent-reuse.md#matched-comparison) owns the arm definitions and resource/evidence rules. The existing trial controller owns environment teardown even when the upstream task says `cancelled` or `done`; MOMO's native interruption propagation remains a separate claim. No new framework, store, scorer or automatic agent selector is needed.

### Distribution and Decision

Cybersecurity is the conceptual domain, but it is **not initial category membership**. A later registry entry would be `pentestagent`, `optional-caution`, explicitly selected by `--category mcps --service pentestagent`, with no automatic provisioning recipe or addition to `cybersecurity-assets.json`. Existing selection code would otherwise broaden every cybersecurity install. An entry is conditional on the real configured route; it must not pretend a bare executable establishes workspace or provider binding.

This architecture adds at most one upstream execution environment and one native MCP child, with zero new agent-surface deploy units, stores or dependencies. It accepts upstream text results and non-resumable task state for the pilot. It rejects a universal wrapper, schema extension, permanent service, or catalog-wide rollout before measured value. Native-only configuration is a valid deliverable if it completes the task more simply than a shared registry entry. The next useful gate is MOMO's bounded matched comparison, not shared registration.

## Grimoire Effectiveness Experiment

Status: retrieval defect FIXED, measured, and confirmed on a held-out set; task ROI UNPROVEN, 2026-10-16. Derived from [G-GR-01/02](context/concept-zero.md#grimoire-effectiveness-amendment). The [evaluation contract](contracts/grimoire-evaluation.md) is the single source for measurements, data ownership, interface boundary and the promotion rule; the [evidence view](diagrams/grimoire-evaluation.svg) separates the executed retrieval work from the unrun task-outcome experiment.

Retrieval stays one local read-only MCP process over a frozen index: no cache, embedding store, reranker or remote search service is justified by a warm search that costs about 2 ms. The reader required every query term, so a word absent from a skill's text excluded it before ranking; ranking weights could not recover it. Term eligibility and the caller-facing description are owned by `mcps/grimoire/src/store.ts` and `contract.ts` respectively, with `server.ts` transport/validation, `model.ts` row-to-DTO mapping and `indexer.ts` corpus/provenance, and the fix stayed inside those two owners.

An unmatched term no longer excludes a skill, which moves the risk rather than removing it: a query no skill covers returns its nearest lexical matches, so the caller must judge each hit against its own task. That duty is stated in the tool description, not enforced by a relevance threshold — intended-hit and unrelated-hit scores overlap on both the diagnostic and the held-out set, so no such threshold exists. On the held-out no-skill controls two caller models read the production instructions and descriptions and declined every one, which is why the duty is left where it is rather than encoded as a cutoff.

Keep benchmarks outside the product runtime. For task ROI, use an official task environment and verifier with fresh state and equivalent native tools and resources. Separate raw/general/category instruction ablations from service/tool additions and from direct-skill/on-demand retrieval ablations. A retrieval gain permits task evaluation; it does not establish category or native-task benefit. [Phase GR](roadmap.md#phase-gr-grimoire-and-asset-effectiveness) defines owners and remaining work.

## Skill Quality and Distribution

Status: PROPOSED, 2026-11-20; the lab in `evals/` is built and tested and no scored cohort ran (SQ1 closed 2026-11-23 by operator stop), the delivery work is not started. Source concept: [skill-quality concept](skill-quality/concept-zero.md) with its [research ledger](skill-quality/concept-zero-research.md). The [Grimoire evaluation contract](contracts/grimoire-evaluation.md) binds the experiment method. The [skill-evaluation contract](contracts/skill-evaluation.md) (DRAFT, `SQ0.7`) holds the measurements, ledger fields and promotion rules. [Phase SQ](roadmap.md#phase-sq-skill-quality-and-distribution) schedules the work.

### Executive Decision (SQ)

Add an evaluation lab outside the product runtime, and make it the gate for every skill, description and delivery change.
- **Form:** a uv-managed Python tree, `evals/`, that the compiler and installer never import.
- **Each attempt:**
  1. An adopted runner (Harbor, pinned; every host, Droid included, runs as an installed agent in it) starts one disposable container on a remote Linux server.
  2. The arm's profile, rendered once by the production installer (`install --no-mcps`), from a copy of the sources when a skill is dropped or a description replaced and never by editing them in place, is extracted into that container's HOME.
  3. The host CLI runs the scenario with run-time credentials.
  4. The host's own tool-call record decides which skill bodies loaded; a file-open audit cross-checks it.
  5. A verifier scores world state in its own sandbox.
- **Ledgers, preregistrations and analysis** follow GR2's conventions.

The compiler and installer keep their current architecture. Delivery changes per host and output kind only after a parity cohort. The installer's end state is always-on rules, settings, MCP merges and provisioning, owned-only pruning, and hosts with no native route. No service, store, dashboard or new installer flag is added, and no context is cut. Nothing here is complete until the first production slice runs on real hosts (`SQ1`).

### Drivers (SQ)

**Goals**
- `G-SQ-01` Goal: an isolated, repeated, preregistered lab on real host CLIs, graded on world state.
  - Evidence: concept; `E-05`, `E-06`.
  - Architecture impact: the `evals/` tree, runner adoption, the arm builder, verifiers, the ledger.
  - Verification gate: `SQ0.1` runner spike; `Q-SQ-01` reproducibility.
- `G-SQ-02` Goal: surfacing known per host before any wording result.
  - Evidence: `E-01`, `E-24`–`E-26`.
  - Architecture impact: listing capture in every attempt and a separate surfacing probe.
  - Verification gate: `SQ1.1` probe table.
- `G-SQ-03` Goal: trigger-form descriptions, adopted per host by cohort.
  - Evidence: user decision; `E-22`, `E-23`.
  - Architecture impact: per-skill query sets, description overlays, three arms.
  - Verification gate: `SQ1.3`, then `SQ2` cohorts.
- `G-SQ-04` Goal: outcome cohorts for `dev-fix`, `verify-test`, `qa-review`, `ship-commit` and the workflow roles.
  - Evidence: user decision.
  - Architecture impact: seeded scenarios with hidden verifiers; the without-asset arm.
  - Verification gate: `SQ1.4`, `SQ3`.
- `G-SQ-05` Goal: a skill-by-skill Superpowers comparison feeding hypotheses.
  - Evidence: user decision; `E-11`.
  - Architecture impact: none in code; memos plus cohort entries.
  - Verification gate: `SQ4`.
- `G-SQ-06` Goal: native or existing delivery where parity holds.
  - Evidence: user decision; `E-30`–`E-35`.
  - Architecture impact: plugin package outputs, shared `.agents/skills`, a parity harness, an installer that shrinks per switch.
  - Verification gate: `SQ5`.
- `G-SQ-07` Goal: one documented default path with listed alternatives.
  - Evidence: user decision.
  - Architecture impact: the workflow map only.
  - Verification gate: `SQ6`.

**Quality scenarios**
- `Q-SQ-01` Same frozen inputs → rerun on the same hosts and versions → arm means reproduce → within the preregistered tolerance (set from measured run-to-run variance; the concept's ASSUMPTION of ±10 points at 100 trials per arm does not match the held-out counts).
- `Q-SQ-02` Any cohort → finishes or aborts → the operator machine and accounts are untouched → snapshot diff empty and a clean exact-match credential scan of receipts.
- `Q-SQ-03` Full profile installed without MCP servers (`--no-mcps`) → host session starts → listing captured → each skill classified as surfaced, name-only or absent.
- `Q-SQ-04` Description arms → same queries, held-out split → trigger recall and near-miss false triggers → 95% intervals per skill and host against preregistered thresholds.
- `Q-SQ-05` Profile with and without one asset → seeded tasks → verifier rewards → paired differences against the preregistered practical-effect rule.
- `Q-SQ-06` A native route for one host and kind → install, discover, invoke, remove → same model-visible assets as the installer route → operator files and fields unchanged.
- `Q-SQ-07` Any attempt → runs → tokens or credits, and wall time recorded → the cohort admits no new group past its spend cap.

`C-SQ-01` to `C-SQ-07` and `N-SQ-01` to `N-SQ-07` apply throughout; the concept states them.

### Evidence and Source Reconciliation (SQ)

Current and used:
- **The concept and research ledger (2026-11-20).** Host and tool facts in them must be re-read when a step depends on them.
- **The Grimoire evaluation contract** (binding method).
- **README and `docs/reference/targets.md`**, for installer behaviour.

Stale or version-drifted:
- **The GR2 harness used BenchFlow 0.6.3;** stable is 0.9.3 (`E-19`). Re-verify the verifier environment before reusing GR2 tasks.
- **The host-availability note is from 2026-11-15 (`E-08`).** Re-probe before every cohort.

SPIKE_REQUIRED before implementation depends on them:
- Harbor's per-arm injection and result fields (`S-SQ-01`).
- The skill-load detector (`S-SQ-02`).
- Listing capture per host (`S-SQ-03`).
- Credential modes inside containers (`S-SQ-04`).
- Remote capacity (`S-SQ-05`).
- Rebuildable QA-history tasks (`S-SQ-06`).
- Existing tools' ownership semantics (`S-SQ-07`).
- Claude Code plugin parity (`S-SQ-08`).

VERIFIED_EXISTING:
- **The installer already installs a full profile into an arbitrary HOME** (`--dest`), which GR2 used as its arm injector (`E-06`).
- **A live plugin-manager test pattern exists** (`tests/suites/live-plugin.test.mjs`).
- **The build already emits plugin packages** for Codex and Antigravity.

### System Context and Boundaries (SQ)

- **Actors:** the operator (decisions, credentials, budget) and a lab peer (cohort runs). Reviewers read the receipts.
- **Remote Linux servers:** reached through the operator's `ops-server` conventions. They run Docker and the runner; each container holds one host CLI, one arm and one scenario.
- **Model providers** are reached from inside containers only.

Trust boundaries:
- **Credentials:** operator secrets → run-time environment of one container → never images, scenario folders or receipts.
- **Receipts:** private under `.agent-surface/research/`, never distributed.
- **The operator's machine:** analysis and documents only; no host CLI runs against the real HOME.
- **Scenario repositories and upstream tasks** are untrusted data.

Outside the system: the hosts' own release channels, public marketplaces (`OQ-SQ-03`), and the operator's live profile, which changes only through the existing installer or a parity-approved native route.

### Runtime View (SQ)

**Cohort**
1. A preregistration is frozen (scenarios, arms, hosts, models, CLI versions, repetitions, seeded order, budgets, decision rules).
2. Verifier qualification: each scenario's reference solution must pass and its untouched state must fail, else the cohort stops before any arm runs.
3. Attempts run at the chosen concurrency, in groups (every arm of one scenario, host and repetition) in seeded order; a cohort spend cap admits whole groups and a quarantine stops all launches ([stop semantics](contracts/skill-evaluation.md#isolation-and-secrets)).
4. Receipts return to the operator's machine. They are scanned for every injected credential value and common token patterns, then retained.
5. Analysis produces the decision table.

**Attempt**

| Step | Action |
|---|---|
| Start container | Fresh container, from the scenario's image, with the host CLI pinned. |
| Build the arm | The rendered arm tarball is extracted into the container HOME and its manifest is recorded. |
| Capture the listing | Not per attempt: the host's real skill listing is captured once per image before the cohort and its classification is the cohort's input. |
| Run | The host runs headless on the scenario instruction, with the file-open audit active. |
| Verify | The verifier runs on the final workspace in a separate sandbox. |
| Record | A ledger row is appended and the container is destroyed. |

**Failure behaviour**
- A host that cannot start (account, version, network) makes its cells `BLOCKED`. They are kept, not dropped.
- An attempt timeout or crash is a failed attempt, which stays in the denominator.
- A credential found in a receipt quarantines that receipt and stops the cohort.

**Delivery runtime.** The installer's runtime is unchanged.
- **Plugin route:**
  1. `build` emits a host plugin package from the canonical sources.
  2. The host's plugin manager installs it.
  3. `doctor` reports parity with the installer route.
- **Shared skills route:** one owned copy in `.agents/skills` for hosts that read it. The installer manifest still records ownership.

### Component View (SQ)

| Component | Description |
|---|---|
| Scenario set | One task per folder in the runner's format: instruction, environment, hidden verifier and reference solution. It owns no data outside its folder. Its quality obligation is verifier qualification. |
| Trigger query sets | One input JSON file (`--queries`) of should-trigger and near-miss queries with dev and held-out labels, written outside the lab before any arm runs and graded blind, then checked and selected by `python -m evals.queries check|select`; each query runs as one task on the shared `scenarios/trigger` template, which has no verifier. |
| Arm builder | Input: a profile from a fixed table (categories, dropped skills, description arm) and, for description arms, a text file. Output: a rendered HOME tarball plus its manifest, checked against its parent profile. It never writes the canonical sources. |
| Runner adapter | A Harbor agent class per host in `agents.py`, and a Harbor task written per attempt on the host image. |
| Skill-load detector | Loads decided from the host's own tool-call record (a skill-tool call, or a read of an installed `SKILL.md`). The file-open audit inside the container is the cross-check, because a skill tool opens no file. |
| Verifier library | Shared world-state checks: git state, commit signatures, hook outcomes, test runs, file diffs, and detection of weakened tests (removed assertions or skipped tests against the base commit). |
| Ledger and analysis | Append-only JSONL plus derived analysis. Analysis is a pure function of preregistration and ledger. |
| Receipt scrubber | Exact-match scan for injected credentials plus a pattern scan, before retention; pattern hits on a frozen list of known input strings are logged, not quarantined. |
| Delivery parity harness | The live plugin test pattern, extended to the plugin and shared-skills routes. It reuses the lab's surfacing probe for model-visible parity. |

### Source Tree and File Responsibilities (SQ)

```text
evals/                                    - The behavioural evaluation lab (SQ0.1-SQ0.6); never imported by scripts/ or mcps/; excluded from the npm package via .npmignore.
  pyproject.toml, uv.lock                 - Pinned lab dependencies (Harbor 0.26.0); nothing else depends on them.
  README.md                               - How to build images, run a cohort, capture listings and read the ledger; links to the contract.
  arms.py                                 - Profiles (a fixed table incl. the description arms), source copies without a dropped skill or with replaced descriptions, the installer render with --no-mcps and the reproducible pack; never edits canonical sources.
  images.py                               - `build`, `scenarios` and `arms`: one image per host (pinned base plus the host CLI), scenario images layered on them, rendered and checked arms; writes the Harbor task for an attempt.
  agents.py                               - Harbor agent classes for OpenCode, Droid, Claude Code and Codex that run inside the prebuilt image; keys go in by `docker exec -e`.
  gateway.py                              - Reads the gateway address and key names from the environment for the three gateway hosts; site details stay out of the repository.
  detect.py                               - Skill-load detector: host-recorded skill-tool calls and SKILL.md reads, with the file-open audit as a cross-check.
  stamp.py                                - Timestamps each file-open audit event with sub-second epoch time inside the container.
  listing.py                              - Captures the skill listing a host shows the model and classifies each installed skill as surfaced, name-only or absent.
  capture_proxy.py                        - Forwarding proxy that keeps a host's model request body (never its headers) for the listing capture; direct or gateway upstream.
  cohort.py                               - Expands scenarios or queries, hosts, profiles and repetitions into seeded groups, runs them through Harbor with a spend stop, a quarantine stop and per-host stop rules, retries launch failures, appends the ledger.
  endreason.py                            - Reads why an attempt ended and the output cap it ran under from the trial result and the host's record.
  queries.py                              - Loads the trigger query file and turns each query into a unit on the trigger template; `check` and `select` apply the mechanical checks and the seeded selection and split to candidates.
  scenarios/controls/<case>/              - Harbor tasks for detector qualification: use-by-name, use-by-file, no-skill.
  scenarios/dev-fix/<case>/               - Harbor tasks with a hidden verifier (F10, F13, F14 from SQ0.6).
  scenarios/trigger/                      - The shared trigger task template and its fixture workspace.
  world.py                                - Shared verifier checks, including test-weakening against the base commit; each scenario's `tests/world.py` is a copy that must stay identical.
  scrub.py                                - Receipt credential scan with input fingerprints; a hit quarantines the receipt and stops the cohort.
  sample.py                               - Samples host load and container usage for capacity runs.
  tests/                                  - Unit tests and trimmed real trajectories as fixtures.
  analyze.py                              - PROPOSED SQ1: rates and means with intervals, paired differences, cost and time; reads only preregistration and ledger.
docs/contracts/skill-evaluation.md        - DRAFT SQ0.7: arms, metrics, detector and listing rules, ledger fields, validity gates, promotion rules; extends the Grimoire evaluation contract.
skills/*/SKILL.md                         - VERIFIED_EXISTING; SQ2 moves descriptions to trigger form and adds the what-it-does paragraph to the body, per family, each through its own skill workflow.
scripts/agent-surface/targets.mjs         - VERIFIED_EXISTING; SQ1.2 (only if the probe shows dropped descriptions) emits host listing-budget settings; SQ5.3 adds plugin package outputs beside the existing exports.
scripts/agent-surface/install.mjs         - VERIFIED_EXISTING; shrinks per host only after a parity switch has held for a release (SQ5.5).
scripts/agent-surface/doctor.mjs          - VERIFIED_EXISTING; SQ5.3 adds the route-parity line for switched hosts.
tests/suites/live-plugin.test.mjs         - VERIFIED_EXISTING pattern; SQ5.3 extends it to the new routes.
.agent-surface/research/<date>-sq-<id>/   - Private receipts: preregistration and amendments, attempt ledger, scrubbed logs, analysis; not distributed.
```

### Data and State (SQ)

**Preregistration (JSON).**
- Frozen before outcomes. Each amendment is a separate file that states what it changes and why.
- It owns the decision rules, so a result cannot choose its own threshold.

**Attempt ledger (JSONL, append-only).**
- Fields: see the contract's [Ledger Fields](contracts/skill-evaluation.md#ledger-fields). The cohort is named by the `prereg` id and the seeded order is in `order.json`; rows carry no cohort or order-index field.
- Failed, aborted and `BLOCKED` rows are kept.
- `cohort.py` owns writes, and `analyze.py` reads only.

**Receipts.**
- Scrubbed transcripts and logs, private, retained like the GR receipts.
- Never credentials, operator memory or unrelated private content.

**Analysis.**
- Derived JSON, reproducible from the preregistration and ledger.
- Accepted conclusions are copied as summaries into the contract.

**Integrity.**
- There is no shared mutable store. A corrupted ledger line invalidates its attempt, not the cohort, and is reported.
- Recovery is a rerun of the affected cells under an amendment.

### Interfaces and Contracts (SQ)

- **Lab entry points:**
  - `python -m evals.images build|scenarios|arms`, `python -m evals.cohort --host-images <file> --arms <file> (--scenario <dir> | --queries <file>) --out <dir>` and `python -m evals.listing capture`, as in the lab README; `cohort --prereg <id>` only labels rows, and caps, spend and fingerprints are flags, not read from the preregistration;
  - `analyze.py`, proposed for SQ1, reading a ledger;
  - the runner's own CLI underneath.
- **Arm injection** uses the existing public install command (`install --target <t> --scope user --dest <HOME>` with categories) with `--no-mcps` on an overlay checkout. Experiments add no installer flag of their own, and description variants are source overlays, not options.
- **Verifier contract:** an exit status plus a result JSON (reward, named checks, evidence paths), in the runner's format.
- **Plugin packages (SQ5):**
  - Agent Plugins 1.0 core (`skills/`, `mcp.json`), with vendor namespaces only where a host needs them (`E-30`);
  - Claude Code's own manifest for its pilot;
  - always-on rules and settings never go into a plugin, because Claude Code ignores rule files in plugins (`E-33`).

### Security and Privacy (SQ)

- **Provider credentials:**
  - injected per attempt as environment on the remote server;
  - never baked into images or written to scenario folders;
  - containers are destroyed after each attempt;
  - receipts are scanned for every injected value before retention.
  - Proof: `Q-SQ-02`.
- **The operator's machine and accounts:**
  - no host CLI runs against the real HOME;
  - local steps are analysis and documents only;
  - after each local step, the machine snapshot diff (`~/.local/bin`, `brew list`, `uv tool list`) and the git config hash are unchanged.
- **Untrusted inputs** (upstream tasks, scenario repositories, host output) are data. Runners and images are pinned; no scenario content is executed outside its container.

### Operations (SQ)

- **Where:** cohorts run as batch jobs on remote Linux servers reached through `ops-server`. Concurrency is set from the measured capacity (`S-SQ-05`). Nothing runs as a long-lived service.
- **Cost:** every cohort has a cap and a per-attempt stop, and the ledger carries cost. The operator approved the budget; caps still bound each cohort.
- **Versions:** each cohort pins host CLI and model versions. An upgrade is a new cohort, never a silent continuation.
- **Rollback:**
  - a description change is reverted per host from git;
  - a delivery switch reverts to the installer route, whose code is deleted only after the switch has held for a release.

### Quality Scenarios and Fitness Gates (SQ)

- `Q-SQ-01` A planned rerun of one cohort cell set with the original preregistration (`SQ1.5`).
- `Q-SQ-02` After every cohort: the scrubber report plus the snapshot and git config hash comparison.
- `Q-SQ-03` The surfacing probe table, rerun after every description rollout (`SQ1.1`, `SQ2.3`).
- `Q-SQ-04` and `Q-SQ-05` Preregistered cohorts with intervals (`SQ1.3`, `SQ1.4`, `SQ2`, `SQ3`).
- `Q-SQ-06` Parity cohort plus the extended live plugin test per switched host (`SQ5.3`, `SQ5.4`).
- `Q-SQ-07` Ledger cost fields and cap stops, audited in each decision record.

### Decisions (SQ)

#### ADR-SQ1: Evaluate before changing skills or delivery routes

PROPOSED.
- **Context:** the only native task run loaded no agent-surface skill (`E-01`), and every skill decision so far rests on review.
- **Decision:** every description, skill refinement and delivery switch passes a preregistered cohort first, under the Grimoire evaluation method.
- **Consequences:** slower changes, approved spend, and evidence-backed rollbacks.
- **Rejected:** review-only changes, and a wording lint (it tests prose, not behaviour).

#### ADR-SQ2: Adopt runners; the production installer injects arms

ACCEPTED for the runner and the arm route, `SQ0.1` 2026-11-21; the detector stays open until `SQ0.2`.
- **Spike result:** Harbor 0.26.0 (Apache-2.0, pinned in `evals/uv.lock`) ran OpenCode and Droid in 8 attempts (2 hosts x 2 arms x 2 repetitions), each in its own container with the arm built by the production installer. Harbor has an OpenCode adapter but no Droid adapter. Droid runs as a custom installed agent (`evals/agents.py`) with the Factory key passed by `docker exec -e` instead of Harbor's own exec, which would put the value in argv. BenchFlow was not needed.
- **Context:** Harbor and BenchFlow drive most runnable hosts in containers (`E-18`, `E-19`). No runner knows each host's skill locations; the installer does (`E-06`).
- **Decision:** adopt a runner and build only the arm builder, detector, verifiers, ledger and scrubber.
- **Consequences:** results measure production delivery; the runner's version becomes part of each preregistration.
- **Rejected:**
  - building a runner (contract `N-SQ-06`);
  - Quorum (no license);
  - per-host hand-written injection.

#### ADR-SQ3: Description form is adopted per host by cohort

PROPOSED.
- **Context:** the operator chose the trigger form, and vendor guidance asks for what plus when (`E-22`). No published head-to-head comparison exists.
- **Decision:** run arms A (current), B (trigger) and C (what plus when, diagnostic). B ships per host when it is no worse than A on recall, false triggers and existing outcome cohorts (the first slice has too few queries to show no-worse; see the contract's open decision `O-3`). If C beats B by the practical threshold, the operator decides.
- **Consequences:** descriptions may differ by host for a time, so the source model needs a per-host description only if results diverge (deferred until seen).
- **Rejected:** a global switch without evidence.

#### ADR-SQ4: Delegate delivery only by parity

PROPOSED.
- **Context:** native plugin managers and shared skill locations now cover many hosts (`E-31`, `E-32`). No existing tool gives our ownership, merge and provisioning guarantees (`E-35`).
- **Decision:** per host and output kind, a native route or existing tool replaces our code after a parity cohort and live test.
- **The installer keeps:**
  - always-on rules and settings;
  - MCP merges that keep operator fields;
  - first-party provisioning;
  - owned-only pruning;
  - hosts with no native route.
- **Consequences:** two routes coexist during a switch; `doctor` reports which one is active.
- **Rejected:**
  - a migration before evaluation (Candidate B);
  - wholesale replacement by rulesync, `skills` or add-mcp (Candidate C, until `S-SQ-07`).

#### ADR-SQ5: External skill libraries are hypothesis sources, never copied text

PROPOSED, user decision.
- **Context:** Superpowers is MIT and popular, but it is shaped for its own workflow and has open safety and cost issues (`E-13`).
- **Decision:** one comparison packet per skill. Hypotheses enter cohorts, and adopted refinements are written in our own words.
- **Rejected:** importing its skills as an external pack, which would put a second workflow beside ours.

#### ADR-SQ6: One documented default path, nothing removed

PROPOSED, user decision.
- **Decision:** after the operator's research, the workflow map names one short default development route and lists alternatives by scenario. Every skill stays.
- **Rejected:** merging or retiring overlapping skills in this program.

### Risks, Debt, and Revisit Triggers (SQ)

- **The lab costs more than it teaches.**
  - Mitigation: trigger cohorts are cheap and come first.
  - Trigger: the first slice cannot classify surfacing on two hosts, or cannot decide three skills.
  - Next proof: `SQ1.5`.
- **Host and model drift during the program.**
  - Mitigation: pinned versions per cohort and a re-probe before each.
  - Trigger: a major host release changes listing or skill mechanics.
- **Detector false negatives** (a host reads a skill from a cache or a path outside the audit).
  - Mitigation: host-log cross-check.
  - Trigger: disagreement above the preregistered tolerance.
- **Scenario bias:** tasks written in-project could flatter our skills.
  - Mitigation: rebuilt QA-history defects and SkillsBench tasks, and blind grading where a judge is needed.
- **Accounts block hosts.**
  - Mitigation: `BLOCKED` cells; claims limited to runnable hosts.
  - Trigger: the operator restores an account.
- **Delivery semantics differ per host** (update and uninstall).
  - Mitigation: parity per host, installer rollback, deletion only after a release holds.

### Implementation Guardrails (SQ)

- `evals/` depends on the installer's public CLI only; nothing in `scripts/` or `mcps/` imports `evals/`.
- The lab never writes canonical sources; arms are overlays.
- Skill edits follow the project rule: each runs as its own skill workflow, never alongside delivery or lab changes.
- Every cohort is preregistered before outcomes, and amendments are separate files.
- New lab dependencies are vetted for license, maintenance and advisories, and pinned with uv.
- A delivery switch needs its parity record. Installer code for a host is deleted in a later change, after the switch has held for a release.
