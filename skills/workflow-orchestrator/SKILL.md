---
name: workflow-orchestrator
description: "Run risk-adaptive development, review, multi-agent, and release workflows with runtime preflight, bounded retries, liveness checks, isolated writers, and evidence-backed handoffs."
---

## Objective

Control the execution shape without becoming the implementer, reviewer, or release judge. Default to one owner; add roles only when risk, independent parallelism, or release proof requires them. The orchestrator owns routing, runtime selection, liveness, isolation, and handoffs; role commands own their work; repository state and real checks outrank agent narration.

## 1. Admission Control (required)

Run `ops-flow` against the request and repository evidence, and record its routing object before spawning anything. Follow exactly one profile:

```text
direct      -> return to the current session for the bounded edit
standard    -> one route-specific owner; no BOSS, formal ledger, or external reviewer
reviewed    -> one writer -> local verification -> one independent read-only reviewer
orchestrated-> BOSS -> isolated workers -> integration -> reviewer using workflow.v3
release     -> freeze candidate -> build/prove -> independent release QA using workflow.v3 when durable state is needed
audit       -> read-only QA/analysis; no implementation without a new route decision
parallel    -> bounded read-only probes or isolated proposals; one owner consolidates
ship        -> route to the requested shipping command after accepted evidence exists
```

- `direct` or `standard`: collapse the workflow immediately; never open `.agent-surface/workflows/` merely because this command was invoked.
- `reviewed`: a lightweight loop whose handoff is the Git diff and check output. Create no BOSS, judger, or rescue artifacts. Allow at most two developer-review cycles; repeated disagreement needs a human decision or a fresh route classification.
- Only `orchestrated` and `release` may create or rehydrate the formal workflow ledger.

## 2. Minimum Contract

Give the writer of a bounded fix:

```text
Objective:
Current behavior:
Expected behavior:
Must remain unchanged:
Filescope:
Acceptance checks:
```

For an orchestrated or release run, invoke `workflow-boss` (at most five tasks per batch, normally three or fewer). BOSS must prove that at least two writable tasks are independent and isolated, or that the run needs durable long-running/release state a lightweight loop cannot preserve safely; otherwise downgrade to `reviewed` or `standard`.

## 3. Runtime

- Use the current runtime's native subagent or agent-manager tools first when they can select the required model, isolate the task, and materialize the required artifact; never open a terminal merely to launch another copy of the current runtime. For example, a Kilo VS Code driver queries `agent_manager_models` and launches through `agent_manager`; Kilo CLI uses its native `task` subagents when they fit.
- Use an external headless runtime when native delegation lacks a required model or capability, or when a different provider family materially improves independence. Provider diversity is optional for ordinary work and valuable for independent high-risk review only after operational fit is proven; start from the current dated recommendation table in `ops-swarm`.
- Before assigning any external/headless runtime, verify the exact candidate with `workflow-runtime`. The probe must read an exact repository path, identify a verifiable symbol or value, run a harmless repository command, (for writers) create a scratch edit and return a diff, materialize the required output artifact, and report the actual model/runtime identity and output shape. Chat success is not a worker preflight; a runtime that cannot materialize its handoff is ineligible for that role.
- Full-execution consent covers the external service calls, provider probes, live installs, and networked launches the task requires. Inject only the named credential the selected provider needs; never print secrets, dump `.env`, or send raw customer data or unrelated repository content.
- Select by, in order: driver-native delegation with adequate model, isolation, and artifact control; tool and repository fit; privacy and authorization fit; task quality; liveness and reliability; latency and cost; provider-family independence when review independence matters. Never infer capability from a model name, extension login, prior snapshot, or provider reputation.

## 4. Execute the Profile

### Standard

```text
locate -> implement -> focused check -> broader relevant gate -> self-review -> report
```

One owner does all of it; spawn no planner, reviewer, or rescue role. The owner may use read-only subagents for independent discovery but stays responsible for the patch and checks.

### Reviewed

```text
writer -> verify -> independent reviewer
                    | PASS -> done
                    | findings -> same writer repairs -> verify -> reviewer
                    | repeated dispute/failure -> human or reroute
```

- One active writer owns the filescope. The read-only reviewer receives the contract, exact diff, checks, and relevant source, and reports severity-ranked, evidenced defects; style preferences never trigger rework.
- For high/critical review, use a different model family when an approved, operationally proven runtime exists; otherwise record degraded independence and require stronger deterministic evidence or human review.
- Maximum two rework cycles.

### Orchestrated

```text
workflow-boss -> isolated worker sessions -> integration -> workflow-reviewer
                    |                                  |
                    +-- rework, max two cycles --------+
                    +-- repeated substantive failure -> workflow-judger
```

- Execution stays serial by default. Parallel writers need disjoint filescopes, no dependency edge, separate worktrees, and no shared generated output, lockfile, migration, service port, database, or fixture.
- One integration owner reconciles worker output before review.
- When concurrent agents use Synapse, give each process a distinct `SYNAPSE_AGENT_ID` and the run a shared `SYNAPSE_PROJECT`; leave both unset for a single-agent run, and never persist these process-local values in artifacts.
- Use `workflow-rescue` only after a concrete spec/context/runtime failure that one retry or normal rework cannot resolve; never spawn rescue to restate a stall.
- Formal role state advances only through `agent-surface workflow apply`, which trusts its caller: run one apply at a time, apply only the current round's artifact for the role `run.json` routes to, and keep each `run_state_update` consistent with its verdict.

### Release

```text
freeze source identity -> build artifact -> real acceptance/proof -> independent QA -> readiness decision
```

Do not freeze or prove every intermediate patch. A failed acceptance invalidates the candidate: fix the product, freeze a new candidate, and rerun the relevant proof.

## 5. Liveness and Recovery (required)

For formal `orchestrated` or `release` sessions, create `.agent-surface/workflows/<run_id>/agents.json` with `schema_version: workflow.monitor.v2`, holding run-level retry/review policy and per-agent liveness budgets. It is mutable monitor state, not product evidence, and never committed. A `reviewed` loop enforces the same budgets through the host's native session controls and concise progress updates, without opening a formal ledger for monitor state.

Default budgets unless repository evidence justifies another value:

| Role | First materialized output | No-progress timeout | Role timeout |
| --- | ---: | ---: | ---: |
| plan/BOSS | 2 min | 3 min | 10 min |
| worker | 3 min | 5 min | 40 min |
| reviewer/QA | 3 min | 5 min | 15 min |
| judger/rescue | 2 min | 3 min | 10 min |

A progress event references real activity: an inspected file, a materialized plan/diff/artifact, a command start or finish, a check result, or a blocker. Repeated prose such as "still working" is not progress.

On timeout:

1. Poll once and inspect the latest real output.
2. Interrupt or terminate the stalled session when the runtime supports it.
3. Retry once with the same contract and fresh context, or switch to an already-probed compatible runtime.
4. After a second stall on the same role/task, downgrade to a simpler profile or require human input; start no unbounded rescue chain.
5. Mark late output from superseded sessions `stale`; it never overwrites current ledger state.

Run `agent-surface workflow doctor --run <run_id>` before each formal transition. Stale heartbeats, contradictory task buckets, malformed monitor state, or mismatched ledger transitions fail closed.

## 6. Measure

Record actual values when available: wall time and time to first materialized output; implementation, verification, review, and orchestration time; runtime/model identity, token usage, and cost; stalls, retries, rework cycles, reviewer findings, and acceptance failures; and the downstream verdict on each role's output. Never persist thinking/chain-of-thought text; store only whether reasoning was enabled or present, trace handling, usage, final output, and verdict.

If orchestration consumes more time than implementation on a non-release task, or no real parallelism remains, collapse the next round to `reviewed` or `standard` and record why.

## Terminal Conditions

Stop only when the selected lightweight profile completed its checks and required review; `workflow-close` closed or aborted the formal run; a role set `requires_human: true` with a concrete decision needed; an external prerequisite blocks the required acceptance path; or the run was quarantined because source, artifact, or ledger identity is inconsistent. A role returning is a handoff, not automatically completion; a stalled runtime is an execution failure, not a product blocker.

## Output

```text
Profile: standard|reviewed|orchestrated|release|audit|parallel|ship
State: developing|verifying|reviewing|acceptance|done|blocked|stalled
Owner: <role/runtime>
Materialized: <diff/artifact/check ref or none>
Elapsed: <wall time>
Next: <command/action or human decision>
```

## Anti-Patterns

- Forcing BOSS -> worker -> reviewer -> judger -> rescue on a linear fix.
- Counting several CLIs that resolve to one model family as provider independence.
- Parallelizing overlapping writers, or waiting indefinitely without materialized progress.
- Treating a runtime stall as evidence that the implementation is blocked.
- Counting self-created workflow artifact defects as product-quality wins.
- Keeping both canonical and manually maintained copies of the same state; the ledger is authoritative and other views are derived.
