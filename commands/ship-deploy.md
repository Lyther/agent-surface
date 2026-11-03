---
name: ship-deploy
phase: ship
description: "Deploy verified artifacts with target identity and rollback gates."
---

## OBJECTIVE

Make the target environment match the verified artifact from `ship-artifact` exactly: zero-drift rollout, fast rollback. Kernel and mailing-list patch flows send patches instead of deploying; use `ship-commit` in kernel mode for them.

## Rules

1. Resolve the exact staging, preview, production, customer, or store target from the task and live deployment config before touching anything live; if no unique target resolves, report the missing selector instead of guessing.
2. Record the deployment plan (target, artifact digest, strategy, health gate, rollback path), then execute it under durable full-execution consent.
3. Deploy by digest or signed checksum only; never use mutable tags or "latest installer" labels, and never silently promote `latest`.
4. Promote only the exact artifact that passed proof and staging checks.
5. Roll back when the live identity does not match the frozen record, even if healthchecks are green.
6. Replace the runtime with the verified artifact; never SSH into a server to `git pull` or edit live files to hotpatch production. Repair source, rebuild, redeploy.
7. Send Slack, email, or changelog announcements only to channels named by the deployment task or the established rollout workflow.

## 1. Pre-Flight

1. Freeze the deployment record: Git SHA, artifact digest or package checksum, bundle manifest or checksum, expected version or build string, and change ticket or rollout owner.
2. Verify trust material: the signature is valid and the SBOM, provenance, and release manifest are present.
3. Diff desired against live: config, secret references, routes/ingress, resources/autoscaling, and feature flags.
4. Confirm schema and config changes are backward-compatible or explicitly flag-gated.
5. Confirm deployment docs, rollback steps, and release notes reference the real artifact names and commands that will be used.

## 2. Rollout

Deploy OCI images as `image@sha256:...` and non-OCI packages by signed checksum, with one strategy:

- Rolling: start new instances, wait for readiness, and drain old instances once the new ones are healthy.
- Blue/green: bring up the full new stack, switch traffic, and keep the old stack intact until verification passes.
- Canary: shift 1% -> 10% -> 50% -> 100%; roll back automatically on an SLO or correctness breach.

## 3. Landing Verification

1. Poll readiness/health on the new instances; roll back on timeout.
2. Run a minimal `verify-prove` flow against the new revision.
3. Confirm the running digest matches the frozen record, `/health`, `/version`, or `--version` reports the expected version or build SHA, and the expected schema version, config family, or license ID is present when applicable.
4. Watch error rate, latency, and saturation for a hold window; roll back on breach.

## 4. Audit Trail

1. Record target, time, operator, artifact digest, bundle checksum, and config revision.
2. Link release notes, SBOM, provenance, and rollout logs.
3. Reconcile desired against live state after rollout and alert on drift.

## 5. Channel and Store Release

- Desktop: distribute signed installers, verify codesign and notarization, and publish checksums and update metadata.
- Mobile: submit the exact `.aab` / `.ipa` that passed validation; track staged rollout percentages and review status.
- Customer bundles: deliver the exact tested archive with its manifest and checksum beside it.

## Output

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
