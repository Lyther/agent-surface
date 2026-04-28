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

5. **Report findings** using the output format below.

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
