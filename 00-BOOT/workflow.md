# COMMAND: WORKFLOW

# ALIAS: maps, map, flow, diagrams, charts

## OBJECTIVE

Keep ASCII workflow diagrams out of `.cursorrules` (prompt token budget), but still available on demand.

## DIAGRAMS

### Command protocol

```text
User invokes command (e.g., "refactor", "roadmap")
    ↓
1. In context?     → EXECUTE
2. On disk?        → READ ~/.cursor/commands/[CAT]/[CMD].md → EXECUTE
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
       [00-BOOT/new]
             ↓
[00-BOOT/context] → [01-ARCH/roadmap] → [01-ARCH/model] → [01-ARCH/api]
                                              ↓
                                       [01-ARCH/breakdown]
                                              ↓
                                    ┌→ [02-DEV/feature] ──┐
                                    |         ↓           |
[09-OPS/monitor] ← [05-SHIP/deploy] |  [03-VERIFY/test]   |
       ↑                  ↑         |         ↓           |
[09-OPS/debug] ──→ [02-DEV/fix] ────┴─ [02-DEV/refactor] ←┘
       ↑
 [04-QA/pentest]
```

### Structured workflow (10-WORKFLOW)

For medium/high-risk tasks requiring formal spec → implement → verify → review cycles.

```text
[10-WORKFLOW/boss] [spec: filescope + AC + verify gates]
  |
  v
IMPLEMENT (agent or human)
  |
  v
VERIFY [run gates → write evidence]
  |
  v
[10-WORKFLOW/reviewer] [evidence-only → PASS / PARTIAL / REJECT]
  |                        |                    |
  | PASS                   | PARTIAL            | REJECT
  v                        v                    v
MERGE/SHIP          apply subset          FIX → VERIFY → REVIEWER (loop)
                                                            |
                                    after 2 loops → [10-WORKFLOW/judger] / [10-WORKFLOW/rescue]
```
