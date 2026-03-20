## OBJECTIVE

**GOD MODE.**
Empty databases are useless. You need Data to see the Vibe.
**Your Goal**: Generate realistic, relational, and high-volume data for Development and Staging.
**The Standard**: The app should look "Lived In" (Avatars, History, Edge Cases).

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Factory Reuse**:
    - Reuse factories from `verify-spec` (TDD) if available.
    - If not, create shared factories in `src/factories`.
2. **Deterministic Chaos**:
    - Use a **Seed** (e.g., 12345) for random generators (Faker).
    - Ensure every run produces the *exact* same data set.

## PROTOCOL

### Phase 1: The Blueprint (Factories)

1. **Define Models**:
    - User: `email`, `password`, `role`.
    - Post: `title`, `content`, `authorId`.
2. **Dependencies**:
    - Use `faker` or similar lib for realistic strings.
    - **Constraint**: Emails must be unique.

### Phase 2: The Scenarios

*Don't just loop 100 times. Tell a story.*

1. **Scenario A: The "Happy Path" (Default)**
    - 1 Admin, 10 Users.
    - 50 Posts.
    - Everyone has an avatar.
2. **Scenario B: The "Edge Case"**
    - User with 0 posts.
    - User with 10,000 posts (Pagination check).
    - User with Emoji name.
    - Post with 1MB content.
3. **Scenario C: The "Scale"**
    - 10,000 Users (Performance check).

### Phase 3: Execution (The Script)

1. **Script Location**: `scripts/seed.ts` or `prisma/seed.ts`.
2. **Safety**:
    - **Check**: `NODE_ENV !== 'production'`.
    - **Warn**: "This will TRUNCATE all tables. Continue?"
3. **Performance**:
    - Use **Bulk Inserts** (`createMany`), not loop-await.
    - Transactional (All or Nothing).

## OUTPUT FORMAT

```typescript
// scripts/seed.ts
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding...');

  // 1. Cleanup
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();

  // 2. Factories
  const createUsers = (count: number) => Array.from({ length: count }).map(() => ({
    email: faker.internet.email(),
    name: faker.person.fullName(),
  }));

  // 3. Execution (Bulk)
  await prisma.user.createMany({ data: createUsers(50) });

  console.log('✅ Seeded 50 users.');
}

main();
```

## EXECUTION RULES

1. **NEVER SEED PROD**: Check `NODE_ENV`.
2. **DETERMINISTIC**: Set Faker seed (`faker.seed(123)`).
3. **RELATIONAL INTEGRITY**: Ensure Foreign Keys exist before linking.
4. **BULK OVER LOOP**: One query > 100 queries.
