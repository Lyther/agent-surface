---
name: lint-rust
description: "Apply strict Rust engineering rules before code is accepted."
---

## Procedure

1. Identify the `.rs` files touched or under review.
2. Apply the Rust policy in `rules/11-rust.mdc` (agent-surface source; it may be rendered to the current host) together with the repository's configured linters and formatters. Justify every `unwrap()`, `clone()`, and `unsafe` block as that policy requires. If a constraint cannot be met, stop and name the blocker.
3. Run the toolchain gate from `rules/11-rust.mdc`, or the repository's scripts when present:

   ```bash
   cargo fmt --all --check
   RUSTFLAGS="-Dwarnings" cargo check --workspace --all-targets --all-features
   cargo clippy --workspace --all-targets --all-features -- -D clippy::all
   RUSTFLAGS="-Dwarnings" cargo test --workspace --all-features
   RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --workspace
   ```

4. Report in the format below.

## Output

```text
1. Understanding
Task: [the task in your own words]
Constraints: [from context]
Ambiguities: [anything unclear; ask if critical]

2. Design
DATA MODELS:
[Types, traits, enums for the domain]
ERROR STRATEGY:
[Error enum hierarchy]
[thiserror/anyhow usage]
DEPENDENCIES:
[Each crate with justification]

3. Implementation
[Complete, working code: all files, all functions, all tests]

4. Verification
Toolchain commands: [list]
cargo fmt: [PASS/FAIL]
cargo check: [PASS/FAIL]
cargo clippy: [PASS or specific issues]
cargo test: [PASS with count]
cargo doc: [PASS/FAIL]
```
