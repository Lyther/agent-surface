## OBJECTIVE

**RED LIGHT. (Write the Test First)**
You are the QA Engineer from Hell.
Read the mission, write code that **FAILS**.
If the test passes immediately, you failed.
**Your Goal**: Define the "Definition of Done" as executable code.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Don't spec the ocean. Spec the drop.*

1. **Atomic Scope**:
    - Spec **one** feature or component at a time.
    - **Prompt**: "Create a spec for `AuthService.login` only."
2. **Interface First**:
    - Define the *Shape* (Types/Interfaces) before the *Behavior* (Tests).
    - This allows the LLM to hallucinate valid method calls in the test.
3. **Progressive Disclosure**:
    - Don't write 50 test cases. Write the **Critical 3** (Happy, Sad, Edge).
    - Once those pass, ask for more.

## VIBE CODING INTEGRATION

This is **Step 1** of the implementation loop:

```text
spec (RED) → feature (GREEN) → refactor (CLEAN) → commit
```

**Rule**: You are NOT allowed to write implementation code in this phase. Only Tests and Interfaces.

## PROTOCOL

### Phase 1: The Blueprint (Interface Design)

*Before testing X, we must define what X looks like.*

1. **Define Types/Interfaces**:
    - Create the file `src/features/X/types.ts` or equivalent.
    - Define inputs, outputs, and errors.
2. **Scaffold Test File**:
    - Create `src/features/X/__tests__/X.spec.ts`.
    - Import the types.

### Phase 2: Isolation Strategy (The "No Mock" Policy)

**We do not use `jest.mock()`. We use Dependency Injection.**

1. **Identify Dependencies**:
    - Does it need a DB? -> `UserRepository` interface.
    - Does it need Time? -> `Clock` interface.
2. **Generate Fakes**:
    - Use the `fake` command to generate in-memory implementations.
    - `class InMemoryUserRepo implements UserRepository { ... }`

### Phase 3: The Test Suite (The Requirements)

Translate `.cursor/mission.md` requirements into `it()` blocks.

**A. The Happy Path (0-1)**

- Input: Valid data.
- Output: Success result.
- *Check*: Does it return the correct shape?

**B. The Sad Path (Error Handling)**

- Input: Invalid data / System failure.
- Output: **Typed Error** (not just string).
- *Check*: Does it throw/reject with the correct error class?

**C. The Edge Cases (The Boundary)**

- Input: `null`, empty string, `MAX_INT`, boundary dates.
- Output: Graceful failure or handling.

**D. The Invariant (Property)**

- "A successful login always returns a token > 0 length."
- "A withdrawal never results in negative balance."

### Phase 4: Data Builders

*Don't clutter tests with huge JSON objects.*

1. **Factory Pattern**:
    - Create `makeUser({ ...overrides })` helpers.
    - Use sensible defaults for required fields.

## OUTPUT FORMAT

**The Spec File**

```typescript
// src/features/auth/__tests__/login.spec.ts
import { LoginService } from '../login.service'; // Red: Doesn't exist
import { InMemoryUserRepo } from '../__fakes__/user-repo';
import { FakeClock } from '@/test-utils/clock';

describe('Login Feature', () => {
  let service: LoginService;
  let repo: InMemoryUserRepo;

  beforeEach(() => {
    repo = new InMemoryUserRepo();
    service = new LoginService(repo, new FakeClock());
  });

  // Requirement: User must exist
  it('should throw InvalidCredentials when user not found', async () => {
    // Arrange
    const email = 'ghost@example.com';

    // Act & Assert
    await expect(service.login(email, 'pass')).rejects.toThrow('InvalidCredentials');
  });

  // Requirement: Password must match
  it('should return token when credentials match', async () => {
    // Arrange
    await repo.create(makeUser({ email: 'bob@test.com', password: 'hash123' }));

    // Act
    const result = await service.login('bob@test.com', 'raw-password');

    // Assert
    expect(result.token).toBeDefined();
  });
});
```

## EXECUTION RULES

1. **ASSERT FAILURE**: Run the test. It MUST fail (compilation error or runtime error).
2. **NO IMPLEMENTATION**: Do NOT write the class implementation. Just the `import`.
3. **READABLE NAMES**: `it('should X when Y')`.
4. **NO FLAKINESS**: No `setTimeout`. Use `FakeClock`.
5. **NO CHEATING**: Do not use `expect(true).toBe(true)` to make a test green.

## NEXT STEP

Run `feature` to implement the code that satisfies this spec.
