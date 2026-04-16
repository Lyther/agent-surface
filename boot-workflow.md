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

### Structured workflow

For medium/high-risk tasks requiring formal spec → implement → verify → review cycles.

```text
[workflow-boss] [spec: filescope + AC + verify gates]
    |
    v
feature path: [dev-feature] -> VERIFY [run gates → write evidence]
    |
    v
fix path: [dev-fix] -> VERIFY [run gates → write evidence]
    |
    v
[workflow-reviewer] [evidence-only → PASS / PARTIAL / REJECT]
    |                      |               |
    | PASS                 | PARTIAL       | REJECT
    v                      v               v
MERGE/SHIP           apply subset         FIX → VERIFY → REVIEWER (loop)
                                                            |
                                                            v
                                    after 2 loops → [workflow-judger] → [workflow-rescue] if needed
```

### File workflow mode

Use this only for the **manual stage workflow**. There is no background daemon, no database, and no shared state file.

```text
[workflow-boss] -> writes spec + handoff into `.cursor/.workflow/boss.json`

feature route:
  [dev-feature] -> writes `.cursor/.workflow/worker.json` (includes self-audit) -> [workflow-reviewer]

fix route:
  [dev-fix] -> writes `.cursor/.workflow/worker.json` -> [workflow-reviewer]

review outcomes:
  PASS    -> [workflow-boss] decides next task or closes run
  REJECT  -> back to implementation
  ESCALATE -> [workflow-judger] -> [workflow-rescue] when takeover is needed
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
- `workflow-reviewer` reads `boss.json` and `worker.json`, and uses `boss.json.workflow.route` to interpret the expected contents.
- `workflow-judger` and `workflow-rescue` read the current role files instead of requiring manual copy-paste when workflow mode is active.

### Artifact contract

Every workflow-aware command should write a normalized JSON payload into its own role file.
Every role file should carry a `workflow.next_command` field so the next handoff is machine-readable without a separate state file.

Minimum expectations:

- boss: full BOSS JSON plus route and next handoff
- worker: summary, touched paths, proof, diff/log refs. Feature route must include merged self-audit; fix route may include one, but it is optional.
- reviewer/judger/rescue: full JSON output plus next recommended command

### Visibility rule

No dedicated `workflow-status` command.

Instead, each workflow-aware command should:

- read the relevant role files before acting
- show a short current-run summary when helpful
- point to the role file path and next recommended command
- replace its own role file after writing its artifact
- do not paste or repeat the full JSON body in chat after writing the role file
