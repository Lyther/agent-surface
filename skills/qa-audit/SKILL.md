---
name: qa-audit
description: "Audit a project or system across code, architecture, security, dependencies, tests, operations, and repository integrity."
---

## Objective

Perform an evidence-backed audit at the depth the project's maturity, exposed risks, and requested claim justify; security is one audit domain, not a separate mandatory ceremony. `qa-audit` is broad and read-only: use `qa-review` for a focused review of a current diff and `qa-trace` for deep root-cause, dataflow, race, or exploitability tracing. Route accepted remediation through the appropriate development or operations workflow.

## Input

`qa-audit [target] [--domain architecture|code|security|dependencies|tests|operations|repository|all] [--depth quick|standard|deep] [--maturity prototype|mvp|core|usable|production|business|auto]`

Defaults: `--domain all --depth standard --maturity auto`.

## Scope Gate

Before running tools, resolve the target tree, artifact, service, or deployment; the maturity and claim being assessed; the user-visible and externally reachable surfaces; applicable repository policy, threat boundaries, and acceptance evidence; and exclusions and unavailable real dependencies.

Apply production, enterprise, compliance, or supply-chain requirements to a prototype or MVP only when its actual data, exposure, or contract requires them. Never lower the bar for auth, secrets, destructive effects, money, or sensitive data merely because the project is early.

## Domains

- Architecture: does the design serve the current outcome or preserve a disproven premise? Are ownership, state, dataflow, and failure boundaries clear? Are abstractions, services, compatibility layers, and configuration axes earned? Is there one source of truth, or duplicated authority and synchronization?
- Code: trace primary behavior and failure paths through real entry points; find correctness defects, swallowed errors, unsafe state transitions, races, leaks, and user-visible regressions; flag duplicate implementations, dead paths, speculative frameworks, and hand-built substitutes for proven local or standard capabilities.
- Security: build a threat model from real assets, actors, trust boundaries, and reachable inputs; review authentication, authorization, secrets, injection, data exposure, unsafe defaults, destructive actions, and dependency risk where applicable; reproduce findings safely when possible; rate severity by reachability, prerequisites, impact, and confidence. Require SBOMs, provenance, SAST suites, KEV/EPSS correlation, signing, and compliance controls only when the release, deployment, customer, or regulatory contract calls for them.
- Dependencies: identify unused, duplicated, vulnerable, abandoned, unpinned, or unjustifiably heavy dependencies; verify current advisories and maintenance from authoritative sources before making time-sensitive claims; compare a proposed dependency with the existing stack and a small local implementation, including license, install scripts, native code, transitive footprint, compatibility, and lockfile impact.
- Tests: check that tests discriminate real faults and use independent oracles; reject unjustified substitutes, tautological assertions, skip/xfail drift, mock-only boundary proof, and tests that pass on the pre-fix tree; separate diagnostic test results from real integration, E2E, acceptance, and readiness evidence.
- Operations: review configuration, observability, deployment, migration, rollback, recovery, idempotency, resource limits, and failure visibility at the maturity actually claimed; treat an unavailable real environment as `BLOCKED`, not passed.
- Repository: find dead files, temporary artifacts, stale scripts, generated debris, broken references, misleading docs, obsolete configs, duplicate assets, and ownership ambiguity; distinguish tracked product artifacts from ignored local state and generated outputs.

## Method

1. Inventory the target at low resolution.
2. Select only applicable domains and tools.
3. Trace the highest-impact surfaces first.
4. Confirm each finding against source, runtime evidence, or an authoritative external source.
5. Remove duplicates and non-findings; do not inflate severity.
6. Report proof gaps separately from defects.

Read-only probes may run in parallel under one synthesis owner. Do not mutate the target, install remediations, weaken gates, or create a findings file unless the user requests it.

## Verdict

- `FAIL`: at least one confirmed Critical or High issue in the audited claim, or evidence shows the claim is false.
- `PASS`: no open Critical or High issue in the completed scope and the required real evidence exists.
- `BLOCKED`: required target access, dependency, environment, or evidence is unavailable.
- `ADVISORY`: no pass/fail claim was requested; report severity-ranked findings and gaps.

## Output

```markdown
## Audit Scope
- Target:
- Maturity and claim:
- Domains:
- Evidence run:
- Not run / blocked:

## Findings
### [Critical|High|Medium|Low] Title
- Evidence:
- Impact:
- Recommendation:

## Proof Gaps
- ...

## Verdict
PASS | FAIL | BLOCKED | ADVISORY
```
