"""Run a seeded cohort of Harbor attempts from prebuilt arm images and append one JSONL ledger row per attempt.

Usage: cohort.py --images OUT/images.json --scenario DIR [--scenario DIR ...] --out DIR
                 [--hosts opencode,droid] [--arms A,B] [--reps 2] [--seed 1] [--concurrency 4]
Each attempt is one fresh container from the host-and-arm image (`evals/images.py`). Hosts: opencode (free
model, no credential) and droid. The Factory key, when droid runs, is read from the first line of stdin,
exported only into the harbor child's environment and scrubbed from the retained artifacts afterwards.
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import json
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from evals.arms import SKILL_DIRS
from evals.detect import verdict
from evals.images import image_skills, write_task

HOSTS = {
    "opencode": {"agent": "evals.agents:ArmOpenCode", "model": "opencode/deepseek-v4.1-flash-free"},
    "droid": {"agent": "evals.agents:ArmDroid", "model": "claude-sonnet-5"},
}
# GR2 attempts used about 200k to 340k Factory credits each; four attempts plus margin.
CREDIT_STOP = 1_500_000
CREDIT_RESERVE_PER_ATTEMPT = 350_000
EVALS_DIR = Path(__file__).resolve().parent


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def plan(scenarios: list[str], hosts: list[str], arms: list[str], seed: int, reps: int) -> list[tuple[str, str, str, int]]:
    cells = list(itertools.product(scenarios, hosts, arms, range(1, reps + 1)))
    random.Random(seed).shuffle(cells)
    return cells


def scrub(root: Path, key: str) -> int:
    """Replace the key in every retained file, then count files still containing it (key via stdin)."""
    if not key:
        return 0
    for path in root.rglob("*"):
        if path.is_file():
            try:
                data = path.read_bytes()
            except OSError:
                continue
            if key.encode() in data:
                path.write_bytes(data.replace(key.encode(), b"[REDACTED]"))
    scan = subprocess.run(["grep", "-rlF", "-f", "-", "--", str(root)], input=key + "\n", capture_output=True, text=True)
    return len([line for line in scan.stdout.splitlines() if line])


def read_trial(job_dir: Path) -> dict:
    results = sorted(job_dir.glob("*/result.json"))
    if not results:
        return {}
    return json.loads(results[0].read_text())


def span(trial: dict, phase: str) -> float | None:
    block = trial.get(phase) or {}
    if not block.get("started_at") or not block.get("finished_at"):
        return None
    fmt = "%Y-%m-%dT%H:%M:%S.%fZ"
    return round((datetime.strptime(block["finished_at"], fmt) - datetime.strptime(block["started_at"], fmt)).total_seconds(), 1)


def ledger_row(scenario: str, host: str, arm: str, rep: int, image: dict, started: str, exit_code: int, job_dir: Path, leaks: int) -> dict:
    trial = read_trial(job_dir)
    agent_result = trial.get("agent_result") or {}
    metadata = agent_result.get("metadata") or {}
    exception = trial.get("exception_info")
    rewards = (trial.get("verifier_result") or {}).get("rewards") or {}
    detected = verdict(job_dir, host)
    return {
        "scenario": scenario,
        "arm": arm,
        "host": host,
        "model": HOSTS[host]["model"],
        "rep": rep,
        "harbor": (trial.get("agent_info") or {}).get("name"),
        "cli_version": (trial.get("agent_info") or {}).get("version"),
        "source_commit": image["source_commit"],
        "overlay_sha256": image["overlay_sha256"],
        "image_id": image["image_id"],
        "started": started,
        "ended": now(),
        "harbor_exit": exit_code,
        "exception": (exception or {}).get("exception_type") if isinstance(exception, dict) else exception,
        "verifier_reward": rewards.get("reward"),
        "skills_loaded": detected["loaded"],
        "load_evidence": detected["evidence"],
        "audit_loads": detected["audit_loads"],
        "workspace_skill_reads": detected["workspace_skill_reads"],
        "failed_skill_lookups": detected["failed_lookups"],
        "audit_disagreements": detected["disagreements"],
        "skill_files_scanned": detected["scanned"],
        "dev_fix_installed": "dev-fix" in image["skills"],
        "cost_usd": agent_result.get("cost_usd"),
        "factory_credits": metadata.get("factory_credits"),
        "tokens_in": agent_result.get("n_input_tokens"),
        "tokens_out": agent_result.get("n_output_tokens"),
        "tokens_cache": agent_result.get("n_cache_tokens"),
        "seconds_total": None,
        "seconds_setup": span(trial, "agent_setup"),
        "seconds_agent": span(trial, "agent_execution"),
        "seconds_verifier": span(trial, "verifier"),
        "key_files_remaining": leaks,
    }


def scenario_name(path: Path) -> str:
    return f"{path.parent.name}-{path.name}"


async def attempt(cell: tuple, args, images: dict, key: str) -> dict:
    scenario, host, arm, rep = cell
    name = f"{scenario}-{host}-{arm}-{rep}"
    jobs = args.out / "jobs"
    job_dir = jobs / name
    if job_dir.exists():
        raise SystemExit(f"attempt directory exists, not reused: {job_dir}")
    image = images[f"{host}-{arm}"]
    template = args.scenarios[scenario]
    skill_file = f"/root/{SKILL_DIRS[host][0]}/dev-fix/SKILL.md"
    task = write_task(template, image["tag"], args.out / "tasks" / name, {"skill_file": skill_file})
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "USER") if k in os.environ}
    env.update(HARBOR_TELEMETRY="0", PYTHONPATH=str(EVALS_DIR.parent))
    if host == "droid":
        env["FACTORY_API_KEY"] = key
    cmd = [
        "uv", "run", "--frozen", "--project", str(EVALS_DIR), "harbor", "run",
        "-p", str(task), "-a", HOSTS[host]["agent"], "-m", HOSTS[host]["model"],
        "-o", str(jobs), "--job-name", name, "-n", "1", "-y", "-q",
        "--override-cpus", "1", "--override-memory-mb", "2048",
    ]
    started = now()
    t0 = time.monotonic()
    proc = await asyncio.create_subprocess_exec(*cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    out, _ = await proc.communicate()
    (args.out / "logs").mkdir(exist_ok=True)
    (args.out / "logs" / f"{name}.log").write_bytes(out)
    leaks = scrub(args.out, key) if host == "droid" else 0
    row = ledger_row(scenario, host, arm, rep, image, started, proc.returncode or 0, job_dir, leaks)
    row["seconds_total"] = round(time.monotonic() - t0, 1)
    return row


async def main(args) -> None:
    key = sys.stdin.readline().strip() if not sys.stdin.isatty() else ""
    args.out.mkdir(parents=True, exist_ok=True)
    images = json.loads(args.images.read_text())
    for row in images.values():
        row["skills"] = image_skills(row["tag"])
    args.scenarios = {scenario_name(p): p for p in args.scenario}
    ledger = args.out / "ledger.jsonl"
    done = {(r["scenario"], r["host"], r["arm"], r["rep"]) for r in map(json.loads, ledger.read_text().splitlines())} if ledger.exists() else set()
    everything = plan(sorted(args.scenarios), args.hosts.split(","), args.arms.split(","), args.seed, args.reps)
    (args.out / "order.json").write_text(json.dumps(everything) + "\n")
    order = [c for c in everything if tuple(c) not in done]
    sem = asyncio.Semaphore(args.concurrency)
    spent = 0
    inflight_droid = 0

    def skip(cell, why: str) -> None:
        scenario, host, arm, rep = cell
        with ledger.open("a") as f:
            f.write(json.dumps({"scenario": scenario, "arm": arm, "host": host, "rep": rep, "skipped": why}) + "\n")

    async def one(cell):
        nonlocal spent, inflight_droid
        host = cell[1]
        async with sem:
            if host == "droid":
                if not key:
                    return skip(cell, "no credential on stdin")
                if spent + (inflight_droid + 1) * CREDIT_RESERVE_PER_ATTEMPT > CREDIT_STOP:
                    return skip(cell, f"spend stop ({spent} credits spent, {inflight_droid} in flight)")
                inflight_droid += 1
            try:
                row = await attempt(cell, args, images, key)
            finally:
                if host == "droid":
                    inflight_droid -= 1
            if host == "droid":
                spent += int(row.get("factory_credits") or CREDIT_RESERVE_PER_ATTEMPT)
            with ledger.open("a") as f:
                f.write(json.dumps(row) + "\n")

    await asyncio.gather(*(one(c) for c in order))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", type=Path, required=True)
    ap.add_argument("--scenario", type=Path, action="append", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--hosts", default="opencode,droid")
    ap.add_argument("--arms", default="A,B")
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--concurrency", type=int, default=4)
    parsed = ap.parse_args()
    if parsed.concurrency > 4:
        sys.exit("concurrency above 4 exceeds the host budget")
    asyncio.run(main(parsed))
