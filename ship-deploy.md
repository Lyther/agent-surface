## OBJECTIVE

**THE LAUNCH BUTTON.**
Take the verified artifact from `ship-artifact` and make the target environment match it exactly.
**The Goal**: Zero-drift rollout. Fast rollback.
**The Enemy**: Mutable tags, cluster drift, half-applied migrations, and "healthy" deployments running the wrong build.

## PROTOCOL

### Phase 1: Pre-Flight

*Freeze the identity before touching prod.*

1. **Select Target**:
    - `staging`, `production`, store channel, or customer environment.
2. **Freeze the Deployment Record**:
    - Git SHA
    - Artifact digest or package checksum
    - Bundle manifest / bundle checksum
    - Expected version / build string
    - Change ticket / rollout owner
3. **Verify Trust Material**:
    - Signature valid
    - SBOM present
    - Provenance present
    - Release manifest present
4. **Diff Desired vs Live**:
    - Config
    - Secrets references
    - Routes / ingress
    - Resources / autoscaling
    - Feature flags
5. **Compatibility Check**:
    - Schema and config must be backward-compatible or explicitly flag-gated.
6. **Docs / Runbook Parity**:
    - Deployment docs, rollback steps, and release notes must reference the real artifact names and commands that will be used.

### Phase 2: Rollout

*Deploy by identity, not by vibes.*

1. **Digest / Checksum Only**:
    - OCI deploys use `image@sha256:...`
    - Non-OCI deploys use signed package checksums
2. **Strategy A: Rolling Update**:
    - Start new instances
    - Wait for readiness
    - Drain old instances after the new ones are healthy
3. **Strategy B: Blue / Green**:
    - Bring up the full new stack
    - Switch traffic
    - Keep the old stack intact until verification passes
4. **Strategy C: Canary / Progressive**:
    - Shift 1% -> 10% -> 50% -> 100%
    - Auto-rollback on SLO or correctness breach

### Phase 3: Landing Verification

*A green rollout is meaningless if the identity is wrong.*

1. **Healthcheck Loop**:
    - Poll readiness / health on the new instances.
    - Timeout -> rollback.
2. **Artifact-First Proof**:
    - Run a minimal `verify-prove` flow against the new revision.
3. **Live Identity Match**:
    - Running digest matches the frozen record
    - `/health`, `/version`, or `--version` reports the expected version / build SHA
    - Expected schema version, config family, or license ID is present when applicable
4. **SLO Hold Period**:
    - Monitor error rate, latency, and saturation for a hold window.
    - Breach -> rollback.

### Phase 4: Audit Trail

*Leave evidence someone else can trust later.*

1. **Record the Deployment**:
    - Target
    - Time
    - Operator
    - Artifact digest
    - Bundle checksum
    - Config revision
2. **Link the Evidence**:
    - Release notes
    - SBOM
    - Provenance
    - Rollout logs
3. **Post-Deploy Drift Check**:
    - Reconcile desired vs live state after rollout.
    - Alert on drift.

### Phase 5: Channel / Store Release

1. **Desktop**:
    - Distribute signed installers
    - Verify codesign / notarization
    - Publish checksums and update metadata
2. **Mobile**:
    - Submit the exact `.aab` / `.ipa` that passed validation
    - Track staged rollout percentages and review status
3. **Customer Bundles**:
    - Deliver the exact tested archive
    - Keep the manifest and checksum beside the bundle

## OUTPUT FORMAT

**The Deployment Log**

```markdown
> **Target**: Production
> **Git SHA**: `abc123...`
> **Artifact**: `ghcr.io/OWNER/IMAGE@sha256:deadbeef`
> **Bundle SHA256**: `...`
> **Strategy**: Canary
>
> - Signature / provenance / SBOM: OK
> - Config diff reviewed: OK
> - Readiness checks: PASS
> - Live digest match: PASS
> - `verify-prove`: PASS
> - SLO hold window: PASS
> - **STATUS**: SUCCESS
```

## EXECUTION RULES

1. **IMMUTABLE INFRASTRUCTURE**: Never SSH into a server to `git pull`. Replace the runtime with the verified artifact.
2. **DIGESTS OR CHECKSUMS ONLY**: Mutable tags and "latest installer" labels are banned.
3. **ROLL BACK ON MISMATCH**: If live identity does not match the frozen record, rollback even if healthchecks are green.
4. **NO MANUAL HOTPATCHES**: Do not fix prod by editing live files. Repair source, rebuild, redeploy.
5. **NO UNPROVEN PROMOTION**: The exact artifact promoted must be the one that passed proof and staging checks.
