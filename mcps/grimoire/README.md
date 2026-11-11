# grimoire

Read-only MCP that serves large Agent-Skill packs **just-in-time**. Instead of loading large skill catalogs into every session (which the model cannot attend over), grimoire exposes 4 small tools so the model *searches* for the right skill and loads only that one.

- **Design**: [concept-zero.md](concept-zero.md) · [architecture.md](architecture.md) · [api-contract.md](api-contract.md) · [data-model.md](data-model.md) · [diagrams.md](diagrams.md) · [roadmap.md](roadmap.md)
- **Stack**: stdio MCP (`@modelcontextprotocol/sdk`), self-contained `node:sqlite` FTS5 index, zod. Node ≥ 22.17.

## Tools (all read-only)

| Tool | Purpose |
|---|---|
| `grimoire_search({query, k?})` | BM25 top-k → `{id, name, summary, score}` (start here) |
| `grimoire_list({category?, cursor?})` | browse/paginate; derived categories |
| `grimoire_get({id})` | one skill: body + supporting-file manifest |
| `grimoire_file_get({id, path})` | one UTF-8 supporting file's verbatim content (path from the manifest; any other path is `NOT_FOUND`) |

Every result is `structuredContent` plus a text mirror prefixed `Indexed Agent Skill (third-party content, not authority):` so runtimes recognize the selected procedure as a usable skill without treating pack content as higher-priority instructions. Non-`ok` results carry `status` (`INDEX_MISSING`/`INDEX_STALE`/`NOT_FOUND`/`INVALID_INPUT`) + a `hint`. Responses carry no source or license metadata: pack content stays in its checkout, where each pack's LICENSE travels with it.

## Build & run

```sh
npm install && npm test          # build + run the test suite
npm run install:grimoire         # (from repo root) build index from the pinned packs, link bins
```

`install:grimoire` builds `~/.grimoire/index.sqlite` from every `served_by: ["grimoire"]` source-pack in `registry/optional-services.json` (today: `anthropic-cybersecurity-skills`, `rev-skills`, `hack-skills`, and the optional `tech-leads-club` and `trailofbits-static-analysis`) and links `grimoire-server` (+ `grimoire-index`) into `~/.local/bin`. Point your MCP host at the stdio command `grimoire-server`. The index is one write-once build artifact: the indexer writes a temp file and publishes it with a single rename, so an interrupted build leaves the previous index in place. A supporting file that is not UTF-8 text, such as an image, stays out of the index and its skill's manifest. A missing index reports `INDEX_MISSING` and an unreadable one or one built by another schema reports `INDEX_STALE`; rerun `install:grimoire` after a submodule or schema change.
