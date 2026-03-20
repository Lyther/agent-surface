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
                                  |       ↓          |
[ops-monitor] ← [ship-deploy]    | [verify-test]    |
     ↑                ↑          |       ↓          |
[ops-debug] ──→ [dev-fix] ───────┴─ [dev-refactor] ←┘
     ↑
 [qa-pentest]
```

### Structured workflow

For medium/high-risk tasks requiring formal spec → implement → verify → review cycles.

```text
[workflow-boss] [spec: filescope + AC + verify gates]
  |
  v
IMPLEMENT (agent or human)
  |
  v
VERIFY [run gates → write evidence]
  |
  v
[workflow-reviewer] [evidence-only → PASS / PARTIAL / REJECT]
  |                        |                    |
  | PASS                   | PARTIAL            | REJECT
  v                        v                    v
MERGE/SHIP          apply subset          FIX → VERIFY → REVIEWER (loop)
                                                            |
                                    after 2 loops → [workflow-judger] / [workflow-rescue]
```
