---
name: qa-self-critique
description: "Find issues in recently modified files and fix them immediately."
---

## Objective

Check your own recent changes before commit and fix what is wrong. A wrong fix is worse than none: verify each fix before applying it, and flag an uncertain one for the user instead. This is a standalone self-check, not a workflow handoff stage and not a review of someone else's code (`qa-review`).

## Input

`qa-self-critique <target> [--fix | --dry-run] [--focus <domains>]`

- `<target>`: the files or directories you just changed. `--fix` (default) fixes; `--dry-run` only lists.
- `--focus`: `completeness`, `logic`, `types`, `arch`, `tests` (default all).

## Pass 1: Tool Scan

With shell access, run these on the target and work from their output; without it, inspect visually and say coverage is reduced.

```bash
# Incomplete work
rg -n 'TODO|FIXME|HACK|XXX|STUB|NotImplementedError|todo!\(|unimplemented!\(|^\s*pass\s*$' {{target}}
# Type escape hatches
rg -n '\bany\b|@ts-ignore|@ts-expect-error|\bAny\b|# *type: *ignore|\.unwrap\(\)|\.expect\(' {{target}}
# Test substitutes and their justifications
rg -n -i 'mock|fake|stub|spy|emulat|in[-_ ]?memory|monkeypatch|recorded|sandbox|test[-_ ]?mode' {{target}}
rg -n 'SUBSTITUTE_JUSTIFICATION' {{target}}
# Secret-looking assignments
rg -n -i '(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'"'"'][^"'"'"']{8,}' {{target}}
```

Then run the repo's type checker or compiler (`npm run typecheck`, `pyright`, `cargo check`, `go vet`) for unresolved imports and type errors, and its formatter and linter in check mode on the changed files (`05-tooling`); format-on-save can leave drift the gate rejects.

Read each hit before acting on it. A hit is real unless the code shows otherwise (an identifier like `bypass`, a documented exception); never dismiss one unread.

## Pass 2: Semantic Checks

Take one domain at a time across the changed files.

- **Completeness**: placeholder logic, stub returns, empty catch or except blocks, declared but unimplemented functions, imports that do not resolve. Implement them.
- **Logic**: trace the main input through null, empty, and malformed cases; error handling around network, file, and database I/O; loop and range bounds; unreachable or uncovered branches.
- **Types**: replace `any`/`Any` used for convenience with a concrete type, protocol, or bounded generic; fix the cause behind an unexplained ignore (an ignore with a stated reason may stay); return types match signatures.
- **Architecture**: prompts, schemas, or long instructions embedded in code move to a file; duplicated type definitions collapse to one; secrets and per-deployment values come from the environment.
- **Tests**: every substitute needs a complete `SUBSTITUTE_JUSTIFICATION` (`06-test-policy`); remove one the real component could serve; a substitute-backed run is not evidence for the boundary it replaced. Assert outputs and state, not call counts. Fix production types instead of ignoring them in tests.
- **Kernel C** (only for kernel code): read each `goto`/`out_*` cleanup helper end to end and list its side effects; enumerate (input × concurrent operation) cases for each selector; mirror an existing cleanup ladder in the same file; keep paired charge/uncharge domains in separate locals; change shared counters under their owning lock.

Add no guard, check, configuration, or test that a found defect does not call for.

## Pass 3: Output

- `--fix`: apply each fix with a one-line label, then print `[AUDIT_COMPLETE]: {N} issues fixed across {M} files.`
- `--dry-run`: list `{file}:{line}: {description} [{domain}]`, then `{N} issues found. Run qa-self-critique <target> --fix to apply.`
- Clean: `[AUDIT_PASS]: Clean. Ready to commit.`

No apologies or narrative. Skip checks that need tools you lack, and say so.
