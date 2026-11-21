"""Capture the skill listing a host puts in front of the model and classify every installed skill.

Per host, from a fresh container of an arm image, with one trivial prompt:

- OpenCode: the skills are an `<available_skills>` block in the system prompt of the model request. A local
  forwarding proxy (`capture_proxy.py`) keeps the request body; the reply is irrelevant, so the capture still
  works when the free model is rate limited.
- Droid: the host writes the model's first context message, an "Available skills" system reminder, into its
  own session transcript (`~/.factory/sessions/<cwd>/<id>.jsonl`).

Each installed skill is then `surfaced` (name and description shown), `name-only` or `absent`; a surfaced
description that differs from the installed one is flagged `truncated` when it is a shortened prefix.

Usage: python -m evals.listing capture --images OUT/images.json --out DIR [--hosts opencode,droid] [--arms A,B,F]
The Factory key, for droid, is read from the first line of stdin and reaches the container only through the
process environment (`docker exec -e FACTORY_API_KEY`).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from evals.arms import SKILL_DIRS
from evals.cohort import HOSTS
from evals.images import docker

EVALS_DIR = Path(__file__).resolve().parent
PROMPT = "Reply with the single word OK. Do not call any tool."
PROXY_PORT = 8099
CAPTURE_TIMEOUT_SEC = 60
SESSIONS = "/root/.factory/sessions"

# Runs inside the image: installed skills (name -> description) from each SKILL.md frontmatter.
INSTALLED_SNIPPET = r"""
import json, pathlib, re, sys
out = {}
for root in sys.argv[1:]:
    for path in sorted((pathlib.Path.home() / root).rglob("SKILL.md")):
        match = re.match(r"---\n(.*?)\n---\n", path.read_text(errors="replace"), re.S)
        fields = {}
        lines = (match.group(1) if match else "").split("\n")
        i = 0
        while i < len(lines):
            key, sep, value = lines[i].partition(":")
            i += 1
            if not (sep and re.fullmatch(r"[a-z_-]+", key)):
                continue
            value = value.strip()
            if value in (">", "|", ">-", "|-"):
                block = []
                while i < len(lines) and lines[i].startswith(" "):
                    block.append(lines[i].strip())
                    i += 1
                value = " ".join(block)
            fields[key] = json.loads(value) if value.startswith('"') else value
        out[fields.get("name", path.parent.name)] = fields.get("description", "")
print(json.dumps(out))
"""


def _docker_env() -> dict[str, str]:
    return {"PATH": "/usr/bin:/bin:/usr/local/bin", "HOME": str(Path.home())}


def installed_skills(tag: str, host: str) -> dict[str, str]:
    text = docker("run", "--rm", "--entrypoint", "python3", tag, "-c", INSTALLED_SNIPPET, *SKILL_DIRS[host])
    return json.loads(text)


def parse_opencode(system_prompt: str) -> dict[str, str]:
    block = re.search(r"<available_skills>(.*?)</available_skills>", system_prompt, re.S)
    if not block:
        return {}
    skills = {}
    for entry in re.findall(r"<skill>(.*?)</skill>", block.group(1), re.S):
        name = re.search(r"<name>(.*?)</name>", entry, re.S)
        description = re.search(r"<description>(.*?)</description>", entry, re.S)
        if name:
            skills[name.group(1).strip()] = (description.group(1).strip() if description else "")
    return skills


def parse_droid(reminder: str) -> dict[str, str]:
    skills = {}
    for line in reminder.splitlines()[2:]:
        name, sep, description = line.partition(": ")
        if re.fullmatch(r"[A-Za-z0-9._-]+", name) and sep:
            skills[name] = description.strip()
        elif re.fullmatch(r"[A-Za-z0-9._-]+:?", line.strip()):
            skills[line.strip().rstrip(":")] = ""
    return skills


def classify(installed: dict[str, str], listed: dict[str, str]) -> dict:
    rows = {}
    for name, full in sorted(installed.items()):
        if name not in listed:
            rows[name] = {"class": "absent"}
            continue
        shown = listed[name]
        if not shown:
            rows[name] = {"class": "name-only"}
            continue
        cut = shown.removesuffix("…")
        rows[name] = {
            "class": "surfaced",
            "description_chars": len(shown),
            "truncated": shown != full and shown.endswith("…") and full.startswith(cut),
            "differs": shown != full and not (shown.endswith("…") and full.startswith(cut)),
        }
    counts = {c: sum(1 for r in rows.values() if r["class"] == c) for c in ("surfaced", "name-only", "absent")}
    counts["truncated"] = sum(1 for r in rows.values() if r.get("truncated"))
    counts["differs"] = sum(1 for r in rows.values() if r.get("differs"))
    return {"counts": counts, "skills": rows, "not_installed_but_listed": sorted(set(listed) - set(installed))}


def capture_opencode(container: str) -> tuple[dict[str, str], dict]:
    docker("cp", str(EVALS_DIR / "capture_proxy.py"), f"{container}:/tmp/capture_proxy.py")
    config = json.dumps({"provider": {"opencode": {"options": {"baseURL": f"http://127.0.0.1:{PROXY_PORT}"}}}})
    model = HOSTS["opencode"]["model"]
    script = (
        ". ~/.nvm/nvm.sh >/dev/null; mkdir -p /app /tmp/req; cd /app; "
        f"nohup python3 /tmp/capture_proxy.py https://opencode.ai/zen/v1 {PROXY_PORT} /tmp/req >/tmp/proxy.log 2>&1 & sleep 1; "
        f"export OPENCODE_CONFIG_CONTENT='{config}' OPENCODE_FAKE_VCS=git; "
        f"timeout {CAPTURE_TIMEOUT_SEC} opencode --model={model} run --format=json --dangerously-skip-permissions -- '{PROMPT}' >/tmp/oc.out 2>&1; "
        "opencode --version >/tmp/version.txt"
    )
    docker("exec", container, "bash", "-c", script, check=False)
    with tempfile.TemporaryDirectory() as tmp:
        docker("cp", f"{container}:/tmp/req", tmp)
        main = None
        for path in sorted((Path(tmp) / "req").glob("*.json")):
            body = json.loads(path.read_text())
            if body.get("tools"):  # the agent request; the others are title generation
                main = body
                break
        version = docker("exec", container, "cat", "/tmp/version.txt")
    if main is None:
        raise RuntimeError("no agent request captured from opencode")
    system = next(m["content"] for m in main["messages"] if m["role"] == "system")
    meta = {"method": "request body captured by a forwarding proxy; skills are the <available_skills> block of the system prompt",
            "version": version, "tools": [t["function"]["name"] for t in main["tools"]], "system_prompt_chars": len(system)}
    return parse_opencode(system if isinstance(system, str) else json.dumps(system)), meta


def capture_droid(container: str, key: str) -> tuple[dict[str, str], dict]:
    model = HOSTS["droid"]["model"]
    script = (
        ". ~/.nvm/nvm.sh >/dev/null; mkdir -p /app; cd /app; "
        f"droid exec --skip-permissions-unsafe -m {model} -o stream-json '{PROMPT}' >/tmp/listing.jsonl 2>/tmp/listing.err; droid --version >/tmp/version.txt"
    )
    # `-e NAME` without a value keeps the key out of argv.
    subprocess.run(["docker", "exec", "-e", "FACTORY_API_KEY", container, "bash", "-c", script], capture_output=True, check=False, env={**_docker_env(), "FACTORY_API_KEY": key})
    with tempfile.TemporaryDirectory() as tmp:
        docker("cp", f"{container}:{SESSIONS}", tmp)
        reminder = None
        for transcript in sorted(Path(tmp).rglob("*.jsonl")):
            for line in transcript.read_text().splitlines():
                for block in (json.loads(line).get("message") or {}).get("content") or []:
                    text = block.get("text", "") if isinstance(block, dict) else ""
                    if text.startswith("<system-reminder>\nAvailable skills"):
                        reminder = text
                        break
                if reminder:
                    break
        version = docker("exec", container, "cat", "/tmp/version.txt")
    if reminder is None:
        raise RuntimeError("no skills reminder in the droid session transcript")
    meta = {"method": "first context message of the session transcript: the 'Available skills' system reminder",
            "version": version, "reminder_chars": len(reminder)}
    return parse_droid(reminder), meta


def capture(host: str, image: dict, key: str) -> dict:
    name = f"sq-listing-{host}-{image['arm'].lower()}"
    docker("rm", "-f", name, check=False)
    args = ["run", "-d", "--name", name, "--cpus", "1", "--memory", "2g", "--entrypoint", "sleep"]
    if host == "droid":
        args += ["-e", "FACTORY_API_KEY", "-e", "FACTORY_DROID_AUTO_UPDATE_ENABLED=false"]
    done = subprocess.run(["docker", *args, image["tag"], "900"], capture_output=True, text=True, env={**_docker_env(), "FACTORY_API_KEY": key})
    if done.returncode != 0:
        raise RuntimeError(done.stderr[-400:])
    try:
        listed, meta = capture_opencode(name) if host == "opencode" else capture_droid(name, key)
    finally:
        docker("rm", "-f", name, check=False)
    installed = installed_skills(image["tag"], host)
    return {"host": host, "arm": image["arm"], "image_id": image["image_id"], "installed": len(installed), "listed": len(listed), **meta, **classify(installed, listed)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["capture"])
    ap.add_argument("--images", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--hosts", default="opencode,droid")
    ap.add_argument("--arms", default="A,B,F")
    args = ap.parse_args()
    key = sys.stdin.readline().strip() if not sys.stdin.isatty() else ""
    images = json.loads(args.images.read_text())
    args.out.mkdir(parents=True, exist_ok=True)
    for host in args.hosts.split(","):
        if host == "droid" and not key:
            sys.exit("droid listing needs the key on stdin")
        for arm in args.arms.split(","):
            row = capture(host, images[f"{host}-{arm}"], key)
            (args.out / f"listing-{host}-{arm}.json").write_text(json.dumps(row, indent=2) + "\n")
            print(host, arm, row["installed"], row["listed"], row["counts"])


if __name__ == "__main__":
    main()
