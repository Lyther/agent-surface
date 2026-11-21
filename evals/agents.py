"""Harbor agents for containers started from a prebuilt arm image (`evals/images.py`).

The host CLI and the arm's profile are already in the image, so `install` only proves they are there.
Keys come from the harbor process environment (FACTORY_API_KEY for Droid, LAB_GATEWAY_KEY for Claude Code and
Codex through the gateway), never from argv: the agents start the host CLI with `docker exec -e NAME`, so the value
is inherited from this process and stays out of every command line.
"""

from __future__ import annotations

import asyncio
import json
import os
import shlex
from pathlib import Path
from typing import override

from harbor.agents.installed.base import BaseInstalledAgent, NonZeroAgentExitCodeError, with_prompt_template
from harbor.agents.installed.opencode import OpenCode
from harbor.environments.base import BaseEnvironment
from harbor.environments.docker.docker import _sanitize_docker_compose_project_name
from harbor.models.agent.context import AgentContext

from evals.arms import BUILD_DIR, HOST_CLI, LOGS, detector_start
from evals.gateway import KEY_ENV, gateway_url, no_proxy

CLAUDE_MODEL = "claude-sonnet-5-5"  # the gateway maps Claude ids to other models; the host does not show the served one
CODEX_MODEL = "gpt-5.5"
HOST_TIMEOUT_SEC = 900

DROID_VERSION = HOST_CLI["droid"][1]
DROID_MODEL = "claude-sonnet-5"
DROID_TIMEOUT_SEC = 900
# Outward-facing and administration tools removed in every arm, as in GR2.
DROID_REMOVE_TOOLS = (
    "SlackPostFile,SlackPostMessage,SlackCreateOrUpdateCodeChannel,SlackArchiveCodeChannel,SlackListChannels,store_agent_readiness_report,get_agent_effectiveness_usage,render_agent_effectiveness_report,ListEvalRuns,ListDatasets,ReadDataset,ReadEvalRun,CreateEvalRun,ListEvalPresets,SaveEvalPreset,CreateDataset,GenerateDroid,StageSettingsChanges,UpgradeSessionModel,ProposeMission,StartMissionRun,EndFeatureRun,DismissHandoffItems,ConnectApp,GenerateImage,ListAutomationTemplates,CreateAutomation,ListAutomations,ReadAutomation,EditAutomation,DeleteAutomation,RunAutomation,CreateWorkstream,ProposeWorkstream,AskUser"
)


async def _check_image(agent, environment, target: str) -> None:
    """Fail the attempt when the container did not come from an arm image for this host."""
    await agent.exec_as_agent(
        environment,
        command=f'test -s {BUILD_DIR}/arm-manifest.json && test -s "$HOME/.agent-surface/{target}-manifest.json" && '
        f"mkdir -p {LOGS} && cp {BUILD_DIR}/arm-manifest.json {BUILD_DIR}/arm-skills.txt {LOGS}/",
    )


class ArmOpenCode(OpenCode):
    @staticmethod
    @override
    def name() -> str:
        return "arm-opencode"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _check_image(self, environment, "opencode")
        await super().install(environment)  # returns at once when the pinned CLI is already there

    @override
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("opencode"))
        await super().run(instruction, environment, context)


class _DockerExecAgent(BaseInstalledAgent):
    """Runs the host CLI with `docker exec -e SECRET_NAME` so the secret is never in argv."""

    SECRET = ""  # name of the environment variable that carries the host's key

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
        if not os.environ.get(self.SECRET):
            raise RuntimeError(f"{self.SECRET} is not set in the harbor process environment")
        container = await self._container(environment)
        flags = [arg for item in (self.SECRET, *env) for arg in ("-e", item)]
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", *flags, container, "bash", "-c", inner,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        return await proc.wait()

    async def _workdir(self, environment: BaseEnvironment) -> str:
        return (await environment.exec(command="pwd")).stdout.strip() or "/"


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
        await _check_image(self, environment, "droid")
        await self.exec_as_agent(environment, command=f'[ "$(droid --version)" = "{DROID_VERSION}" ]')

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("droid"))
        workdir = await self._workdir(environment)
        inner = (
            f"cd {shlex.quote(workdir)} && [ -f ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh; "
            f"timeout {DROID_TIMEOUT_SEC} droid exec --skip-permissions-unsafe -m {DROID_MODEL} "
            f"--remove-tools {DROID_REMOVE_TOOLS} -o stream-json {shlex.quote(instruction)} "
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
        usage = {}
        for line in path.read_text(errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "completion":
                usage = event.get("usage", {})
        context.n_input_tokens = usage.get("input_tokens")
        context.n_output_tokens = usage.get("output_tokens")
        context.metadata = {"factory_credits": usage.get("factory_credits"), "usage": usage}


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
        await _check_image(self, environment, "claude-code")
        await self.exec_as_agent(environment, command=f'. ~/.nvm/nvm.sh; claude --version | grep -qF "{HOST_CLI["claude-code"][1]} "')

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("claude-code"))
        workdir = await self._workdir(environment)
        inner = (
            f"cd {shlex.quote(workdir)} && . ~/.nvm/nvm.sh; "
            f"export ANTHROPIC_BASE_URL={shlex.quote(gateway_url())} ANTHROPIC_AUTH_TOKEN=\"${KEY_ENV}\" IS_SANDBOX=1 "
            "DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1; "
            f"timeout {HOST_TIMEOUT_SEC} claude -p --output-format stream-json --verbose --dangerously-skip-permissions "
            f"--model {shlex.quote(self.model_name or CLAUDE_MODEL)} {shlex.quote(instruction)} </dev/null > {LOGS}/claude.jsonl 2> {LOGS}/claude.stderr; code=$?; "
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
        result: dict = {}
        for line in path.read_text(errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "result":
                result = event
        usage = result.get("usage") or {}
        context.n_input_tokens = usage.get("input_tokens")
        context.n_output_tokens = usage.get("output_tokens")
        context.n_cache_tokens = usage.get("cache_read_input_tokens")
        # The cost the CLI prints uses its own price table for the requested id, not the gateway's, so it is not spend.
        context.metadata = {"model_usage_ids": sorted((result.get("modelUsage") or {})), "reported_cost_usd_unreliable": result.get("total_cost_usd")}


class ArmCodex(_DockerExecAgent):
    """Codex through the gateway's Responses endpoint. Its rollout files (`~/.codex/sessions`) are kept beside the JSON stream."""

    SECRET = KEY_ENV

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
        await _check_image(self, environment, "codex")
        await self.exec_as_agent(environment, command=f'. ~/.nvm/nvm.sh; [ "$(codex --version)" = "codex-cli {HOST_CLI["codex"][1]}" ]')

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self.exec_as_agent(environment, command=detector_start("codex"))
        workdir = await self._workdir(environment)
        provider = f'model_providers.gateway={{name="Gateway",base_url="{gateway_url()}/v1",env_key="{KEY_ENV}",wire_api="responses"}}'
        inner = (
            f"cd {shlex.quote(workdir)} && . ~/.nvm/nvm.sh; "
            f"timeout {HOST_TIMEOUT_SEC} codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "
            f"-m {shlex.quote(self.model_name or CODEX_MODEL)} -c 'model_provider=\"gateway\"' -c {shlex.quote(provider)} {shlex.quote(instruction)} "
            f"</dev/null > {LOGS}/codex.jsonl 2> {LOGS}/codex.stderr; code=$?; "
            f"cp -r ~/.codex/sessions {LOGS}/codex-sessions 2>/dev/null; exit $code"
        )
        code = await self._docker_exec(environment, inner, (f"NO_PROXY={no_proxy()}", f"no_proxy={no_proxy()}"))
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
        context.n_input_tokens = usage.get("input_tokens")
        context.n_output_tokens = usage.get("output_tokens")
        context.n_cache_tokens = usage.get("cached_input_tokens")
