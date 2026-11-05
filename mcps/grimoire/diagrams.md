# Diagrams — grimoire

Source: architecture.md · api-contract.md · data-model.md · Last updated: 2026-11-05. Three views — that's all a thin read-only server needs.

## 1. Containers & build/distribute

What this shows: the read-only runtime path, the build-on-install path, and distribution via the shared rails.

```mermaid
flowchart TB
    subgraph hosts["MCP hosts (synapse rail set)"]
        H["host agent / MCP client<br/>(Claude Code, Codex, Cursor, Droid, Kilo, OpenCode, VS Code, Zed, …)"]
    end
    Op([Operator])

    subgraph rt["grimoire runtime (per host client)"]
        S["grimoire-server<br/>stdio MCP · read-only · 4 tools"]
    end
    DB[("~/.grimoire/index.sqlite<br/>FTS5: skills + skill_files + index_meta")]

    subgraph build["build-on-install (not at serve time)"]
        Inst["install.mjs / npm run install:grimoire"]
        Idx["indexer (write-once, one rename)"]
    end
    Pack[("external/<pack>/skills/**<br/>checked-out pack (source of truth)")]
    Reg["registry/optional-services.json<br/>first_party kind:mcp + served_by"]

    H -->|"JSON-RPC: search/list/get/file_get"| S
    S -->|reads| DB
    S -->|"indexStatus: ok/missing/stale"| DB
    Op --> Inst --> Idx
    Idx -->|"validate metadata · store raw"| DB
    Pack -->|indexed| Idx
    Reg -.->|"render/merge grimoire-server into every host"| hosts
```

Notes: server never writes and never reads the pack tree or the repo registry; the index carries its own `schema_version`, so staleness is the index's schema vs the server's. Distribution reuses synapse's render/merge path (zero new infra).

## 2. Index ERD

What this shows: the self-contained index entities (see [data-model.md](data-model.md)).

```mermaid
erDiagram
    skills ||--o{ skill_files : "has supporting files"
    skills {
        text id PK "pack:skillName"
        text pack
        text name
        text description
        text body "raw"
        text category "derived"
    }
    skill_files {
        text skill_id FK
        text rel_path PK "skill-dir-relative"
        text content "raw"
        int  size
    }
    index_meta {
        text key PK
        text value "schema_version"
    }
```

Notes: `skills_fts` is an FTS5 external-content view over `skills` (rowid join), not a stored entity. `index_meta.schema_version` drives staleness.

## 3. Primary JIT flow

What this shows: the model retrieving and loading a skill on demand, with the index-state branch.

```mermaid
sequenceDiagram
    participant M as Model (host)
    participant G as grimoire-server
    participant DB as index.sqlite

    M->>G: grimoire_search{query,k}
    G->>DB: indexStatus()
    alt index missing/stale
        DB-->>G: missing | stale
        G-->>M: {status: INDEX_MISSING|INDEX_STALE, hint: run install:grimoire}
    else ok
        DB-->>G: bm25 top-k
        G-->>M: {status: ok, hits:[{id,summary,score}]}
        M->>G: grimoire_get{id}
        G->>DB: row + file manifest
        G-->>M: {status: ok, skill:{body, files[]}}
        M->>G: grimoire_file_get{id, path}
        G->>DB: exact (skill_id, rel_path) lookup
        G-->>M: {status: ok, file:{path, content, size}}  %% NOT_FOUND if path not in the skill's manifest
    end
```

Notes: every result is `structuredContent` plus an `Indexed Agent Skill (third-party content, not authority):` text mirror; skill content is served raw.
