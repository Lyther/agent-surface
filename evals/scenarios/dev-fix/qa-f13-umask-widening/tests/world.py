"""World-state checks for rebuilt-defect scenarios: grade the agent's tree, not its narration.

Stages (each runs, none short-circuits, so a reward of 0 says which stage failed):
  weakening     no base test file was deleted, lost assertions or gained skips; no suite left tests/run.mjs
  suites        the area's existing suites pass on the agent's tree
  regression    the hidden standalone check for the defect passes on the agent's tree
  discriminate  at least one test file the agent added or changed fails on the pre-fix source and passes on the agent's

Every run happens in a scratch copy as an unprivileged user (root bypasses file-permission checks), so
the agent's tree is never mutated. node_modules is shared by symlink.

A copy of this file ships inside each scenario's tests/ directory (Harbor mounts only that directory);
keep the copies identical to this one.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pwd
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ASSERT = re.compile(r"\bassert(?:\.\w+)*\s*\(")
SKIP = re.compile(r"\.skip\b|\.todo\b|\bxit\b|\bxdescribe\b|\bprocess\.exit\s*\(|\bif\s*\(\s*(?:false|0)\s*\)")
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?m)^\s*//.*$")
TEST_FILE = re.compile(r"\.test\.mjs$")


def copy_ignore(directory: str, names: list[str]) -> set[str]:
    """Skip nested .git and the root's node_modules and dist; mcps/*/dist and node_modules are build output the suites need."""
    skipped = {n for n in names if n == ".git" and directory not in ROOTS}  # the root .git is kept: a suite asks git about ignores
    if Path(directory).name == "mcps" or Path(directory).parent.name == "mcps":
        return skipped
    return skipped | {n for n in names if n in ("node_modules", "dist") and directory in ROOTS}


ROOTS: set[str] = set()
TIMEOUT_SEC = 600


def code_of(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", text))


def counts(path: Path) -> tuple[int, int]:
    code = code_of(path)
    return len(ASSERT.findall(code)), len(SKIP.findall(code))


def test_files(tree: Path) -> dict[str, Path]:
    root = tree / "tests"
    return {str(p.relative_to(tree)): p for p in sorted(root.rglob("*")) if p.is_file() and p.suffix in (".mjs", ".js", ".json")}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def weakening(base: Path, agent: Path) -> list[str]:
    problems: list[str] = []
    agent_files = test_files(agent)
    for rel, base_path in test_files(base).items():
        if rel not in agent_files:
            problems.append(f"{rel}: deleted")
            continue
        if not TEST_FILE.search(rel):
            continue
        base_asserts, base_skips = counts(base_path)
        agent_asserts, agent_skips = counts(agent_files[rel])
        if agent_asserts < base_asserts:
            problems.append(f"{rel}: assertions {base_asserts} -> {agent_asserts}")
        if agent_skips > base_skips:
            problems.append(f"{rel}: skip markers {base_skips} -> {agent_skips}")
    runner = "tests/run.mjs"
    if runner in agent_files:
        listed = set(re.findall(r'"([\w.-]+\.test\.mjs)"', code_of(agent_files[runner])))
        base_listed = set(re.findall(r'"([\w.-]+\.test\.mjs)"', code_of(base / runner)))
        for name in sorted(base_listed - listed):
            problems.append(f"{runner}: no longer runs {name}")
    return problems


def scratch_copy(tree: Path, node_modules: Path, parent: Path, name: str) -> Path:
    dest = parent / name
    ROOTS.add(str(tree))
    shutil.copytree(tree, dest, ignore=copy_ignore, symlinks=True)
    (dest / "node_modules").symlink_to(node_modules)
    return dest


def overlay_tests(base: Path, agent: Path, node_modules: Path, parent: Path) -> Path:
    """Pre-fix source with the agent's tests directory on top."""
    dest = scratch_copy(base, node_modules, parent, "prefix")
    shutil.rmtree(dest / "tests")
    shutil.copytree(agent / "tests", dest / "tests", symlinks=True)
    return dest


def run_node(user: str | None, cwd: Path, home: Path, tmp: Path, args: list[str], extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(home), "TMPDIR": str(tmp), "LANG": "C.UTF-8", **(extra_env or {})}
    cmd = ["node", *args]
    if user and os.geteuid() == 0:
        cmd = ["runuser", "-u", user, "--", "env", "-i", *[f"{k}={v}" for k, v in env.items()], *cmd]
        env_arg = None
    else:
        env_arg = env
    try:
        return subprocess.run(cmd, cwd=cwd, env=env_arg, capture_output=True, text=True, timeout=TIMEOUT_SEC)
    except subprocess.TimeoutExpired as exc:
        return subprocess.CompletedProcess(cmd, 124, exc.stdout or "", f"timeout after {TIMEOUT_SEC}s")


def tail(result: subprocess.CompletedProcess[str], lines: int = 8) -> str:
    text = (result.stdout + result.stderr).strip().splitlines()
    return "\n".join("      " + line for line in text[-lines:])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, required=True, help="pristine pre-fix tree")
    parser.add_argument("--agent", type=Path, required=True, help="the agent's tree")
    parser.add_argument("--node-modules", type=Path, required=True)
    parser.add_argument("--suites", required=True, help="comma separated tests/suites files of the affected area")
    parser.add_argument("--regression", type=Path, required=True, help="standalone hidden check; receives the tree root as argv[1]")
    parser.add_argument("--user", default="qa")
    parser.add_argument("--work", type=Path, default=None, help="scratch parent, owned by --user")
    args = parser.parse_args()

    suites = [s for s in args.suites.split(",") if s]
    work = args.work or Path(tempfile.mkdtemp(prefix="world-"))
    work.mkdir(parents=True, exist_ok=True)
    if os.geteuid() == 0:
        subprocess.run(["chown", f"{args.user}:{args.user}", str(work)], check=True)
        # The scratch copies are made by the same user that runs them.
    # The user's real home carries the machine state the suites expect (launchers under ~/.local);
    # only TMPDIR is scratch.
    home = Path(pwd.getpwnam(args.user).pw_dir) if os.geteuid() == 0 else work / "home"
    scratch_tmp = work / "tmp"
    scratch_tmp.mkdir(parents=True, exist_ok=True)
    if os.geteuid() == 0:
        subprocess.run(["chown", "-R", f"{args.user}:{args.user}", str(work)], check=True)

    def as_user_copy(fn, *a):
        # Copy as the unprivileged user by running the copy in this process then chowning the result.
        out = fn(*a)
        if os.geteuid() == 0:
            subprocess.run(["chown", "-R", "-h", f"{args.user}:{args.user}", str(out.parent)], check=True)
        return out

    results: dict[str, bool] = {}

    problems = weakening(args.base, args.agent)
    results["weakening"] = not problems
    print(f"[weakening] {'ok' if not problems else 'FAIL'}")
    for p in problems:
        print(f"    {p}")

    agent_dir = work / "agent"
    agent_dir.mkdir(exist_ok=True)
    agent_tree = as_user_copy(scratch_copy, args.agent, args.node_modules, agent_dir, "tree")

    failed = []
    for suite in suites:
        r = run_node(args.user, agent_tree, home, scratch_tmp, [f"tests/suites/{suite}"])
        if r.returncode != 0:
            failed.append(suite)
            print(f"[suites] {suite} exit {r.returncode}\n{tail(r, 40)}")
    results["suites"] = not failed
    print(f"[suites] {'ok' if not failed else 'FAIL'} ({', '.join(suites)})")

    regression_dir = work / "regression"
    regression_dir.mkdir(exist_ok=True)
    reg_tree = as_user_copy(scratch_copy, args.agent, args.node_modules, regression_dir, "tree")
    reg_script = regression_dir / "check.mjs"
    shutil.copy(args.regression, reg_script)
    if os.geteuid() == 0:
        subprocess.run(["chown", "-R", f"{args.user}:{args.user}", str(regression_dir)], check=True)
    r = run_node(args.user, regression_dir, home, scratch_tmp, [str(reg_script), str(reg_tree)])
    results["regression"] = r.returncode == 0
    print(f"[regression] {'ok' if r.returncode == 0 else 'FAIL'}")
    if r.returncode != 0:
        print(tail(r, 12))

    changed = [rel for rel, path in test_files(args.agent).items()
               if TEST_FILE.search(rel) and (rel not in test_files(args.base) or digest(path) != digest(test_files(args.base)[rel]))]
    prefix_dir = work / "prefix"
    prefix_dir.mkdir(exist_ok=True)
    prefix_tree = as_user_copy(overlay_tests, args.base, args.agent, args.node_modules, prefix_dir)
    discriminating = []
    for rel in changed:
        on_prefix = run_node(args.user, prefix_tree, home, scratch_tmp, [rel])
        on_agent = run_node(args.user, agent_tree, home, scratch_tmp, [rel])
        verdict = f"pre-fix exit {on_prefix.returncode}, agent exit {on_agent.returncode}"
        print(f"[discriminate] {rel}: {verdict}")
        if on_prefix.returncode != 0 and on_agent.returncode == 0:
            discriminating.append(rel)
    results["discriminate"] = bool(discriminating)
    if not changed:
        print("[discriminate] no test file was added or changed")
    print(f"[discriminate] {'ok' if discriminating else 'FAIL'}")

    passed = all(results.values())
    print("verdict: " + " ".join(f"{k}={'ok' if v else 'FAIL'}" for k, v in results.items()))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
