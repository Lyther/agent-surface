"""Build an evaluation arm by running agent-surface's own installer inside a build container.

An arm is a source overlay (the repository sources, minus any dropped skills) plus the install
commands for a profile. The overlay is a tarball built on the host and unpacked in a build container
that runs the installer with the container's node, so generated paths match the container HOME. The
result is committed once as an image per host and arm (`evals/images.py`); every attempt starts a
fresh container from that image. The sources checkout is never edited.
"""

from __future__ import annotations

import hashlib
import json
import shlex
import tarfile
from dataclasses import dataclass, field
from pathlib import Path

OVERLAY_ROOT = "/opt/as-overlay"
LOGS = "/logs/agent"
# Build records kept inside the image so an attempt can show which profile it started from.
BUILD_DIR = "/opt/sq"
# Directories the installer never reads; leaving them out keeps the upload small and the lab out of the arm.
EXCLUDE_TOP = {".git", "evals", "node_modules", ".agent-surface", "dist"}
# Host config files that carry MCP wiring. Both arms drop it so tools match and no service starts.
MCP_CONFIGS = {
    "opencode": ".config/opencode/opencode.json",
    "droid": ".factory/mcp.json",
    "claude-code": ".claude.json",
    "codex": ".codex/config.toml",
}
# Host hook files that carry Synapse's hook; it is part of the MCP service wiring and goes with it.
HOOK_CONFIGS = {"droid": ".factory/hooks.json", "claude-code": ".claude/settings.json", "codex": ".codex/hooks.json"}
SKILL_DIRS = {
    "opencode": [".config/opencode/skills", ".agents/skills"],
    "droid": [".agents/skills", ".factory/skills"],
    "claude-code": [".claude/skills"],
    "codex": [".agents/skills"],
}


@dataclass(frozen=True)
class Arm:
    name: str
    # One installer run per entry, each a --category value; the general sync always runs first.
    installs: tuple[str, ...] = ("development",)
    drop_skills: tuple[str, ...] = ()
    # Name of the arm whose overlay tarball supplies the sources.
    sources: str = ""

    @property
    def overlay(self) -> str:
        return self.sources or self.name


# General is always installed first because it resets the host's managed files; categories follow.
# F is the operator's full real profile (general, external packs, all four asset categories) from B's sources.
ARMS = {
    "A": Arm("A", drop_skills=("dev-fix",)),
    "B": Arm("B"),
    "F": Arm("F", installs=("external", "development,cybersecurity,private,modding"), sources="B"),
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


HOST_CLI = {
    "opencode": ("opencode-ai", "1.19.6"),
    "droid": ("droid", "0.244.0"),
    "claude-code": ("@anthropic-ai/claude-code", "2.1.330"),
    "codex": ("@openai/codex", "0.171.0"),
}
APT_DEPS = "curl ca-certificates git procps inotify-tools"
NVM_VERSION = "v0.40.2"
NODE_MAJOR = 22
DROID_URL = "https://downloads.factory.ai/factory-cli/releases/{v}/linux/x64"
STAMP = f"{BUILD_DIR}/stamp.py"
# Hosts installed with npm, and the command each provides.
NPM_CLIS = {"opencode": "opencode", "claude-code": "claude", "codex": "codex"}


def _cli_steps(target: str) -> list[str]:
    """Shell that installs the host CLI at its pinned version, so attempts never download it."""
    _, version = HOST_CLI[target]
    # nvm clones from GitHub, which fails now and then through the lab's relay, so the install is retried.
    nvm = (
        f"for i in 1 2 3; do curl -fsSo- https://raw.githubusercontent.com/nvm-sh/nvm/{NVM_VERSION}/install.sh | env -u NODE_VERSION bash >/dev/null 2>&1 && break; rm -rf ~/.nvm; sleep 5; done && "
        'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && '
        f"nvm install {NODE_MAJOR} >/dev/null && nvm alias default {NODE_MAJOR} >/dev/null"
    )
    if target in NPM_CLIS:
        package, command = HOST_CLI[target][0], NPM_CLIS[target]
        return [nvm, f"npm i -g {package}@{version} >/dev/null 2>&1", f"{command} --version"]
    url = DROID_URL.format(v=version)
    return [
        nvm,
        f"curl -fsSL -o /usr/local/bin/droid {url}/droid && curl -fsSL -o /tmp/droid.sha256 {url}/droid.sha256",
        '[ "$(sha256sum /usr/local/bin/droid | cut -d" " -f1)" = "$(cut -d" " -f1 /tmp/droid.sha256)" ] && chmod +x /usr/local/bin/droid',
        "droid --version",
    ]


def _hook_strip(target: str) -> list[str]:
    """Remove Synapse's hook from the host's hook file (top-level events, or nested under "hooks")."""
    path = HOOK_CONFIGS.get(target)
    if not path:
        return []
    return [
        f'python3 - "$HOME/{path}" <<\'PY\'\n'
        "import json, sys, pathlib\n"
        "p = pathlib.Path(sys.argv[1])\n"
        "if p.exists():\n"
        "    d = json.loads(p.read_text())\n"
        "    events = d['hooks'] if isinstance(d.get('hooks'), dict) else d\n"
        "    for event, groups in list(events.items()):\n"
        "        for g in groups:\n"
        "            g['hooks'] = [h for h in g.get('hooks', []) if 'synapse-hook' not in h.get('command', '')]\n"
        "        events[event] = [g for g in groups if g['hooks']]\n"
        "        if not events[event]:\n"
        "            del events[event]\n"
        "    if 'hooks' in d and not d['hooks']:\n"
        "        del d['hooks']\n"
        "    p.write_text(json.dumps(d, indent=2))\n"
        "PY"
    ]


def _mcp_strip(target: str) -> str:
    """Remove MCP wiring from the host config: JSON `mcp`/`mcpServers` keys, or Codex's `[mcp_servers.*]` tables."""
    path = MCP_CONFIGS[target]
    if path.endswith(".toml"):
        return (
            f'python3 - "$HOME/{path}" <<\'PY\'\n'
            "import re, sys, pathlib\n"
            "p = pathlib.Path(sys.argv[1])\n"
            "if p.exists():\n"
            "    kept, skipping = [], False\n"
            "    for line in p.read_text().splitlines(keepends=True):\n"
            "        header = re.match(r'\\s*\\[+\\s*([^\\]]+?)\\s*\\]+', line)\n"
            "        if header:\n"
            "            skipping = header.group(1).startswith('mcp_servers')\n"
            "        if not skipping:\n"
            "            kept.append(line)\n"
            "    p.write_text(''.join(kept))\n"
            "PY"
        )
    return (
        f'python3 - "$HOME/{path}" <<\'PY\'\n'
        "import json, sys, pathlib\n"
        "p = pathlib.Path(sys.argv[1])\n"
        "if p.exists():\n"
        "    d = json.loads(p.read_text())\n"
        "    for k in ('mcp', 'mcpServers'):\n"
        "        d.pop(k, None)\n"
        "    p.write_text(json.dumps(d, indent=2))\n"
        "PY"
    )


def build_script(target: str, arm: Arm) -> str:
    """Shell run once in the build container: host CLI, then the production installer for the arm's profile.

    The overlay is bind-mounted at /tmp/as-overlay.tgz so it never lands in an image layer. MCP services
    are neither built nor kept: the installer only wires their config, and that wiring is removed here so
    every arm has the same tools and nothing tries to start a service.
    """
    install = f'node scripts/agent-surface.mjs install --target {shlex.quote(target)} --scope user --dest "$HOME" -y'
    steps = [
        "set -e",
        # Build-only proxy settings (not secrets); they are sourced, not baked into the image environment.
        "[ -f /mnt/sq-build/proxy.sh ] && . /mnt/sq-build/proxy.sh",
        f"mkdir -p {OVERLAY_ROOT} {BUILD_DIR}",
        f"apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends {APT_DEPS} >/dev/null",
        "rm -rf /var/lib/apt/lists/*",
        *_cli_steps(target),
        f"tar -xzf /tmp/as-overlay.tgz -C {OVERLAY_ROOT} --strip-components=1",
        f"cd {OVERLAY_ROOT}",
        "npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1",
        "set +e",
        # Installer exit codes only signal skipped MCP prerequisites here; the manifest check below is the gate.
        f"{install} > {BUILD_DIR}/install-general.txt 2>&1; echo general_exit=$? >> {BUILD_DIR}/install-general.txt",
    ]
    for entry in arm.installs:
        log = f"{BUILD_DIR}/install-{entry.replace(',', '+')}.txt"
        steps.append(f"{install} --category {shlex.quote(entry)} > {log} 2>&1; echo exit=$? >> {log}")
    steps += [
        "set -e",
        _mcp_strip(target),
        *_hook_strip(target),
        'rm -f "$HOME"/.local/bin/grimoire-* "$HOME"/.local/bin/synapse-*',
        f'test -s "$HOME/.agent-surface/{target}-manifest.json"',
        f'cp "$HOME/.agent-surface/{target}-manifest.json" {BUILD_DIR}/arm-manifest.json',
        f'(cd "$HOME" && find {" ".join(SKILL_DIRS[target])} -name SKILL.md 2>/dev/null | sort) > {BUILD_DIR}/arm-skills.txt',
        # The overlay stays (minus node_modules) because installed hooks and wiring may point into it, as in SQ0.1.
        # The installer builds Synapse and Grimoire as a prerequisite of wiring them and has no switch to skip that.
        f"rm -rf {OVERLAY_ROOT}/node_modules {OVERLAY_ROOT}/mcps/*/node_modules {OVERLAY_ROOT}/mcps/*/dist /root/.npm /root/.cache /tmp/droid.sha256",
    ]
    return "\n".join(steps)


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
