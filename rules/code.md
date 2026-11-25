# Coding Style

## General Rules

- Read the surrounding code first, and match its patterns, error handling, and naming
- Handle an error where you can act on it; otherwise propagate it with context. Never swallow one
- Prefer types that make invalid states unrepresentable over runtime checks

## Defect Hotspots

When your change touches one of these, check it:

- **Entry points**: clients' input is untrusted at every boundary it crosses
- **Failures**: fail closed. When a check errors or a dependency is down, deny; never turn a caught error into a pass
- **State**: async, concurrency, state transfer, lifetime, type confusion
- **Data controls**: dataflow, implicit call, parser seam

## Language-Specific Rules

The lint-* skills hold rules and examples; follow them. Never write these:

- **Python**: a bare or silent `except`; `if x:` or `x or y` where `0` or `""` is valid; blocking I/O in `async` code; a `create_task` result you don't keep
- **TypeScript**: `any`, `as` or `!` to silence the compiler; a floating promise, including `forEach(async …)`; a plain object as a map for outside keys
- **Rust**: `unwrap` or `expect` outside tests or a proven invariant; `as` to narrow an integer; a blocking call in async code or a lock guard held across `.await`
- **C**: `gets`, `strcpy` or `sprintf`; an unchecked return value; a signed-overflow check after the fact
- **Shell**: a script without `set -euo pipefail`; an unquoted expansion; `rm` on a variable path without `${var:?}`

## Code Quality Checklist

Before marking work complete:

- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<400 lines, 800 max)
- [ ] No deep nesting (>4 levels)
- [ ] No unnecessary or large comments (>100 tokens)
- [ ] Proper error handling
- [ ] No hardcoded values
- [ ] Never fake behavior: no hard-coded success, placeholder returns, or TODOs in place of required logic
