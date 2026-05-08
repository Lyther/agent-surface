## §0 META: YOU WILL BE AUDITED

You are working on Linux kernel C code (or out-of-tree kernel modules) that will be **reviewed line-by-line by a maintainer who has rejected thousands of patches** and assumes you have not read `Documentation/process/submitting-patches.rst`.

The kernel community does not negotiate on style, sign-off, or scope. `checkpatch.pl` exists because reviewers refuse to spend cycles on whitespace. `sparse` and `smatch` exist because the kernel cannot afford the type bugs your IDE missed. Get it right or do not send the patch.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## SCOPE DETECTION (Heuristic)

Apply this command when **any** of the following are true:

- Top-level `MAINTAINERS`, `Kbuild`, `Documentation/process/submitting-patches.rst` exist.
- `scripts/checkpatch.pl` and `scripts/get_maintainer.pl` are present.
- Top-level `Makefile` declares `VERSION =` / `PATCHLEVEL =` / `SUBLEVEL =`.
- Source files include `<linux/...>` headers and use kernel idioms (`EXPORT_SYMBOL`, `module_init`, `MODULE_LICENSE`).

If the tree is **not** a kernel tree, fall back to `lint:c` conventions (or surface that no C-kernel lint applies).

## PROCEDURE

1. **Identify scope**: which `.c` / `.h` / `Kconfig` / `Makefile` files were touched. For an existing patch series, run against `outgoing/*.patch` instead of the working tree.

2. **Apply kernel rules** (each must pass — do not skip a tool because it "isn't installed"; install it or block):

   ```bash
   # Style — primary gate. Use --strict for new code. --no-tree if running on
   # a single .patch outside the kernel tree.
   scripts/checkpatch.pl --strict --codespell <file-or-patch>

   # Static type checking — sparse must be installed (`apt install sparse`).
   make C=2 W=1 <touched-subdir>/      # C=2 reruns sparse on all sources

   # Smatch — semantic checker, catches null derefs and lock imbalance.
   make CHECK=smatch C=1 <touched-subdir>/

   # Semantic patches — coccicheck reports kernel-style anti-patterns.
   make coccicheck MODE=report COCCI=scripts/coccinelle/<area>/<rule>.cocci

   # Doc warnings, when touching kernel-doc comments.
   make htmldocs 2>&1 | grep -E 'warning|error'
   ```

3. **Subject + sign-off discipline** (mandatory for every commit in the series):

   ```bash
   # Subject form: "subsystem: imperative short description" (≤75 cols, no period).
   # Body wrapped at 72 cols, explains *why* and the user-visible impact.
   # Trailers, in order, no blank lines between:
   #   Fixes: <12-hex> ("subject")        # required for bug fixes
   #   Reported-by: …                      # only with real attribution
   #   Cc: stable@vger.kernel.org # 6.x+   # only if backport intended
   #   Reviewed-by: / Tested-by: / Acked-by:  (REAL tags only — never invent)
   #   Signed-off-by: Name <email>         # MANDATORY (DCO 1.1)
   git commit -s        # appends Signed-off-by automatically
   ```

   Conventional Commits prefixes (`feat:`, `fix:`, `chore:`) are **forbidden** here and `checkpatch.pl` will flag them.

4. **Recipient derivation** (preparation only; sending is gated by user consent — see `ship-commit` Phase 4C):

   ```bash
   # Build the patch series locally.
   git format-patch -M --cover-letter -o outgoing/ origin/master..

   # Derive maintainers and lists for review. DO NOT auto-pipe into send-email.
   scripts/get_maintainer.pl --no-rolestats outgoing/*.patch

   # Show the proposed send-email command but do NOT execute it.
   # User must explicitly authorize before any SMTP traffic.
   echo "Proposed: git send-email --to=<maintainer> --cc=<list> outgoing/*.patch"
   ```

   Heuristic: if you have not been told to send, you are not sending. Print the plan, stop.

5. **Pre-public review (if patch will hit a public ML).** Before `git format-patch` for upstream submission:
   - Run `/qa:trace` again with the **error path** — not the happy path — as the entry point.
   - Hand the patch to a fresh agent / reviewer **without** the v1 context. If the design only survives review when you explain the journey, the patch is not ready.
   - For any `(input × concurrent-op)` quadrant you cannot empirically reach in a test, document why and how you verified by inspection. The race quadrant of RSV-2 was *only* covered by code review; that is acceptable when stated, not acceptable when hidden.
   - If a previous version was already sent publicly, write the v1→v2 changelog **as a real diff of the design**, not a politeness sentence. Reviewers should not have to re-derive what changed.

6. **Report findings** using the output format below.

## DOMAIN CHECKLIST

### Style (checkpatch territory — fix every CHECK/WARNING/ERROR)

- [ ] No tabs vs spaces drift; tabs for indentation, 8-column tabs.
- [ ] Lines ≤100 chars (kernel relaxed from 80 in 2020); reflow if you split a logical statement awkwardly.
- [ ] Braces follow K&R style: opening brace on the same line as `if`/`while`/`for`/`do`, but on its own line for function definitions.
- [ ] Comments use `/* … */` (no `//` in code outside `tools/`); kernel-doc on exported symbols.
- [ ] No trailing whitespace, no DOS line endings, no smart quotes.

### Correctness (sparse/smatch/coccinelle)

- [ ] No mixed pointer / integer arithmetic without explicit cast and reason.
- [ ] `__user`, `__kernel`, `__iomem`, `__rcu` annotations preserved on every pointer that needs them. Sparse will complain — listen.
- [ ] Endianness annotations (`__le32`, `__be64`) used consistently; no implicit `cpu_to_*` round-trips.
- [ ] No `gfp_t` flags violated by sleeping in atomic context (`smatch` flags this).
- [ ] Locking: every `lock()` has a matching `unlock()` on every exit path; no double-lock; correct lock ordering documented.
- [ ] RCU: `rcu_read_lock`/`rcu_read_unlock` balanced; no `kfree` of an RCU-protected pointer without `kfree_rcu` or `synchronize_rcu`.
- [ ] No `BUG_ON` for runtime-recoverable conditions — use `WARN_ON_ONCE` + return error.

### Memory / API hygiene

- [ ] `kmalloc`/`kzalloc`/`vmalloc` paired with the matching free; check return for `NULL`; use `_return: kfree(...)` cleanup pattern or `goto err_*` ladders, not silent leak paths.
- [ ] No `strcpy`/`sprintf`; use `strscpy`/`scnprintf`.
- [ ] No raw `memcpy` between user/kernel — use `copy_from_user`/`copy_to_user` and check the return.
- [ ] DMA buffers come from a coherent allocator (`dma_alloc_coherent`) when device-visible; no DMA-ing of stack memory.
- [ ] `printk` carries a level (`pr_err`, `pr_warn`, `dev_err`, etc.); no rate-limited noise without `*_ratelimited`.

### Build & module hygiene

- [ ] `Kconfig` entry has `help` text and depends-on chain matches the code (no `select` of unselectable symbols).
- [ ] `Makefile` uses `obj-$(CONFIG_FOO)` correctly; built both as built-in and as module if `CONFIG_FOO=m` is meaningful.
- [ ] `MODULE_LICENSE`, `MODULE_AUTHOR`, `MODULE_DESCRIPTION` present on new modules.
- [ ] No new `EXPORT_SYMBOL` without justification; prefer `EXPORT_SYMBOL_GPL` for new exports.

### Concurrency / hot path (gates `/qa:trace`)

- [ ] If the patch touches locking, IRQ context, RCU, atomics, or scheduler hooks — `/qa:trace` is **mandatory** before commit (see `ship-commit` Phase 1.5).
- [ ] `READ_ONCE`/`WRITE_ONCE` used on shared variables read/written outside locks.
- [ ] No `volatile` as a substitute for proper ordering — use `smp_*` barriers.

### Error-path & cleanup audit

When a patch adds/changes anything under `out_*:` labels, `goto err_*`, or `if (failed) cleanup(...)`, the helper you call to "undo" the prior step is **not** automatically the inverse of that step. Run all checks below before the patch leaves your machine.

- [ ] **Helper introspection.** Open the cleanup helper end-to-end. Enumerate every side effect: lock taken, lock released, counter touched, list mutated, conditional state changes, return value's meaning. A helper named `*_put_pages` may also restore reservations, release a refcount, free the object — read it; do not infer from the name.
- [ ] **Grep-existing-cleanups.** In the same file, search for `out_`, `goto err_`, `unwind`, the struct's other failure paths. The pattern you need probably already exists. Mirror it instead of inventing one. (Concrete: `hugetlb_reserve_pages` already had the direct-decrement pattern at the time of RSV-2; reaching for the helper was the mistake.)
- [ ] **State-space quadrant table.** For every input that selects a code path (e.g., `gbl_chg ∈ {0, >0}`, `map_chg ∈ {0, 1}`, `max_hpages ∈ {-1, finite}`), enumerate the cross-product. Each cell must have a documented cleanup. A cell with "shouldn't happen" or "covered by the other branch" is a bug.
- [ ] **Concurrent-op interleaving.** For each cell, list which concurrent operations on the same struct can race with the failure (`*_put_pages`, `*_unreserve_pages`, free returning to buddy, cgroup migration, ...). Walk the cleanup as if each one fires between the failed step and the unwind. The cleanup must remain correct — including not creating phantom state (e.g., raw `h->resv_huge_pages++` after concurrent free dropped `free_huge_pages` to 0).
- [ ] **Pointer aliasing across charge/uncharge windows.** If the same local pointer is reused for two charges (regular vs reserved, vmalloc vs kmalloc, dma vs cpu), task migration / preemption / interrupt between the two charges can rebind ownership. Use **separate locals** for separate ownership domains, not "save into one and uncharge it later".
- [ ] **Severity stays attached to the bug, not the patch.** If v1 was wrong, v2 is the same severity until proven otherwise. Do not let "we tried twice" lower the CVSS.
- [ ] **Do not bundle unrelated fixes** — but **do** bundle fixes that share the same charge/failure/commit window with the change you're sending. The cgroup-pointer split lived in the same `out_uncharge_*` ladder as the subpool fix, so it shipped together. A migration-state-machine fix in another function does not.

### Commit message & email discipline

Anchored to `Documentation/process/submitting-patches.rst` and `5.Posting.rst`. Reviewers' time is more valuable than your prose: minimum surface area, maximum signal.

**Body**

- [ ] **Imperative mood.** "Decrement used_hpages …", not "This patch decrements …" or "I changed …". Banned phrases: `this patch`, `I/we`, past tense verbs describing the change.
- [ ] **Frame the actual bug, not one symptom.** If the unwind needs to fire on cgroup-charge fail AND dequeue fail AND buddy alloc fail, name the underlying invariant (e.g. "subpool used_hpages accounting"), not just one trigger. Pinning the bug to a specific failure mode is misleading.
- [ ] **Wrap body at 75 columns.** Tags (`Fixes:`, `Closes:`, `Link:`) are exempt — never split a tag across lines.
- [ ] **Self-contained.** A reviewer who never saw v(N-1) must understand the patch from this message alone. Don't make them dig out the previous thread.
- [ ] **One problem per patch.** If the description grows past ~3 short paragraphs, that's a sign to split. Bundling is the exception, not the default.
- [ ] **Cite commits as `12-hex ("oneline summary")`.** Never bare SHA. The summary survives even if the SHA gets reorged.
- [ ] **Don't reference future RFCs from the commit body.** Stable backports don't advertise out-of-scope work. RFC pointers belong in cover letters or follow-up threads.

**Subject**

- [ ] **70-75 chars max.** Describe both *what* changes and *why* it might be necessary, in that one line.
- [ ] **Form: `subsystem: imperative summary`.** No period, no Conventional Commits prefix (`feat:`, `fix:`), no filename.
- [ ] **Don't reuse the same summary across patches in a series.** Each `summary phrase` becomes a globally-unique identifier — search engines, git log, follow-up review threads all key off it.
- [ ] **Version tag reflects what was sent publicly.** If v1 + v2 went to a public list, the next public revision is v3 — don't reset to v2 just because the v2-internal you wrote was never sent.

**Trailers (order, no blank lines between)**

- [ ] `Fixes: <12-hex> ("oneline")` — required for bug fixes. Tag exempt from 75-col wrap.
- [ ] `Reported-by:` / `Closes:` / `Link:` — only with real attribution; lore.kernel.org URLs preferred for `Link:`.
- [ ] `Cc: stable@vger.kernel.org # vX.Y+` — only if backport intended; verify the version range against the `Fixes:` commit's containment.
- [ ] `Reviewed-by:` / `Tested-by:` / `Acked-by:` — **never invent**. Each fake trailer is a career-shortening event.
- [ ] `Signed-off-by:` — mandatory (DCO 1.1). Use `git commit -s`.

**`Changes in vN:` placement**

- [ ] **Below the `---` separator**, between Signed-off-by and the diffstat. Never inside the commit body itself — it doesn't belong in `git log`.
- [ ] **Brief bullet list of the v(N-1) → vN delta.** Drop history of designs that never went public. Reviewers don't need to retrace your private exploration.

**Comments inside the patch (Oscar)**

- [ ] **Split long composed comments into the relevant code blocks.** A multi-paragraph comment ahead of a multi-branch `if/else if/else` is harder to map back to code than one short comment per branch placed where it explains the local action.
- [ ] **Don't compose head-spinning prose for tricky subsystems.** If the comment requires the reader to hold three counters and two locks in their head, the comment is too dense — split, or let the structure carry the explanation.

**Email plumbing**

- [ ] **Plain text only.** No HTML, no rich formatting, no auto-quoted reply prefixes that mangle diffs.
- [ ] **Use `git send-email`.** Webmail and most desktop clients reflow whitespace and break patches.
- [ ] **For replies (`[PATCH vN]`):** set `In-Reply-To:` to the v(N-1) Message-ID and `References:` to the full chain (v1, v2, …). `format-patch -v N --in-reply-to=<msgid>` handles this.
- [ ] **Trim quoted text in review replies.** Don't top-post; place your response under the specific quoted line you're addressing.
- [ ] **One Message-ID per patch.** Cover letter is patch 0; subsequent patches link via `In-Reply-To:` to the cover letter, not to each other.

## OUTPUT FORMAT

### PART 1: UNDERSTANDING

```text
Subsystem: [drivers/foo, mm/slub, fs/ext4, …]
Patch intent: [restate in one sentence]
Series size: [N patches]; cover letter: [yes / no]
```

### PART 2: TOOLCHAIN

```text
checkpatch.pl --strict:  [PASS | N CHECK / M WARNING / K ERROR]
make C=2 W=1:            [PASS | sparse warnings: list]
make CHECK=smatch C=1:   [PASS | smatch findings: list]
coccicheck:              [PASS | semantic-patch findings: list]
htmldocs (if touched):   [PASS | kernel-doc warnings: list]
```

### PART 3: SUBJECT + TRAILERS

```text
Subject:      [subsystem: imperative short description]
Sign-off:     [Signed-off-by: present? yes/no]
Fixes:        [hex: subject — present? yes/no/n-a]
Cc stable:    [yes # version-range / no / n-a]
Other tags:   [Reported-by, Reviewed-by, Tested-by, Acked-by — only real ones]
```

### PART 4: DISTRIBUTION PLAN (Local Only — No Network)

```text
Patches:    outgoing/0001-…patch  outgoing/0002-…patch  …
Cover:      outgoing/0000-cover-letter.patch
Recipients (proposed by get_maintainer.pl):
  --to:  [maintainer1] [maintainer2]
  --cc:  [list1] [list2] linux-kernel@vger.kernel.org

Send command (NOT EXECUTED — awaiting explicit user authorization):
  git send-email --to=<…> --cc=<…> outgoing/*.patch
```

### PART 5: BLOCKING ISSUES (if any)

```text
- [BLOCKER] checkpatch ERROR at <file>:<line> — <issue>
- [BLOCKER] sparse: __user pointer dereferenced without copy_from_user at <file>:<line>
- [MUST-FIX] smatch: lock 'foo' acquired in <fn>, not released on error path <line>
- [MUST-FIX] missing Signed-off-by trailer on patch 02/05
```

## ENFORCEMENT REMINDER

**You are not a clever exception.** Maintainers do not read your justification before they reply with "your patch is line-wrapped wrong, resend." Run the tools. Read `Documentation/process/submitting-patches.rst`. Use `git format-patch` and let the user invoke `git send-email`. **Do not** send patches autonomously, **do not** push to any branch named `master` / `main` / `linus` / `next`, and **do not** invent `Reviewed-by` tags — every fake trailer is a career-shortening event.

For the actual commit + distribute steps, hand off to `ship-commit`. This command is the lint gate; `ship-commit` is the consent-gated send.
