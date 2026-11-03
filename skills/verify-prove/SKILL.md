---
name: verify-prove
description: "Prove shipped bits under real user journeys, robustness, and adversary pressure."
---

## Objective

Prove the exact bits a user or cluster will run, not a repository demo: artifact identity, clean-room install, real journeys, outcomes in the world, robustness, UX adequacy, and adversary resistance. `verify-test` proves the suite; hand suite discrimination to `verify-coverage` and claim certification to `verify-readiness`.

HTTP 200 or exit 0 on a happy path is smoke, never "E2E" or "production-level proof". PASS requires all of:

- frozen identity of the shipped artifact (digest or checksum), not a mutable tag;
- clean-room boot from that artifact, with no source-tree or hidden dev-cache dependency;
- real user or host entry points for every journey claimed in scope;
- real implementation, dependencies, data paths, and external effects throughout every evidence-bearing journey, with no substitute under any label or test name (`06-test-policy`);
- verified environment outcomes (database, file, config, process state), not agent or UI narration;
- robustness and adversary checks relevant to the claim; they are in scope by default, and excluding them narrows the claim;
- multi-trial evidence when the path is nondeterministic.

FAIL when identity is ambiguous, the flow needs the checkout, a required path is substituted, outcomes went unchecked, or Critical/High robustness or adversary gaps remain in scope.

## Input

- The claimed journeys and the support-matrix slice under proof.
- The artifact: image digest, binary checksum, bundle hash, generated-output identity, installer, or installed service path.
- The real dependencies required (services, credentials, hosts); a missing one is `BLOCKED`, never guessed.
- Prior `verify-coverage` or `verify-test` evidence when the suite is part of the trust story.

## Procedure

1. Freeze identity: record the Git SHA, version or build string, image digest or binary/bundle checksum, and schema, protocol, or mode IDs when applicable. Reject mutable references (`latest`, floating branch installs). If the artifact, bundle, or manifest does not exist, stop with FAIL or `BLOCKED`.
2. Clean room: install, unpack, or boot only from the shipped artifact in a fresh environment with no mounted source tree, developer caches, or local overrides users would not have. Gate on readiness or health signals, never fixed sleeps alone. A flow that works only with the checkout is FAIL. Inventory every component, dependency, data source, and external effect in each journey; any substitute makes that journey non-E2E and ineligible for PASS.
3. Real journeys: define each as a user-visible goal, not an internal API tour. Name the persona and goal (e.g. "operator installs MCP and sees tools in host"), invoke the real entry point (CLI, installer, UI, MCP client, HTTP API as customers use it), and grade UX with this rubric; transport success alone fails a UX claim.

   | UX check | Pass means |
   |---|---|
   | Goal completed | user-visible success state reached |
   | Feedback honest | errors are actionable; no false success |
   | No dead ends | the required next step is available or clearly blocked |
   | No privileged leakage | no secrets or internal paths in user-facing output |
   | Time bound | completes within the stated requirement, or fails visibly instead of hanging |

   Give every supported mode, engine, version, or exporter in the claimed scope at least one journey. A product-like claim needs at least the primary happy path, one failure path with honest feedback, and one recovery, retry, or restart path when lifecycle is claimed.
4. Outcomes: verify real backing state (rows, blobs, queues, manifests, merged config keys); logs, traces, and metrics for this version only, with secrets redacted; required bundle files present and forbidden ones absent (source tree, fixtures as production, prompt leakage, debug secrets). Grade the environment; agent self-reports and marketing copy are untrusted.
5. Live identity: confirm the running system matches the frozen record (digest, version, checksum, config family); a green journey on the wrong bits is FAIL.
6. Robustness, using readiness probes and explicit deadlines rather than fixed sleeps:

   | Check | Requirement |
   |---|---|
   | Concurrency | 2-5 parallel critical-path operations; zero correctness failures |
   | Dependency fault | timeout, down, or denied dependency yields controlled failure, not corruption or false success |
   | Restart / upgrade | when install or service lifecycle is claimed, restart or upgrade works or is `BLOCKED` with reason |
   | Idempotency / replay | where claimed, replay does not double-apply destructive effects |
   | Resource pressure | short bounded stress relevant to the claim; optional only when the claim excludes it |

7. Adversary: assume a hostile user or compromised tool path, on the exact task-authorized target (local, staging, or production) with bounded effects and rollback where applicable. When the surface accepts untrusted input, tools, or configs, cover at least: an authorization negative (a disallowed action is denied); injection, path, or merge abuse relevant to the product (config clobber, path escape, prompt or tool exfiltration); secrets absent from logs, errors, MCP memory, and generated user configs; and one domain-specific abuse case that would look healthy if only exit codes were checked. If the legal or engagement scope excludes adversary testing, mark these `BLOCKED` and claim no security or production readiness for them.
8. Trials: for models, races, or other nondeterminism run N trials (default at least 3; 1 may suffice for a fully deterministic path) and report passes out of N. A flaky journey is FAIL until stabilized or excluded from the claim.

## Output

```markdown
# PROOF COMPLETE

## Identity
- git_sha: `...`
- artifact: `...@sha256:...` or checksum
- version: `...`
- live_identity_match: yes|no

## Clean room
- install path: <cmd>
- source-tree dependency: no|yes (yes → FAIL)

## Journeys
- <journey>: PASS|FAIL — UX rubric notes — evidence
- failure-path: ...
- recovery-path: ...
- substitutes: none | <replacement> (any entry = FAIL for E2E/prove)

## Outcomes
- persistence: ...
- bundle required/forbidden: ...
- logs/traces: clean|issues

## Robustness
- concurrency: ...
- dependency fault: ...
- restart/upgrade: ...

## Adversary
- <case>: PASS|FAIL|BLOCKED

## Trials
- deterministic|N=<n> pass=<k>

## Verdict
PASS|FAIL|BLOCKED
```
