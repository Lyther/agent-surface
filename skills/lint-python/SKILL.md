---
name: lint-python
description: "Apply strict Python engineering rules before code is accepted."
---

## Procedure

1. Identify the `.py` files touched or under review.
2. Apply the Python policy in `rules/10-python.mdc` (agent-surface source; it may be rendered to the current host) together with the repository's configured linters and formatters. Treat Python as statically typed with runtime validation at boundaries: no `Any`, bare `# noqa` without specific codes, `dict` in place of data models, `except Exception: pass`, or ignored errors. If a constraint cannot be met, stop and name the blocker.
3. Run the toolchain gates:

   ```bash
   ruff format --check .
   ruff check .
   pyright .
   pytest -v
   ```

4. Report in the format below.

## Output

```text
1. Understanding
Task: [the task in your own words]
Constraints: [from context]
Ambiguities: [anything unclear; ask if critical]

2. Design
DATA MODELS:
[Pydantic models for boundaries]
[Dataclasses for internal]
ERROR STRATEGY:
[Exception hierarchy]
[Handling approach]
DEPENDENCIES:
[Each with justification]

3. Implementation
[Complete, working code: all files, all functions, all tests]

4. Verification
Toolchain commands: [list]
Ruff status: [PASS or specific issues and how resolved]
Pyright status: [PASS or specific issues and how resolved]
Test coverage: [percentage and what is tested]
```
