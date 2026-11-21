"""Build one image per host and arm, once, so an attempt starts a fresh container from it.

The image is the scenario's base image plus the host CLI and the arm's installed profile, produced by
running the production installer in a capped build container and committing the result. Every attempt
then has a pristine HOME without re-uploading the overlay or re-running the installer. Image IDs go in
`images.json` and into each ledger row.

Usage:
  python -m evals.images build --out OUT --scenario DIR --overlay-dir DIR [--hosts opencode,droid] [--arms A,B,F]
  python -m evals.images verify --out OUT --reference DIR
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from evals.arms import ARMS, BUILD_DIR, HOST_CLI, STAMP, build_script

EVALS_DIR = Path(__file__).resolve().parent
BUILD_CPUS = "2"
BUILD_MEMORY = "3g"
BUILD_CONCURRENCY = 2
TAG_PREFIX = "sq-arm"
# Manifest fields that identify an installed file; the timestamp differs between builds.
MANIFEST_KEYS = ("target", "source", "output", "version", "asset_category")


def docker(*args: str, check: bool = True, input_text: str | None = None) -> str:
    done = subprocess.run(["docker", *args], capture_output=True, text=True, input=input_text)
    if check and done.returncode != 0:
        raise RuntimeError(f"docker {args[0]} failed ({done.returncode}): {done.stderr.strip()[-800:]}")
    return done.stdout.strip()


def image_id(tag: str) -> str:
    return docker("image", "inspect", "--format", "{{.Id}}", tag)


def base_tag(scenario: Path) -> str:
    return f"sq-scn/{scenario.parent.name}-{scenario.name}"


def build_base(scenario: Path) -> str:
    """Build the scenario's own environment image with capped resources (classic builder honours the caps)."""
    tag = base_tag(scenario)
    done = subprocess.run(
        ["docker", "build", "--memory", BUILD_MEMORY, "--cpu-quota", str(int(BUILD_CPUS) * 100000), "-t", tag, str(scenario / "environment")],
        capture_output=True, text=True, env={"DOCKER_BUILDKIT": "0", "PATH": "/usr/bin:/bin:/usr/local/bin", "HOME": str(Path.home())},
    )
    if done.returncode != 0:
        raise RuntimeError(f"base build failed: {done.stderr[-800:]}")
    return tag


def tag_for(host: str, arm: str, overlay_sha: str) -> str:
    return f"{TAG_PREFIX}/{host}-{arm.lower()}:{overlay_sha[:12]}"


def build_arm_image(host: str, arm: str, overlay: Path, overlay_meta: dict, base: str, out: Path) -> dict:
    spec = ARMS[arm]
    script = build_script(host, spec) + f"\ncp /mnt/sq-build/stamp.py {STAMP}\n"
    tag = tag_for(host, arm, overlay_meta["overlay_sha256"])
    name = f"sq-build-{host}-{arm.lower()}"
    log_dir = out / "build-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    docker("rm", "-f", name, check=False)
    with tempfile.TemporaryDirectory(prefix="sq-build-") as tmp:
        shutil.copy(EVALS_DIR / "stamp.py", Path(tmp) / "stamp.py")
        (Path(tmp) / "build.sh").write_text(script)
        done = subprocess.run(
            [
                "docker", "run", "--name", name, "--cpus", BUILD_CPUS, "--memory", BUILD_MEMORY,
                "-v", f"{overlay}:/tmp/as-overlay.tgz:ro", "-v", f"{tmp}:/mnt/sq-build:ro",
                base, "bash", "/mnt/sq-build/build.sh",
            ],
            capture_output=True, text=True,
        )
    (log_dir / f"{host}-{arm}.log").write_text(done.stdout + done.stderr)
    if done.returncode != 0:
        docker("rm", "-f", name, check=False)
        raise RuntimeError(f"{host}-{arm} build failed ({done.returncode}); see {log_dir / f'{host}-{arm}.log'}")
    labels = {
        "sq.host": host, "sq.arm": arm, "sq.cli": HOST_CLI[host][1], "sq.overlay_sha256": overlay_meta["overlay_sha256"],
        "sq.source_commit": overlay_meta["source_commit"], "sq.script_sha256": hashlib.sha256(script.encode()).hexdigest(),
    }
    change = [arg for k, v in labels.items() for arg in ("--change", f"LABEL {k}={v}")]
    docker("commit", *change, name, tag)
    docker("rm", "-f", name)
    return {
        "host": host, "arm": arm, "tag": tag, "image_id": image_id(tag), "base_tag": base, "base_id": image_id(base),
        "cli_version": HOST_CLI[host][1], "overlay_sha256": overlay_meta["overlay_sha256"][:16],
        "source_commit": overlay_meta["source_commit"], "dropped_skills": overlay_meta["dropped_skills"],
    }


def image_skills(tag: str) -> list[str]:
    text = docker("run", "--rm", "--entrypoint", "cat", tag, f"{BUILD_DIR}/arm-skills.txt")
    return sorted({Path(line).parent.name for line in text.splitlines() if line.endswith("/SKILL.md")})


def image_manifest(tag: str) -> dict:
    return json.loads(docker("run", "--rm", "--entrypoint", "cat", tag, f"{BUILD_DIR}/arm-manifest.json"))


def manifest_identity(manifest: dict) -> list[tuple]:
    return sorted(tuple(item.get(k) for k in MANIFEST_KEYS) for item in manifest.get("managed", []))


def write_task(template: Path, image: str, dest: Path, subs: dict[str, str] | None = None) -> Path:
    """Copy a Harbor task, point it at the prebuilt image instead of its environment directory, and fill `{name}` slots in its instruction."""
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(template, dest, ignore=shutil.ignore_patterns("environment"))
    config = dest / "task.toml"
    text = config.read_text()
    if "docker_image" in text:
        raise ValueError(f"{config} already names an image")
    config.write_text(re.sub(r"^\[environment\]\n", f'[environment]\ndocker_image = "{image}"\n', text, count=1, flags=re.M))
    instruction = dest / "instruction.md"
    text = instruction.read_text()
    for name, value in (subs or {}).items():
        text = text.replace("{" + name + "}", value)
    instruction.write_text(text)
    return dest


def cmd_build(args) -> None:
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    base = build_base(args.scenario)
    ledger = out / "images.json"
    existing = json.loads(ledger.read_text()) if ledger.exists() else {}
    cells = [(h, a) for h in args.hosts.split(",") for a in args.arms.split(",")]

    def one(cell):
        host, arm = cell
        meta = json.loads((args.overlay_dir / f"overlay-{ARMS[arm].overlay}.json").read_text())
        return f"{host}-{arm}", build_arm_image(host, arm, args.overlay_dir / f"overlay-{ARMS[arm].overlay}.tgz", meta, base, out)

    with ThreadPoolExecutor(BUILD_CONCURRENCY) as pool:
        for key, row in pool.map(one, cells):
            existing[key] = row
            print(key, row["image_id"][:19])
    ledger.write_text(json.dumps(existing, indent=2) + "\n")


def cmd_verify(args) -> None:
    """Compare each image's installed manifest with the SQ0.1 arm manifest for the same host and arm."""
    images = json.loads((args.out / "images.json").read_text())
    bad = 0
    for key, row in sorted(images.items()):
        host, arm = key.split("-")
        refs = sorted(args.reference.glob(f"jobs/{host}-{arm}-1/*/agent/arm-manifest.json"))
        skills = image_skills(row["tag"])
        line = {"image": key, "skills": len(skills), "dev_fix": "dev-fix" in skills}
        if refs:
            ref = manifest_identity(json.loads(refs[0].read_text()))
            got = manifest_identity(image_manifest(row["tag"]))
            line["manifest_matches_sq01"] = ref == got
            bad += ref != got
        print(json.dumps(line))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--out", type=Path, required=True)
    b.add_argument("--scenario", type=Path, required=True)
    b.add_argument("--overlay-dir", type=Path, required=True)
    b.add_argument("--hosts", default="opencode,droid")
    b.add_argument("--arms", default="A,B,F")
    b.set_defaults(fn=cmd_build)
    v = sub.add_parser("verify")
    v.add_argument("--out", type=Path, required=True)
    v.add_argument("--reference", type=Path, required=True)
    v.set_defaults(fn=cmd_verify)
    parsed = ap.parse_args()
    parsed.fn(parsed)
