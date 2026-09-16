# Kernel tool invocation and result semantics

What each tool actually proves, how to invoke it non-interactively, and why its exit code
usually cannot be trusted. Consult this when building a check plan or reporting results.

## The reporting vocabulary

Four states, borrowed from KCIDB (`kcidb-io` v5.3) and KTAP rather than invented here:

| State | Meaning |
|---|---|
| `PASS` | The check executed and found nothing. |
| `FAIL` | The check executed and found a defect. |
| `SKIP` | The check does not apply to this patch (no DMA code, so no DMA check). |
| `MISS` | The check applies but could not run — tool absent, no built tree, no hardware. |

Rollup rule: a `MISS` outranks a `PASS`. A plan containing an unresolved `MISS` never renders
green, and `MISS` never aggregates into an "N/N passed" score. Report the reason inline.

`MISS` blocks the specific claim that check would have supported, not every claim in the review.
A missing sparse blocks "no new type errors"; it does not block "checkpatch is clean".

## Exit codes are not pass signals

The kernel tree says this about its own tooling, in `scripts/checker-valid.sh`:

> sparse happily exits with 0 on error so validate there is none on stderr

Treat a nonzero exit as *the tool broke*, not *a problem was found*, unless the tool is listed
below as having meaningful status. Parse stdout/stderr for findings.

| Tool | Exit on findings | Notes |
|---|---|---|
| `checkpatch.pl` | **1** — meaningful | `--ignore`d types genuinely do not affect status. Exit 2 = not in a kernel tree. |
| `sparse` | 0 always | Needs `CF=-Wsparse-error` to fail the build. |
| `coccinelle`/`spatch` | 0 | Nonzero means the tool crashed, not that it found something. |
| `git range-diff` | 0 always | `--exit-code` is accepted but has **no effect**. Parse the `=`/`!`/`<`/`>` markers. |
| `decode_stacktrace.sh` | 0 always | Silently passes unresolvable frames through. Diff input against output. |
| `faddr2line` | 0 always | Warns to stderr, still returns 0. |
| `kunit.py run` | 0/1 only | An all-skipped run exits **1**. Parse the JSON. |
| `b4 prep --check` | inverted | Exits 1 when checkpatch is *absent*; exits 0 with real errors present. Parse stdout. |

## Output filtering destroys exit status

`make htmldocs 2>&1 | grep -E 'warning|error'` reports grep's status, not make's. A build that
died returns whatever grep decided. Either capture first and filter after, or use
`set -o pipefail`, or read `${PIPESTATUS[0]}`. Never let a pipeline swallow the real result.

## Patch checking is not source checking

These are different checks and they do not substitute for one another.

- **Patch mode** (`checkpatch.pl` on a `.patch`/`.eml`, or `-g <rev>`) sees only changed lines and
  can validate commit metadata.
- **Source mode** (`checkpatch.pl -f <file>`) sees the whole file and reports pre-existing style
  you did not introduce. Do not "fix" unrelated findings into your patch.

Critical, and worth stating precisely because the two halves differ:

- **Format checks are local.** SHA length, the `("summary")` shape, and the `BAD_FIXES_TAG`
  family are evaluated by the script itself and work fine with no git tree.
- **Object lookup needs a tree.** Confirming the commit exists and that the quoted summary matches
  it requires git; `$chk_fixes_tag = 0 if ($file)` disables the commit checks on file input, and
  the git lookups return early with no tree.

So a well-formed `Fixes:` tag pointing at a commit that does not exist passes cleanly outside a
checkout. Observed on a real patch run this way — checkpatch emitted
`WARNING:UNKNOWN_COMMIT_ID` and left the SHA unverified. Treat SHA *existence* as `MISS` in that
mode, not `PASS`.

## Incremental builds silently skip the analyzer

`make C=1` runs the checker only on files that are **actually recompiled**. On an already-built
tree, that is often nothing at all, and the run reports success having checked zero files.

- Use `C=2` to check every source regardless of rebuild state, or
- `touch` the files under review, or
- build into a clean `O=` output directory.

Always report how many files the analyzer actually processed. "sparse: PASS" over zero files is
`MISS`, not `PASS`.

## Per-tool invocation

**checkpatch.pl** — pure Perl, runs standalone, no kernel tree needed.

```bash
scripts/checkpatch.pl --no-tree --terse --no-summary --show-types --color=never <patch>
```

Never `--fix-inplace` in an automated path; upstream's own warning is "DO NOT USE this flag
unless you are absolutely sure and you have a backup in place". Note that `checkpatch --fix`
is disclosure-triggering under `generated-content.rst`.

**get_maintainer.pl** — the only in-tree script with native JSON.

```bash
# Deriving recipients: keep the defaults.
scripts/get_maintainer.pl --json --status --subsystem <patch>

# Auditing what MAINTAINERS itself declares, with no history input:
scripts/get_maintainer.pl --no-tree --mpath <MAINTAINERS> --nogit --no-git-fallback \
                          --json --status --subsystem -f <file>
```

These two invocations answer different questions and are not interchangeable. Git fallback is
**on** by default (`$email_git_fallback = 1`): when no `F:` pattern matches, the script derives
reviewers from history. Those people are often the right audience, so `--no-git-fallback` is for
deliberate MAINTAINERS-only inspection — using it to derive a send list silently shrinks the
audience, sometimes to nothing but LKML. Suppress history input only when you want that, and say
that you did.

A `.get_maintainer.conf` in the tree root is prepended to `@ARGV`, so explicit flags passed
afterwards win over it. Read it anyway before trusting output whose flags you did not fully
specify. Never `--interactive`; it reads stdin.

`--self-test[:sections|patterns|links|scm]` audits MAINTAINERS hygiene and emits parseable
`<file>:<line>: warning: <kind>` lines. It says nothing about whether an address is still alive.

**sparse / smatch** — need a configured, built tree. Invoke with `C=2` so the files under review
are actually processed.

Smatch's cross-function database is **optional**. Smatch runs and reports real findings without
it; building it only widens what it can see across call boundaries. Do not report `MISS` merely
because the database is absent, and do not treat an hours-long database build as a prerequisite.
Report the run normally and note the cross-function limitation separately — for example
"smatch: PASS (12 files), cross-function DB not built, so inter-procedural findings are out of
scope". Checks that genuinely require the database (such as sleeping-in-atomic) are the ones to
mark `MISS`; `CONFIG_DEBUG_ATOMIC_SLEEP=y` is the recommended alternative for that specific case.

**coccinelle** — needs OCaml. `spatch --dir` works without a kernel build. It has no
changed-files mode; loop per file with `M=`.

**KUnit** — the most CI-friendly runtime tool. `kunit.py run --json` emits KernelCI Test-API
format, and `--arch um` is a plain userspace binary that runs in ordinary containers with no KVM.

**KTAP results** — `ok N # SKIP` is a **skipped** test, not a passed one. Counting `ok` lines
inflates the pass rate; parse the directive. Per the KTAP spec, skipped tests do not affect the
parent result.

**lore / public-inbox** — lore.kernel.org is behind an anti-scraper that gates per endpoint and
per user-agent; plain `curl` and `python-requests` get 403 on some paths. For anything that must
be reproducible, clone the archive repositories or use `lei q -f jsonl` rather than scraping.

**b4** — `--offline-mode -n --no-stdin` compose into a deterministic harness. `prep --show-info
<key>` is the structured interface. `send -o <dir>` writes `.eml` files without sending.
