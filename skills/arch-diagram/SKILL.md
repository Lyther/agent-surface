---
name: arch-diagram
description: "Build an evidence-backed architecture atlas with presentation-grade views, dataflow, and source-linked runtime traces."
---

## Objective

Build or refresh one evidence-backed architecture model, expressed through the smallest set of views that answers the audience's questions. Leaders should grasp purpose, shape, differentiators, scale, and material risks without reading the repository; developers should navigate from a system view to deployable units, runtime and data paths, source symbols, failure behavior, and operational boundaries; reviewers should tell observed, implemented, inferred, proposed, and unknown apart. Keep editable source in the repository and render and inspect what people consume: invented architecture fails, and so does correct source that renders as an unreadable wall. Rationale and sources: `references/research-basis.md`.

## Input

Scope (whole system, subsystem, service, feature, journey, incident path, proposed change); audience (`leadership`, `engineering`, `operations`, `security`, combined); focus (`landscape`, `runtime`, `data`, `deployment`, `dependency`, `trace`, `all`); state (`as-is`, `to-be`, `delta`); delivery (`docs`, `presentation`, `interactive`, combined); tool (`auto` or a named available renderer).

Defaults: whole system, `as-is`, leadership plus engineering, `all`, docs plus presentation, `auto`, output in `docs/diagrams/` (preserve an existing diagrams-as-code layout). Answer from repository evidence; ask only when audience, scope, or current-versus-proposed state is ambiguous and a wrong choice would materially change the result.

## Evidence

Never put credentials or unrelated private repository content in a diagram or ledger. Re-ground on the live checkout. Treat the canonical architecture and concept docs, existing diagrams, and prose as claims, and verify them against runtime traces, service catalogs, deployment inventory, or a reproducible probe; entry points, module boundaries, API contracts, schemas, migrations, event definitions, configuration, and IaC; tests that exercise real paths; and runbooks.

Before laying out views, record a ledger in the repository's existing architecture model, else in `docs/diagrams/evidence.md` (no bespoke format unless it drives generation or validation). Per important element and relationship: stable ID reused across views; kind (person, system, container, component, process, datastore, queue/topic, deployment node, code symbol); short responsibility; technology when relevant; status; evidence (file and line, symbol, contract, IaC resource, sanitized trace or span, command, environment observation); freshness (Git revision, observation date, environment for runtime evidence); notes (assumption, contradiction, owner, proof limit).

Statuses: `OBSERVED` (current runtime trace, inventory, or reproducible probe), `IMPLEMENTED` (current source, config, contract, schema, or IaC), `INFERRED` (reasoned, not established; give the reasoning), `PROPOSED` (future design, never styled as current), `UNKNOWN` (missing or contradictory evidence). Static evidence proves structure, not runtime frequency, latency, reachability, or end-to-end success. Sanitize runtime evidence: no secrets, tokens, personal data, or private endpoints in diagrams.

## Views

Draw what exists unless the state is `to-be` or `delta`. Derive every view, leadership and engineering alike, from one model: reuse IDs, names, relationship semantics, and evidence; prefer the repository's modelling source when it can derive views, and with a diagram-oriented tool keep one shared terminology and ledger. Move from orientation to selected detail; never mix abstraction levels in one view or draw a giant graph. A `delta` uses paired or filtered views with stable placement and explicit added, changed, removed, and unchanged marks; never imply proposed components exist.

Before authoring, write a view plan and delete or merge any view without a distinct question:

| View | Audience | Question answered | State | Evidence needed | Keep? |
|---|---|---|---|---|---|
| `<name>` | `<audience>` | `<one question>` | as-is/to-be/delta | `<evidence>` | why this view earns maintenance |

A whole-system atlas needs at least an orientation view, a representative value trace, and enough runtime, data, and deployment detail to substantiate the story; omit categories that do not exist and say why in the index.

Leadership storyboard, when leadership or presentation delivery is in scope, using only frames that advance the story: orientation (users, boundary, ecosystem, owned outcome); value path (one defining journey across the architecture); why this shape (decision, leverage, scale mechanism, or differentiator); trust and resilience (material boundary, failure containment, recovery, ownership); change, only when requested (truthful as-is/to-be delta with trade-offs and open decisions). Each frame states a sentence-length takeaway readable without narration, fits the target slide without zooming, pushes detail to notes or a linked engineering view, and keeps its traceability and uncertainty.

Engineering views, chosen by question: landscape/context (actors, boundary, external systems, ownership, relationship intent); runtime/container topology (deployable units, stateful resources, async infrastructure, protocols, ownership); journey trace; data lifecycle (origin, validation, transformation, storage, publication, retention or deletion, trust boundaries); deployment/resilience (environments, zones, routing, scaling units, single points of failure, failover, rollback, observability); dependency/blast radius (generated or filtered when large). Add a state machine only for a lifecycle whose invalid transitions, retries, or terminal states matter, and a component/code view only for a complex, risky, or decision-relevant boundary it explains better than source navigation, preferably generated and linked to symbols. Security and operations audiences get a perspective or filtered overlay on the same base view (trust zones, sensitive data, controls, ownership, health, SLOs, failure domains), never a second model.

## Traces

A trace answers a concrete question ("How does a submitted order become a durable, externally visible result?"), not a call transcript. For each journey:

1. Name the trigger, actor, preconditions, expected outcome, and completion evidence.
2. Follow the real entry point to durable state or an external effect, reusing model IDs and linking developer-facing nodes to source files, symbols, API or event schemas, or infrastructure definitions.
3. Label each hop with operation plus protocol or invocation type; for data, the payload or entity and meaningful transformations.
4. Show authentication and authorization, trust-boundary crossings, transaction boundaries, and ownership changes when relevant, and async causality (producer, topic, consumer, correlation, delivery semantics, idempotency, retry, dead-letter) only where evidence supports it.
5. Include the highest-value failure or recovery branch: timeout, partial write, duplicate delivery, dependency failure, rollback, compensation, or degraded mode.
6. Mark the observability anchors (span, metric, log or event, alert, audit record) that prove or diagnose the path.
7. State whether the trace is `OBSERVED`, reconstructed from `IMPLEMENTED` evidence, or partly `INFERRED`; a static call graph, mocked run, fixture, or diagram name is not runtime proof.

Prefer one representative happy path plus one critical exception; split long journeys at meaningful boundaries and link the continuation.

For each important data flow, distinguish source, process, store, queue, stream, or sink, named data on every directed edge, validation and transformation, owner and system of record, sensitivity, trust, network, tenant, or privilege boundaries, retention, deletion, replication, and backup when material, and failure, replay, deduplication, reconciliation, and consistency behavior. Never hide topic-level coupling, ownership, or distinct data paths behind a generic bus or database box, and never mix dependency and data-flow arrows unless they look distinct and the legend explains them.

## Tools

Use the repository's established, reproducible toolchain when it can produce the artifact; otherwise pick the simplest available tool that meets the model, view, and rendering needs (`auto` does not mean Mermaid):

| Tool | Prefer for | Watch for |
|---|---|---|
| Structurizr DSL/UI | long-lived C4 model, filtering, perspectives, zoom navigation | richest interaction needs its renderer; Mermaid/DOT exports lose features |
| D2 | polished standalone diagrams, scenarios and steps, SVG/PDF/PPTX | advanced layouts and exports depend on installed engines |
| Archify | validated interactive HTML, presentation views, source-linked traces, motion export | optional external skill; renderer only |
| Graphviz DOT | generated dependency and blast-radius graphs | not a full architecture model; pick layered or force-directed layout by question |
| PlantUML | detailed sequence, activity, state; existing UML/C4 repositories | dense diagrams still need curation |
| Mermaid | portable Markdown, simple-to-moderate flow, sequence, ER | configure theme and layout; render with a pinned version |

Use one primary renderer; add a second only for a specialized view it materially improves, and record why. When the optional `archify` skill is installed and delivery is interactive or presentation-grade, use its renderer and validation commands, but keep architecture discovery and evidence classification here. Never add an unreviewed hosted dependency or upload private architecture; use an external renderer only when the workflow requires it, sending the minimum input and no credentials. Follow the project's dependency-risk policy and pin the rendering version. Mermaid-only: explicit frontmatter or config, a consistent theme, and ELK for non-trivial layered flow when supported. With no suitable renderer, finish the source and report rendered acceptance `BLOCKED`.

## Visual Rules

- One visual grammar: stable shapes per element type, a restrained semantic palette (owned, external, stateful, proposed/unknown, risk), and text, shape, or line pattern carrying meaning so color is never the only carrier; contrast sufficient for the rendered target.
- One direction per view: left-to-right for journeys, top-to-bottom for hierarchy.
- Direct relationship labels matching arrow direction, protocols on inter-process edges; short responsibility text in nodes, details in notes or the ledger.
- Consistent names and positions across related views, especially as-is/to-be pairs; labeled official icons only when they aid recognition, never icon-only nodes.
- Every standalone view has a legend, diagram type, scope, state, and expanded acronyms.
- Icons, gradients, animation, and specialized renderers are conditional tools, never a substitute for content.
- Keep important paths continuous and minimize crossings, bends, and reverse-flow edges; when routing tangles, labels must shrink, or the primary path stops dominating, filter or split instead of enlarging the canvas.
- Presentation frames are 16:9 unless the user names another target, with title, takeaway, and primary path legible at final size; engineering views may be large or interactive but need a clear start point and navigable links.

## Output

Adapt to an existing layout. For a new atlas:

```text
docs/diagrams/
  README.md                 # audience routes, view catalog, freshness, known gaps
  evidence.md               # model/evidence ledger and contradictions
  source/                   # editable .dsl/.d2/.dot/.puml/.mmd sources and shared style/config
  rendered/                 # reviewed SVGs; PNG/PDF only where the consumer needs them
  presentation/             # optional storyboard, notes, PPTX/PDF, or progressive frames
```

Align source and rendered basenames; prefer SVG; add raster or presentation formats only for a real consumer; do not commit exports CI builds. `README.md` holds "Start here" links per audience, a one-paragraph system story, a catalog (view, audience, question, state, source, rendered artifact, evidence and freshness), navigation between zoom levels and from nodes to source where supported, known unknowns, contradictions, omitted categories, blocked runtime proof, and exact render and validation commands with the pinned tool version. Every rendered view or Markdown wrapper carries:

```text
Title: <diagram type and scope>
Audience: <who should use it>
Question: <one question answered>
State: as-is | to-be | delta
Takeaway: <one sentence>
Evidence snapshot: <git revision, date, and runtime environment if applicable>
Confidence: <status summary and link to evidence ledger>
```

Link the atlas from `docs/architecture.md` or its canonical equivalent instead of duplicating prose and diagrams across documents.

## Procedure

1. Frame scope, audience, focus, state, delivery, and renderer, and list the questions the atlas must answer.
2. Inventory actors, boundaries, runtimes, stores, topics, contracts, deployment nodes, entry points, owners, and critical journeys; build the ledger, flagging stale docs, contradictions, inferred edges, proposed elements, and missing runtime proof.
3. Fix IDs, responsibilities, technology, and relationship semantics once; write the view plan and choose the leadership story and trace depth.
4. Author views with source links, evidence metadata, and per-audience takeaways, then render every source with the real pinned renderer into SVG and the requested presentation artifacts.
5. Inspect the rendered output at its documentation and presentation sizes and iterate layout, labels, and view boundaries; valid syntax is only the first check.
6. Walk one critical journey independently from diagram to source and, when available, runtime evidence, hunting reversed arrows, hidden state, missing trust or failure boundaries, mixed current and future state, and unsupported claims.
7. Update the index and canonical link; remove superseded duplicate diagrams only after preserving their unique evidence and inbound links.

## Acceptance Gate

Report the atlas complete only after every applicable check runs:

- Truth: every important node and edge maps to the ledger; one journey was walked from entry point to durable state or external effect; statuses are not conflated; runtime claims name their environment and evidence, and missing runtime proof stays a blocker; stores, async boundaries, external effects, trust changes, and material failure and recovery paths are visible where relevant.
- Semantics: each view has its header fields, legend, and one scope; types, responsibilities, technology, direction, labels, and protocols read without narration; dependency, invocation, data-flow, and deployment semantics are not mixed ambiguously; names and IDs match across views, and proposed content cannot pass for current.
- Rendering: every source compiles with the pinned renderer into its artifact; each rendered SVG/PNG/PDF/PPTX was opened or screenshotted and inspected (source text is not a visual pass); no clipped nodes, overlaps, orphan edges, broken glyphs, tiny text, unexplained symbols, or off-canvas content; the primary path and hierarchy are obvious; leadership frames read at 16:9 without zoom and developer views have a start point and navigation; contrast is adequate, meaning survives grayscale and color-deficient viewing, and a text summary covers each diagram.
- Integration: index, source, navigation, and canonical links resolve; source/rendered pairs and freshness match the checked-out revision; no view lacks a distinct question; the render command is reproducible and generated artifacts follow repository policy.

When a renderer, runtime environment, telemetry source, or required evidence is unavailable, mark that check `BLOCKED` with the concrete unblock path; never substitute a mock, fixture, hand-edited screenshot, or unverified diagram.

## Report

Report Changed (full paths to the ledger, sources, rendered and presentation artifacts, index, and canonical link); the audience, question, and takeaway of each retained view; evidence counts by status with material contradictions; Checks (renderer commands, the trace walk, link checks, and visual-inspection targets as `passed`, `failed`, `not run`, or `BLOCKED`); Status (`COMPLETE`, `IMPLEMENTED BUT UNVERIFIED`, or `BLOCKED`); Blockers (unresolved evidence or tooling gaps, whether a human must act, and the unblock path); and the next command, usually `arch-roadmap`, `verify-readiness`, or `workflow-boss`.
