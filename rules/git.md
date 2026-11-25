# Git

Critical: No AI attribution in anywhere.

## Commits

One feature per commit, with a concise title and message. Don't skip checks.

Before committing, check .gitignore for secrets (.env), development settings (.vscode), regeneratable files (builds, caches), binaries.

## Pull Request

Push and open PRs only when the user asks.

When creating PRs:

1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch
