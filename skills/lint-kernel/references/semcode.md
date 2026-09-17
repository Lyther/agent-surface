# Semcode (optional): indexed kernel navigation

Semcode indexes a C/C++ tree and answers definition, caller, type and commit queries over it. It
is **optional navigation assistance for a kernel checkout** — never a prerequisite for reviewing a
patch, and never a substitute for reading the source. Git, the tree itself, and the kernel's own
analysis tools remain authoritative for every claim they support.

Use it when repeated structural lookups across a large tree are the bottleneck. Skip it entirely
for a single-file patch.

Upstream: <https://github.com/facebookexperimental/semcode> (Apache-2.0 / MIT).

## Setup

Pin the revision you tested. The configuration below was qualified against semcode `f852929`.

Prerequisites: a Rust toolchain, `g++`, `protobuf-compiler`, and libclang. If `pkg-config` does
not register libclang, point the build at it explicitly:

```bash
export LIBCLANG_PATH=/usr/lib/llvm-14/lib    # adjust to the installed llvm
cargo build --release
```

That produces `semcode-index`, `semcode`, `semcode-mcp` and `semcode-lsp` under
`target/release/`. Use **absolute paths** to those binaries; an MCP host spawns them without a
shell, so a bare name only resolves if its directory is already on the host's PATH.

## Indexing

Two separate operations. Doing the first does not do the second.

**Source indexing** populates functions, types and call relationships:

```bash
semcode-index -s /path/to/linux
```

**History indexing** is a distinct, explicit step over a revision range. Bind the repository here
too — `-s` defaults to the current directory, so running this from elsewhere can select the wrong
repository and database, or fail to resolve the tags:

```bash
semcode-index -s /path/to/linux --commits v6.11..v6.12
```

Pass the same `--database` you used for source indexing if that database is in a custom location.

The values below are **the tested example, not defaults** — pick the checkout and range your work
actually needs, and record what you chose:

| | Tested example |
|---|---|
| Checkout | `v6.12` (`adc218676eef25575469234709c2d87185ca223a`) |
| History range | `v6.11..v6.12` (14,607 commits) |

Embeddings (`--vectors`) and lore ingestion (`--lore`) are **not** part of this pilot. The
`vgrep_functions`, `vcommit_similar_commits` and `vlore_similar_emails` tools depend on them and
are therefore unavailable here.

## Project-local configuration

Path binding is per-project, so keep the configuration with the project rather than distributing
it. The registry can express literal `--git-repo` and `--database` arguments; what it cannot do
today is resolve those paths per project at distribution time. That is why this stays local.

Example in the `mcpServers` shape (as used by Claude Code's project-scoped `.mcp.json`; adapt the
wrapper key for another host):

```json
{
  "mcpServers": {
    "semcode": {
      "command": "/abs/path/to/semcode/target/release/semcode-mcp",
      "args": [
        "--lazy",
        "--git-repo", "/abs/path/to/linux",
        "--database", "/abs/path/to/linux/.semcode.db"
      ]
    }
  }
}
```

Bind `--git-repo` and `--database` explicitly. Both otherwise default from the launch directory,
which is not reliably the project when a host spawns the server.

`--lazy` replaces the full tool list with three discovery tools. Measured at this pin, `tools/list`
drops from **20,243 bytes (25 tools)** to **1,035 bytes (3 tools)**. Note this is a byte
measurement, not a token count, and it does not cover the whole startup payload: the
`initialize` response still carries an **8,652-byte** instructions blob in lazy mode too.

## Using it

Under `--lazy`, discovery is a sequence:

```text
list_categories                  → code_lookup, code_search, git_history, lore_email, status
get_tools {"category": "..."}    → the real tool schemas for that category
call_tool {"tool_name": "...", "arguments": {...}}
```

The parameter is `tool_name`, not `name`.

**The server emits `notifications/message` while working.** A client must correlate responses by
JSON-RPC `id` and not assume the next line is its answer. A client that reads naively will consume
notifications as responses and misreport results.

At startup the server checks whether indexing is needed and **may index the current commit**,
emitting `Checking if indexing is needed… → Indexing current commit… → Indexing complete →
Database ready for queries`.

A request issued during that window does not block. The server returns a **completed tool response
whose content says indexing is in progress** — correct `id` correlation does not change that, since
the response really is the answer to your request. So: no fixed startup delay, and no custom retry
wrapper. The qualified trial needed zero retries. If a lookup does come back reporting indexing in
progress, treat it as "not answered yet", wait for completion and reissue the lookup within a
bounded deadline rather than accepting it as a negative result.

Because of that startup behaviour, the server **writes to its database**. It is not a read-only
consumer, which is a further reason to bind it to one project rather than wire it in globally.

## Limits

Treat every one of these as a reason to check the source, not as a result.

- **A missing or incomplete index is not evidence of absence.** If history was never indexed for a
  range, a search over that range returns nothing — which says nothing about whether the commit
  exists. The same holds for symbols outside the indexed extensions or depth.
- **History searches** need the relevant history populated. Looking up an *explicit* commit has a
  fallback that reads it directly from Git, so the two behave differently; do not generalise from
  one to the other.
- **Caller results are not proven exhaustive.** A verified example confirms that case only.
  Indirect calls through function pointers, macro-generated call sites and conditional compilation
  are exactly where a call-graph index is weakest. Confirm before relying on "nothing calls this".
- **The working-directory overlay covers tracked files.** Uncommitted edits to tracked files are
  reflected without re-indexing; **new untracked files are not** until `git add`. `--git-only`
  disables the overlay and queries only committed code.
- **Path arguments are regexes and are unanchored.** `-p mm/hugetlb` also matches
  `arch/parisc/mm/hugetlbpage.c`. That is usually helpful, but it is not a rooted path filter.
- **Commit indexing excludes merge commits**, so a change that reached a branch via a merge will
  not surface as that merge.

## What this pilot establishes

A working MCP client session against a pinned checkout: the lazy discovery sequence, a definition
result, and a caller result, each checked against the tree. Measured at this pin, `find_function`
returned in 1,272ms / 5,706 bytes and `find_callers` in 396ms / 350 bytes on a first attempt.

It does **not** establish that any particular host discovers or launches this configuration
natively — that is a separate check per host — nor general accuracy across the kernel, nor
readiness for distribution. No registry or schema change, global wiring, embeddings, lore
ingestion, or mandatory Semcode step follows from it.
