## OBJECTIVE

Decompose **a batch of related tasks** into an implementable spec **without writing code**.
One round = as many tasks as the worker can chew through before a blocker or context-pressure handoff. BOSS's job is to enumerate the queue once, with enough rigor that the worker, reviewer, judger, and rescue all operate from the same artifact.

Output must be sufficient for any agent (human, Cursor, Claude Code, Codex) to implement from alone.

## INPUT CONTRACT

You receive: a task description (which may bundle multiple related sub-tasks) plus any constraints.
If essential repo context is missing, run `boot-context` first.

## DESIGN PHILOSOPHY (v2 — Batched Rounds)

- **A round is a batch.** A `boss.json` enumerates a queue of 1 to N tasks.
- **The worker burns through the queue** in dependency order, stopping only on (a) a blocker on the current task, (b) self-assessed context pressure, or (c) the queue going empty.
- **The reviewer reviews the batch**, emitting per-task verdicts plus an aggregate status.
- **Single-task runs are still legal** — a queue of one is the v1 shape, dressed in v2 clothes.
- **Don't over-batch.** Group tasks that share FILESCOPE, contract, or test surface. Don't queue 30 unrelated chores into one BOSS — that defeats reviewer focus.

## PROTOCOL

### Phase 0: Workflow bootstrap (role files)

- `workflow-boss` is the entrypoint that starts or refreshes workflow mode.
- Use the project-local workflow folder: `.cursor/.workflow/`
- Single active run only.
- Role-file ownership is strict:
  - `workflow-boss` owns `.cursor/.workflow/boss.json` only.
  - `dev-feature` and `dev-fix` own `.cursor/.workflow/worker.json` only.
  - `workflow-reviewer` owns `.cursor/.workflow/reviewer.json` only.
  - `workflow-judger` owns `.cursor/.workflow/judger.json` only.
  - `workflow-rescue` owns `.cursor/.workflow/rescue.json` only.
- A role may read other role files, but it must not edit, repair, truncate, or rewrite another role's file.
- Exception: when starting a fresh handoff, `workflow-boss` may remove stale downstream role files (`worker.json`, `reviewer.json`, `judger.json`, `rescue.json`) before writing a new `boss.json`.
- Generate a stable `run_id` for each fresh run and carry it in every downstream role file.
- Choose the route once for the whole batch:
  - `feature` → next command `dev-feature`
  - `fix` → next command `dev-fix`
- Mixed-route batches are not allowed in a single run. Split them into two runs.
- Write the final BOSS JSON into `.cursor/.workflow/boss.json`.

### Phase 1: Requirements (no guessing)

- Extract requirements from **exact user quotes**.
- If a requirement isn't stated, do not invent it.
- Multiple requirements may map onto multiple tasks; one task may satisfy multiple requirements.

### Phase 2: Scope fence (FILESCOPE)

- Define a **batch-level FILESCOPE** that bounds the whole run (forbidden areas apply to every task).
- Each task may **narrow** the FILESCOPE further to its specific files. Tasks may not widen it.
- If you cannot set FILESCOPE from evidence, run `context` first.

### Phase 3: Task queue (atomic + verifiable + dependency-ordered)

Build a list of 1 to N tasks. Each task is independently reviewable, verifiable, and revertable.

- Sort tasks by dependency. Use `depends_on: [task_id, …]` when a task requires the output of an earlier one.
- Aim for **5–10 minutes of focused work per task**. A 2-hour task is two tasks.
- Each task gets its own `plan` (3–8 steps), `ac`, and `verify` commands.
- Don't pre-commit the worker to a specific implementation — leave room for judgment, but pin the contract.

Keep the process deterministic: route by explicit `workflow.next_command` plus the task queue, not free-form agent debate.

### Phase 4: Acceptance Criteria (per task, evidence-driven)

- Every AC must be verifiable by a command output, test report, or log.
- No vague AC ("works", "looks good").
- Include success path, failure path, edge cases, and at least one failure-mode AC when the task changes behavior, security posture, or data mutation.

### Phase 5: Verify gates (per task)

- Minimal ordered list of deterministic commands to validate that task's AC.
- Scoped tests first, then broader gates if needed.
- A task with no `verify` array is invalid.

### Phase 6: Risk + Sandbox

- Set `sandbox_required: true` for security/pentest tasks (simulation-only unless user authorizes).
- Risk applies at the batch level; per-task notes go in the task's own `risk_notes`.

### Phase 7: Batch policy

Define when the worker should stop the round:

- `stop_on`: subset of `["blocker", "context_pressure", "queue_empty"]` (default: all three).
- `context_pressure_threshold_pct`: heuristic for self-assessed context budget (default: 70).
- `max_tasks_per_round`: optional hard cap. Use sparingly — usually leave null and let heuristics decide.
- `drift_check_every`: re-read BOSS spec after this many completed tasks (default: 5). Catches scope drift before it metastasizes.

### Phase 8: Workflow handoff

- In workflow mode, `boss.json` is the source handoff for downstream stages. Do not ask the human to manually paste it into `dev-feature`, `dev-fix`, or `workflow-reviewer`.
- Include the route and next recommended command directly in the BOSS JSON.
- Include enough context references for downstream roles to ground their work in files already inspected, but do not paste large code bodies.
- Once `boss.json` is written, do not repeat the full JSON body in chat. Point to the file and summarize the handoff briefly.

## OUTPUT FORMAT

1. Write the full BOSS JSON to `.cursor/.workflow/boss.json`.

Use this shape (v2):

{
  "schema_version": "workflow.v2",
  "run_id": "stable id for this workflow run",
  "goal": "1–2 sentences describing the batch as a whole",
  "filescope": {
    "allowed": ["batch-level paths/modules allowed to change"],
    "forbidden": ["paths/modules forbidden to change"]
  },
  "requirements": [
    { "id": "R1", "quote": "exact user quote", "interpretation": "what it means", "satisfied_by": ["T1", "T3"] }
  ],
  "assumptions": [],
  "tasks": [
    {
      "task_id": "T1",
      "title": "short verb phrase",
      "description": "what this task accomplishes and why",
      "filescope": {
        "allowed": ["paths narrowed for this task"],
        "forbidden": []
      },
      "depends_on": [],
      "plan": [
        {
          "step_id": 1,
          "title": "short verb phrase",
          "description": "what to do and why",
          "deliverable": "what changes will exist when done",
          "touches": ["paths if known"]
        }
      ],
      "ac": [
        { "id": "AC1", "text": "verifiable statement", "verify": "how to verify" }
      ],
      "verify": ["ordered runner commands for this task"],
      "risk_notes": []
    }
  ],
  "batch_policy": {
    "stop_on": ["blocker", "context_pressure", "queue_empty"],
    "context_pressure_threshold_pct": 70,
    "max_tasks_per_round": null,
    "drift_check_every": 5
  },
  "risk": { "level": "low|medium|high", "sandbox_required": false, "notes": [] },
  "workflow": {
    "dir": ".cursor/.workflow",
    "file": "boss.json",
    "owner": "workflow-boss",
    "run_id": "same value as top-level run_id",
    "route": "feature|fix",
    "next_command": "dev-feature|dev-fix"
  }
}

2. Chat output: concise handoff only. Do not repeat the JSON body already written to `boss.json`.

```text
BOSS file: `.cursor/.workflow/boss.json`
Route: feature|fix
Tasks queued: N (T1..TN)
Next: dev-feature|dev-fix
Goal: <1-line summary>
```

## EXECUTION RULES

1. No code changes. No implementation diffs. Only the BOSS role file may be written.
2. If ambiguous, ask EXACTLY ONE question per ambiguity, batched if multiple. Do not proceed with unresolvable ambiguity.
3. If you proceed without an answer, list assumptions explicitly and make them testable via AC.
4. In workflow mode, write only `.cursor/.workflow/boss.json`; never edit downstream role files except deleting stale downstream files when starting a fresh handoff.
5. `boss.json` is the machine-readable artifact. Chat output should stay brief and human-readable.
6. **Don't queue garbage.** If a task can't be specified with a clear AC and verify, leave it out. The reviewer will reject undefined tasks anyway, and the worker will waste the round trying.
7. **Order matters.** Topologically sort `tasks` by `depends_on`. The worker iterates in array order; mis-ordering creates artificial blockers.
8. **One route per run.** Mixed `feature` + `fix` batches must be split into separate runs.
