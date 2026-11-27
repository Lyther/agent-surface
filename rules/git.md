# Git

No AI attribution in commits, PRs, docs, comments, or generated files (exception: the Linux kernel disclosure line `"AI assistance was used."` when kernel patch policy requires it).

## Commits

Keep each commit focused and atomic, with a concise imperative subject and clear body when helpful. Never skip hooks or checks (`--no-verify`).

Before committing, inspect `git status` and `git diff --staged` (and verify `.gitignore`) so secrets (`.env`, keys, credentials), local editor state, caches, build outputs, and compiled binaries are never staged.

## Pull Requests

Push and open PRs only when the user asks.

When creating PRs:

1. Review the full branch commit history, not just the latest commit.
2. Inspect `git diff <base-branch>...HEAD` across all changed files.
3. Draft a concise PR summary covering behavior changes and risk.
4. Record the verification commands run and their results (and note anything not run).
5. Push with `-u` when publishing a new branch.
