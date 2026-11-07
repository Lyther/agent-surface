---
name: dev-converge
description: "Compare competing implementations and keep the strongest verifiable result."
---

## Objective

Compare candidate implementations from parallel workers, branches, worktrees, or swarm packets; select the strongest verifiable result, transplant only isolated improvements worth their risk, and leave a clean worker-style handoff. Keep one primary implementation plus small, verified, whole-block transplants; never mash patches together or blend them line by line. Look only at where candidates differ (e.g. `func process()` in agent A vs agent B), and merge functions, not huge files.

## Workflow Mode

When invoked from `workflow-orchestrator` or `ops-swarm`, the workflow ledger is the authority:

- Read `run_id`, task IDs, filescope, verify commands, and packet evidence from the active workflow run. Swarm packet reports and worktree refs are evidence, not merge approval.
- Preserve task IDs and artifact refs in the final handoff. `dev-converge` is a worker route for consolidation work, not a new workflow role.
- If candidates share unisolated hunks or generated outputs, stop and request serial rework instead of forcing a merge.

## Procedure

1. Setup: identify the candidate worktrees, branches, or packet refs; confirm they share the intended base or record the mismatch; confirm each candidate is isolated from the others.
2. Qualify: run the assigned verify commands, or the cheapest equivalent proof, on every candidate, and reject those that fail compilation, tests, or required generated-output checks. Inspect a failed candidate for transplants only when the failure is unrelated to its useful isolated block and that block can be verified independently.
3. Select the primary by alignment with `arch-contract`, required behavior covered with the least added code, simplicity (lower complexity, fewer dependencies), behavior preservation, and blast radius.
4. Transplant isolated, valuable improvements the primary lacks by copying the whole logical block (function, class, enum, schema entry, test case, or documentation section); never `git merge` or commit-level `cherry-pick` competing worker outputs. Each transplant needs a passing test that demonstrates its value: run the assigned verify command after each one, and revert it immediately if it fails verification or creates style/API inconsistency. Conform to the primary's style (e.g. async/await).
5. Hand off:
   - Diff against the base branch, trusting `git symbolic-ref refs/remotes/origin/HEAD` rather than assuming `main`/`master`.
   - Run the assigned lint, type, test, generated-output, or SAST checks.
   - Remove temporary worktrees only when this convergence run clearly created them and no evidence still depends on local-only files.
   - Hand off to `ship-commit` rather than running `git commit` inline. In workflow mode, instead write `worker.json` as the routed `dev-*` role, run `agent-surface workflow apply --role <that dev-* role> --run <run_id> --artifact .agent-surface/workflows/<run_id>/worker.json`, and hand off to `workflow-reviewer`.

## Output

```markdown
# CONVERGE REPORT

## Primary Implementation
- Agent-02: best architecture, strictly typed.

## Transplants
- From Agent-01: ported its date parser, which fixes a case the primary fails, after `npm test` passed.

## Rejected Candidates
- Agent-03: failed compilation.

## Verdict
Branch `feat/login-final` is ready for review.
```
