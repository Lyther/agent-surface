---
name: ops-nuke
phase: improve
description: "Respawn an unmaintainable project from its first commit in an isolated worktree while preserving the current implementation as rollback."
---

## OBJECTIVE

Rebuild the same project from a clean foundation when correcting the current implementation costs more than replacing it.

This is not file cleanup and not an aggressive refactor. It inventories the existing product, freezes clear requirements, redesigns the system, creates a new branch from the repository's first commit in a separate worktree, removes that branch's old tracked tree, rebuilds the product, proves required feature parity, and pauses for final human review.

The original branch and worktree remain untouched as the executable reference and rollback path.

## WHEN IT IS JUSTIFIED

Use `ops-nuke` only when evidence supports most of these:

- the foundation or ownership model is wrong, not merely untidy;
- normal changes repeatedly multiply code, states, adapters, and regressions;
- duplicate implementation and compatibility layers prevent a reliable source of truth;
- tests cannot be trusted without rebuilding the contract;
- bounded cleanup or refactoring would retain the same failed design;
- the required product is sufficiently understood to rebuild;
- estimated rebuild and parity cost is lower than repair plus continuing maintenance.

If those conditions are not met, use `ops-clean`, `dev-refactor`, or `dev-fix`.

## STAGES

```text
assess -> inventory -> redesign -> arm -> rebuild -> compare -> final-review
```

A bare invocation starts at `assess`. It never implies that `arm` has passed.

## 1. ASSESS

Ground on the live repository:

- current branch, HEAD, remotes, worktrees, status, staged, unstaged, ignored, and untracked state;
- root commit or roots, tags, releases, deployed artifacts, and supported versions;
- build, test, package, install, deployment, and runtime entry points;
- architecture, dependency graph, storage, migrations, external integrations, and operating constraints;
- measured change amplification and recurring failure patterns.

Compare three routes:

```text
bounded repair | staged replacement | full respawn
```

Recommend respawn only when it wins on expected delivery cost, retained complexity, proof difficulty, and future change cost. Sunk cost is not a reason to preserve a failed design.

## 2. INVENTORY THE PRODUCT

Treat the current implementation as evidence, not authority. Build a concise feature and contract matrix:

| Surface | Current behavior | Required in respawn | Deliberate change | Acceptance proof |
| --- | --- | --- | --- | --- |
| User journeys | | keep/drop/change | | |
| API/CLI/UI | | keep/drop/change | | |
| Data and migrations | | keep/drop/change | | |
| Integrations/config | | keep/drop/change | | |
| Packaging/operations | | keep/drop/change | | |
| Reliability/security/performance | | keep/drop/change | | |

Use real execution and released artifacts where possible. Separate required behavior from accidental behavior, obsolete compatibility, and known bugs. No feature silently disappears.

## 3. REDESIGN

Research the domain, current standards, proven libraries, and the repository's real operating environment before selecting the new design.

- Match the architecture to the requested maturity.
- Prefer one process, one datastore, one owner, and one path until evidence requires more.
- Reuse old code only after it independently passes the new design's ownership, simplicity, and quality tests.
- Prefer proven libraries for established domain logic, but add no dependency without maintenance, license, advisory, footprint, and compatibility review.
- Define vertical slices that produce observable product behavior.
- Define data migration, compatibility, cutover, and rollback only where the product contract requires them.

Use `boot-concept`, `arch-*`, `boot-new`, `dev-*`, `qa-*`, and `verify-*` as needed. Do not run every workflow mechanically.

## 4. ARM GATE

Before creating or clearing the respawn worktree, present:

```text
Current reference branch and commit:
First commit:
Respawn branch:
Respawn worktree path:
Dirty-state preservation:
Required feature matrix:
Deliberate removals or changes:
New architecture:
Data migration:
Acceptance checks:
Rollback path:
Estimated rebuild boundary:
```

Then ask:

> This will create an isolated branch from the first commit and delete that branch's tracked project tree before rebuilding it. The current worktree, branch, dirty files, and history remain unchanged. Do you understand the respawn boundary, and is this the project and requirement set you want rebuilt?

Do not arm on a vague yes given before the inventory and design exist. One informed confirmation arms the run; do not ask for repeated per-file approval afterward.

## 5. CREATE THE ISOLATED RESPAWN

After the arm gate:

1. Re-read status and worktree state. If the original worktree changed, update the reference commit and inventory before proceeding.
2. Resolve exactly one first commit. If history has multiple roots, stop and ask which lineage defines the project.
3. Create a new linked worktree and branch from that commit:

```bash
git worktree add -b respawn/<name> <separate-path> <first-commit>
```

4. Verify the new worktree's branch, HEAD, path, and clean status.
5. Remove tracked project files only inside the respawn worktree. Never run reset, clean, checkout-overwrite, or deletion in the original worktree.
6. Run `boot-new` against the approved design and maturity, then build the first end-to-end slice.

The original worktree keeps all staged, unstaged, ignored, and untracked state. Nothing is copied into the respawn merely because it was dirty or recent.

## 6. REBUILD

For each vertical slice:

1. Implement the smallest complete user outcome.
2. Add discriminating tests through `dev-spec` when a behavior needs a new executable contract.
3. Exercise the real entry point and dependencies available for that slice.
4. Compare against the feature matrix.
5. Remove scaffolding and duplicated paths before starting the next slice.

Do not recreate the old module map, abstractions, compatibility layers, or test harness by default. Copy a previous component only when it is simpler than replacement, matches the new ownership model, and has real proof.

## 7. COMPARE AND LOOP

Run an independent `qa-audit` and the applicable verification workflows against the respawn candidate.

For every required matrix row, record:

```text
implemented | real proof passed | blocked | intentionally changed | missing
```

Green unit tests do not establish parity. Compare observable behavior, data effects, packaging, configuration, and primary user journeys. Loop `rebuild -> compare` while required rows are missing or incorrect.

## 8. FINAL HUMAN REVIEW

Pause when:

- every required feature is implemented or explicitly blocked;
- deliberate removals and behavior changes are visible;
- the candidate's architecture and remaining limits are documented;
- relevant checks and real journeys have run;
- the exact diff and branch are ready for review.

Do not replace the default branch, merge, force-push, delete the original branch, or remove the original worktree as part of `ops-nuke`. Those are separate user-authorized publication and cleanup decisions after final review.

## ABORT AND ROLLBACK

At any point before publication, stop using the respawn worktree. The original implementation remains unchanged. Keep or remove the respawn branch/worktree only as the user directs; never destroy it merely to make the attempt look clean.

## OUTPUT

```markdown
## Respawn State
- Stage:
- Original reference:
- Respawn branch/worktree:
- Arm confirmation:

## Feature Matrix
- Required / passed / blocked / missing:

## Architecture
- Chosen shape:
- Reused old code:
- Rejected old complexity:

## Evidence
- Checks:
- Real journeys:
- Audit findings:

## Next Gate
- Required action or final-review question:
```
