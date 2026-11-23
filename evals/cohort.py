"""Run a seeded cohort of Harbor attempts from host images and rendered arms, and append one JSONL ledger row per attempt.

Usage: cohort.py --host-images hosts.json --arms arms.json (--scenario DIR [--scenario DIR ...] | --queries FILE) --out DIR
                 [--hosts opencode,droid] [--profiles dev] [--reps 2] [--seed 1] [--concurrency 4]
                 [--cpus N] [--memory-mb N] [--agent-timeout-sec N] [--purpose timing-probe] [--spend droid=CAP:RESERVE ...]
Each attempt is one fresh container from the host image (`evals/images.py`) with the profile's arm tarball (`evals/arms.py`) extracted into HOME. Hosts: droid, and opencode, claude-code and codex through an OpenAI- and Anthropic-compatible gateway (`gateway.py`). Keys are read from stdin, one `NAME=value`
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
import tomllib
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from evals.arms import SKILL_DIRS, load_arms
from evals.detect import verdict
from evals.endreason import attempt_end
from evals.gateway import CLAUDE_MODEL, GATEWAY_HOSTS, KEY_ENV, NO_PROXY_ENV, URL_ENV, gateway_url, no_proxy
from evals.images import scenario_tag, write_task
from evals.queries import TEMPLATE as TRIGGER_TEMPLATE, ledger_fields, load_queries, unit_name
from evals.scrub import Secret, load_known, parse_secrets, scan_receipt
from evals.served import FIELDS as SERVED_FIELDS, compare as compare_served, identity as served_identity, ledger_value, probe_droid, probe_gateway

HOSTS = {
    # Through the gateway; a candidate host that is not scored, so it keeps gpt-5.5 while codex moved to gpt-5.4.
    "opencode": {"agent": "evals.agents:ArmOpenCode", "model": "gpt-5.5"},
    "droid": {"agent": "evals.agents:ArmDroid", "model": "claude-sonnet-5"},
    # Through the gateway: a catalog id, so the requested model is the served one.
    # Codex uses gpt-5.4 (newer models are busy on the gateway); gpt-5.3-codex failed 3 of 6 control verifiers in each of two runs (it reported work it had not done).
    "claude-code": {"agent": "evals.agents:ArmClaude", "model": CLAUDE_MODEL},
    "codex": {"agent": "evals.agents:ArmCodex", "model": "gpt-5.4"},
}
# The environment variable that carries each host's key into its container.
HOST_KEY = {"droid": "FACTORY_API_KEY", "opencode": KEY_ENV, "claude-code": KEY_ENV, "codex": KEY_ENV}
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


def limits(args, unit: Unit) -> dict:
    """Container caps and the agent timeout of a unit: the run's override when given (the preregistration's value), else what the task declares."""
    declared = tomllib.loads((unit.template / "task.toml").read_text())
    return {
        "cpus": args.cpus if args.cpus is not None else declared["environment"]["cpus"],
        "memory_mb": args.memory_mb if args.memory_mb is not None else declared["environment"]["memory_mb"],
        "agent_timeout_sec": args.agent_timeout_sec if args.agent_timeout_sec is not None else declared["agent"]["timeout_sec"],
    }


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


def first_target_load_seconds(trial: dict, first_loads: dict[str, dict], target_skill: str | None) -> float | None:
    """Seconds from the agent's start to its first load of the attempt's target skill; null for an attempt with no target (not a trigger attempt),
    or one that never loaded it or never started."""
    started = (trial.get("agent_execution") or {}).get("started_at")
    first = first_loads.get(target_skill) if target_skill else None
    return round(first["ts"] - epoch(started), 1) if first and started else None


def calls_before_first_target_load(first_loads: dict[str, dict], target_skill: str | None) -> int | None:
    """Tool calls before the attempt's first load of its target skill, the same event `first_target_load_seconds` times; null for an attempt with no
    target or one that never loaded it."""
    first = first_loads.get(target_skill) if target_skill else None
    return first["calls_before"] if first else None


def ledger_row(scenario: str, host: str, profile: str, rep: int, image: dict, arm: dict, started: str, exit_code: int, job_dir: Path,
               target_skill: str | None = None) -> dict:
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
        **attempt_end(trial, job_dir, host),
        "verifier_reward": rewards.get("reward"),
        "skills_loaded": detected["loaded"],
        "load_evidence": detected["evidence"],
        "audit_loads": detected["audit_loads"],
        "workspace_skill_reads": detected["workspace_skill_reads"],
        "failed_skill_lookups": detected["failed_lookups"],
        "audit_disagreements": detected["disagreements"],
        "skill_files_scanned": detected["scanned"],
        **first_load_fields(trial, detected["first_load"]),
        "first_target_load_seconds": first_target_load_seconds(trial, detected["first_loads"], target_skill),
        "calls_before_first_target_load": calls_before_first_target_load(detected["first_loads"], target_skill),
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


# A try that is not an attempt is retried at most this many times, each in a fresh job directory: a launch failure (no trial result: the container never
# started the agent) or a capacity end (the gateway's upstream provider cut the agent off, `end_reason: capacity`). The two share the budget.
# Basis: GR2 amendment 1 allowed three retries for connection failures; orchestrator decision O-14 extends it to upstream capacity ends, which say
# nothing about the skill and could penalise whichever arm sends more requests.
RETRIES = 3


def attempt_name(cell: tuple, attempt_no: int = 1) -> str:
    """Name of an attempt's job, task and log; a retry gets its own directory."""
    scenario, host, profile, rep = cell
    base = f"{scenario}-{host}-{profile}-{rep}"
    return base if attempt_no == 1 else f"{base}-a{attempt_no}"


def is_launch_failure(row: dict) -> bool:
    return row.get("harbor") is None and row.get("cli_version") is None and "status" not in row and "skipped" not in row


def is_capacity_end(row: dict) -> bool:
    return row.get("end_reason") == "capacity" and "status" not in row and "skipped" not in row


def is_retried(row: dict) -> bool:
    """A row that is not an attempt: its cell runs again in a fresh job directory while retries remain. It keeps its row and `attempt_no`."""
    return is_launch_failure(row) or is_capacity_end(row)


def next_attempt(rows: list[dict]) -> int | None:
    """The attempt number a cell runs next given its ledger rows, or None when the cell is finished: it has a row that is an attempt (a `skipped` row
    included), or it used up its retries."""
    if any(not is_retried(row) for row in rows):
        return None
    number = max((row.get("attempt_no", 1) for row in rows), default=0) + 1
    return number if number <= RETRIES + 1 else None


async def run_with_retries(run_once, first: int, halted=lambda: False) -> tuple[dict, bool]:
    """Run attempts of one cell from number `first`; `run_once(number)` returns its ledger row and whether the cohort must stop.

    Only a launch failure or a capacity end is retried, and not once `halted()` says the host is stopped. Every try keeps its row in the ledger.
    """
    number = first
    while True:
        row, stop = await run_once(number)
        if stop or not is_retried(row) or number > RETRIES or halted():
            return row, stop
        number += 1


def finish_attempt(cell: tuple, image: dict, arm: dict, started: str, exit_code: int, out: Path, secrets: list[Secret], ledger: Path, seconds: float | None = None,
                   extra: dict | None = None, attempt_no: int = 1, known: frozenset[tuple[str, str]] = frozenset()) -> bool:
    """Scan the attempt's receipts, append its ledger row, and return True when the cohort must stop.

    The container is already removed and its files are in `jobs/<name>`. A hit quarantines the attempt's
    receipts and ledgers `status: quarantined` with the hit count and label or pattern names, never matched
    text; the row carries no verdict or cost, because a leaked attempt is not scored.
    """
    scenario, host, profile, rep = cell
    name = attempt_name(cell, attempt_no)
    receipts = [out / "jobs" / name, out / "logs" / f"{name}.log", out / "tasks" / name]
    scans = [scan_receipt(path, secrets, out / "quarantine", known) for path in receipts if path.exists()]
    hits = [hit for found, _ in scans for hit in found]
    echoes = [hit for _, found in scans for hit in found]
    if hits:
        row = {"scenario": scenario, "profile": profile, "host": host, "rep": rep, "status": "quarantined", "attempt_no": attempt_no,
               "hits": len(hits), "hit_names": sorted({hit.name for hit in hits}), "ended": now()}
    else:
        row = ledger_row(scenario, host, profile, rep, image, arm, started, exit_code, out / "jobs" / name, (extra or {}).get("target_skill"))
        row["attempt_no"] = attempt_no
        row["seconds_total"] = None if seconds is None else round(seconds, 1)
        if echoes:  # credential-shaped text that was in an input the agent read, not a leak
            row["scrub_input_echo"] = dict(sorted(Counter(hit.name for hit in echoes).items()))
        row.update(extra or {})
    with ledger.open("a") as f:
        f.write(json.dumps(row) + "\n")
    return bool(hits)


async def attempt(cell: tuple, attempt_no: int, args, images: dict, arms: dict, keys: dict[str, str]) -> tuple[str, int, float]:
    """Run one attempt through Harbor; returns (started, harbor exit code, wall seconds)."""
    scenario, host, profile, rep = cell
    name = attempt_name(cell, attempt_no)
    jobs = args.out / "jobs"
    if (jobs / name).exists():
        raise SystemExit(f"attempt directory exists, not reused: {jobs / name}")
    image, arm = images[host], arms[f"{host}-{profile}"]
    skill_file = f"/root/{SKILL_DIRS[host][0]}/dev-fix/SKILL.md"
    unit = args.units[scenario]
    template = unit.template
    own_image = scenario_tag(template, host) if (template / "environment" / "Dockerfile").exists() else None
    caps = limits(args, unit)
    task = write_task(template, image, args.out / "tasks" / name, {"skill_file": skill_file, **unit.subs}, own_image, caps["agent_timeout_sec"])
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "USER") if k in os.environ}
    env.update(HARBOR_TELEMETRY="0", PYTHONPATH=str(EVALS_DIR.parent), SQ_ARM_TARBALL=arm["tarball"], SQ_ARM_SHA256=arm["arm_sha256"],
               SQ_AGENT_TIMEOUT_SEC=str(int(caps["agent_timeout_sec"])))
    if host in GATEWAY_HOSTS:  # the agent reads the gateway address at run time
        env.update({URL_ENV: gateway_url(), NO_PROXY_ENV: no_proxy()})
    if HOST_KEY.get(host) in keys:
        env[HOST_KEY[host]] = keys[HOST_KEY[host]]
    cmd = [
        "uv", "run", "--frozen", "--project", str(EVALS_DIR), "harbor", "run",
        "-p", str(task), "-a", HOSTS[host]["agent"], "-m", HOSTS[host]["model"],
        "-o", str(jobs), "--job-name", name, "-n", "1", "-y", "-q",
        "--override-cpus", str(caps["cpus"]), "--override-memory-mb", str(caps["memory_mb"]),
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


COHORT_FILE = "cohort.json"


def probe_hosts(hosts: list[str], images: dict, keys: dict[str, str]) -> dict[str, dict]:
    """The served-model record of each host (`evals/served.py`), read with the host's own model id and key; a host with no key reads none."""
    found = {}
    for host in hosts:
        if HOST_KEY[host] not in keys:
            found[host] = {**{field: None for field in SERVED_FIELDS}, "reason": f"no {HOST_KEY[host]} on stdin"}
        elif host in GATEWAY_HOSTS:
            found[host] = probe_gateway(host, gateway_url(), HOSTS[host]["model"], keys[HOST_KEY[host]])
        else:
            found[host] = probe_droid(images[host]["image_id"], HOSTS[host]["model"], keys[HOST_KEY[host]])
    return found


def cohort_metadata(prior: dict, prereg: str | None, hosts: list[str], start: dict[str, dict], end: dict[str, dict] | None) -> dict:
    """What `cohort.json` holds: the cohort's start and end times and, per host, the served model at each end and whether the host is poolable.

    `end` is None while the cohort runs; a host whose end is not read yet is judged on its start alone and its verdict is replaced at the end.
    """
    served = {}
    for host in hosts:
        last = end[host] if end else None
        verdict = compare_served(host, start[host], last) if end else {"poolable": None, "why": "the cohort has not ended"}
        served[host] = {"start": start[host], "end": last, **verdict}
    return {"prereg": prereg, "started": prior.get("started") or now(), "ended": now() if end else None, "served_model": served}


def write_cohort(args, metadata: dict) -> None:
    (args.out / COHORT_FILE).write_text(json.dumps(metadata, indent=1) + "\n")


def row_extra(args) -> dict:
    """Run-level ledger fields: the parallelism, and a purpose label (`timing-probe` rows stay out of outcome analysis)."""
    extra = {"concurrency": args.concurrency}
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

    def charge(self, reading: int | None) -> None:
        """Spend of an attempt that is retried: it holds no slot of its own, but its tokens are spent."""
        self.spent += int(reading or self.reserve)

    def settle(self, reading: int | None, ran: bool = True) -> None:
        """One admitted attempt is over. `ran` is False when it failed before the model did anything: it spent nothing."""
        self.pending -= 1
        self.spent += int(reading or (self.reserve if ran else 0))


# Basis (preregistration section 8, rules 3 and 4): two setup failures with one exception on a host separated a deterministic arm-extraction fault
# from a one-off (12 attempts failed identically in about 18 s each); three attempts in a row ending at the agent cap or in one agent-end exception
# wasted ten minutes of a slot each (all three opencode attempts that reached the agent ended in the 600 s cap).
SETUP_FAILURES_TO_STOP = 2
AGENT_ENDS_TO_STOP = 3


class HostStops:
    """Per-host stop rules over consecutive attempts, in the order the attempts finish; the ledger's `exception` field is the exception type.

    Setup: `SETUP_FAILURES_TO_STOP` rows in a row with an exception and no agent time, the same exception. Agent end: `AGENT_ENDS_TO_STOP` rows in a
    row that reached the agent and ended at the agent cap (`end_reason: timeout`), at the provider's capacity limit (`end_reason: capacity`) or in the same exception. Any other row of the host, a launch
    failure aside, breaks both streaks. A stopped host stays stopped; `reasons` maps it to why.
    """

    def __init__(self) -> None:
        self.setup: dict[str, tuple[str | None, int]] = {}
        self.agent: dict[str, tuple[str | None, int]] = {}
        self.reasons: dict[str, str] = {}

    def observe(self, host: str, row: dict) -> None:
        if "status" in row or "skipped" in row or is_launch_failure(row):
            return
        started = row.get("seconds_agent") is not None
        exception = row.get("exception")
        setup_key = exception if exception and not started else None
        agent_key = {"timeout": "agent cap", "capacity": "upstream capacity"}.get(row.get("end_reason") or "", exception) if started else None
        self._count(self.setup, host, setup_key, SETUP_FAILURES_TO_STOP, "setup failures")
        self._count(self.agent, host, agent_key, AGENT_ENDS_TO_STOP, "attempts ending the same way")

    def _count(self, table: dict, host: str, key: str | None, need: int, what: str) -> None:
        if key is None:
            table.pop(host, None)
            return
        previous, count = table.get(host, (None, 0))
        count = count + 1 if previous == key else 1
        table[host] = (key, count)
        if count >= need and host not in self.reasons:
            self.reasons[host] = f"host stop: {count} consecutive {what} on {host} ({key})"

    def stopped(self, host: str) -> bool:
        return host in self.reasons


async def run_order(groups: list[list], run_cell, concurrency: int, admit=None, abandon=None, halted=None) -> bool:
    """Run groups with bounded concurrency, the arms of a group one after another; `run_cell(cell)` returns True to quarantine-stop the cohort.

    Two stops, two rules. A quarantine launches nothing further, not even the remaining arms of a group that has started: a leak may come
    from how something is passed, so every further attempt could repeat it. `abandon(cells)` records those arms, which leaves their group
    incomplete. A spend stop is `admit(group)` refusing a group (it records the refusal itself); started groups are not affected and finish.
    A host stop (`halted(host)`, from `HostStops`) is the quarantine rule limited to that host: its started groups launch no further arm and are
    abandoned incomplete, other hosts go on; a new group of a stopped host is refused by `admit`.
    """
    sem = asyncio.Semaphore(concurrency)
    stopped = False

    async def one(group):
        nonlocal stopped
        async with sem:
            if stopped or (admit and not admit(group)):
                return
            for index, cell in enumerate(group):
                if stopped or (halted and halted(cell[1])):
                    if abandon:
                        abandon(group[index:])
                    return
                if await run_cell(cell):
                    stopped = True
            return

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
    hosts = args.hosts.split(",")
    cohort_file = args.out / COHORT_FILE
    prior = json.loads(cohort_file.read_text()) if cohort_file.exists() else {}
    # A resumed cohort keeps the start it first read; only a start that read no model is read again.
    kept = {host: found["start"] for host, found in prior.get("served_model", {}).items() if served_identity(found["start"]) is not None}
    args.served_start = {**await asyncio.to_thread(probe_hosts, [h for h in hosts if h not in kept], images, keys), **kept}
    unnamed = [h for h in hosts if HOST_KEY[h] in keys and h in GATEWAY_HOSTS and served_identity(args.served_start[h]) is None]
    if unnamed:  # gate 3 of the preregistration: a gateway host whose served model is not known does not start
        sys.exit("; ".join(f"served-model probe of {h} named no model: {args.served_start[h].get('reason')}" for h in unnamed))
    write_cohort(args, cohort_metadata(prior, args.prereg, hosts, args.served_start, None))
    known = load_known(args.input_fingerprints) if args.input_fingerprints else frozenset()
    history: dict[tuple, list[dict]] = {}
    for row in map(json.loads, ledger.read_text().splitlines() if ledger.exists() else []):
        history.setdefault((row["scenario"], row["host"], row["profile"], row["rep"]), []).append(row)
    everything = plan(sorted(args.units), args.hosts.split(","), args.profiles.split(","), args.seed, args.reps)
    (args.out / "order.json").write_text(json.dumps(everything) + "\n")
    first_attempt = {tuple(c): next_attempt(history.get(tuple(c), [])) for group in everything for c in group}
    order = [left for left in ([c for c in group if first_attempt[tuple(c)]] for group in everything) if left]
    gates = {host: SpendGate(cap, reserve) for host, (cap, reserve) in args.spend.items()}
    stops = HostStops()

    def skip(cell, why: str, **more) -> None:
        scenario, host, profile, rep = cell
        with ledger.open("a") as f:
            f.write(json.dumps({"scenario": scenario, "profile": profile, "host": host, "rep": rep, "skipped": why, **args.units[scenario].fields, **more}) + "\n")

    def admit(group) -> bool:
        if stops.stopped(group[0][1]):
            for cell in group:
                skip(cell, stops.reasons[group[0][1]])
            return False
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

        async def run_once(number: int) -> tuple[dict, bool]:
            started, code, seconds = await attempt(cell, number, args, images, arms, keys)
            stop = finish_attempt(cell, images[host], arms[f"{host}-{profile}"], started, code, args.out, injected_secrets(keys), ledger, seconds,
                                  {**row_extra(args), **limits(args, args.units[scenario]), **args.units[scenario].fields,
                                            "served_model": ledger_value(args.served_start[host])}, number, known)
            row = json.loads(ledger.read_text().splitlines()[-1])
            stops.observe(host, row)  # every try counts toward the host stop rules, retried ones too
            if host in gates and is_capacity_end(row):
                gates[host].charge(spend_reading(host, row))
            return row, stop

        last, stop = await run_with_retries(run_once, first_attempt[tuple(cell)], lambda: stops.stopped(host))
        capacity_end = is_capacity_end(last)
        if capacity_end and not stop:  # retries used up, or the host stopped: BLOCKED in the denominator, the capacity rows stay as the record
            skip(cell, f"upstream capacity ended {last['attempt_no']} tries" + (f"; {stops.reasons[host]}" if stops.stopped(host) else ""), attempts=last["attempt_no"])
        if host in gates:
            # An attempt that failed before the agent started spent nothing; any other without a reading is charged the reserve. A capacity end was charged above.
            gates[host].settle(None if capacity_end else spend_reading(host, last), ran=not capacity_end and last.get("seconds_agent") is not None)
        return stop

    def abandon(cells) -> None:
        for cell in cells:
            skip(cell, stops.reasons.get(cell[1], "quarantine stop: group incomplete"), group_incomplete=True)
            if cell[1] in gates:
                gates[cell[1]].settle(0, ran=False)

    stopped = await run_order(order, run_cell, args.concurrency, admit, abandon, stops.stopped)
    ended = await asyncio.to_thread(probe_hosts, hosts, images, keys)
    metadata = cohort_metadata(prior, args.prereg, hosts, args.served_start, ended)
    write_cohort(args, metadata)
    for host, found in metadata["served_model"].items():
        if not found["poolable"]:
            print(f"{host}: not poolable: {found['why']}", file=sys.stderr)
    if stopped:
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
    ap.add_argument("--cpus", type=int, help="CPU cap per attempt container; default: what each task declares")
    ap.add_argument("--memory-mb", type=int, help="memory cap per attempt container; default: what each task declares")
    ap.add_argument("--agent-timeout-sec", type=int, help="agent time limit; default: what each task declares")
    ap.add_argument("--input-fingerprints", type=Path, help="frozen list of known input strings (`python -m evals.scrub --fingerprint`): a pattern hit on it is logged as an input echo, not a leak")
    ap.add_argument("--purpose", help="ledger label, e.g. timing-probe or capacity-ramp: such rows are never outcome data")
    parsed = ap.parse_args()
    if not (parsed.scenario or parsed.queries):
        ap.error("give --scenario or --queries")
    asyncio.run(main(parsed))
