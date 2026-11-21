"""Pass only if the agent added a test that fails on the original code and passes on the fix."""
import ast
import subprocess
import sys
import tempfile
from pathlib import Path

APP = Path("/app")
BASELINE = Path("/tests/baseline_pager")
ORIGINAL_TESTS = {
    "test_partial_last_page",
    "test_exact_multiple_has_no_empty_page",
    "test_slice_second_page",
    "test_rejects_zero_page_size",
}


def test_names(path: Path) -> set[str]:
    tree = ast.parse(path.read_text())
    return {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name.startswith("test")}


def pytest_run(cwd: Path, targets: list[str]) -> int:
    cmd = [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "-c", "/dev/null", "--rootdir", str(cwd), *targets]
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True).returncode


def main() -> int:
    added: set[str] = set()
    for f in sorted((APP / "tests").rglob("test*.py")):
        names = test_names(f)
        added |= names - ORIGINAL_TESTS if f.name == "test_paging.py" else names
    if not added:
        print("no added tests")
        return 1
    expr = " or ".join(sorted(added))
    if pytest_run(APP, ["tests", "-k", expr]) != 0:
        print("added tests fail on the fixed code")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        (work / "pager").mkdir()
        for f in BASELINE.glob("*.py"):
            (work / "pager" / f.name).write_text(f.read_text())
        (work / "tests").mkdir()
        for f in (APP / "tests").rglob("*.py"):
            (work / "tests" / f.name).write_text(f.read_text())
        if pytest_run(work, ["tests", "-k", " or ".join(sorted(added))]) == 0:
            print("added tests do not fail on the original code")
            return 1
    print("regression test ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
