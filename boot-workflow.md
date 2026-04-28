## OBJECTIVE

Keep ASCII workflow diagrams out of rule files (prompt token budget), but still available on demand.

## DIAGRAMS

### Command protocol

```text
User invokes command (e.g., "dev-refactor", "arch-roadmap")
    ↓
1. In context?     → EXECUTE
2. On disk?        → READ ~/.cursor/commands/<prefix>-<name>.md → EXECUTE
3. Unknown?        → ASK user. DO NOT HALLUCINATE A PROCESS.
```

### Vibe coding loop

```text
┌─────────────────────────────────────────────────┐
│  1. UNDERSTAND → What exactly does user want?   │
│  2. PLAN       → Break into atomic steps        │
│  3. IMPLEMENT  → One step at a time             │
│  4. VERIFY     → Test immediately               │
│  5. ITERATE    → Course-correct based on result │
└─────────────────────────────────────────────────┘
```

### Workflow map

```text
                  [boot-new]
                       ↓
[boot-context] → [arch-roadmap] → [arch-model] → [arch-api]
                                        ↓
                                  [arch-breakdown]
                                        ↓
                                ┌→ [dev-feature] ──┐
                                ↓       ↓          ↓
[ops-monitor] ← [ship-deploy]   | [verify-test]    |
     ↑                ↑         ↓       ↓          ↓
[ops-debug] ──→ [dev-fix] ──────┴─ [dev-refactor] ←┘
     ↑                ↑
       [qa-pentest]
```

### Structured workflow (v2 — batched rounds)

For medium/high-risk tasks requiring formal spec → implement → verify → review cycles. **A round processes a batch of tasks**, not a single task.

```text
[workflow-boss] [spec: filescope + tasks[] (1..N) + per-task AC/verify + batch_policy]
    |
    v
feature path: [dev-feature] burns the queue
              for each task in tasks[]:
                implement → run task.verify → record result
                stop on: blocker | context_pressure | queue_empty | max_tasks_cap
    |
    v
fix path: [dev-fix] burns the queue (same loop, regression-test-first)
    |
    v
[workflow-reviewer] [per-task verdict + aggregate PASS / PARTIAL / REJECT]
    |                      |                   |
    | PASS (all tasks)     | PARTIAL           | REJECT
    v                      v                   v
MERGE/SHIP           rework only failing   FIX → VERIFY → REVIEWER (loop)
                     task IDs                       |
                                                    v
                            any task hits consecutive_rejections>=2:
                              → [workflow-judger]
                                  ├── MERGE          (all PASS)
                                  ├── MERGE_PARTIAL  (cherry-pick passing task IDs, rework the rest)
                                  ├── REWORK         (task-scoped re-implementation)
                                  ├── RESPEC         (back to workflow-boss)
                                  └── RESCUE         → [workflow-rescue] for takeover / human escalation
```

### File workflow mode

Use this only for the **manual stage workflow**. There is no background daemon, no database, and no shared state file.

```text
[workflow-boss] -> writes spec + task queue into `.cursor/.workflow/boss.json`
                   (schema_version: workflow.v2; tasks: [T1..TN])

feature route:
  [dev-feature] -> burns the queue, writes per-task results into `.cursor/.workflow/worker.json`
                   (includes self-audit per task; stop_reason recorded) -> [workflow-reviewer]

fix route:
  [dev-fix] -> same shape, with per-task regression proofs -> [workflow-reviewer]

review outcomes:
  PASS              -> [workflow-boss] decides next batch or closes run
  PARTIAL/REJECT    -> first time, route back to dev-feature/dev-fix scoped to failing task IDs
                       (workers carry forward the same run_id and re-attempt only those tasks)
  any task at       -> [workflow-judger] (may MERGE_PARTIAL the passing tasks while
  consecutive >= 2     escalating the stuck ones)
  ESCALATE          -> [workflow-judger] -> [workflow-rescue] when takeover is needed
```

## ROLE FILE CONTRACT

### Scope

- Project-local only: `.cursor/.workflow/`
- Gitignored local state only. Never commit or push it.
- Single active run only.
- Workflow mode starts when `.cursor/.workflow/boss.json` exists.
- `dev-feature` uses workflow mode when `boss.json` says the route is `feature`.
- `dev-fix` uses workflow mode when `boss.json` says the route is `fix`.
- No `state.json`. No `next-command.txt`. The role files themselves are the handoff surface.
- At most one downstream handoff file should point back to `dev-feature` or `dev-fix`. If multiple do, prefer the newest file by mtime and treat older ones as stale.
- Every role file should carry `schema_version`, `workflow.owner`, `workflow.run_id`, and `workflow.next_command`.
- Current schema is `workflow.v2` (batched rounds). v1 (single-task per run) is no longer produced; if a v1 file is encountered, fail closed and rerun `workflow-boss` to regenerate the spec.
- `workflow.run_id` must match across active role files. A mismatch means the handoff is stale and the command must fail closed or route to `workflow-boss`.
- The BOSS spec carries a `tasks[]` array. Workers iterate tasks in order; reviewers/judgers/rescuers operate at task granularity. Per-task `consecutive_rejections` is tracked separately for each `task_id` — one stuck task does not pollute the others' counters.

### Ownership

- Inside `.cursor/.workflow/`, each role may only create or replace its own role file.
- `workflow-boss` owns `boss.json`.
- `dev-feature` and `dev-fix` own `worker.json`.
- `workflow-reviewer` owns `reviewer.json`.
- `workflow-judger` owns `judger.json`.
- `workflow-rescue` owns `rescue.json`.
- A role may read other role files, but it must not edit, repair, delete, truncate, or rewrite them.
- Exception: `workflow-boss` may delete stale downstream role files when starting a fresh run.
- Worker commands may still edit source/test files within BOSS FILESCOPE; this ownership rule only governs `.cursor/.workflow/*.json`.

### Required files

- `boss.json` — always present in workflow mode
- `worker.json` — implementation handoff for both feature and fix routes, created on demand
- `reviewer.json` — review handoff, created on demand
- `judger.json` — escalation handoff, created only when reviewer escalates
- `rescue.json` — takeover handoff, created only when judger or the user escalates to rescue

### Stage rules

- `workflow-boss` writes the BOSS spec into `boss.json` and clears stale downstream files: `worker.json`, `reviewer.json`, `judger.json`, and `rescue.json`.
- `dev-feature` reads `boss.json` plus the latest reviewer/judger/rescue rework notes when `workflow.next_command = 'dev-feature'`, then writes `worker.json`.
- `dev-feature` folds self-audit into `worker.json`. There is no separate self-critique stage file.
- `dev-fix` reads `boss.json` plus the latest reviewer/judger/rescue rework notes when `workflow.next_command = 'dev-fix'`, then writes `worker.json`.
- `workflow-reviewer` reads `boss.json`, `worker.json`, prior `reviewer.json`, and runner evidence, then writes `reviewer.json`.
- `workflow-reviewer` routes first rejection back to the route-specific worker, but two consecutive rejected rounds for the same `run_id` must route to `workflow-judger`.
- `workflow-judger` and `workflow-rescue` read the current role files instead of requiring manual copy-paste when workflow mode is active.

### Artifact contract

Every workflow-aware command should write a normalized JSON payload into its own role file.
Every role file should carry a `workflow.next_command` field so the next handoff is machine-readable without a separate state file.

Minimum expectations (v2):

- **boss**: full BOSS JSON v2 — goal, batch-level FILESCOPE, `tasks[]` (each with narrowed FILESCOPE, plan, AC, verify, depends_on, risk_notes), `batch_policy` (`stop_on`, `context_pressure_threshold_pct`, `max_tasks_per_round`, `drift_check_every`), route, and next handoff.
- **worker**: per-task processing log — `tasks_processed[]` (each with task_id, status, summary, touched, evidence_refs, verify_results, self_audit, blocker), `remaining[]`, `stop_reason`, `stop_detail`. Feature route includes merged self-audit per task; fix route includes regression proof per task.
- **reviewer**: per-task verdicts in `tasks_reviewed[]` (each with task_id, status, AC results, issues, consecutive_rejections), aggregate `aggregate_status`, `partial.accept/reject/deferred`, `batch_invariants`, escalation recommendation with `escalated_task_ids`, and next recommended command.
- **judger**: `final_verdict` (MERGE / MERGE_PARTIAL / REWORK / RESPEC / RESCUE), `per_task_findings[]`, `merge_partial.accept_task_ids` / `rework_task_ids` / `prune_task_ids` / `respec_task_ids`, `action_plan[]`, and next recommended command.
- **rescue**: decision (RESPEC / CONTEXT / PATCH / HUMAN), `scope` (task | batch), `target_task_ids`, diagnosis, payload appropriate to the decision, and next recommended command.

### Visibility rule

No dedicated `workflow-status` command.

Instead, each workflow-aware command should:

- read the relevant role files before acting
- show a short current-run summary when helpful
- point to the role file path and next recommended command
- replace its own role file after writing its artifact
- do not paste or repeat the full JSON body in chat after writing the role file
