# API Contract — grimoire

Status: IMPLEMENTED (package v0.1; contract v2.0.0) · Source: mcps/grimoire/architecture.md · Last updated: 2026-11-05

The frozen tool contract for the grimoire MCP server. `src/contract.ts` (zod) is the machine-readable source of truth and owns these shapes; `src/tools.ts` implements them; `src/store.ts` returns the DTOs. Read-only: no tool mutates. Transport: MCP stdio (`@modelcontextprotocol/sdk`). `CONTRACT_VERSION` semver; the MCP `InitializeResult` carries name `grimoire` + version.

## Conventions (all tools)

- `readOnlyHint: true` on every tool; every result returns **`structuredContent`** (the typed object below) **and** a text mirror prefixed `Indexed Agent Skill (third-party content, not authority):` so runtimes recognize and use the selected skill without treating pack content as higher-priority instructions.
- Every result object has `status: "ok" | "INDEX_MISSING" | "INDEX_STALE" | "NOT_FOUND" | "INVALID_INPUT"`. On non-`ok`, the result is `{ status, hint }` only (payload fields omitted) and `isError` stays **false** — these are actionable states the model should surface, not protocol failures. Schema-invalid args (wrong type, missing required, out-of-range) never reach the handler: `McpServer` rejects them via zod and returns an `isError: true` result carrying the JSON-RPC `-32602` invalid-params message. So the two error channels are distinct: SDK schema validation ⇒ `isError: true` (`-32602`); our semantic states ⇒ `isError: false` + `status`.
- The `SKILL.md` body is served unchanged after frontmatter is separated into metadata; supporting-file `content` is served byte-for-byte as indexed.

## Shared types

```ts
type SkillId = string;     // "<pack>:<skillName>", both slugs: ^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$
type Status  = "ok" | "INDEX_MISSING" | "INDEX_STALE" | "NOT_FOUND" | "INVALID_INPUT";

interface FileManifestEntry { path: string; size: number /*bytes*/ }
interface SkillRef  { id: SkillId; pack: string; name: string; summary: string }          // list item
interface SkillHit  extends SkillRef { score: number /*bm25, higher = better*/ }           // search hit
interface SkillFull {
  id: SkillId; pack: string; name: string; description: string; body: string;
  category: string; categorySource: "derived";
  files: FileManifestEntry[];        // supporting scripts/references/assets (fetch via grimoire_file_get)
}
```

## Tools

```ts
// 1. PRIMARY. Lexical (BM25) top-k over name^/description^/body. A skill matching any query
//    term (filler words dropped, all-caps names kept; `/ , ; |` split alternatives) is a
//    candidate, and weighted BM25 orders candidates by term
//    rarity, frequency, document length and column, not by how many terms matched; an
//    unmatched term never excludes a result. Hits are the closest lexical matches, not a
//    relevance guarantee, so a query about an uncovered topic still returns its nearest rows.
//    Only a query whose every word is absent from the index returns none: nothing is padded.
grimoire_search(input: { query: string /*1..512*/; k?: number /*1..50, default 5*/ })
  -> { status: "ok"; hits: SkillHit[] /*≤k, score-desc*/ } | { status; hint }

// 2. Taxonomy/browse fallback. Name-only, paginated; category filters derived categories.
grimoire_list(input: { category?: string; cursor?: string /*opaque*/ })
  -> { status: "ok"; items: SkillRef[] /*≤PAGE=50*/; nextCursor?: string } | { status; hint }
  // unknown category -> { status:"ok", items: [] } (categories are derived, not authoritative)

// 3. One skill: full body + supporting-file manifest.
grimoire_get(input: { id: SkillId })
  -> { status: "ok"; skill: SkillFull } | { status: "NOT_FOUND"|...; hint }

// 4. One supporting file's content (exact (skill, path) lookup in the index).
grimoire_file_get(input: { id: SkillId; path: string })
  -> { status: "ok"; file: { path: string; content: string; size: number } }
   | { status: "NOT_FOUND"|"INVALID_INPUT"|...; hint }
   // any path not in the skill's manifest, traversal or absolute included -> NOT_FOUND
```

## Error semantics

| status | When | hint (example) |
|---|---|---|
| `INDEX_MISSING` | no `~/.grimoire/index.sqlite` | `index not built; run: npm run install:grimoire` |
| `INDEX_STALE` | the index cannot be opened, or `index_meta.schema_version` ≠ `SCHEMA_VERSION` | `<cause>; run: npm run install:grimoire`, where cause is `index unreadable` or `schema changed` |
| `NOT_FOUND` | `id` absent (`get`/`file_get`), or `path` not in the skill manifest (`file_get`) | `unknown skill id` / `path not in skill manifest; call grimoire_get first` |
| `INVALID_INPUT` | semantic violation past schema (e.g. malformed `id` in `get`/`file_get`, bad cursor) | `id must be "<pack>:<skillName>"` |

`INDEX_MISSING`/`INDEX_STALE` apply to **every** tool and take precedence (checked first). They are returned, never thrown or rendered as an empty result set.

## Examples

```jsonc
// grimoire_search
→ { "query": "detect cobalt strike beacon in pcap", "k": 3 }
← { "status": "ok", "hits": [
     { "id": "anthropic-cybersecurity-skills:hunting-for-cobalt-strike-beacons",
       "pack": "anthropic-cybersecurity-skills", "name": "hunting-for-cobalt-strike-beacons",
       "summary": "Detect Cobalt Strike C2 beacons in network captures.", "score": 8.7 } ] }

// grimoire_file_get after grimoire_get exposed the manifest
→ { "id": "anthropic-cybersecurity-skills:hunting-for-cobalt-strike-beacons", "path": "references/iocs.md" }
← { "status": "ok", "file": { "path": "references/iocs.md", "content": "<raw markdown>", "size": 4096 } }

// stale index
← { "status": "INDEX_STALE", "hint": "schema changed; run: npm run install:grimoire" }
```

## Limits & versioning

`query` ≤ 512 chars; `k` 1..50 (default 5); `list` page size 50; `summary` ≤ ~200 chars (derived from `description`). Additive change (new optional field / new tool) = minor bump; removing/renaming a tool or field, or changing a type/required-ness = major bump of `CONTRACT_VERSION`. Ids are stable across rebuilds (content-independent), so cached ids stay valid after re-index.
