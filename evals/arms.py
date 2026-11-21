"""Arms: the profile an attempt starts from, rendered by agent-surface's own installer into a directory.

A profile is the installer run for one host (general first, then each category) with `--no-mcps`, which renders
every non-MCP output into `--dest` and builds, wires and writes nothing else. The rendered directory holds no
absolute path (`render` is run at two paths and the results compared in `evals/tests`), so it is packed once into
a tarball and extracted into the attempt container's HOME before the agent starts. The sources checkout is never
edited: a profile without a skill renders from a hard-linked copy with that skill and its registry entries removed.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import shutil
import subprocess
import tarfile
from dataclasses import dataclass
from pathlib import Path

LOGS = "/logs/agent"
# Records inside host images.
BUILD_DIR = "/opt/sq"
STAMP = f"{BUILD_DIR}/stamp.py"
# Where each host reads installed skills, relative to HOME.
SKILL_DIRS = {
    "opencode": [".config/opencode/skills", ".agents/skills"],
    "droid": [".agents/skills", ".factory/skills"],
    "claude-code": [".claude/skills"],
    "codex": [".agents/skills"],
}
HOST_CLI = {
    "opencode": ("opencode-ai", "1.19.6"),
    "droid": ("droid", "0.244.0"),
    "claude-code": ("@anthropic-ai/claude-code", "2.1.330"),
    "codex": ("@openai/codex", "0.171.0"),
}
# Source directories no profile edits; a dropped-skill copy symlinks them (hard-linking their many files takes minutes).
LINKED_DIRS = ("external", "node_modules", "mcps")
# Fixed modification time of every packed file (2026-01-01), so the same arm packs to the same bytes. Epoch 0 made
# OpenCode and Claude Code rescan the whole skills directory during the run.
PACK_MTIME = 1767225600
# The description arm every profile currently carries (the descriptions as committed).
DESC_ARM = "A"


@dataclass(frozen=True)
class Profile:
    name: str
    # One installer run per entry, each a --category value; the general sync always runs first.
    installs: tuple[str, ...]
    drop_skills: tuple[str, ...] = ()


FULL_INSTALLS = ("external", "development,cybersecurity,private")
PROFILES = {
    "dev-minus-dev-fix": Profile("dev-minus-dev-fix", ("development",), ("dev-fix",)),
    "dev": Profile("dev", ("development",)),
    "full": Profile("full", FULL_INSTALLS),
    "full-minus-dev-fix": Profile("full-minus-dev-fix", FULL_INSTALLS, ("dev-fix",)),
}


def strip_registry(src: Path, drop: set[str]) -> dict[str, bytes]:
    """Registry files with the dropped skills removed from every skill list."""
    out: dict[str, bytes] = {}
    for path in sorted((src / "registry").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        changed = False

        def walk(node):
            nonlocal changed
            if isinstance(node, dict):
                for key, value in node.items():
                    if key == "skills" and isinstance(value, list):
                        kept = [s for s in value if s not in drop]
                        changed |= len(kept) != len(value)
                        node[key] = kept
                    else:
                        walk(value)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        walk(data)
        if changed:
            out[f"registry/{path.name}"] = (json.dumps(data, indent=2) + "\n").encode()
    return out



def prepare_source(src: Path, drop: tuple[str, ...], dest: Path) -> Path:
    """A hard-linked copy of the sources without the dropped skills; `src` itself is never written.

    Files that change are unlinked first, so the write cannot reach the shared inode.
    """
    shutil.copytree(src, dest, copy_function=os.link, ignore=shutil.ignore_patterns(".git", *LINKED_DIRS), symlinks=True)
    for name in LINKED_DIRS:  # large trees no profile edits are linked whole instead of file by file
        if (src / name).exists():
            (dest / name).symlink_to((src / name).resolve())
    if drop:
        for name in drop:
            shutil.rmtree(dest / "skills" / name)
        for rel, body in strip_registry(dest, set(drop)).items():
            (dest / rel).unlink()
            (dest / rel).write_bytes(body)
    return dest


def render(src: Path, host: str, profile: Profile, home: Path, node: str = "node") -> None:
    """Run the production installer for `host` into `home`: general first, then each category, `--no-mcps`."""
    home.mkdir(parents=True, exist_ok=True)
    # Resolve the real binary first: a version-manager shim would look for its own state under the new HOME.
    node = subprocess.run([node, "-p", "process.execPath"], capture_output=True, text=True, check=True).stdout.strip()
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home), "LANG": "C.UTF-8"}
    for category in (None, *profile.installs):
        cmd = [node, "scripts/agent-surface.mjs", "install", "--target", host, "--scope", "user", "--dest", str(home), "--no-mcps", "-y"]
        if category:
            cmd += ["--category", category]
        done = subprocess.run(cmd, cwd=src, env=env, capture_output=True, text=True)
        if done.returncode != 0:
            raise RuntimeError(f"install {host} {category or 'general'} failed ({done.returncode}): {done.stdout[-400:]}{done.stderr[-400:]}")
    add_operator_files(home, host)


# Operator steps the installer documents but never does. Claude Code loads the rules document through an import
# in ~/.claude/CLAUDE.md, which stays the operator's file (adapters/claude-code/README.md); the operator's real
# profile has the line, so every Claude Code arm gets exactly it. The other hosts write their own instruction files.
OPERATOR_FILES = {"claude-code": (".claude/CLAUDE.md", "@agent-surface/rules.md\n")}


def add_operator_files(home: Path, host: str) -> None:
    if host in OPERATOR_FILES:
        rel, body = OPERATOR_FILES[host]
        (home / rel).write_text(body)


def pack(home: Path, out: Path) -> str:
    """Write `home` as a reproducible tar.gz (sorted, owner 0, fixed mtime) and return its sha256."""
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as gz, tarfile.open(fileobj=gz, mode="w") as tar:
        for path in sorted(home.rglob("*")):
            info = tar.gettarinfo(str(path), arcname=str(path.relative_to(home)))
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = PACK_MTIME
            if path.is_file() and not path.is_symlink():
                with path.open("rb") as body:
                    tar.addfile(info, body)
            else:
                tar.addfile(info)
    out.write_bytes(buffer.getvalue())
    return hashlib.sha256(buffer.getvalue()).hexdigest()


def installed_skills(home: Path, host: str) -> list[str]:
    """Skill directory names that have a SKILL.md under the host's skill roots."""
    return sorted({p.parent.name for root in SKILL_DIRS[host] for p in (home / root).rglob("SKILL.md")})


def load_arms(path: Path) -> dict:
    """`arms.json` with each tarball path made absolute (they are stored relative, so the arm set can be copied)."""
    arms = json.loads(path.read_text())
    for arm in arms.values():
        arm["tarball"] = str(path.parent / arm["tarball"])
    return arms


def prepare_all(src: Path, hosts: list[str], profiles: list[str], out: Path) -> dict:
    """Render every host-and-profile arm; sources for a dropped skill are prepared once per drop set."""
    out.mkdir(parents=True, exist_ok=True)
    arms: dict[str, dict] = {}
    work = out / "_work"
    for name in profiles:
        profile = PROFILES[name]
        source = prepare_source(src, profile.drop_skills, work / name) if profile.drop_skills else src
        for host in hosts:
            home = out / name / host / "home"
            if home.exists():
                shutil.rmtree(home)
            render(source, host, profile, home)
            tarball = out / name / f"{host}.tgz"
            digest = pack(home, tarball)
            commit = (src / ".source-commit").read_text().strip() if (src / ".source-commit").exists() else "unknown"
            arms[f"{host}-{name}"] = {
                "profile": name, "host": host, "tarball": str(tarball.relative_to(out)), "arm_sha256": digest, "source_commit": commit,
                "dropped_skills": list(profile.drop_skills), "skills": installed_skills(home, host),
            }
    shutil.rmtree(work, ignore_errors=True)
    return arms


def check_arms(arms: dict) -> list[str]:
    """Problems with the rendered arms: `dev-fix` present or absent as the profile says, and `full` containing `dev`."""
    problems = []
    for key, arm in arms.items():
        expected_absent = "dev-fix" in arm["dropped_skills"]
        if ("dev-fix" in arm["skills"]) == expected_absent:
            problems.append(f"{key}: dev-fix {'present' if expected_absent else 'absent'}, expected the opposite")
    for host in {a["host"] for a in arms.values()}:
        dev, full = arms.get(f"{host}-dev"), arms.get(f"{host}-full")
        if dev and full and not set(dev["skills"]) <= set(full["skills"]):
            problems.append(f"{host}: full is missing skills that dev has")
        minus, full_minus = arms.get(f"{host}-dev-minus-dev-fix"), arms.get(f"{host}-full-minus-dev-fix")
        if dev and minus and set(dev["skills"]) - set(minus["skills"]) != {"dev-fix"}:
            problems.append(f"{host}: dev-minus-dev-fix differs from dev by more than dev-fix")
        if full and full_minus and set(full["skills"]) - set(full_minus["skills"]) != {"dev-fix"}:
            problems.append(f"{host}: full-minus-dev-fix differs from full by more than dev-fix")
    return problems


def detector_start(target: str) -> str:
    """Start the file-open watcher on the installed skills directories; each event gets a sub-second timestamp.

    The audit is a cross-check only: both hosts open every SKILL.md at startup to build their catalogue, so
    `evals/detect.py` decides loads from the host's own tool-call record and uses these events to confirm it.
    """
    dirs = " ".join(f'"$HOME/{d}"' for d in SKILL_DIRS[target])
    return (
        f'dirs=""; for d in {dirs}; do [ -d "$d" ] && dirs="$dirs $d"; done; '
        f'[ -n "$dirs" ] || exit 0; mkdir -p {LOGS}; '
        f"nohup setsid sh -c \"inotifywait -m -r -e open --format '%e %w%f' $dirs | python3 -u {STAMP}\" "
        f"> {LOGS}/skill-opens.log 2> {LOGS}/skill-opens.err < /dev/null & "
        f"sleep 1; pgrep -x inotifywait > /dev/null"
    )
