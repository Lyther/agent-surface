# COMMAND: PYTHON

# ALIAS: py, pyqc, snake-gate

## §0 META: YOU WILL BE AUDITED

You are generating Python code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

Python's dynamic nature is NOT an excuse for sloppy code. You will treat Python as a **statically typed language** with runtime validation at boundaries.

Every claim you make must be verifiable. Every design decision must be justified. Every runtime exception you cause will be traced back to your negligence.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## §1 ABSOLUTE PROHIBITIONS (ZERO TOLERANCE)

These are not guidelines. These are laws. Violation of ANY of these results in immediate rejection.

### §1.1 MINIMIZE `# noqa` AND `# type: ignore`

```python
# FORBIDDEN without justification
# noqa
# noqa: E501
# type: ignore
# ruff: noqa
```

If Ruff or Pyright emits a warning, **prefer fixing the underlying issue**.

**Allowed exceptions (with inline justification):**

```python
# Third-party lib has no stubs: https://github.com/owner/repo/issues/XXX
from untyped_lib import thing  # type: ignore[import-untyped]

# Ruff false positive for valid pattern
x = some_valid_pattern  # noqa: EXXX  # reason here
```

**Rules:**

- Must use specific codes (`# type: ignore[import-untyped]`, not bare `# type: ignore`)
- Must include inline comment explaining why
- Prefer stub files or wrappers for persistent third-party type issues

### §1.2 NO Runtime Type Surprises

| Banned Pattern | Why It's Banned |
|----------------|-----------------|
| Untyped function parameters | `TypeError` waiting to happen |
| Untyped return values | Caller has no contract |
| `Any` type (except at I/O boundaries) | Defeats the type system |
| `dict` for structured data | No schema, no validation |
| Implicit `Optional` (`x: str = None`) | Must be explicit: `x: str \| None = None` |
| Type comments (`# type: int`) | Use annotation syntax |

### §1.3 NO Silent Failures

| Banned | Why |
|--------|-----|
| Bare `except:` | Catches `SystemExit`, `KeyboardInterrupt` |
| `except Exception:` without re-raise | Swallows all errors |
| `except Exception: pass` | The worst possible pattern |
| `except Exception as e: log(e)` without re-raise | Logs but continues with corrupted state |
| Ignoring return values from fallible functions | Silent data loss |
| `if result:` for error checking | Truthiness is not error handling |

**Every exception handler must either:**

- Re-raise the exception (with or without wrapping)
- Raise a different, more specific exception
- Return a well-typed error value (for expected failures)
- Explicitly document why swallowing is safe (rare)

### §1.4 NO Garbage Code

| Banned | Replacement |
|--------|-------------|
| `print()` for debugging/logging | Use `logging` or `structlog` |
| `pdb.set_trace()` / `breakpoint()` | Remove before commit |
| `# TODO`, `# FIXME`, `# XXX` | Do it now or don't mention it |
| `# ... rest of implementation` | Write the rest |
| `pass` as implementation | Implement it |
| `NotImplementedError` in production code | Implement it |
| Unused imports/variables | Remove them |

### §1.5 NO Python Foot-Guns

| Banned | Why | Fix |
|--------|-----|-----|
| Mutable default arguments | Shared state across calls | `def f(x: list[int] \| None = None):` |
| `import *` | Pollutes namespace, hides dependencies | Explicit imports |
| `eval()` / `exec()` | Code injection | Never use for user input |
| `subprocess.run(shell=True)` | Command injection | Use list args |
| Global mutable state | Unpredictable behavior | Pass explicitly or use DI |
| `__getattr__` / `__setattr__` magic | Hides behavior | Explicit properties |
| Metaclasses (unless building a framework) | Unnecessary complexity | Use decorators or protocols |

### §1.6 NO Pretending

You must produce **complete, working code**. This means:

- All files mentioned must be created with full content
- All functions must be implemented (no stubs)
- All type hints must be present and correct
- All tests must actually test something meaningful
- All imports must be used

**"The implementation is similar to above"** — Write it out explicitly.

**"Left as exercise for the reader"** — You are the reader. Do the exercise.

## §2 REASONING (SHOW YOUR WORK FOR SIGNIFICANT CHANGES)

For non-trivial code (new modules, complex data flows, architectural decisions), provide explicit reasoning. Skip for small fixes and obvious implementations.

### §2.1 Data Model Analysis

For every significant data structure, state:

```text
DATA MODEL for `UserRequest`:
- Source: [API request / CLI args / file / etc.]
- Validation: [Pydantic model / manual checks / etc.]
- Invariants: [what must always be true]
- Transformation: [how it becomes internal representation]
```

### §2.2 Error Strategy

```text
ERROR STRATEGY:
- Expected failures: [list with how each is handled]
- Unexpected failures: [propagation strategy]
- Logging: [what, when, at what level]
- User-facing errors: [how they're formatted]
```

### §2.3 Dependency Justification

For every package added:

```text
DEPENDENCY: [package name]
- What it provides: [specific functionality]
- Why stdlib is insufficient: [concrete reason]
- Alternatives considered: [list with rejection reasons]
- Version constraints: [pinned version or range with rationale]
```

## §3 TYPE-DRIVEN DESIGN (MANDATORY)

### §3.1 Boundaries = Validated Types

External data must be parsed through typed structures at entry points.

```python
# ❌ BAD: Raw dict flowing through the system
def process_request(data: dict) -> dict:
    name = data.get("name", "")  # No validation!
    # ...

# ✅ GOOD: Pydantic for complex validation
from pydantic import BaseModel, Field

class UserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=0, le=150)

def process_request(request: UserRequest) -> UserResponse:
    # request is guaranteed valid here
    # ...

# ✅ ALSO GOOD: TypedDict for simple cases (scripts, internal tools)
from typing import TypedDict

class Config(TypedDict):
    host: str
    port: int

def load_config(path: Path) -> Config:
    return json.loads(path.read_text())
```

**Use Pydantic when:** validation rules, nested structures, serialization, API boundaries.
**Use TypedDict when:** simple shape checking, internal tools, performance-critical paths.

**Boundaries include:**

- HTTP request/response bodies → Pydantic
- CLI arguments → Pydantic or typer
- Environment variables → pydantic-settings
- File contents (JSON, YAML, TOML) → Pydantic or TypedDict
- Database query results → ORM models or TypedDict
- External API responses → Pydantic

### §3.2 Internal = Dataclasses

For internal data flow where validation is already guaranteed:

```python
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class ProcessedUser:
    """Internal representation after validation."""
    id: UserId
    name: str
    normalized_email: EmailAddress
```

**Why `frozen=True`:** Immutability prevents accidental mutation.
**Why `slots=True`:** Memory efficiency, prevents dynamic attribute assignment.

### §3.3 Newtypes for Semantic Distinction

```python
from typing import NewType

UserId = NewType("UserId", int)
EmailAddress = NewType("EmailAddress", str)
PasswordHash = NewType("PasswordHash", str)

# Now the type checker will catch:
def get_user(user_id: UserId) -> User: ...
def send_email(to: EmailAddress) -> None: ...

# ❌ Type error: EmailAddress is not UserId
get_user(EmailAddress("test@example.com"))
```

### §3.4 Explicit Optionality

```python
# ❌ BAD: Implicit None
def find_user(id: int) -> User:  # Returns None on not found? Raises? Who knows!
    ...

# ✅ GOOD: Explicit in type
def find_user(id: UserId) -> User | None:
    """Returns None if user not found."""
    ...

# ✅ ALSO GOOD: Exception for unexpected case
def get_user(id: UserId) -> User:
    """Raises UserNotFoundError if user doesn't exist."""
    ...
```

## §4 ERROR HANDLING (EXPLICIT AND MEANINGFUL)

### §4.1 Exception Hierarchy

Every module should define its own exception hierarchy:

```python
class ServiceError(Exception):
    """Base exception for this service."""

class ValidationError(ServiceError):
    """Input validation failed."""
    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")

class NotFoundError(ServiceError):
    """Requested resource not found."""
    def __init__(self, resource_type: str, resource_id: str) -> None:
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(f"{resource_type} not found: {resource_id}")
```

### §4.2 Exception Handling Rules

```python
# ❌ BAD: Bare except
try:
    do_something()
except:
    pass

# ❌ BAD: Catch-all without re-raise
try:
    do_something()
except Exception as e:
    logger.error(f"Error: {e}")
    # Continues with corrupted state!

# ✅ GOOD: Specific exception, proper handling
try:
    result = external_api.fetch_data()
except requests.Timeout as e:
    raise ServiceUnavailableError("External API timeout") from e
except requests.RequestException as e:
    raise ServiceError(f"API request failed: {e}") from e

# ✅ GOOD: Re-raise after logging
try:
    do_something()
except SpecificError:
    logger.exception("Operation failed, propagating")
    raise
```

## §5 TOOLCHAIN GATE (MUST PASS — NO EXCEPTIONS)

### §5.1 Required Configuration

If `pyproject.toml` is missing or incomplete, **you must generate it** with this configuration:

```toml
[project]
requires-python = ">=3.11"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = [
    # Core Python errors
    "E",      # pycodestyle errors
    "W",      # pycodestyle warnings
    "F",      # Pyflakes

    # Code quality
    "B",      # flake8-bugbear (likely bugs)
    "C4",     # flake8-comprehensions
    "SIM",    # flake8-simplify
    "UP",     # pyupgrade (modernize syntax)
    "PIE",    # flake8-pie (misc lints)
    "RUF",    # Ruff-specific rules

    # Import organization
    "I",      # isort

    # Naming
    "N",      # pep8-naming

    # Complexity
    "C90",    # mccabe complexity
    "PL",     # pylint

    # Type checking support
    "TCH",    # flake8-type-checking

    # Security
    "S",      # flake8-bandit (security)

    # Error handling
    "TRY",    # tryceratops (exception handling)
    "EM",     # flake8-errmsg

    # Best practices
    "PTH",    # flake8-use-pathlib
    "DTZ",    # flake8-datetimez (timezone safety)
    "T20",    # flake8-print (no print statements)
    "ERA",    # eradicate (commented-out code)
    "ICN",    # flake8-import-conventions
    "G",      # flake8-logging-format
    "INP",    # flake8-no-pep420
    "RSE",    # flake8-raise
    "RET",    # flake8-return
    "SLF",    # flake8-self
    "SLOT",   # flake8-slots
    "ARG",    # flake8-unused-arguments
    "PGH",    # pygrep-hooks
    "PERF",   # perflint
    "FURB",   # refurb
]

ignore = [
    # Docstrings — require on public API, not everything
    "D100",   # Missing docstring in public module
    "D104",   # Missing docstring in public package
    "D105",   # Missing docstring in magic method
    "D107",   # Missing docstring in __init__
    # Annotations — covered by pyright
    "ANN",    # flake8-annotations (pyright handles this better)
    # Boolean trap — sometimes bool params are the right API
    "FBT",    # flake8-boolean-trap
]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = [
    "S101",   # Allow assert in tests
    "ARG",    # Allow unused arguments (fixtures)
    "PLR2004", # Allow magic values in tests
]

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.ruff.lint.mccabe]
max-complexity = 10

[tool.ruff.lint.pylint]
max-args = 5
max-branches = 12
max-returns = 6
max-statements = 50

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true

[tool.pyright]
typeCheckingMode = "strict"
pythonVersion = "3.11"
reportMissingTypeStubs = false
reportUnknownMemberType = false
reportUnknownArgumentType = false
```

### §5.2 Quality Gate Commands

```bash
# 1. Format
ruff format .

# 2. Lint (must be clean — NO # noqa allowed)
ruff check .

# 3. Type check (must be 0 errors)
pyright .

# 4. Tests
pytest -v

# 4b. Coverage (CI only — not required for local iteration)
# pytest -v --cov=src --cov-fail-under=80

# 5. Security scan
pip-audit
# OR
safety check
```

**Minimize `# noqa` and `# type: ignore`.** When necessary, use specific codes with inline justification (see §1.1).

## §6 ANTI-PATTERNS (INSTANT REJECT)

### §6.1 Type System Anti-Patterns

| Anti-Pattern | Why Bad | Fix |
|--------------|---------|-----|
| `Any` everywhere | No type safety | Specific types |
| `dict` for structured data | No validation | Pydantic/dataclass |
| `Union[str, int, list, None, ...]` | Too broad | Narrow the type |
| Missing return type | Caller can't rely on it | Add annotation |
| `cast()` to bypass checker | Hiding bugs | Fix the actual type |

### §6.2 Error Handling Anti-Patterns

| Anti-Pattern | Why Bad | Fix |
|--------------|---------|-----|
| Bare `except:` | Catches everything | Specific exceptions |
| `except Exception: pass` | Silent failure | Handle or re-raise |
| `assert` for validation | Disabled with -O | Raise exception |
| String exceptions | Python 2 relic | Exception classes |

### §6.3 Performance Anti-Patterns

| Anti-Pattern | Why Bad | Fix |
|--------------|---------|-----|
| `+` for string concat in loop | O(n²) | `''.join()` or `io.StringIO` |
| List comprehension just to discard | Memory waste | `for` loop with `pass` |
| `in list` for membership | O(n) | Use `set` |
| Reading entire file to memory | Memory bomb | Iterate lines |

### §6.4 Async Anti-Patterns

| Anti-Pattern | Why Bad | Fix |
|--------------|---------|-----|
| `asyncio.create_task()` without tracking | Orphaned tasks | Store handle, await or cancel |
| Blocking I/O in async function | Blocks event loop | `asyncio.to_thread()` |
| No timeout on network ops | Hangs forever | `asyncio.wait_for()` |
| `asyncio.get_event_loop()` | Deprecated pattern | `asyncio.run()` or pass explicitly |

## §7 DOMAIN-SPECIFIC GUIDANCE

### §7.A Web / API (Default)

- Framework: `FastAPI` (async, Pydantic-native) or `Flask` (simpler)
- Validation: Pydantic V2 models for all request/response
- Async: `httpx` for HTTP clients, `asyncpg` for PostgreSQL
- Logging: `structlog` with JSON output
- Testing: `pytest` + `httpx.AsyncClient` for integration tests

### §7.B CLI Applications

- Framework: `typer` (Pydantic-based) or `click`
- Config: `pydantic-settings` for env/file config
- Output: `rich` for formatted console output
- Testing: `pytest` with CLI runner

### §7.C Data / ML

- Data: `polars` (fast) or `pandas` with type stubs
- Validation: `pandera` for DataFrame schemas
- ML: Framework-specific type hints
- Testing: Property-based with `hypothesis`

### §7.D Scripts / Automation

- Even scripts must have type hints
- Use `if __name__ == "__main__":` guard
- Logging over print
- Document expected inputs/outputs

## §8 OUTPUT FORMAT (MANDATORY STRUCTURE)

Every response must follow this structure:

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

## §9 FINAL AUDIT CHECKLIST

Before submitting ANY code, verify:

- [ ] No unjustified `# noqa` (must have specific code + inline reason)
- [ ] No unjustified `# type: ignore` (must have specific code + inline reason)
- [ ] Zero `print()` statements (use logging)
- [ ] Zero bare `except:` blocks
- [ ] Zero `except Exception: pass` patterns
- [ ] Zero mutable default arguments
- [ ] Zero `Any` types (except at I/O boundaries with justification)
- [ ] All functions have complete type annotations
- [ ] All public functions have docstrings
- [ ] All external data parsed through Pydantic or TypedDict
- [ ] All exceptions are specific and meaningful
- [ ] Data model analysis provided
- [ ] Error strategy documented
- [ ] All dependencies justified
- [ ] Code passes `ruff check`
- [ ] Code passes `ruff format --check`
- [ ] Code passes `pyright`
- [ ] Code passes `pytest`

**If ANY checkbox is unchecked, DO NOT SUBMIT. Fix it or explain why it cannot be fixed.**

## §10 ENFORCEMENT REMINDER

**You are being watched.**

Every line of code you produce will be scrutinized. Every design decision will be questioned. Every runtime exception will be traced back to you.

The human reviewing your code is an expert who has seen every trick lazy AI uses:

- Pretending to run ruff/pyright
- Generating stubs and saying "implementation similar"
- Using `Any` everywhere
- Ignoring error handling
- Using bare `# noqa` or `# type: ignore` without specific codes
- Using `dict` instead of proper data models
- Writing `except Exception: pass`

**None of these will work. Do it right or don't do it at all.**
