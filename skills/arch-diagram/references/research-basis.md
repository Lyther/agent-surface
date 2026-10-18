# arch-diagram research basis

Companion reference for `arch-diagram`. The findings behind its decision standard, trace and dataflow
contracts, tool selection and visual system, with their primary sources. The rules themselves are in
`SKILL.md`.

## Findings

- C4 separates an architecture model from audience-specific views and explicitly says to use only diagram levels that add value; context and container views are enough for many teams.
- C4 notation is tool-independent. Standalone diagrams need a title, scope, legend, explicit element types and responsibilities, and directional relationships labeled with intent and protocol where relevant.
- C4 modelling keeps one graph of elements and relationships and derives multiple views, reducing copy-paste drift and enabling queries, filtering, and alternative visualization.
- arc42 runtime views select a few architecturally relevant scenarios, including important use cases, critical external interfaces, operations, and error paths. Detailed scenarios are valuable only when the audience needs them.
- OpenTelemetry traces model an end-to-end execution as correlated spans with hierarchy, timing, status, attributes, events, and links. Static call relationships must not be presented as an observed runtime trace.
- Data-flow diagrams become materially more useful when they show the data, process, store, external entity, direction, and trust boundary rather than generic "uses" arrows.
- Empirical graph-reading work identifies path continuity and edge crossings as important cognitive costs. Split or filter a graph before shrinking labels or accepting tangled routing.
- Accessible diagrams use sufficient contrast, labels and line/shape semantics in addition to color, and a text alternative for the information conveyed.
- Current diagram-as-code tools have different strengths: model/view navigation and perspectives, polished compositional boards, computed graph layout, rich runtime notation, or low-friction Markdown portability. Tool choice follows the artifact, audience, and repository lifecycle.

## Primary references

- C4 diagrams, notation, checklist, and tooling: <https://c4model.com/diagrams>, <https://c4model.com/diagrams/notation>, <https://c4model.com/diagrams/checklist>, <https://c4model.com/tooling>
- arc42 runtime view: <https://docs.arc42.org/section-6/>
- OpenTelemetry traces: <https://opentelemetry.io/docs/concepts/signals/traces/>
- OWASP data-flow and trust-boundary guidance: <https://owasp.org/www-community/Threat_Modeling_Process>
- Empirical graph-layout usability: <https://doi.org/10.1023/A:1016344215610>, <https://doi.org/10.1057/palgrave.ivs.9500013>
- W3C contrast and non-color guidance: <https://www.w3.org/WAI/perspectives/contrast.html>, <https://www.w3.org/WAI/fundamentals/accessibility-principles/>
- Structurizr views and navigation: <https://docs.structurizr.com/ui/diagrams/>
- D2 composition and exports: <https://d2lang.com/tour/composition/>, <https://d2lang.com/tour/exports/>
- Mermaid configuration and architecture syntax: <https://mermaid.js.org/config/configuration.html>, <https://mermaid.js.org/syntax/architecture.html>
- Graphviz layout engines: <https://graphviz.org/docs/layouts/>
