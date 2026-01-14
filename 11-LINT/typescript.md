# COMMAND: TYPESCRIPT

# ALIAS: ts, tsqc

## §0 META: YOU WILL BE AUDITED

You are generating TypeScript code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

TypeScript exists to prevent JavaScript's chaos. If your code requires `any`, `@ts-ignore`, or loose compiler settings, you're doing it wrong.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## §1 ABSOLUTE PROHIBITIONS (ZERO TOLERANCE)

### §1.1 MINIMIZE ESCAPE HATCHES

```typescript
// FORBIDDEN without justification
// @ts-ignore
// @ts-expect-error
// @ts-nocheck
// eslint-disable
/* eslint-disable */
```

If TypeScript or ESLint emits an error, **prefer fixing the underlying issue**.

**Allowed exception (with justification):**

```typescript
// Third-party lib has incorrect types: https://github.com/owner/repo/issues/XXX
// @ts-expect-error - lib types don't account for valid overload
const result = badlyTypedLib.method(validArg);
```

**Rules:**

- Use `@ts-expect-error` over `@ts-ignore` (fails if error disappears)
- Must include inline comment explaining why
- Must reference issue tracker if third-party problem

### §1.2 NO Type System Bypasses

| Banned | Why | Fix |
|--------|-----|-----|
| `any` | Defeats type system | `unknown` + type guards |
| `as any` | Type laundering | Fix the actual types |
| `!` (non-null assertion) without proof | Runtime crashes | Null checks or `?.` |
| `as Type` without validation | Lying to compiler | Type guards or Zod |
| Untyped function parameters | No contract | Add types |
| Implicit `any` returns | Caller has no contract | Explicit return type |

**Exceptions:**

- `any` in `.d.ts` files for untyped third-party libs (with TODO to fix)
- `as const` assertions (these are safe)

### §1.3 NO Silent Failures

| Banned | Why |
|--------|-----|
| Empty `catch {}` | Swallowing errors |
| `catch (e) { console.log(e) }` without re-throw | Logs but continues broken |
| `.catch(() => {})` on Promises | Silent failure |
| Ignoring Promise returns | Unhandled rejections |
| `try { } catch { return undefined }` | Hiding failures as missing data |

**Every error must be:**

- Re-thrown (with or without wrapping)
- Converted to a typed error result
- Handled with explicit recovery logic

### §1.4 NO Garbage Code

| Banned | Replacement |
|--------|-------------|
| `console.log()` for debugging | Remove or use logger |
| `debugger` | Remove |
| `// TODO`, `// FIXME` | Do it now or don't mention it |
| `// ... rest of implementation` | Write the rest |
| `var` | `const` or `let` |
| `require()` | `import` |
| Unused imports/variables | Remove them |

### §1.5 NO JavaScript Anti-Patterns

| Banned | Why | Fix |
|--------|-----|-----|
| `==` (loose equality) | Type coercion bugs | `===` |
| `arguments` object | Not an array, confusing | Rest parameters |
| `this` without explicit binding | Context loss | Arrow functions or `.bind()` |
| `eval()` | Security hole | Never |
| `Function()` constructor | Same as eval | Never |
| Prototype mutation | Unpredictable | Classes or composition |
| `delete` on objects | Performance killer | Object.omit pattern |

### §1.6 NO Pretending

You must produce **complete, working code**. This means:

- All files mentioned must be created with full content
- All functions must be implemented (no stubs)
- All types must be complete (no `Partial<T>` to avoid defining fields)
- All tests must actually test something meaningful
- All imports must resolve

## §2 REASONING (SHOW YOUR WORK FOR SIGNIFICANT CHANGES)

For non-trivial code (new modules, complex types, architectural decisions), provide explicit reasoning. Skip for small fixes and obvious implementations.

### §2.1 Type Design

For every significant type:

```text
TYPE DESIGN for `ApiResponse<T>`:
- What it represents: [answer]
- Invariants: [what must always be true]
- Why this structure: [alternatives considered]
```

### §2.2 Error Strategy

```text
ERROR STRATEGY:
- Expected failures: [list with handling]
- Unexpected failures: [propagation strategy]
- User-facing errors: [how formatted]
```

## §3 TYPE-DRIVEN DESIGN

### §3.1 Strict Compiler Settings (Required)

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

### §3.2 Parse at Boundaries

```typescript
// ❌ BAD: Trust external data
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json(); // Returns `any`, no validation!
}

// ✅ GOOD: Validate with Zod
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  const data: unknown = await response.json();
  return UserSchema.parse(data); // Throws if invalid
}
```

### §3.3 Discriminated Unions for State

```typescript
// ❌ BAD: Optional fields for different states
interface ApiState {
  loading?: boolean;
  data?: User;
  error?: Error;
}

// ✅ GOOD: Discriminated union
type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User }
  | { status: "error"; error: Error };

function handleState(state: ApiState) {
  switch (state.status) {
    case "idle":
      return null;
    case "loading":
      return <Spinner />;
    case "success":
      return <UserCard user={state.data} />; // data is guaranteed
    case "error":
      return <ErrorDisplay error={state.error} />; // error is guaranteed
  }
}
```

### §3.4 Brand Types for Semantic Distinction

```typescript
type UserId = string & { readonly __brand: "UserId" };
type PostId = string & { readonly __brand: "PostId" };

function createUserId(id: string): UserId {
  // validation here
  return id as UserId;
}

function getUser(id: UserId): Promise<User> { ... }
function getPost(id: PostId): Promise<Post> { ... }

// ❌ Type error: PostId is not UserId
getUser(createPostId("123"));
```

## §4 ERROR HANDLING

### §4.1 Result Types (Recommended)

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return { ok: false, error: "Division by zero" };
  }
  return { ok: true, value: a / b };
}

const result = divide(10, 2);
if (result.ok) {
  console.log(result.value); // Type: number
} else {
  console.error(result.error); // Type: string
}
```

### §4.2 Custom Error Classes

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "AppError";
  }
}

class ValidationError extends AppError {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}
```

### §4.3 Async Error Handling

```typescript
// ❌ BAD: Swallowing errors
async function fetchData() {
  try {
    return await api.get("/data");
  } catch {
    return null; // Caller can't distinguish "not found" from "server down"
  }
}

// ✅ GOOD: Propagate or convert to Result
async function fetchData(): Promise<Result<Data, AppError>> {
  try {
    const data = await api.get("/data");
    return { ok: true, value: data };
  } catch (e) {
    if (e instanceof NotFoundError) {
      return { ok: false, error: e };
    }
    throw e; // Unexpected errors propagate
  }
}
```

## §5 TOOLCHAIN GATE (MUST PASS)

### §5.1 Required Configuration

**tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**eslint.config.js (flat config):**

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      // Errors
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "no-console": "warn",
      "eqeqeq": ["error", "always"],

      // Style (warnings, fix before merge)
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
    },
  }
);
```

### §5.2 Quality Gate Commands

```bash
# 1. Type check
npx tsc --noEmit

# 2. Lint
npx eslint .

# 3. Format
npx prettier --check .

# 4. Test
npx vitest run
```

### §5.3 Validation Library

Use **Zod** for runtime validation at boundaries:

```bash
npm install zod
```

## §6 ASYNC PATTERNS

### §6.1 Always Handle Promise Rejections

```typescript
// ❌ BAD: Floating promise
fetchData();

// ❌ BAD: No error handling
await fetchData();

// ✅ GOOD: Handle errors
try {
  await fetchData();
} catch (e) {
  handleError(e);
}

// ✅ GOOD: Explicit void for fire-and-forget (rare)
void fetchData().catch(handleError);
```

### §6.2 Concurrent Operations

```typescript
// ❌ BAD: Sequential when parallel is possible
const user = await getUser(id);
const posts = await getPosts(id);

// ✅ GOOD: Parallel execution
const [user, posts] = await Promise.all([
  getUser(id),
  getPosts(id),
]);

// ✅ GOOD: With error handling per operation
const results = await Promise.allSettled([
  getUser(id),
  getPosts(id),
]);
```

## §7 OUTPUT FORMAT

### PART 1: UNDERSTANDING

```text
Task: [restate the task]
Constraints: [list constraints]
Ambiguities: [list unclear items — ASK if critical]
```

### PART 2: DESIGN (for significant changes)

```text
TYPE DESIGN: [for complex types]
ERROR STRATEGY: [handling approach]
```

### PART 3: IMPLEMENTATION

```text
[Complete, working code]
```

### PART 4: VERIFICATION

```text
Toolchain commands: [list]
TypeScript status: [PASS or issues resolved]
ESLint status: [PASS or issues resolved]
```

## §8 FINAL AUDIT CHECKLIST

Before submitting ANY code, verify:

- [ ] No unjustified `@ts-ignore` or `@ts-expect-error`
- [ ] No `any` types (use `unknown` + guards)
- [ ] No non-null assertions without proof
- [ ] No empty catch blocks
- [ ] No floating Promises
- [ ] No `console.log()` for debugging
- [ ] All external data validated with Zod
- [ ] All error paths handled or propagated
- [ ] Strict tsconfig options enabled
- [ ] Code passes `tsc --noEmit`
- [ ] Code passes `eslint`
- [ ] Code passes tests

**If ANY checkbox is unchecked, DO NOT SUBMIT. Fix it or explain why it cannot be fixed.**
