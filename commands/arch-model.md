---
name: arch-model
phase: decide
description: "Define the data and domain model: entities, relationships, schema, invariants, and migration posture."
---
## Objective

Produce or update the data and domain model and record it where implementers rely on it:

- the schema and model artifacts the stack uses (`schema.sql` or migrations, ORM models, `src/model.*`, domain types); and
- the `## Data and State` section of `docs/architecture.md`, plus a data dictionary for the non-obvious fields.

Work from the concept and the selected architecture. Define the system's source of truth for data so implementers do not invent fields, types, or relationships while coding. If the inputs are missing, report `RESEARCH_REQUIRED` and name what `arch-roadmap` or `boot-concept` must resolve first.

## Decision Standard

Act as the data and domain owner. The model is the single source of truth: the storage schema and the in-code domain types must describe the same reality and stay aligned. Define shapes precisely enough that invalid states are hard to represent and that drift between schema and types is caught early. Keep the model as small as the concept allows; add fields and entities only when a requirement needs them.

## Research Basis

- Model in layers: conceptual (entities and relationships stakeholders recognize), then logical (attributes, keys, constraints, cardinality, technology-agnostic), then physical (schema/DDL or ORM for the chosen store).
- ERD as a living view: keep an entity-relationship view that matches the schema; generate or refresh it with `arch-diagram`.
- Data dictionary as a contract: for each non-obvious field record meaning, type, allowed values, null semantics, owner, and sensitivity. Keep it beside the schema so updates happen with schema changes.
- Keys: prefer stable surrogate keys (UUID or sequence) for identity; document natural keys and uniqueness as constraints.
- Money, time, enums: store money as integer minor units, not float; store times as explicit typed timestamps with a defined zone; model closed sets as enums or check constraints, and treat enum changes as compatibility events.
- Invariants and validation: state which component owns each invariant; validate external input at the boundary before it becomes domain state.
- Boundary separation: keep internal entities (with secrets and internal flags) distinct from external DTOs; never serialize secrets or internal fields.
- Migrations as code: version-controlled, reviewed, reversible by construction, with naming/index/sensitivity linting; treat schema like application code.

## Inputs

Read, in order:

1. Explicit user instructions and constraints.
2. `docs/context/concept-zero.md` (or verified equivalent) and `docs/architecture.md` (Data and State, Interfaces, Source Tree).
3. Existing schema, migrations, ORM models, and domain types in the repo.
4. Repository evidence: the datastore, validation library, serialization, ID strategy, and naming conventions already in use.
5. Authoritative external research when a store, type system, or constraint mechanism's real limits affect the model.

Preserve the existing datastore and conventions unless the user asks to change them; report conflicts rather than silently migrating.

## Principles

- Concept before schema: the entities and rules come from the concept; the storage technology is a consequence.
- One source of truth: generate one representation from the other (types from schema or schema from types) rather than hand-maintaining both in parallel.
- Make illegal states unrepresentable where the language allows it (distinct id types, closed enums, non-null by default, explicit optionality), without turning it into ceremony for trivial fields.
- Minimum sufficient model: the simplest schema that satisfies the concept; add structure when a requirement forces it.
- Own every invariant: each data rule has a home (a constraint, a type, or a single module) and a test or explicit proof.

## Protocol

### 1. Extract entities and relationships

From the concept and architecture, list the entities, their meaning, their relationships, and cardinality. Identify the system of record for each. Mark what is in scope and what is explicitly not stored.

### 2. Define the logical model

For each entity: attributes with types, identity (surrogate and natural keys), required versus optional, allowed values, uniqueness, referential relationships, and the invariants it owns. Keep this technology-agnostic.

### 3. Map to the physical schema

Translate to the chosen store: schema/DDL or ORM models, keys and indexes, constraints (not-null, unique, check, foreign-key), id encoding, and consistency/transaction boundaries. State retention, soft-delete versus hard-delete, and corruption/recovery posture where relevant.

### 4. Align domain types and DTOs

Define the in-code domain types that mirror the schema, the validators that parse external input at the boundary, and the public DTOs that exclude secrets and internal fields. State the entity-to-DTO mapping rule.

### 5. Write the data dictionary and migration posture

Record the non-obvious fields (meaning, allowed values, null semantics, owner, sensitivity). State the migration approach: how schema changes are versioned, reviewed, made reversible, and linted.

### 6. Update the architecture and ERD

Update `docs/architecture.md` `## Data and State` to match, note the source-tree files that own the model, and generate or refresh the ERD via `arch-diagram`.

## Output

Produce aligned outputs.

1. The model artifacts in the form the stack uses: schema/DDL (or a canonical `schema.sql` mirror), migrations, ORM models, and/or domain type files. Keep schema and types aligned and generated from a single source where possible.
2. The `## Data and State` section in `docs/architecture.md`.
3. A data dictionary for non-obvious fields. A small table is appropriate here, because a dictionary is a ledger:

```markdown
| Field | Type | Allowed / null | Owner | Sensitivity |
|---|---|---|---|---|
| user.email | text | not null, unique | accounts | PII |
| order.amount_minor | integer | >= 0, not null | billing | - |
```

For relationships and structure, prefer an ERD via `arch-diagram` over a wall of tables.

## Execution Rules

1. Schema and domain types describe the same reality and stay aligned; generate one from the other where possible.
2. Validate external input at the boundary before it becomes domain state.
3. Never store secrets in plaintext or expose internal fields through DTOs.
4. Money as integer minor units; times as typed timestamps with a defined zone; closed sets as enums or checks.
5. Schema changes ship as versioned, reviewed, reversible migrations.
6. Keep the model minimal; add entities or fields only when a requirement needs them.

## Completion Report

- Changed: full paths to schema/model artifacts, the architecture section, and the data dictionary.
- Checks: migration dry-run / schema lint / type-check / tests run as `passed`, `failed`, or `not run`.
- Blockers: unresolved modeling questions and how to unblock.
- Next command: usually `arch-api`, `arch-diagram`, or `workflow-boss`.
