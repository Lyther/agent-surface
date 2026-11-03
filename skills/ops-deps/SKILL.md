---
name: ops-deps
description: "Audit and refresh dependency health and supply-chain state."
---

## Objective

Keep dependencies supported, compatible, secure, and reproducible. An update is a compatibility change, not a freshness contest: never upgrade solely because a newer version exists.

## Rules

1. Respect the repository's package manager, manifests, lockfiles, and versioning strategy; replace exact pins, ranges, lockfiles, vendoring, or workspace constraints only with an explicit migration reason. Prefer repository scripts over ad hoc global commands.
2. Verify package names, versions, APIs, and advisories from authoritative current sources.
3. Never weaken tests, type checks, audits, or resolver policy, and never use `--force`, `--legacy-peer-deps`, ignored resolver failures, or manual lockfile edits to manufacture a successful install.
4. Claim a security fix only when the vulnerable resolved version and affected path were actually removed or mitigated.

## Procedure

1. Identify the package manager, manifests, lockfiles, runtime constraints, CI version, and dependency-update automation already in use.
2. Find concrete work with the ecosystem's existing tooling (`npm outdated`, `cargo outdated`, `uv lock --upgrade-package`, or the repository's dependency bot configuration), prioritized: known exploitable advisories affecting the actual resolved version and used path; unsupported or abandoned dependencies; versions blocking a required feature, runtime, or platform; routine updates with a clear maintenance benefit.
3. Before changing a dependency, inspect proportionately its release notes and migration guidance, runtime and toolchain compatibility, maintenance status and known advisories, license fit when relevant, install/build scripts, native binaries, and transitive footprint, and manifest and lockfile impact. Use a maintained existing dependency when one already solves the need; add a second library for the same job only with a concrete advantage.
4. Use the repository's normal manifest constraint and regenerate its lockfile. Pin tools, actions, containers, and other build inputs when the repository requires reproducible identity. Never write `@latest`, a mutable branch, or an unbounded version into durable automation to get the newest release. A major upgrade may be deferred when migration cost exceeds the current benefit.
5. Change one dependency or one tightly coupled family per patch, with its required source changes, generated metadata, and lockfile; never combine unrelated upgrades.
6. Verify cheapest first, then the repository gate for the affected surface: dependency resolution or locked install; type-check, compile, or import check; focused tests for changed APIs; broader tests and build when the dependency is shared or production-facing; an audit or scanner re-check for security-driven updates.
7. If the selected release is broken or incompatible, report the evidence and choose a supported compatible release, defer the upgrade, replace the dependency, or roll back; application code need not always fix forward around an upstream defect. Report failed or blocked checks honestly.

## Output

```markdown
# Dependency Report

## Changed
- package: old -> new
- reason: advisory / support / required capability / maintenance
- manifest policy: preserved or intentionally changed
- lockfile: updated / unchanged / not applicable

## Verification
- command -> passed / failed / not run

## Deferred
- package -> evidence and unblock condition

## Risk
- migration, compatibility, native-build, or supply-chain limits
```
