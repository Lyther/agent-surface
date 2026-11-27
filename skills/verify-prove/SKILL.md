---
name: verify-prove
description: "Use when verifying shipped bits or installers under real user journeys, robustness, and adversary pressure."
---

## Objective

Prove the exact bits a user or cluster will run, not a repository demo: artifact identity, clean-room install, real journeys, outcomes in the world, robustness, UX adequacy, and adversary resistance. `verify-test` proves the suite; hand suite discrimination to `verify-coverage` and claim certification to `verify-readiness`.

HTTP 200 or exit 0 on a happy path is smoke, never "E2E" or "production-level proof". PASS requires all of:

- frozen identity of the shipped artifact (digest or checksum), not a mutable tag;
- clean-room boot from that artifact, with no source-tree or hidden dev-cache dependency;
- real user or host entry points for every journey claimed in scope;
- real implementation, dependencies, data paths, and external effects throughout every evidence-bearing journey, with no substitute under any label or test name (`rules/test.md`);
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
6. Robustness (apply the checks relevant to the target's surface, using readiness probes rather than fixed sleeps):

   | Check | Requirement |
   |---|---|
   | Concurrency | when stateful/concurrent paths exist, run parallel operations and verify zero correctness failures |
   | Dependency fault | timeout, down, or denied dependency yields controlled failure, not corruption or false success |
   | Restart / upgrade | when install or service lifecycle is claimed, restart or upgrade works or is `BLOCKED` with reason |
   | Idempotency / replay | where claimed, replay does not double-apply destructive effects |
   | Resource pressure | bounded load relevant to the claim; optional when excluded |

7. Adversary (when the target handles untrusted inputs, configs, privileges, or external boundaries): test authorization negatives, injection/path/merge abuse, secret absence from logs/configs/memory, and a domain abuse case. If engagement scope excludes adversary testing, state that scope exclusion clearly.
8. Trials: for races, models, or nondeterministic paths run N trials (at least 3) and report passes out of N; 1 trial suffices for deterministic flows. A flaky journey fails until stabilized or excluded from the claim.

## Output

Report:
- **Identity & Clean Room**: SHA/checksum/version verified; clean-room boot without checkout overrides
- **Journeys & Outcomes**: pass/fail per journey, real state verified, any substitutes (none allowed on PASS E2E journeys)
- **Robustness / Adversary / Trials**: checks run or `n/a` (deterministic/single-user)
- **Verdict**: `PASS | FAIL | BLOCKED` with blockers if any
