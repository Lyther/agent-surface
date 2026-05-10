## OBJECTIVE

**TALK IS CHEAP. SHOW ME THE SHIPPED SYSTEM.**
Unit tests prove the repo. `PROVE` proves the exact bits a user or cluster will run.
**Your Goal**: Start from a built artifact or customer bundle, execute the core loop, and collect evidence that source, artifact, bundle, and live system still match.
**The Enemy**: Repo-only demos, mutable tags, stale manifests, local-only assets, and deployments whose digest does not match the tested build.

## PROTOCOL

### Phase 1: Freeze Identity

*No identity, no proof.*

1. **Record the Release Identity**:
    - Git SHA
    - Version / build string
    - Image digest or binary checksum
    - Bundle checksum / manifest
    - Expected mode, protocol version, schema version, or license ID when applicable
2. **Reject Ambiguity**:
    - If the target is only identified by a mutable tag like `latest`, stop.
    - If the bundle or manifest does not exist, stop.

### Phase 2: Artifact-First Boot

*Boot the thing that actually ships.*

1. **Start from the Shipped Thing**:
    - OCI: `image@sha256:...`
    - CLI / desktop / mobile: signed package or release bundle
2. **Cold Environment**:
    - Fresh environment only. No mounted source tree, hidden dev cache, or local override files.
3. **Wait by Readiness**:
    - Poll health or readiness endpoints. No fixed sleeps.

### Phase 3: Clean-Room Acceptance

*Simulate the customer path, not the developer path.*

1. **Install / Unpack Exactly What Users Receive**.
2. **Run the Core Workflow End to End**:
    - Register -> login -> buy
    - Create -> read -> update -> export
    - Upload -> process -> download
3. **Verify Every Customer-Facing Output That Must Ship**:
    - HTTP responses
    - CLI exit codes
    - Reports, archives, or generated files
    - UI pages or installer outcomes
4. **Cover the Real Matrix**:
    - If the product has multiple supported engines, versions, modes, exporters, or code paths, prove each supported path explicitly.

### Phase 4: Deep Evidence

*Passing requests are not enough. Confirm the side effects.*

1. **Persistence Check**:
    - Verify the real backing service state: DB rows, queue messages, blob uploads, emitted events.
2. **Runtime Check**:
    - Inspect logs, traces, and metrics for the new version only.
3. **Bundle Check**:
    - Confirm required files exist: docs, manifests, schemas, signatures, migration notes.
    - Confirm forbidden files are absent: source tree, test fixtures, prompt leakage, internal-only endpoints, debug secrets.

### Phase 5: Live Identity Check

*The workflow is not enough if the wrong build is running.*

1. **Verify Live Identity Against the Frozen Record**:
    - Running digest
    - Reported version / build SHA
    - Bundle or manifest checksum
    - Expected config family or license ID when applicable
2. **Fail on Any Mismatch**:
    - A passing flow on the wrong digest is still a release failure.

### Phase 6: Hardening & Short Load

*Run the boring breakage checks before users do.*

1. **Short Concurrency Smoke**:
    - Run 2-5 parallel requests or jobs on the critical path.
2. **Security-Sensitive Checks**:
    - AuthN / AuthZ
    - Secret redaction
    - Outbound / SSRF restrictions
    - Unsafe prompt or template exposure
3. **Fail on Regressions**:
    - Data races, correctness failures, rate-limit collapse, or leaked internals.

## OUTPUT FORMAT

```markdown
# PROOF COMPLETE

## Identity
- git_sha: `abc123...`
- artifact: `ghcr.io/OWNER/IMAGE@sha256:...`
- bundle_sha256: `...`
- version: `1.2.3`
- live_digest_match: yes

## Core Loop
- `POST /register`: 201
- `POST /buy`: 200
- `GET /orders/123`: 200

## Evidence
- DB row present: yes
- required bundle files present: yes
- forbidden files absent: yes
- logs / traces clean: yes

## Hardening
- parallel smoke: 5 concurrent requests, 0 failures
- auth / redaction / SSRF checks: pass

## Verdict
**PASS** or **FAIL**
```

## EXECUTION RULES

1. **ARTIFACT OR BUNDLE ONLY**: Release proof starts from the shipped thing, not the repo checkout.
2. **NO MUTABLE REFERENCES**: `latest` proves nothing. Use digests or checksums.
3. **NO CLEAN ROOM, NO PASS**: If the flow depends on local source files or hidden dev state, mark it FAIL.
4. **EVIDENCE OVER CLAIMS**: Show the live digest, version, and one concrete business result.
5. **TEST THE REAL MATRIX**: Every supported user-visible mode, version, or exporter needs at least one proof path.
