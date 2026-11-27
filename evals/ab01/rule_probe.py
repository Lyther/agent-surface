"""Rule probe: does a stronger skill rule get Droid's model to load skills unprompted?

ab01's full arm installs 75 skills and one skill rule in `.factory/AGENTS.md`, "Always pick the suitable skills that
fit your current task.", and no attempt loaded a skill. The probe builds three arms from that arm that differ only in
the rule: R0 keeps it, R1 replaces the sentence with a procedural one, and R2 moves R1's section to the top of the file.
Each attempt runs one task's ab01 image with an arm extracted into HOME and the lab's droid command for a fixed
window; no verifier runs, because the measure is the skill loads in the record. Cells run in a seeded random order.

The Factory key comes on stdin and reaches each container only through `docker run -e FACTORY_API_KEY`. Rerunning
into the same OUT_DIR skips attempts that already have an exit.json.

Usage: python3 rule_probe.py AB01_DIR AGENTS_PY OUT_DIR < key
  AB01_DIR   the ab01 lab directory (arms/full/droid.tgz, bench/, images/bench-images.json)
  AGENTS_PY  the lab's evals/agents.py, whose DROID_REMOVE_TOOLS is used as is
"""

from __future__ import annotations

import copy
import gzip
import hashlib
import io
import json
import os
import random
import re
import subprocess
import sys
import tarfile
import time
import tomllib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

MODEL = "deepseek-v4.1-flash"
HOST_IMAGE = "sq-host/droid:0.244.0"
# Skill choice comes before the first tool calls, so a window shorter than every task's limit still sees it.
WINDOW_SEC = 300
KILL_GRACE_SEC = 10
# Container start and arm extraction take seconds; past this the driver kills the container itself.
BACKSTOP_SEC = WINDOW_SEC + KILL_GRACE_SEC + 180
REPS = 2
CONCURRENCY = 6
SEED = 20261127
OLD_RULE = "Always pick the suitable skills that fit your current task."
NEW_RULE = (
    "Before your first tool call on any task, check the skill list for skills whose description matches the task "
    "and load each match with the Skill tool before doing anything else. Do this even for small or simple tasks; "
    "skip it only when no skill matches."
)
SECTION = "## Skills\n\n{}\n\n"
CALC_PROMPT = "In calc.py, add(a, b) returns a - b. The bug is confirmed and diagnosed: it must return a + b. Fix it."
CALC_SETUP = r'mkdir -p /tmp/probe && printf "def add(a, b):\n    return a - b\n" > /tmp/probe/calc.py && cd /tmp/probe && '
# (probe name, suite, scenario); the synthetic fix has no suite.
TASKS = [
    ("calc", None, None),
    ("break-filter", "terminal-bench", "break-filter-js-from-html"),
    ("git-leak", "terminal-bench", "git-leak-recovery"),
    ("query-optimize", "terminal-bench", "query-optimize"),
    ("vulnerable-secret", "terminal-bench", "vulnerable-secret"),
    ("db-wal", "terminal-bench", "db-wal-recovery"),
    ("ansible", "swebenchpro", "instance_ansible__ansible-b748edea457a4576847a10275678127895d2f02f-v1055803c3a812189a1133297f7f5468579283f86"),
    ("flipt", "swebenchpro", "instance_flipt-io__flipt-15b76cada1ef29cfa56b0fba36754be36243dded"),
]
ARM_SKILL_ROOTS = (".agents/skills/", ".factory/skills/")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rule_variants(agents: str) -> dict[str, str]:
    old, new = SECTION.format(OLD_RULE), SECTION.format(NEW_RULE)
    if agents.count(old) != 1:
        raise SystemExit("the ab01 skill section is not in AGENTS.md exactly once")
    rest = agents.replace(old, "")
    top = rest.index("\n## ") + 1
    return {"R0": agents, "R1": agents.replace(old, new), "R2": rest[:top] + new + rest[top:]}


def build_arms(full: Path, out: Path) -> tuple[dict[str, dict], list[str]]:
    """Each variant is the full arm's members in order, with only `.factory/AGENTS.md` rewritten. The gzip header carries
    no time, so a rebuild (a resumed run) gives the same tarball."""
    arms: dict[str, dict] = {}
    with tarfile.open(full) as src:
        members = src.getmembers()
        agents = next(m for m in members if m.name.removeprefix("./") == ".factory/AGENTS.md")
        texts = rule_variants(src.extractfile(agents).read().decode())
        skills = sorted(m.name.removeprefix("./") for m in members if m.name.endswith("/SKILL.md") and m.name.removeprefix("./").startswith(ARM_SKILL_ROOTS))
        for name, text in texts.items():
            path = out / "arms" / f"{name}.tgz"
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as packed, tarfile.open(fileobj=packed, mode="w") as dst:
                for member in members:
                    if member is agents:
                        data = text.encode()
                        info = copy.copy(member)
                        info.size = len(data)
                        dst.addfile(info, io.BytesIO(data))
                    else:
                        dst.addfile(member, src.extractfile(member) if member.isfile() else None)
            arms[name] = {"tarball": str(path), "sha256": sha256(path.read_bytes()), "agents_md_sha256": sha256(text.encode())}
    return arms, skills


def image_ids(tags: list[str]) -> dict[str, str]:
    out = subprocess.run(["docker", "image", "inspect", "--format", "{{.Id}}", *tags], capture_output=True, text=True, check=True).stdout.split()
    return dict(zip(tags, out, strict=True))


def load_tasks(ab01: Path) -> list[dict]:
    images = {row["scenario"]: row for row in json.loads((ab01 / "images" / "bench-images.json").read_text())}
    tasks = [{"task": "calc", "scenario": None, "image": HOST_IMAGE, "image_id": None, "cpus": "1", "memory": "2g", "setup": CALC_SETUP, "prompt": CALC_PROMPT}]
    for name, suite, scenario in TASKS[1:]:
        task_dir = ab01 / "bench" / suite / scenario
        env = tomllib.loads((task_dir / "task.toml").read_text())["environment"]
        memory = f"{env['memory_mb']}m" if "memory_mb" in env else str(env["memory"]).lower()
        row = images[task_dir.name]
        tasks.append({"task": name, "scenario": task_dir.name, "image": row["tag"], "image_id": row["image_id"], "cpus": str(env["cpus"]), "memory": memory,
                      "setup": "", "prompt": (task_dir / "instruction.md").read_text()})
    live = image_ids([t["image"] for t in tasks])
    for task in tasks:
        if task["image_id"] not in (None, live[task["image"]]):
            raise SystemExit(f"{task['image']} is not the ab01 image")
        task["image_id"] = live[task["image"]]
    return tasks


def run_attempt(cell: dict, env: dict, out: Path, run_id: str) -> str:
    variant, task, rep = cell["variant"], cell["task"], cell["rep"]
    attempt = out / variant / f"{task['task']}-{rep}"
    if (attempt / "exit.json").exists():
        return f"{variant} {task['task']} {rep} skipped"
    attempt.mkdir(parents=True, exist_ok=True)
    (attempt / "arm-skills.txt").write_text("".join(f"{s}\n" for s in cell["skills"]))
    name = f"ab02rp-{run_id}-{variant}-{task['task']}-{rep}".lower()
    inner = (
        f'{task["setup"]}tar -xzf - -C "$HOME" && exec timeout -k {KILL_GRACE_SEC} {WINDOW_SEC} droid exec --skip-permissions-unsafe '
        '-m "$MODEL" --remove-tools "$REMOVE" -o stream-json -- "$PROMPT" < /dev/null'
    )
    cmd = ["docker", "run", "-i", "--rm", "--name", name, "--cpus", task["cpus"], "--memory", task["memory"],
           "-e", "FACTORY_API_KEY", "-e", "FACTORY_DROID_AUTO_UPDATE_ENABLED=false", "-e", "MODEL", "-e", "REMOVE", "-e", "PROMPT",
           "--entrypoint", "bash", task["image"], "-c", inner]
    start = time.time()
    with open(cell["arm"], "rb") as arm, open(attempt / "droid.jsonl", "wb") as stdout, open(attempt / "droid.stderr", "wb") as stderr:
        try:
            code: int | str = subprocess.run(cmd, stdin=arm, stdout=stdout, stderr=stderr, env={**env, "PROMPT": task["prompt"]}, timeout=BACKSTOP_SEC).returncode
        except subprocess.TimeoutExpired:
            subprocess.run(["docker", "kill", name], capture_output=True, check=False)
            code = "backstop"
    seconds = round(time.time() - start, 1)
    (attempt / "exit.json").write_text(json.dumps({"code": code, "seconds": seconds, "started": start}) + "\n")
    return f"{variant} {task['task']} {rep} code={code} seconds={seconds}"


def main() -> int:
    ab01, agents_py, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    key = sys.stdin.readline().strip()
    if not key:
        print("no key on stdin", file=sys.stderr)
        return 3
    remove = re.search(r'DROID_REMOVE_TOOLS = \(\s*"([^"]+)"', agents_py.read_text()).group(1)
    out.mkdir(parents=True, exist_ok=True)
    arms, skills = build_arms(ab01 / "arms" / "full" / "droid.tgz", out)
    tasks = load_tasks(ab01)
    cells = [{"variant": v, "task": t, "rep": r, "arm": arms[v]["tarball"], "skills": skills} for v in arms for t in tasks for r in range(1, REPS + 1)]
    random.Random(SEED).shuffle(cells)
    run_id = time.strftime("%m%d%H%M")
    manifest = {
        "model": MODEL, "window_sec": WINDOW_SEC, "reps": REPS, "concurrency": CONCURRENCY, "seed": SEED, "remove_tools": remove,
        "rules": {"R0": OLD_RULE, "R1": NEW_RULE, "R2": "R1's section moved to the top"}, "arms": arms, "arm_skills": len(skills),
        "tasks": [{k: v for k, v in t.items() if k != "prompt"} | {"prompt_sha256": sha256(t["prompt"].encode())} for t in tasks],
        "order": [f"{c['variant']} {c['task']['task']} {c['rep']}" for c in cells], "started": time.time(),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    env = {**os.environ, "FACTORY_API_KEY": key, "MODEL": MODEL, "REMOVE": remove}
    with ThreadPoolExecutor(CONCURRENCY) as pool:
        for done in as_completed([pool.submit(run_attempt, c, env, out, run_id) for c in cells]):
            print(done.result(), flush=True)
    manifest["finished"] = time.time()
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
