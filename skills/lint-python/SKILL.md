---
name: lint-python
description: "Apply strict Python correctness, typing, async, and toolchain rules with examples. Use when writing, reviewing, or checking Python code or config."
---

## Baseline

Use the repository's supported Python version, package manager (`uv` by default on greenfield projects), lint/type configuration, and scripts (`rules/code.md`, `rules/repository.md`). Preserve existing strictness; never weaken linter, type-checker, or test settings to pass (`rules/test.md`), and do not introduce a new framework, schema library, or logger unless the task requires it. If a constraint below cannot be met, stop and name the blocker.

## Rules and Examples

### 1. Exceptions and Error Context

Never write a bare `except:`, `except Exception: pass`, or a handler that logs and swallows without re-raising or returning a typed error value. Catch the narrowest exception you can act on, and chain domain errors with `from err`.

```python
# Bad: swallows failures and erases the traceback
try:
    raw = config_path.read_text(encoding="utf-8")
except Exception as err:
    logger.error("bad config: %s", err)
    raw = ""

# Good: narrow catch + chained domain exception
try:
    raw = config_path.read_text(encoding="utf-8")
except OSError as err:
    raise ConfigReadError(f"cannot read {config_path}") from err
```

### 2. Truthiness vs `None` and Explicit `Optional`

Never use `if x:` or `x or default` when `0`, `0.0`, `""`, `[]`, or `False` is a valid input, and never write implicit `Optional` (`x: str = None`). Annotate optional parameters as `T | None = None` and check `is None`.

```python
# Bad: treats timeout=0 or prefix="" as missing
def connect(host: str, timeout: float | None = None, prefix: str = None) -> Client:
    effective_timeout = timeout or 5.0
    if prefix:
        ...

# Good: preserves valid falsy values
def connect(host: str, timeout: float | None = None, prefix: str | None = None) -> Client:
    effective_timeout = 5.0 if timeout is None else timeout
    if prefix is not None:
        ...
```

### 3. Async Execution and Task Lifetime

Never call blocking I/O (`time.sleep`, `requests`, synchronous `subprocess` or network/disk calls) inside `async def`—use async equivalents or `await asyncio.to_thread(...)`. Never drop an `asyncio.create_task(...)` return value: garbage collection can destroy an unreferenced task mid-flight and hide unhandled exceptions. Prefer `asyncio.TaskGroup`, or store background tasks in a strong-reference `set`.

```python
# Bad: blocks the event loop and leaks an unreferenced task
async def handle(job: Job) -> None:
    time.sleep(1)
    asyncio.create_task(audit_log(job))

# Good: structured concurrency or tracked task handle
background_tasks: set[asyncio.Task[None]] = set()

async def handle(job: Job) -> None:
    await asyncio.sleep(1)
    task = asyncio.create_task(audit_log(job))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
```

### 4. Boundaries, Types, and Forbidden Constructs

- **Untrusted boundaries**: parse external input (HTTP bodies/params, CLI args, files, env, external APIs) once at entry via `Pydantic`, `msgspec`, `cattrs`, or explicit validation into a `dataclass` or `TypedDict`. Do not pass raw `dict[str, Any]` across internal functions.
- **Public types**: keep changed public signatures fully annotated with explicit return types (`T | None` for expected absence; raise specific exceptions for unexpected failures).
- **Scoped escapes only**: never use `Any`, `typing.cast`, `# type: ignore`, or `# noqa` to hide a real defect. Genuine third-party stub or tool issues require an exact code and inline reason (e.g. `# type: ignore[import-untyped]  # vendorpkg ships no py.typed`).
- **Foot-guns and residue**: no mutable defaults (`def f(items: list[str] = [])`—use `None` and allocate inside), `from mod import *`, `eval`/`exec`, `subprocess.run(..., shell=True)` on untrusted input, module-level mutable state, diagnostic `print()` (use `logging`/`structlog`), `breakpoint()`/`pdb`, or `NotImplementedError` in production paths.

## Ruff Config Baseline

Keep configuration in `pyproject.toml` or `ruff.toml` as the single source of truth, pinning `line-length` and `target-version` (or `requires-python`) and excluding generated files and test fixtures. When seeding a repo without Ruff config, use a curated correctness set rather than `["ALL"]` or bare `E/F`:

```toml
[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "W", "F", "I", "UP", "B", "C4", "SIM", "PIE", "PT", "TID", "PGH", "PLE", "DTZ", "RUF", "S"]
ignore = ["S101", "PT011", "PT018", "SIM102"]
```

## Procedure and Toolchain Gate

1. Identify the `.py` and Python config files touched or under review, and check them against the rules above and the repository's own lint/type config.
2. Prefer the repository's check script (`make check`, `uv run ...`). Otherwise run the narrowest checks on the touched scope first, in order:

   ```bash
   ruff format --check <touched files>
   ruff check <touched files>
   pyright <touched files>
   pytest <tests covering the touched files>
   ```

3. When the change touches shared behavior, public APIs, security, data, or build tooling, run the full gate (`ruff format --check .`, `ruff check .`, `pyright .`, `pytest -v`), plus `pip-audit` when dependencies changed.
4. Use only tools configured or required by the repository. Report a missing tool as `not available`—never as passed.

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
