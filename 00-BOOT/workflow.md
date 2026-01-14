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
[00-BOOT/context] → [01-ARCH/roadmap] → [01-ARCH/model] → [01-ARCH/contract]
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

### 10-WORKFLOW map (order, priority, optional branches)

```text
START
  |
  v
(01 ROUTE) [optional] choose cheapest path (risk/size/swarm?)
  |
  v
(02 CTX-BUILD) [optional] big repo / unknown hotspot / token control
  |
  v
03 BOSS [priority: first for medium/high risk] -> spec: filescope + AC + verify
  | \
  |  \ (04 OVERRIDE) [optional] spec tweak when blocked/ambiguous
  |
  v
05 WORKER [single]  OR  05 WORKER x4/x8 [multi-agent swarm] when non-obvious/high-stakes
  | \
  |  \ (06 PENTEST-RECON) [optional] security tasks: passive recon only (no exploit)
  |
  v
07 RUNNER [required] run verify gates -> write evidence (e.g., validation.log)
  |
  v
08 REVIEWER [required for medium/high] evidence-only -> PASS / PARTIAL / REJECT
  |                        |                                    |
  | PASS                   | PARTIAL                            | REJECT
  v                        v                                    v
(09 PICK)        apply minimal subset    (10 LOG-ANALYZE) [optional] distill noisy failures
[optional: many      from reviewer                              |
worker variants]                                                v
  |                                        11 REWORK [failure-driven; avoid swarm]
  v                                                             |
MERGE/SHIP                                                      v
  |                                        07 RUNNER -> 08 REVIEWER (loop)
  v                                                             |
(14 RETRO) [optional]                                           v
after merge/abandon                    after 2 loops or high-risk -> 12 JUDGER / 13 RESCUE
```
