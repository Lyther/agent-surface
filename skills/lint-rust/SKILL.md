---
name: lint-rust
description: "Apply strict Rust ownership, error-handling, async, unsafe, and Clippy/Cargo rules with examples. Use when writing, reviewing, or checking Rust code or Cargo config."
---

## Baseline

Use the repository's Rust toolchain, Cargo feature set, error conventions, and scripts (`rules/code.md`, `rules/repository.md`). Preserve existing strictness; never weaken Clippy lints, compiler warnings, or tests to pass (`rules/test.md`), and do not migrate crates or async runtimes unless asked. If a constraint below cannot be met, stop and name the blocker.

## Rules and Examples

### 1. Fallible Operations and Error Context

Never use `.unwrap()` or `.expect()` outside tests unless a local invariant is proven and justified on that item (`#[expect(clippy::expect_used, reason = "...")]`), and never discard fallible results with `let _ = fallible()` or `if let Ok(v) = res {}` without handling `Err`. Preserve causal context instead of erasing underlying errors; libraries expose typed enums implementing `std::error::Error` (`thiserror` or manual, without stringly `Other(String)` catch-alls), while binaries and tests may use `anyhow`.

```rust
// Bad: panics on runtime input or erases error context
let port: u16 = raw_port.parse().unwrap();
let bytes = std::fs::read(&path).map_err(|_| ConfigError::Io)?;

// Good: typed propagation with path and source context
let port: u16 = raw_port
    .parse()
    .map_err(|source| ConfigError::InvalidPort { raw: raw_port.to_owned(), source })?;
let bytes = std::fs::read(&path)
    .map_err(|source| ConfigError::Read { path: path.clone(), source })?;
```

### 2. Checked Integer Conversions

Never use `as` to narrow an integer or reinterpret signedness (`usize as u32`, `i64 as u64`, `u64 as i64` silently truncate or wrap). Use `From` for lossless widening and `TryFrom` / `try_into` (or explicit `checked_*` / `saturating_*` when the domain specifies it) for narrowing.

```rust
// Bad: silently truncates payloads > u32::MAX
let frame_len = payload.len() as u32;

// Good: explicit range check via TryFrom
let frame_len = u32::try_from(payload.len())
    .map_err(|_| FrameError::PayloadTooLarge(payload.len()))?;
```

### 3. Async Execution and Lock Guards

Never run blocking I/O, `std::thread::sleep`, or CPU-bound work directly on an async executor thread (offload with `tokio::task::spawn_blocking`), and never hold a synchronous `std::sync::MutexGuard` or `RwLockGuard` across `.await`—extract or update state inside a tight block so the guard drops before awaiting.

```rust
// Bad: holds MutexGuard across .await (can deadlock executor workers or fail Send)
async fn refresh(state: &Mutex<Cache>, client: &Client) -> Result<(), Error> {
    let mut cache = state.lock().unwrap_or_else(|e| e.into_inner());
    let fresh = client.fetch(&cache.key).await?;
    cache.value = fresh;
    Ok(())
}

// Good: drop guard before .await, re-acquire briefly to commit
async fn refresh(state: &Mutex<Cache>, client: &Client) -> Result<(), Error> {
    let key = {
        let cache = state.lock().unwrap_or_else(|e| e.into_inner());
        cache.key.clone()
    };
    let fresh = client.fetch(&key).await?;
    state.lock().unwrap_or_else(|e| e.into_inner()).value = fresh;
    Ok(())
}
```

### 4. Ownership, Dispatch, and `unsafe`

- **No borrow-checker appeasement**: do not sprinkle `.clone()`, `Rc<RefCell<T>>` across module boundaries, `Arc<Mutex<T>>` on single-threaded data, or `'static` bounds just to satisfy borrow errors—fix data ownership and lifetimes instead.
- **Dispatch**: prefer generics over `Box<dyn Trait>` unless storing heterogeneous values, crossing ABI/plugin boundaries, or bounding compile-time monomorphization with evidence.
- **`unsafe` discipline**: use `unsafe` only as a last resort behind a minimal safe wrapper that validates preconditions. Every `unsafe` block and `unsafe impl` carries a `// SAFETY:` comment stating the exact invariant required and why it holds at that site.
- **Lint attributes and residue**: scope `#[expect(..., reason = "...")]` (or `#[allow(...)]` on older MSRV) to the narrowest item; use module-level `#[allow(...)]` only for generated code. Leave no `todo!()`, `unimplemented!()`, `dbg!()`, or debug `println!()` in non-CLI library paths.

## Clippy Config Baseline

Respect the repository's `Cargo.toml` and `clippy.toml`. When seeding strict lints for a new crate, deny `clippy::all` plus targeted panic/incomplete lints while allowing panics in tests via `clippy.toml`:

```toml
# Cargo.toml
[lints.clippy]
all = { level = "deny", priority = -1 }
dbg_macro = "deny"
expect_used = "deny"
panic = "deny"
todo = "deny"
undocumented_unsafe_blocks = "deny"
unimplemented = "deny"
unwrap_used = "deny"
```

```toml
# clippy.toml
allow-expect-in-tests = true
allow-unwrap-in-tests = true
```

## Procedure and Toolchain Gate

1. Identify the `.rs` and Cargo files touched or under review, and check every non-test `unwrap`/`expect`, `as` cast, `.clone()`, async lock scope, and `unsafe` block against the rules above.
2. Prefer the repository's check script (`make check`). Otherwise run the narrowest crate checks first, in order:

   ```bash
   cargo fmt --all --check
   cargo clippy -p <touched crate> --all-targets -- -D warnings
   RUSTFLAGS="-Dwarnings" cargo test -p <touched crate>
   ```

3. When the change touches shared behavior, public APIs, security, data, or build tooling, run the workspace gate (`cargo clippy --workspace --all-targets --all-features -- -D warnings` and `RUSTFLAGS="-Dwarnings" cargo test --workspace --all-features`). Run `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --workspace` when public library docs changed, and `cargo audit` / `cargo deny check` when dependencies changed.
4. Report any unavailable tool (including nightly `miri`) as `not available`—never as passed.

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
