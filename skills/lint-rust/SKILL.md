---
name: lint-rust
description: "Apply strict Rust engineering rules before code is accepted."
---

## Procedure

1. Identify the `.rs` files touched or under review.
2. Apply the Rust policy in `rules/11-rust.mdc` (agent-surface source; it may be rendered to the current host) together with the repository's configured linters and formatters. Justify every non-test `unwrap()`, borrow-checker `.clone()`, and `unsafe` block as that policy requires. If a constraint cannot be met, stop and name the blocker.
3. Run the repository's check script or run the narrowest check first (`05-tooling`):

   ```bash
   cargo fmt --all --check
   cargo clippy -p <touched crate> --all-targets -- -D warnings
   RUSTFLAGS="-Dwarnings" cargo test -p <touched crate>
   ```

   Before finishing, run the broad toolchain gate from `rules/11-rust.mdc` (workspace-wide, with its feature flags) when the change touches shared behavior, public APIs, security, data, or build tooling.

   Run `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --workspace` when public library docs changed.
4. Report findings, fixes, and gate status.

## Output

```text
Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>
Findings: <file:line and issue, or none>
Fixes: <change made per finding, or none>
Verification:
- cargo fmt: PASS/FAIL/not available
- cargo clippy: PASS/FAIL/not available
- cargo test: PASS/FAIL/not available
```
