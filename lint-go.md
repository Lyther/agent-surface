## §0 META: YOU WILL BE AUDITED

You are generating Go code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

Go's simplicity is NOT an excuse for sloppy code. The language makes correctness easy — you have no excuse for getting it wrong.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## PROCEDURE

1. **Identify scope**: Determine which `.go` files were touched or are under review.
2. **Apply language rules**: The full Go policy is in `.cursor/rules/12-lang-go.mdc`. It loads automatically for `.go` files. Audit against every section.
3. **Run toolchain gates**:

```bash
gofmt -s -w .
go vet ./...
golangci-lint run ./...
go test -race -count=1 ./...
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
[Structs, interfaces for the domain]

ERROR STRATEGY:
[Error types and wrapping]
[sentinel vs typed errors]

DEPENDENCIES:
[Each module with justification]
```

### PART 3: IMPLEMENTATION

```text
[Complete, working code — all files, all functions, all tests]
```

### PART 4: VERIFICATION

```text
Toolchain commands: [list]
gofmt: [PASS/FAIL]
golangci-lint: [PASS or specific issues]
go test -race: [PASS with count]
```

## ENFORCEMENT REMINDER

**You are being watched.** Every ignored error, every `interface{}`, every data race will be traced back to your negligence. Do it right or don't do it at all.
