"""Per arm, across the ab01 outcome runs: was the arm installed, did droid scan the skills, and did the model have a skill tool?

Prints counts, tool names and booleans only, never event text. Usage: python3 skill_presence.py RUN_DIR [RUN_DIR ...]
"""

import json
import sys
from collections import Counter
from pathlib import Path


def first_init(path: Path) -> dict | None:
    for line in path.read_text(errors="replace").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "system" or "tools" in event:
            return event
    return None


def skill_opens(agent: Path) -> int:
    log = agent / "skill-opens.log"
    if not log.exists():
        return -1
    names = set()
    for line in log.read_text(errors="replace").splitlines():
        parts = line.split(" ", 2)
        if len(parts) == 3 and parts[1] == "OPEN" and parts[2].endswith("/SKILL.md"):
            names.add(parts[2].rsplit("/", 2)[-2])
    return len(names)


stats: dict[str, Counter] = {"none": Counter(), "full": Counter()}
tool_sets: dict[str, Counter] = {"none": Counter(), "full": Counter()}
init_keys: set[str] = set()
for run in map(Path, sys.argv[1:]):
    for agent in sorted(run.glob("jobs/*/*/agent")):
        profile = "full" if "-droid-full-" in agent.parent.parent.name else "none"
        s = stats[profile]
        s["attempts"] += 1
        skills = agent / "arm-skills.txt"
        count = len(skills.read_text().split()) if skills.exists() else 0
        s[f"arm_skills={count}"] += 1
        manifest = agent / "arm-manifest.json"
        if manifest.exists():
            m = json.loads(manifest.read_text())
            s[f"manifest {m.get('target')}/{m.get('scope')} entries={len(m.get('entries') or m.get('managed') or [])}"] += 1
        else:
            s["no manifest"] += 1
        opens = skill_opens(agent)
        s["watcher log absent" if opens < 0 else f"SKILL.md files opened={opens}"] += 1
        record = agent / "droid.jsonl"
        init = first_init(record) if record.exists() else None
        if init is None:
            s["no init event"] += 1
            continue
        init_keys.update(init)
        tools = init.get("tools") or []
        names = sorted(t if isinstance(t, str) else t.get("name", "?") for t in tools)
        s[f"tools={len(names)}"] += 1
        s[f"Skill tool offered={'Skill' in names}"] += 1
        tool_sets[profile][",".join(names)] += 1

print(json.dumps({p: dict(sorted(c.items())) for p, c in stats.items()}, indent=1))
print("init event keys:", sorted(init_keys))
for profile, sets in tool_sets.items():
    for names, n in sets.items():
        print(f"{profile} x{n}: {names}")
