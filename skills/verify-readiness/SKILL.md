---
name: verify-readiness
description: "Certify scoped readiness claims with severity-first evidence — design kills block PASS."
---

## OBJECTIVE

Certify or reject high-level readiness claims with real, scoped proof.

Use when anyone wants to say a product, subsystem, MCP, adapter, harness, deployment path, or release is `stable`, `production-ready`, `release-ready`, `deployment-ready`, `E2E passed`, `100% implemented`, `all features supported`, or equivalent.

Do not use for ordinary narrow edits. Use `verify-test`, `verify-coverage`, `verify-edge`, `verify-performance`, `qa-review`, `qa-trace`, or `verify-prove` for narrower proof. `verify-readiness` is the final gate for the declared support matrix — after discrimination, prove, and a design/security pass when those apply.

## CORE RULE

Readiness is scoped and severity-ordered.

A PASS means:

- The support matrix is complete and honest.
- Every supported path has real proof through the actual entry point and dependency path.
- No open Critical or High design, security, or production-break findings remain in scope.
- Unsupported / unimplemented / blocked / substitute-backed / not-run paths are excluded from the claim or listed as blockers.
- The shipped artifact, generated output, installed service, or deployed revision is what was exercised.
- Hygiene items (docs nits, low-severity style, minor permission polish) never outrank design kills.

If any of those are false, the verdict is FAIL or BLOCKED — not PASS.

Narrowing the claim is allowed only when the narrowed claim is stated explicitly and matching docs/configs do not still overclaim. Narrowing is not a way to hide a known production-break bug in the original claim’s surface.

## INPUTS

- Claim under test (exact sentence).
- Scope: repo path, subsystem, product, target, service, adapter, MCP, command, or deployment.
- Git identity: branch, commit, dirty status, submodule/pack pins.
- Support matrix: runtimes, targets, OS, features, protocols, install modes, config formats, deployment modes, dependency paths.
- Artifact identity when applicable.
- Required real dependencies; missing → UNKNOWN/BLOCKED, not guessed.
- Evidence: `verify-prove`, `verify-coverage`, `verify-test`, `qa-trace` / `qa-review`, build/deploy logs, manifests, docs.

## SEVERITY GATE (NON-NEGOTIABLE)

Use the same severity language as `qa-trace`:

| Severity | Examples |
|----------|----------|
| Critical | auth bypass, data loss/corruption, RCE, cross-tenant access, destructive write, install that clobbers user state |
| High | strong business-logic bypass, exploitable race, sensitive leakage, false-success on trust boundaries |
| Medium | bounded abuse, fragile defense, validation gaps |
| Low / Info | hygiene, docs polish, limited smell |

Before any PASS:

1. Run or ingest a hostile design/security pass on the scoped surface (`qa-trace` preferred; `qa-review --focus security,logic` acceptable if equivalent evidence exists).
2. Any open Critical or High finding in scope → FAIL (or BLOCKED only if proof literally cannot run and the claim is not asserted).
3. Medium findings must be fixed, explicitly deferred with owner/date, or must force claim narrowing.
4. Low/Info never decide PASS alone and must not dominate the report over kill findings.

If no design/security pass was run, readiness-critical claims default to `NOT_RUN` → cannot PASS.

## PROTOCOL

### Phase 1: Define The Claim Boundary

Write the claim in one sentence. Rewrite as a measurable support matrix.

- Bad: `Synapse is production-ready.`
- Good: `Synapse is production-ready for local macOS user installs through synapse-bridge, its autostarted sidecar, and generated MCP configs for the verified targets listed below.`

Classify each matrix item: `supported` | `unsupported` | `deferred` | `blocked`.

Absolute language (`all`, `100%`, `complete`, `production-ready`) requires an explicit matrix. Hidden exclusions are FAIL.

### Phase 2: Source And Scope Integrity

- Record working tree; identify unrelated dirty files.
- Generated files, lockfiles, schemas, registries, docs consistent with the claim.
- No production placeholders, `todo!()`, hard-coded success, forced pass, disabled gate, or no-op required path.
- Inventory every substitute for a boundary the claimed path calls (mock, fake, stub, spy, emulator, in-memory service, recorded service response, test mode, or a renamed equivalent), including those inside tests. Each needs a `SUBSTITUTE_JUSTIFICATION`, and its result is excluded from readiness evidence for the boundary it replaces. Constructed inputs that the real component reads are inputs, not substitutes.
- Any required real dependency, data path, or external effect replaced by a substitute keeps that matrix item `BLOCKED` until the real path runs. A suite called `e2e_test`, `integration`, `real`, or equivalent does not change the classification.
- Dependency risk evidence when deps changed.
- Repo checks appropriate to the surface — green tests are evidence for tested gates only.

### Phase 3: Design And Production-Break Hunt

This phase is mandatory and ordered before hygiene.

Hunt for:

- Wrong architecture or trust-boundary placement that makes correct local tests irrelevant.
- Silent wrong success (operation reports OK while world state is wrong).
- Features claimed supported but unimplemented, stubbed, or host-incompatible.
- Merge/install paths that can destroy user config or data.
- Concurrency/idempotency holes on claimed multi-agent or multi-client use.
- Security sinks: authz gaps, secret leakage, unsafe defaults.

Catastrophic failure catalog:

| Class | Kill question |
|-------|---------------|
| Data loss / corruption | Can one normal or retry path destroy, duplicate, or silently corrupt user state? |
| Auth / tenant break | Can one user, agent, plugin, or token cross an authorization or tenancy boundary? |
| Unbounded cost / resource burn | Can input-driven work (a loop, retry, queue, model call, or autoscale path) grow without any bound? |
| Single point of failure | Does one dependency, config file, queue, host, key, or human action stop every supported path? |
| Unobservable failure | Can the system be broken while health checks, logs, metrics, or user-visible status still report success? |
| No rollback / recovery | If rollout, install, migration, or config merge fails, is there a tested path back to the previous working state? |
| Destructive automation | Can an automated agent/tool delete, overwrite, publish, spend, deploy, or notify without the intended approval and scope controls? |
| Irreversible external effect | Can the workflow send email, mutate production data, charge money, rotate secrets, or disclose data without replay-safe evidence and approval? |

Treat a `yes` you can show on a Critical/High surface (an input, a trace, or a missing control on a reachable path) as a candidate design finding. Prove it is mitigated, narrow the claim, or FAIL.

Record findings with severity + confidence. Critical/High open → FAIL.

Do not spend the bulk of the report on Low docs/style while Critical/High remain unchecked.

### Phase 4: Artifact Or Installed-System Identity

When the claim involves shipped software, distribution, installability, generated outputs, deployment, or user-facing execution, require `verify-prove` (or equivalent evidence meeting prove’s hard rules).

Record build command, commit, artifact path, digest/checksum, configs emitted/merged, required/forbidden files, clean-room vs source-tree.

Mutable tags, source-only runs, or hidden dev overrides cannot prove release/deployment/production readiness.

### Phase 5: Real Acceptance Matrix

For every `supported` item, at least one real acceptance path through the actual user/host entry point:

- Command/scenario, cwd/environment, real entry point, real implementation path.
- Real dependencies used, or item BLOCKED.
- Observable expected result (file, response, DB row, config, service, UI state).
- Exit code, duration, evidence ref.

For target matrices, every claimed target must be covered. A representative target is not enough for `all targets`.

Prefer journeys and outcomes from `verify-prove` over transport-only checks.

### Phase 6: Suite Discrimination (When Tests Underwrite The Claim)

If the readiness claim rests on “tests prove it,” require `verify-coverage` discrimination evidence for Critical/High surfaces (surviving fault = FAIL). Coverage percentage alone is insufficient.

### Phase 7: Security, Operations, And Failure Paths

Run controls that trace to actual assets and failure impact:

- Secret scan/redaction on changed/generated/shipped artifacts.
- Auth/authz when identity is in scope.
- File permissions on tokens/DBs/sockets/service files/configs.
- Restart/update/rollback/cleanup when lifecycle is claimed.
- Health/readiness when a service is claimed usable.
- Short concurrency when concurrent use is claimed.
- Error-path proof for expected dependency failures.
- Docs/README drift for supported vs unsupported features.

These are necessary but not sufficient. A clean secret scan does not override an open Critical design finding.

### Phase 8: Claim Audit

List major claims from peers, docs, PR/release text, prior reports. Mark each:

- `PROVEN` | `FALSE` | `NOT_RUN` | `BLOCKED`

Any readiness-critical `FALSE`, `NOT_RUN`, or `BLOCKED` prevents PASS unless the claim is honestly narrowed and docs/configs match.

### Phase 9: Verdict

Exactly one:

- `PASS`: supported matrix proven; no open Critical/High in scope; claims match evidence; docs/configs do not overclaim.
- `FAIL`: implementation, artifact, design, docs, matrix, or evidence contradicts the claim — including open Critical/High.
- `BLOCKED`: concrete missing dependency/credential/environment/approval/artifact prevents completion.

Never use `mostly ready`, `core complete`, or `production-ready except`. Narrow the scope or report the blocker.

## OUTPUT ARTIFACTS

Prefer:

```text
.agent-surface/readiness/<target-or-scope>/<timestamp>/readiness.json
.agent-surface/readiness/<target-or-scope>/<timestamp>/summary.md
```

Minimum JSON shape:

```json
{
  "schema_version": "readiness.v2",
  "claim": "",
  "scope": "",
  "git": {
    "branch": "",
    "commit": "",
    "dirty": true,
    "dirty_explanation": ""
  },
  "support_matrix": [
    {
      "id": "",
      "status": "supported|unsupported|deferred|blocked",
      "proof_status": "proven|failed|not_run|blocked",
      "evidence": [],
      "blocker": ""
    }
  ],
  "design_security": {
    "source": "qa-trace|qa-review|equivalent",
    "open_critical": 0,
    "open_high": 0,
    "findings": []
  },
  "discrimination": {
    "status": "proven|failed|not_run|not_applicable",
    "evidence": ""
  },
  "checks": [
    {
      "name": "",
      "cmd": "",
      "cwd": "",
      "exit_code": 0,
      "status": "passed|failed|not_run",
      "evidence_ref": ""
    }
  ],
  "artifact_identity": [],
  "acceptance": [],
  "security_ops": [],
  "claim_audit": [
    {
      "claim": "",
      "status": "PROVEN|FALSE|NOT_RUN|BLOCKED",
      "evidence": "",
      "action": ""
    }
  ],
  "verdict": "PASS|FAIL|BLOCKED",
  "blockers": [
    {
      "human_in_the_loop_required": false,
      "unblock_path": ""
    }
  ]
}
```

## CHAT OUTPUT

```markdown
Readiness: PASS|FAIL|BLOCKED
Claim: <exact scoped claim>
Scope: <repo/subsystem/target/deployment>

Design/security gate:
- source: qa-trace|qa-review|...
- open Critical: <n> — open High: <n>
- blockers: <none or list>

Supported matrix:
- <id>: proven|failed|not run|blocked — <evidence or blocker>

Discrimination: proven|failed|not run|n/a — <evidence>

Checks:
- `<command or scenario>` -> passed|failed|not run

False or unproven claims:
- <claim>: FALSE|NOT_RUN|BLOCKED — <why>

Blockers:
- <blocker>; human-in-the-loop: yes|no; unblock: <concrete action>
```

## HARD RULES

1. Vague scope → BLOCKED until the matrix is explicit.
2. Open Critical/High in scope → FAIL (cannot PASS via hygiene greens or claim narrowing that still markets the broken surface).
3. No design/security pass → cannot PASS production-ready / stable / E2E / deployment-ready claims.
4. Do not certify a substitute-backed run as acceptance of the boundary it replaces, regardless of its label or location. Every necessary substitute requires the justification record.
5. Do not certify release/install/deployment from source-tree-only runs.
6. Do not certify `all targets` / `all features` / `100%` unless every supported item is listed and proven.
7. Do not hide blockers in notes.
8. Do not let Low/Info findings dominate the report while Critical/High are unchecked or open.
9. Prefer honest narrower claims only when docs/configs/release text are updated to match.
10. `tests passed` / `build passed` / `local smoke` are not production readiness.
