"""Trigger queries: a user's request, the skill it targets and its class and split, turned into one Harbor task each.

The queries come from a JSON file the lab does not author: a list of
`{"id", "class", "skill", "split", "text"}`. Every query runs through the shared `scenarios/trigger` template, whose
`instruction.md` has one `{query}` slot, on the fixture workspace described in the README.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from evals.arms import DESC_SKILLS

CLASSES = ("should-trigger", "near-miss")
SPLITS = ("dev", "held-out")
TEMPLATE = Path(__file__).resolve().parent / "scenarios" / "trigger"
ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")


def load_queries(path: Path) -> list[dict]:
    queries = json.loads(path.read_text(encoding="utf-8"))
    seen: set[str] = set()
    for query in queries:
        problems = [f"{field} {query.get(field)!r}" for field, allowed in (("class", CLASSES), ("split", SPLITS), ("skill", DESC_SKILLS)) if query.get(field) not in allowed]
        if not isinstance(query.get("id"), str) or not ID_PATTERN.fullmatch(query["id"]) or query["id"] in seen:
            problems.append(f"id {query.get('id')!r}")
        if not isinstance(query.get("text"), str) or not query["text"].strip():
            problems.append("text")
        if problems:
            raise ValueError(f"{path}: bad query ({', '.join(problems)})")
        seen.add(query["id"])
    return queries


def unit_name(query: dict) -> str:
    return f"trigger-{query['id']}"


def ledger_fields(query: dict) -> dict:
    return {"query_id": query["id"], "query_class": query["class"], "target_skill": query["skill"], "split": query["split"]}
