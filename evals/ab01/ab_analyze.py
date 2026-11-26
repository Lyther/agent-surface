"""ab01 analysis: paired A/B of the `none` and `full` arms on one cohort ledger, fixed before any outcome was seen.

Primary: pass rate (verifier reward 1) per arm and the paired difference full - none, with the exact McNemar test on the
(task, rep) pairs and a 95% bootstrap interval that resamples tasks (each task's reps stay together).
Secondary, each as per-arm mean and median plus the paired mean difference with the same bootstrap: Factory credits,
prompt and output tokens, model requests (turns), agent and total seconds; skill loads in the `full` arm; end reasons.

A cell's outcome is its last row that is an attempt (`evals.cohort.is_retried` rows are tries, not outcomes). A pair counts
only when both arms have an outcome; a missing reward (no verifier result) is a failure and is counted apart.

Usage: python ab_analyze.py LEDGER.jsonl [--purpose LABEL] [--resamples 10000] [--seed 20261126] [--json OUT]
"""

import argparse
import json
import math
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ARMS = ("none", "full")
METRICS = ("factory_credits", "tokens_in", "tokens_out", "model_requests", "seconds_agent", "seconds_total")


def retried(row: dict) -> bool:
    launch = row.get("harbor") is None and row.get("cli_version") is None and "status" not in row and "skipped" not in row
    capacity = row.get("end_reason") == "capacity" and "status" not in row and "skipped" not in row
    return launch or capacity


def outcomes(rows: list[dict], purpose: str | None) -> dict[tuple, dict]:
    cells: dict[tuple, dict] = {}
    for row in rows:
        if row.get("purpose") != purpose or "skipped" in row or "status" in row or retried(row):
            continue
        cells[(row["scenario"], row["rep"], row["profile"])] = row  # the last attempt row of the cell wins
    return cells


def passed(row: dict) -> int:
    return int(row.get("verifier_reward") == 1)


def mcnemar_exact(b: int, c: int) -> float:
    n = b + c
    if n == 0:
        return 1.0
    tail = sum(math.comb(n, i) for i in range(min(b, c) + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def cluster_bootstrap(per_task: dict[str, list[float]], resamples: int, rng: random.Random) -> tuple[float, float] | None:
    """95% percentile interval of the mean paired difference, resampling tasks with replacement."""
    tasks = sorted(per_task)
    if not tasks:
        return None
    means = []
    for _ in range(resamples):
        values = [v for t in (rng.choice(tasks) for _ in tasks) for v in per_task[t]]
        means.append(sum(values) / len(values))
    means.sort()
    return means[int(0.025 * resamples)], means[int(0.975 * resamples) - 1]


def summary(values: list[float]) -> dict:
    return {"n": len(values), "mean": round(statistics.fmean(values), 2) if values else None,
            "median": round(statistics.median(values), 2) if values else None}


BENCHMARKS = ("terminal-bench", "swebenchpro")  # the task directories' parents, which prefix each scenario name


def benchmark(scenario: str) -> str:
    return next((b for b in BENCHMARKS if scenario.startswith(b + "-")), "other")


def analyze(rows: list[dict], purpose: str | None, resamples: int, seed: int) -> dict:
    cells = outcomes(rows, purpose)
    pairs = sorted({(s, r) for s, r, _ in cells if all((s, r, arm) in cells for arm in ARMS)})
    rng = random.Random(seed)
    result: dict = {"cells": len(cells), "pairs": len(pairs), "purpose": purpose}

    def block(selected: list[tuple]) -> dict:
        table = Counter((passed(cells[(s, r, "none")]), passed(cells[(s, r, "full")])) for s, r in selected)
        diffs: dict[str, list[float]] = defaultdict(list)
        for s, r in selected:
            diffs[s].append(passed(cells[(s, r, "full")]) - passed(cells[(s, r, "none")]))
        n = len(selected)
        out = {
            "pairs": n,
            "pass_rate": {arm: round(sum(passed(cells[(s, r, arm)]) for s, r in selected) / n, 3) if n else None for arm in ARMS},
            "both_pass": table[(1, 1)], "none_only": table[(1, 0)], "full_only": table[(0, 1)], "both_fail": table[(0, 0)],
            "mcnemar_exact_p": round(mcnemar_exact(table[(1, 0)], table[(0, 1)]), 4),
            "difference_full_minus_none": round(sum(sum(v) for v in diffs.values()) / n, 3) if n else None,
            "difference_ci95": cluster_bootstrap(diffs, resamples, rng),
            "missing_reward": {arm: sum(cells[(s, r, arm)].get("verifier_reward") is None for s, r in selected) for arm in ARMS},
        }
        return out

    result["primary"] = block(pairs)
    result["by_benchmark"] = {bench: block([p for p in pairs if benchmark(p[0]) == bench]) for bench in sorted({benchmark(s) for s, _ in pairs})}

    secondary = {}
    for metric in METRICS:
        per_arm = {arm: [cells[(s, r, arm)][metric] for s, r in pairs if cells[(s, r, arm)].get(metric) is not None] for arm in ARMS}
        diffs: dict[str, list[float]] = defaultdict(list)
        for s, r in pairs:
            a, b = cells[(s, r, "none")].get(metric), cells[(s, r, "full")].get(metric)
            if a is not None and b is not None:
                diffs[s].append(b - a)
        flat = [v for vs in diffs.values() for v in vs]
        secondary[metric] = {**{arm: summary(per_arm[arm]) for arm in ARMS},
                             "paired_mean_difference": round(statistics.fmean(flat), 2) if flat else None,
                             "difference_ci95": cluster_bootstrap(diffs, resamples, rng)}
    result["secondary"] = secondary

    loads = Counter(skill for s, r in pairs for skill in cells[(s, r, "full")].get("skills_loaded") or [])
    result["skills"] = {
        "full_attempts_with_a_load": sum(bool(cells[(s, r, "full")].get("skills_loaded")) for s, r in pairs),
        "none_attempts_with_a_load": sum(bool(cells[(s, r, "none")].get("skills_loaded")) for s, r in pairs),
        "loads_by_skill": dict(loads.most_common()),
    }
    result["end_reasons"] = {arm: dict(Counter(cells[(s, r, arm)].get("end_reason") for s, r in pairs)) for arm in ARMS}
    result["exceptions"] = {arm: dict(Counter(cells[(s, r, arm)].get("exception") for s, r in pairs if cells[(s, r, arm)].get("exception"))) for arm in ARMS}
    result["served_model"] = dict(Counter(row.get("served_model") for row in cells.values()))
    result["per_task"] = {s: {arm: [passed(cells[(s, r, arm)]) for r in sorted({r for t, r in pairs if t == s})] for arm in ARMS} for s in sorted({s for s, _ in pairs})}
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ledger", type=Path)
    ap.add_argument("--purpose")
    ap.add_argument("--resamples", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=20261126)
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()
    rows = [json.loads(line) for line in args.ledger.read_text().splitlines() if line.strip()]
    result = analyze(rows, args.purpose, args.resamples, args.seed)
    text = json.dumps(result, indent=1)
    if args.json:
        args.json.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    sys.exit(main())
