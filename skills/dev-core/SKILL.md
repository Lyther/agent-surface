---
name: dev-core
description: "Implement the smallest runnable architectural spine after an independent RED spec, then stop before feature breadth."
---

## Objective

Turn an accepted architecture and an independently authored RED spec into one production-shaped vertical slice that proves the real entry point, central ownership, and required dependency or data path, without building the rest of the product around them. Use it for architecture-heavy work where an early implementation decision shapes later development; skip it for localized features, routine fixes, and mature code paths with established ownership and boundaries.

## Position

```text
arch-roadmap  (family A)
  -> dev-spec (fresh family B)
  -> dev-core (family A, frontier model, xhigh or max when justified)
  -> pause
  -> dev-feature (family A at proportionate effort, or family C)
```

Families are relative roles, not vendors. Prefer a different model family for `dev-spec` so it challenges family A's assumptions; diversity reduces correlated blind spots but never replaces requirement-derived expectations, independent oracles, or real execution. Use a frontier model at `xhigh` by default when the runtime supports it and `max` only for unusually hard or expensive-to-reverse decisions; otherwise use the highest validated effort available. Report the actual model and effort, or `unknown`, never assumed compliance.

## Input Gate

Require:

- an accepted roadmap or equivalent architecture evidence;
- a fresh `dev-spec` result whose expectations come from the user outcome, a standard, a public contract, or another independent oracle;
- a RED test set scoped to the first runnable core slice;
- the current maturity target and the real entry point to exercise.

The first `dev-spec` must not pre-install a future feature suite that `dev-core` is not meant to satisfy: if normal repository gates would stay red after the core slice, return to `dev-spec` to narrow the executable contract. Later feature slices may repeat `dev-spec` before `dev-feature`.

## Rules

- Treat the accepted spec and its RED tests as immutable: implement against them and never weaken, broaden, delete, skip, or rewrite them. If the spec is materially wrong or contradicts the accepted architecture, stop and return the conflict to `dev-spec` or `ops-ask`.
- Keep the repository stack, dependencies, and local patterns unless the accepted architecture explicitly changes them.
- Use real production paths: no placeholder functions, TODO implementations, fake dependencies, or scaffolding that only compiles.
- Preserve unrelated dirty work.

## Procedure

1. Read only the governing evidence: architecture boundaries, the roadmap's first vertical slice, the RED spec, the real entry point, and the smallest set of affected files.
2. Search the repository, framework, standard library, and installed dependencies for the capability before building it.
3. Establish only the entry point, central domain owner, necessary side-effect boundary, and real dependency or data path the slice requires.
4. Make the selected journey run end to end, adding no extension point, provider layer, configuration axis, compatibility path, or background mechanism without a present requirement.
5. Make the focused RED test pass, run the cheapest relevant repository check, and exercise the real entry point with the real primary dependency when available.
6. Subtract once: remove any new layer, helper, state, or option the proven slice does not exercise or need.
7. Stop. Out of scope: feature breadth, secondary journeys, polish, generalized hardening, optional integrations, second providers, plugin systems, hypothetical callers, compatibility or migration machinery without a current consumer, production, enterprise, scale, observability, or security systems beyond the stated maturity and threat model, exhaustive edge suites, comprehensive docs, cleanup outside the slice, and detailed instructions for implementing the remaining features.

## Output

Pause after the core slice passes and return only this handoff:

```markdown
## Core Slice
- Runnable path:
- Authoritative boundaries:
- Deliberately absent:

## Proof
- Focused RED-to-green check:
- Real entry-point scenario:
- Model family / effort: known value or unknown

## Delivery
- Changed: full paths
- Status: COMPLETE | IMPLEMENTED BUT UNVERIFIED | BLOCKED
- Blockers: unresolved items and concrete unblock path only

## Next
`dev-feature` for the next accepted behavior slice.
```

Do not commit, publish, or start `dev-feature` unless the user separately requests that workflow.
