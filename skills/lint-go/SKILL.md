---
name: lint-go
description: "Apply strict Go error-handling, concurrency, typing, and golangci-lint/test rules with examples. Use when writing, reviewing, or checking Go code or module config."
---

## Baseline

Use the repository's Go version, module dependencies, linter configuration, and scripts (`rules/code.md`, `rules/repository.md`). Preserve existing strictness; never weaken linter rules or tests to pass (`rules/test.md`), and do not migrate frameworks or tooling unless asked. If a constraint below cannot be met, stop and name the blocker.

## Rules and Examples

### 1. Explicit Error Handling and Context

Never discard errors with `_ = fallible()`, ignore an `error` return, leave `if err != nil {}` empty, or use `panic` / `log.Fatal` for recoverable runtime failures outside `main` startup wiring. Wrap returned errors with operation context (`%w`), and check `Close()` / `Flush()` errors on writable resources plus `rows.Err()` after SQL iteration.

```go
// Bad: drops write/close errors and loses context
func writeReport(path string, data []byte) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, _ = f.Write(data)
	return nil
}

// Good: checks write + close and wraps with context
func writeReport(path string, data []byte) (retErr error) {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create report %s: %w", path, err)
	}
	defer func() {
		if closeErr := f.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("close report %s: %w", path, closeErr)
		}
	}()
	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write report %s: %w", path, err)
	}
	return nil
}
```

### 2. Concurrency, `context.Context`, and Goroutine Ownership

Pass `context.Context` as the first parameter of blocking or I/O functions and honor `ctx.Done()`. Every goroutine must have an explicit owner, termination path, bounded shutdown, and error propagation: use `errgroup.WithContext` when errors or cancellation propagate (`sync.WaitGroup` only for infallible fan-out), and guard channel sends with `ctx.Done()` or buffered capacity so senders cannot leak on early return.

```go
// Bad: fire-and-forget goroutine with no cancellation or error path
for _, id := range ids {
	go func() {
		_ = syncAccount(context.Background(), id)
	}()
}

// Good: bounded lifetime and propagated cancellation/errors
g, gctx := errgroup.WithContext(ctx)
for _, id := range ids {
	g.Go(func() error {
		if err := syncAccount(gctx, id); err != nil {
			return fmt.Errorf("sync account %s: %w", id, err)
		}
		return nil
	})
}
if err := g.Wait(); err != nil {
	return err
}
```

### 3. Types, Package State, and Directives

- **Concrete types first**: use concrete structs or constrained generics instead of unconstrained `any` / `interface{}`. Define small interfaces at the consuming package when substitution is needed, not speculatively at the producer.
- **No hidden state or flakiness**: avoid `init()` with I/O or global side effects, mutable package-level globals, naked returns in multi-line functions, and `time.Sleep` for synchronization in tests (use channels, `synctest`, or explicit polling with deadlines).
- **Scoped lint directives**: never write bare `//nolint`; specify the exact linter and inline justification (`//nolint:gosec // path validated against workspace root above`).

## `golangci-lint` Config Baseline

When seeding `.golangci.yml` for a repository with no existing configuration (`mvp` and up), use the v2 schema and pin tool/CI versions explicitly (avoid unpinned `go install ...@latest` or archived `dnephin/pre-commit-golang`; prefer `go get -tool` or `TekWizely/pre-commit-golang` pinned to a rev):

```yaml
version: "2"
run:
  modules-download-mode: readonly
linters:
  enable:
    - bodyclose
    - contextcheck
    - errcheck
    - errorlint
    - exhaustive
    - gocritic
    - gosec
    - govet
    - ineffassign
    - nilerr
    - nilnil
    - rowserrcheck
    - sqlclosecheck
    - staticcheck
    - unconvert
    - unused
issues:
  max-issues-per-linter: 0
  max-same-issues: 0
formatters:
  enable: [gofumpt, goimports]
```

Validate config edits with `golangci-lint config verify` (migrate v1 files via `golangci-lint migrate`), and exclude vendored or fixture trees under `linters.exclusions.paths` and `formatters.exclusions.paths`.

## Procedure and Toolchain Gate

1. Identify the `.go` and module files touched or under review, checking error handling, goroutine lifetimes, `context` plumbing, and `any`/`//nolint` usage against the rules above.
2. Prefer the repository's check script (`make check`). Otherwise run the narrowest package gates first, then `./...` when shared packages, public APIs, security, data, or build config change:

   ```bash
   golangci-lint run ./...
   go test ./...                   # add -race -count=1 whenever concurrency or shared state is involved
   ```

   When `golangci-lint` is not configured or installed, run `out="$(gofmt -l .)" && test -z "$out"` (or `gofumpt`/`goimports` if configured) and `go vet ./...` before `go test`. Run `go tool govulncheck ./...` (or `govulncheck ./...`) when dependencies change.
3. Report any unavailable tool as `not available`—never as passed.

## Output

```text
Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>
Findings: <file:line and issue, or none>
Fixes: <change made per finding, or none>
Verification:
- golangci-lint (or gofmt + go vet): PASS/FAIL/not available
- go test: PASS/FAIL/not available
```
