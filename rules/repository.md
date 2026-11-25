# Documentation and Repository

## File Organization

MANY SMALL FILES > FEW LARGE FILES:

- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large components

## Skeleton Projects

When implementing new projects or features:

- Search for existing projects & articles
- Use parallel agents to speed up workflow
- Clone/Reuse best match as a foundation
- Think before increasing complexity

## Documentation

- Create a new doc only when the repository's layout calls for one. Reports, summaries, and plans go in chat.
- Docs describe the current state and open decisions; history lives in git and CHANGELOG.md.
- Keep each fact only in one place.
- Every document should have a link path from README.md.
- Use concise wording; keep documents just enough to hold the required information.
- Name docs in kebab-case; common ones like `README.md` and `LICENSE` are exceptions.

## Repository

- Follow the existing layout and naming; put new files next to similar ones.
- Replace instead of forking: No `_v2`, `_new` or `_old` style copies.
- Keep scratch files, one-off scripts, and temporary files in /tmp.
