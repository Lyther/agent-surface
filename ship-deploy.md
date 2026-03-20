## OBJECTIVE

**THE LAUNCH BUTTON.**
Take the immutable Artifact (from `ship-artifact`) and enforce it upon the Target Environment.
**The Goal**: Zero Downtime. Instant Rollback.
**The Enemy**: "Drift" (When the server config doesn't match the repo).

## PROTOCOL

### Phase 1: The Pre-Flight (Environment Check)

*Don't deploy to a broken server.*

1. **Select Target**: `staging` or `production`?
2. **Verify Artifact**: Does the Docker Image `ghcr.io/app:v1.2.3` actually exist? Verify digest and signature (Cosign).
3. **Freeze & Flags**: Respect change freeze windows and feature flag states.
4. **Diff Config**:
      - Compare `k8s/production/values.yaml` vs Current Cluster State.
      - Warn on major config changes (DB URL change, secrets, resource limits).
5. **DB Compatibility**:
      - Backward-compatible schema in place before rollout or gated by flags.

### Phase 2: The Rollout (Strategy Selection)

*Don't just kill the old process.*

1. **Strategy A: Rolling Update (K8s)**:
      - Start v1.2.3. Wait for Healthcheck readiness gates.
      - Drain old pods after new pods are Ready.
      - Set `maxUnavailable`/`maxSurge` safe values.
2. **Strategy B: Blue/Green**:
      - Spin up full v1.2.3 stack (Green) alongside v1.2.2 (Blue).
      - Switch Load Balancer.
      - Destroy Blue after verification.
3. **Strategy C: Canary/Progressive**:
      - Shift 1% → 10% → 50% → 100% with automated rollback on SLO breach.

### Phase 3: The Verification (The Landing)

*It's not deployed until it works.*

1. **Healthcheck Loop**:
      - Poll `/health` on the NEW instances.
      - **Timeout**: If not healthy in 60s, **AUTO-ROLLBACK**.
2. **Post-Deploy Test**:
      - Run a minimal `prove` script against the production URL.
3. **SLO Guard**:
      - Monitor P95 latency/error rate for a hold period (e.g., 15m). Breach → rollback.

### Phase 4: Observability & Compliance

1. **Tracing**: Ensure version tag is injected into traces/logs/metrics.
2. **SBOM/Provenance**: Keep attestation with deployed digest for audit.
3. **Drift Detection**: Reconcile desired vs live state; alert on drift.

### Phase 5: Store/Channel Release (Desktop/Mobile)

1. **Desktop**:
    - Distribute via signed installers; verify codesign/notarization
    - Provide delta updates if supported; publish checksums
2. **Mobile**:
    - Submit AAB/IPA to Play/App Store with required metadata/screenshots
    - Run store validation steps; track review status
    - Rollout staged percentages (Play console staged rollout) and monitor SLOs

## OUTPUT FORMAT

**The Deployment Log**

```markdown
> **Target**: Production (AWS us-east-1)
> **Artifact**: `v1.2.3` (SHA: `a1b2c`)
> **Strategy**: Rolling Update
>
> - 🚀 Starting new instances... [OK]
> - 🔏 Signature verified (cosign). Digest: sha256:deadbeef
> - 💓 Healthcheck passed (200 OK).
> - 🧭 SLO Guard (15m): PASS
> - 🛑 Draining old instances... [OK]
> - **STATUS**: 🟢 SUCCESS.
```

## EXECUTION RULES

1. **IMMUTABLE INFRASTRUCTURE**: Never SSH into a server to `git pull`. Never edit files on the server. **Replace the container.**
2. **DATABASE MIGRATIONS**: Run `db-mig` *before* the code rollout (if backward compatible) or *during* startup with gates.
3. **THE RED BUTTON**: If anything fails, the default action is **ROLLBACK**. Do not leave the system in a half-broken state.
4. **SIGNATURES REQUIRED**: Only run signed images with verified digest.
