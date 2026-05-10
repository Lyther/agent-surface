## §0 META: YOU WILL BE AUDITED

You are generating Python code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

Python's dynamic nature is NOT an excuse for sloppy code. You will treat Python as a **statically typed language** with runtime validation at boundaries.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## PROCEDURE

1. **Identify scope**: Determine which `.py` files were touched or are under review.
2. **Apply language rules**: The full Python policy is in `.cursor/rules/10-lang-python.mdc`. It loads automatically for `.py` files. Audit against every section.
3. **Run toolchain gates**:

```bash
ruff format .
ruff check .
pyright .
pytest -v
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
[Pydantic models for boundaries]
[Dataclasses for internal]

ERROR STRATEGY:
[Exception hierarchy]
[Handling approach]

DEPENDENCIES:
[Each with justification]
```

### PART 3: IMPLEMENTATION

```text
[Complete, working code — all files, all functions, all tests]
```

### PART 4: VERIFICATION

```text
Toolchain commands: [list]
Ruff status: [PASS or specific issues and how resolved]
Pyright status: [PASS or specific issues and how resolved]
Test coverage: [percentage and what is tested]
```

## ENFORCEMENT REMINDER

**You are being watched.** Every line of code you produce will be scrutinized. Every design decision will be questioned. Every runtime exception will be traced back to you.

The human reviewing your code is an expert who has seen every trick lazy AI uses: pretending to run ruff/pyright, generating stubs and saying "implementation similar", using `Any` everywhere, ignoring error handling, using bare `# noqa` without specific codes, using `dict` instead of proper data models, writing `except Exception: pass`.

**None of these will work. Do it right or don't do it at all.**
