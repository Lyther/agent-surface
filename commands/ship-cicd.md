## OBJECTIVE

**THE ASSEMBLY LINE.**
Humans forget. Pipelines remember.
Your goal is to build automation that enforces the full release chain: source -> artifact -> bundle -> deployment.
**The Law**: If the promoted digest was not the tested digest, CI lied.

## PROTOCOL

### Phase 1: The Local Police

*Stop garbage before it enters Git.*

1. **Install Fast Hooks**:
    - Secret scan
    - Formatter
    - Linter
    - Generated-file drift checks
2. **Keep Hooks Fast**:
    - No heavy integration or E2E suites here.
3. **Block Known Release Footguns**:
    - Mutable tag usage in deploy configs
    - Missing lockfiles / manifests
    - Secrets in repo
    - Unsynced generated docs or command exports when the repo depends on them

### Phase 2: Source Gate

*Reject broken source before spending money on builds.*

1. **Checkout + Deterministic Setup**.
2. **Run Source Verification**:
    - Lint
    - Typecheck
    - Unit tests
    - Integration tests
3. **Run Contract Checks**:
    - Env var docs vs code
    - Manifest / schema drift
    - Release-note / deployment-doc references that can be checked from source

### Phase 3: Artifact Gate

*Build once. Test that exact build.*

1. **Use One Canonical Builder**:
    - `scripts/build_artifact.sh`, `make artifact`, or one workflow entrypoint
    - No ad-hoc builder hosts with hidden state
2. **Capture Identity**:
    - Artifact digest / checksum
    - SBOM
    - Provenance
    - Release manifest
3. **Security Gates**:
    - Vulnerability scan
    - Signature
    - Attestation verification
4. **Artifact-First Acceptance**:
    - Re-pull or reinstall the built artifact
    - Run smoke / E2E against that exact identity

### Phase 4: Bundle Gate

*The customer bundle is its own product. Test it like one.*

1. **Generate the Distribution Bundle from the Same Manifest**.
2. **Inspect the Bundle**:
    - Required files present
    - Forbidden files absent
    - Checksums and signatures published
3. **Clean-Room Acceptance**:
    - Install / unpack / deploy from the bundle only
    - No repo checkout, no local source tree, no hidden dev assets
4. **Exercise the Real Matrix**:
    - Supported modes
    - Supported exporters / reports
    - Upgrade or migration path when relevant

### Phase 5: Deployment Gate

*Do not promote until the live environment proves identity.*

1. **Deploy the Exact Tested Digest / Checksum to Preview or Staging**.
2. **Verify Live Identity**:
    - Running digest
    - Version / build SHA
    - Bundle or manifest checksum
3. **Run `verify-prove` Against the Deployed Revision**.
4. **Run Short Concurrency / SLO Smoke**.

### Phase 6: Reporting & Policy

1. **Upload Evidence**:
    - JUnit
    - Coverage
    - SBOM
    - Provenance
    - Release manifest
    - Bundle hash list
2. **Concurrency Control**:
    - Cancel superseded runs.
3. **Branch Protection**:
    - Require the release gates that matter.
4. **Authentication**:
    - OIDC or short-lived credentials only.
5. **Pin the Supply Chain**:
    - Pin third-party actions and builder images by immutable reference.

## OUTPUT FORMAT

**1. The Pre-commit Config (`.pre-commit-config.yaml`)**

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.2
    hooks:
      - id: gitleaks
```

**2. The CI Workflow (`.github/workflows/ci.yml`)**

```yaml
name: The Factory
on: [push, pull_request]

jobs:
  source:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make verify-source

  artifact:
    needs: source
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build_artifact.sh
      - run: make verify-artifact

  bundle:
    needs: artifact
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make verify-bundle
```

## EXECUTION RULES

1. **BUILD ONCE**: The artifact promoted later must be the exact artifact tested earlier.
2. **FAIL FAST**: Put fast source checks before expensive artifact work.
3. **NO SOURCE-ONLY RELEASE GREEN**: CI must include at least one artifact-first gate.
4. **NO AD-HOC BUILDERS**: One canonical builder path. Hidden snowflake hosts are banned.
5. **NO "SKIP CI"**: If you need to skip CI, the change is not ready.

## AI GUARDRAILS

| Check | Purpose |
|-------|---------|
| Import verification | Catch phantom dependencies |
| Type checking | Catch AI type errors |
| Secret scan | Catch leaked secrets |
| Artifact identity capture | Prevent source / build drift |
| Bundle inspection | Prevent shipping internal junk |
