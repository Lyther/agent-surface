# Lessons Learned

## Lint & Quality

- [Lint] Deny-all clippy/ruff configs kill iteration speed; use warn for pedantic lints, deny only for correctness bugs.
- [Lint] Allow targeted `#[allow]` / `# noqa` with inline justification — blanket bans force bad workarounds.
- [Lint] Shadow lints (`shadow_reuse`, `shadow_same`) fight idiomatic Rust; remove them.
- [Lint] Coverage gates (90%+) belong in CI, not local dev loops.
- [Python] `ANN` (flake8-annotations) duplicates pyright; disable it.
- [Python] `FBT` (boolean-trap) is too aggressive; sometimes `bool` params are the right API.
