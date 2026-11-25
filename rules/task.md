# Task Workflows

## Development Modes

Use **standard** unless another mode applies.

- **Standard**: one owner, the smallest change, and the relevant check. Hand a whole, independent task to **worker**
- **Plan first**: ambiguous or multi-part work; clarify requirements with the user in the main session; use **explorer** or **researcher** when facts are missing.
- **Spec first**: clear behavior when self-grading is risky; **specifier** locks the contract and fails RED checks, then **worker** implements until green without editing or weakening **specifier**'s assertions.
- **Prototype first**: the user wants a demo first. Build a small disposable version, show it, and label it a prototype
- **Parallel worktrees**: two or more long workstreams that share no files. One **worker** per isolated worktree; the main session merges
- **Formal workflow**: a batch of related tasks that needs a spec, review gates, and a run ledger. BOSS runs in the main session, **worker** implements, and **reviewer** reviews and judges

Any mode can use **explorer** (repository search), **researcher** (docs and upstream sources), and **verifier** (checks by real execution).

## File Edits

Read a file before editing, overwriting or deleting it.

Keep external file modifications rather than overwrite silently.
