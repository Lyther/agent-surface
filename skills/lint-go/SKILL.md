---
name: lint-go
description: "Apply strict Go engineering rules before code is accepted."
---

## Procedure

1. Identify the `.go` files touched or under review.
2. Apply the Go policy in `rules/12-go.mdc` (agent-surface source; it may be rendered to the current host): the forbidden and default-deny list, concurrency rules, and the canonical strict `.golangci.yml` recipe. Apply it with the repository's configured linters and formatters; for a greenfield project without config, seed `.golangci.yml` from that recipe. No ignored errors, `interface{}`, or data races. If a constraint cannot be met, stop and name the blocker.
3. Run the toolchain gates in order, each green before the next:

   ```bash
   out=$(gofumpt -l .) && test -z "$out" && out=$(goimports -l .) && test -z "$out"   # fails on unformatted files or a missing tool
   go vet ./...
   golangci-lint run ./...             # strict set from rules/12-go.mdc (gosec, exhaustive, errorlint, etc.)
   govulncheck ./...                   # known-vuln deps — blocking
   go test -race -count=1 ./...
   ```

   Do not use plain `gofmt -s` in new projects; `gofumpt` is a strict superset, installed through the repository's pinned tooling (`rules/12-go.mdc`).
4. Report in the format below.

## Output

```text
1. Understanding
Task: [the task in your own words]
Constraints: [from context]
Ambiguities: [anything unclear; ask if critical]

2. Design
DATA MODELS:
[Structs, interfaces for the domain]
ERROR STRATEGY:
[Error types and wrapping]
[sentinel vs typed errors]
DEPENDENCIES:
[Each module with justification]

3. Implementation
[Complete, working code: all files, all functions, all tests]

4. Verification
Toolchain commands: [list]
gofumpt + goimports: [PASS/FAIL — zero diffs]
go vet: [PASS/FAIL]
golangci-lint: [PASS or specific issues; note which strict linters ran]
govulncheck: [PASS or CVE IDs]
go test -race: [PASS with count]
```
