# Coding Style

## General Rules

- Read the surrounding code first, and match its patterns, error handling, and naming.
- Handle an error where you can act on it; otherwise propagate it with context. Never swallow one.
- Prefer types that make invalid states unrepresentable over runtime checks.

## Defect Hotspots

When your change touches one of these, check it:

- **Entry points**: external input is untrusted at every boundary it crosses.
- **Failures**: fail closed. When a check errors or a dependency is down, deny; never turn a caught error into a pass.
- **State**: async, concurrency, state transfer, lifetime, type confusion.
- **Data controls**: dataflow, implicit call, parser seam.

## Language-Specific Rules

The `lint-*` skills hold rules and examples; follow them when editing those languages:

- **Python**: no bare or silent `except`; no `if x:` or `x or y` where `0` or `""` is valid; no blocking I/O in `async` code; retain references to `create_task` tasks.
- **TypeScript**: no `any`, `as`, or `!` to silence the compiler; no floating promises (including `forEach(async ...)`); no plain object as a map for outside keys.
- **Rust**: no `unwrap` or `expect` outside tests or a proven invariant; no `as` to narrow an integer; no blocking calls in `async` code or lock guards held across `.await`.
- **Go**: never discard a returned `err` (`_ = f()`) without explicit justification; never `panic` for expected errors; never launch a goroutine without cancellation and shutdown ownership; avoid unconstrained `any` where a concrete type or narrow interface fits.
- **C**: no `gets`, `strcpy`, or `sprintf`; never ignore a fallible return value; check signed overflow before the operation, not after.
- **Shell**: use `set -euo pipefail` in executable Bash scripts (`set -eu` for POSIX `sh`; never set shell flags at top level of sourced files); quote expansions; guard variable `rm` paths with `${var:?}`.

## Code Quality Checklist

Before marking work complete:

- [ ] Code matches surrounding patterns, naming, and cohesive module boundaries
- [ ] Functions and modules stay focused without unrelated refactoring churn
- [ ] Proper error handling at every boundary
- [ ] Non-obvious domain constants or configuration values are named cleanly
- [ ] Comments explain why, not what
- [ ] Never fake behavior: no hard-coded success, placeholder returns, or TODOs in place of required logic
