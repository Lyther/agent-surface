---
name: ship-cicd
description: "Repair and harden CI/CD pipelines with evidence gates."
---

## Objective

Build automation that enforces the full release chain, source -> artifact -> bundle -> deployment, and promotes only the exact artifact it tested: if the promoted digest is not the tested digest, CI lied.

## Rules

1. Order gates fail-fast: cheap source checks before expensive artifact work.
2. Include at least one artifact-first gate; source-only green never releases.
3. Build through one canonical builder path; no ad-hoc or hidden-state builder hosts.
4. Never skip CI; a change that needs CI skipped is not ready.

## 1. Local Hooks

Install fast pre-commit hooks for secret scanning, formatting, linting, and generated-file drift; keep heavy integration and E2E suites out of them. Block mutable tags in deploy configs, missing lockfiles or manifests, secrets in the repo, and unsynced generated docs or command exports the repo depends on.

## 2. Source Gate

Check out with deterministic setup, then run lint, import verification (phantom dependencies), typecheck, unit tests, and integration tests. Run contract checks: env var docs against code, manifest and schema drift, and release-note or deployment-doc references that can be checked from source.

## 3. Artifact Gate

1. Build once through `scripts/build_artifact.sh`, `make artifact`, or one workflow entrypoint.
2. Capture the artifact digest or checksum, SBOM, provenance, and release manifest.
3. Run the vulnerability scan, signing, and attestation verification.
4. Re-pull or reinstall the built artifact and run smoke or E2E tests against that exact identity.

## 4. Bundle Gate

1. Generate the distribution bundle from the same manifest.
2. Inspect it: required files present, forbidden files absent, checksums and signatures published.
3. Install, unpack, or deploy from the bundle only, with no repo checkout, local source tree, or hidden dev assets.
4. Exercise the real matrix: supported modes, supported exporters and reports, and the upgrade or migration path when relevant.

## 5. Deployment Gate

Deploy the exact tested digest or checksum to preview or staging; verify the live running digest, version or build SHA, and bundle or manifest checksum; run `verify-prove` against the deployed revision; then run a short concurrency and SLO smoke. Promote nothing until live identity is proven.

## 6. Reporting and Policy

- Upload evidence: JUnit, coverage, SBOM, provenance, release manifest, and bundle hash list.
- Cancel superseded runs.
- Require the release gates that matter through branch protection.
- Authenticate with OIDC or short-lived credentials only.
- Pin third-party actions and builder images by immutable reference.

## Output

Pre-commit config (`.pre-commit-config.yaml`):

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.2
    hooks:
      - id: gitleaks
```

CI workflow (`.github/workflows/ci.yml`), passing the tested artifact between jobs:

```yaml
name: The Factory
on: [push, pull_request]

jobs:
  source:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: make verify-source

  artifact:
    needs: source
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build_artifact.sh
      - run: make verify-artifact
      - uses: actions/upload-artifact@v4
        with:
          name: release-artifact
          path: |
            release-manifest.json
            sbom.cdx.json

  bundle:
    needs: artifact
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: release-artifact
      - run: make verify-bundle   # pulls the image by the digest in release-manifest.json
```
