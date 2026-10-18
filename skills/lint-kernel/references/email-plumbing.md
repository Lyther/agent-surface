# Email plumbing for kernel patches

Companion reference for `lint-kernel`. How a prepared series reaches a list without being mangled,
threaded wrongly or confused with an earlier revision. Read it before preparing a send; the send itself
waits for explicit authorization in `ship-commit`.

- [ ] **Plain text only.** No HTML, no rich formatting, no auto-quoted reply prefixes that mangle diffs.
- [ ] **Use `git send-email`.** Webmail and most desktop clients reflow whitespace and break patches.
- [ ] **A new revision is a new thread.** Post `[PATCH vN]` at top level; do **not** set `In-Reply-To:` to the v(N-1) Message-ID. `submitting-patches.rst` asks you to avoid linking series revisions that way so references don't become "an unmanageable forest"; netdev forbids it outright. Link earlier revisions instead with lore.kernel.org URLs below the `---` or in the cover letter.
- [ ] **Trim quoted text in review replies.** Don't top-post; place your response under the specific quoted line you're addressing.
- [ ] **Thread shallow within one series.** Patches 1..N reply to the cover letter, never to each other — `--thread=shallow`, never `--chain-reply-to`/`deep`, which creates "exceptionally deep nesting". Note this is `git send-email`'s and `b4`'s default but **not** `git format-patch`'s: `--cover-letter` alone emits no threading headers unless `--thread` or `format.thread` is set.
