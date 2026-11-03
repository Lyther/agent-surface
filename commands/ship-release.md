---
name: ship-release
phase: ship
description: "Prepare and publish release artifacts through gated steps."
---

## OBJECTIVE

Translate commit history into a SemVer version, a changelog, and a release record that points to the exact shipped bits. Git history and the verified artifact decide what goes into a release; a changelog entry that cannot be tied to a real artifact is theater.

## Rules

1. Never cut a release from uncommitted state.
2. The version bump, release record, and tag belong together; a version number without artifact identity is not a release.
3. Release tags are annotated and signed.
4. If release notes, bundle names, or published assets do not match reality, stop and fix them before release.
5. Pushing version commits and tags is irreversible distribution: verify the remote, branch, tag, and release identity, then complete the configured workflow without another confirmation prompt.
6. Send release email, mailing-list, Slack/Discord, or webhook announcements only to channels named by the task or the established release workflow, never to unrelated recipients.

## 1. Version

1. Analyze commits since the last tag: `fix:` -> patch, `feat:` -> minor, `BREAKING CHANGE:` or `feat!:` -> major.
2. If only meta work happened, skip the release, or publish metadata-only notes if policy allows it.
3. Require that main is green across source, artifact, bundle, and deployment gates; `ship-artifact` already produced a verified artifact, SBOM, provenance, signatures, and release manifest; all required proofs and staging checks passed for the exact digest or checksum being released; and all commits and tags required by policy are signed and verified.

## 2. Changelog

Prepend the new entry to `CHANGELOG.md`, grouped by intent (Features, Fixes, Performance, Security, Reverts, Breaking changes) and summarizing impact, not just commit text. Call out migrations, rollback notes, config changes, and bundle or installer changes. Link issues and PRs when they exist, and add compare links.

## 3. Bump and Seal

1. Bump the version files (`package.json`, `Cargo.toml`, `pyproject.toml`, or equivalent) and regenerate lockfiles or manifests if required.
2. Commit the version files, lockfiles, and changelog entry together, so the tag points at the release state.
3. Create a signed annotated tag (`v1.2.3`) on that commit.
4. Create the release record for the tagged commit: Git SHA, version, artifact digest or checksum, bundle checksum, SBOM location, provenance location, and changelog entry.
5. Resolve and verify the target remote and branch, then push the version commit and tag together under durable full-execution consent. Respect protected-branch policy by using the repository's release branch or PR workflow.

## 4. Publish

1. Attach images, binaries, or installers; `SHA256SUMS`; signatures; SBOM; provenance or attestations; and the release manifest or record.
2. Publish to ecosystems carefully: npm with provenance, PyPI with trusted publishing or signatures, crates.io with verified metadata.
3. After release, download the published assets and verify their digest or checksum matches the release record; verify the live deployment or release channel reports the same version or SHA when applicable; and monitor error rate and rollback indicators for the first release window.

## Output

The changelog update:

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
