---
name: verify-readiness
phase: verify
description: "Certify scoped stable, production-ready, E2E, deployment-ready, or fully-supported claims with real evidence."
---
## OBJECTIVE

Certify or reject high-level readiness claims with real, scoped proof.

Use this command when anyone wants to say a product, subsystem, MCP, adapter, benchmark harness, deployment path, or release is `stable`, `production-ready`, `release-ready`, `deployment-ready`, `E2E passed`, `100% implemented`, `all features supported`, or equivalent.

Do not use this for ordinary narrow edits. Use `verify-test`, `verify-edge`, `verify-performance`, `qa-review`, or `verify-prove` for narrower proof. `verify-readiness` is the final gate that decides whether a broad readiness claim is true for the declared support matrix.

## CORE RULE

Readiness is scoped. A PASS means:

- The declared support matrix is complete and honest.
- Every supported path has real proof through the actual entry point and dependency path.
- Unsupported, unimplemented, blocked, mocked, fixture-only, or not-run paths are excluded from the support claim or listed as blockers.
- The shipped artifact, generated output, installed service, or deployed revision is the thing that was exercised.

If any of those are false, the verdict is FAIL or BLOCKED, not PASS.

## INPUTS

Collect these before running checks:

- Claim under test: exact sentence or release note wording being certified.
- Scope: repo path, subsystem, product, target, service, adapter, MCP, command, or deployment.
- Git identity: branch, commit, dirty status, staged status, and relevant submodule or external pack pins.
- Support matrix: every runtime, target, OS, model, feature, protocol, install mode, config format, deployment mode, and dependency path claimed as supported.
- Artifact identity when applicable: bundle, binary, package, image digest, generated output directory, installer, service file, config file, checksum, version, and build command.
- Required real dependencies: local services, external APIs, credentials, databases, queues, browsers, devices, hosts, or human approval.
- Existing evidence: test logs, build logs, workflow artifacts, reviewer artifacts, `verify-prove` output, deployment logs, generated manifests, and docs.

Missing input is not a reason to guess. Mark it UNKNOWN, then decide whether it blocks the claim.

## PROTOCOL

### Phase 1: Define The Claim Boundary

Write the claim in one sentence. Then rewrite it as a measurable support matrix.

Examples:

- Bad: `Synapse is production-ready.`
- Good: `Synapse is production-ready for local macOS user installs through synapse-bridge, launchd sidecar, and generated MCP configs for the verified targets listed below.`

For each support item, classify it:

- `supported`: must be proven.
- `unsupported`: must not appear in docs, generated configs, release notes, or acceptance claims as supported.
- `deferred`: known future work, not part of PASS.
- `blocked`: intended support exists, but proof needs a missing dependency, credential, environment, approval, or external condition.

If the claim uses absolute language such as `all`, `100%`, `complete`, or `production-ready`, the support matrix must be explicit. Hidden exclusions are a FAIL.

### Phase 2: Source And Scope Integrity

Check that the reviewed source is coherent before proving runtime behavior:

- Working tree status is recorded.
- Unrelated dirty files are identified and excluded from the claim or treated as risk.
- Generated files, lockfiles, schemas, registry entries, and docs are consistent with the claim.
- No production path contains placeholders, `todo!()`, `unimplemented!()`, TODO/FIXME standing in for required behavior, hard-coded success, forced pass, disabled gate, or no-op implementation.
- No mock, fake, fixture, synthetic, recorded, or substitute execution is used outside tests as acceptance proof.
- Test-only doubles remain under tests, fixtures, local emulators, contract fixtures, failure injection, or explicitly labeled diagnostic work.
- Dependency additions or updates have proportionate risk evidence: maintenance, license, advisories, install scripts, native binaries, transitive footprint, compatibility, and lockfile impact.

Run the repo's narrow and broad checks appropriate to the touched surface. Green tests are evidence for tested gates only; they are not the readiness verdict.

### Phase 3: Artifact Or Installed-System Identity

When the claim involves shipped software, distribution, installability, generated target outputs, deployment, or user-facing execution, prove the exact thing that users run.

Use `verify-prove` when there is a release artifact, package, image, bundle, generated output, installer, or live service. Record:

- Build command and source commit.
- Artifact or generated output path.
- SHA256, image digest, package version, service identity, or installed binary path.
- Config files emitted or merged.
- Required files present and forbidden files absent.
- Whether the proof used source checkout state, local developer caches, generated dist files, or a clean-room install.

Mutable tags, source-tree-only runs, or hidden dev overrides cannot prove release, deployment, or production readiness.

### Phase 4: Real Acceptance Matrix

For every `supported` matrix item, run at least one real acceptance path through the actual user or host entry point.

Acceptance proof must include:

- Command or scenario name.
- CWD or target environment.
- Entry point invoked by a real user, host, service, adapter, installer, API, CLI, MCP client, or deployment.
- Real implementation path, not a mock-only or fixture-only substitute.
- Required dependencies actually used, or the item marked BLOCKED.
- Observable expected result: output file, response, DB row, message, generated config, installed service, running process, UI state, report, or external side effect.
- Exit code, duration, and relevant output reference.

For target matrices, every target claimed as supported must be covered. A representative target is not enough for an `all targets` claim.

### Phase 5: Security, Operations, And Failure Paths

Run controls that are relevant to the scoped claim:

- Secret scan or targeted secret inspection for changed/generated/shipped artifacts.
- Secret redaction in logs, reports, MCP memory, evidence files, and generated configs.
- Auth/authz checks when identity or permissions are involved.
- File permissions for tokens, DBs, sockets, service files, caches, and generated configs.
- Restart, update, rollback, or cleanup path when install/deploy/service lifecycle is claimed.
- Health/readiness checks when a service is claimed usable.
- Short concurrency or multi-client smoke when concurrent agents, requests, workers, or sessions are claimed.
- Error-path proof for expected dependency failures.
- Docs and README drift check for supported/unsupported/deferred features.

Do not add irrelevant compliance ceremony. Controls must trace to the actual assets, users, dependencies, and failure impact in scope.

### Phase 6: Claim Audit

List the major claims made by peers, docs, PR text, release notes, or prior reports. Mark each one:

- `PROVEN`: evidence exists from this run or a bound artifact.
- `FALSE`: evidence contradicts the claim.
- `NOT_RUN`: not checked.
- `BLOCKED`: cannot be checked without named human action, credential, environment, approval, or external condition.

Any readiness-critical `FALSE`, `NOT_RUN`, or `BLOCKED` item prevents PASS unless the claim is narrowed to exclude it.

### Phase 7: Verdict

Use exactly one verdict:

- `PASS`: all supported matrix items have real proof, high-level claims match evidence, no readiness blocker remains, and docs/configs do not overclaim.
- `FAIL`: the implementation, artifact, docs, support matrix, or evidence contradicts the claim.
- `BLOCKED`: proof cannot be completed because a concrete external dependency, credential, environment, human approval, or missing artifact is required.

Never use `mostly ready`, `core complete`, `production-ready except`, or similar wording. Narrow the scope or report the blocker.

## OUTPUT ARTIFACTS

Write a readiness report when the repo or workflow has an evidence directory. Prefer:

```text
.agent-surface/readiness/<target-or-scope>/<timestamp>/readiness.json
.agent-surface/readiness/<target-or-scope>/<timestamp>/summary.md
```

If no evidence directory is appropriate, include the same information in chat.

Minimum JSON shape:

```json
{
  "schema_version": "readiness.v1",
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

Use this concise format:

```markdown
Readiness: PASS|FAIL|BLOCKED
Claim: <exact scoped claim>
Scope: <repo/subsystem/target/deployment>

Supported matrix:
- <id>: proven|failed|not run|blocked — <evidence or blocker>

Checks:
- `<command or scenario>` -> passed|failed|not run

False or unproven claims:
- <claim>: FALSE|NOT_RUN|BLOCKED — <why>

Blockers:
- <blocker>; human-in-the-loop: yes|no; unblock: <concrete action>
```

## HARD RULES

1. A readiness PASS must be scoped. If the scope is vague, the verdict is BLOCKED until the support matrix is explicit.
2. Do not certify a path that used mocks, fakes, fixtures, synthetic data, local substitutes, recorded responses, or renamed equivalents as real acceptance proof.
3. Do not certify a release, install, or deployment claim from a source-tree-only run.
4. Do not certify `all targets`, `all features`, or `100% implemented` unless every supported item is listed and proven.
5. Do not hide blockers in notes. Any blocker that prevents the claim is part of the verdict.
6. Do not broaden a narrow pass. `tests passed`, `build passed`, and `local smoke passed` are useful evidence but not production readiness by themselves.
7. Prefer narrowing the claim over forcing a PASS. If only macOS local install was proven, say exactly that.
