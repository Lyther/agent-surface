---
name: dev-converge
phase: build
description: "Compare competing implementations and keep the strongest verifiable result."
---
## OBJECTIVE

Compare multiple candidate implementations from parallel workers, branches, worktrees, or swarm packets. Select the strongest verifiable result, transplant only isolated improvements when they are worth the risk, and leave a clean worker-style handoff.

Do not mash patches together. Prefer one primary implementation plus small, verified logical transplants. Atomic replacement beats line-by-line blending.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Focus on the conflict, not the consensus.*

1. **Diff View**:
    - Only look at the *Difference* between Alpha and Beta.
    - **Prompt**: "Show me `func process()` in Agent A vs Agent B."
2. **Function Level**:
    - Do not try to merge huge files. Merge functions.

## WORKFLOW MODE

When invoked from `workflow-orchestrator` or `ops-swarm`, use the workflow ledger as authority:

- Read `run_id`, task IDs, filescope, verify commands, patch manifests, and packet evidence from the active workflow run.
- Treat swarm packet reports and worktree refs as evidence, not as merge approval.
- Preserve task IDs and artifact refs in the final handoff.
- Do not introduce a new workflow role. `dev-converge` is a worker route for consolidation work.
- If candidates share unisolated hunks or generated outputs, stop and request serial rework instead of forcing a merge.

## PARALLEL IMPLEMENTATION INTEGRATION

When AI tries multiple approaches in parallel:

- Each attempt is a worktree/branch
- Test-driven selection picks the winner
- Atomic transplants harvest good ideas from losers
- No blended line-level merges

## PROTOCOL

### Phase 0: Setup

1. Identify candidate worktrees, branches, or packet refs.
2. Confirm they share the same intended base or record the base mismatch.
3. Confirm each candidate is isolated from the others.

### Phase 1: Qualify Candidates

1. Run the assigned verify commands, or the cheapest equivalent proof, on every candidate.
2. Reject candidates that fail compilation, tests, or required generated-output checks.
3. Do not inspect failed candidates for transplants unless the failure is unrelated to the candidate's useful isolated block and the block can be verified independently.

### Phase 2: Select Primary Implementation

1. Compare surviving candidates by:
    - Alignment with `arch-api`
    - Test coverage & negative-path handling
    - Simplicity (lower complexity, fewer deps)
    - Behavior preservation
    - Blast radius
2. Designate one candidate as the primary implementation.

### Phase 3: Atomic Transplants

1. Identify missing improvements that are isolated and valuable.
2. Do not `git merge` or commit-level `cherry-pick` competing worker outputs.
3. Copy the whole logical block: function, class, enum, schema entry, test case, or documentation section.
4. Run the assigned verify command after each transplant.
5. Revert a transplant immediately if it fails verification or creates style/API inconsistency.

### Phase 4: Final Handoff

1. **Unified Diff**: Compare against the base branch (usually `main`/`master`, but trust `git symbolic-ref refs/remotes/origin/HEAD`, not assumption).
2. **Security/Quality**: Run the assigned lint, type, test, generated-output, or SAST checks.
3. **Cleanup**: Remove temporary worktrees only when they are clearly created for this convergence run and no evidence still depends on local-only files.
4. **Commit**: Hand off to `ship-commit` rather than running `git commit` inline.

## OUTPUT FORMAT

**The Synthesis Log**

```markdown
# CONVERGE REPORT

## Primary Implementation
- Agent-02: best architecture, strictly typed.

## Transplants
- From Agent-01: ported `retry_logic()` after `npm test` passed.
- From Agent-04: ported `InputValidation` after negative-path test passed.

## Rejected Candidates
- Agent-03: failed compilation.

## Verdict
Branch `feat/login-final` is ready for review.
```

## EXECUTION RULES

1. **FUNCTION-LEVEL ATOMICITY**: Replace the WHOLE function. No mixed hybrids.
2. **TEST-DRIVEN GRAFTING**: No transplant without a passing test demonstrating its value.
3. **STYLE CONSISTENCY**: Conform to Alpha’s style (async/await vs other patterns).
