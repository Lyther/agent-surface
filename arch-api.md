## OBJECTIVE

**DEFINE THE BOUNDARIES.**
Before components talk, they must agree on a language.
You are the Diplomat and Lawyer.
**Goal**: High Cohesion (related things together), Low Coupling (components replaceable).

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Interfaces are dense. Implementation is noise.*

1. **Interface Only**:
    - When defining contracts, do NOT look at implementation details.
    - **Prompt**: "Show me the `interface` definitions in `src/domain`. Ignore classes."
2. **Incremental Spec**:
    - Don't generate a 5000-line OpenAPI file in one go.
    - Generate one Resource (`/users`) at a time.

## VIBE CODING INTEGRATION

Contracts are **frozen** during feature implementation:

```text
roadmap → model → CONTRACT → breakdown → feature
                    ↑
              Don't change during impl!
```

Clear contracts = AI knows exactly what to implement.

## PROTOCOL

### Phase 1: Internal Interfaces (Anti-Spaghetti)

*Before implementation, define the Abstract Interface.*

**Identify Boundaries**:

- Where does logic cross a boundary? (Auth → DB, Payment → Stripe)
- What can be swapped without breaking callers?

**Define Interfaces**:

```typescript
// TypeScript
interface IPaymentGateway {
  charge(amount: Money): Promise<Result<Receipt, PaymentError>>;
  refund(receiptId: ReceiptId): Promise<Result<void, RefundError>>;
}
```

**Coupling Rule**:

| ⛔ Bad | ✅ Good |
|--------|---------|
| `return UserModel.find()` | `return mapToDomain(UserModel.find())` |
| Service returns DB entity | Service returns Domain Object |

### Phase 2: HTTP API (RESTful Rigor)

**Resource Oriented**:

| ⛔ Bad (RPC) | ✅ Good (REST) |
|--------------|----------------|
| `POST /createUser` | `POST /users` |
| `GET /getUserById?id=1` | `GET /users/1` |
| `POST /deleteUser` | `DELETE /users/1` |

**Status Codes**:

- `200` OK
- `201` Created
- `204` No Content (delete)
- `400` Bad Request (malformed)
- `401` Unauthorized (not logged in)
- `403` Forbidden (no permission)
- `404` Not Found
- `422` Validation Error
- `429` Rate Limited
- `500` Server Error (our fault)

### Phase 3: High-Performance RPC (Internal)

*When Microservices talk, JSON is too slow.*

1. **gRPC / Protobuf**:
    - Use for service-to-service communication.
    - Define `.proto` files in a shared `proto/` repo or folder.
2. **Strict Typing**:
    - Generate client/server stubs automatically (`protoc`).
    - Never manually write the serialization logic.

### Phase 4: GraphQL (The Graph)

*When the Frontend needs flexibility.*

1. **Schema First**:
    - Define `schema.graphql` BEFORE writing resolvers.
2. **Mutation Design**:
    - Specific actions: `createUser`, not `updateUser` (too generic).
    - Return payload: `{ success: boolean, user: User, errors: [] }`.

### Phase 5: Payload Contracts (DTOs)

**Request DTOs (Zod/Pydantic)**:

```typescript
const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
```

**Response DTOs**:

- **Rule**: NEVER include `passwordHash`, `deletedAt`, or internal flags.
- **Rule**: Always map Entity -> DTO.

### Phase 6: OpenAPI Spec

```yaml
openapi: 3.0.3
info:
  title: My API
  version: 1.0.0
paths:
  /users:
    post:
      summary: Register a new user
      responses:
        '201':
          description: Created
```

## OUTPUT FORMAT

**1. Internal Interfaces** (`src/domain/interfaces.ts`)

```typescript
export interface IUserRepository {
  findById(id: UserId): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

**2. API Spec** (`docs/api/openapi.yaml` or `schema.graphql`)

## EXECUTION RULES

1. **IDEMPOTENCY**: Retry-safe where possible. Document which aren't.
2. **ERROR STANDARDIZATION**: One error shape, everywhere.
3. **VERSIONING**: Public API → `/v1/` prefix.
4. **NEVER LEAK**: Internal fields stay internal.
5. **VALIDATE EARLY**: Parse request body immediately, fail fast.

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| `200 OK` with error body | Proper status codes |
| Returning DB entities | Returning DTOs |
| `any` in request/response types | Strict schemas |
| Inventing endpoints during impl | Following defined contract |
