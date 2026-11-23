"""Analyse a cohort's ledgers as preregistration sections 9.1 and 10 specify, from the frozen parameter file and the ledgers and nothing else.

Usage: python -m evals.analyze --params analysis-params.json --ledger LEDGER.jsonl [--ledger ...] [--out result.json]

The parameter file is the machine-readable part of the freeze (README, "Analysis"). The result is one JSON document: per host the denominators per
attempt class, per-cell rates with Wilson intervals, the paired differences and the practical-effect rule with the reading of each contrast, the
paired two-stage bootstrap, the `sq1-o1` per-scenario reading with Newcombe intervals and the load rate, and the labelled sensitivity tables.
Rows are read as the ledger wrote them (`evals/cohort.py`); a row's cohort is its `prereg` field. Exit status 2 means the ledgers do not match
the frozen parameters (an arm hash or the `dev_fix_installed` field), and no table is written.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from statistics import NormalDist

HELD_OUT, DEV = "held-out", "dev"
SHOULD, NEAR = "should-trigger", "near-miss"
# Which attempts each trigger metric is over, and which direction is good (higher recall, lower false triggers and misrouting).
METRIC_CLASS = {"recall": SHOULD, "false_trigger": NEAR, "misrouting": SHOULD}
GOOD = {"recall": 1, "false_trigger": -1, "misrouting": -1, "reward": 1}
POOLED = "pooled"
# Attempt classes of section 9.1 that are in the denominator, and the one that is not.
ATTEMPT_CLASSES = ("completed", "setup_failure", "agent_end_failure", "verifier_failure", "skipped", "group_incomplete", "quarantined")
# A disagreement the audit cannot avoid (`evals/detect.py`): it cannot see a skill-tool load, and a catalogue rescan is reported as one entry.
EXPECTED_DISAGREEMENT = "audit cannot see a load by"
COST_FIELDS = ("tokens_in", "tokens_cache", "tokens_out", "model_requests", "factory_credits", "seconds_setup", "seconds_agent", "seconds_verifier", "seconds_total")


class AnalysisError(Exception):
    """The ledgers and the frozen parameters disagree."""


@dataclass(frozen=True)
class Params:
    prereg: str
    hosts: tuple[str, ...]
    queries_sha256: str
    arms: dict
    seed: int
    resamples: int
    confidence: Fraction
    practical: Fraction
    better: tuple[int, int]
    pool_dev: bool
    trigger: dict
    outcome: dict


def load_params(path: Path) -> Params:
    raw = json.loads(path.read_text())
    try:
        params = Params(
            prereg=raw["prereg"], hosts=tuple(raw["hosts"]), queries_sha256=raw["queries_sha256"], arms=raw["arms"], seed=int(raw["seeds"]["bootstrap"]),
            resamples=int(raw["interval"]["resamples"]), confidence=Fraction(str(raw["interval"]["confidence"])),
            practical=Fraction(str(raw["thresholds"]["practical_difference"])),
            better=(int(raw["thresholds"]["better_numerator"]), int(raw["thresholds"]["better_denominator"])),
            pool_dev=bool(raw["pool_dev_queries"]), trigger=raw["trigger"], outcome=raw["outcome"],
        )
    except (KeyError, TypeError, ValueError) as err:
        raise AnalysisError(f"{path}: missing or malformed parameter ({type(err).__name__}: {err})") from err
    for section, keys in (("trigger", ("cohort", "skills", "contrasts")), ("outcome", ("cohort", "with", "without", "asset", "scenarios", "merged"))):
        missing = [k for k in keys if k not in raw[section]]
        if missing:
            raise AnalysisError(f"{path}: {section} lacks {missing}")
    stray = (set(params.trigger["skills"]) | set(params.outcome["scenarios"])) - set(params.hosts)
    if stray:
        raise AnalysisError(f"{path}: hosts {sorted(stray)} are not in `hosts`")
    return params


def read_ledgers(paths: list[Path]) -> list[dict]:
    return [json.loads(line) for path in paths for line in path.read_text().splitlines() if line.strip()]


def arm_entry(p: Params, row: dict) -> dict:
    return p.arms.get(f"{row['host']}-{row['profile']}") or {}


def check_rows(rows: list[dict], p: Params) -> None:
    """Rows that ran carry the arm hash the freeze names, and the outcome rows say the asset is installed exactly in the arm that has it."""
    problems = []
    for row in rows:
        entry = arm_entry(p, row)
        if "arm_sha256" in row and row["arm_sha256"] != entry.get("arm_sha256"):
            problems.append(f"{row['host']}-{row['profile']}: arm_sha256 differs from the frozen one")
        if "desc_arm" in row and row["desc_arm"] != entry.get("desc_arm"):
            problems.append(f"{row['host']}-{row['profile']}: desc_arm differs from the frozen one")
        if row.get("prereg") == p.outcome["cohort"] and "dev_fix_installed" in row and row["dev_fix_installed"] != (row["profile"] == p.outcome["with"]):
            problems.append(f"{row['host']}-{row['profile']}: dev_fix_installed does not match the arm")
    if problems:
        raise AnalysisError("; ".join(f"{text} ({count} rows)" for text, count in sorted(Counter(problems).items())))


# ---- attempt classes (section 9.1) ----
# Not attempts: a launch failure and a capacity end (O-14). Both are retried in a fresh job directory; a cell still capacity-ended after its retries has a `skipped` row.

def is_launch_failure(row: dict) -> bool:
    return row.get("harbor") is None and row.get("cli_version") is None and "status" not in row and "skipped" not in row


def is_capacity_end(row: dict) -> bool:
    """An attempt the host's upstream provider cut off (`end_reason: capacity`); like a launch failure it is not an attempt."""
    return row.get("end_reason") == "capacity" and "status" not in row and "skipped" not in row


def attempt_class(row: dict, graded: bool) -> str:
    """The class of a row from ledger fields only. `graded` is true for cohorts that have a verifier."""
    if row.get("status") == "quarantined":
        return "quarantined"
    if "skipped" in row:
        return "group_incomplete" if row.get("group_incomplete") else "skipped"
    if row.get("exception"):
        return "agent_end_failure" if row.get("seconds_agent") is not None else "setup_failure"
    if graded and row.get("seconds_agent") is not None and row.get("verifier_reward") is None:
        return "verifier_failure"
    return "completed"


def attempts(rows: list[dict]) -> list[dict]:
    """Rows that are attempts: a launch failure and a capacity end are not. A capacity end's loads and reward are never read."""
    return [row for row in rows if not is_launch_failure(row) and not is_capacity_end(row)]


def denominators(rows: list[dict], graded: bool, arm_of, split_of=None) -> list[dict]:
    """Per host, arm (and split): the count of each attempt class, the denominator, the capacity-ended tries, and the cells with no attempt at all:
    `launch_failure_cells` (every try a launch failure) and `capacity_cells` (every try a launch failure or capacity end, at least one the latter)."""
    table: dict[tuple, Counter] = defaultdict(Counter)
    cells: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        cells[(row["scenario"], row["host"], row["profile"], row["rep"])].append(row)
    for tries in cells.values():
        first = tries[0]
        counts = table[(first["host"], arm_of(first), split_of(first) if split_of else None)]
        for row in tries:
            if is_capacity_end(row):
                counts["capacity_tries"] += 1
            elif not is_launch_failure(row):
                counts[attempt_class(row, graded)] += 1
        if all(is_launch_failure(r) for r in tries):
            counts["launch_failure_cells"] += 1
        elif all(is_launch_failure(r) or is_capacity_end(r) for r in tries):
            counts["capacity_cells"] += 1
    out = []
    for (host, arm, split), counts in sorted(table.items(), key=lambda item: tuple(str(x) for x in item[0])):
        entry = {"host": host, "arm": arm, **({"split": split} if split_of else {}), **{c: counts[c] for c in ATTEMPT_CLASSES}}
        entry["denominator"] = sum(counts[c] for c in ATTEMPT_CLASSES)
        for extra in ("capacity_tries", "launch_failure_cells", "capacity_cells"):
            entry[extra] = counts[extra]
        out.append(entry)
    return out


# ---- intervals ----

def z_value(confidence: Fraction) -> float:
    return NormalDist().inv_cdf(1 - (1 - float(confidence)) / 2)


def wilson(x: int, n: int, z: float) -> tuple[float, float] | None:
    if n == 0:
        return None
    p = x / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centre - half, centre + half


def newcombe(x1: int, n1: int, x2: int, n2: int, z: float) -> tuple[float, float] | None:
    """Newcombe's hybrid-score interval for p1 - p2 from two Wilson intervals (method 10)."""
    if n1 == 0 or n2 == 0:
        return None
    p1, p2 = x1 / n1, x2 / n2
    (l1, u1), (l2, u2) = wilson(x1, n1, z), wilson(x2, n2, z)
    return p1 - p2 - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), p1 - p2 + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)


def percentile(sorted_values: list[float], q: float) -> float:
    """Linear interpolation between the order statistics at position (n - 1) q."""
    position = (len(sorted_values) - 1) * q
    low = math.floor(position)
    high = min(low + 1, len(sorted_values) - 1)
    return sorted_values[low] + (sorted_values[high] - sorted_values[low]) * (position - low)


def bootstrap(pairs: list[tuple[list[int], list[int]]], seed: str, resamples: int, confidence: Fraction) -> dict | None:
    """Paired cluster bootstrap of the mean over queries of (arm X rate - arm Y rate); `pairs` is one (X reps, Y reps) per query, reps 0 or 1.

    Stage 1 draws queries with replacement, jointly across the arms. Stage 2 draws, for each drawn query and each arm on its own, as many
    repetitions as it has with replacement. A draw of k repetitions of 0/1 values with s ones is Binomial(k, s/k), so it is drawn as one.
    Both statistics come from the same stage-1 draws; the interval is the (1 - c)/2 and 1 - (1 - c)/2 percentiles.
    """
    if not pairs:
        return None
    rng = random.Random(seed)
    n = len(pairs)
    diffs = [sum(x) / len(x) - sum(y) / len(y) for x, y in pairs]
    one, two = [], []
    for _ in range(resamples):
        drawn = [rng.randrange(n) for _ in range(n)]
        one.append(sum(diffs[i] for i in drawn) / n)
        total = 0.0
        for i in drawn:
            x, y = pairs[i]
            total += rng.binomialvariate(len(x), sum(x) / len(x)) / len(x) - rng.binomialvariate(len(y), sum(y) / len(y)) / len(y)
        two.append(total / n)
    alpha = (1 - float(confidence)) / 2
    out = {}
    for name, values in (("stage1_and_2", two), ("stage1_only", one)):
        values.sort()
        out[name] = [round(percentile(values, alpha), 6), round(percentile(values, 1 - alpha), 6)]
    return out


# ---- the practical-effect rule (section 10.2) ----

def need_better(n: int, p: Params) -> int:
    """ceil(2n/3), with the fraction from the parameters."""
    return -(-p.better[0] * n // p.better[1])


def classify(metric: str, mean_diff: Fraction, better: int, worse: int, n: int, p: Params) -> str:
    good = GOOD[metric] * mean_diff
    need = need_better(n, p)
    if n and good >= p.practical and better >= need:
        return "gain"
    if n and -good >= p.practical and worse >= need:
        return "harm"
    return "criterion not met"


def read_contrast(classes: dict[str, str], candidate: str) -> str:
    """Section 10.2's reading of a contrast of `candidate` over a base from the three metrics' classes."""
    gains = [m for m, c in classes.items() if c == "gain"]
    harms = [m for m, c in classes.items() if c == "harm"]
    if gains and harms:
        return "mixed"
    if harms:
        return f"{candidate} worse"
    if "recall" in gains:
        return f"{candidate} better"
    return "not detected"


def rate(value: Fraction | None) -> float | None:
    return None if value is None else round(float(value), 6)


def unit_means(units: dict[str, list[int]]) -> dict[str, Fraction]:
    return {key: Fraction(sum(reps), len(reps)) for key, reps in units.items() if reps}


def paired(metric: str, x_units: dict, y_units: dict, p: Params, seed: str) -> dict:
    """X minus Y over the units both arms have: counts, mean difference, the rule's class and the intervals."""
    keys = sorted(k for k in x_units if k in y_units and x_units[k] and y_units[k])
    xm, ym = unit_means(x_units), unit_means(y_units)
    diffs = [xm[k] - ym[k] for k in keys]
    better = sum(1 for d in diffs if GOOD[metric] * d > 0)
    worse = sum(1 for d in diffs if GOOD[metric] * d < 0)
    mean = sum(diffs, Fraction(0)) / len(diffs) if diffs else None
    return {
        "units": len(keys), "better": better, "tied": len(keys) - better - worse, "worse": worse,
        "successes_x": sum(sum(x_units[k]) for k in keys), "attempts_x": sum(len(x_units[k]) for k in keys),
        "successes_y": sum(sum(y_units[k]) for k in keys), "attempts_y": sum(len(y_units[k]) for k in keys),
        "mean_difference": rate(mean),
        "class": classify(metric, mean, better, worse, len(keys), p) if mean is not None else "criterion not met",
        "interval": bootstrap([(x_units[k], y_units[k]) for k in keys], seed, p.resamples, p.confidence),
    }


# ---- trigger cohort ----

def trigger_metrics(row: dict, installed: set[str]) -> dict[str, int]:
    """One attempt's trigger metrics. A row that never ran has loaded nothing."""
    loaded = set(row.get("skills_loaded") or [])
    skill = row["target_skill"]
    other_installed = (loaded & installed) - {skill}
    return {"recall": int(skill in loaded), "false_trigger": int(skill in loaded),
            "misrouting": int(bool(other_installed) and skill not in loaded), "host_added": int(bool(loaded - installed))}


def trigger_units(rows: list[dict], p: Params) -> dict:
    """metric -> arm -> (skill, query id) -> repetitions' values, for one host's rows, in ledger order."""
    units: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for row in attempts(rows):
        arm = arm_entry(p, row)
        values = trigger_metrics(row, set(arm.get("skills", [])))
        key = (row["target_skill"], row["query_id"])
        for metric in ("recall", "false_trigger", "misrouting", "host_added"):
            wanted = SHOULD if metric == "host_added" else METRIC_CLASS[metric]
            if row["query_class"] == wanted:
                units[metric][arm["desc_arm"]][key].append(values[metric])
    return units


def select(units: dict, skill: str) -> dict:
    return {k: v for k, v in units.items() if skill == POOLED or k[0] == skill}


def cell_of(x: int, n: int, z: float) -> dict:
    interval = wilson(x, n, z)
    return {"rate": rate(Fraction(x, n)) if n else None, "wilson": None if interval is None else [round(b, 6) for b in interval]}


def cell(units: dict, z: float) -> dict:
    x, n = sum(sum(v) for v in units.values()), sum(len(v) for v in units.values())
    return {"successes": x, "attempts": n, **cell_of(x, n, z)}


def skill_cells(units: dict, skill: str, arms: list[str], z: float) -> tuple[list[dict], list[dict]]:
    """Per arm, the Wilson cell of each metric and the host-added-loaded column, for one skill (or all of them pooled)."""
    cells, host_added = [], []
    for arm in arms:
        cells += [{"skill": skill, "arm": arm, "metric": m, **cell(select(units[m][arm], skill), z)} for m in METRIC_CLASS]
        host_added.append({"skill": skill, "arm": arm, **cell(select(units["host_added"][arm], skill), z)})
    return cells, host_added


def skill_contrast(units: dict, host: str, skill: str, candidate: str, base: str, p: Params) -> dict:
    found = {m: paired(m, select(units[m][candidate], skill), select(units[m][base], skill), p, f"{p.seed}-{host}-{skill}-{m}-{candidate}-{base}") for m in METRIC_CLASS}
    return {"skill": skill, "candidate": candidate, "base": base, "reading": read_contrast({m: r["class"] for m, r in found.items()}, candidate), **found}


def trigger_host(host: str, rows: list[dict], p: Params) -> dict:
    units = trigger_units(rows, p)
    z = z_value(p.confidence)
    arms = sorted({a["desc_arm"] for a in p.arms.values()})
    cells, host_added, contrasts = [], [], []
    for skill in [*p.trigger["skills"][host], POOLED]:
        found = skill_cells(units, skill, arms, z)
        cells, host_added = cells + found[0], host_added + found[1]
        contrasts += [skill_contrast(units, host, skill, candidate, base, p) for candidate, base in p.trigger["contrasts"]]
    return {"comparisons": len(p.trigger["skills"][host]) * len(METRIC_CLASS) * len(p.trigger["contrasts"]), "cells": cells, "host_added_loaded": host_added,
            "contrasts": contrasts, "misrouting_matrix": misrouting_matrix(rows, p), "first_load": first_load(host, rows, p)}


def misrouting_matrix(rows: list[dict], p: Params) -> list[dict]:
    """For each arm and target skill, how often each other installed skill was the one loaded in a misrouted should-trigger attempt."""
    counts: dict = defaultdict(Counter)
    for row in attempts(rows):
        arm = arm_entry(p, row)
        loaded = set(row.get("skills_loaded") or [])
        if row["query_class"] == SHOULD and trigger_metrics(row, set(arm.get("skills", [])))["misrouting"]:
            for other in sorted((loaded & set(arm["skills"])) - {row["target_skill"]}):
                counts[(arm["desc_arm"], row["target_skill"])][other] += 1
    return [{"arm": a, "target": t, "loaded": dict(sorted(c.items()))} for (a, t), c in sorted(counts.items())]


def trigger_rows(rows: list[dict], p: Params, splits: tuple[str, ...]) -> dict[str, list[dict]]:
    mine = [r for r in rows if r.get("prereg") == p.trigger["cohort"] and r.get("split") in splits]
    return {host: [r for r in mine if r["host"] == host and target_ok(r, host, p)] for host in p.trigger["skills"]}


def target_ok(row: dict, host: str, p: Params) -> bool:
    return row["target_skill"] in p.trigger["skills"][host]


def trigger_report(rows: list[dict], p: Params, splits: tuple[str, ...] = (HELD_OUT,)) -> dict:
    return {host: trigger_host(host, host_rows, p) for host, host_rows in trigger_rows(rows, p, splits).items()}


def median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2


def median_interval(values: list[float], seed: str, p: Params) -> list[float] | None:
    """Percentile bootstrap of the median over the attempts that loaded."""
    if not values:
        return None
    rng = random.Random(seed)
    medians = sorted(median([rng.choice(values) for _ in values]) for _ in range(p.resamples))
    alpha = (1 - float(p.confidence)) / 2
    return [round(percentile(medians, alpha), 6), round(percentile(medians, 1 - alpha), 6)]


def first_load(host: str, rows: list[dict], p: Params) -> list[dict]:
    """Section 10.4: per skill (and pooled) and arm, the median seconds to the first load of the target skill (`first_target_load_seconds`) and the median
    tool calls before the first load of any skill, over should-trigger attempts that loaded.

    Shown with the number that loaded of the attempts, never averaged over the ones that did not (the time is censored).
    """
    out = []
    should = [r for r in attempts(rows) if r["query_class"] == SHOULD]
    for skill in [*p.trigger["skills"][host], POOLED]:
        for arm in sorted({a["desc_arm"] for a in p.arms.values()}):
            group = [r for r in should if arm_entry(p, r).get("desc_arm") == arm and (skill == POOLED or r["target_skill"] == skill)]
            seconds = [r["first_target_load_seconds"] for r in group if r.get("first_target_load_seconds") is not None]
            calls = [r["calls_before_first_load"] for r in group if r.get("calls_before_first_load") is not None]
            out.append({"skill": skill, "arm": arm, "attempts": len(group), "loaded": len(seconds), "median_seconds": median(seconds) if seconds else None,
                        "interval_seconds": median_interval(seconds, f"{p.seed}-{host}-{skill}-{arm}-first-load", p), "median_calls": median(calls) if calls else None})
    return out


# ---- outcome cohort (section 10.3) ----

def reward(row: dict) -> int:
    """The verifier's reward; a row with none (skipped, quarantined, verifier failure, agent end without a verdict) counts 0."""
    return int(row.get("verifier_reward") or 0)


def outcome_units(rows: list[dict], host: str, p: Params) -> dict[str, dict[str, list[int]]]:
    """arm role (`with`, `without`) -> scenario -> reward per repetition."""
    units: dict = {"with": defaultdict(list), "without": defaultdict(list)}
    for row in attempts(rows):
        for role in ("with", "without"):
            if row["profile"] == p.outcome[role] and row["scenario"] in p.outcome["scenarios"][host]:
                units[role][row["scenario"]].append(reward(row))
    return units


def outcome_read(p: Params, unit_diffs: list[tuple[str, Fraction]]) -> dict:
    """The practical rule on per-unit differences (with minus without)."""
    diffs = [d for _, d in unit_diffs]
    better, worse = sum(1 for d in diffs if d > 0), sum(1 for d in diffs if d < 0)
    mean = sum(diffs, Fraction(0)) / len(diffs) if diffs else None
    return {"units": len(diffs), "better": better, "tied": len(diffs) - better - worse, "worse": worse, "needed": need_better(len(diffs), p),
            "mean_difference": rate(mean), "class": classify("reward", mean, better, worse, len(diffs), p) if mean is not None else "criterion not met"}


def merged_units(diffs: dict[str, Fraction], groups: list[list[str]]) -> list[tuple[str, Fraction]]:
    """Scenarios sharing a fix count as one unit, their differences averaged; a group with a scenario missing stays as it is."""
    out, used = [], set()
    for group in groups:
        if all(name in diffs for name in group):
            out.append(("+".join(group), sum((diffs[n] for n in group), Fraction(0)) / len(group)))
            used.update(group)
    return out + [(name, d) for name, d in sorted(diffs.items()) if name not in used]


def asset_loads(rows: list[dict], asset: str) -> int:
    return sum(1 for r in rows if asset in (r.get("skills_loaded") or []))


def scenario_entry(name: str, rows: list[dict], units: dict, p: Params, z: float) -> dict:
    """One scenario: the reward counts of both arms, the Newcombe interval of their difference and the asset's load rate in the with-asset arm."""
    a, b = units["with"].get(name, []), units["without"].get(name, [])
    loads = asset_loads([r for r in attempts(rows) if r["scenario"] == name and r["profile"] == p.outcome["with"]], p.outcome["asset"])
    entry = {"scenario": name, "with": {"successes": sum(a), "attempts": len(a)}, "without": {"successes": sum(b), "attempts": len(b)}, "load_attempts": loads}
    if a and b:
        interval = newcombe(sum(a), len(a), sum(b), len(b), z)
        entry |= {"difference": rate(Fraction(sum(a), len(a)) - Fraction(sum(b), len(b))), "newcombe": [round(v, 6) for v in interval], "load_rate": rate(Fraction(loads, len(a)))}
    return entry


def outcome_host(host: str, rows: list[dict], p: Params) -> dict:
    units = outcome_units(rows, host, p)
    per = [scenario_entry(name, rows, units, p, z_value(p.confidence)) for name in p.outcome["scenarios"][host]]
    diffs = {e["scenario"]: Fraction(e["with"]["successes"], e["with"]["attempts"]) - Fraction(e["without"]["successes"], e["without"]["attempts"]) for e in per if "difference" in e}
    read = outcome_read(p, sorted(diffs.items()))
    with_rows = [r for r in attempts(rows) if r["profile"] == p.outcome["with"] and r["scenario"] in p.outcome["scenarios"][host]]
    loaded = asset_loads(with_rows, p.outcome["asset"])
    return {"per_scenario": per, "share_better": rate(Fraction(read["better"], read["units"])) if read["units"] else None,
            "by_scenario": read, "merged_shared_fix": outcome_read(p, merged_units(diffs, p.outcome["merged"])),
            "load_rate_with": {"attempts_with_asset_loaded": loaded, "attempts": len(with_rows), **cell_of(loaded, len(with_rows), z_value(p.confidence))},
            "unexplained_by_the_skill": read["class"] == "gain" and bool(with_rows) and loaded == 0}


def outcome_report(rows: list[dict], p: Params) -> dict:
    mine = [r for r in rows if r.get("prereg") == p.outcome["cohort"]]
    return {host: outcome_host(host, [r for r in mine if r["host"] == host], p) for host in p.outcome["scenarios"]}


# ---- cost beside the decisions, and sensitivity (section 10.5) ----

def cost(rows: list[dict], arm_of) -> list[dict]:
    """Per host and arm, the mean of each cost field over the attempts that report it, with how many did."""
    grouped: dict = defaultdict(list)
    for row in attempts(rows):
        grouped[(row["host"], arm_of(row))].append(row)
    out = []
    for (host, arm), group in sorted(grouped.items()):
        fields = {}
        for name in COST_FIELDS:
            values = [r[name] for r in group if isinstance(r.get(name), (int, float))]
            fields[name] = {"attempts_reporting": len(values), "mean": round(sum(values) / len(values), 3) if values else None}
        out.append({"host": host, "arm": arm, **fields})
    return out


def unexplained_disagreements(row: dict) -> int:
    return sum(1 for d in row.get("audit_disagreements") or [] if d.get("skill") != "*" and not str(d.get("cause", "")).startswith(EXPECTED_DISAGREEMENT))


def group_of(row: dict) -> tuple:
    return (row["host"], row.get("query_id") or row["scenario"], row["rep"])


def sensitivity_filters(p: Params) -> dict:
    """Section 10.5 (i), (ii) and (iii): each maps the cohort's rows to the rows kept, and `graded` tells which cohort it is for."""
    def without_setup(rows, graded):
        return [r for r in rows if "skipped" in r or r.get("status") == "quarantined" or attempt_class(r, graded) != "setup_failure"]

    def without_disagreements(rows, graded):
        reads = graded  # workspace_skill_reads is excluded for the outcome cohort only
        return [r for r in rows if not unexplained_disagreements(r) and not (reads and r.get("workspace_skill_reads"))]

    def without_touched_groups(rows, graded):
        touched = {group_of(r) for r in rows if "skipped" in r or r.get("status") == "quarantined"}
        return [r for r in rows if group_of(r) not in touched]

    return {"i_without_setup_failures": without_setup, "ii_without_workspace_reads_and_unexplained_disagreements": without_disagreements,
            "iii_without_groups_touched_by_skipped_or_quarantined_rows": without_touched_groups}


def sensitivity(rows: list[dict], p: Params) -> dict:
    """Labelled sensitivity tables; none replaces the primary. (iv) is the `stage1_only` interval of every primary comparison; (vi) is the per-host layout."""
    trigger_all = [r for r in rows if r.get("prereg") == p.trigger["cohort"]]
    outcome_all = [r for r in rows if r.get("prereg") == p.outcome["cohort"]]
    out = {}
    for name, keep in sensitivity_filters(p).items():
        out[name] = {"trigger": trigger_report(keep(trigger_all, False), p), "outcome": outcome_report(keep(outcome_all, True), p)}
    if p.pool_dev:
        out["v_all_queries_dev_and_held_out"] = {"trigger": trigger_report(trigger_all, p, (DEV, HELD_OUT))}
    return {"label": "sensitivity, exploratory: never replaces the primary", "tables": out}


def trigger_arm(p: Params):
    return lambda row: arm_entry(p, row).get("desc_arm")


def analyse(rows: list[dict], p: Params) -> dict:
    check_rows(rows, p)
    trigger = [r for r in rows if r.get("prereg") == p.trigger["cohort"]]
    outcome = [r for r in rows if r.get("prereg") == p.outcome["cohort"]]
    return {
        "prereg": p.prereg, "queries_sha256": p.queries_sha256,
        "rows": {"trigger": len(trigger), "outcome": len(outcome), "other_cohorts_ignored": len(rows) - len(trigger) - len(outcome)},
        "denominators": {"trigger": denominators(trigger, False, trigger_arm(p), lambda r: r.get("split")), "outcome": denominators(outcome, True, lambda r: r["profile"])},
        "trigger": trigger_report(rows, p), "outcome": outcome_report(rows, p),
        "cost": {"trigger": cost(trigger, trigger_arm(p)), "outcome": cost(outcome, lambda r: r["profile"])},
        "sensitivity": sensitivity(rows, p),
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--params", type=Path, required=True)
    ap.add_argument("--ledger", type=Path, action="append", required=True)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args(argv)
    try:
        p = load_params(args.params)
        result = analyse(read_ledgers(args.ledger), p)
    except AnalysisError as err:
        print(f"analyze: {err}", file=sys.stderr)
        return 2
    result["inputs"] = {"params_sha256": sha256(args.params), "ledgers_sha256": {str(path): sha256(path) for path in args.ledger}, "analyze_sha256": sha256(Path(__file__))}
    text = json.dumps(result, indent=1) + "\n"
    args.out.write_text(text) if args.out else sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
