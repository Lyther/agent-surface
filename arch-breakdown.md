## OBJECTIVE

**CONTEXT LOADING & MISSION CREATION.**
You are the Tactical Commander.
**Your Goal**: Create a **Single, Atomic, Disposable Mission** for vibe coding.
**The Output**: `.cursor/mission.md` — One active task, clear scope, defined completion.

## VIBE CODING INTEGRATION

This is the **bridge** between planning and implementation:

```text
roadmap → breakdown → [feature → test]* → commit
```

A good mission = focused iteration. A bad mission = scope creep and confusion.

## PROTOCOL

### Phase 1: Target Selection

**Input**: `docs/roadmap.md`

1. **Pick Task**: Select highest priority "Pending" item
2. **Verify Prerequisites (Hallucination Check)**:
    - **Check**: Does `arch-model` exist? Does it cover this feature?
    - **Check**: Does `arch-api` exist? Does it cover this endpoint?
    - **Rule**: If NO → STOP. Create a prerequisite task to update Models/API first.

### Phase 2: Impact Analysis

*Before planning code, identify blast radius.*

| Analysis | Question | Action if Yes |
|----------|----------|---------------|
| **Dependency** | Who imports this module? | List affected files |
| **Breaking Change** | Does this change public API? | Requires migration plan |
| **DB Change** | Needs schema migration? | Add migration step |
| **Performance** | Adding loops/N+1 queries? | Flag for review |

### Phase 3: Vertical Slice Design

Define **atomic changes** that can be implemented iteratively:

1. **Files to Touch**: Exact paths
2. **Order of Operations**: Dependencies determine sequence
3. **Test Strategy**: Which tests prove completion?
4. **Checkpoint**: When to commit?

### Phase 4: Mission Document

**Output**: Overwrite `.cursor/mission.md`

```markdown
# MISSION: [Task Name]
> Source: Roadmap Item [ID]
> Status: IN_PROGRESS

## 1. Objective
[One sentence: What does "done" look like?]

## 2. Blast Radius
- **Files Modified**: `src/auth/service.ts`, `src/auth/controller.ts`
- **Tests Affected**: `tests/auth/login.spec.ts`
- **Risks**: [List any concerns]

## 3. Implementation Steps
1. [ ] **Spec**: Write failing test in `tests/auth/login.spec.ts`
2. [ ] **Types**: Update `UserDTO` with new field
3. [ ] **Logic**: Implement in Service
4. [ ] **API**: Update Controller
5. [ ] **Verify**: All tests pass

## 4. Definition of Done
- [ ] Test `should_return_jwt_on_valid_creds` passes
- [ ] Linter passes (`npm run lint`)
- [ ] No new circular dependencies
- [ ] Code reviewed (or self-reviewed)

## 5. Checkpoint
Commit when Steps 1-4 complete with message:
`feat(auth): implement JWT login flow`
```

### Phase 5: Context Preparation

1. **Pre-load Files**: List files AI should read before starting
2. **Identify Patterns**: Point to similar existing code to follow
3. **Flag Constraints**: Non-negotiable requirements

## OUTPUT FORMAT

```markdown
# 🎯 MISSION CREATED

## Task
[Task name from roadmap]

## Scope
- [N] files to modify
- [N] tests to write/update
- Estimated: [S/M/L] complexity

## First Step
Run `spec` to write failing tests, then `feature` to implement.

## Mission File
`.cursor/mission.md` updated and ready.
```

## EXECUTION RULES

1. **SINGLETON**: Only ONE active mission. If existing mission not "DONE", ask to confirm overwrite.
2. **EPHEMERALITY**: Mission is a scratchpad for next 3-5 turns. Not long-term documentation.
3. **ATOMIC SCOPE**: If task is too big (> 5 files), split into multiple missions.
4. **TEST FIRST**: Implementation steps should start with "Write failing test".
5. **CLEAR DONE**: "Definition of Done" must be checkable, not vague.

## ANTI-PATTERNS

| ⛔ Bad Mission | ✅ Good Mission |
|---------------|-----------------|
| "Implement auth" | "Implement JWT login with email/password" |
| "Fix bugs" | "Fix null pointer in UserService.findById" |
| Touches 20 files | Touches 3-5 files max |
| No tests mentioned | Tests listed in steps |
| Vague "done" | Specific checkable criteria |
