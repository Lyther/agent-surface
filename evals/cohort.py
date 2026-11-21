"""Run a seeded cohort of Harbor attempts from host images and rendered arms, and append one JSONL ledger row per attempt.

Usage: cohort.py --host-images hosts.json --arms arms.json (--scenario DIR [--scenario DIR ...] | --queries FILE) --out DIR
                 [--hosts opencode,droid] [--profiles dev] [--reps 2] [--seed 1] [--concurrency 4]
                 [--cpus 1] [--memory-mb 2048] [--purpose timing-probe] [--spend droid=CAP:RESERVE ...]
Each attempt is one fresh container from the host image (`evals/images.py`) with the profile's arm tarball (`evals/arms.py`) extracted into HOME. Hosts: opencode (free
model, no credential), droid, and claude-code and codex through an OpenAI- and Anthropic-compatible gateway (`gateway.py`). Keys are read from stdin, one `NAME=value`
per line (a bare first line is the Factory key), and exported only into the harbor child's environment. After each attempt `evals/scrub.py` scans its receipts; a hit
quarantines the attempt, ledgers it as `quarantined` and stops the cohort.
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import json
import os
import random
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from evals.arms import SKILL_DIRS, load_arms
from evals.detect import verdict
from evals.gateway import GATEWAY_HOSTS, KEY_ENV, NO_PROXY_ENV, URL_ENV, gateway_url, no_proxy
from evals.images import scenario_tag, write_task
from evals.queries import TEMPLATE as TRIGGER_TEMPLATE, ledger_fields, load_queries, unit_name
from evals.scrub import Secret, parse_secrets, scan_receipt

HOSTS = {
    "opencode": {"agent": "evals.agents:ArmOpenCode", "model": "opencode/deepseek-v4.1-flash-free"},
    "droid": {"agent": "evals.agents:ArmDroid", "model": "claude-sonnet-5"},
    # Through the gateway: the requested model id. The gateway maps Claude ids to other models, so the served model differs.
    # Codex uses gpt-5.5: gpt-5.3-codex failed 3 of 6 control verifiers in each of two runs (it reported work it had not done).
    "claude-code": {"agent": "evals.agents:ArmClaude", "model": "claude-sonnet-5-5"},
    "codex": {"agent": "evals.agents:ArmCodex", "model": "gpt-5.5"},
}
# The environment variable that carries each host's key into its container.
HOST_KEY = {"droid": "FACTORY_API_KEY", "claude-code": KEY_ENV, "codex": KEY_ENV}
# Hosts whose spend is metered, and what one attempt's spend is: Factory credits for droid; for a gateway host the key's own counter is not
# available, so the tokens the attempt recorded (the whole prompt plus the output).
METERED_HOSTS = ("droid", *GATEWAY_HOSTS)
EVALS_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Unit:
    """What one cell runs: the task template, its instruction slots, ledger fields of its own, and whether Harbor grades it.

    A scenario is a unit graded by its verifier. A trigger query is a unit on the shared trigger template that
    only observes skill loads, so Harbor's verification is off.
    """

    template: Path
    subs: dict[str, str] = field(default_factory=dict)
    fields: dict = field(default_factory=dict)
    verify: bool = True


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def group_key(cell: tuple) -> tuple:
    """A group is every arm of one (scenario, host, repetition): the cells whose outcomes are compared."""
    scenario, host, _, rep = cell
    return scenario, host, rep


def plan(scenarios: list[str], hosts: list[str], profiles: list[str], seed: int, reps: int) -> list[list[tuple[str, str, str, int]]]:
    """Groups in seeded order, each a list of its arms' cells in an order seeded by the group.

    The groups are shuffled with the cohort seed and the arms inside a group with `Random(f"{seed}-{unit}")`, so a stop leaves
    whole groups and time drift on the host does not line up with an arm.
    """
    groups = sorted(itertools.product(scenarios, hosts, range(1, reps + 1)))
    random.Random(seed).shuffle(groups)
    ordered = []
    for scenario, host, rep in groups:
        arms = sorted(profiles)
        random.Random(f"{seed}-{scenario}-{host}-{rep}").shuffle(arms)
        ordered.append([(scenario, host, profile, rep) for profile in arms])
    return ordered


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


def epoch(stamp: str) -> float:
    return datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc).timestamp()


def first_load_fields(trial: dict, first: dict | None) -> dict:
    """Seconds from the agent's start to its first skill load, and the tool calls made before it; both null when nothing loaded."""
    started = (trial.get("agent_execution") or {}).get("started_at")
    if not first or not started:
        return {"first_load_seconds": None, "calls_before_first_load": None}
    return {"first_load_seconds": round(first["ts"] - epoch(started), 1), "calls_before_first_load": first["calls_before"]}


def ledger_row(scenario: str, host: str, profile: str, rep: int, image: dict, arm: dict, started: str, exit_code: int, job_dir: Path) -> dict:
    trial = read_trial(job_dir)
    agent_result = trial.get("agent_result") or {}
    metadata = agent_result.get("metadata") or {}
    exception = trial.get("exception_info")
    rewards = (trial.get("verifier_result") or {}).get("rewards") or {}
    detected = verdict(job_dir, host)
    return {
        "scenario": scenario,
        "profile": profile,
        "desc_arm": arm["desc_arm"],
        "host": host,
        "model": HOSTS[host]["model"],
        "rep": rep,
        "harbor": (trial.get("agent_info") or {}).get("name"),
        "cli_version": (trial.get("agent_info") or {}).get("version"),
        "source_commit": arm["source_commit"],
        "arm_sha256": arm["arm_sha256"],
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
        **first_load_fields(trial, detected["first_load"]),
        "dev_fix_installed": "dev-fix" in arm["skills"],
        "cost_usd": agent_result.get("cost_usd"),
        "factory_credits": metadata.get("factory_credits"),
        "tokens_in": agent_result.get("n_input_tokens"),
        "tokens_out": agent_result.get("n_output_tokens"),
        "tokens_cache": agent_result.get("n_cache_tokens"),
        "model_requests": metadata.get("model_requests"),
        "seconds_total": None,
        "seconds_env": span(trial, "environment_setup"),
        "seconds_setup": span(trial, "agent_setup"),
        "seconds_agent": span(trial, "agent_execution"),
        "seconds_verifier": span(trial, "verifier"),
        "receipt_scan": "clean",
    }


def scenario_name(path: Path) -> str:
    return f"{path.parent.name}-{path.name}"


def make_units(scenarios: list[Path], queries: list[dict]) -> dict[str, Unit]:
    units = {scenario_name(p): Unit(p) for p in scenarios}
    for query in queries:
        units[unit_name(query)] = Unit(TRIGGER_TEMPLATE, {"query": query["text"]}, ledger_fields(query), verify=False)
    return units


def read_keys(stream) -> dict[str, str]:
    """Keys from stdin, one `NAME=value` per line; a bare first line is the Droid key (the SQ0.1 protocol)."""
    keys: dict[str, str] = {}
    for number, raw in enumerate(stream):
        line = raw.rstrip("\r\n")
        if not line:
            continue
        name, sep, value = line.partition("=")
        if sep and name in HOST_KEY.values():
            keys[name] = value
        elif number == 0:
            keys["FACTORY_API_KEY"] = line
    return keys


def injected_secrets(keys: dict[str, str]) -> list[Secret]:
    """Every key the cohort holds, so a key leaking into another host's receipts is also caught; credential
    patterns are always scanned too."""
    return parse_secrets([f"{name}={value}" for name, value in sorted(keys.items()) if value])


def finish_attempt(cell: tuple, image: dict, arm: dict, started: str, exit_code: int, out: Path, secrets: list[Secret], ledger: Path, seconds: float | None = None,
                   extra: dict | None = None) -> bool:
    """Scan the attempt's receipts, append its ledger row, and return True when the cohort must stop.

    The container is already removed and its files are in `jobs/<name>`. A hit quarantines the attempt's
    receipts and ledgers `status: quarantined` with the hit count and label or pattern names, never matched
    text; the row carries no verdict or cost, because a leaked attempt is not scored.
    """
    scenario, host, profile, rep = cell
    name = f"{scenario}-{host}-{profile}-{rep}"
    receipts = [out / "jobs" / name, out / "logs" / f"{name}.log", out / "tasks" / name]
    hits = [hit for path in receipts if path.exists() for hit in scan_receipt(path, secrets, out / "quarantine")]
    if hits:
        row = {"scenario": scenario, "profile": profile, "host": host, "rep": rep, "status": "quarantined",
               "hits": len(hits), "hit_names": sorted({hit.name for hit in hits}), "ended": now()}
    else:
        row = ledger_row(scenario, host, profile, rep, image, arm, started, exit_code, out / "jobs" / name)
        row["seconds_total"] = None if seconds is None else round(seconds, 1)
        row.update(extra or {})
    with ledger.open("a") as f:
        f.write(json.dumps(row) + "\n")
    return bool(hits)


async def attempt(cell: tuple, args, images: dict, arms: dict, keys: dict[str, str]) -> tuple[str, int, float]:
    """Run one attempt through Harbor; returns (started, harbor exit code, wall seconds)."""
    scenario, host, profile, rep = cell
    name = f"{scenario}-{host}-{profile}-{rep}"
    jobs = args.out / "jobs"
    if (jobs / name).exists():
        raise SystemExit(f"attempt directory exists, not reused: {jobs / name}")
    image, arm = images[host], arms[f"{host}-{profile}"]
    skill_file = f"/root/{SKILL_DIRS[host][0]}/dev-fix/SKILL.md"
    unit = args.units[scenario]
    template = unit.template
    own_image = scenario_tag(template, host) if (template / "environment" / "Dockerfile").exists() else None
    task = write_task(template, image, args.out / "tasks" / name, {"skill_file": skill_file, **unit.subs}, own_image)
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "USER") if k in os.environ}
    env.update(HARBOR_TELEMETRY="0", PYTHONPATH=str(EVALS_DIR.parent), SQ_ARM_TARBALL=arm["tarball"], SQ_ARM_SHA256=arm["arm_sha256"])
    if host in GATEWAY_HOSTS:  # the agent reads the gateway address at run time
        env.update({URL_ENV: gateway_url(), NO_PROXY_ENV: no_proxy()})
    if HOST_KEY.get(host) in keys:
        env[HOST_KEY[host]] = keys[HOST_KEY[host]]
    cmd = [
        "uv", "run", "--frozen", "--project", str(EVALS_DIR), "harbor", "run",
        "-p", str(task), "-a", HOSTS[host]["agent"], "-m", HOSTS[host]["model"],
        "-o", str(jobs), "--job-name", name, "-n", "1", "-y", "-q",
        "--override-cpus", str(args.cpus), "--override-memory-mb", str(args.memory_mb),
    ]
    if not unit.verify:
        cmd.append("--disable-verification")
    started = now()
    t0 = time.monotonic()
    proc = await asyncio.create_subprocess_exec(*cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    out, _ = await proc.communicate()
    (args.out / "logs").mkdir(exist_ok=True)
    (args.out / "logs" / f"{name}.log").write_bytes(out)
    return started, proc.returncode or 0, time.monotonic() - t0


def row_extra(args) -> dict:
    """Run-level ledger fields: the container caps, and a purpose label (`timing-probe` rows stay out of outcome analysis)."""
    extra = {"cpus": args.cpus, "memory_mb": args.memory_mb, "concurrency": args.concurrency}
    if args.purpose:
        extra["purpose"] = args.purpose
    if args.prereg:
        extra["prereg"] = args.prereg
    return extra


def spend_reading(host: str, row: dict) -> int | None:
    """The attempt's spend in its host's unit, or None when the row has no reading."""
    if host == "droid":
        return row.get("factory_credits")
    if row.get("tokens_in") is None:
        return None
    return row["tokens_in"] + (row.get("tokens_out") or 0)


def parse_spend(items: list[str], hosts: list[str]) -> dict[str, tuple[int, int]]:
    """`HOST=CAP:RESERVE` per metered host: the cohort's cap on that host's spend and the reserve charged per attempt.

    Both come from the run's inputs (the preregistration), so a metered host without them does not start.
    """
    spend: dict[str, tuple[int, int]] = {}
    for item in items:
        host, _, numbers = item.partition("=")
        cap, _, reserve = numbers.partition(":")
        if host not in METERED_HOSTS or not cap.isdigit() or not reserve.isdigit() or int(cap) <= 0 or int(reserve) <= 0:
            raise SystemExit(f"--spend {item!r}: expected HOST=CAP:RESERVE with HOST one of {', '.join(METERED_HOSTS)} and positive integers")
        spend[host] = (int(cap), int(reserve))
    missing = [h for h in hosts if h in METERED_HOSTS and h not in spend]
    if missing:
        raise SystemExit(f"no --spend HOST=CAP:RESERVE for {', '.join(missing)}: droid counts Factory credits, the gateway hosts tokens (prompt plus output)")
    return spend


class SpendGate:
    """Admits whole groups while spent + reserve x (attempts admitted and not yet finished, the new group included) stays within the cap.

    An attempt with no spend reading is charged the reserve, so a missing reading cannot hide spend.
    """

    def __init__(self, cap: int, reserve: int):
        self.cap, self.reserve = cap, reserve
        self.spent = 0
        self.pending = 0

    def admit(self, attempts: int) -> str | None:
        """None and the attempts are held when the group fits; otherwise the reason it does not."""
        if self.spent + (self.pending + attempts) * self.reserve > self.cap:
            return f"spend stop ({self.spent} spent, {self.pending} attempts pending, cap {self.cap})"
        self.pending += attempts
        return None

    def settle(self, reading: int | None, ran: bool = True) -> None:
        """One admitted attempt is over. `ran` is False when it failed before the model did anything: it spent nothing."""
        self.pending -= 1
        self.spent += int(reading or (self.reserve if ran else 0))


async def run_order(groups: list[list], run_cell, concurrency: int, admit=None) -> bool:
    """Run groups with bounded concurrency, the arms of a group one after another; `run_cell(cell)` returns True to stop the cohort.

    A stop only keeps further groups from starting: a group that has started runs all its arms, so the ledger holds whole groups.
    `admit(group)` returns False to refuse a group, which it records itself.
    """
    sem = asyncio.Semaphore(concurrency)
    stopped = False

    async def one(group):
        nonlocal stopped
        async with sem:
            if stopped or (admit and not admit(group)):
                return
            for cell in group:
                if await run_cell(cell):
                    stopped = True

    await asyncio.gather(*(one(g) for g in groups))
    return stopped


async def main(args) -> None:
    keys = read_keys(sys.stdin) if not sys.stdin.isatty() else {}
    if GATEWAY_HOSTS and set(GATEWAY_HOSTS) & set(args.hosts.split(",")):
        gateway_url(), no_proxy()  # fail before any attempt, naming the missing variable
    args.out.mkdir(parents=True, exist_ok=True)
    images = json.loads(args.host_images.read_text())
    arms = load_arms(args.arms)
    args.spend = parse_spend(args.spend_items, args.hosts.split(","))
    args.units = make_units(args.scenario, load_queries(args.queries) if args.queries else [])
    ledger = args.out / "ledger.jsonl"
    done = {(r["scenario"], r["host"], r["profile"], r["rep"]) for r in map(json.loads, ledger.read_text().splitlines())} if ledger.exists() else set()
    everything = plan(sorted(args.units), args.hosts.split(","), args.profiles.split(","), args.seed, args.reps)
    (args.out / "order.json").write_text(json.dumps(everything) + "\n")
    order = [left for left in ([c for c in group if tuple(c) not in done] for group in everything) if left]
    gates = {host: SpendGate(cap, reserve) for host, (cap, reserve) in args.spend.items()}

    def skip(cell, why: str) -> None:
        scenario, host, profile, rep = cell
        with ledger.open("a") as f:
            f.write(json.dumps({"scenario": scenario, "profile": profile, "host": host, "rep": rep, "skipped": why, **args.units[scenario].fields}) + "\n")

    def admit(group) -> bool:
        gate = gates.get(group[0][1])
        why = gate.admit(len(group)) if gate else None
        for cell in group if why else ():
            skip(cell, why)
        return not why

    async def run_cell(cell) -> bool:
        scenario, host, profile, rep = cell
        if host in HOST_KEY and HOST_KEY[host] not in keys:
            skip(cell, f"no {HOST_KEY[host]} on stdin")
            if host in gates:
                gates[host].settle(0, ran=False)
            return False
        started, code, seconds = await attempt(cell, args, images, arms, keys)
        stop = finish_attempt(cell, images[host], arms[f"{host}-{profile}"], started, code, args.out, injected_secrets(keys), ledger, seconds,
                              {**row_extra(args), **args.units[scenario].fields})
        if host in gates:
            last = json.loads(ledger.read_text().splitlines()[-1])
            # An attempt that failed before the agent started spent nothing; any other without a reading is charged the reserve.
            gates[host].settle(spend_reading(host, last), ran=last.get("seconds_agent") is not None)
        return stop

    if await run_order(order, run_cell, args.concurrency, admit):
        sys.exit("receipt scan found a credential: attempt quarantined, cohort stopped (see ledger and out/quarantine)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host-images", type=Path, required=True)
    ap.add_argument("--arms", type=Path, required=True)
    ap.add_argument("--scenario", type=Path, action="append", default=[])
    ap.add_argument("--queries", type=Path, help="trigger queries JSON (see evals/queries.py); each becomes a unit on the trigger template")
    ap.add_argument("--prereg", help="id of the preregistration the run follows, kept on every row")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--hosts", default="opencode,droid")
    ap.add_argument("--profiles", default="dev")
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--concurrency", type=int, default=4, help="attempts at once; the measured safe level per host is in the README's Capacity section")
    ap.add_argument("--spend", dest="spend_items", action="append", default=[], metavar="HOST=CAP:RESERVE",
                    help="required for droid (Factory credits) and the gateway hosts (tokens, prompt plus output): the cohort's cap on the host's spend and the reserve charged per attempt")
    ap.add_argument("--cpus", type=int, default=1, help="CPU cap per attempt container")
    ap.add_argument("--memory-mb", type=int, default=2048, help="memory cap per attempt container")
    ap.add_argument("--purpose", help="ledger label, e.g. timing-probe or capacity-ramp: such rows are never outcome data")
    parsed = ap.parse_args()
    if not (parsed.scenario or parsed.queries):
        ap.error("give --scenario or --queries")
    asyncio.run(main(parsed))
