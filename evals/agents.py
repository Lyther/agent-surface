"""Harbor agents that install an arm into the attempt container and watch skill-file opens.

Arm selection and secrets come from the harbor process environment (SQ_ARM, SQ_OVERLAY, FACTORY_API_KEY),
never from argv.
"""

from __future__ import annotations

import asyncio
import json
import os
import shlex
from pathlib import Path
from typing import override

from harbor.agents.installed.base import BaseInstalledAgent, NonZeroAgentExitCodeError, with_prompt_template
from harbor.agents.installed.node_install import nvm_node_install_snippet
from harbor.agents.installed.opencode import OpenCode
from harbor.environments.base import BaseEnvironment
from harbor.environments.docker.docker import _sanitize_docker_compose_project_name
from harbor.models.agent.context import AgentContext

from evals.arms import LOGS, detector_start, install_arm

DROID_VERSION = "0.244.0"
DROID_URL = f"https://downloads.factory.ai/factory-cli/releases/{DROID_VERSION}/linux/x64"
DROID_MODEL = "claude-sonnet-5"
DROID_TIMEOUT_SEC = 900
# Outward-facing and administration tools removed in every arm, as in GR2.
DROID_REMOVE_TOOLS = (
    "SlackPostFile,SlackPostMessage,SlackCreateOrUpdateCodeChannel,SlackArchiveCodeChannel,SlackListChannels,store_agent_readiness_report,get_agent_effectiveness_usage,render_agent_effectiveness_report,ListEvalRuns,ListDatasets,ReadDataset,ReadEvalRun,CreateEvalRun,ListEvalPresets,SaveEvalPreset,CreateDataset,GenerateDroid,StageSettingsChanges,UpgradeSessionModel,ProposeMission,StartMissionRun,EndFeatureRun,DismissHandoffItems,ConnectApp,GenerateImage,ListAutomationTemplates,CreateAutomation,ListAutomations,ReadAutomation,EditAutomation,DeleteAutomation,RunAutomation,CreateWorkstream,ProposeWorkstream,AskUser"
)
APT_DEPS = "curl ca-certificates git procps inotify-tools"


async def _apt(agent, environment) -> None:
    await agent.exec_as_root(
        environment,
        command=f"apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends {APT_DEPS} >/dev/null",
    )


class ArmOpenCode(OpenCode):
    @staticmethod
    @override
    def name() -> str:
        return "arm-opencode"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _apt(self, environment)
        await super().install(environment)
        await install_arm(self, environment, "opencode")

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
        await _apt(self, environment)
        await self.exec_as_root(
            environment,
            command=(
                f"curl -fsSL -o /usr/local/bin/droid {DROID_URL}/droid && curl -fsSL -o /tmp/droid.sha256 {DROID_URL}/droid.sha256 && "
                "[ \"$(sha256sum /usr/local/bin/droid | cut -d' ' -f1)\" = \"$(cut -d' ' -f1 /tmp/droid.sha256)\" ] && chmod +x /usr/local/bin/droid"
            ),
        )
        await self.exec_as_agent(environment, command=nvm_node_install_snippet() + " >/dev/null")
        await install_arm(self, environment, "droid")

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
