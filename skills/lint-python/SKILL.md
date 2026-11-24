---
name: lint-python
description: "Apply strict Python engineering rules before code is accepted."
---

## Procedure

1. Identify the `.py` files touched or under review.
2. Apply the Python policy in `rules/10-python.mdc` (agent-surface source; it may be rendered to the current host) together with the repository's configured linters and formatters: no unjustified `Any`, bare `# noqa` without specific codes, unvalidated external inputs, `except Exception: pass`, or ignored errors. If a constraint cannot be met, stop and name the blocker.
3. Run the repository's check script (`make check`, `uv run ...`) or run the narrowest check first (`05-tooling`):

   ```bash
   ruff format --check <touched files>
   ruff check <touched files>
   pyright <touched files>
   pytest <tests covering the touched files>
   ```

   Before finishing, run the broad toolchain gate from `rules/10-python.mdc` (`ruff format --check .`, `ruff check .`, `pyright .`, the full suite) when the change touches shared behavior, public APIs, security, data, or build tooling.

4. Report findings, fixes, and gate status.

## Output

```text
Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>
Findings: <file:line and issue, or none>
Fixes: <change made per finding, or none>
Verification:
- ruff format --check: PASS/FAIL/not available
- ruff check: PASS/FAIL/not available
- pyright: PASS/FAIL/not available
- pytest: PASS/FAIL/not available
```
