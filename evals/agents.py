"""Harbor agents for containers started from a prebuilt arm image (`evals/images.py`).

The host CLI is in the image. `install` uploads the attempt's arm tarball (SQ_ARM_TARBALL, checked against
SQ_ARM_SHA256) and extracts it into HOME before the agent starts; the harbor setup time is that step.
Keys come from the harbor process environment (FACTORY_API_KEY for Droid, LAB_GATEWAY_KEY for the gateway hosts), never
from argv: Droid, Claude Code and OpenCode get theirs with `docker exec -e NAME`, so the value is inherited from this process
and stays out of every command line. Codex's never enters its container (`gateway_forwarder`).
"""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import json
import os
import shlex
from pathlib import Path
from typing import override
from urllib.parse import urlsplit

from harbor.agents.installed.base import BaseInstalledAgent, NonZeroAgentExitCodeError, with_prompt_template
from harbor.environments.base import BaseEnvironment
from harbor.environments.docker.docker import _sanitize_docker_compose_project_name
from harbor.models.agent.context import AgentContext

from evals.arms import HOST_CLI, LOGS, SKILL_DIRS, detector_start
from evals.gateway import CLAUDE_MODEL, KEY_ENV, URL_ENV, claude_tier_exports, gateway_url, no_proxy
from evals.images import OFFLINE_TAG

CODEX_MODEL = "gpt-5.4"
# OpenCode stays on gpt-5.5 (candidate host, not scored); it no longer shares Codex's model.
OPENCODE_MODEL = "gpt-5.5"
OPENCODE_PROVIDER = "gateway"
# The gateway's upstream caps a gpt-5.5 response at 1000 tokens, reasoning included, when the request sets no max_output_tokens
# (probe-cap, 2026-11-21); 5000 and 32000 were honored. OpenCode sends the model's limit.output, so every request carries this.
OPENCODE_OUTPUT_LIMIT = 32000
OPENCODE_CONTEXT_LIMIT = 400000  # required by OpenCode's model schema; it only paces compaction


def opencode_config(base_url: str) -> str:
    """OpenCode's config as JSON: the gateway as an `@ai-sdk/openai` provider (the Responses API), the key read from the environment at run time."""
    model = OPENCODE_MODEL
    # `snapshot` off: OpenCode otherwise runs `git add` over the whole working directory after every step, and in a container whose directory is `/`
    # that took 100 to 180 s per step (2026-11-21). The snapshot only feeds its undo feature.
    return json.dumps({"snapshot": False, "provider": {OPENCODE_PROVIDER: {
        "npm": "@ai-sdk/openai", "name": "Gateway",
        "options": {"baseURL": base_url, "apiKey": "{env:" + KEY_ENV + "}"},
        "models": {model: {"name": model, "limit": {"context": OPENCODE_CONTEXT_LIMIT, "output": OPENCODE_OUTPUT_LIMIT}}},
    }}})
# Harbor ends an attempt at the task's declared agent limit (`SQ_AGENT_TIMEOUT_SEC`, set by the cohort). The host CLI's own `timeout` fires this
# much earlier so a slow attempt is a timeout by this cap, not a cut by Harbor (an earlier fixed 900 s cap cut a droid attempt mid-work, SQ0.5).
HOST_TIMEOUT_MARGIN_SEC = 100


def host_timeout() -> int:
    return int(os.environ["SQ_AGENT_TIMEOUT_SEC"]) - HOST_TIMEOUT_MARGIN_SEC


DROID_VERSION = HOST_CLI["droid"][1]
DROID_MODEL = "claude-sonnet-5"
# Outward-facing and administration tools removed in every arm, as in GR2, and the web tools: in ab01, 11 of 20 SWE-bench
# Pro attempts per arm fetched their task's upstream repository, which holds the fix, almost always with FetchUrl.
DROID_REMOVE_TOOLS = (
    "SlackPostFile,SlackPostMessage,SlackCreateOrUpdateCodeChannel,SlackArchiveCodeChannel,SlackListChannels,store_agent_readiness_report,get_agent_effectiveness_usage,render_agent_effectiveness_report,ListEvalRuns,ListDatasets,ReadDataset,ReadEvalRun,CreateEvalRun,ListEvalPresets,SaveEvalPreset,CreateDataset,GenerateDroid,StageSettingsChanges,UpgradeSessionModel,ProposeMission,StartMissionRun,EndFeatureRun,DismissHandoffItems,ConnectApp,GenerateImage,ListAutomationTemplates,CreateAutomation,ListAutomations,ReadAutomation,EditAutomation,DeleteAutomation,RunAutomation,CreateWorkstream,ProposeWorkstream,AskUser,FetchUrl,WebSearch"
)


# Codex's agent phase runs offline (operator, 2026-11-27): its container reaches the gateway and nothing else, so the web, package indexes and a
# task's upstream fix are out of reach. Codex's own sandbox cannot do this here: its bubblewrap may not create namespaces in the lab's containers,
# so every sandboxed command exits 1. The rules go into the container's network namespace from a second container that shares it and holds
# NET_ADMIN, which the attempt container never gets, and come out before the verifier, which downloads its tools (TB2's test.sh fetches uv).
# Docker's DNS stub (127.0.0.11) resolves through the daemon, outside the namespace, so it is refused too; the gateway is named by address.
OFFLINE_CHAIN = "SQ_OFFLINE"
OFFLINE_ON = f"""set -eu
iptables -N {OFFLINE_CHAIN}
iptables -A {OFFLINE_CHAIN} -d 127.0.0.11 -j REJECT
iptables -A {OFFLINE_CHAIN} -o lo -j ACCEPT
iptables -A {OFFLINE_CHAIN} -p tcp -d "$1" --dport "$2" -j ACCEPT
iptables -A {OFFLINE_CHAIN} -p tcp -j REJECT --reject-with tcp-reset
iptables -A {OFFLINE_CHAIN} -j REJECT
iptables -I OUTPUT 1 -j {OFFLINE_CHAIN}
ip6tables -N {OFFLINE_CHAIN}
ip6tables -A {OFFLINE_CHAIN} -o lo -j ACCEPT
ip6tables -A {OFFLINE_CHAIN} -p tcp -j REJECT --reject-with tcp-reset
ip6tables -A {OFFLINE_CHAIN} -j REJECT
ip6tables -I OUTPUT 1 -j {OFFLINE_CHAIN}
iptables -S {OFFLINE_CHAIN} | sed "s#$1#GATEWAY#"
ip6tables -S {OFFLINE_CHAIN}
gateway=$(curl -sS -m 10 -o /dev/null -w '%{{http_code}}' "$3/health/liveliness" 2>&1) || true
echo "gateway: $gateway"
[ "$gateway" = 200 ]
for url in https://pypi.org/simple/ http://1.1.1.1/; do
  if out=$(curl -sS -m 10 -o /dev/null "$url" 2>&1); then echo "$url: reachable"; exit 3; fi
  echo "$url: blocked ($out)"
done
"""
OFFLINE_OFF = f"""set -eu
for t in iptables ip6tables; do
  while $t -C OUTPUT -j {OFFLINE_CHAIN} 2>/dev/null; do $t -D OUTPUT -j {OFFLINE_CHAIN}; done
  if $t -S {OFFLINE_CHAIN} >/dev/null 2>&1; then $t -F {OFFLINE_CHAIN}; $t -X {OFFLINE_CHAIN}; fi
  if $t -S | grep -q {OFFLINE_CHAIN}; then echo "$t: rules still present"; exit 4; fi
done
echo "rules removed"
"""


async def _in_netns(container: str, script: str, *args: str) -> tuple[int, str]:
    """Run `script` with `args` in a container that shares `container`'s network namespace and holds NET_ADMIN; its exit code and output."""
    proc = await asyncio.create_subprocess_exec(
        "docker", "run", "--rm", "--network", f"container:{container}", "--cap-add", "NET_ADMIN", "--entrypoint", "sh",
        OFFLINE_TAG, "-c", script, "offline", *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    return proc.returncode or 0, out.decode(errors="replace")


def _gateway_address() -> tuple[str, int]:
    """The gateway's IPv4 address and port, the one destination the offline rules allow; a host name would need the DNS they refuse."""
    url = urlsplit(gateway_url())
    try:
        address = ipaddress.IPv4Address(url.hostname or "")
    except ValueError as error:
        raise RuntimeError(f"offline attempts need {URL_ENV} to name the gateway by IPv4 address") from error
    return str(address), url.port or (443 if url.scheme == "https" else 80)


@contextlib.asynccontextmanager
async def offline(container: str, log: Path):
    """Hold `container`'s egress to the gateway for the block. The rules, their proof and their removal are appended to `log`; the removal runs
    however the block ends, and a failure of either raises, so an attempt never runs online or reaches its verifier offline unrecorded."""
    address, port = _gateway_address()
    try:
        code, out = await _in_netns(container, OFFLINE_ON, address, str(port), gateway_url())
        with log.open("a") as f:
            f.write(f"== offline: exit {code}\n{out}")
        if code != 0:
            raise RuntimeError(f"offline rules or their proof failed (exit {code}); see {log.name}")
        yield
    finally:
        code, out = await _in_netns(container, OFFLINE_OFF)
        with log.open("a") as f:
            f.write(f"== online: exit {code}\n{out}")
        if code != 0:
            raise RuntimeError(f"offline rules were not removed (exit {code}); see {log.name}")


# Codex hands its whole environment to every command it runs, so a key in its container reaches the transcript and the model: in the first
# offline smoke (2026-11-27) an agent's `env` printed LAB_GATEWAY_KEY. Codex therefore talks to this forwarder, which holds the key, sets it on
# every request and passes the rest through to the gateway. It runs in a second container that shares only the attempt's network namespace, so
# the agent reaches it on 127.0.0.1 but cannot read its memory or environment; the key arrives on its stdin, so `docker inspect` does not show it.
# No TB2 task of the subset uses this port (pypi-server serves on 8080).
FORWARDER_PORT = 47613
FORWARDER_TOKEN_ENV = "SQ_FORWARDER_TOKEN"  # the provider's env_key: Codex sends this placeholder and the forwarder replaces it
# Codex 0.171.0 retries a 429 only when it names a wait: with `Retry-After` it made 6 requests, without one a single request and the turn
# ended (probed 2026-11-27). The gateway's 429s name none, so one 429 ended a whole attempt (9 calibration attempts). The forwarder adds this
# wait to such a 429. Basis: the gateway's limits are per minute, and Codex's 5 retries at 15 s span 75 s, more than one window.
FORWARDER_RETRY_AFTER = 15
FORWARDER_JS = r"""
import http from "node:http";
import https from "node:https";

const [port, target, retryAfter] = process.argv.slice(1);
const upstream = new URL(target);
const client = upstream.protocol === "https:" ? https : http;
const prefix = upstream.pathname.replace(/\/+$/, "");
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.includes("\n")) break;
}
const key = input.split("\n")[0].trim();
if (!key) {
  console.error("forwarder: no key on stdin");
  process.exit(2);
}
const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: upstream.host, authorization: `Bearer ${key}` };
  const options = { protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port, method: req.method, path: prefix + req.url, headers };
  const out = client.request(options, (up) => {
    const wait = up.statusCode === 429 && up.headers["retry-after"] === undefined;
    console.error(`${req.method} ${req.url} ${up.statusCode}${wait ? ` retry-after ${retryAfter} added` : ""}`);
    res.writeHead(up.statusCode ?? 502, wait ? { ...up.headers, "retry-after": retryAfter } : up.headers);
    up.pipe(res);
    // A cut upstream stream must reach Codex as a cut, not as a complete response.
    up.on("close", () => { if (!up.complete) res.destroy(); });
  });
  out.on("error", (error) => {
    console.error(`${req.method} ${req.url} upstream error ${error.code ?? error.message}`);
    if (res.headersSent) res.destroy();
    else res.writeHead(502).end();
  });
  res.on("close", () => { if (!res.writableFinished) out.destroy(); });
  req.pipe(out);
});
server.listen(Number(port), "127.0.0.1", () => console.error(`listening on 127.0.0.1:${server.address().port}`));
"""
# The proof asks the forwarder for the model list, which the gateway answers only with a valid key, so 200 shows it listens, sets the key and
# reaches the gateway through the offline rules.
FORWARDER_PROOF = """set -eu
for i in $(seq 1 40); do
  code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1/v1/models" 2>/dev/null) || code=000
  if [ "$code" = 200 ]; then echo "forwarder: $code"; exit 0; fi
  sleep 0.25
done
echo "forwarder: $code"
exit 5
"""


@contextlib.asynccontextmanager
async def gateway_forwarder(container: str, log: Path):
    """Serve the gateway on 127.0.0.1:FORWARDER_PORT in `container`'s network namespace for the block, with the key added to every request.
    The forwarder's request lines and the proof go to `log`; the forwarder is removed however the block ends, and a failure of either raises."""
    key = os.environ.get(KEY_ENV)
    if not key:
        raise RuntimeError(f"{KEY_ENV} is not set in the harbor process environment")
    name = f"sq-forwarder-{container[:12]}"
    with log.open("ab") as out:
        proc = await asyncio.create_subprocess_exec(
            "docker", "run", "-i", "--name", name, "--network", f"container:{container}", "--entrypoint", "node",
            OFFLINE_TAG, "--input-type=module", "-e", FORWARDER_JS, str(FORWARDER_PORT), gateway_url(), str(FORWARDER_RETRY_AFTER),
            stdin=asyncio.subprocess.PIPE, stdout=out, stderr=asyncio.subprocess.STDOUT,
        )
    try:
        proc.stdin.write(f"{key}\n".encode())
        await proc.stdin.drain()
        proc.stdin.close()
        code, text = await _in_netns(container, FORWARDER_PROOF, str(FORWARDER_PORT))
        with log.open("a") as f:
            f.write(f"== proof: exit {code}\n{text}")
        if code != 0:
            raise RuntimeError(f"the gateway forwarder or its proof failed (exit {code}); see {log.name}")
        yield
    finally:
        remove = await asyncio.create_subprocess_exec("docker", "rm", "-f", name, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        _, err = await remove.communicate()
        await proc.wait()
        if remove.returncode != 0:
            raise RuntimeError(f"the gateway forwarder {name} was not removed: {err.decode(errors='replace').strip()}")


async def _install_arm(agent, environment, target: str) -> None:
    """Extract the attempt's arm into HOME and keep its manifest and skill list beside the other logs.

    An arm that installs nothing (SQ_ARM_INSTALLED=0) is an empty tarball with no manifest to keep.
    """
    sha = os.environ["SQ_ARM_SHA256"]
    await environment.upload_file(os.environ["SQ_ARM_TARBALL"], "/tmp/arm.tgz")
    roots = " ".join(SKILL_DIRS[target])
    manifest = f'"$HOME/.agent-surface/{target}-manifest.json"'
    keep_manifest = f"test -s {manifest} && cp {manifest} {LOGS}/arm-manifest.json && " if os.environ["SQ_ARM_INSTALLED"] == "1" else ""
    await agent.exec_as_agent(
        environment,
        command=f'echo "{sha}  /tmp/arm.tgz" | sha256sum -c - >/dev/null && tar -xzf /tmp/arm.tgz -C "$HOME" && rm /tmp/arm.tgz && '
        f'mkdir -p {LOGS} && {keep_manifest}'
        f'(cd "$HOME" && find {roots} -name SKILL.md 2>/dev/null | sort || true) > {LOGS}/arm-skills.txt',
    )


class _DockerExecAgent(BaseInstalledAgent):
    """Runs the host CLI with `docker exec`; a host whose key goes into its container gets it as `-e SECRET_NAME`, so it is never in argv."""

    SECRET = ""  # name of the environment variable that carries the host's key into the container; empty when the key stays out

    async def _container(self, environment: BaseEnvironment) -> str:
        project = _sanitize_docker_compose_project_name(environment.session_id)
        proc = await asyncio.create_subprocess_exec(
            "docker", "ps", "-q",
            "--filter", f"label=com.docker.compose.project={project}",
            "--filter", "label=com.docker.compose.service=main",
            stdout=asyncio.subprocess.PIPE,
        )
        out, _ = await proc.communicate()
        ids = out.decode().split()
        if len(ids) != 1:
            raise RuntimeError(f"expected one main container for {project}, found {len(ids)}")
        return ids[0]

    async def _docker_exec(self, environment: BaseEnvironment, inner: str, env: tuple[str, ...] = ()) -> int:
        secrets = (self.SECRET,) if self.SECRET else ()
        for name in secrets:
            if not os.environ.get(name):
                raise RuntimeError(f"{name} is not set in the harbor process environment")
        container = await self._container(environment)
        flags = [arg for item in (*secrets, *env) for arg in ("-e", item)]
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", *flags, container, "bash", "-c", inner,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        return await proc.wait()

    async def _workdir(self, environment: BaseEnvironment) -> str:
        return (await environment.exec(command="pwd")).stdout.strip() or "/"


class ArmOpenCode(_DockerExecAgent):
    """OpenCode through the gateway's Responses endpoint, the wire Codex uses, on the same model. Its JSON event stream is kept as `opencode.txt`."""

    SECRET = KEY_ENV

    @staticmethod
    @override
    def name() -> str:
        return "arm-opencode"

    @override
    def version(self) -> str | None:
        return HOST_CLI["opencode"][1]

    @override
    def get_version_command(self) -> str | None:
        return "opencode --version"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _install_arm(self, environment, "opencode")
        await self.exec_as_agent(environment, command=f'[ "$(opencode --version)" = "{HOST_CLI["opencode"][1]}" ]')

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("opencode"))
        workdir = await self._workdir(environment)
        data = f"{LOGS}/opencode"
        inner = (
            f"cd {shlex.quote(workdir)} && "
            f"export OPENCODE_CONFIG_CONTENT={shlex.quote(opencode_config(gateway_url() + '/v1'))} OPENCODE_FAKE_VCS=git XDG_DATA_HOME={data}/xdg-data XDG_STATE_HOME={data}/xdg-state; "
            f"set -o pipefail; timeout {host_timeout()} opencode --model={OPENCODE_PROVIDER}/{self.model_name or OPENCODE_MODEL} run --format=json --thinking "
            f"--dangerously-skip-permissions -- {shlex.quote(instruction)} </dev/null 2>&1 | tee {LOGS}/opencode.txt >/dev/null"
        )
        code = await self._docker_exec(environment, inner, (f"NO_PROXY={no_proxy()}", f"no_proxy={no_proxy()}"))
        if code != 0:
            raise NonZeroAgentExitCodeError(f"opencode exited {code}")
        if errors := self._error_messages():
            raise NonZeroAgentExitCodeError("opencode emitted error event(s): " + "; ".join(errors[:3]))

    def _events(self) -> list[dict]:
        path = Path(self.logs_dir) / "opencode.txt"
        events = []
        for line in path.read_text(errors="replace").splitlines() if path.exists() else []:
            try:
                events.append(json.loads(line))
            except ValueError:
                continue
        return events

    def _error_messages(self) -> list[str]:
        return [str((e.get("error") or {}).get("data", {}).get("message") or e.get("error") or "error") for e in self._events() if e.get("type") == "error"]

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        finishes = [(e.get("part") or {}).get("tokens") or {} for e in self._events() if e.get("type") == "step_finish"]
        if not finishes:
            return
        # Each step_finish closes one model request. `input` excludes cached tokens, so the whole prompt adds cache reads and writes;
        # `reasoning` is billed as output and kept apart in the stream, so output adds it (as Codex's output_tokens includes it).
        cache = [t.get("cache") or {} for t in finishes]
        cache_read = sum(c.get("read") or 0 for c in cache)
        context.n_input_tokens = sum(t.get("input") or 0 for t in finishes) + cache_read + sum(c.get("write") or 0 for c in cache)
        context.n_output_tokens = sum((t.get("output") or 0) + (t.get("reasoning") or 0) for t in finishes)
        context.n_cache_tokens = cache_read
        context.metadata = {"model_requests": len(finishes)}


class ArmDroid(_DockerExecAgent):
    SECRET = "FACTORY_API_KEY"

    @staticmethod
    @override
    def name() -> str:
        return "arm-droid"

    @override
    def version(self) -> str | None:
        return DROID_VERSION

    @override
    def get_version_command(self) -> str | None:
        return "droid --version"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _install_arm(self, environment, "droid")
        await self.exec_as_agent(environment, command=f'[ "$(droid --version)" = "{DROID_VERSION}" ]')

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("droid"))
        workdir = await self._workdir(environment)
        inner = (
            f"cd {shlex.quote(workdir)} && "
            f"timeout {host_timeout()} droid exec --skip-permissions-unsafe -m {shlex.quote(self.model_name or DROID_MODEL)} "
            f"--remove-tools {DROID_REMOVE_TOOLS} -o stream-json -- {shlex.quote(instruction)} "
            f"> {LOGS}/droid.jsonl 2> {LOGS}/droid.stderr"
        )
        code = await self._docker_exec(environment, inner, ("FACTORY_DROID_AUTO_UPDATE_ENABLED=false",))
        if code != 0:
            raise NonZeroAgentExitCodeError(f"droid exec exited {code}")

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        path = Path(self.logs_dir) / "droid.jsonl"
        if not path.exists():
            return
        usage, turns = {}, None
        for line in path.read_text(errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "completion":
                usage, turns = event.get("usage", {}), event.get("numTurns")
        # Anthropic-style usage: `input_tokens` excludes cache reads and writes. `n_input_tokens` is the whole prompt summed over the
        # attempt's requests and `n_cache_tokens` its cached part, as for the other hosts. Each of Droid's turns is one model request
        # (a 52-turn attempt made 51 tool calls and one closing message).
        cache_read = usage.get("cache_read_input_tokens") or 0
        if usage:
            context.n_input_tokens = (usage.get("input_tokens") or 0) + cache_read + (usage.get("cache_creation_input_tokens") or 0)
            context.n_cache_tokens = cache_read
        context.n_output_tokens = usage.get("output_tokens")
        context.metadata = {"factory_credits": usage.get("factory_credits"), "model_requests": turns, "usage": usage}


class ArmClaude(_DockerExecAgent):
    """Claude Code through the gateway. Its transcript (`~/.claude/projects`) is kept beside the stream-json output."""

    SECRET = KEY_ENV

    @staticmethod
    @override
    def name() -> str:
        return "arm-claude-code"

    @override
    def version(self) -> str | None:
        return HOST_CLI["claude-code"][1]

    @override
    def get_version_command(self) -> str | None:
        return "claude --version"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _install_arm(self, environment, "claude-code")
        await self.exec_as_agent(environment, command=f'claude --version | grep -qF "{HOST_CLI["claude-code"][1]} "')

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("claude-code"))
        workdir = await self._workdir(environment)
        inner = (
            f"cd {shlex.quote(workdir)} && "
            f"export ANTHROPIC_BASE_URL={shlex.quote(gateway_url())} ANTHROPIC_AUTH_TOKEN=\"${KEY_ENV}\" IS_SANDBOX=1 "
            "DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1; "
            f"{claude_tier_exports()}"
            f"timeout {host_timeout()} claude -p --output-format stream-json --verbose --dangerously-skip-permissions "
            f"--model {shlex.quote(self.model_name or CLAUDE_MODEL)} -- {shlex.quote(instruction)} </dev/null > {LOGS}/claude.jsonl 2> {LOGS}/claude.stderr; code=$?; "
            f"cp -r ~/.claude/projects {LOGS}/claude-projects 2>/dev/null; exit $code"
        )
        code = await self._docker_exec(environment, inner, (f"NO_PROXY={no_proxy()}", f"no_proxy={no_proxy()}"))
        if code != 0:
            raise NonZeroAgentExitCodeError(f"claude exited {code}")

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        path = Path(self.logs_dir) / "claude.jsonl"
        if not path.exists():
            return
        results: list[dict] = []
        events: list[dict] = []
        for line in path.read_text(errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            events.append(event)
            if event.get("type") == "result":
                results.append(event)
        requests = {e["message"]["id"] for e in events if e.get("type") == "assistant" and e.get("message", {}).get("id")}
        if not results:  # killed before any result: no token reading, not zero tokens
            context.metadata = {"model_requests": len(requests)}
            return
        # A background task finishing after the first answer starts another turn and a second `result` event; each result's `usage` covers
        # only the requests since the previous one (the SQ0.5 f14 attempt: 288,926 + 3,987 uncached over two results, 75 requests). Keep the sum.
        usage = {key: sum(r.get("usage", {}).get(key) or 0 for r in results)
                 for key in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}
        # Anthropic usage keeps cache reads and writes out of input_tokens. n_input_tokens is the whole prompt (as Codex reports it)
        # and n_cache_tokens the cached part of it, so both hosts are comparable and uncached input is the difference.
        cache_read = usage["cache_read_input_tokens"]
        context.n_input_tokens = usage["input_tokens"] + cache_read + usage["cache_creation_input_tokens"]
        context.n_output_tokens = usage["output_tokens"]
        context.n_cache_tokens = cache_read
        # The cost the CLI prints uses its own price table for the requested id, not the gateway's, so it is not spend.
        context.metadata = {"model_usage_ids": sorted(results[-1].get("modelUsage") or {}), "reported_cost_usd_unreliable": results[-1].get("total_cost_usd"),
                            "model_requests": len(requests)}


class ArmCodex(_DockerExecAgent):
    """Codex through the gateway's Responses endpoint by way of the key-holding forwarder (`gateway_forwarder`), offline (`offline`) and with its
    web search tool off. Its rollout files (`~/.codex/sessions`) are kept beside the JSON stream, the offline proof as `offline.txt` and the
    forwarder's request lines as `forwarder.txt`."""

    SECRET = ""  # the key stays in the forwarder

    @staticmethod
    @override
    def name() -> str:
        return "arm-codex"

    @override
    def version(self) -> str | None:
        return HOST_CLI["codex"][1]

    @override
    def get_version_command(self) -> str | None:
        return "codex --version"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _install_arm(self, environment, "codex")
        await self.exec_as_agent(environment, command=f'[ "$(codex --version)" = "codex-cli {HOST_CLI["codex"][1]}" ]')

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("codex"))
        workdir = await self._workdir(environment)
        provider = (f'model_providers.gateway={{name="Gateway",base_url="http://127.0.0.1:{FORWARDER_PORT}/v1",env_key="{FORWARDER_TOKEN_ENV}",'
                    'wire_api="responses"}')
        inner = (
            f"cd {shlex.quote(workdir)} && "
            f"timeout {host_timeout()} codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "
            f"-m {shlex.quote(self.model_name or CODEX_MODEL)} -c 'model_provider=\"gateway\"' -c {shlex.quote(provider)} -c 'web_search=\"disabled\"' "
            f"-- {shlex.quote(instruction)} </dev/null > {LOGS}/codex.jsonl 2> {LOGS}/codex.stderr; code=$?; "
            f"cp -r ~/.codex/sessions {LOGS}/codex-sessions 2>/dev/null; exit $code"
        )
        container, logs = await self._container(environment), Path(self.logs_dir)
        local = "127.0.0.1,localhost"
        async with offline(container, logs / "offline.txt"), gateway_forwarder(container, logs / "forwarder.txt"):
            code = await self._docker_exec(environment, inner, (f"{FORWARDER_TOKEN_ENV}=placeholder", f"NO_PROXY={local}", f"no_proxy={local}"))
        if code != 0:
            raise NonZeroAgentExitCodeError(f"codex exec exited {code}")

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        path = Path(self.logs_dir) / "codex.jsonl"
        if not path.exists():
            return
        usage: dict = {}
        for line in path.read_text(errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "turn.completed":
                usage = event.get("usage") or {}
        context.n_input_tokens = usage.get("input_tokens")  # summed over every model request of the turn, cached tokens included
        context.n_output_tokens = usage.get("output_tokens")
        context.n_cache_tokens = usage.get("cached_input_tokens")
        context.metadata = {"model_requests": self._rollout_requests()}

    def _rollout_requests(self) -> int:
        """One `token_count` event with usage closes each model request in the rollout files."""
        count = 0
        for rollout in (Path(self.logs_dir) / "codex-sessions").rglob("rollout-*.jsonl"):
            for line in rollout.read_text(errors="replace").splitlines():
                try:
                    payload = json.loads(line).get("payload") or {}
                except ValueError:
                    continue
                count += payload.get("type") == "token_count" and bool(payload.get("info"))
        return count
