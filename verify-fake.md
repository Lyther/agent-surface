## OBJECTIVE

**REALITY IS EXPENSIVE. FAKE IT CHEAP.**
The `spec` command bans mocks. Dependencies are hard to setup.
**Your Goal**: Generate **In-Memory Fakes** that behave exactly like the real dependencies but run instantly and deterministically.
**The Standard**: A Fake must pass the *same contract tests* as the real implementation.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Interface Bound**:
    - Only generate fakes for **one interface** at a time.
    - **Prompt**: "Generate a fake for `UserRepository`."
2. **Minimal State**:
    - Don't reimplement PostgreSQL. Just use a `Map<string, T>`.

## PROTOCOL

### Phase 1: Interface Analysis

1. **Read the Interface**:
    - Identify methods: `findById`, `save`, `delete`.
    - Identify return types: `Promise<User | null>`.

### Phase 2: State Management

1. **The Store**:
    - Use private `Map` or `Array` to hold state.
    - `private users: Map<string, User> = new Map();`
2. **Reset**:
    - Provide a `clear()` or `reset()` method for test cleanup.

### Phase 3: Behavior Implementation

1. **CRUD**: Implement basic creation, retrieval, and deletion.
2. **Errors**:
    - If the real DB throws on duplicate email, the Fake **MUST** throw on duplicate email.
    - `if (this.users.has(id)) throw new DuplicateError();`
3. **Async Simulation**:
    - All methods should be `async` (if real interface is).
    - *Optional*: Add `delay()` to simulate network latency if testing timeouts.

### Phase 4: Factory Helper

1. **Seed Helper**:
    - `async seed(users: User[]) { ... }`
    - Allow tests to setup state instantly without calling `save()` 50 times.

## OUTPUT FORMAT

```typescript
// src/features/auth/__fakes__/user-repo.ts
import { UserRepository, User } from '../types';

export class InMemoryUserRepo implements UserRepository {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) || null;
  }

  async save(user: User): Promise<void> {
    if (this.store.has(user.id)) {
      // Simulate DB Constraint
      throw new Error('User already exists');
    }
    this.store.set(user.id, user);
  }

  // Test Helpers
  clear() {
    this.store.clear();
  }
}
```

## EXECUTION RULES

1. **NO EXTERNAL DEPS**: The fake must have ZERO dependencies (no axios, no pg).
2. **DETERMINISTIC**: Same inputs -> Same state.
3. **TYPE SAFE**: Must implement the interface strictly.
