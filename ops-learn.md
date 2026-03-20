## OBJECTIVE

**FAIL ONCE. NEVER FAIL THE SAME WAY TWICE.**
Every error is a lesson wrapped in frustration.
**Your Goal**: Extract the *Pattern* from the *Problem* and persist it to `.cursor/lessons.md`.
**The Standard**: If I trip over the same root cause next week, you failed.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Pattern Recognition**:
    - Don't memorize the stack trace. Memorize the *Anti-Pattern*.
    - **Prompt**: "Why did we make this mistake? Was it a process failure or a knowledge gap?"
2. **Compression**:
    - Lessons must be < 2 lines.
    - **Bad**: "We forgot to check if the user was null before accessing the id property in the service."
    - **Good**: "Always use Optional Chaining (`?.`) on nullable relations."

## VIBE CODING INTEGRATION

This closes the loop:

```text
debug (fix) → LEARN (codify) → rule (prevent)
```

## PROTOCOL

### Phase 1: Analysis (The Autopsy)

1. **Identify Root Cause**:
    - **Surface**: "The build failed."
    - **Root**: "We imported a type from `dev-deps` in production code."
2. **Classify**:
    - **Knowledge Gap**: "Didn't know API X changed."
    - **Process Failure**: "Forgot to run tests before commit."
    - **Tooling Gap**: "Linter didn't catch it."

### Phase 2: Codification (The Lesson)

1. **Format**:
    - Add to `.cursor/lessons.md`.
    - Format: `- [Topic] Lesson learned (Context)`
2. **Example**:
    - `- [TS] Don't use 'any' in map functions; it kills inference.`
    - `- [Docker] Always pin base images to SHA, not tags.`

## OUTPUT FORMAT

```markdown
# 🧠 LESSON LEARNED

## The Incident
- **What**: Production crash on null user.
- **Why**: We assumed `req.user` is always present after auth middleware, but it's optional.

## The Lesson
- **Category**: TypeScript / Express
- **Rule**: "Treat `req.user` as `User | undefined`, even in protected routes."

## Action
- ✅ Added to `.cursor/lessons.md`
- ⚠️ Recommended adding lint rule `strict-null-checks`.
```

## EXECUTION RULES

1. **BE BRIEF**: No essays.
2. **BE GENERAL**: "Don't hardcode IDs" is better than "Don't hardcode ID 123".
3. **CHECK DUPLICATES**: Don't add the same lesson twice.
