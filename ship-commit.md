## OBJECTIVE

**THE ATOMIC SURGEON.**
Git history is a story, not a dump.
**Your Job**: Dissect current changes into logical, atomic units.
**The Enemy**: "WIP", "Update files", `git commit -a -m "fix"`.
**The Law**: If I cannot revert a specific feature without breaking unrelated changes, YOU FAILED.
**Critical Note**: Most git commands here are non-interactive. If you run anything that *could* open `$EDITOR` (commit without `-m`, interactive rebase, `git send-email --compose`), pipe it or pre-fill the message — never leave the LLM stranded at a blocked TTY.

## VIBE CODING INTEGRATION

This is the **checkpoint** in the iteration loop:

```text
spec → feature → test → REVIEW → COMMIT → next iteration
```

Commit frequently. Atomic commits enable easy rollback and bisection. Never commit code you have not just reviewed.

## PROTOCOL

### Phase 0: Repo Mode Detection (Heuristic)

*The same word means different things in different trees. Detect the rules before applying them.*

Inspect the working tree and pick **one** mode. When in doubt, ask the user.

| Mode | Detection signals | Implications |
|------|-------------------|--------------|
| **kernel** | Top-level `MAINTAINERS`, `scripts/checkpatch.pl`, `scripts/get_maintainer.pl`, `Documentation/process/submitting-patches.rst`, `Kbuild`, kernel-style `Makefile` with `VERSION =`/`PATCHLEVEL =` | Conventional Commits BANNED. Use `subsystem: imperative subject`. Sign-off via `-s` (DCO), GPG sign optional. Distribute via `git format-patch` + `git send-email`, never `git push` to mainline. |
| **oss-pr** | `.github/`, `CONTRIBUTING.md`, public remote, GitHub/GitLab/Gitea PR flow | Conventional Commits typical. Push to feature branch + open PR. Never push to `main`/`master` directly. |
| **internal-trunk** | Private remote, monorepo signals, no PR template | Follow repo's `CONTRIBUTING` or AGENTS.md. Default to feature-branch + PR unless told otherwise. |
| **solo / local** | No remote, or remote == local mirror | Commit freely. Push only when user asks. |

State the detected mode in one line before proceeding (e.g., `Mode: kernel — checkpatch + send-email path engaged`). If multiple signals conflict, ask.

### Phase 1: Pre-Flight Hygiene

*Don't wait for hooks to fail. Fix first.*

1. **Format & Lint** (mode-aware):
    - `oss-pr` / `internal-trunk` / `solo`: project formatter/linter (`npm run format`, `cargo fmt`, `ruff format`, `gofumpt`, etc.).
    - `kernel`: do **not** run blanket reformatters. Delegate to `lint:kernel` (full toolchain: `checkpatch.pl --strict`, `make C=2 W=1`, `smatch`, `coccicheck`, kernel-doc warnings). `lint:kernel` also previews the `git send-email` recipient list without sending.
    - If formatting changes files → fix and re-stage now. Never roll formatter churn into a feature commit.

2. **Untracked Files**:

    ```bash
    git status
    ```

    New files? Decide: keep (add) or trash (delete/ignore). Do not let unrelated debris ride along.

3. **Tests / Builds**:
    - Run focused tests for touched areas; ensure green.
    - `kernel`: build the affected subsystem with `make` and resolve new warnings. If the patch touches concurrency, locking, or hot paths, treat the next phase's `/qa:trace` step as **non-optional**.

### Phase 1.5: Mandatory Review Gate

*You are not the only set of eyes. Run the review BEFORE you commit, not after the diff is buried in history.*

1. **Always** invoke `/qa:review` against the staged + unstaged diff (or the bucketed file list from Phase 2). Do not skip even for "trivial" changes — the review is also a sanity check for accidental scope creep.
    - Headless usage: `/qa:review <paths> --auto-approve` so it doesn't block on Phase 0 confirmation inside another command.
    - If the review returns 🔴 REJECT-BLOCKING or non-trivial 🟡 MUST-FIX, **stop**. Fix, re-stage, re-review. Do not commit through findings.

2. **For high-stakes changes, also invoke `/qa:trace`**. Trigger heuristics (any one is enough):
    - `kernel` mode (taint/locking/race surface is the whole job).
    - Auth, session, permission, crypto, payment, or PII paths.
    - Concurrency primitives, lock ordering, RCU, atomics, async boundaries.
    - Anything touching IPC, syscall ABI, or serialization across trust zones.
    - User explicitly asks ("trace this", "make sure nothing leaks").
    - Bug fix where the root cause is not yet proven — `/qa:trace` is how you prove it.

3. **Record the verdict** in the eventual commit body when relevant ("Reviewed via /qa:review; /qa:trace clean across $entrypoint → $sink"). Do not fabricate review IDs.

### Phase 2: Classification

*Read the diff. Understand the diff.*

1. **Scan Changes**:

    ```bash
    git diff --name-only
    git diff --stat
    ```

2. **Bucket Sorting**:

    | Bucket | Files | Conventional type | Kernel subject form |
    |--------|-------|-------------------|---------------------|
    | **A: Config / Build** | `package.json`, `Dockerfile`, `Kconfig`, `Makefile` | `chore:` | `kbuild: …` / `<arch>: Kconfig: …` |
    | **B: Docs** | `README.md`, `docs/*`, `Documentation/*` | `docs:` | `Documentation/<area>: …` |
    | **C: Logic** | source code | `feat:` / `fix:` | `<subsystem>: <imperative>` |
    | **D: Refactor** | renames, mechanical cleanups | `refactor:` | `<subsystem>: cleanup …` |
    | **E: Tests** | spec/test-only changes | `test:` | `selftests/<area>: …` or `kunit: …` |
    | **F: Perf** | tuning, no behavior change | `perf:` | `<subsystem>: speed up …` |

3. **Conflict Check**:
    - Does any bucket mix two unrelated concerns? Split it (`C1`, `C2`).
    - Refactor + behavior change in the same commit is the most common offender. Separate them so revert is surgical.
    - Heuristic: if the body needs the word "also" or "additionally", the commit should be two commits.

### Phase 3: Atomic Execution

**Loop for each bucket**:

1. **Stage**: `git add <FILES_IN_BUCKET>`
    - ⛔ Never `git add .` or `git add -A`. Stage by path or by hunk (`git add -p`) so you know exactly what is going in.

2. **Craft Message**:

    **Conventional repos** (oss-pr, internal-trunk, solo by default):

    ```text
    type(scope): subject (≤50 chars, imperative)

    [optional body explaining WHY, wrapped at 72 cols]

    [optional footer: Fixes #123, Refs ENG-456]
    ```

    **Kernel repos**:

    ```text
    subsystem: imperative short description

    Body wrapped at 72 cols. Explain *why*, user-visible impact, and the
    failure mode being fixed. Reference the offending commit when fixing.

    Fixes: <12-hex> ("subject of bad commit")
    Cc: stable@vger.kernel.org # 6.x+   (only if backport intended)
    Reported-by: Name <email>            (when applicable)
    Reviewed-by: ...                     (only after review actually given)
    Signed-off-by: Your Name <you@example.org>
    ```

    Heuristic guardrails for the LLM drafting the message:
    - Imperative mood: "Add X", "Fix Y", "Remove Z" — never "Added", "Adds", "Fixes the" (in subject).
    - The subject must stand alone. The body explains why, not what.
    - Do **not** invent `Reviewed-by`/`Tested-by` trailers. They only appear when a real human gave that tag.
    - Do **not** add `Fixes:` unless you know the offending SHA.

3. **Sign & Commit** (mode-aware):

    ```bash
    # Conventional repo: GPG sign + message
    git commit -S -m "type(scope): subject"

    # Kernel: DCO sign-off (mandatory). GPG optional but encouraged.
    git commit -s -S -m "subsystem: imperative subject" \
                  -m "Body paragraph explaining why."
    ```

    Use `-F <file>` (or repeated `-m`) for multi-paragraph bodies — never invoke `git commit` without `-m`/`-F` from an LLM, since it will block on `$EDITOR`.

4. **Handle Hook Failure**:
    - Read the hook output → fix the file → re-stage → retry. Create a NEW commit; do NOT `--amend` blindly when a pre-commit hook aborted (the previous commit may not exist).
    - ⛔ Never `--no-verify`. If the hook is wrong, fix the hook in a separate commit, with justification.

### Phase 4: Distribute (Explicit-Consent Gates)

*Local commits are reversible. Anything that crosses a network boundary is not. Ask before you broadcast.*

#### 4A. Branch Discipline

- Determine the current branch (`git rev-parse --abbrev-ref HEAD`).
- **Default rule**: never push, merge, or rebase **onto** `main` / `master` / `trunk` / `release/*` without explicit user instruction. "Explicit" means the user said so in this turn or in a durable instruction (CLAUDE.md/AGENTS.md). Implication ("we're shipping this") does not count.
- If the user is currently on `main`/`master` and intends to commit feature work, suggest creating a feature branch first; do not silently commit on the protected branch.
- Rebase against upstream is allowed *to update your feature branch*, not to rewrite history on a shared protected branch:

    ```bash
    git fetch origin
    # Only if on a feature branch — never on main/master itself
    git rebase origin/<base>
    ```

#### 4B. Push (Confirm First)

- Default: do **not** `git push` automatically. State what you would push, and ask.
- If the user has authorized push for this turn:

    ```bash
    git push -u origin <feature-branch>
    ```

- ⛔ Never `git push --force` to a shared branch without explicit consent. Prefer `--force-with-lease` when force is required and authorized.
- ⛔ Never push tags as a side effect of pushing commits unless the user asked for a release.

#### 4C. Email / Patch Series (Kernel and Mailing-List Workflows)

- Default: do **not** invoke `git send-email`, SMTP, or any mailer. Sending email is irreversible and recipient lists are a blast radius the LLM cannot reason about alone.
- For kernel mode, the *preparation* is fine without consent; the *send* is not:

    ```bash
    # Prepare a patch series locally — safe to do.
    git format-patch -M --cover-letter -o outgoing/ origin/master..

    # Derive recipients for the user to review — DO NOT auto-pipe into send-email.
    scripts/get_maintainer.pl outgoing/*.patch

    # Sending requires explicit user authorization. Show the command, do not run it.
    # git send-email --to=<maintainer> --cc=<list> outgoing/*.patch
    ```

- Print the proposed `--to` / `--cc` list and the patch filenames, then stop. Wait for the user to say "send" before any SMTP traffic leaves the box.
- For revisions, use `--subject-prefix="PATCH v2"` and update the cover-letter changelog. Never silently overwrite an earlier `outgoing/` directory.

#### 4D. PR / MR Hygiene (when push is authorized)

- Small PRs (≤ 400 LOC of meaningful change). Clear description. Link mission/spec/issue.
- Do not open the PR if any 🔴 finding from `/qa:review` is unresolved.

## OUTPUT FORMAT

**The Commit Plan**

```markdown
# 📦 COMMIT PLAN

**Mode**: oss-pr (feature branch `feat/jwt-refresh`)
**Review**: /qa:review clean (3 NITs deferred)
**Trace**: /qa:trace clean across `POST /auth/refresh` → `tokenStore.write`

## 1. Chore (Config)
- **Files**: `package.json`, `package-lock.json`
- **Message**: `chore(deps): update axios to 1.6.0`

## 2. Feature (Main Work)
- **Files**: `src/auth/login.ts`, `src/auth/types.ts`
- **Message**: `feat(auth): implement JWT validation`

## 3. Test (Verification)
- **Files**: `tests/auth/login.spec.ts`
- **Message**: `test(auth): add login flow tests`

## Execution (local only — push pending user approval)
\`\`\`bash
git add package.json package-lock.json
git commit -S -m "chore(deps): update axios to 1.6.0"

git add src/auth/login.ts src/auth/types.ts
git commit -S -m "feat(auth): implement JWT validation"

git add tests/auth/login.spec.ts
git commit -S -m "test(auth): add login flow tests"
\`\`\`

## Pending User Approval
- [ ] `git push -u origin feat/jwt-refresh`
- [ ] open PR against `main`
```

For **kernel mode**, replace the Execution block with `git format-patch …` and list the proposed `git send-email` recipients under *Pending User Approval*.

## EXECUTION RULES

1. **ATOMICITY**: Unrelated changes = separate commits. Always.
2. **REVIEW BEFORE COMMIT**: `/qa:review` is mandatory. `/qa:trace` is mandatory for kernel/security/concurrency surfaces.
3. **NO WIP**: Not done? Use `git stash` (or a throwaway branch). Don't commit "WIP".
4. **EXPLAIN WHY**: Complex diff → body is mandatory. The subject is for the *what*, the body is for the *why*.
5. **PRE-COMMIT RESPECT**: Hook complains → fix the underlying issue, never `--no-verify`.
6. **IMPERATIVE MOOD**: "Add X", not "Added X" or "Adds X".
7. **SIGN-OFFS**: Conventional repos → GPG sign (`-S`) when keys are configured. Kernel → DCO sign-off (`-s`) is mandatory; `-S` additionally if your key is set up.
8. **PROTECTED BRANCHES**: No push, merge, or rebase onto `main`/`master`/`trunk`/`release/*` without explicit user authorization in the current turn or durable instructions.
9. **NO AUTO-EMAIL**: `git send-email`, SMTP, or any patch broadcast requires explicit user authorization. Prepare locally, present recipient list, then stop.
10. **NO AUTO-PUSH**: Same rule for `git push`. Print the command, wait for the green light.
11. **HEURISTICS OVER HARD-CODES**: Treat the example commands as illustrations, not scripts. Pick the right tool for the detected stack (uv, cargo, go, kbuild). When the heuristic is ambiguous, ask.

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| `git add .` / `git add -A` | Explicit file or hunk staging |
| `git commit -a` | Selective staging |
| `git commit` without `-m`/`-F` | Pre-filled message (LLM has no TTY for `$EDITOR`) |
| `--no-verify` | Fix the hook issue |
| `--amend` after a failed pre-commit hook | NEW commit (the prior commit was never created) |
| Auto `git push` | Print command, wait for user approval |
| Auto push / merge / rebase onto `main`/`master`/`trunk`/`release/*` | Feature branch + PR; protected branches require explicit consent |
| Auto `git send-email` / SMTP from any command | Prepare patches, list recipients, wait for user approval |
| `git push --force` to shared branches | `--force-with-lease`, only when explicitly authorized |
| Skipping `/qa:review` before commit | Always review staged + unstaged diff first |
| Skipping `/qa:trace` for kernel / auth / concurrency / crypto / payment | Trace it; record the verdict |
| Conventional Commits prefixes (`feat:`/`fix:`) inside the kernel tree | `subsystem: imperative subject` per `Documentation/process/submitting-patches.rst` |
| Fabricated `Reviewed-by`/`Tested-by`/`Fixes:` trailers | Only real, attributable trailers |
| "WIP" / "fix stuff" / "update files" subjects | Specific, imperative, ≤50-char subjects |
| Mixing unrelated changes | Atomic commits |
| AI attribution trailers | Clean commit messages |

### Zero-Tolerance AI Watermark Policy

**NEVER** append any of these to commit messages, PR descriptions, code comments, or any output:

- `Made-with: Cursor`, `Generated by Cursor`
- `Co-Authored-By: Claude`, `Co-Authored-By: Copilot`, `Co-Authored-By: GPT`, or any AI tool
- `Generated with Claude Code`, `🤖 Generated with [Claude Code]`
- `Signed-off-by:` referencing any AI tool or `noreply@anthropic.com` (this is distinct from the kernel DCO `Signed-off-by:` for a *human* author, which IS required)
- `AI-Generated:` headers or any branding from Anthropic, OpenAI, Google, Codeium, Windsurf

If you must attribute, use something fun: `by human`, `by mass-energy equivalence`, `by mass hallucination`.
