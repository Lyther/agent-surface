"""Summarise the rule probe: skill loads per arm and attempt, from each attempt's Droid record (`evals.detect`).

Prints counts and skill names only, and writes summary.json beside the records.
Usage, from the repository root: PYTHONPATH=. python3 evals/ab01/rule_probe_summary.py OUT_DIR
"""

from __future__ import annotations

import json
import sys
from math import comb
from pathlib import Path

from evals.detect import record_loads, tool_calls

TIE = 1 + 1e-9  # tables as likely as the observed one count toward the two-sided p


def fisher_two_sided(a: int, n1: int, c: int, n2: int) -> float:
    """Two-sided Fisher exact p for a of n1 against c of n2."""
    hits = a + c

    def p(k: int) -> float:
        return comb(n1, k) * comb(n2, hits - k) / comb(n1 + n2, hits)

    observed = p(a)
    return min(1.0, sum(p(k) for k in range(max(0, hits - n2), min(hits, n1) + 1) if p(k) <= observed * TIE))


def attempt_row(attempt: Path) -> dict:
    record = record_loads(attempt, "droid")
    exit_ = json.loads((attempt / "exit.json").read_text())
    return {"loads": record["loads"], "first_load": record["first_load"], "failed": record["failed"],
            "workspace": record["workspace"], "calls": len(tool_calls(attempt, "droid")), "code": exit_["code"], "seconds": exit_["seconds"]}


def main() -> int:
    out = Path(sys.argv[1])
    rows: dict[str, dict[str, dict]] = {}
    for done in sorted(out.glob("R?/*/exit.json")):
        rows.setdefault(done.parent.parent.name, {})[done.parent.name] = attempt_row(done.parent)
    quarantined = sorted(p.name for p in (out / "quarantine").glob("*"))
    print(f"quarantined attempts: {len(quarantined)} {quarantined}")
    base = rows.get("R0", {})
    base_hits = sum(bool(r["loads"]) for r in base.values())
    for variant, attempts in sorted(rows.items()):
        hits = sum(bool(r["loads"]) for r in attempts.values())
        line = f"{variant}: {hits}/{len(attempts)} attempts loaded a skill"
        if variant != "R0" and base:
            line += f"; two-sided Fisher p against R0 = {fisher_two_sided(hits, len(attempts), base_hits, len(base)):.3g}"
        print(line)
        for name, row in sorted(attempts.items()):
            first = row["first_load"]["calls_before"] if row["first_load"] else "-"
            failed = [f["name"] for f in row["failed"]]
            print(f"  {name}: code={row['code']} calls={row['calls']} loads={sorted(row['loads'])} calls_before_first_load={first} failed={failed} workspace_reads={len(row['workspace'])}")
    (out / "summary.json").write_text(json.dumps(rows, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
