# COMMAND: GO

# ALIAS: golang, goqc

## §0 META: YOU WILL BE AUDITED

You are generating Go code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

Go's simplicity is NOT an excuse for sloppy code. The language makes correctness easy — you have no excuse for getting it wrong.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## §1 ABSOLUTE PROHIBITIONS (ZERO TOLERANCE)

### §1.1 MINIMIZE `//nolint` DIRECTIVES

```go
// FORBIDDEN without justification
//nolint
//nolint:errcheck
//nolint:all
```

If golangci-lint emits a warning, **prefer fixing the underlying issue**.

**Allowed exception (with justification):**

```go
// False positive: this error is intentionally ignored because [reason]
//nolint:errcheck // closing response body in defer, error irrelevant
defer resp.Body.Close()
```

**Rules:**

- Must use specific linter name (`//nolint:errcheck`, not bare `//nolint`)
- Must include inline comment explaining why

### §1.2 NO Silent Failures

| Banned | Why |
|--------|-----|
| `_ = fallibleFunc()` | Discarding errors silently |
| Unchecked error returns | Silent corruption |
| `recover()` without logging | Swallowing panics |
| Empty `if err != nil { }` | Pretending to handle errors |

**Every error must be:**

- Returned to caller with context (`fmt.Errorf("operation failed: %w", err)`)
- Handled with explicit recovery logic
- Logged with sufficient context before being discarded (rare, must justify)

### §1.3 NO Garbage Code

| Banned | Replacement |
|--------|-------------|
| `fmt.Println()` for debugging | Use `log/slog` or remove |
| `panic()` for error handling | Return error |
| `// TODO`, `// FIXME` | Do it now or don't mention it |
| `// ... rest of implementation` | Write the rest |
| Unused imports/variables | Remove them (go compiler enforces this) |
| `interface{}` / `any` without constraint | Use generics or specific types |

### §1.4 NO Go Foot-Guns

| Banned | Why | Fix |
|--------|-----|-----|
| Goroutine without sync | Race conditions | `sync.WaitGroup`, channels, or `errgroup` |
| Shared mutable state | Data races | Channels or `sync.Mutex` with clear ownership |
| `time.Sleep()` in tests | Flaky tests | Use channels, `sync.Cond`, or test clocks |
| Global mutable state | Unpredictable | Pass explicitly or use DI |
| `init()` with side effects | Hidden behavior | Explicit initialization |
| Naked returns in long functions | Confusing | Explicit returns |

### §1.5 NO Pretending

You must produce **complete, working code**. This means:

- All files mentioned must be created with full content
- All functions must be implemented (no stubs)
- All interfaces must be satisfied
- All tests must actually test something meaningful
- All error paths must be handled

## §2 REASONING (SHOW YOUR WORK FOR SIGNIFICANT CHANGES)

For non-trivial code (new packages, complex data structures, architectural decisions), provide explicit reasoning. Skip for small fixes and obvious implementations.

### §2.1 Interface Analysis

For every significant interface:

```text
INTERFACE ANALYSIS for `Repository`:
- What behavior it abstracts: [answer]
- Who implements it: [answer]
- Who consumes it: [answer]
- Why an interface (not concrete): [answer]
```

### §2.2 Concurrency Analysis

For any concurrent code:

```text
CONCURRENCY ANALYSIS:
- Goroutines spawned: [list]
- Synchronization mechanism: [channels/mutex/waitgroup]
- Shutdown signal: [context cancellation/done channel]
- Error propagation: [how errors from goroutines surface]
```

### §2.3 Dependency Justification

For every external module:

```text
DEPENDENCY: [module path]
- What it provides: [specific functionality]
- Why stdlib is insufficient: [concrete reason]
- Alternatives considered: [list with rejection reasons]
```

## §3 TYPE-DRIVEN DESIGN

### §3.1 Define Clear Types

```go
// ❌ BAD: Primitives everywhere
func CreateUser(name string, email string, age int) error

// ✅ GOOD: Domain types
type UserName string
type Email string
type Age uint8

func CreateUser(name UserName, email Email, age Age) error

// ✅ GOOD: Struct for related data
type CreateUserRequest struct {
    Name  UserName
    Email Email
    Age   Age
}

func CreateUser(req CreateUserRequest) error
```

### §3.2 Accept Interfaces, Return Structs

```go
// ❌ BAD: Returning interface
func NewService() ServiceInterface

// ✅ GOOD: Return concrete, accept interface
func NewService(repo Repository) *Service

// Interface defined by consumer, not provider
type Repository interface {
    Get(ctx context.Context, id string) (*Entity, error)
}
```

### §3.3 Use Functional Options for Complex Constructors

```go
// ❌ BAD: Boolean explosion
func NewServer(addr string, tls bool, timeout int, maxConns int)

// ✅ GOOD: Functional options
type ServerOption func(*Server)

func WithTLS(certFile, keyFile string) ServerOption
func WithTimeout(d time.Duration) ServerOption
func WithMaxConns(n int) ServerOption

func NewServer(addr string, opts ...ServerOption) *Server
```

## §4 ERROR HANDLING

### §4.1 Error Wrapping

```go
// ❌ BAD: Context lost
if err != nil {
    return err
}

// ❌ BAD: String concatenation
if err != nil {
    return errors.New("failed: " + err.Error())
}

// ✅ GOOD: Wrap with context
if err != nil {
    return fmt.Errorf("failed to fetch user %s: %w", userID, err)
}
```

### §4.2 Sentinel Errors and Custom Types

```go
// Define sentinel errors for expected conditions
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
)

// Use custom error types for rich context
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}

// Check with errors.Is and errors.As
if errors.Is(err, ErrNotFound) { ... }

var valErr *ValidationError
if errors.As(err, &valErr) { ... }
```

### §4.3 Context Propagation

```go
// ❌ BAD: Ignoring context
func DoWork() error {
    // No cancellation support
}

// ✅ GOOD: Context as first parameter
func DoWork(ctx context.Context) error {
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
        // do work
    }
}
```

## §5 TOOLCHAIN GATE (MUST PASS)

### §5.1 Format

```bash
gofmt -s -w .
# OR
goimports -w .
```

Must produce zero changes.

### §5.2 Vet

```bash
go vet ./...
```

Zero issues.

### §5.3 golangci-lint (Recommended Configuration)

Create `.golangci.yml`:

```yaml
run:
  timeout: 5m
  modules-download-mode: readonly

linters:
  enable:
    # Bugs
    - bodyclose
    - contextcheck
    - errcheck
    - errorlint
    - exhaustive
    - govet
    - nilerr
    - nilnil
    - rowserrcheck
    - sqlclosecheck
    - staticcheck
    - typecheck

    # Style & Simplification
    - gofmt
    - goimports
    - gocritic
    - gosimple
    - ineffassign
    - misspell
    - unconvert
    - unparam
    - unused
    - usestdlibvars
    - whitespace

    # Complexity
    - cyclop
    - funlen
    - gocognit
    - nestif

    # Security
    - gosec

    # Performance
    - prealloc

    # Code Quality
    - dupl
    - goconst
    - revive

linters-settings:
  cyclop:
    max-complexity: 15
  funlen:
    lines: 80
    statements: 50
  gocognit:
    min-complexity: 20
  nestif:
    min-complexity: 5
  gocritic:
    enabled-tags:
      - diagnostic
      - performance
      - style
  revive:
    rules:
      - name: blank-imports
      - name: context-as-argument
      - name: context-keys-type
      - name: error-return
      - name: error-strings
      - name: error-naming
      - name: exported
      - name: increment-decrement
      - name: var-naming
      - name: package-comments
      - name: range
      - name: receiver-naming
      - name: time-naming
      - name: unexported-return
      - name: indent-error-flow
      - name: errorf

issues:
  exclude-use-default: false
  max-issues-per-linter: 0
  max-same-issues: 0
```

```bash
golangci-lint run ./...
```

### §5.4 Tests

```bash
go test -race -v ./...
```

All tests pass. `-race` is mandatory for concurrent code.

### §5.5 Build

```bash
go build -v ./...
```

Zero errors, zero warnings.

## §6 CONCURRENCY PATTERNS

### §6.1 Always Use errgroup for Multiple Goroutines

```go
// ❌ BAD: Manual goroutine management
var wg sync.WaitGroup
errs := make(chan error, 2)
wg.Add(2)
go func() { defer wg.Done(); errs <- task1() }()
go func() { defer wg.Done(); errs <- task2() }()
wg.Wait()
// Now what? Check errs somehow?

// ✅ GOOD: errgroup handles everything
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error { return task1(ctx) })
g.Go(func() error { return task2(ctx) })
if err := g.Wait(); err != nil {
    return err
}
```

### §6.2 Graceful Shutdown Pattern

```go
func Run(ctx context.Context) error {
    ctx, cancel := context.WithCancel(ctx)
    defer cancel()

    g, ctx := errgroup.WithContext(ctx)

    // Start server
    g.Go(func() error {
        return server.ListenAndServe()
    })

    // Wait for shutdown signal
    g.Go(func() error {
        <-ctx.Done()
        shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        return server.Shutdown(shutdownCtx)
    })

    return g.Wait()
}
```

## §7 DOMAIN-SPECIFIC GUIDANCE

### §7.A HTTP Services

- Router: `net/http` (stdlib) or `chi` (minimal)
- Middleware: Context propagation, request ID, logging, recovery
- Validation: Struct tags with validator or manual checks
- Response: Consistent JSON structure with proper status codes

### §7.B CLI Applications

- Framework: `cobra` for complex CLIs, `flag` for simple ones
- Config: `viper` or `envconfig` for configuration
- Output: Structured output, exit codes

### §7.C Database Access

- Driver: `pgx` for PostgreSQL
- Queries: `sqlc` for type-safe SQL or `squirrel` for builders
- Transactions: Always use context-aware transactions
- Connections: Pool with reasonable limits, timeouts on all operations

## §8 OUTPUT FORMAT

### PART 1: UNDERSTANDING

```text
Task: [restate the task]
Constraints: [list constraints]
Ambiguities: [list unclear items — ASK if critical]
```

### PART 2: DESIGN (for significant changes)

```text
INTERFACE ANALYSIS: [if defining interfaces]
CONCURRENCY ANALYSIS: [if using goroutines]
DEPENDENCIES: [for each external module]
```

### PART 3: IMPLEMENTATION

```text
[Complete, working code]
```

### PART 4: VERIFICATION

```text
Toolchain commands: [list]
golangci-lint status: [PASS or issues resolved]
Test coverage: [what is tested]
```

## §9 FINAL AUDIT CHECKLIST

Before submitting ANY code, verify:

- [ ] No unjustified `//nolint` (must have specific linter + reason)
- [ ] No ignored errors (`_ = f()`)
- [ ] No `panic()` for error handling
- [ ] No `fmt.Println()` for logging
- [ ] No goroutines without synchronization
- [ ] All errors wrapped with context
- [ ] All public functions have doc comments
- [ ] All interfaces are minimal and consumer-defined
- [ ] Context passed as first parameter where applicable
- [ ] Code passes `gofmt`
- [ ] Code passes `go vet`
- [ ] Code passes `golangci-lint`
- [ ] Code passes `go test -race`

**If ANY checkbox is unchecked, DO NOT SUBMIT. Fix it or explain why it cannot be fixed.**
