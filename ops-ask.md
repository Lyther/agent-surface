## OBJECTIVE

**THE BRAKE PEDAL.**
Vibe coding means flow, not blindness.
When requirements are unclear, STOP. Do not hallucinate. Do not guess.
**Your Goal**: Surface specific questions that unblock progress.
**The Anti-Goal**: Vague "what do you want?" that wastes cycles.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Check First**:
    - Before asking, read `docs/context/` and `docs/architecture.md`.
    - If the answer is there, **DO NOT ASK**.
2. **Specifics**:
    - Do not paste code in the question unless critical. Use line references.

## WHEN TO INVOKE

| Trigger | Example |
|---------|---------|
| **Ambiguous requirement** | "Make it better" (better how?) |
| **Missing context** | References to files/systems not loaded |
| **Conflicting signals** | User says X, code does Y |
| **Architectural decision** | Multiple valid approaches exist |
| **External dependency** | Needs info about API/service not documented |

## PROTOCOL

### Phase 1: State What You Know

*Demonstrate you've been paying attention.*

1. **Summarize Understanding**:
    - "Based on context, I understand you want [X]."
    - "The current code does [Y]."
    - "The relevant files are [Z]."
2. **Identify the Gap**:
    - "However, I'm unclear on [specific thing]."

### Phase 2: Ask Specific Questions

*Not "what do you want?" but "which of these options?"*

**Question Types**:

| Type | Template |
|------|----------|
| **Binary** | "Should [A] or [B]?" |
| **Constraint** | "Is [X] a hard requirement or flexible?" |
| **Scope** | "Should this include [Y] or is that separate?" |
| **Priority** | "If we can only have one, [A] or [B]?" |
| **Validation** | "Is my understanding correct: [statement]?" |

### Phase 3: Propose Default + Deadline (Optional)

*If you have a reasonable guess, offer it and timebox it for flow.*

```text
"If no preference by <time/window>, I'll go with [Option A] because [reason]."
```

This lets user just say "yes" or reply later without blocking iteration.

## OUTPUT FORMAT

**The Clarification Request**

```markdown
# ⏸️ CLARIFICATION NEEDED

## My Understanding
- Goal: Add user authentication
- Stack: Express + PostgreSQL
- Constraint: Must use JWT

## The Question
**How should session invalidation work?**

| Option | Tradeoff |
|--------|----------|
| A) Stateless JWT only | Simple, but can't revoke tokens |
| B) JWT + Redis blacklist | Revocable, but adds Redis dependency |
| C) Short-lived JWT + refresh token | Balanced, but more complex |

## Default
If no preference by EOD today, I'll implement **Option C** (industry standard).

## Awaiting
Your choice, then I continue.
```

## EXECUTION RULES

1. **ONE QUESTION SET AT A TIME**: Ask the most blocking items first.
2. **ACTIONABLE ANSWERS**: Each question should have clear options or yes/no.
3. **NO IMPLEMENTATION WHILE WAITING**: Don't guess and build.
4. **BOUNDED WAITING**: If partial answer arrives, proceed and follow-up only if still blocked.
5. **FALLBACK DEFAULT**: If deadline passes with no response, proceed with proposed default and note it.

## ANTI-PATTERNS

| ⛔ Bad | ✅ Good |
|--------|---------|
| "What do you want me to do?" | "Should X use approach A or B?" |
| "Can you clarify?" | "Is [specific thing] correct?" |
| "I need more information" | "I need to know: [specific question]" |
| Asking about things you can decide | Asking about things only user knows |
