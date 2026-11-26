"""Qualify the ab01 benchmark images: Harbor's oracle (expect reward 1) and nop (expect 0) on each task's droid image,
and one tiny droid call inside each image (TLS, libc and model id). The Factory key arrives on stdin and reaches only
`docker run -e FACTORY_API_KEY`; nothing it prints is kept except event types and the model name.

Run from ~/ab01/repo:  ... | uv run --frozen --project evals python ~/ab01/qualify.py --host-images H --out DIR --model M TASK_DIR...
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from evals.cohort import read_trial
from evals.images import scenario_tag, write_task

EVALS = Path.cwd() / "evals"
BASE_ENV = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "USER") if k in os.environ}


async def run(cmd: list[str], env: dict[str, str]) -> tuple[int, bytes]:
    proc = await asyncio.create_subprocess_exec(*cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    out, _ = await proc.communicate()
    return proc.returncode or 0, out


async def harbor(task: Path, agent: str, jobs: Path, name: str) -> dict:
    cmd = ["uv", "run", "--frozen", "--project", str(EVALS), "harbor", "run", "-p", str(task), "-a", agent,
           "-o", str(jobs), "--job-name", name, "-n", "1", "-y", "-q"]
    code, out = await run(cmd, {**BASE_ENV, "HARBOR_TELEMETRY": "0"})
    (jobs / f"{name}.log").write_bytes(out)
    trial = read_trial(jobs / name)
    exc = trial.get("exception_info")
    return {"reward": ((trial.get("verifier_result") or {}).get("rewards") or {}).get("reward"),
            "exception": exc.get("exception_type") if isinstance(exc, dict) else exc, "harbor_exit": code}


async def smoke(image: str, model: str, key: str) -> dict:
    cmd = ["docker", "run", "--rm", "--cpus", "1", "--memory", "2048m", "-e", "FACTORY_API_KEY", "-e", "FACTORY_DROID_AUTO_UPDATE_ENABLED=false",
           "--entrypoint", "sh", image, "-c", f"timeout 110 droid exec -m {model} -o stream-json 'Say hi in one word.'"]
    code, out = await run(cmd, {**BASE_ENV, "FACTORY_API_KEY": key})
    model_seen, completed = None, False
    for line in out.decode(errors="replace").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict) and event.get("type") == "system" and event.get("subtype") == "init":
            model_seen = event.get("model")
        completed |= isinstance(event, dict) and event.get("type") == "completion"
    return {"smoke_model": model_seen, "smoke_completed": completed, "smoke_exit": code}


async def main(args) -> None:
    key = sys.stdin.readline().rstrip("\r\n")
    if not key:
        sys.exit("no key on stdin")
    host = json.loads(args.host_images.read_text())["droid"]
    (args.out / "tasks").mkdir(parents=True, exist_ok=True)
    (args.out / "jobs").mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(args.concurrency)

    async def one(template: Path) -> dict:
        name = f"{template.parent.name}-{template.name}"
        image = scenario_tag(template, "droid")
        task = write_task(template, host, args.out / "tasks" / name, {}, image)
        async with sem:
            found = await smoke(image, args.model, key)
        async with sem:
            oracle = await harbor(task, "oracle", args.out / "jobs", f"{name}-oracle")
        async with sem:
            nop = await harbor(task, "nop", args.out / "jobs", f"{name}-nop")
        row = {"task": name, "image": image, **found, **{f"oracle_{k}": v for k, v in oracle.items()}, **{f"nop_{k}": v for k, v in nop.items()}}
        row["qualified"] = row["oracle_reward"] == 1 and row["nop_reward"] == 0 and found["smoke_completed"] and found["smoke_model"] == args.model
        with (args.out / "qual.jsonl").open("a") as f:
            f.write(json.dumps(row) + "\n")
        print(json.dumps({k: row[k] for k in ("task", "qualified", "oracle_reward", "nop_reward", "smoke_model", "smoke_completed")}), flush=True)
        return row

    rows = await asyncio.gather(*(one(t) for t in args.task))
    print(f"qualified {sum(r['qualified'] for r in rows)}/{len(rows)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host-images", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("task", type=Path, nargs="+")
    asyncio.run(main(ap.parse_args()))
