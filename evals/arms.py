"""Build an evaluation arm by running agent-surface's own installer inside the attempt container.

An arm is a source overlay (the repository sources, minus any dropped skills) plus the install
commands for a profile. The overlay is a tarball built on the host, unpacked inside the container
and run there with the container's node, so generated paths match the container HOME. The sources
checkout is never edited.
"""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import tarfile
from dataclasses import dataclass, field
from pathlib import Path

OVERLAY_ROOT = "/opt/as-overlay"
LOGS = "/logs/agent"
# Directories the installer never reads; leaving them out keeps the upload small and the lab out of the arm.
EXCLUDE_TOP = {".git", "evals", "node_modules", ".agent-surface", "dist"}
# Host config files that carry MCP wiring. Both arms drop it so tools match and no service starts.
MCP_CONFIGS = {
    "opencode": ".config/opencode/opencode.json",
    "droid": ".factory/mcp.json",
}
SKILL_DIRS = {
    "opencode": [".config/opencode/skills", ".agents/skills"],
    "droid": [".agents/skills", ".factory/skills"],
}


@dataclass(frozen=True)
class Arm:
    name: str
    categories: tuple[str, ...] = ("development",)
    drop_skills: tuple[str, ...] = ()


# General is always installed first because it resets the host's managed files; categories follow.
ARMS = {
    "A": Arm("A", drop_skills=("dev-fix",)),
    "B": Arm("B"),
}


def _filter(drop: set[str]):
    def keep(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
        parts = Path(info.name).parts
        if len(parts) > 1 and parts[1] in EXCLUDE_TOP:
            return None
        if len(parts) > 2 and parts[1] == "skills" and parts[2] in drop:
            return None
        return info

    return keep


def _strip_registry(src: Path, drop: set[str]) -> dict[str, bytes]:
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


def build_overlay(src: Path, arm: Arm, dest: Path) -> dict:
    """Write the arm's overlay tarball and return its identity for the ledger."""
    drop = set(arm.drop_skills)
    replaced = _strip_registry(src, drop) if drop else {}
    commit = (src / ".source-commit").read_text().strip() if (src / ".source-commit").exists() else "unknown"
    with tarfile.open(dest, "w:gz") as tar:
        for entry in sorted(src.iterdir()):
            if entry.name in EXCLUDE_TOP:
                continue
            tar.add(entry, arcname=f"o/{entry.name}", filter=_filter(drop))
        for rel, body in replaced.items():
            info = tarfile.TarInfo(f"o/{rel}")
            info.size = len(body)
            info.mode = 0o644
            tar.addfile(info, fileobj=__import__("io").BytesIO(body))
    # tar.add above already added the original registry files; a later member with the same name wins on extract.
    digest = hashlib.sha256(dest.read_bytes()).hexdigest()
    return {"arm": arm.name, "source_commit": commit, "dropped_skills": sorted(drop), "overlay_sha256": digest}


def install_script(target: str, arm: Arm) -> str:
    """Shell run in the container: unpack, install dependencies, run the product installer, strip MCP wiring."""
    install = f"node scripts/agent-surface.mjs install --target {shlex.quote(target)} --scope user --dest \"$HOME\" -y"
    steps = [
        "set -u",
        f"mkdir -p {OVERLAY_ROOT} {LOGS}",
        f"tar -xzf /tmp/as-overlay.tgz -C {OVERLAY_ROOT} --strip-components=1",
        f"cd {OVERLAY_ROOT}",
        '[ -f ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh',
        "node --version && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1",
        # Installer exit codes only signal skipped MCP prerequisites here; the manifest check below is the gate.
        f"{install} > {LOGS}/arm-install-general.txt 2>&1; echo general_exit=$? >> {LOGS}/arm-install-general.txt",
    ]
    for category in arm.categories:
        log = f"{LOGS}/arm-install-{category}.txt"
        steps.append(f"{install} --category {shlex.quote(category)} > {log} 2>&1; echo {category}_exit=$? >> {log}")
    mcp = MCP_CONFIGS[target]
    steps += [
        f'python3 - "$HOME/{mcp}" <<\'PY\'\n'
        "import json, sys, pathlib\n"
        "p = pathlib.Path(sys.argv[1])\n"
        "if p.exists():\n"
        "    d = json.loads(p.read_text())\n"
        "    for k in ('mcp', 'mcpServers'):\n"
        "        d.pop(k, None)\n"
        "    p.write_text(json.dumps(d, indent=2))\n"
        "PY",
        f'test -s "$HOME/.agent-surface/{target}-manifest.json"',
        f'cp "$HOME/.agent-surface/{target}-manifest.json" {LOGS}/arm-manifest.json',
        f'(cd "$HOME" && find {" ".join(SKILL_DIRS[target])} -name SKILL.md 2>/dev/null | sort) > {LOGS}/arm-skills.txt || true',
        f"rm -rf {OVERLAY_ROOT}/node_modules",
    ]
    return "\n".join(steps)


def detector_start(target: str) -> str:
    """Start a background file-open watcher on the installed skills directories (spike-grade, SQ0.2 refines it)."""
    dirs = " ".join(f'"$HOME/{d}"' for d in SKILL_DIRS[target])
    return (
        f'dirs=""; for d in {dirs}; do [ -d "$d" ] && dirs="$dirs $d"; done; '
        f'[ -n "$dirs" ] || exit 0; '
        f"nohup setsid inotifywait -m -r -e open --format '%T %e %w%f' --timefmt '%FT%T' $dirs "
        f"> {LOGS}/skill-opens.log 2> {LOGS}/skill-opens.err < /dev/null & "
        f'sleep 1; pgrep -x inotifywait > /dev/null'
    )


async def install_arm(agent, environment, target: str) -> None:
    """Upload the overlay named by SQ_OVERLAY and run the arm's install script in the container."""
    overlay = os.environ["SQ_OVERLAY"]
    await environment.upload_file(overlay, "/tmp/as-overlay.tgz")
    await agent.exec_as_agent(environment, command=install_script(target, ARMS[os.environ["SQ_ARM"]]))
