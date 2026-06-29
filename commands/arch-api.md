---
name: arch-api
phase: decide
description: "Define API and interface contracts: boundaries, schemas, errors, versioning, and compatibility."
---
## Objective

Produce or update the interface contract for the system and record it where implementers and callers can rely on it:

- the machine-readable contract artifact the stack uses (`docs/api/openapi.yaml`, `schema.graphql`, `proto/*.proto`, or `src/contract.*`); and
- the `## Interfaces and Contracts` section of `docs/architecture.md`.

Work from the concept and the selected architecture. Do not invent endpoints, resources, or transports the architecture does not require. If the architecture or concept lacks the inputs needed to define a contract, report `RESEARCH_REQUIRED` and name what `arch-roadmap` or `boot-concept` must resolve first.

## Decision Standard

Act as the contract owner. A contract is a promise: once published it constrains every caller and is expensive to break. Define the smallest contract that satisfies the concept's interactions with high cohesion and low coupling, then specify it precisely enough that implementers do not guess shapes, status codes, errors, or compatibility rules.

Design the contract before the handlers. The contract is the source of truth that drives implementation, tests, mocks, and client code, not a description written afterward.

## Research Basis

- Contract-first: define the contract (OpenAPI 3.2 when the selected toolchain supports it, otherwise the latest supported 3.1.x compatibility baseline; GraphQL SDL; or protobuf) before implementation and keep it in version control as the single source of truth that drives codegen, mocks, and contract tests.
- One error model: use a consistent, machine-readable error shape. For HTTP, prefer RFC 9457 Problem Details (`application/problem+json`: `type`, `title`, `status`, `detail`, plus a stable application `code`).
- Versioning is a promise: pick one scheme (URL `/v1` path versioning or a dated version header) and hold it. Signal removal with `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) headers plus a stated migration window; never break a shipped version silently.
- Cursor pagination by default for collections that grow; opaque tokens; avoid offset pagination for large or real-time data.
- Idempotency for retry safety: accept an idempotency key on non-idempotent state-changing calls and return the original outcome on replay; document which operations are not idempotent.
- Do not leak internals: never expose secrets, storage keys, stack traces, or internal field names; map domain to DTO at the boundary.
- Validate at the boundary: parse and reject malformed input before business logic runs.
- Make it checkable: lint the contract and detect breaking changes in CI; give examples for both requests and responses; for agent consumers, a static contract file plus a short summary beats prose.

## Inputs

Read, in order:

1. Explicit user instructions and constraints.
2. `docs/context/concept-zero.md` (or verified equivalent) and `docs/architecture.md` (System Context, Interfaces, Data and State, Source Tree).
3. Existing contracts and code: OpenAPI/GraphQL/proto files, route definitions, public types, current handlers.
4. Repository evidence: framework, validation library, serialization, auth, and error conventions already in use.
5. Authoritative external research for the protocols, standards, and platform limits the contract depends on.

Match the conventions the repo already uses (naming, error shape, auth, validation) unless there is a reason to change them; report the conflict if you must change them.

## Principles

- Concept and architecture before transport: interactions and boundaries decide the contract; the transport is a consequence.
- Default to the simplest sufficient transport. HTTP/REST or the repo's existing style is the default. Add gRPC, GraphQL, streaming, or message contracts only when a named driver in the architecture requires them.
- High cohesion, low coupling: a boundary should be replaceable without breaking callers. Return domain/DTO shapes, not storage rows.
- One contract, one error model, one pagination strategy, one auth model across the surface; consistency is part of the contract.
- Specify behavior, not just shape: status/result codes, error cases, idempotency, ordering, limits, and compatibility rules are part of the contract.

## Protocol

### 1. Identify boundaries and interactions

From the concept and architecture, list the interactions that cross a boundary (caller to service, service to external system, UI to API, service to service). For each, name the consumer, trigger, inputs, outputs, failure modes, and what must stay stable. Define internal interfaces (the seams the architecture says must be replaceable) as well as external ones.

### 2. Choose the surfaces

Select the transport(s) the interactions actually need, with a one-line justification each. Record adopted and deferred surfaces. Reject a transport when the existing one covers the need.

### 3. Specify resources and operations

For each resource or operation define: the name (resource nouns plus standard verbs for REST; specific named mutations for GraphQL; typed methods for RPC), inputs, outputs, result/status codes, error cases, auth/authorization, idempotency, pagination/filtering/sorting where collections are involved, and rate limits where relevant. Provide request and response examples.

### 4. Define payload contracts and the error model

Specify request and response shapes with concrete formats (uuid, date-time, email, uri), validation rules, and nullability. Define one error model reused everywhere. State the entity-to-DTO mapping rule and the fields that must never cross the boundary (secrets, internal flags, storage keys).

### 5. Define compatibility and lifecycle

State the versioning scheme, what counts as a breaking versus additive change, the deprecation signal and migration window, and how the contract is validated (lint, breaking-change diff, contract tests, mock).

### 6. Write the artifact and update the architecture

Write the machine-readable contract incrementally, one resource or area at a time rather than one giant file, and keep it as the source of truth. Update `docs/architecture.md` `## Interfaces and Contracts` to match, and note the source-tree files that own each part of the contract.

## Output

Produce two aligned outputs.

1. The contract artifact, in the form the stack uses:
   - HTTP: `docs/api/openapi.yaml` (OpenAPI 3.2 when tooling supports it; otherwise the latest supported 3.1.x compatibility baseline), built up resource by resource.
   - GraphQL: `schema.graphql`, schema-first, before resolvers.
   - RPC: `proto/*.proto`, with generated stubs (never hand-written serialization).
   - In-process / MCP / library: the public contract file the repo uses (for example `src/contract.*`) with tool/method schemas, DTOs, and limits, importing no transport or storage.

2. The `## Interfaces and Contracts` section in `docs/architecture.md`, summarizing the surface, error model, auth, versioning, and pagination, and linking to the artifact.

Keep tables only for small ledgers such as a status/result-code list or an endpoint index. Specify behavior in prose and schemas, not in bad/good tables.

A minimal HTTP error contract (RFC 9457) and an idempotent create look like:

```yaml
paths:
  /orders:
    post:
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema: { type: string, format: uuid }
      responses:
        "201": { description: Created }
        "422":
          content:
            application/problem+json:
              schema: { $ref: "#/components/schemas/Problem" }
```

## Execution Rules

1. Define the contract before handlers; freeze it during implementation and change it only by returning through this command.
2. One error model and one pagination strategy across the surface.
3. Validate and reject malformed input at the boundary; fail fast.
4. Never leak secrets, storage keys, stack traces, or internal fields; return DTOs.
5. Version deliberately; never break a shipped contract without a deprecation signal and migration window.
6. Add advanced transports or patterns only when the architecture names a driver for them.

## Completion Report

- Changed: full paths to the contract artifact and the updated architecture section.
- Checks: lint / breaking-change diff / contract tests / build run as `passed`, `failed`, or `not run`.
- Blockers: unresolved contract questions, including whether a human decision is required and how to unblock.
- Next command: usually `arch-model`, `arch-diagram`, or `workflow-boss`.
