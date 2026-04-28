## OBJECTIVE

**SURVIVAL OF THE FITTEST.**
You have $N$ parallel realities (Worktrees).
Do not mash them together.
**Pick the Winner (The Alpha). Loot the Losers (The Betas). Kill the Rest.**
**Core Logic**: Atomic Replacement > Line Merging.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Focus on the conflict, not the consensus.*

1. **Diff View**:
    - Only look at the *Difference* between Alpha and Beta.
    - **Prompt**: "Show me `func process()` in Agent A vs Agent B."
2. **Function Level**:
    - Do not try to merge huge files. Merge functions.

## VIBE CODING INTEGRATION

When AI tries multiple approaches in parallel:

- Each attempt is a worktree/branch
- Test-driven selection picks the winner
- Atomic transplants harvest good ideas from losers
- No Frankenstein merges

## PROTOCOL

### Phase 0: Setup (Parallel Realities)

1. **Create Worktrees**: `git worktree add ../wt-A <base>` (repeat per agent)
2. **List**: `git worktree list`
3. **Isolate**: Each agent works in its own worktree; no shared state

### Phase 1: The Killing Field (Qualifying)

*Dead code tells no tales.*

1. **Parallel Test**: Run `verify-test` (unit/integration) on ALL active agent worktrees
2. **The Cull**:
    - If an Agent fails compilation or tests → **DELETE WORKTREE**: `git worktree remove ../wt-X`
    - Do not inspect further

### Phase 2: The Alpha Selection (King of the Hill)

*Who has the strongest bones?*

1. **Compare Survivors**:
    - Alignment with `arch-api`
    - Test coverage & negative-path handling
    - Simplicity (lower complexity, fewer deps)
2. **Designate Alpha**: Checkout as `feat/consolidated-temp`. This is the **Truth**.

### Phase 3: The Organ Harvesting (Atomic Grafting)

*Apply "Atomic Cherry-Pick" at function/class granularity.*

1. **Feature Audit**: Identify missing wins in Alpha
2. **The Transplant**:
    - **Do NOT** `git merge`
    - **Do NOT** commit-level `cherry-pick`
    - **DO** copy the specific **Logical Block** (Function/Class/Enum) wholly
3. **Verify**: Run `verify-test` immediately after each transplant. Revert if failing.

### Phase 4: The Final Polish

1. **Unified Diff**: Compare against the base branch (usually `main`/`master`, but trust `git symbolic-ref refs/remotes/origin/HEAD`, not assumption).
2. **Security/Quality**: Lint, type-check, SAST pass. Run `/qa:review` against the consolidated diff before any commit.
3. **Commit**: Hand off to `ship-commit` rather than running `git commit` inline — it detects repo mode and applies the right subject form (`feat: synthesized from agents A, B, C` for Conventional Commits, `subsystem: …` for kernel).
4. **Tag**: Create a local checkpoint tag (e.g., `checkpoint-converge-<date>`). Do NOT push tags as a side effect — that requires explicit consent per `ship-release`.
5. **Nuke**: Delete the spent worktrees (`git worktree remove ../wt-*`) and prune (`git worktree prune`).

## OUTPUT FORMAT

**The Synthesis Log**

```markdown
# 🧬 CONVERGE REPORT

## 🏆 The Alpha (Base)
- **Agent-02**: Best architecture, strictly typed.

## 🫀 Transplants (Looted from Betas)
- **From Agent-01**: Ported `retry_logic()` (Better backoff strategy).
- **From Agent-04**: Ported `InputValidation` struct (Handled unicode edge case).

## 🗑️ The Fallen (Discarded)
- **Agent-03**: Failed compilation. Deleted.

## Verdict
**Branch `feat/login-final` is ready.**
```

## EXECUTION RULES

1. **FUNCTION-LEVEL ATOMICITY**: Replace the WHOLE function. No mixed hybrids.
2. **TEST-DRIVEN GRAFTING**: No transplant without a passing test demonstrating its value.
3. **STYLE CONSISTENCY**: Conform to Alpha’s style (async/await vs other patterns).
