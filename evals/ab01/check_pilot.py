"""ab01 run acceptance: the ledger rows carry what the analysis needs, from the real cohort run. Prints findings; exit 1 on any failure.

Usage: python3 check_pilot.py OUT_DIR ARMS_JSON HOSTS_JSON EXPECTED_ROWS [PURPOSE]
PURPOSE is the rows' expected label: `pilot` by default, `-` for the outcome run, whose rows carry none.
"""

import json
import sys
from pathlib import Path

out, arms_file, hosts_file, expected = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4])
purpose = sys.argv[5] if len(sys.argv) > 5 else "pilot"
purpose = None if purpose == "-" else purpose
arms = json.loads(arms_file.read_text())
host_image_id = json.loads(hosts_file.read_text())["droid"]["image_id"]
rows = [json.loads(line) for line in (out / "ledger.jsonl").read_text().splitlines() if line.strip()]
cohort = json.loads((out / "cohort.json").read_text())
problems = []


def need(ok: bool, what: str) -> None:
    if not ok:
        problems.append(what)


need(len(rows) == expected, f"{len(rows)} rows, expected {expected}")
for row in rows:
    tag = f"{row.get('scenario')}/{row.get('profile')}/rep{row.get('rep')}"
    need("status" not in row and "skipped" not in row, f"{tag}: {row.get('status') or row.get('skipped')}")
    need(row.get("purpose") == purpose and row.get("prereg") == "ab01", f"{tag}: labels {row.get('purpose')}/{row.get('prereg')}")
    need(row.get("arms_together") is True and row.get("timeouts_are_outcomes") is True, f"{tag}: run flags missing")
    need(row.get("model") == "deepseek-v4.1-flash" and row.get("served_model") == "deepseek-v4.1-flash", f"{tag}: model {row.get('model')} served {row.get('served_model')}")
    need(row.get("cli_version") is not None and row.get("harbor") is not None, f"{tag}: no agent info")
    need(row.get("arm_sha256") == arms[f"droid-{row.get('profile')}"]["arm_sha256"], f"{tag}: arm sha")
    need(row.get("image_id") == host_image_id, f"{tag}: host image {row.get('image_id')}")
    need(row.get("receipt_scan") == "clean", f"{tag}: receipt scan {row.get('receipt_scan')}")
    need(row.get("verifier_reward") is not None, f"{tag}: no verifier reward (exception {row.get('exception')})")
    for field in ("factory_credits", "tokens_in", "tokens_out", "model_requests", "seconds_agent", "seconds_total", "end_reason"):
        need(row.get(field) is not None, f"{tag}: {field} missing")
    if row.get("profile") == "none":
        need(not row.get("skills_loaded"), f"{tag}: none arm loaded {row.get('skills_loaded')}")
for host, found in cohort.get("served_model", {}).items():
    need(found.get("poolable") is True, f"cohort: {host} not poolable: {found.get('why')}")

summary = [{k: row.get(k) for k in ("scenario", "profile", "verifier_reward", "end_reason", "exception", "factory_credits", "tokens_in", "tokens_out",
                                     "model_requests", "seconds_agent", "skills_loaded", "load_evidence", "audit_loads", "skill_files_scanned",
                                     "scrub_input_echo", "cli_version")} for row in rows]
print(json.dumps({"rows": summary, "served_model": cohort.get("served_model"), "problems": problems}, indent=1))
sys.exit(1 if problems else 0)
