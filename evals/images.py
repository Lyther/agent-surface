"""Host images and the rendered arms an attempt starts from.

One image per host holds the pinned base and the host CLI at its pinned version, nothing else. An arm is a
tarball rendered by the production installer (`evals/arms.py`); each attempt uploads and extracts it into the
container's HOME before the agent starts, so HOME is pristine and the arm is data, not an image.

Usage:
  python -m evals.images build --out OUT [--hosts opencode,droid] [--proxy URL]
  python -m evals.images arms --src SRC --out OUT [--hosts ...] [--profiles dev,full,...] [--desc-texts desc.json]
  python -m evals.images scenarios --host-images hosts.json --scenario DIR [--scenario DIR ...] --hosts droid [--proxy URL]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from evals.arms import BUILD_DIR, HOST_CLI, PROFILES, STAMP, check_arms, check_desc_arms, load_desc_texts, prepare_all

EVALS_DIR = Path(__file__).resolve().parent
# The base every host image and every scenario with its own environment starts from (pinned by digest).
HOST_BASE = "node:22-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb"
BUILD_CPUS = "2"
BUILD_MEMORY = "3g"
BUILD_CONCURRENCY = 2
TAG_PREFIX = "sq-host"
APT_DEPS = "inotify-tools procps"
DROID_URL = "https://downloads.factory.ai/factory-cli/releases/{v}/linux/x64"
# Hosts installed with npm, and the command each provides.
NPM_CLIS = {"opencode": "opencode", "claude-code": "claude", "codex": "codex"}


def docker(*args: str, check: bool = True) -> str:
    done = subprocess.run(["docker", *args], capture_output=True, text=True)
    if check and done.returncode != 0:
        raise RuntimeError(f"docker {args[0]} failed ({done.returncode}): {done.stderr.strip()[-800:]}")
    return done.stdout.strip()


def image_id(tag: str) -> str:
    return docker("image", "inspect", "--format", "{{.Id}}", tag)


def proxy_env(proxy: str | None) -> dict[str, str]:
    """Proxy variables for a build; the lab network may reach the internet only through a relay."""
    if not proxy:
        return {}
    no_proxy = os.environ.get("LAB_NO_PROXY", "localhost,127.0.0.1")  # hosts that must not use the relay
    return {"HTTP_PROXY": proxy, "HTTPS_PROXY": proxy, "http_proxy": proxy, "https_proxy": proxy,
            "NO_PROXY": no_proxy, "no_proxy": no_proxy}


def host_tag(host: str) -> str:
    return f"{TAG_PREFIX}/{host}:{HOST_CLI[host][1]}"


def build_script(host: str) -> str:
    """Shell run once in the build container: the detector's tools and the host CLI at its pinned version."""
    package, version = HOST_CLI[host]
    if host in NPM_CLIS:
        cli = [f"npm i -g {package}@{version} >/dev/null 2>&1", f"{NPM_CLIS[host]} --version"]
    else:
        url = DROID_URL.format(v=version)
        cli = [
            f"curl -fsSL -o /usr/local/bin/droid {url}/droid && curl -fsSL -o /tmp/droid.sha256 {url}/droid.sha256",
            '[ "$(sha256sum /usr/local/bin/droid | cut -d" " -f1)" = "$(cut -d" " -f1 /tmp/droid.sha256)" ] && chmod +x /usr/local/bin/droid',
            "droid --version",
        ]
    return "\n".join([
        "set -e",
        # Build-only proxy settings (not secrets); they are sourced, not baked into the image environment.
        "[ -f /mnt/sq-build/proxy.sh ] && . /mnt/sq-build/proxy.sh",
        f"apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends {APT_DEPS} >/dev/null",
        *cli,
        f"mkdir -p {BUILD_DIR} && cp /mnt/sq-build/stamp.py {STAMP}",
        "rm -rf /var/lib/apt/lists/* /root/.npm /root/.cache /tmp/droid.sha256",
    ])


def build_host_image(host: str, out: Path, proxy: str | None = None) -> dict:
    script = build_script(host)
    tag = host_tag(host)
    name = f"sq-build-{host}"
    log_dir = out / "build-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    docker("rm", "-f", name, check=False)
    with tempfile.TemporaryDirectory(prefix="sq-build-") as tmp:
        shutil.copy(EVALS_DIR / "stamp.py", Path(tmp) / "stamp.py")
        (Path(tmp) / "build.sh").write_text(script)
        (Path(tmp) / "proxy.sh").write_text("".join(f"export {k}={v}\n" for k, v in proxy_env(proxy).items()))
        done = subprocess.run(
            ["docker", "run", "--name", name, "--cpus", BUILD_CPUS, "--memory", BUILD_MEMORY, "-v", f"{tmp}:/mnt/sq-build:ro",
             HOST_BASE, "bash", "/mnt/sq-build/build.sh"],
            capture_output=True, text=True,
        )
    (log_dir / f"{host}.log").write_text(done.stdout + done.stderr)
    if done.returncode != 0:
        docker("rm", "-f", name, check=False)
        raise RuntimeError(f"{host} build failed ({done.returncode}); see {log_dir / f'{host}.log'}")
    labels = {"sq.host": host, "sq.cli": HOST_CLI[host][1], "sq.base": HOST_BASE, "sq.script_sha256": hashlib.sha256(script.encode()).hexdigest()}
    docker("commit", *[arg for k, v in labels.items() for arg in ("--change", f"LABEL {k}={v}")], name, tag)
    docker("rm", "-f", name)
    return {"host": host, "tag": tag, "image_id": image_id(tag), "base": HOST_BASE, "cli_version": HOST_CLI[host][1], "script_sha256": labels["sq.script_sha256"][:16]}


def scenario_tag(template: Path, host: str) -> str:
    """Tag of a scenario's own environment layered on a host image, e.g. `sq-scn/qa-f10-launcher-exec-bit:droid`."""
    return f"sq-scn/{template.name}:{host}"


def build_scenario_image(template: Path, host: dict, proxy: str | None) -> dict:
    """Layer a scenario's `environment/Dockerfile` on the host image and tag it once, so an attempt starts from a ready image.

    The Dockerfile must start from the shared base; its `FROM` is replaced by the host image. The classic builder is
    used because only it applies `--memory` and `--cpu-quota` to the build's RUN containers (BuildKit ignores both).
    Proxy variables go in as build arguments, never into the image's environment.
    """
    dockerfile = template / "environment" / "Dockerfile"
    first, _, rest = dockerfile.read_text().partition("\n")
    if first.strip() != f"FROM {HOST_BASE}":
        raise ValueError(f"{dockerfile} must start from the shared base to be layered on a host image")
    tag = scenario_tag(template, host["host"])
    with tempfile.TemporaryDirectory() as tmp:
        context = Path(tmp) / "ctx"
        shutil.copytree(template / "environment", context)
        (context / "Dockerfile").write_text(f"FROM {host['tag']}\n{rest}")
        build_args = [arg for k, v in proxy_env(proxy).items() for arg in ("--build-arg", f"{k}={v}")]
        started = time.monotonic()
        done = subprocess.run(
            ["docker", "build", "--memory", BUILD_MEMORY, "--cpu-period", "100000", "--cpu-quota", str(int(BUILD_CPUS) * 100000),
             "--label", f"sq.host_image={host['image_id']}", *build_args, "-t", tag, str(context)],
            capture_output=True, text=True, env={**os.environ, "DOCKER_BUILDKIT": "0"},
        )
        seconds = round(time.monotonic() - started, 1)
    if done.returncode != 0:
        raise RuntimeError(f"{tag} build failed ({done.returncode}): {(done.stdout + done.stderr)[-1500:]}")
    return {"scenario": template.name, "host": host["host"], "tag": tag, "image_id": image_id(tag), "host_image_id": host["image_id"], "build_seconds": seconds}


def write_task(template: Path, host: dict, dest: Path, subs: dict[str, str] | None = None, image: str | None = None) -> Path:
    """Copy a Harbor task onto a prebuilt image and fill `{name}` slots in its instruction.

    `image` is the scenario's own image layered on the host image (`build_scenario_image`); a task that has an
    `environment/Dockerfile` needs it, and a task without one runs on the host image itself.
    """
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(template, dest)
    dockerfile = dest / "environment" / "Dockerfile"
    config = dest / "task.toml"
    text = config.read_text()
    if "docker_image" in text:
        raise ValueError(f"{config} already names an image")
    if dockerfile.exists():
        if not image:
            raise ValueError(f"{template} has its own environment; build it on the host image first (`images scenarios`)")
        shutil.rmtree(dest / "environment")
    target = image or host["tag"]
    config.write_text(re.sub(r"^\[environment\]\n", f'[environment]\ndocker_image = "{target}"\n', text, count=1, flags=re.M))
    instruction = dest / "instruction.md"
    text = instruction.read_text()
    for name, value in (subs or {}).items():
        text = text.replace("{" + name + "}", value)
    instruction.write_text(text)
    return dest


def cmd_build(args) -> None:
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    ledger = out / "hosts.json"
    existing = json.loads(ledger.read_text()) if ledger.exists() else {}

    def one(host):
        try:
            return host, build_host_image(host, out, args.proxy)
        except RuntimeError as error:
            return host, str(error)

    failed = 0
    with ThreadPoolExecutor(BUILD_CONCURRENCY) as pool:
        for host, row in pool.map(one, args.hosts.split(",")):
            if isinstance(row, str):  # one image failing must not discard the others
                failed += 1
                print(host, "FAILED", row)
                continue
            existing[host] = row
            ledger.write_text(json.dumps(existing, indent=2) + "\n")
            print(host, row["image_id"][:19])
    sys.exit(1 if failed else 0)


def cmd_scenarios(args) -> None:
    """Layer each scenario's own environment on each host image; one JSON row per image, with its build seconds."""
    images = json.loads(args.host_images.read_text())
    failed = 0
    for host in args.hosts.split(","):
        for template in args.scenario:
            try:
                print(json.dumps(build_scenario_image(template, images[host], args.proxy)))
            except (RuntimeError, ValueError) as error:
                failed += 1
                print(template.name, host, "FAILED", error)
    sys.exit(1 if failed else 0)


def cmd_arms(args) -> None:
    """Render and pack every host-and-profile arm, then check `dev-fix` presence and the profile relations."""
    texts = load_desc_texts(args.desc_texts) if args.desc_texts else None
    # The description profiles are rendered only when their texts are given.
    profiles = args.profiles.split(",") if args.profiles else [n for n, p in PROFILES.items() if texts or p.desc_arm == "A"]
    arms = prepare_all(args.src, args.hosts.split(","), profiles, args.out, texts)
    (args.out / "arms.json").write_text(json.dumps(arms, indent=2) + "\n")
    for key, arm in sorted(arms.items()):
        print(json.dumps({"arm": key, "skills": len(arm["skills"]), "dev_fix": "dev-fix" in arm["skills"], "sha256": arm["arm_sha256"][:16]}))
    problems = check_arms(arms) + (check_desc_arms(arms, args.out, texts) if texts else [])
    for problem in problems:
        print("PROBLEM", problem)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--out", type=Path, required=True)
    b.add_argument("--hosts", default="opencode,droid,claude-code,codex")
    b.add_argument("--proxy", default=os.environ.get("LAB_BUILD_PROXY"), help="HTTP(S) proxy URL for builds (not a secret)")
    b.set_defaults(fn=cmd_build)
    c = sub.add_parser("scenarios")
    c.add_argument("--host-images", type=Path, required=True)
    c.add_argument("--scenario", type=Path, action="append", required=True)
    c.add_argument("--hosts", default="opencode,droid,claude-code,codex")
    c.add_argument("--proxy", default=os.environ.get("LAB_BUILD_PROXY"), help="HTTP(S) proxy URL for builds (not a secret)")
    c.set_defaults(fn=cmd_scenarios)
    r = sub.add_parser("arms")
    r.add_argument("--src", type=Path, required=True)
    r.add_argument("--out", type=Path, required=True)
    r.add_argument("--hosts", default="opencode,droid,claude-code,codex")
    r.add_argument("--profiles", help="default: every profile, the description profiles only with --desc-texts")
    r.add_argument("--desc-texts", type=Path, help='JSON {"B": {skill: text}, "C": {...}} for the dev-fix, verify-test and qa-review descriptions')
    r.set_defaults(fn=cmd_arms)
    parsed = ap.parse_args()
    parsed.fn(parsed)
