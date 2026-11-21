"""Decide which installed skills a host loaded in one attempt.

Both hosts open every installed SKILL.md at startup to build their skill catalogue (OpenCode once per
file, Droid three times), so a file-open audit alone cannot tell a load from that scan. The rule is
therefore taken from the host's own execution record, and the audit only confirms it:

- A load is a tool call that names an installed skill (OpenCode `skill`, Droid `Skill`), or a read-class tool
  call or shell command whose target resolves to an installed `<skill>/SKILL.md`. Installed means listed in
  the attempt's `arm-skills.txt`; `~`, `$HOME` and relative paths are resolved first (a relative path against
  the call's working directory when the host records one, or a single leading `cd DIR &&`). A path that cannot
  be resolved counts only when the audit shows the installed file opened after the scan.
- A skill-tool call naming a skill that is not installed is a `failed_lookups` entry, not a load.
- Any other `SKILL.md` read (for example `/app/skills/dev-fix/SKILL.md` in a workspace that carries the
  repository) is a `workspace_skill_reads` entry: an exposure covariate, never a load.
- The audit counts opens after the startup scan ends (`startup_end`). It cannot see every mechanism: both hosts
  serve a skill-tool load from the body cached at startup, so it only confirms loads made by reading the file
  (and, for OpenCode's skill tool, the skill's directory listing). `verdict` lists each disagreement with its cause.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

HOME = "/root"

# Tool names that load a skill by name, per host, and the parameter that carries the name.
SKILL_TOOLS = {"opencode": {"skill": "name"}, "droid": {"Skill": "skill"}}
# Tools that read a file by path (the path parameter differs by host).
READ_TOOLS = {"opencode": {"read": "filePath"}, "droid": {"Read": "file_path"}}
# A command-line token ending in SKILL.md (quotes, redirects and separators end a token).
SKILL_TOKEN = re.compile(r"[^\s'\"=;|&<>()]*SKILL\.md\b")


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


def session_cwd(attempt: Path, host: str) -> str | None:
    """The working directory Droid records in its init event; OpenCode does not record one."""
    if host == "droid":
        for event in _events(attempt, host):
            if event.get("type") == "system" and event.get("cwd"):
                return event["cwd"]
    return None


def installed_files(attempt: Path) -> set[str]:
    """Absolute paths of the installed SKILL.md files, from the image's `arm-skills.txt` (relative to HOME)."""
    return {f"{HOME}/{line.strip()}" for log in attempt.rglob("arm-skills.txt") for line in log.read_text().splitlines() if line.strip()}


def _expand(token: str) -> str:
    return re.sub(r"^~(?=/)|\$\{HOME\}|\$HOME", HOME, token)


def _resolve(token: str, cwd: str | None, via_command: bool, command: str) -> str | None:
    """Absolute normalised path of a SKILL.md token, or None when it cannot be resolved."""
    path = _expand(token)
    if path.startswith("/"):
        return os.path.normpath(path)
    base = cwd
    if via_command and re.search(r"\bcd\b|\bpushd\b", command):
        # Only a single leading `cd DIR &&` (or `;`) is understood; any other directory change is unresolved.
        lead = re.match(r"\s*cd\s+(\S+)\s*(?:&&|;)", command)
        target = _expand(lead.group(1).strip("'\"")) if lead and len(re.findall(r"\bcd\b|\bpushd\b", command)) == 1 else None
        if target is None or not (target.startswith("/") or cwd):
            return None
        base = os.path.normpath(os.path.join(cwd or "/", target))
    if base is None:
        return None
    return os.path.normpath(os.path.join(base, path))


def record_loads(attempt: Path, host: str, audit_files: set[str] | None = None) -> dict:
    """Loads, workspace reads and failed lookups from the host's record.

    `audit_files` are the skills whose installed SKILL.md the audit saw opened after the scan; they settle a
    path that could not be resolved.
    """
    installed = installed_files(attempt)
    names = {Path(p).parent.name for p in installed}
    audit_files = audit_files or set()
    cwd = session_cwd(attempt, host)
    loads: dict[str, str] = {}
    workspace: list[dict] = []
    failed: list[dict] = []
    for call in tool_calls(attempt, host):
        tool, params = call["tool"], call["params"]
        named = SKILL_TOOLS[host].get(tool)
        if named and params.get(named):
            name = str(params[named])
            if name in names:
                loads.setdefault(name, f"{tool} tool call")
            else:
                failed.append({"tool": tool, "name": name})
            continue
        how = f"{tool.lower() if host == 'opencode' else tool} of SKILL.md"
        param = READ_TOOLS[host].get(tool)
        command = params.get("command") if isinstance(params.get("command"), str) else ""
        tokens = [str(params[param])] if param and params.get(param) else SKILL_TOKEN.findall(command)
        call_cwd = params.get("workdir") or cwd
        for token in tokens:
            if not token.endswith("SKILL.md"):
                continue
            resolved = _resolve(token, call_cwd, not param, command)
            name = Path(resolved or _expand(token)).parent.name
            if resolved in installed or (resolved is None and name in audit_files):
                loads.setdefault(name, how)
            else:
                workspace.append({"tool": tool, "path": resolved or token})
    return {"loads": loads, "workspace": workspace, "failed": failed}


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
    skills = {Path(p).parent.name for p in installed_files(attempt)}
    audit = audit_loads(attempt, host, skills)
    record = record_loads(attempt, host, {n for n, how in audit.items() if how == "SKILL.md open"})
    loads = record["loads"]
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
        "workspace_skill_reads": record["workspace"],
        "failed_lookups": record["failed"],
        "disagreements": disagreements,
        "scanned": len({d for _, d, is_file in audit_events(attempt) if is_file}),
    }
