---
name: lint-go
description: "Apply strict Go engineering rules before code is accepted."
---

## Procedure

1. Identify the `.go` files touched or under review.
2. Apply the Go policy in `rules/12-go.mdc` (agent-surface source; it may be rendered to the current host): the forbidden and default-deny list, concurrency rules, and the `.golangci.yml` recipe when no config exists. No ignored errors, unconstrained `interface{}`/`any`, or data races. If a constraint cannot be met, stop and name the blocker.
3. Run the repository's check script (`make check`) or the toolchain gates:

   ```bash
   golangci-lint run ./...
   go test ./...                   # add -race -count=1 when concurrency or shared state is involved
   ```

   When `golangci-lint` is not configured, run `out=$(gofmt -l .) && test -z "$out"` (or `gofumpt`/`goimports` if installed) and `go vet ./...` before `go test`.
4. Report findings, fixes, and gate status.

## Output

```text
Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>
Findings: <file:line and issue, or none>
Fixes: <change made per finding, or none>
Verification:
- golangci-lint (or gofmt + go vet): PASS/FAIL/not available
- go test: PASS/FAIL/not available
```
