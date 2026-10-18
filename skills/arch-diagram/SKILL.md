---
name: arch-diagram
description: "Build an evidence-backed architecture atlas with presentation-grade views, dataflow, and source-linked runtime traces."
---

## OBJECTIVE

Build or refresh an architecture atlas that lets:

- leaders understand the system's purpose, shape, differentiators, scale, and material risks without reading the repository;
- developers navigate from a system view into deployable units, runtime and data paths, source symbols, failure behavior, and operational boundaries;
- reviewers distinguish what is observed at runtime, implemented in code or configuration, inferred, proposed, or still unknown.

The deliverable is not a quota of Mermaid diagrams. It is one evidence-backed architecture model expressed through the smallest set of views that answers the audience's actual questions. Keep editable diagram source in the repository, but also render and inspect the artifacts people will consume. A polished diagram that invents the architecture fails; a correct source file that renders as an unreadable wall also fails.

Default output location: `docs/diagrams/`, integrated with the repository's canonical architecture documentation. Preserve an established diagrams-as-code layout when one exists.

## Intent

Interpret user arguments or prose along these dimensions:

- **scope**: whole system, subsystem, service, feature, journey, incident path, or proposed change;
- **audience**: `leadership`, `engineering`, `operations`, `security`, or a named combination;
- **focus**: `landscape`, `runtime`, `data`, `deployment`, `dependency`, `trace`, or `all`;
- **state**: `as-is`, `to-be`, or `delta`;
- **delivery**: `docs`, `presentation`, `interactive`, or a combination;
- **tool**: `auto` or an explicitly requested and available renderer.

If none are supplied, use whole-system scope, `as-is`, leadership plus engineering, `all`, docs plus presentation, and `auto`. Do not ask questions that repository evidence can answer. Ask before proceeding only when audience, scope, or current-versus-proposed state is genuinely ambiguous and choosing incorrectly would materially change the result.

## Decision Standard

Judge every view against five qualities:

1. **Truth**: elements and relationships are tied to current evidence, with uncertainty visible rather than silently completed.
2. **Purpose**: the view names one audience, one question, one scope, and one primary takeaway.
3. **Traceability**: a reader can move from the view to the evidence, and from an important journey to its entry point, hops, state changes, effects, and failure handling.
4. **Progressive disclosure**: the atlas moves from orientation to selected detail without mixing abstraction levels or creating a giant graph.
5. **Rendered usability**: hierarchy, labels, spacing, contrast, and routing survive the actual documentation and presentation formats.

"Wow" comes from revealing the system clearly: a strong story, honest boundaries, meaningful scale or risk callouts, and smooth zoom from outcome to implementation. Decoration, excessive icons, gradients, and dense animation do not compensate for weak architecture content.

## Research Basis

The findings behind these rules (C4 views and notation, arc42 runtime views, OpenTelemetry traces, data-flow
and trust boundaries, graph-reading cost, contrast, and renderer trade-offs) and their primary sources are
in `references/research-basis.md`. Read it when a view or tool choice needs its rationale or a citation.

## Evidence Before Drawing

Re-ground on the live checkout. Read the canonical architecture and concept documents, but verify them against:

1. runtime traces, service catalogs, deployment inventory, or a reproducible local probe;
2. entry points, package/module boundaries, API contracts, schemas, migrations, event definitions, configuration, and infrastructure as code;
3. tests that exercise real paths and operational runbooks;
4. existing diagrams and prose, treated as claims to reconcile rather than authority.

Record an evidence ledger before laying out views. Use the repository's existing architecture model when available. Otherwise create `docs/diagrams/evidence.md`; do not invent a bespoke model format unless it will actually drive generation or validation.

Each important element and relationship needs:

| Field | Meaning |
|---|---|
| ID | Stable identifier reused across views |
| Kind | person, system, container, component, process, datastore, queue/topic, deployment node, or code symbol |
| Responsibility | Short outcome-oriented description |
| Technology | Runtime or implementation technology when relevant |
| Status | `OBSERVED`, `IMPLEMENTED`, `INFERRED`, `PROPOSED`, or `UNKNOWN` |
| Evidence | File and line, symbol, contract, IaC resource, sanitized trace/span, command, or environment observation |
| Freshness | Git revision plus observation or review date; environment for runtime evidence |
| Notes | Assumption, contradiction, owner, or proof limitation |

Use the statuses precisely:

- `OBSERVED`: seen through a current runtime trace, inventory, or reproducible probe.
- `IMPLEMENTED`: directly established by current source, configuration, contract, schema, or IaC.
- `INFERRED`: a reasoned connection not directly established; include the reasoning.
- `PROPOSED`: future design, never styled as current behavior.
- `UNKNOWN`: material evidence is missing or contradictory.

Static evidence can establish implemented structure, not runtime frequency, latency, reachability, or successful end-to-end behavior. Sanitize runtime evidence; do not place secrets, tokens, personal data, or private endpoint details into diagrams.

## Build One Model, Derive Views

Reuse stable IDs, names, relationship semantics, and evidence across all views. Prefer a modelling source that can derive multiple views when the repository already has one. When the selected tool is diagram-oriented, maintain a shared terminology and evidence ledger instead of copying inconsistent boxes.

Never combine `as-is` and `to-be` silently. For `delta`, create paired or filtered views with stable placement and explicit added, changed, removed, and unchanged semantics. Do not imply that proposed components exist.

Before authoring, write a view plan:

| View | Audience | Question answered | State | Evidence needed | Keep? |
|---|---|---|---|---|---|
| `<name>` | `<audience>` | `<one question>` | as-is/to-be/delta | `<evidence>` | why this view earns maintenance |

Delete or merge a view when it has no distinct question. A lower-level component or code diagram is conditional, not a default: keep it only when it explains a complex, risky, or decision-relevant area better than source navigation or generated tooling.

## View Portfolio

Choose views by question, not by a fixed bundle. For a whole-system atlas, the normal minimum is an orientation view, a representative value trace, and enough runtime/data/deployment detail to substantiate the system story. Omit categories that do not exist and state the reason in the index.

### Leadership Storyboard

Create a short sequence of presentation-ready frames when leadership or presentation delivery is in scope. Derive it from the same model and evidence as the engineering atlas.

A useful story often progresses through:

1. **Orientation**: users, system boundary, external ecosystem, and the outcome the system owns.
2. **Value path**: how one defining journey crosses the architecture and changes the world.
3. **Why this shape**: the architecture decision, leverage point, scale mechanism, or differentiator worth remembering.
4. **Trust and resilience**: material boundary, failure containment, recovery path, or operational ownership.
5. **Change**: only when requested, a truthful as-is/to-be delta with trade-offs and unresolved decisions.

Use only the frames that advance the story. Each frame has a sentence-length takeaway visible without narration. Fit the intended slide or screen without zooming; move supporting detail into notes or a linked engineering view.

### Engineering Atlas

Select from these views:

- **Landscape/context**: actors, system boundary, external systems, ownership, and relationship intent.
- **Runtime/container topology**: independently runnable or deployable units, stateful resources, async infrastructure, protocols, and ownership.
- **Journey trace**: one end-to-end outcome through entry points, code/runtime hops, transformations, state changes, side effects, observability, and failure behavior.
- **Data lifecycle**: important data from origin through validation, transformation, storage, publication, retention/deletion, and trust boundaries.
- **Deployment/resilience**: environments, regions/zones, routing, scaling units, single points of failure, failover, rollback, and observability.
- **Dependency/blast radius**: upstream/downstream impact for a selected subsystem, generated or filtered when the graph is large.
- **State machine**: only for a lifecycle whose invalid transitions, retries, or terminal states matter.
- **Component/code view**: only for a selected complex or risky boundary, preferably generated on demand and linked to symbols.

Security and operations audiences may use the same base view with a perspective or filtered overlay for trust zones, sensitive data, controls, ownership, health, SLOs, or failure domains. Do not fork a second contradictory architecture model.

## Trace Contract

A trace view must answer a concrete question such as "How does a submitted order become a durable, externally visible result?" It is not a transcript of function calls.

For each selected journey:

1. Name the trigger, actor, preconditions, expected outcome, and completion evidence.
2. Follow the path from real entry point to durable state or external effect.
3. Reuse model IDs for participants; link developer-facing nodes to source files, symbols, API/event schemas, or infrastructure definitions.
4. Label every hop with operation plus protocol or invocation type. For data flow, name the payload or entity and meaningful transformation.
5. Show authentication/authorization, trust-boundary crossings, transaction boundaries, and ownership changes when relevant.
6. Show async causality explicitly: producer, queue/topic, consumer, correlation, delivery semantics, idempotency, retry, and dead-letter behavior only when evidence supports them.
7. Include the highest-value failure or recovery branch: timeout, partial write, duplicate delivery, dependency failure, rollback, compensation, or degraded mode.
8. Mark observability anchors: trace/span, metric, log/event, alert, or audit record used to prove or diagnose the path.
9. State whether the trace is `OBSERVED`, reconstructed from `IMPLEMENTED` static evidence, or partly `INFERRED`. A static call graph, mocked run, fixture, or diagram name cannot establish runtime proof.

Prefer a representative happy path plus one critical exception over an exhaustive sequence. Split long journeys at meaningful boundaries and link the continuation.

## Dataflow Contract

For each important flow, distinguish:

- external actor or source;
- process or responsibility;
- data store, queue, stream, or external sink;
- named data or event on every directional edge;
- validation and transformation;
- owner and system of record;
- sensitivity or classification where relevant;
- trust, network, tenant, or privilege boundary;
- retention, deletion, replication, and backup behavior when material;
- failure, replay, deduplication, reconciliation, and consistency behavior.

Do not use a generic message-bus or database box to hide topic-level coupling, ownership, or materially different data paths. Do not mix dependency arrows and data-flow arrows in one view unless their semantics are visually distinct and explained in the legend.

## Tool Selection

Use the repository's established, reproducible toolchain when it can meet the artifact. Otherwise select deliberately:

| Tool | Prefer for | Watch for |
|---|---|---|
| Structurizr DSL/UI | Long-lived C4 model, reusable views, filtering, perspectives, zoom navigation, presentation | Requires its renderer for the richest interactive behavior; exported Mermaid/DOT views lose features |
| D2 | Polished standalone diagrams, composed scenarios/steps, SVG/PDF/PPTX presentation output | Keep a shared model/evidence discipline; advanced layouts and exports depend on available engines |
| Archify | Validated interactive HTML, presentation views, source-linked traces, and static or motion export | Optional external skill; use it as the renderer while this skill remains the architecture and evidence contract |
| Graphviz DOT | Generated dependency, blast-radius, and other graph-heavy views | Not a full architecture model; choose layered versus force-directed layout by the question |
| PlantUML | Detailed sequence, activity, state, and established UML/C4 repositories | Dense diagrams still need curation and presentation styling |
| Mermaid | Portable Markdown, simple-to-moderate flow/sequence/ER views, zero-friction repository viewing | Portability is not presentation quality; configure theme/layout and render with a pinned compatible version |

`auto` is not "always Mermaid." Prefer the existing repository standard; otherwise choose the simplest available tool that can produce the required model/view behavior and rendered quality. Use one primary model/renderer. Add a second only for a specialized view it materially improves, and record why.

When the optional `archify` skill is installed and the requested delivery is interactive or presentation-grade, use its renderer and validation commands rather than recreating that rendering pipeline. Do not delegate architecture discovery or evidence classification to the renderer.

Do not introduce an unreviewed hosted dependency or upload private architecture to an external service. Before adding a local dependency, follow the project's dependency-risk policy and pin the version used for rendering. If only Mermaid is available, use explicit frontmatter/configuration, a consistent theme, and ELK for non-trivial layered flow when supported. If no suitable renderer is available, finish the source but report rendered acceptance as `BLOCKED`; do not call source inspection a visual pass.

## Visual System

Define one small visual grammar and reuse it:

- stable element shapes/types for people, systems, runtimes, processes, stores, queues/topics, and boundaries;
- a restrained semantic palette for owned, external, stateful, proposed/unknown, and risk/failure concepts;
- text, shape, border, or line-pattern redundancy so color is never the only carrier of meaning;
- sufficient text/background and object/background contrast for the rendered target;
- one direction that matches the story: normally left-to-right for journeys and top-to-bottom for hierarchy;
- direct, specific relationship labels aligned with arrow direction; include protocols on inter-process edges;
- short responsibility text inside nodes and details in notes/evidence;
- consistent names and positions across related views, especially as-is/to-be pairs;
- labeled official technology/provider icons only when they improve recognition; never icon-only mystery nodes;
- a legend, diagram type, scope, state, and expanded acronyms on every standalone view.

Minimize crossings and bends, keep important paths continuous, and avoid reverse-flow edges. If routing becomes tangled, labels need to shrink, or the primary path is not visually dominant, filter or split the view. Do not solve density by making the canvas enormous.

Presentation frames should use a stable 16:9 composition unless the user supplies another target. The title, takeaway, and primary path must be legible at the final display size. Engineering views may be larger or interactive, but each needs a clear start point and navigable links rather than an unbounded poster.

## Output Contract

Adapt to an existing architecture-doc layout. For a new atlas, use:

```text
docs/diagrams/
  README.md                 # audience routes, view catalog, freshness, known gaps
  evidence.md               # model/evidence ledger and contradictions
  source/                   # editable .dsl/.d2/.dot/.puml/.mmd sources and shared style/config
  rendered/                 # reviewed SVGs; PNG/PDF only where the consumer needs them
  presentation/             # optional storyboard, notes, PPTX/PDF, or progressive frames
```

Keep source and rendered basenames aligned. Prefer SVG for documentation because it stays sharp and can preserve links; add a high-resolution raster or presentation format only for a real consumer. Do not commit redundant exports that the repository intentionally builds in CI.

`README.md` is the entry point and includes:

- "Start here" links for each requested audience;
- a one-paragraph system story;
- a catalog with view, audience, question, state, source, rendered artifact, and evidence/freshness;
- navigation between zoom levels and from diagram nodes to source/docs where the tool supports it;
- known unknowns, contradictions, omitted view categories, and blocked runtime proof;
- exact render/validation commands and pinned tool version.

Every rendered view or Markdown wrapper carries:

```text
Title: <diagram type and scope>
Audience: <who should use it>
Question: <one question answered>
State: as-is | to-be | delta
Takeaway: <one sentence>
Evidence snapshot: <git revision, date, and runtime environment if applicable>
Confidence: <status summary and link to evidence ledger>
```

Link the atlas from `docs/architecture.md` or the repository's canonical equivalent. Avoid duplicating the same prose and diagram inline across multiple documents.

## Protocol

1. **Frame**: resolve scope, audience, focus, state, delivery target, and renderer. State the questions the atlas must answer.
2. **Inventory**: re-ground on the live checkout; identify actors, boundaries, runtimes, stores, queues/topics, contracts, deployment nodes, entry points, owners, and critical journeys.
3. **Reconcile**: build the evidence ledger; flag stale docs, contradictory sources, inferred edges, proposed elements, and missing runtime proof.
4. **Model**: establish stable IDs, responsibilities, technology, and directional relationship semantics once.
5. **Curate**: write the view plan, select only views with distinct value, and choose the leadership story and engineering trace depth.
6. **Author**: apply the visual system, progressive disclosure, source links, evidence metadata, and audience-specific takeaways.
7. **Render**: run the real pinned renderer for every source; generate the actual SVG and requested presentation artifacts.
8. **Inspect**: review the rendered result at its intended documentation and presentation sizes. Iterate layout, labels, and view boundaries rather than accepting the first automatic layout.
9. **Challenge**: independently walk one critical journey from diagram to source and, when available, runtime evidence. Look for reversed arrows, hidden state, missing trust/failure boundaries, mixed current/future state, and attractive but unsupported claims.
10. **Integrate**: update the index and canonical architecture link; remove superseded duplicate diagrams only after preserving unique evidence and inbound navigation.

## Acceptance Gate

Do not report the atlas complete until all applicable checks run:

### Truth and Trace

- Every important node and edge maps to the evidence ledger.
- One selected end-to-end journey has been walked from entry point to durable state or external effect.
- Observed, implemented, inferred, proposed, and unknown claims are not conflated.
- Runtime claims name the environment and evidence; unavailable runtime proof remains a blocker, not an inferred pass.
- Data stores, async boundaries, external effects, trust changes, and material failure/recovery paths are visible where relevant.

### Diagram Semantics

- Each view has one audience, question, scope, state, takeaway, legend, and evidence snapshot.
- Element types, responsibilities, technology, relationship direction, labels, and protocols are understandable without narration.
- Dependency, invocation, dataflow, and deployment semantics are not mixed ambiguously.
- Names and IDs remain consistent across views; proposed content cannot be mistaken for current architecture.

### Render and Visual Review

- Every source compiles with the pinned real renderer and has the expected artifact.
- Rendered SVG/PNG/PDF/PPTX was opened or screenshot and visually inspected; source text alone is insufficient.
- No clipped nodes, overlaps, orphan edges, broken glyphs, unreadably small text, unexplained symbols, or accidental off-canvas content.
- The primary path and hierarchy are obvious; crossings and bends do not obscure tracing.
- Leadership frames are readable at the target 16:9 size without zoom; developer views have a clear start point and usable navigation.
- Color contrast is adequate, meaning survives grayscale/color-deficient viewing, and a concise text summary covers the diagram's information.

### Integration and Maintenance

- Index links, source links, navigation, and canonical architecture links resolve.
- Source/rendered pairs and freshness metadata agree with the checked-out revision.
- The atlas contains no redundant view without a distinct question.
- The render command is reproducible; generated artifacts follow repository policy.

If a renderer, runtime environment, telemetry source, or required evidence is unavailable, mark that specific check `BLOCKED` and give the concrete unblock path. Do not replace it with a mock, fixture, hand-edited screenshot, or unverified diagram.

## Execution Rules

1. Draw the architecture that exists unless the requested state is explicitly `to-be` or `delta`.
2. Derive multiple experiences from one model/evidence set; never maintain separate leadership and engineering truths.
3. Prefer a few strong, linked views over exhaustive diagrams that no one can read or maintain.
4. Treat component/code diagrams, animations, icons, and specialized renderers as conditional tools, not quality by themselves.
5. Preserve source traceability and uncertainty even when simplifying a presentation view.
6. Render, inspect, and iterate. Valid syntax is only the first visual check.
7. Use an external renderer/service only when the selected workflow requires it. Send the minimum relevant architecture input and never include credentials or unrelated private repository content.

## Completion Report

- Changed: full paths to model/evidence, diagram sources, rendered artifacts, presentation output, index, and canonical architecture link.
- Questions answered: the audience/question/takeaway for each retained view.
- Evidence: counts by `OBSERVED`, `IMPLEMENTED`, `INFERRED`, `PROPOSED`, and `UNKNOWN`; name material contradictions.
- Checks: exact renderer commands, trace walk, link checks, and visual inspection targets as `passed`, `failed`, `not run`, or `BLOCKED`.
- Status: `COMPLETE`, `IMPLEMENTED BUT UNVERIFIED`, or `BLOCKED` for the requested scope.
- Blockers: unresolved evidence or tooling gaps, whether human action is required, and the concrete unblock path.
- Next command: usually `arch-roadmap`, `verify-readiness`, or `workflow-boss`.
