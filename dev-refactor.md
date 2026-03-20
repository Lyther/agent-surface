## OBJECTIVE

**THE TWO HATS PROTOCOL: HAT #2 (REFACTORING).**
You are FORBIDDEN from adding features or fixing logic bugs.
**Your Goal**: Reduce entropy. Lower cognitive load. Keep behavior EXACTLY the same.
**Primary Metrics**: Cyclomatic complexity ↓ or equal; function length ↓; duplication ↓; lints 0.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Eating an elephant requires small bites.*

1. **Chunking**:
    - Do NOT ask to "Refactor `utils.ts`" (3000 lines).
    - Ask: "Refactor the `formatDate` function in `utils.ts`."
2. **Focus**:
    - Hide the rest of the file. Read only the target function + imports.

## VIBE CODING INTEGRATION

This is the **CLEAN** step in the iteration loop:

```text
spec (RED) → feature (GREEN) → refactor (CLEAN) → commit
```

Refactor ONLY after tests are green. Never refactor and add features simultaneously.

## PROTOCOL

### Phase 0: Preconditions & Safety

1. Tests are GREEN; if not, STOP.
2. Create a checkpoint/tag or branch (`feat/refactor-<area>`).
3. Capture baselines: complexity, file size, duplication.
4. If coverage is weak → write pinning tests (see Phase 2).

### Phase 1: Diagnosis

**Input**: Target file/module.

| Code Smell | Detection | Refactoring |
|------------|-----------|-------------|
| Long Method | Function > 20–30 lines | Extract Method |
| Duplicated Code | Same 3+ lines twice | Extract to shared function |
| Primitive Obsession | `string` for complex state | Introduce Value Object |
| Feature Envy | Method uses other class more than own | Move Method |
| Arrow Code | Nesting > 3 levels | Guard Clauses |
| God Object | File > 300 lines, > 10 imports | Split into modules |

**Output Diagnosis**:

```markdown
> **Smell**: Long Method in `processOrder` (45 lines)
> **Complexity**: Cyclomatic 12 → Target: < 5
> **Strategy**: Extract Method → `validateOrder()`, `calculateTax()`, `applyDiscount()`
```

### Phase 2: Safety Net (Pinning Tests)

**RULE**: Refactoring without tests is BANNED.

1. **Run Existing Tests**: Must be GREEN before starting
2. **Create Pinning Tests** (if coverage low):
    - Capture CURRENT behavior (even if buggy)
    - Goal: Lock behavior in place during refactor
    - Example: "If `calc(null)` throws now, it must STILL throw after refactor"

### Phase 3: Atomic Operation

**ONE transformation at a time. Do NOT rewrite the whole file.**

- Prefer IDE-safe transforms (rename symbol, extract function, move file).
- Keep public API stable. No breaking changes.

#### Strategy A: Extract Method

```typescript
// BEFORE
function processOrder(order: Order) {
  // 20 lines of validation
  // 15 lines of tax calculation
  // 10 lines of discount logic
}

// AFTER
function processOrder(order: Order) {
  this.validateOrder(order);
  const tax = this.calculateTax(order);
  const discount = this.applyDiscount(order);
  return this.finalize(order, tax, discount);
}
```

#### Strategy B: Replace Conditional with Guard Clauses

```typescript
// BEFORE
function getPrice(user: User) {
  if (user) {
    if (user.isPremium) {
      if (user.discount > 0) {
        return price * (1 - user.discount);
      }
    }
  }
  return price;
}

// AFTER
function getPrice(user: User) {
  if (!user) return price;
  if (!user.isPremium) return price;
  if (user.discount <= 0) return price;
  return price * (1 - user.discount);
}
```

#### Strategy C: Value Object

```typescript
// BEFORE
function createUser(street: string, city: string, zip: string) { ... }

// AFTER
interface Address { street: string; city: string; zip: string; }
function createUser(address: Address) { ... }
```

### Phase 4: Verification

1. **Run Tests**: Must still be GREEN
2. **Diff Check**:
    - No logic change (`> 0` vs `>= 0`)
    - No public API rename
3. **Quality Gates**:
    - Complexity ↓; duplication ↓; lint errors = 0; format applied
    - Performance neutral (no regressions in hot paths)

### Phase 5: Commit & Traceability

1. Commit atomically with Conventional Commit: `refactor(scope): concise summary`
2. Include "before → after" metrics in the body
3. Push branch; open PR with rationale and risks

## TOOLING HINTS (by stack)

- TypeScript/Node: ESLint complexity, Sonar/ts-prune, Madge, `tsc --noEmit`
- Python: ruff, pylint, radon (cyclomatic), pyright
- Rust: clippy, cargo-udeps, cargo fmt, `cargo test`

## EXECUTION RULES

1. **NO NEW FEATURES**
2. **NO BUG FIXES**: Preserve current behavior; annotate with FIXME if needed
3. **ATOMICITY**: One logical change per turn
4. **DRY**: Same 3 lines twice → Extract a function
5. **TEST FIRST**: Write pinning tests if missing
