## OBJECTIVE

**DEFINE THE SINGLE SOURCE OF TRUTH.**
We don't guess types. We don't use `any`.
Define shapes so rigidly that bugs become compile-time errors.
**Your Goal**: Define DB Schema AND Domain Types. They must align.

## VIBE CODING INTEGRATION

This is **foundational** — do this BEFORE implementing features:

```text
roadmap → MODEL → api → breakdown → feature
```

Strong types = Fewer AI hallucinations. AI can't invent fields that don't exist.

## PROTOCOL

### Phase 1: Branded Types (Anti-String Law)

**Problem**: Passing `userId` to function expecting `orderId`. Both strings. Compiler silent. App crashes.

**Solution**: Branded Types / Newtypes

```typescript
// TypeScript
type UserId = string & { readonly __brand: unique symbol };
type OrderId = string & { readonly __brand: unique symbol };

// Now compiler catches: processOrder(userId) // Error!
```

```rust
// Rust
struct UserId(Uuid);  // Newtype pattern
struct OrderId(Uuid);
```

**Rule**: NEVER use plain `string` or `number` for IDs, Money, or status codes.

### Phase 2: Schema + Validation (Trust But Verify)

**Problem**: TS types vanish at runtime. API returns garbage. App crashes.

**Solution**: Co-locate Types and Validators (Zod/Serde/Pydantic)

```typescript
// TypeScript with Zod
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'USER']),
  balanceCents: z.number().int().nonnegative(), // Money as integer!
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
```

```python
# Python with Pydantic
from pydantic import BaseModel, EmailStr
from uuid import UUID

class User(BaseModel):
    id: UUID
    email: EmailStr
    role: Literal['ADMIN', 'USER']
    balance_cents: int  # Money as integer!
```

**Rule**: If you define a Type, you MUST define its Validator.

### Phase 3: DTO Separation (Security)

**Problem**: `SELECT *` → `res.json(user)` → Hacker gets `password_hash`.

**Solution**: Explicit Public vs Private types.

```typescript
// Internal (full data, includes secrets)
interface UserEntity {
  id: UserId;
  email: string;
  passwordHash: string;  // SECRET
  createdAt: Date;
  deletedAt: Date | null;  // INTERNAL
}

// External (public, excludes secrets)
interface UserDTO {
  id: UserId;
  email: string;
  createdAt: Date;
}

// Mapper
function toDTO(entity: UserEntity): UserDTO {
  return {
    id: entity.id,
    email: entity.email,
    createdAt: entity.createdAt,
  };
}
```

**Rule**: API responses MUST use DTOs. Never return entities directly.

### Phase 4: Common Patterns

| Type | Bad | Good |
|------|-----|------|
| Money | `price: number` (float!) | `priceCents: number` (integer) |
| IDs | `id: string` | `id: UserId` (branded) |
| Status | `status: string` | `status: 'PENDING' \| 'DONE'` (enum) |
| Optional | `user?: { name?: string }` | `user: User \| null` (explicit) |
| Dates | `date: string` | `date: Date` (typed) |

## OUTPUT FORMAT

**The Domain Definition File**

```typescript
// src/domain/types.ts

// ============================================
// 1. BRANDED IDS
// ============================================
export type UserId = string & { __brand: 'UserId' };
export type OrderId = string & { __brand: 'OrderId' };

// Helper to create branded IDs
export const UserId = (id: string) => id as UserId;
export const OrderId = (id: string) => id as OrderId;

// ============================================
// 2. CORE ENTITIES (With Validation)
// ============================================
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid().transform(v => v as UserId),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'USER']),
  balanceCents: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;

// ============================================
// 3. DTOs (Public Interface)
// ============================================
export type UserProfileDTO = Pick<User, 'id' | 'email'>;

export const UserProfileDTOSchema = UserSchema.pick({
  id: true,
  email: true,
});
```

## EXECUTION RULES

1. **NO ANY**: `any` or unnarrowed `unknown` is capital offense
2. **NO OPTIONAL HELL**: Use `Null Object Pattern` or explicit `Option<T>`
3. **READONLY DEFAULT**: Types should be `readonly`. Mutation is evil.
4. **SINGLE SOURCE**: Don't manually write SQL AND TS types. Generate one from other.
5. **VALIDATE AT BOUNDARY**: Parse input with validator before using

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| `any` type | Explicit types |
| `as` casts without validation | `schema.parse()` |
| Plain `string` for IDs | Branded types |
| Float for money | Integer cents |
| Returning entities from API | Returning DTOs |
| Optional everything | Explicit null handling |
