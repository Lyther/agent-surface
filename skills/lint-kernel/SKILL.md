---
name: lint-kernel
description: "Apply Linux kernel patch and C review discipline."
---

## Objective

Lint and prepare Linux kernel C patches, in-tree or out-of-tree modules, to the standard of `Documentation/process/submitting-patches.rst`; read it. This skill is the lint gate; hand the commit and distribution steps to `ship-commit`. If a constraint below cannot be met, stop and name the blocker.

## Scope

Apply when any of these hold:

- Top-level `MAINTAINERS`, `Kbuild`, and `Documentation/process/submitting-patches.rst` exist.
- `scripts/checkpatch.pl` and `scripts/get_maintainer.pl` exist.
- The top-level `Makefile` declares `VERSION =`, `PATCHLEVEL =`, and `SUBLEVEL =`.
- Sources include `<linux/...>` headers and use kernel idioms (`EXPORT_SYMBOL`, `module_init`, `MODULE_LICENSE`).

Otherwise say no kernel lint applies and use the repository's own C tooling.

## Procedure

1. List the touched `.c`, `.h`, `Kconfig`, and `Makefile` files. For an existing series, check `outgoing/*.patch` instead of the working tree.
2. Select the checks this patch needs (a documentation-only change needs no smatch) and record one state per check: `PASS` (ran, found nothing), `FAIL` (ran, found a defect), `SKIP` (does not apply; say why), or `MISS` (applies but could not run: tool absent, no built tree, no hardware; say why). A `MISS` never counts as a pass or toward an "N/N" score, and it blocks only the claim its check supports: missing sparse blocks "no new type errors", not "checkpatch is clean". The patch states testing in one line; other `MISS` entries stay in your report. A runtime result binds only the patch ID it ran; rerun it after any code change.

   ```bash
   # Style gate: --strict for new code; add --no-tree for a lone .patch outside a kernel tree.
   # Add --max-line-length=80 for netdev and wireless, whose CI checks at 80 columns.
   # Check a copy of a mail outside the repo: given a git-tracked path, checkpatch reads it as a source file.
   scripts/checkpatch.pl --strict --codespell <file-or-patch>
   # Sparse. C=2 checks every source; C=1 checks only recompiled files, often none on a warm tree.
   make C=2 W=1 <touched-subdir>/
   # Smatch (null derefs, lock imbalance). Its cross-function database is optional and only widens cross-call reach.
   make CHECK=smatch C=2 W=1 <touched-subdir>/
   # Coccinelle semantic patches for kernel anti-patterns.
   make coccicheck MODE=report COCCI=scripts/coccinelle/<area>/<rule>.cocci
   # kernel-doc warnings, when kernel-doc comments change. Capture first so make's status survives the filter.
   make htmldocs > /tmp/htmldocs.log 2>&1; rc=$?
   grep -E 'warning|error' /tmp/htmldocs.log; exit $rc
   ```

   Report how many files each analyzer processed; a pass over zero files is `MISS`. Most of these tools exit 0 with findings; read `references/tool-invocation.md` before trusting a status. An indexed navigator (`references/semcode.md`) is optional help for repeated lookups in a large tree, never a prerequisite and never a substitute for reading the source.
3. Check every commit in the series against "Commit Message" below. When a review corrects one mail, check every unsent mail for the same defect. Draft the message but never add `Signed-off-by:` or run the sign-off: only the human author certifies the DCO, so hand over the exact `git commit -s -m "subsystem: imperative subject" -m "Body."`.
4. Prepare recipients locally:

   ```bash
   # Against the review base you established (often a subsystem tree; origin/master is not universal).
   git format-patch -M --base=<review-base> --cover-letter -o outgoing/ <review-base>..
   # Keep the defaults: git fallback adds history-derived reviewers that MAINTAINERS alone does not list.
   # Run it on mails outside git's tracked paths: a tracked path is looked up as a source file.
   scripts/get_maintainer.pl --no-rolestats outgoing/*.patch
   # MAINTAINERS-only inspection, never for deriving recipients:
   #   scripts/get_maintainer.pl --nogit --no-git-fallback outgoing/*.patch
   echo "Proposed: git send-email --to=<maintainer> --cc=<list> outgoing/*.patch"
   ```

   Never pipe recipients into `git send-email` or run it: print the plan and stop. SMTP traffic needs explicit user authorization, and the user runs the send. A root `.get_maintainer.conf` is prepended to the arguments, so explicit flags win; read it before trusting output whose flags you did not fully set. Drop every address that bounced on an earlier version or sits on a dead domain, such as `@codeaurora.org`: the git fallback still lists such addresses from history, and they return 550 "user not found". Cc the author of any in-flight patch that changes the same context, found through Patchwork and lore, so they can coordinate the merge order with the maintainer. Splice notes below `---` into the exported files; never hand-build a mail. Compare recipient runs under `PERL_HASH_SEED=0 PERL_PERTURB_KEYS=0`; unseeded runs break history ties at random. `K:` patterns match all text before the diff, so rewording can change recipients. Netdev and wireless CI also run `get_maintainer.pl` over the notes below `---`: never name a compiler there, since the CLANG/LLVM `K:` entry adds its maintainers.
5. When the fix may reach stable, answer six questions separately: affected range, target branches, prerequisite investigation, application, build, behavioral evidence. History searches (`git log -S`/`-G`, `git describe --contains`) give leads to read, not verdicts; they misreport renames, reverts, and substring matches. An affected branch that needs an adapted patch or a prerequisite is not an excluded branch. Procedure: `references/backport-review.md`.
6. Before `git format-patch` for a public list:
   - Rerun `qa-trace` with the error path, not the happy path, as the entry point.
   - Have a fresh agent or reviewer review the patch without the earlier context; if the design survives only with the backstory, it is not ready.
   - For each `(input × concurrent-op)` quadrant no test reaches, state in your report why and how you verified it by inspection.
   - If an earlier version went public, write the vN changelog as a real diff of the design.
7. Read a subsystem CI reply (patchwork, `bluez.test.bot`) per check. A crash inside the userspace test harness, such as a sanitizer report from BlueZ `src/shared/`, is not a kernel finding, but every test after it never ran against the patch: check whether unrelated series fail the same way, then rerun the full suite locally on a harness revision without the breakage before calling those tests passed.
8. Before reporting, apply `references/finding-discipline.md`: each issue needs concrete evidence on at least one execution path, style points are capped and held to a higher bar than correctness, and you never assert authorship or comment on a disclosure trailer. Report in the Output format.

Never push to a branch named `master`, `main`, `linus`, or `next`.

## Checklist

### Style

Fix every checkpatch CHECK, WARNING, and ERROR.

- Tabs for indentation, 8 columns wide; lines at most 100 columns, without awkward splits of one logical statement.
- K&R braces: the opening brace on the `if`/`while`/`for`/`do` line, on its own line for function definitions.
- `/* … */` comments (no `//` outside `tools/`); kernel-doc on exported symbols.
- No trailing whitespace, DOS line endings, or smart quotes.

### Correctness

- No mixed pointer/integer arithmetic without an explicit cast and reason.
- Keep `__user`, `__kernel`, `__iomem`, and `__rcu` on every pointer that needs them; act on sparse's warnings.
- Use endianness types (`__le32`, `__be64`) consistently, with no implicit `cpu_to_*` round-trips.
- No sleeping in atomic context against the `gfp_t` flags (smatch flags this).
- Release every lock on every exit path; no double lock; document lock ordering.
- Balance `rcu_read_lock`/`rcu_read_unlock`; free an RCU-protected pointer only with `kfree_rcu` or after `synchronize_rcu`.
- Use `WARN_ON_ONCE` plus an error return, not `BUG_ON`, for runtime-recoverable conditions.
- When a fix checks one call's return value, check every other call of that helper in the file and every caller of a function whose return type changes; reviewers ask about the other call sites.

### Memory and API

- Pair `kmalloc`/`kzalloc`/`vmalloc` with the matching free, check for `NULL`, and unwind through a cleanup pattern or `goto err_*` ladder with no silent leak path.
- Use `strscpy`/`scnprintf`, never `strcpy`/`sprintf`.
- Cross the user/kernel boundary with `copy_from_user`/`copy_to_user` and check the return; no raw `memcpy`.
- Choose DMA mapping by lifetime: `dma_alloc_coherent`/`dma_pool` for long-lived structures the CPU and device touch in parallel (ring descriptors, mailboxes); `dma_map_single`/`dma_map_sg` with the matching `dma_unmap_*` for one-shot transfers. Coherent memory can be expensive and page-granular, so it is not the default.
- Never DMA to or from stack, static or module-image, vmalloc, or kmap addresses: they may map differently from the rest of physical memory, and unaligned buffers corrupt shared cachelines on DMA-incoherent CPUs. `dma_map_single` buffers come from a physically contiguous source (kmalloc or the page allocator).
- Give every `printk` a level (`pr_err`, `pr_warn`, `dev_err`); rate-limit repeated noise with `*_ratelimited`.

### Build and Modules

- `Kconfig` entries have `help` text and a depends-on chain that matches the code; no `select` of unselectable symbols.
- `Makefile` uses `obj-$(CONFIG_FOO)`; build both built-in and as a module when `CONFIG_FOO=m` is meaningful.
- New modules declare `MODULE_LICENSE`, `MODULE_AUTHOR`, and `MODULE_DESCRIPTION`.
- No new `EXPORT_SYMBOL` without justification; prefer `EXPORT_SYMBOL_GPL`.

### Concurrency

- A patch touching locking, IRQ context, RCU, atomics, or scheduler hooks needs a `qa-trace` pass before commit (`ship-commit` "Review Once").
- Each added cancel, disable, or barrier needs a producer the caller or core does not already exclude; otherwise drop it and its race claim.
- Delete a flag or guard that existing state already implies; prove it through every caller's locking.
- Check any locking claim, yours or a reviewer's, against the target tree's version; lock types change across releases.
- Mark accesses per `tools/memory-model/Documentation/access-marking.txt`, a four-way choice:
  - Plain C when a held lock or seqlock excludes the access, for init-before-publication or cleanup, for CPU- or task-private data, or with no concurrent store; marking these hides real bugs from KCSAN.
  - `READ_ONCE`/`WRITE_ONCE` when the race is intentional and the value is load-bearing for the concurrency design.
  - `data_race()` (or `__data_racy`) when the race is intentional and the value is diagnostic, re-validated against a marked reload, or feeds an error-tolerant heuristic; `data_race(READ_ONCE(x))` when both apply.
- Comment each marking's reason and document the design with `ASSERT_EXCLUSIVE_WRITER`/`ASSERT_EXCLUSIVE_ACCESS`. KCSAN is an input, not the arbiter: its silence is not correctness, and churning markings to quiet it does not help.
- Order with `smp_*` barriers, never `volatile`.

### Error Paths and Cleanup

When a patch adds or changes `out_*:` labels, `goto err_*`, or `if (failed) cleanup(...)`, run every check below; an "undo" helper is not automatically the inverse of the step it undoes.

- Read the cleanup helper end to end and list every side effect: locks taken and released, counters, list mutations, conditional state changes, the return value's meaning. Never infer them from its name (a `*_put_pages` helper may also restore reservations, drop a refcount, or free the object).
- Search the file for `out_`, `goto err_`, `unwind`, and the struct's other failure paths, and mirror the existing pattern instead of inventing one.
- Enumerate the cross-product of every input that selects a path (e.g. `gbl_chg ∈ {0, >0}` × `map_chg ∈ {0, 1}` × `max_hpages ∈ {-1, finite}`). Every cell needs a documented cleanup; "shouldn't happen" or "covered by the other branch" is a bug.
- For each cell, list the concurrent operations on the same struct that can race with the failure (`*_put_pages`, `*_unreserve_pages`, free to buddy, cgroup migration) and walk the cleanup as if each fires between the failed step and the unwind. It must stay correct and create no phantom state, such as incrementing a reserve count after a concurrent free drained the pool.
- When one local pointer would span two charges (regular vs reserved, vmalloc vs kmalloc, DMA vs CPU), use separate locals per ownership domain; migration, preemption, or an interrupt between the charges can rebind ownership.
- Keep severity attached to the bug: if v1 was wrong, v2 has the same severity until proven otherwise.
- Do not bundle unrelated fixes, but bundle fixes that share the change's charge, failure, or commit window (the same `out_uncharge_*` ladder); a fix in another function ships separately.

## Commit Message

Follow `Documentation/process/submitting-patches.rst` and `5.Posting.rst`.

Subject:

- `subsystem: imperative summary` of at most 70-75 characters, saying what changes and why; no period, no Conventional Commits prefix (`feat:`, `fix:`, `chore:`), no filename.
- Give each patch in a series a unique summary; it becomes a global identifier.
- The version tag counts public sends: after a public v1 and v2, the next public revision is v3, even if an internal v2 was never sent.
- After the subsystem prefix, follow the case the file's `git log --oneline` uses; netdev and wireless take a lowercase verb.
- Send a bug present in mainline as one patch to its fix tree (`[PATCH net]`, `[PATCH wireless]`), never one mail per tree: the maintainers resolve merge conflicts. A posting that applies only to a driver tree uses plain `[PATCH]` with `base-commit:` naming that tree.

Body:

- Describe the specific bug and its fix, sized to the patch: what fails, under which condition, then what the change does. A small fix needs two short paragraphs. Leave out speculative consequences, code walkthroughs and history the diff already shows; maintainers send over-long changelogs back for a respin.
- Imperative mood; no "this patch", "I"/"we", or past tense describing the change.
- Name the underlying invariant (e.g. "subpool used_hpages accounting"), not one triggering symptom.
- Wrap at 75 columns; never wrap or split a tag (`Fixes:`, `Closes:`, `Link:`).
- Make it self-contained for a reviewer who never saw earlier versions; one problem per patch, and past about three short paragraphs consider splitting.
- Cite commits as `12-hex ("oneline summary")`, never a bare SHA.
- No pointers to future RFCs; those belong in cover letters or follow-up threads.
- Describe each changed call by what happens to its value: a readback whose value is discarded is checked for its error, not "before its output is used".
- Disclose tool help once, where the subsystem wants it, without listing what the tool did:
  - net and net-next: the discovery and testing sentence that `maintainer-netdev.rst` ("Bug fixes") requires in the body carries it, e.g. "Found by an AI code review agent; not triggered. Compile-tested with W=1."; add no separate "AI assistance was used." line.
  - Where the maintainer keeps tool mentions out of the changelog (this author's wireless and Bluetooth mails): "AI assistance was used." as the last note below `---`, after any runtime test note.
  - Elsewhere: end the body with "AI assistance was used."

Trailers, in this order with no blank lines between:

- `Fixes: <12-hex> ("oneline")` for bug fixes. Verify the SHA exists and is reachable from the base you actually target (often a subsystem tree; `origin/master` is not universal). Non-ancestry is a lead (unfetched tree, rebased or cherry-picked history), not proof the tag is wrong; report `MISS` without a tree to check. Take the target from `git log -S` on the faulting line, not `git blame` alone: a commit that removes and re-adds the line only moved it, and a restore that runs after the faulting call does not protect it.
- `Reported-by:`, `Closes:`, `Link:` only with real attribution; prefer lore.kernel.org URLs for `Link:`.
- `Cc: stable@vger.kernel.org` only when a backport is intended. Stable takes only "a real bug that bothers people" (`stable-kernel-rules.rst`): a check that matters only when an MDIO or other bus read fails, found by review and never triggered, goes to the -next tree with no `Fixes:` and no `Cc:`, as the PHY maintainer asked of such a fix. A `Fixes:` naming a commit in a released kernel needs that decision made explicitly: without the `Cc:`, Greg's patch bot asks for a resend, and older releases get the fix only if AUTOSEL or the stable team's scripts select it; to keep it out of stable, add `Cc: <stable+noautosel@kernel.org> # reason`, where the reason is mandatory. That reason says why no stable tree should take the fix (hardening, no reachable bug); a dependency or a conflict is never that reason. Keep the stable `Cc:` line bare, with no `#` comment for a version floor, an adjustment or a prerequisite, even though `stable-kernel-rules.rst` allows one; an absent annotation is not a defect when `Fixes:` implies the range. Write any backport note below `---` as one checked sentence that names what older trees lack (the symbol or commit and the first release that has it) and what the backport changes, e.g. "Before 6.16 the quirk test reads test_bit(HCI_QUIRK_…, &hdev->quirks); with that context line the patch applies to 6.12.y and older." Verify every such claim with `git apply --check` on the stable branches before writing it, and name a prerequisite only after checking that the fix needs it to build or work, not just to apply. Notes below `---` never reach the commit, so when a branch inside the `Fixes:` range must not take the patch as is, say which one and why there. For an unpublished vulnerability use `stable@kernel.org`, after reading `references/submission-policy.md`: it protects one channel and does not make the mail private. Never pair `Cc: stable` with a not-tested disclaimer; say what testing was done. netdev takes the tag too: `maintainer-netdev.rst` ("Stable tree") dropped its old ban, so check the target tree's docs before applying a remembered subsystem rule.
- `Reviewed-by:`, `Tested-by:`, `Acked-by:` only when real; never invent one.
- No `Assisted-by:`; mainline docs dropped it (`references/submission-policy.md`).
- `Signed-off-by:` is mandatory (DCO 1.1, `git commit -s`) and certified by a human; an agent never adds it.

Trailers live in the commit object, so correcting one rewrites every later hash and invalidates a prepared series: report trailer problems, never rewrite them silently.

Put `Changes in vN:` below `---`, between `Signed-off-by:` and the diffstat, never in the commit body: a brief bullet list of the previous-to-current delta, with a lore link to each earlier posting, that omits designs never sent publicly. Write cover letters and `Changes in vN:` in the third person, with no "your" and no guess at how a maintainer numbered or read the patches; a pure style change gets one line, "minor style cleanup in f()".

Below `---`, keep only what a maintainer acts on: test status, runtime results, base or dependency facts. No defensive caveats.

Keep only the comments the code needs, one line where it fits, and drop any that restate the code. Inside the patch, place one short comment per branch where it explains the local action rather than one long composed comment above a multi-branch `if`; when a comment makes the reader track several counters and locks at once, split it or let the code structure carry the explanation.

Email: plain text through `git send-email`, a new top-level thread per revision, shallow threading within a series, and trimmed inline replies; checklist in `references/email-plumbing.md`.

## Output

```text
1. Understanding
Subsystem: [drivers/foo, mm/slub, fs/ext4, …]
Patch intent: [one sentence]
Series size: [N patches]; cover letter: [yes / no]

2. Toolchain
checkpatch.pl --strict:  [PASS | FAIL: N CHECK / M WARNING / K ERROR | SKIP: reason | MISS: reason]
make C=2 W=1 (sparse):   [PASS (f files) | FAIL: warnings | MISS: no built tree]
make CHECK=smatch C=2:   [PASS (f files) | FAIL: findings | MISS: no built tree]
  smatch coverage:       [cross-function DB built? if not, inter-procedural findings are out of scope; a run limitation, not a MISS]
coccicheck:              [PASS | FAIL: findings | MISS: ocaml unavailable]
htmldocs (if touched):   [PASS | FAIL: kernel-doc warnings | SKIP: no kernel-doc touched]
Not run: [every MISS with its reason]
Claims blocked by the above: [conclusions left unsupported]

3. Subject and Trailers
Subject:      [subsystem: imperative short description]
Sign-off:     [Signed-off-by present? yes/no; human-certified]
Fixes:        [hex: subject; present? yes/no/n-a; ancestor check PASS/MISS]
Cc stable:    [yes, bare; backport note below --- if any / noautosel # reason / no / n-a]
Disclosure:   [netdev discovery sentence / last note below --- / body line / n-a]
Other tags:   [Reported-by, Reviewed-by, Tested-by, Acked-by; real ones only]
Trailer corrections needed: [report only; never rewrite]

4. Distribution Plan (local only, no network)
Patches:    outgoing/0001-…patch  outgoing/0002-…patch  …
Cover:      outgoing/0000-cover-letter.patch
Recipients (proposed by get_maintainer.pl):
  --to:  [maintainer1] [maintainer2]
  --cc:  [list1] [list2] linux-kernel@vger.kernel.org
Send command (not executed; awaiting explicit user authorization):
  git send-email --to=<…> --cc=<…> outgoing/*.patch

5. Blocking Issues (if any)
- [BLOCKER] checkpatch ERROR at <file>:<line> — <issue>
- [BLOCKER] sparse: __user pointer dereferenced without copy_from_user at <file>:<line>
- [MUST-FIX] smatch: lock 'foo' acquired in <fn>, not released on error path <line>
```
