---
name: lint-shell
phase: verify
description: "Apply strict shell-script engineering rules before code is accepted."
---
## §0 META: YOU WILL BE AUDITED

You are generating shell scripts that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

Shell scripts are the #1 source of production incidents. Every line can fail silently. Every variable can be unset. Every command can behave differently across systems.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## PROCEDURE

1. **Identify scope**: Determine which `.sh`/`.bash` files were touched or are under review.
2. **Apply language rules**: The Shell policy is in `rules/14-shell.mdc` in agent-surface source and may be rendered to the current host. Apply it together with the repository's configured linters and formatters.
3. **Run toolchain gates**:

```bash
shellcheck -S error *.sh
shellcheck -S warning *.sh
```

4. **Report findings** using the output format below.

## OUTPUT FORMAT

For each script file:

```text
## <script-path>

Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>

Findings:
- [severity] line N: description
- [severity] line M: description

Fix:
- concrete action per finding

Verification:
- shellcheck: PASS/FAIL (error count)
```

## ENFORCEMENT REMINDER

**You are being watched.** Every unquoted variable, every missing `set -euo pipefail`, every unchecked command will be traced back to your negligence. Do it right or don't do it at all.
