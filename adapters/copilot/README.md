# GitHub Copilot adapter

Native surfaces:

- `.github/copilot-instructions.md`
- `.github/instructions/*.instructions.md`
- `AGENTS.md` where supported by the consuming environment

Current implementation writes the global VS Code/Copilot user instruction surface.

Target path, relative to the VS Code user data directory:

- `instructions/agent-surface-copilot.instructions.md`

Repository-level `.github/` files remain project-specific and are not written by user-scope installs.
