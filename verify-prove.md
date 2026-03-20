## OBJECTIVE

**TALK IS CHEAP. SHOW ME THE RUNNING SYSTEM.**
Unit tests are theoretical. `PROVE` is empirical.
**Your Goal**: Full artifact (containers) → Real workflow (HTTP/CLI) → Evidence (logs/responses).
**Standard**: If I cannot `curl` it, it does not exist.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Real systems generate infinite logs. Filter the noise.*

1. **Critical Path Only**:
    - Do not prove every feature. Prove the **Core Loop** (e.g., Register -> Login -> Buy).
2. **Log Sieve**:
    - When checking logs, grep for `ERROR`, `WARN`, `PANIC` only.
    - Do not output normal info logs unless specifically debugging.

## VIBE CODING INTEGRATION

This is **validation after implementation**:

```text
feature → test (unit) → PROVE (e2e) → commit
```

## PROTOCOL

### Phase 1: Cold Boot

*Build the binary reality.*

1. **Clean Start**: `docker compose down -v && docker compose up -d --build`.
2. **Wait Strategy**: Poll `/health` or use `wait-for-it.sh`. **No `sleep 30`.**

### Phase 2: Smoke Test

*Basic connectivity.*

1. **Health Check**: `curl localhost:PORT/health`.
2. **Dependency Check**: Ensure DB/Redis connections are actually active (check logs).

### Phase 3: Critical Path Script

*Execute real user workflow.*

Write a temporary bash script (`scripts/prove_temp.sh`) that:

1. **Registers** a user via API.
2. **Performs** the core action (Create Post, Transfer Money).
3. **Verifies** the result via API (GET).
4. **Verifies** the side-effect via DB (SQL query).

### Phase 4: Deep Verification

*Did data actually persist?*

1. **DB Inspection**:
    - `docker compose exec db psql -c "SELECT * FROM users..."`
    - **Evidence**: Show the row.
2. **Artifact Check**:
    - Did the file verify upload to S3 (LocalStack)?

## OUTPUT FORMAT

```markdown
# 🎬 PROOF COMPLETE

## Results
| Endpoint | Status | Time |
|----------|--------|------|
| `POST /auth/register` | ✅ 201 | 45ms |
| `POST /buy` | ✅ 200 | 120ms |

## Evidence
- **DB**: Found row `id=123` in `orders` table.
- **Logs**: Clean (0 Errors).

## Status
**🟢 SYSTEM OPERATIONAL**
```

## EXECUTION RULES

1. **NO MOCKS**: Must hit REAL containerized services.
2. **REAL DATA**: Use sandbox credentials.
3. **CLEANUP**: Ask before shutting down.
