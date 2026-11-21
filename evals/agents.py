"""Harbor agents for containers started from a prebuilt arm image (`evals/images.py`).

The host CLI and the arm's profile are already in the image, so `install` only proves they are there.
The Droid key comes from the harbor process environment (FACTORY_API_KEY), never from argv.
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


class ArmDroid(BaseInstalledAgent):
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

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        if not os.environ.get("FACTORY_API_KEY"):
            raise RuntimeError("FACTORY_API_KEY is not set in the harbor process environment")
        await self.exec_as_agent(environment, command=detector_start("droid"))
        container = await self._container(environment)
        workdir = (await environment.exec(command="pwd")).stdout.strip() or "/"
        inner = (
            f"cd {shlex.quote(workdir)} && [ -f ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh; "
            f"timeout {DROID_TIMEOUT_SEC} droid exec --skip-permissions-unsafe -m {DROID_MODEL} "
            f"--remove-tools {DROID_REMOVE_TOOLS} -o stream-json {shlex.quote(instruction)} "
            f"> {LOGS}/droid.jsonl 2> {LOGS}/droid.stderr"
        )
        # The key is inherited from this process's environment: `-e NAME` without a value keeps it out of argv.
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", "-e", "FACTORY_API_KEY", "-e", "FACTORY_DROID_AUTO_UPDATE_ENABLED=false",
            container, "bash", "-c", inner,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        code = await proc.wait()
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
