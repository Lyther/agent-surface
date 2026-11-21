"""Sample host load, available memory and attempt-container usage while a cohort runs (SQ0.5).

Usage on the lab host:
    python3 -m evals.sample record --out samples.jsonl [--interval 2] [--match __]   (until SIGTERM or Ctrl-C)
    python3 -m evals.sample summary samples.jsonl [--match SUBSTRING] [--since EPOCH] [--until EPOCH]

`record` appends one JSON line per tick: epoch time, 1/5/15-minute load, MemTotal and MemAvailable in KiB, and, for
every running container whose name contains `--match` (Harbor names attempt containers `<task>__<trial>__...`),
its CPU percent (100 is one core) and memory in use. Containers that are not ours are never read. `summary`
reduces a window to the peaks that decide capacity: per container, and for the host.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

UNITS = {"b": 1, "kib": 1024, "mib": 1024**2, "gib": 1024**3, "kb": 1000, "mb": 1000**2, "gb": 1000**3}


def parse_size(text: str) -> int:
    """`12.5MiB` or `1.2GiB` to bytes."""
    text = text.strip()
    split = len(text.rstrip("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"))
    return int(float(text[:split]) * UNITS[text[split:].lower()])


def parse_stats(line: str) -> dict:
    """One `docker stats --format '{{json .}}'` line to name, cpu percent and memory bytes."""
    row = json.loads(line)
    return {"name": row["Name"], "cpu": float(row["CPUPerc"].rstrip("%")), "mem": parse_size(row["MemUsage"].split("/")[0])}


def meminfo() -> tuple[int, int]:
    values = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, _, rest = line.partition(":")
        values[key] = int(rest.split()[0])
    return values["MemTotal"], values["MemAvailable"]


def containers(match: str) -> list[str]:
    done = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, check=True)
    return [name for name in done.stdout.split() if match in name]


def tick(match: str) -> dict:
    total, available = meminfo()
    row = {"t": round(time.time(), 2), "load": list(os.getloadavg()), "mem_total_kib": total, "mem_avail_kib": available, "containers": []}
    names = containers(match)
    if names:
        done = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{json .}}", *names], capture_output=True, text=True)
        row["containers"] = [parse_stats(line) for line in done.stdout.splitlines() if line.strip()]
        if done.returncode != 0:  # a container exited between ps and stats; the rest were still read
            row["stats_error"] = done.stderr.strip()[:200]
    return row


def record(args) -> None:
    stop = False

    def halt(*_):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, halt)
    signal.signal(signal.SIGINT, halt)
    with open(args.out, "a") as f:
        while not stop:
            started = time.monotonic()
            f.write(json.dumps(tick(args.match)) + "\n")
            f.flush()
            time.sleep(max(0.0, args.interval - (time.monotonic() - started)))


def summarise(rows: list[dict], match: str = "", since: float = 0.0, until: float = float("inf")) -> dict:
    """Peaks over a window. `containers` maps each matching container to its peak CPU percent and memory MiB."""
    window = [r for r in rows if since <= r["t"] <= until]
    peaks: dict[str, dict] = {}
    for row in window:
        for c in row["containers"]:
            if match in c["name"]:
                p = peaks.setdefault(c["name"], {"cpu_peak": 0.0, "mem_peak_mib": 0.0, "cpu_sum": 0.0, "ticks": 0})
                p["cpu_peak"] = max(p["cpu_peak"], c["cpu"])
                p["mem_peak_mib"] = max(p["mem_peak_mib"], c["mem"] / 1024**2)
                p["cpu_sum"] += c["cpu"]
                p["ticks"] += 1
    for p in peaks.values():
        p["cpu_mean"] = round(p.pop("cpu_sum") / p["ticks"], 1)
        p["cpu_peak"] = round(p["cpu_peak"], 1)
        p["mem_peak_mib"] = round(p["mem_peak_mib"], 1)
    return {
        "ticks": len(window),
        "load1_peak": max((r["load"][0] for r in window), default=None),
        "mem_avail_min_pct": round(min((100 * r["mem_avail_kib"] / r["mem_total_kib"] for r in window), default=0), 1),
        "concurrent_peak": max((sum(match in c["name"] for c in r["containers"]) for r in window), default=0),
        "containers": peaks,
    }


def summary(args) -> None:
    rows = [json.loads(line) for line in Path(args.samples).read_text().splitlines() if line.strip()]
    result = summarise(rows, args.match, args.since, args.until)
    json.dump(result, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record")
    r.add_argument("--out", type=Path, required=True)
    r.add_argument("--interval", type=float, default=2.0)
    r.add_argument("--match", default="__")
    r.set_defaults(fn=record)
    s = sub.add_parser("summary")
    s.add_argument("samples", type=Path)
    s.add_argument("--match", default="")
    s.add_argument("--since", type=float, default=0.0)
    s.add_argument("--until", type=float, default=float("inf"))
    s.set_defaults(fn=summary)
    parsed = ap.parse_args()
    parsed.fn(parsed)
