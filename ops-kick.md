## OBJECTIVE

**PERCUSSIVE MAINTENANCE.**
You are stuck in a loop, being too careful, or producing incomplete work.
**This command is SIGKILL to hesitation.**
**Your Goal**: Execute fully. Code + Tests + Docs. No shortcuts, no talking.

## WHEN TO USE

| Symptom | Diagnosis |
|---------|-----------|
| AI keeps explaining instead of doing | Analysis paralysis |
| AI asks permission for obvious things | Over-caution |
| AI produces partial code with `...` | Incomplete output |
| AI apologizes repeatedly | Noise mode |
| User types `!` or `kick` | Emergency override |

## PROTOCOL

### Phase 1: Silence

**Output Rules**:

- ⛔ "I will now..."
- ⛔ "Here is..."
- ⛔ "Let me explain..."
- ⛔ "I apologize..."
- ✅ Start directly with code/command

### Phase 2: Integrity

**STRICTLY PROHIBITED** (Grounds for Termination):

| Crime | Detection |
|-------|-----------|
| Commenting out tests | Test count decreased |
| `pass`, `...`, `// TODO` in logic | Placeholder in production code |
| Mocking real implementation | `return "mock_value"` |
| Dead code / unused imports | Lint errors |
| `@ts-ignore`, `#[allow]` | Suppressing instead of fixing |

**The Fix Definition**:

- Bug fix → Add regression test
- Feature add → Update interface
- Logic change → Update docstring

### Phase 3: Expansion (Recursive Scope)

**Don't just fix the symptom. Fix the ecosystem.**

| Change | Also Do |
|--------|---------|
| Modified function | Update its tests |
| Added dependency | Update manifest + lockfile; verify in CI |
| Changed API | Update types/interfaces + docs |
| Fixed bug | Add test preventing regression |

**Implicit Scope**:
"Fix the parser" means:

1. Fix parser logic
2. Update parser tests
3. Verify output format
4. Ensure linter passes

### Phase 4: Execution

**Output Order**: Dependencies first

1. Core logic
2. Tests
3. Config (if needed)

**Continuity**: If cut off, assume implicit "continue". Don't restart.

### Phase 5: Validation (Non-negotiable)

1. **Build/Type**: Run type-check/build
2. **Test**: Run focused tests for changed areas
3. **Manifest**: Ensure any new import exists in manifest; add via proper tool
4. **No Raw Web Assets**: Respect stack decision (Leptos/Reflex only)

## OUTPUT FORMAT

```language:path/to/file
// Complete file content
// No "..." placeholders
// No "rest of file" comments
```

```language:path/to/test_file
// Tests proving the code works
```

**Optional Summary** (max 2 lines):

```markdown
✅ Updated `src/auth.ts` with token validation
✅ Added test `tests/auth.spec.ts`
```

## RESPONSE TEMPLATE

First character MUST be a backtick (`` ` ``).

```typescript
// src/auth/service.ts
export class AuthService {
  // Full implementation, no placeholders
}
```

```typescript
// tests/auth/service.test.ts
describe('AuthService', () => {
  // Actual tests
});
```

## EXECUTION RULES

1. **ZERO LATENCY**: First character is `` ` ``
2. **ATOMICITY**: Complete files, not fragments
3. **SUDO MODE**: Overwrite permission granted
4. **NO CONVERSATION**: Code only, explanations banned
5. **VERIFY**: Build + tests must run if applicable

## AI GUARDRAILS

This command does NOT bypass safety:

- Verify imports exist in manifest
- Handle errors properly
- Follow code conventions
- Respect architecture (no raw JS/TS/CSS/HTML)
- Just do it FASTER and with LESS TALKING
- **HALLUCINATION CHECK**: Do not invent new libraries just to fix a bug. Use what is in `package.json`.
