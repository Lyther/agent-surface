"""Decide which installed skills a host loaded in one attempt.

Both hosts open every installed SKILL.md at startup to build their skill catalogue (OpenCode once per
file, Droid three times), so a file-open audit alone cannot tell a load from that scan. The rule is
therefore taken from the host's own execution record, and the audit only confirms it:

- A load is a tool call that names a skill (OpenCode `skill`, Droid `Skill`), or a read-class tool call
  or shell command whose target is an installed `<skill>/SKILL.md`.
- The audit counts opens after the startup scan ends (`startup_end`). It cannot see every mechanism: both hosts
  serve a skill-tool load from the body cached at startup, so it only confirms loads made by reading the file
  (and, for OpenCode's skill tool, the skill's directory listing). `verdict` lists each disagreement with its cause.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# Tool names that load a skill by name, per host, and the parameter that carries the name.
SKILL_TOOLS = {"opencode": {"skill": "name"}, "droid": {"Skill": "skill"}}
# Tools that read a file by path (the path parameter differs by host).
READ_TOOLS = {"opencode": {"read": "filePath"}, "droid": {"Read": "file_path"}}
SKILL_FILE = re.compile(r"(?:^|[/\s'\"=])([A-Za-z0-9._-]+)/SKILL\.md\b")


def _json_lines(path: Path):
    for line in path.read_text(errors="replace").splitlines():
        try:
            yield json.loads(line)
        except ValueError:
            continue


def tool_calls(attempt: Path, host: str) -> list[dict]:
    """Normalised tool calls from the host's record: {ts (epoch seconds), tool, params}."""
    calls = []
    if host == "opencode":
        for log in attempt.rglob("opencode.txt"):
            for event in _json_lines(log):
                part = event.get("part") or {}
                if event.get("type") == "tool_use" and part.get("type") == "tool":
                    calls.append({"ts": event["timestamp"] / 1000, "tool": part.get("tool"), "params": (part.get("state") or {}).get("input") or {}})
    else:
        for log in attempt.rglob("droid.jsonl"):
            for event in _json_lines(log):
                if event.get("type") == "tool_call":
                    calls.append({"ts": event["timestamp"] / 1000, "tool": event.get("toolName"), "params": event.get("parameters") or {}})
    return sorted(calls, key=lambda c: c["ts"])


def _events(attempt: Path, host: str) -> list[dict]:
    name = "opencode.txt" if host == "opencode" else "droid.jsonl"
    return [e for log in attempt.rglob(name) for e in _json_lines(log)]


def startup_end(attempt: Path, host: str) -> float | None:
    """Epoch seconds after which a SKILL.md open is no longer the catalogue scan.

    OpenCode finishes its scan about two seconds before its first model event, and its tool events are
    stamped on completion, so the first event of any kind is the anchor. Droid's scan ends within 0.1 s
    of its first reasoning event, so only its first tool call (stamped when issued) is safe.
    """
    if host == "opencode":
        stamps = [e["timestamp"] / 1000 for e in _events(attempt, host) if "timestamp" in e]
        return min(stamps) if stamps else None
    calls = tool_calls(attempt, host)
    return calls[0]["ts"] if calls else None


def record_loads(attempt: Path, host: str) -> dict[str, str]:
    """Skill name -> the first host record that shows it loaded."""
    loads: dict[str, str] = {}
    for call in tool_calls(attempt, host):
        tool, params = call["tool"], call["params"]
        named = SKILL_TOOLS[host].get(tool)
        if named and params.get(named):
            loads.setdefault(str(params[named]), f"{tool} tool call")
            continue
        path = params.get(READ_TOOLS[host].get(tool, ""), "") if tool in READ_TOOLS[host] else ""
        text = path or (params.get("command") or "" if isinstance(params.get("command"), str) else "")
        for match in SKILL_FILE.finditer(text):
            loads.setdefault(match.group(1), f"{tool.lower() if host == 'opencode' else tool} of SKILL.md")
    return loads


def audit_events(attempt: Path) -> list[tuple[float, str, bool]]:
    """(epoch seconds, skill directory path, is a SKILL.md file open) for every open the watcher logged."""
    events = []
    for log in attempt.rglob("skill-opens.log"):
        for line in log.read_text(errors="replace").splitlines():
            parts = line.split(" ", 2)
            if len(parts) != 3 or parts[1] not in ("OPEN", "OPEN,ISDIR"):
                continue
            path = parts[2].rstrip("/")
            if parts[1] == "OPEN" and path.endswith("/SKILL.md"):
                events.append((float(parts[0]), path[: -len("/SKILL.md")], True))
            elif parts[1] == "OPEN,ISDIR":
                events.append((float(parts[0]), path, False))
    return sorted(events)


def audit_loads(attempt: Path, host: str, skills: set[str]) -> dict[str, str]:
    """Skills the file audit shows touched after the startup scan: a SKILL.md open, or (OpenCode's
    skill tool) an open of the skill's own directory."""
    end = startup_end(attempt, host)
    if end is None:
        return {}
    seen: dict[str, str] = {}
    for ts, directory, is_file in audit_events(attempt):
        name = Path(directory).name
        if ts >= end and name in skills:
            seen.setdefault(name, "SKILL.md open" if is_file else "directory open")
    return seen


# Whether the audit can see a load made by this mechanism. Droid's Skill tool serves the body cached at
# startup, so it opens no file; OpenCode's skill tool lists the skill directory but also serves a cached body.
AUDIT_SEES = {
    ("opencode", "skill tool call"): "directory open",
    ("opencode", "read of SKILL.md"): "SKILL.md open",
    ("opencode", "bash of SKILL.md"): "SKILL.md open",
    ("droid", "Read of SKILL.md"): "SKILL.md open",
    ("droid", "Execute of SKILL.md"): "SKILL.md open",
}


def verdict(attempt: Path, host: str) -> dict:
    """The attempt's skill loads from the host record, the audit's view, and each disagreement with its cause."""
    loads = record_loads(attempt, host)
    skills = {Path(p).parent.name for log in attempt.rglob("arm-skills.txt") for p in log.read_text().splitlines()}
    audit = audit_loads(attempt, host, skills)
    disagreements = []
    for name, how in sorted(loads.items()):
        expected = AUDIT_SEES.get((host, how))
        if expected is None:
            disagreements.append({"skill": name, "cause": f"audit cannot see a load by {how}: the host opens no skill file for it"})
        elif name not in audit:
            disagreements.append({"skill": name, "cause": f"{how} recorded but no {expected} after the startup scan"})
    for name, how in sorted(audit.items()):
        if name not in loads:
            disagreements.append({"skill": name, "cause": f"{how} after the startup scan with no matching tool call in the host record"})
    return {
        "loaded": sorted(loads),
        "evidence": loads,
        "audit_loads": sorted(audit),
        "disagreements": disagreements,
        "scanned": len({d for _, d, is_file in audit_events(attempt) if is_file}),
    }
