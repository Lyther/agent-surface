---
name: ops-deps
description: "Audit and refresh dependency health and supply-chain state."
---

## OBJECTIVE

Keep dependencies supported, compatible, secure, and reproducible. An update is a compatibility change, not a freshness contest.

## WORKFLOW

### 1. Read Repository Policy

- Identify the package manager, manifests, lockfiles, runtime constraints, CI version, and dependency-update automation already in use.
- Preserve the repository's versioning strategy. Do not replace exact pins, ranges, lockfiles, vendoring, or workspace constraints without an explicit migration reason.
- Prefer repository scripts over ad hoc global commands.

### 2. Find Concrete Work

Use the ecosystem's existing tooling, such as `npm outdated`, `cargo outdated`, `uv lock --upgrade-package`, or the repository's dependency bot configuration.

Prioritize:

1. known exploitable advisories affecting the actual resolved version and used path;
2. unsupported or abandoned dependencies;
3. versions blocking a required feature, runtime, or platform;
4. routine updates with a clear maintenance benefit.

Do not upgrade solely because a newer version exists.

### 3. Check the Candidate

Before changing a dependency, inspect proportionately:

- release notes and migration guidance;
- runtime and toolchain compatibility;
- maintenance status and known advisories;
- license fit when relevant;
- install/build scripts, native binaries, and transitive footprint;
- manifest and lockfile impact.

Use a maintained existing dependency when it already solves the need. Do not add a second library for the same job without a concrete advantage.

### 4. Choose the Version Deliberately

- Use the repository's normal manifest constraint and regenerate its lockfile.
- Pin tools, actions, containers, and other build inputs when the repository requires reproducible identity.
- Do not write `@latest`, a mutable branch, or an unbounded version into durable automation merely to obtain the newest release.
- A major upgrade may be deferred when migration cost exceeds the current benefit.

### 5. Update One Coherent Unit

Change one dependency or a tightly coupled family. Keep required source changes, generated metadata, and the lockfile in the same patch. Do not combine unrelated upgrades.

Never use `--force`, `--legacy-peer-deps`, ignored resolver failures, or manual lockfile editing to manufacture a successful install.

### 6. Verify the Real Path

Run the cheapest relevant checks first, then the repository gate appropriate to the affected surface:

- dependency resolution or locked install;
- type-check, compile, or import check;
- focused tests for changed APIs;
- broader tests/build when the dependency is shared or production-facing;
- audit or scanner re-check for security-driven updates.

If the selected release is broken or incompatible, report the evidence and either choose a supported compatible release, defer the upgrade, replace the dependency, or roll back. Do not assume application code must always fix forward around an upstream defect.

## OUTPUT

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

## HARD RULES

1. Respect the repository's package manager, manifests, and lockfile.
2. Verify package names, versions, APIs, and advisories from authoritative current sources.
3. Never weaken tests, type checks, audits, or resolver policy to land an update.
4. Do not claim a security fix unless the vulnerable resolved version and affected path were actually removed or mitigated.
5. Keep the change atomic and report failed or blocked checks honestly.
