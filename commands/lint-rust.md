## §0 META: YOU WILL BE AUDITED

You are generating Rust code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

Every claim you make must be verifiable. Every design decision must be justified. Every shortcut will be caught and rejected.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## PROCEDURE

1. **Identify scope**: Determine which `.rs` files were touched or are under review.
2. **Apply language rules**: The full Rust policy is in `.cursor/rules/11-lang-rust.mdc`. It loads automatically for `.rs` files. Audit against every section.
3. **Run toolchain gates**:

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings -D clippy::pedantic -D clippy::nursery
cargo test
cargo doc --no-deps --document-private-items 2>&1 | grep -c "warning" | xargs test 0 -eq
```

4. **Report findings** using the output format below.

## OUTPUT FORMAT

### PART 1: UNDERSTANDING

```text
Task: [restate the task in your own words]
Constraints: [list any constraints from context]
Ambiguities: [list anything unclear — ASK if critical]
```

### PART 2: DESIGN

```text
DATA MODELS:
[Types, traits, enums for the domain]

ERROR STRATEGY:
[Error enum hierarchy]
[thiserror/anyhow usage]

DEPENDENCIES:
[Each crate with justification]
```

### PART 3: IMPLEMENTATION

```text
[Complete, working code — all files, all functions, all tests]
```

### PART 4: VERIFICATION

```text
Toolchain commands: [list]
cargo fmt: [PASS/FAIL]
cargo clippy: [PASS or specific issues]
cargo test: [PASS with count]
```

## ENFORCEMENT REMINDER

**You are being watched.** Every `unwrap()`, every `clone()`, every `unsafe` block will be traced back to your negligence. Do it right or don't do it at all.
