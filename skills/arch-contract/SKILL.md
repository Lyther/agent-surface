---
name: arch-contract
description: "Define aligned domain, data, API, and interface contracts without exposing internal storage as the public boundary."
---

## Objective

Produce or update the architecture contract as one coherent decision:

- the internal domain and data model, when the system owns state;
- the external and in-process interface contracts, when callers cross a boundary;
- the explicit mapping between internal entities and boundary DTOs;
- the matching `## Data and State` and `## Interfaces and Contracts` sections of `docs/architecture.md`.

Domain and data describe internal truth (entities, relationships, invariants, ownership, storage, lifecycle); interfaces describe promises across boundaries (operations, inputs, outputs, errors, authorization, compatibility, retry). Keep the two views aligned without collapsing them: storage rows and internal entities are never the public contract by default, every exposed field and operation maps deliberately to domain behavior, and every material invariant has one owner.

Define the smallest contract that meets current requirements, with required behavior precise and speculative surfaces left out. Invent no persistence, endpoints, transports, or versioning the concept and architecture do not require. Mark a track `NOT_APPLICABLE` with evidence when the system genuinely has no owned state or no callable boundary; report `RESEARCH_REQUIRED` when a required decision lacks evidence.

## Input

Read in order:

1. Explicit user requirements and constraints.
2. `docs/context/concept-zero.md` or the verified equivalent.
3. `docs/architecture.md`, especially system context, boundaries, data, interfaces, and source tree.
4. Existing schemas, migrations, ORM or domain types, route definitions, public types, protocol files, and handlers.
5. Repository conventions for storage, validation, serialization, identity, authorization, errors, and compatibility.
6. Authoritative standards or platform docs, only where the selected contract depends on them.

Preserve the established stack and datastore unless the user asks for a change; report conflicts instead of silently migrating or adding another representation.

## Principles

- Requirements determine entities and interactions; schema and transport follow.
- Keep one canonical representation per fact and generate or derive secondary forms instead of hand-maintaining equivalent schemas.
- Never expose secrets, storage keys, internal flags, or implementation-specific fields across a boundary.
- Add an entity, field, operation, index, version, or transport only for a current requirement.
- Assign each invariant to one constraint, type, validator, or domain module.
- Use one error model, authorization model, pagination strategy, and compatibility policy per surface unless a named requirement forces a difference.
- Ordering, limits, idempotency, null semantics, failure behavior, and lifecycle are part of the contract.
- Treat persisted-data and published-interface compatibility as deliberate lifecycle decisions.

## Procedure

Model internal truth before boundary shapes, but design both in the same run.

1. Establish applicability: state the system owns versus reads from another system; entities and relationships stakeholders recognize; callers and interactions crossing process, service, plugin, library, UI, CLI, or MCP boundaries; the system of record for each stateful concept; and what is explicitly not stored or exposed. Classify the domain/data and interface tracks as `REQUIRED`, `NOT_APPLICABLE`, or `RESEARCH_REQUIRED`; implementation not having started is not `NOT_APPLICABLE`.
2. Define the domain model. Per entity: meaning and owner; identity, attributes, types, required versus optional state, and allowed values; relationships and cardinality; uniqueness and other invariants; sensitivity and retention; the component that enforces each invariant. Prefer stable identities, explicit optionality, typed time and money, and closed sets where supported, and make illegal states hard to represent without adding ceremony to trivial fields.
3. When the system owns persistent state, map the model to the selected store: the canonical schema, migration, or ORM representation; primary, foreign, unique, and check constraints; indexes justified by actual access paths; transaction and consistency boundaries; deletion, retention, recovery, and corruption posture; versioned migration and rollback. Keep schema and domain types aligned from one canonical representation where practical. Add no datastore, cache, queue, event log, or replication path without a current requirement.
4. For each required boundary, choose the simplest transport the architecture already supports and define: consumer, trigger, operation, and stable name; inputs, outputs, validation, and nullability; result and error behavior; authentication and authorization; idempotency and retry; ordering, pagination, filtering, and limits where relevant; compatibility, deprecation, and migration. Use the repository's native contract form (OpenAPI, GraphQL SDL, protobuf, MCP schemas, public language types, CLI grammar, or another established source). Never add HTTP, GraphQL, RPC, streaming, or messaging to appear complete.
5. For every request and response shape, map fields and operations to domain concepts; state where boundary validation ends and domain validation begins, validating external input before it becomes domain state; exclude secrets and internal-only state; separate create and update inputs from stored entities and returned DTOs; and verify interface behavior preserves domain invariants. Resolve naming or type disagreements explicitly; never duplicate a model under two names or serialize a storage record as a shortcut.
6. Write only the artifacts the selected stack needs: schema, migrations, ORM or domain types, and a concise data dictionary for non-obvious fields; API, RPC, MCP, CLI, or public-library contract files; the `docs/architecture.md` data and interface sections, linking canonical sources; and an ERD or boundary/dataflow view through `arch-diagram` when relationships are not obvious in prose.
7. Run the cheapest real checks available: schema or migration validation, contract lint, breaking-change comparison, type-check, build, and relevant real tests. Missing tooling or prerequisites make that proof `BLOCKED`; never substitute a fake contract path.

Stop on a material unresolved product or compatibility decision instead of guessing a contract that implementation would entrench.

## Output

1. Domain/data contract: canonical model artifacts, owned invariants, migration posture, and data dictionary, or an evidenced `NOT_APPLICABLE`.
2. Interface contract: canonical machine-readable or typed boundary artifacts with behavior and compatibility rules, or an evidenced `NOT_APPLICABLE`.
3. Mapping: explicit entity-to-DTO and validation ownership, including fields that must never cross the boundary.
4. Architecture documentation: synchronized `Data and State`, `Interfaces and Contracts`, and source ownership references.

## Report

Report Changed (full paths to the model, schema, interface, dictionary, and architecture artifacts); Applicability (each track `REQUIRED` or `NOT_APPLICABLE`, with evidence); Checks (real schema, migration, contract, type, build, and test commands as `passed`, `failed`, `blocked`, or `not run`); Blockers (unresolved contract decisions, whether a human must act, and the unblock path); and the next command, usually `arch-diagram`, `workflow-boss`, or a named implementation workflow.
