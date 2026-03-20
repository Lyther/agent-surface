## OBJECTIVE

**ATOMICITY OR DEATH.**
You are operating on the Heart of the System.
**Rule #1**: ALL migrations must be **Atomic**. Either it fully succeeds, or it fully fails. No "Zombie States" allowed.
**Rule #2**: **PostgreSQL only** per project policy. MySQL/SQL Server are not permitted.
**Goal**: Zero-Downtime, Reversible, Atomic Schema/Data Evolution.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Don't paste the entire DB Dump.*

1. **Schema Only**:
    - Read `schema.prisma` or `structure.sql` (DDL), not data dumps.
    - **Prompt**: "Show me the `User` table definition."
2. **Incremental Logic**:
    - For data backfills, write a script (Python/Go) instead of a massive SQL file if > 10k rows.

## VIBE CODING INTEGRATION

**Trust Level for Migrations**: LOW — AI-generated migrations require human review.

Common misses:

- Down migrations (rollback)
- `CONCURRENTLY` for indexes
- `NOT VALID` for constraints, then `VALIDATE`
- Batching for data updates
- Timeouts and lock scopes

## PROTOCOL

### Phase 0: Preflight (Safety & Environment)

1. **Backups**: Verify recent restorable backup.
2. **Version**: Record PostgreSQL major/minor; adjust tactics (e.g., fast DEFAULT from PG 11+).
3. **Staging Dry-Run**: Apply and rollback on a prod-like dataset.
4. **Session Settings** (set per migration session):
    - `SET LOCAL lock_timeout = '2s';`
    - `SET LOCAL statement_timeout = '15m';`
    - `SET LOCAL idle_in_transaction_session_timeout = '60s';`
    - `SET LOCAL application_name = 'migration:<id>';`

### Phase 1: The Transaction Envelope (The Safety Shield)

*Prevent the "Partial Failure" shrapnel.*

1. **Wrap in Transaction** (when legal): `BEGIN; ... COMMIT;`
2. **Exception**: Operations that cannot be inside a transaction:
    - `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`
    - `VACUUM` / `REINDEX CONCURRENTLY`
    - Run these in separate files/steps.
3. **Order of Operations**:
    - DDL (Structure) first
    - DML (Data) second (batched)
    - Integrity checks last

### Phase 2: The Non-Blocking Mandate (Availability)

*Don't take down prod.*

1. **Index Strategy**:
    - Use `CREATE INDEX CONCURRENTLY` on existing large tables (>100k rows)
    - If replacing an index, create new concurrently, then drop old concurrently
2. **Constraint Strategy**:
    - Add as `NOT VALID` first: `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID;`
    - Validate later: `ALTER TABLE ... VALIDATE CONSTRAINT ...;`
3. **Column Additions**:
    - Add nullable first
    - Backfill in batches
    - Add DEFAULT, then `SET NOT NULL` after backfill (fast default on PG 11+)

### Phase 3: The Data Gravity (Data Changes)

1. **Batching**: Update in chunks (e.g., 1000–5000 rows) using primary key windows.
2. **Retry/Timeouts**: Use short locks; retry with jitter.
3. **Auditability**: Log affected row counts per batch; checkpoint progress.
4. **Analyze**: `ANALYZE` tables touched after large updates.

### Phase 4: The Sanity Check (Naming & Idempotency)

1. **Naming Constraints/Indexes**: Explicit names (e.g., `fk_orders_user_id`, `idx_orders_user_id`).
2. **Idempotency**:
    - Use `IF NOT EXISTS`/`IF EXISTS` where supported
    - Check `information_schema`/`pg_catalog` guards when needed
3. **FK Hygiene**: Ensure referenced columns are indexed before adding FKs.

### Phase 5: Post-Deployment (Verification & Rollback Readiness)

1. **Health**: Verify app health checks and error rates.
2. **Plan for Down**: Stage the `.down.sql` and verify `DROP ... CONCURRENTLY` where applicable.
3. **Monitoring**: Watch locks (`pg_locks`), long statements, and slow queries.

## OUTPUT FORMAT (The Atomic Artifact)

**Scenario: Postgres Safe Migration**

```sql
-- migrations/20240520_1200_add_safe_constraint.up.sql

-- 0. Session Safety
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15m';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL application_name = 'migration:20240520_1200_add_safe_constraint';

-- 1. Structure Change (Atomic Block)
BEGIN;
    -- Add column nullable first (Instant)
    ALTER TABLE orders ADD COLUMN user_id UUID;

    -- Add FK Constraint marked as NOT VALID (Instant, minimal lock)
    ALTER TABLE orders
    ADD CONSTRAINT fk_orders_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    NOT VALID;
COMMIT;

-- 2. Data Validation (separate step)
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user_id;

-- 3. Indexing (outside transaction)
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
```

**Scenario: The "Down" Script (The Undo Button)**

```sql
-- migrations/20240520_1200_add_safe_constraint.down.sql
-- Order matters: Drop dependent objects first
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_user_id;

BEGIN;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_user_id;
    ALTER TABLE orders DROP COLUMN IF EXISTS user_id;
COMMIT;
```

## EXECUTION RULES

1. **TIMEOUTS**: Always set `lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout`.
2. **NO FULL TABLE LOCKS**: Prefer concurrent/index-friendly ops; schedule heavy work off-peak.
3. **FOREIGN KEYS**: Ensure target columns are indexed; validate constraints separately.
4. **ROLLBACK**: Every `.up.sql` must have a `.down.sql` with inverse ops.
5. **NO STRING-SQL CONCAT**: Parameterize any migration helpers.
