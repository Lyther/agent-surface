# Documentation and Repository

## File Organization

Keep modules cohesive and decoupled, matching the repository's existing layout and conventions. Split files only when distinct responsibilities warrant it; avoid unrequested file-splitting churn.

## Dependencies and Reuse

When implementing new features or components:

- Check existing repository utilities and standard library capabilities before writing new abstractions or adding packages.
- Before adding a dependency, vet maintenance, license, security advisories, and transitive footprint.
- Choose the simplest design that meets the current requirement without speculative extension points.

## Documentation

- Create a new doc only when asked or when the repository's layout calls for one. Reports, summaries, and plans go in chat.
- Docs describe current state and open decisions; history lives in git and `CHANGELOG.md`.
- Keep each contract in one canonical place and link rather than duplicating.
- Follow existing repository conventions for doc naming and navigation links.

## Repository

- Follow existing layout and naming; place new files next to similar ones.
- Replace instead of forking: no `_v2`, `_new`, or `_old` copies.
- Keep temporary files and one-off scripts in OS temp directories (`$TMPDIR` / `mktemp`), outside tracked project trees unless asked to preserve them as tooling.
