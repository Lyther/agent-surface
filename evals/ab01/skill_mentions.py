"""Does the model's own reasoning or messages ever mention skills? Counts per droid record; short excerpts only for the probe files.

Usage: python3 skill_mentions.py PROBE_DIR RUN_DIR [RUN_DIR ...]
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

WORD = re.compile(r"skill", re.IGNORECASE)
EXCERPT = 90  # characters either side of a match


def model_texts(path: Path):
    for line in path.read_text(errors="replace").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") in ("reasoning", "message") and event.get("role", "assistant") == "assistant":
            yield str(event.get("text") or event.get("content") or "")


probe = Path(sys.argv[1])
for path in sorted(probe.glob("*.jsonl")):
    hits = [t for t in model_texts(path) if WORD.search(t)]
    print(f"{path.name}: {len(hits)} model texts mention skills")
    for text in hits[:3]:
        m = WORD.search(text)
        print("   ...", text[max(0, m.start() - EXCERPT): m.end() + EXCERPT].replace("\n", " "), "...")

attempts = Counter()
for run in map(Path, sys.argv[2:]):
    for record in run.glob("jobs/*-droid-full-*/*/agent/droid.jsonl"):
        texts = list(model_texts(record))
        attempts["full attempts"] += 1
        attempts["model texts"] += len(texts)
        mentioning = sum(1 for t in texts if WORD.search(t))
        attempts["model texts mentioning skills"] += mentioning
        attempts["attempts with a mention"] += bool(mentioning)
print(dict(attempts))
