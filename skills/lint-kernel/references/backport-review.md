# Backport review

For a fix that may land in stable trees. The goal is to decide which branches can carry the fix
and what each needs — not to produce a pass/fail verdict from history archaeology.

Upstream's own position, from `Documentation/process/backporting.html`:

> Even a successful build or boot test is not necessarily enough to rule out a missing dependency.

Treat that as the ceiling on what any automated check here can claim.

## Six separate questions

Keep these distinct. Collapsing them is what produces confident wrong answers.

1. **Affected range** — which released versions contain the bug? Anchored by `Fixes:`, but the
   `Fixes:` tag is an author's claim, not ground truth.
2. **Target branches** — which currently-supported trees intersect that range? Enumerate them
   from `https://www.kernel.org/releases.json` (`moniker`, `version`, `iseol`), not from memory.
3. **Prerequisite investigation** — what does the patch depend on that an older tree may lack?
   APIs, helpers, struct members, config symbols, earlier commits.
4. **Application** — does it apply, and if not, what is the minimal adaptation?
5. **Build** — does the adapted patch compile on that branch, with a config that actually
   includes the code?
6. **Behavioral evidence** — does the bug reproduce before and stop reproducing after, on that
   branch? This is the only step that tests the fix rather than the plumbing.

Report each separately. "Applies cleanly" is not "works", and "builds" is not "correct".

## An older branch that needs work is not an excluded branch

If a branch is affected but the patch does not apply or depends on a missing API, the outcome is
usually an **adapted patch or a prerequisite backport**, not dropping that branch. Upstream names
this explicitly as Option 3 in `stable-kernel-rules.rst`: for cases where a mainlined patch needs
adjustments to apply in older series, for example due to API changes. Send the adapted version
with an explanation of what changed and why.

Excluding a still-supported affected branch is a decision that needs a stated reason.

## History search gives leads, not answers

`git log -S` / `-G` and `git describe --contains` are useful for *locating candidates to read*.
They do not establish that an API was absent, and must never be wired into an automatic verdict.

Known ways they mislead:

- **`git describe --contains` exits 128** ("cannot describe") for any commit not under a tag —
  linux-next, maintainer trees, post-`-rc` mainline. That is `MISS`, never `PASS`.
- Its output is a path like `v6.2-rc1~15^2~3`. Strip at the first `~` or `^`. The result is often
  an `-rc`, and stable branches fork at `-rc`s, so naive string comparison mis-ranks versions.
- **`-S` matches substrings, not identifiers.** `-S'kfree'` also matches `kfree_sensitive`, which
  lands the answer too early — the exact false negative you were trying to avoid. Use
  `-S'\bname\b' --pickaxe-regex`.
- **`-S` counts occurrences.** A commit that adds one use and removes another is invisible to it.
  `-G` matches added/removed lines instead, so it sees changes `-S` misses — including signature
  changes — at the cost of more noise.
- **Neither answers "when was this declared."** They are text queries, not declaration queries.
- **A path filter reports the `git mv` as the introduction** when a file was renamed; `--follow`
  does not compose with the pickaxe.
- **Revert-then-reland** makes `--reverse | head -1` return the reverted original.
- `#ifdef`-dual definitions, `static inline` in headers, `__weak`, macros, and `asm-generic`
  fallbacks all break the "one defining file" premise.

Enumerating "every identifier this diff adds" by regex does not work either — a few lines of C
yield keywords, parameter names, and string-literal contents as false identifiers.

## What actually establishes availability

Apply to the target tree and build it. That is what every production stable pipeline does.

Cheaper approximations, when a build is unavailable — each reported as a lead, not a verdict:

- `make cscope` / `make tags` (`scripts/tags.sh`), then query symbol membership in the target tree.
- `spatch` to express "flag uses of X" as a semantic patch.
- `scripts/check-uapi.sh` for UAPI/ABI compatibility.
- `scripts/checkkconfigsymbols.py` for config symbols that do not exist in range. Note it runs
  `git reset --hard`; never point it at a tree holding uncommitted work.

## Stable annotation: do not invent a failure

The annotation names a single version, which already carries "and newer":

```text
Cc: <stable@vger.kernel.org> # 3.3.x
Cc: <stable@vger.kernel.org> # v5.14
Cc: <stable@vger.kernel.org> # 3.3.x: a1f84a3: sched: Check for idle
Cc: <stable@vger.kernel.org> # see patch description, needs adjustments for <= 6.3
```

Both `# 3.3.x` and `# v5.14` spellings appear in accepted patches; a trailing `+` is redundant,
not a range operator. The third form declares a prerequisite commit that must be cherry-picked
first. Free-form comments are legal.

**An absent annotation is not a defect.** `stable-kernel-rules.rst` states the annotation is
unnecessary when the stable team can derive the versions from the `Fixes:` tag. Flagging every
un-annotated stable submission would fire on the majority of correct patches. Raise it only when
you have a specific reason to believe the derived range is wrong, and say what that reason is.

Opt-out exists and must be honored: `Cc: <stable+noautosel@kernel.org> # reason goes here`.

## Checks worth running

These are genuinely mechanical and have low false-positive rates:

- **`Fixes:` object exists**: `git cat-file -e <sha>^{commit}`. Report `MISS` without a tree
  rather than passing.
- **`Fixes:` is reachable from the review base.** That base is an input you must establish and
  state — the tree this work actually targets. Developing against a subsystem maintainer tree is
  normal, so `origin/master` is not a universal reference.

  ```bash
  # REVIEW_BASE is established explicitly. Do not infer it, and do not fall back.
  git merge-base --is-ancestor <sha> "$REVIEW_BASE"
  ```

  Do not derive it from `@{upstream}` or `HEAD`. A tracking branch may be your own published
  feature branch, and `HEAD` contains the very work under review, so both can report "ancestor"
  for a commit that is not in the target tree at all. If no base has been established, that is
  `MISS` — say the base is unknown rather than substituting a guess.

  Non-ancestry is a **lead to investigate**, not a verdict that the tag is invalid. The commit may
  live in a tree you have not fetched, or your history may be a cherry-picked or rebased variant
  in which the same change carries a different SHA. Say which of those you checked.
- **`Fixes:` SHA length and format** — checkpatch performs these format checks locally and does
  not need a git tree for them. What it *cannot* do without a tree is confirm the object exists or
  resolve its summary; that is where it degrades. See the checkpatch note in `tool-invocation.md`.
- Fix present in every newer supported branch, once the affected range is known.
