---
name: ops-nuke
phase: improve
description: "Respawn an unmaintainable project from its first commit in an isolated worktree while preserving the current implementation as rollback."
---

## OBJECTIVE

Rebuild the same project from a clean foundation when correcting the current implementation costs more than replacing it. This is neither file cleanup nor an aggressive refactor: inventory the existing product, freeze clear requirements, redesign the system, create a new branch from the repository's first commit in a separate worktree, remove that branch's old tracked tree, rebuild the product, prove required feature parity, and pause for final human review.

The original branch and worktree remain untouched as the executable reference and rollback path.

## When It Is Justified

Use `ops-nuke` only when evidence supports most of these; otherwise use `ops-clean`, `dev-refactor`, or `dev-fix`:

- the foundation or ownership model is wrong, not merely untidy;
- normal changes repeatedly multiply code, states, adapters, and regressions;
- duplicate implementations and compatibility layers prevent a reliable source of truth;
- tests cannot be trusted without rebuilding the contract;
- bounded cleanup or refactoring would retain the same failed design;
- the required product is understood well enough to rebuild;
- estimated rebuild and parity cost is lower than repair plus continuing maintenance.

## Stages

```text
assess -> inventory -> redesign -> arm -> rebuild -> compare -> final-review
```

A bare invocation starts at `assess`. It never implies that `arm` has passed.

## 1. Assess

Ground on the live repository: current branch, HEAD, remotes, worktrees, and staged, unstaged, ignored, and untracked state; root commit or roots, tags, releases, deployed artifacts, and supported versions; build, test, package, install, deployment, and runtime entry points; architecture, dependency graph, storage, migrations, external integrations, and operating constraints; measured change amplification and recurring failure patterns.

Compare `bounded repair | staged replacement | full respawn`. Recommend respawn only when it wins on expected delivery cost, retained complexity, proof difficulty, and future change cost; sunk cost is no reason to keep a failed design.

## 2. Inventory the Product

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

## 3. Redesign

Research the domain, current standards, proven libraries, and the repository's real operating environment before choosing the design.

- Match the architecture to the requested maturity.
- Prefer one process, one datastore, one owner, and one path until evidence requires more.
- Reuse old code only after it independently passes the new design's ownership, simplicity, and quality tests.
- Prefer proven libraries for established domain logic, but add a dependency only after maintenance, license, advisory, footprint, and compatibility review.
- Define vertical slices that produce observable product behavior.
- Define data migration, compatibility, cutover, and rollback only where the product contract requires them.

Use `boot-concept`, `arch-*`, `boot-new`, `dev-*`, `qa-*`, and `verify-*` as needed, not every workflow mechanically.

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

A vague yes given before the inventory and design exist does not arm. One informed confirmation arms the run; ask for no per-file approval afterward.

## 5. Create the Isolated Respawn

Only after the arm gate:

1. Re-read status and worktree state. If the original worktree changed, update the reference commit and inventory first.
2. Resolve exactly one first commit. If history has multiple roots, stop and ask which lineage defines the project.
3. Create a new linked worktree and branch from that commit:

```bash
git worktree add -b respawn/<name> <separate-path> <first-commit>
```

4. Verify the new worktree's branch, HEAD, path, and clean status.
5. Remove tracked project files only inside the respawn worktree. Never run reset, clean, checkout-overwrite, or deletion in the original worktree.
6. Run `boot-new` against the approved design and maturity, then build the first end-to-end slice.

The original worktree keeps all staged, unstaged, ignored, and untracked state. Nothing is copied into the respawn merely because it was dirty or recent.

## 6. Rebuild

For each vertical slice:

1. Implement the smallest complete user outcome.
2. Add discriminating tests through `dev-spec` when a behavior needs a new executable contract.
3. Exercise the real entry point and the dependencies available for that slice.
4. Compare against the feature matrix.
5. Remove scaffolding and duplicated paths before starting the next slice.

Do not recreate the old module map, abstractions, compatibility layers, or test harness by default. Copy a previous component only when it is simpler than replacement, matches the new ownership model, and has real proof.

## 7. Compare and Loop

Run an independent `qa-audit` and the applicable verification workflows against the respawn candidate. Record each required matrix row as `implemented | real proof passed | blocked | intentionally changed | missing`.

Green unit tests do not establish parity: compare observable behavior, data effects, packaging, configuration, and primary user journeys. Loop `rebuild -> compare` while required rows are missing or incorrect; when a round moves no row, stop and ask the user.

## 8. Final Human Review

Pause when every required feature is implemented or explicitly blocked; deliberate removals and behavior changes are visible; the candidate's architecture and remaining limits are documented; relevant checks and real journeys have run; and the exact diff and branch are ready for review.

`ops-nuke` never replaces the default branch, merges, force-pushes, deletes the original branch, or removes the original worktree; those are separate user-authorized publication and cleanup decisions after final review.

## Abort and Rollback

At any point before publication, stop using the respawn worktree; the original implementation remains unchanged. Keep or remove the respawn branch and worktree only as the user directs; never destroy them merely to make the attempt look clean.

## Output

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
