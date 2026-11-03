---
name: ops-ask
description: "Clarify a material requirement, evidence conflict, architectural choice, or risky assumption before implementation proceeds."
---

## Objective

Resolve one material uncertainty without turning normal engineering judgment into repeated human approval. Use `ops-ask` when the answer can change product behavior, architecture, data, authority, irreversible work, or substantial implementation cost; never for naming, style, reversible implementation details, facts discoverable from the repository or a live authoritative source, or permission for an operation the task already authorizes.

## Triggers

- The requirement permits materially different outcomes.
- The requested approach conflicts with the stated goal or current evidence.
- The current design is known to be incorrect, but the request assumes extending it.
- A better route removes meaningful complexity, cost, risk, or user harm.
- An architectural choice changes a public contract, persistent data, dependencies, deployment shape, or long-term ownership.
- A destructive or irreversible workflow lacks a clear target, preservation boundary, or rollback point.

## Procedure

1. Investigate first: read the relevant code, config, tests, history, and authoritative documentation.
2. State the shared goal, separating the desired outcome from the proposed means.
3. Name the conflict with concrete evidence and the likely impact of continuing.
4. Recommend the smallest route that satisfies the goal, with at most two alternatives when the trade-off is genuinely material; never dress cosmetic variants as architecture choices, and propose a workable route rather than refusing.
5. Ask one focused question whose answer unblocks the next action, never a broad one such as "What do you want?"
6. Pause only the affected mutation: continue independent read-only investigation and unaffected branches of work, and neither implement both alternatives nor guess through an irreversible choice.

If the user confirms the original route, proceed unless it violates P0 or cannot achieve the stated outcome; a user naming an implementation is not a reason to continue a known-wrong design without asking.

## Output

```markdown
**Decision Needed**

Goal: <shared outcome>
Conflict: <evidence and impact>
Recommendation: <smallest better route and reason>
Alternative: <optional material alternative and trade-off>
Question: <one answerable question>
```
