---
name: ship-commit
phase: ship
description: "Commit accepted local changes safely; publish only when explicitly authorized."
---

## OBJECTIVE

Package accepted work into atomic local commits: each commit reverts cleanly without breaking unrelated changes. Push and PR/MR creation happen only when the request explicitly authorizes publication; then finish that workflow without re-asking. Kernel patch email is prepared, never sent. Never commit WIP or vague subjects (`fix stuff`, `update files`); stash unfinished work or use a throwaway branch.

This is not a development loop. Edit only mechanical commit blockers (formatter output, staging, metadata, signing); report defects, design issues, and missing tests in chat, and create no findings or scratch file unless asked. Never let a command open `$EDITOR`: pass messages with `-m` or `-F`.

## 1. Detect the Repo Mode

Pick one mode, state it in one line, and ask when signals conflict.

| Mode | Signals | Rules |
|---|---|---|
| kernel | `MAINTAINERS`, `scripts/checkpatch.pl`, `scripts/get_maintainer.pl`, `Kbuild`, `Makefile` with `VERSION =` | `subsystem: imperative subject`, no Conventional Commits; DCO `-s` by the human author; distribute with `git format-patch` + `git send-email`, never `git push` to mainline |
| oss-pr | `.github/`, `CONTRIBUTING.md`, public remote, PR flow | Conventional Commits; feature branch + PR; never push to `main`/`master` directly |
| internal-trunk | private remote, monorepo, no PR template | follow the repo's CONTRIBUTING/AGENTS.md; default to feature branch + PR |
| solo | no remote, or a local mirror | commit and stop; a remote is a possible route, not an instruction |

## 2. Pre-Flight

1. Format and lint with the repo's own config (`05-tooling`); in kernel mode skip blanket reformatters and run `lint-kernel` (checkpatch, `make C=2 W=1`, smatch, coccicheck, kernel-doc). Re-stage formatter changes; never mix formatter churn into a feature commit.
2. Check the staged snapshot, not only the working tree: after staging, run `pre-commit run`, or the repo's format/lint checks on the staged files, because format-on-save can re-touch files after your last check. Re-stage until clean. Never `--no-verify`.
3. Run `git status`; add or remove each untracked file deliberately.
4. Run focused tests for touched areas. In kernel mode build the affected subsystem and fix new warnings.

## 3. Review Once

1. Inspect the diff for commit hygiene: intended scope, accidental files, secrets, conflict markers, malformed generated output, coherent buckets.
2. Reuse review evidence that covers the unchanged diff: explicit user acceptance after the last edit, a `qa-review` or `qa-trace` pass over it, a `workflow-reviewer` PASS, or a repository approval. Tests and self-audit are not review.
3. Otherwise run one read-only `qa-review` pass, plus one `qa-trace` pass when the diff touches kernel concurrency or hot paths, auth, sessions, cryptography, payments, privacy, IPC, ABI, cross-trust serialization, or an unproven race. Do not patch findings or start a second round.
4. Report findings in chat. Stop only for a commit-safety blocker (accidental secret, unintended destructive content, scope substitution) or when the user or repo requires a clean verdict. Hand wanted remediation to `dev-fix` as a separate task.

## 4. Commit

1. Bucket the diff (`git diff --stat`); split any bucket that mixes concerns, especially refactor plus behavior change ("also" in a body means two commits).

    | Bucket | Conventional type | Kernel subject |
    |---|---|---|
    | config/build | `chore:` | `kbuild: …` |
    | docs | `docs:` | `Documentation/<area>: …` |
    | logic | `feat:` / `fix:` | `<subsystem>: <imperative>` |
    | refactor | `refactor:` | `<subsystem>: cleanup …` |
    | tests | `test:` | `selftests/<area>: …` |
    | perf | `perf:` | `<subsystem>: speed up …` |

2. Stage each bucket by path or hunk (`git add <files>` or `git add -p`); never `git add .`, `-A`, or `commit -a`.
3. Write an imperative subject of at most 50 characters that stands alone; for a complex change add a body, wrapped at 72 columns, that explains why. Conventional form: `type(scope): subject` with optional `Fixes #123`. Kernel form: `subsystem: subject`, body with the failure mode, then trailers.
4. Kernel trailers: `Fixes: <12-hex> ("subject")` only with a known SHA; `Cc: stable@vger.kernel.org # 6.1.x` only when a backport is intended; `Reviewed-by`/`Tested-by` only when a human gave them; `Assisted-by:` when a tool helped, naming no product. Report trailer problems instead of rewriting existing commits (`lint-kernel` → `references/submission-policy.md`).
5. Commit: `git commit -m "type(scope): subject"`, adding `-S` when a signing key is configured. Kernel mode is preparation only: `Signed-off-by:` is the human author's DCO, so print the exact `git commit -s -m …` for the author instead of running it.
6. Read back the committed message (`git log -1 --format=%B`). Remove AI attribution or vendor advertising (`Made-with:`, `Co-Authored-By:` an AI, `Generated with …`, a `Signed-off-by:` naming an AI or `noreply@anthropic.com`, `AI-Generated:`) before any push or handoff; the kernel `Assisted-by:` and the human DCO stay.
7. If a hook fails, fix only mechanical blockers, re-stage, and make a new commit (never `--amend` after an aborted hook). If the hook blocks on a product defect, report it and stop.

## 5. Publish (only when authorized)

- Branch: never commit feature work onto `main`, `master`, `trunk`, or `release/*`; create a feature branch unless the repo works direct-to-trunk. Rebase only your feature branch onto the verified upstream base.
- Push: verify the remote URL, branch, base, and commit set, then `git push -u origin <branch>`. A rewritten feature branch needs `--force-with-lease` against the proven remote tip, never bare `--force`. Push tags only in a release workflow.
- Kernel: `git format-patch -M --cover-letter -o outgoing/ <base>..`, then `scripts/get_maintainer.pl outgoing/*.patch`. Never send: print the `git send-email --to=… --cc=…` command for the author, and use `--subject-prefix="PATCH v2"` with a cover-letter changelog for revisions without overwriting an earlier `outgoing/`.
- PR/MR: one concern, ideally under 400 changed lines, linked to its issue or spec. Claim stable, production-ready, release-ready, or E2E-passed only with a scoped `verify-readiness` PASS or equivalent real-run evidence; otherwise state the narrower check that passed. Read back the published title and body and remove inserted attribution.

## Output

```markdown
Mode: oss-pr (feat/jwt-refresh) · Review: one qa-review pass, 0 blocking · Trace: not triggered

1. chore(deps): update axios to 1.6.0 — package.json, package-lock.json
2. feat(auth): implement JWT validation — src/auth/login.ts, src/auth/types.ts
3. test(auth): add login flow tests — tests/auth/login.spec.ts

Published: pushed feat/jwt-refresh; opened PR #42 against main
```

In kernel mode, report the prepared patch files, the recipients, and the command left for the author.
