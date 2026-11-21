"""Run a seeded cohort of Harbor attempts and append one JSONL ledger row per attempt.

Usage: cohort.py --src SRC --scenario DIR --out DIR [--reps 2] [--seed 1] [--concurrency 4]
Hosts: opencode (free model, no credential) and droid. The Factory key, when droid runs, is read from
the first line of stdin, exported only into the harbor child's environment and scrubbed from the
retained artifacts afterwards.
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

from evals.arms import ARMS, build_overlay

HOSTS = {
    "opencode": {"agent": "evals.agents:ArmOpenCode", "model": "opencode/deepseek-v4.1-flash-free"},
    "droid": {"agent": "evals.agents:ArmDroid", "model": "claude-sonnet-5"},
}
# GR2 attempts used about 200k to 340k Factory credits each; four attempts plus margin.
CREDIT_STOP = 1_500_000
CREDIT_RESERVE_PER_ATTEMPT = 350_000
EVALS_DIR = Path(__file__).resolve().parent
SKILL_OPEN_EVENTS = ("OPEN", "ACCESS")


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def plan(seed: int, reps: int) -> list[tuple[str, str, int]]:
    cells = list(itertools.product(HOSTS, ARMS, range(1, reps + 1)))
    random.Random(seed).shuffle(cells)
    return cells


def skills_opened(attempt_dir: Path) -> list[str]:
    """Skills whose SKILL.md was opened again after the host's own startup scan (spike-grade detector).

    Both hosts read every SKILL.md once at startup to build the catalogue, so a first open is
    listing, not use. A second open of the same file is counted as a load.
    """
    names: set[str] = set()
    for log in attempt_dir.rglob("skill-opens.log"):
        counts: dict[str, int] = {}
        for line in log.read_text(errors="replace").splitlines():
            parts = line.split(" ", 2)
            if len(parts) == 3 and parts[1] == "OPEN" and parts[2].endswith("/SKILL.md"):
                counts[parts[2]] = counts.get(parts[2], 0) + 1
        names |= {Path(path).parent.name for path, n in counts.items() if n >= 2}
    return sorted(names)


def catalogue_scanned(attempt_dir: Path) -> int:
    """Number of distinct SKILL.md files opened at least once, to show the watcher saw the startup scan."""
    seen: set[str] = set()
    for log in attempt_dir.rglob("skill-opens.log"):
        for line in log.read_text(errors="replace").splitlines():
            parts = line.split(" ", 2)
            if len(parts) == 3 and parts[1] == "OPEN" and parts[2].endswith("/SKILL.md"):
                seen.add(parts[2])
    return len(seen)


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


def ledger_row(host: str, arm: str, rep: int, overlay: dict, started: str, exit_code: int, job_dir: Path, leaks: int) -> dict:
    trial = read_trial(job_dir)
    agent_result = trial.get("agent_result") or {}
    metadata = agent_result.get("metadata") or {}
    exception = trial.get("exception_info")
    rewards = (trial.get("verifier_result") or {}).get("rewards") or {}
    return {
        "arm": arm,
        "host": host,
        "model": HOSTS[host]["model"],
        "rep": rep,
        "harbor": (trial.get("agent_info") or {}).get("name"),
        "cli_version": (trial.get("agent_info") or {}).get("version"),
        "source_commit": overlay["source_commit"],
        "overlay_sha256": overlay["overlay_sha256"][:16],
        "started": started,
        "ended": now(),
        "harbor_exit": exit_code,
        "exception": (exception or {}).get("exception_type") if isinstance(exception, dict) else exception,
        "verifier_reward": rewards.get("reward"),
        "skills_opened": skills_opened(job_dir),
        "skill_files_scanned": catalogue_scanned(job_dir),
        "dev_fix_installed": any("/dev-fix/SKILL.md" in l for f in job_dir.rglob("arm-skills.txt") for l in f.read_text().splitlines()),
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


async def attempt(host: str, arm: str, rep: int, args, overlays: dict, key: str) -> dict:
    name = f"{host}-{arm}-{rep}"
    jobs = args.out / "jobs"
    job_dir = jobs / name
    if job_dir.exists():
        raise SystemExit(f"attempt directory exists, not reused: {job_dir}")
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "USER") if k in os.environ}
    env.update(
        HARBOR_TELEMETRY="0",
        PYTHONPATH=str(EVALS_DIR.parent),
        SQ_ARM=arm,
        SQ_OVERLAY=str(overlays[arm]["path"]),
    )
    if host == "droid":
        env["FACTORY_API_KEY"] = key
    cmd = [
        "uv", "run", "--frozen", "--project", str(EVALS_DIR), "harbor", "run",
        "-p", str(args.scenario), "-a", HOSTS[host]["agent"], "-m", HOSTS[host]["model"],
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
    row = ledger_row(host, arm, rep, overlays[arm], started, proc.returncode or 0, job_dir, leaks)
    row["seconds_total"] = round(time.monotonic() - t0, 1)
    return row


async def main(args) -> None:
    key = sys.stdin.readline().strip() if not sys.stdin.isatty() else ""
    args.out.mkdir(parents=True, exist_ok=True)
    overlays = {}
    for arm in ARMS:
        path = args.out / f"overlay-{arm}.tgz"
        if not path.exists():
            meta = build_overlay(args.src, ARMS[arm], path)
        else:
            meta = json.loads((args.out / f"overlay-{arm}.json").read_text())
        meta["path"] = str(path)
        (args.out / f"overlay-{arm}.json").write_text(json.dumps({k: v for k, v in meta.items() if k != "path"}, indent=2) + "\n")
        overlays[arm] = meta
    ledger = args.out / "ledger.jsonl"
    done = {(r["host"], r["arm"], r["rep"]) for r in map(json.loads, ledger.read_text().splitlines())} if ledger.exists() else set()
    order = [c for c in plan(args.seed, args.reps) if c not in done]
    (args.out / "order.json").write_text(json.dumps(plan(args.seed, args.reps)) + "\n")
    sem = asyncio.Semaphore(args.concurrency)
    spent = 0
    inflight_droid = 0

    async def one(cell):
        nonlocal spent, inflight_droid
        host, arm, rep = cell
        async with sem:
            if host == "droid":
                if not key:
                    row = {"arm": arm, "host": host, "rep": rep, "skipped": "no credential on stdin"}
                    ledger.open("a").write(json.dumps(row) + "\n")
                    return
                if spent + (inflight_droid + 1) * CREDIT_RESERVE_PER_ATTEMPT > CREDIT_STOP:
                    row = {"arm": arm, "host": host, "rep": rep, "skipped": f"spend stop ({spent} credits spent, {inflight_droid} in flight)"}
                    ledger.open("a").write(json.dumps(row) + "\n")
                    return
                inflight_droid += 1
            try:
                row = await attempt(host, arm, rep, args, overlays, key)
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
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--scenario", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--concurrency", type=int, default=4)
    parsed = ap.parse_args()
    if parsed.concurrency > 4:
        sys.exit("concurrency above 4 exceeds the host budget")
    asyncio.run(main(parsed))
