---
name: verify-prove
description: "Prove shipped bits under real user journeys, robustness, and adversary pressure."
---

## OBJECTIVE

Prove the exact bits a user or cluster will run — not a repo demo.

`verify-test` proves the suite. `verify-prove` proves artifact identity, clean-room install, real journeys, outcomes in the world, robustness, UX adequacy, and adversary resistance on the shipped thing.

## CORE RULE

HTTP 200 / exit 0 on a happy path is smoke, not proof.

PASS requires all of:

- Frozen identity of the shipped artifact (digest/checksum), not a mutable tag.
- Clean-room boot from that artifact (no source-tree or hidden dev cache dependency).
- Real user/host entry points for every journey claimed in scope.
- Real implementation, dependencies, data paths, and external effects throughout every evidence-bearing journey; no substitutes under any label.
- Environment outcomes verified (DB/file/config/process state), not agent or UI narration alone.
- Robustness and adversary checks relevant to the claim — not optional footnotes.
- Multi-trial evidence when the path is nondeterministic.

FAIL if identity is ambiguous, the flow needs the checkout to work, a required path is substituted, outcomes were not checked, or Critical/High robustness/adversary gaps remain in scope.

## INPUTS

- Claimed journeys and support matrix slice under proof.
- Artifact: image digest, binary checksum, bundle hash, generated output identity, installer, or installed service path.
- Real dependencies required (services, credentials, hosts). Missing → `BLOCKED`, not guessed.
- Prior `verify-coverage` / `verify-test` evidence when the suite is part of the trust story.

## PROTOCOL

### Phase 1: Freeze Identity

1. Record git SHA, version/build string, image digest or binary/bundle checksum, schema/protocol/mode IDs when applicable.
2. Reject mutable references (`latest`, floating branch installs) as proof identity.
3. If the bundle/manifest/artifact does not exist, stop with FAIL or BLOCKED.

### Phase 2: Artifact-First Clean Room

1. Install/unpack/boot only from the shipped artifact.
2. Fresh environment: no mounted source tree, no developer caches, no local override files that users would not have.
3. Wait on readiness/health signals — no fixed sleeps as the sole gate.
4. If the flow only works with the repo checkout, mark FAIL.
5. Inventory every component, dependency, data source, and external effect in the journey. Any mock, fake, fixture, stub, spy, emulator, in-memory replacement, monkeypatch, recorded/synthetic response, sandbox imitation, test mode, or renamed equivalent makes the journey non-E2E and ineligible for PASS.

### Phase 3: Real Journeys (User Experience)

Define journeys as user-visible goals, not internal API tours.

For each journey in scope:

1. Name the persona and goal (e.g. “operator installs MCP and sees tools in host”).
2. Invoke the real entry point (CLI, installer, UI, MCP client, HTTP API as customers use it).
3. Assert UX adequacy with an explicit rubric — not only transport success:

| UX check | Pass means |
|----------|------------|
| Goal completed | User-visible success state achieved |
| Feedback honest | Errors are actionable; no false success |
| No dead ends | Required next step is available or clearly blocked |
| No privileged leakage | Secrets/internal paths not shown in user-facing output |
| Time bound | Completes within the time the requirement states, or fails visibly instead of hanging |

4. Cover the real matrix: every supported mode/engine/version/exporter claimed in this prove scope needs at least one journey.

Minimum journey set for a product-like claim (adapt to domain):

- Primary happy path (core value).
- At least one failure path with honest user feedback.
- At least one recovery/retry or restart path when lifecycle is claimed.

### Phase 4: Outcome Evidence (World State)

Passing responses are not enough.

1. Persistence: verify real backing state (rows, blobs, queues, manifests, merged config keys).
2. Runtime: logs/traces/metrics for this version only; redact secrets.
3. Bundle: required files present; forbidden files absent (source tree, fixtures-as-prod, prompt leakage, debug secrets).
4. Treat agent/self-report and marketing copy as untrusted. Grade the environment.

### Phase 5: Live Identity Check

Confirm the running system matches the frozen record (digest, version, checksum, config family). A green journey on the wrong bits is FAIL.

### Phase 6: Robustness

Run breakage the user will hit:

| Check | Requirement |
|-------|-------------|
| Concurrency | 2–5 parallel critical-path operations; zero correctness failures |
| Dependency fault | Timeout/down/denied dependency yields controlled failure, not corruption or false success |
| Restart / upgrade | If install/service lifecycle is claimed, restart or upgrade path works or is BLOCKED with reason |
| Idempotency / replay | Where claimed, replay does not double-apply destructive effects |
| Resource pressure | Short bounded stress relevant to the claim (optional only if claim excludes it) |

Fixed sleeps are not robustness proof. Prefer readiness probes and explicit deadlines.

### Phase 7: Adversary Challenge

Assume a hostile user or compromised tool path. Use the exact task-authorized target, whether local, staging, or production, with bounded effects and rollback where applicable.

Minimum set when the surface can accept untrusted input, tools, or configs:

1. AuthZ negative: disallowed action denied.
2. Injection / path / merge abuse relevant to the product (e.g. config clobber, path escape, prompt/tool exfil).
3. Secret exposure: secrets do not appear in logs, errors, MCP memory, or generated user configs.
4. One domain-specific abuse case that would look “healthy” if only exit codes were checked.

If the task's legal/engagement scope excludes adversary testing, mark those items `BLOCKED` and do not claim security or production readiness for them.

### Phase 8: Multi-Trial When Needed

If the path uses models, races, or other nondeterminism:

- Run N trials (default ≥3 for nondeterministic; 1 may suffice for fully deterministic).
- Report pass count / N, not a single lucky PASS.
- A flaky journey is FAIL until stabilized or excluded from the claim.

## OUTPUT FORMAT

```markdown
# PROOF COMPLETE

## Identity
- git_sha: `...`
- artifact: `...@sha256:...` or checksum
- version: `...`
- live_identity_match: yes|no

## Clean room
- install path: <cmd>
- source-tree dependency: no|yes (yes → FAIL)

## Journeys
- <journey>: PASS|FAIL — UX rubric notes — evidence
- failure-path: ...
- recovery-path: ...
- substitutes: none | <replacement> (any entry = FAIL for E2E/prove)

## Outcomes
- persistence: ...
- bundle required/forbidden: ...
- logs/traces: clean|issues

## Robustness
- concurrency: ...
- dependency fault: ...
- restart/upgrade: ...

## Adversary
- <case>: PASS|FAIL|BLOCKED

## Trials
- deterministic|N=<n> pass=<k>

## Verdict
PASS|FAIL|BLOCKED
```

## HARD RULES

1. Artifact or clean installed bits only — repo checkout demos are not prove PASS.
2. No mutable tags as identity.
3. Outcome over transcript: world state must match the journey claim.
4. UX rubric is mandatory for user-facing journeys; transport success alone is FAIL for UX claims.
5. Robustness and adversary phases are in-scope by default; excluding them requires narrowing the claim.
6. Do not call smoke “E2E” or “production-level proof.”
7. A suite or file named `e2e_test`, `integration`, `real`, or `live` is not real proof when any required path is substituted. Missing prerequisites are `BLOCKED`.
8. Hand suite discrimination to `verify-coverage`; hand claim certification to `verify-readiness`.
