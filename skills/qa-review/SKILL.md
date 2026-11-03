---
name: qa-review
description: "Find blocking issues before bad code lands."
---

## Objective

Review like the maintainer who will inherit the code: stop wrong, unproven, unreviewable, or scope-confused changes. Be direct and precise; no praise padding. Report defects against the stated task, each shown by a failing input, a broken requirement, or a violated contract; a suggestion that adds a requirement, guard, test, or follow-up is a non-blocking note for the user, never an approval condition.

## Input

`qa-review <target> [--round N] [--max-rounds N] [--focus <domains>] [--state <path>]`

- `<target>`: file, directory, or diff. `--round` defaults to 1; `--max-rounds` to 2.
- `--focus`: `security`, `logic`, `config`, `quality`, `perf`, `tests`, `docs`, `deps`, or `all`.
- `--state`: the previous round's output; required from round 2.

## Scope

Classify each path as in scope, excluded, or ambiguous; resolve ambiguity from the task, Git state, and config (report the missing selector if none fits) and proceed without waiting for confirmation. Everything not excluded is in scope, including config, IaC, CI, scripts, docs, manifests, tests, and migrations. Never infer the contents of excluded paths:

```text
node_modules/ vendor/ .venv/ venv/ __pycache__/ *.pyc .mypy_cache/ .ruff_cache/ .pytest_cache/
.eslintcache .tox/ .nox/ .coverage dist/ build/ target/ out/ *.egg-info/ *.whl *.tar.gz
.git/ .svn/ .hg/ *.min.js *.min.css *.map .terraform/ .terragrunt-cache/
```

With shell access, check excluded directories for anomalies:

```bash
find node_modules/ vendor/ build/ dist/ -maxdepth 3 \( -name '*.env' -o -name '*.pem' -o -name '*.key' -o -name '*secret*' -o -name '*credential*' \) 2>/dev/null
find build/ dist/ out/ \( -name '*.py' -o -name '*.rs' -o -name '*.go' -o -name '*.ts' -o -name '*.java' \) 2>/dev/null
```

## Passes

Review one domain at a time across all in-scope files. Without `--focus`, always run `logic` and `tests`; add `security` when the change touches input parsing, auth, secrets, paths, permissions, or network; add other domains only when the change touches their surface. Order: patch (diffs, PRs, patches, fixes) → security → logic → config → quality → perf → tests → docs → deps.

### Patch

- The description names a real problem and its impact; the patch fixes the root cause on the real path, including error paths, races, ordering, lifetime, retries, and partial writes that the original failure involved.
- The same invariant is fixed at sibling call sites, alternate entry points, config combinations, and async readers.
- Touched contracts stay compatible (API/ABI/UAPI, wire format, schema, storage, CLI, config, permissions, observable output) or the migration is scoped and documented.
- One logical change per patch; refactors, formatting, dependency churn, and adjacent fixes are split out unless the fix needs them. Each patch in a series builds and passes on its own.
- The design is the smallest one that preserves the invariants; flag clever, global, stateful, or speculative fixes.
- Review test diffs adversarially: relaxed assertions, deleted negative cases, skips, "test mode" switches, or substitutes can hide a regression. Reject a test whose substitute lacks a complete `SUBSTITUTE_JUSTIFICATION`; its run proves the real code it exercised and nothing about the replaced boundary.
- Tool-generated code, tests, or text must be understood and defended by the submitter.

### Kernel (in addition, for kernel trees and patches)

- One problem per patch; a self-contained imperative log; `Fixes:` with a 12-character SHA and subject only when the culprit is known; no invented trailers. Agents never add `Signed-off-by:`.
- Right maintainer tree per `MAINTAINERS`; kernel style is local law; include required headers directly.
- `CONFIG` changes have sane defaults and help text and are checked across `=y`/`=m`/`=n`, SMP/PREEMPT, debug, and architecture combinations.
- Locks, RCU, refcounts, atomics, barriers, hotplug, workqueues, timers, interrupts, and teardown need an explicit interleaving or lifetime model; barriers carry comments.
- UAPI, `/proc`, sysfs, ioctl, netlink, and module or boot parameters stay compatible or are documented.
- Stable candidates are small, tested, obviously correct, and fix a real bug; security fixes follow the kernel security process.
- Treat checkpatch, sparse, smatch, Coccinelle, KUnit/kselftest, and lockdep/KASAN/KCSAN/UBSAN output as evidence needing judgment.

### Security

- Secrets in code or config; untrusted input validated server-side with allow-lists; context-aware output encoding.
- Injection (SQL, command, path traversal, template, NoSQL, LDAP); SSRF allow-lists and blocked metadata endpoints.
- Sessions and tokens: CSPRNG, cookie flags, logout invalidation, generic auth errors; authorization on every resource (no IDOR, least privilege, scoped RBAC); JWT algorithm enforced, signature before claims, expiry checked.
- No deprecated crypto (MD5, SHA-1, DES, RC4, ECB), no nonce reuse, password hashing with bcrypt, scrypt, or argon2; no untrusted deserialization.
- No secrets or PII in logs; security events logged; no stack traces or internals in user-facing errors; Actions pinned to SHA and images to a digest or version.

### Logic

- The code does what it claims; edge cases (empty, boundary, overflow, off-by-one); races and TOCTOU; complete state transitions; no swallowed errors; behavior when dependencies fail; matches documented requirements.

### Config

- Dockerfile: minimal multi-stage image, non-root user, no secrets in ENV/ARG, `.dockerignore`.
- CI: secrets from the secret store, least-privilege `permissions:`, no `pull_request_target` with a PR-head checkout.
- IaC: no `0.0.0.0/0` on sensitive ports, encryption at rest and in transit, remote locked state, no committed state file.
- Safe defaults, config validated at startup, complete ignore files; migrations reversible, idempotent, non-blocking, and lossless on rollback.

### Quality

- Clear, consistent, idiomatic naming and code; duplicated logic; functions over about 50 lines or nested deeper than 3 levels; dead or commented-out code; untracked TODO/FIXME; consistent API design.
- With tool access, run the repo's formatter and linter checks on the changed files (`ruff format --check`, `gofumpt -l`, `shfmt -d`, or the repo script); drift is SHOULD-FIX, pointing at the editor or config mismatch.

### Perf

- N+1 queries, missing indexes, unbounded collections or queries, large or leaked allocations, lock contention, blocking async, avoidable quadratic algorithms, bloated runtime images.

### Tests

- Critical paths, edge cases, and error paths covered by meaningful assertions; isolated (no order dependence, shared mutable state, or flaky external calls); names that say what failed; run in CI.

### Docs

- README, API docs, and changelog match the change; comments explain why; license present.

### Deps

- Pinned versions and a committed lockfile; no leftover, unnecessary, or vendored-instead-of-managed dependencies.
- With shell access, run `npm audit`, `pip audit`, or `cargo audit` and report the real output; never invent CVEs or metrics.

## Severity

| Level | Meaning | Verdict |
|---|---|---|
| 🔴 REJECT-BLOCKING | security vulnerability, correctness bug, data-loss risk, committed secret | any one rejects |
| 🟡 SHOULD-FIX | smell, error handling, config, or test gap with no demonstrated failure | author fixes or declines in one line |
| 🔵 NIT | style, readability, minor docs | never blocks |

## Rounds

End every round with a state block that `--state` can load:

```text
<!-- STATE_START
round: 1
verdict: REJECTED
findings:
  - {id: F001, severity: red, file: src/auth.rs, line: 42, summary: Hardcoded JWT secret}
STATE_END -->
```

From round 2, `--state` is required; without it, stop with an error instead of guessing prior findings. Mark each prior finding fixed, not fixed, or regressed; scan new and changed files; name the systemic cause when a category recurs. After `--max-rounds` rejected rounds, start no new round: list the open 🔴 findings with their failing inputs and ask the user to accept, rework once more, or re-scope.

## Output

Write each finding as one sentence chain: the defect, its concrete impact, and the specific fix.

```markdown
## qa-review Round {N} — {ACCEPTED | REJECTED}
Scope: {files, count} · Passes: {domains} · Summary: {one line}

### 🔴 REJECT-BLOCKING
- [F001] {file}:{line} {defect, impact, fix}
### 🟡 SHOULD-FIX
### 🔵 NIT
### Delta (round 2+): | ID | Prior finding | Status | Notes |

<!-- STATE_START … STATE_END -->
```

Without shell access, skip tool-gated checks and say so; never pretend they ran.
