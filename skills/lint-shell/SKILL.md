---
name: lint-shell
description: "Apply strict shell-script engineering rules before code is accepted."
---

## Procedure

1. Identify the `.sh`/`.bash` files touched or under review.
2. Apply the shell policy in `rules/14-shell.mdc` (agent-surface source; it may be rendered to the current host) together with the repository's configured linters and formatters: no unquoted variables, missing `set -euo pipefail`, or unchecked commands. If a constraint cannot be met, stop and name the blocker.
3. Run the toolchain gate from `rules/14-shell.mdc` on each touched script:

   ```bash
   bash -n script.sh
   shellcheck -x script.sh
   shfmt -d script.sh
   ```

4. Report each script in the format below.

## Output

```text
## <script-path>

Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>

Findings:
- [severity] line N: description

Fix:
- concrete action per finding

Verification:
- bash -n: PASS/FAIL
- shellcheck: PASS/FAIL (error count)
- shfmt -d: PASS/FAIL
```
