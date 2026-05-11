## OBJECTIVE

**FAIL ONCE. NEVER FAIL THE SAME WAY TWICE.**
Every error is a lesson wrapped in frustration.
**Your Goal**: Extract the *Pattern*, classify its durability, and persist it to the right memory sink.
**The Standard**: If I repeat the same tactical bug next week, or keep re-teaching the same stable preference, you failed.

## MEMORY MODEL

- `AGENTS.md` → durable user preferences and workspace facts
- `.cursor/lessons.md` → tactical engineering lessons and local anti-patterns
- `.cursor/hooks/state/continual-learning*.json` → plugin-owned state; never edit manually

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
debug (fix) → LEARN (classify) → lessons / AGENTS (persist)
```

## PROTOCOL

### Phase 1: Analysis (The Autopsy)

1. **Identify Root Cause**:
    - **Surface**: "The build failed."
    - **Root**: "We imported a type from development dependencies in production code."
2. **Classify the Sink First**:
    - **Durable User Preference**: stable user correction or preference → `AGENTS.md` / `## Learned User Preferences`
    - **Durable Workspace Fact**: stable repo/tooling fact → `AGENTS.md` / `## Learned Workspace Facts`
    - **Tactical Lesson**: repeat bug pattern, local gotcha, or engineering heuristic → `.cursor/lessons.md`
    - **Transient Detail**: one-off incident detail → do not persist
3. **Classify the Failure Mode**:
    - **Knowledge Gap**: "Didn't know API X changed."
    - **Process Failure**: "Forgot to run tests before commit."
    - **Tooling Gap**: "Linter didn't catch it."

### Phase 2: Codification (The Right Sink)

1. **For Tactical Lessons**:
    - Add to `.cursor/lessons.md`.
    - Keep the existing sectioned bullet style.
    - Format: `- [Topic] Lesson learned (Context)` or a tighter equivalent.
2. **For Durable Memory**:
    - If `AGENTS.md` does not exist, create it with only:
        - `## Learned User Preferences`
        - `## Learned Workspace Facts`
    - Add only to `AGENTS.md` learned sections:
        - `## Learned User Preferences`
        - `## Learned Workspace Facts`
    - Use plain bullets only.
    - Deduplicate semantically similar bullets.
    - Keep each learned section to at most 12 bullets.
    - Preserve generated rule content above the learned sections.
    - Do not move durable facts into `.cursor/rules/*.mdc`; those files remain rule source, not learned memory.
3. **For Plugin State**:
    - Do **NOT** edit `.cursor/hooks/state/continual-learning.json` or `.cursor/hooks/state/continual-learning-index.json`.
    - The continual-learning plugin owns transcript mining and index refresh.
4. **Examples**:
    - Tactical: `- [TS] Don't use 'any' in map functions; it kills inference.`
    - Tactical: `- [Docker] Always pin base images to SHA, not tags.`
    - Durable preference: `- Prefer exact, verifiable file counts in plans — do not estimate.`
    - Durable workspace fact: `- .cursor/rules/*.mdc is the authoritative rule source in this repo.`

### Phase 3: Coordination with Continual Learning

1. **Manual vs Automatic**:
    - `ops-learn` is the manual, immediate fast-path after a concrete incident.
    - The continual-learning plugin is transcript-driven and keeps `AGENTS.md` current over time.
2. **Use `AGENTS.md` only for durable memory**:
    - Stable preferences and workspace facts belong there.
    - Tactical bug mechanics do not.
3. **Use `.cursor/lessons.md` for local engineering memory**:
    - Short-lived heuristics, gotchas, and repeat bug patterns belong there.
4. **If both are true**:
    - Write one concise tactical lesson to `.cursor/lessons.md`.
    - Write one concise durable bullet to the correct `AGENTS.md` learned section.

## OUTPUT FORMAT

```markdown
# 🧠 LESSON LEARNED

## The Incident
- **What**: Production crash on null user.
- **Why**: We assumed `req.user` is always present after auth middleware, but it's optional.

## The Classification
- **Memory Type**: Tactical lesson
- **Failure Mode**: Knowledge gap
- **Target**: `.cursor/lessons.md`

## The Lesson
- **Category**: TypeScript / Express
- **Rule**: "Treat `req.user` as `User | undefined`, even in protected routes."

## Action
- ✅ Added to `.cursor/lessons.md`
- ⚠️ Recommended adding lint rule `strict-null-checks`.
- ➖ No durable `AGENTS.md` update needed.
```

## EXECUTION RULES

1. **BE BRIEF**: No essays.
2. **BE GENERAL**: "Don't hardcode IDs" is better than "Don't hardcode ID 123".
3. **CHECK DUPLICATES**: Don't add the same lesson twice.
4. **CHOOSE THE SINK FIRST**: Tactical lesson → `.cursor/lessons.md`. Durable preference/fact → `AGENTS.md`.
5. **DON'T FIGHT THE PLUGIN**: Never edit continual-learning state JSON manually.
6. **TOUCH ONLY LEARNED SECTIONS**: If updating `AGENTS.md`, preserve the generated content above them.
