---
name: qa-self-critique
description: "Find issues in recently modified files and fix them immediately."
---

## Objective

Check your own recent changes before commit and fix what is wrong. A wrong fix is worse than none: verify each fix before applying it, and flag an uncertain one for the user instead. This is a standalone self-check, not a workflow handoff stage and not a review of someone else's code (`qa-review`).

## Input

- Target: the files or directories you just changed.
- Mode: fix (default) fixes; dry run only lists.
- Focus: completeness, logic, types, architecture, tests, or all (default).

## Pass 1: Tool Scan

With shell access, run one scan for the whole target and work from its output; without it, inspect visually and say coverage is reduced. Classify each hit as incomplete work, test substitute, or secret-looking assignment when you read it.

```bash
rg -n -e 'TODO|FIXME|HACK|XXX|STUB|NotImplementedError|todo!\(|unimplemented!\(' \
  -e '(?i:mock|fake|stub|spy|emulat|in[-_ ]?memory|monkeypatch|recorded|sandbox|test[-_ ]?mode)|SUBSTITUTE_JUSTIFICATION' \
  -e '(?i:(password|passwd|secret|api[_-]?key|token))\s*[:=]\s*["'"'"'][^"'"'"']{8,}' {{target}}
```

Type escape hatches are language-specific: add one more `rg -n` only for the languages of the changed files, with `\bany\b|@ts-ignore|@ts-expect-error` for TypeScript, `\bAny\b|# *type: *ignore|^\s*pass\s*$` for Python, and `\.unwrap\(\)|\.expect\(` for Rust.

Then run the repo's type checker or compiler (`npm run typecheck`, `pyright`, `cargo check`, `go vet`) for unresolved imports and type errors, and its formatter and linter in check mode on the changed files (`rules/code.md`); format-on-save can leave drift the gate rejects.

Read each hit before acting on it. A hit is real unless the code shows otherwise (an identifier like `bypass`, a documented exception); never dismiss one unread.

## Pass 2: Semantic Checks

Take one domain at a time across the changed files.

- **Completeness**: placeholder logic, stub returns, empty catch or except blocks, declared but unimplemented functions, imports that do not resolve. Implement them.
- **Logic**: trace the main input through null, empty, and malformed cases; error handling around network, file, and database I/O; loop and range bounds; unreachable or uncovered branches.
- **Types**: replace `any`/`Any` used for convenience with a concrete type, protocol, or bounded generic; fix the cause behind an unexplained ignore (an ignore with a stated reason may stay); return types match signatures.
- **Architecture**: prompts, schemas, or long instructions embedded in code move to a file; duplicated type definitions collapse to one; secrets and per-deployment values come from the environment.
- **Tests**: mocks, fakes, and stubs require user approval (`rules/test.md`) and a complete `SUBSTITUTE_JUSTIFICATION` when kept; remove one the real component could serve; a substitute-backed run is not evidence for the boundary it replaced. Assert outputs and state, not call counts. Fix production types instead of ignoring them in tests.
- **Kernel C** (only for kernel code): read each `goto`/`out_*` cleanup helper end to end and list its side effects; enumerate (input × concurrent operation) cases for each selector; mirror an existing cleanup ladder in the same file; keep paired charge/uncharge domains in separate locals; change shared counters under their owning lock.

Add no guard, check, configuration, or test that a found defect does not call for.

## Pass 3: Output

- Fix mode: apply each fix with a one-line label, then print `[AUDIT_COMPLETE]: {N} issues fixed across {M} files.`
- Dry run: list `{file}:{line}: {description} [{domain}]`, then `{N} issues found.`
- Clean: `[AUDIT_PASS]: Clean. Ready to commit.`

No apologies or narrative. Skip checks that need tools you lack, and say so.
