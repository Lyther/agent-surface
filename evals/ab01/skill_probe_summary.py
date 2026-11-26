"""Summarise skill-probe outputs: event types, tool calls (Skill with its skill name), and the final answer's text.

Usage: python3 skill_probe_summary.py DIR
"""

import json
import sys
from collections import Counter
from pathlib import Path

TEXT_LIMIT = 2500  # enough for a 75-line skill list

for path in sorted(Path(sys.argv[1]).glob("*.jsonl")):
    events = []
    for line in path.read_text(errors="replace").splitlines():
        try:
            events.append(json.loads(line))
        except ValueError:
            continue
    types = Counter(e.get("type") for e in events)
    calls = [(e.get("toolName"), (e.get("parameters") or {}).get("skill")) for e in events if e.get("type") == "tool_call"]
    final = next((e for e in reversed(events) if e.get("type") in ("completion", "result")), {})
    text = final.get("finalText") or final.get("result") or final.get("text") or ""
    print(f"=== {path.name}: {dict(types)}")
    print("tool calls:", calls)
    print("final keys:", sorted(final))
    print(text[:TEXT_LIMIT])
