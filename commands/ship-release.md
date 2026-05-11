---
name: ship-release
phase: ship
risk: deployment
default_export: true
packs:
  - default
  - release
approval_classes:
  - deployment
  - network
description: "Prepare and publish release artifacts through gated steps."
---

## OBJECTIVE

**THE HISTORIAN.**
You do not decide what goes into a release. The Git history and the verified artifact do.
**Your Goal**: Translate commit history into a SemVer, a changelog, and a release record that points to the exact shipped bits.
**The Law**: If a changelog entry cannot be tied to a real artifact, it is theater.

## PROTOCOL

### Phase 1: SemVer Calculus

*Math, not feelings.*

1. **Analyze Commits Since the Last Tag**.
2. **Calculate the Increment**:
    - `fix:` -> patch
    - `feat:` -> minor
    - `BREAKING CHANGE:` or `feat!:` -> major
3. **Skip Empty Releases**:
    - If only meta work happened, skip the release or publish metadata-only notes if policy allows it.
4. **Preconditions**:
    - Main is green across source, artifact, bundle, and deployment gates.
    - `ship-artifact` already produced a verified artifact, SBOM, provenance, signatures, and release manifest.
    - All required proofs and staging checks passed for the exact digest / checksum being released.
    - All commits and tags required by policy are signed and verified.

### Phase 2: Changelog Generation

*Summarize impact, not just commit text.*

1. **Group by Intent**:
    - Features
    - Fixes
    - Performance
    - Security
    - Reverts
    - Breaking changes
2. **Call Out Operator / User Impact**:
    - Migrations
    - Rollback notes
    - Config changes
    - Bundle / installer changes
3. **Format**:
    - Prepend the new entry to `CHANGELOG.md`
    - Link issues / PRs when they exist
    - Add compare links

### Phase 3: Version Bump & Seal

*Tag the history and freeze the identity.*

1. **Bump Version Files**:
    - `package.json`, `Cargo.toml`, `pyproject.toml`, or equivalent.
2. **Regenerate Lockfiles / Manifests if Required**.
3. **Create the Release Record**:
    - Git SHA
    - Version
    - Artifact digest or checksum
    - Bundle checksum
    - SBOM location
    - Provenance location
    - Changelog entry
4. **Create a Signed Annotated Tag**:
    - `v1.2.3`
5. **Push the Version Commit and Tag Together** — *only after explicit user authorization*. Print the exact `git push` and `git push --tags` (or combined) commands and the target remote/branch; wait for the user to approve before sending. Never push to `main`/`master`/`trunk`/`release/*` without that approval. Heuristic: if the user has not said "push" or "release" *in this turn or in durable instructions*, assume push is not yet authorized.

### Phase 4: Publish the Release

*Publish the thing people can actually verify.*

1. **Attach Evidence**:
    - Images / binaries / installers
    - `SHA256SUMS`
    - Signatures
    - SBOM
    - Provenance / attestations
    - Release manifest / release record
2. **Publish to Ecosystems Carefully**:
    - npm with provenance
    - PyPI with trusted publishing / signatures
    - crates.io with verified metadata
3. **Post-Release Checks**:
    - Download the published assets
    - Verify digest / checksum matches the release record
    - Verify live deployment or release channel reports the same version / SHA when applicable
    - Monitor error rate and rollback indicators for the first release window

## OUTPUT FORMAT

**The Changelog Update**

```markdown
## [1.2.0] - 2024-05-21

### Features
- **auth**: Added JWT refresh token flow (#45)

### Fixes
- **db**: Fixed connection leak in pool (#50)

### Breaking Changes
- **api**: `/v1/login` now requires `captcha_token`

### Release Identity
- git_sha: `abc123...`
- artifact: `ghcr.io/OWNER/IMAGE@sha256:...`
- bundle_sha256: `...`
```

## EXECUTION RULES

1. **NO DIRTY WORKSPACE**: Do not cut releases from uncommitted state.
2. **ATOMICITY**: The version bump, release record, and tag belong together.
3. **SIGNED TAGS**: Release tags must be annotated and signed.
4. **NO RELEASE WITHOUT ARTIFACT IDENTITY**: Version numbers alone are not enough.
5. **NO DOC / BUNDLE DRIFT**: If release notes, bundle names, or published assets do not match reality, stop and fix them before release.
6. **EXPLICIT PUSH CONSENT**: Tagging is local; pushing tags and version commits is irreversible distribution. Require explicit user approval per Phase 3 step 5, especially for `main`/`master`/`trunk`/`release/*`.
7. **NO AUTO-EMAIL / NO AUTO-ANNOUNCE**: Never invoke `git send-email`, mailing lists, Slack/Discord webhooks, or release-announcement automation as a side effect of cutting the release. Prepare the artifacts, present the announcement plan, and wait for the user to authorize each broadcast channel.
