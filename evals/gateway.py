"""Where the OpenAI- and Anthropic-compatible gateway (a LiteLLM proxy) lives, read from the environment.

The address and the proxy-bypass list are site details that stay out of the repository: the lab host loads them
from a private file before it starts a cohort. The key is never in the environment of the lab shell; it arrives on
stdin (`LAB_GATEWAY_KEY=...`) and reaches a container only through `docker exec -e`.
"""

from __future__ import annotations

import os

URL_ENV = "LAB_GATEWAY_URL"
NO_PROXY_ENV = "LAB_NO_PROXY"
KEY_ENV = "LAB_GATEWAY_KEY"
# Hosts that reach their model through the gateway.
GATEWAY_HOSTS = ("opencode", "claude-code", "codex")
# Claude Code asks the gateway for these catalog ids and nothing else: the gateway's `claude-*` ids are being removed. Each id is the model the
# host was served under the old Claude id (sonnet to glm-5.2, opus to glm-5.3, haiku to Minimax-M3), so the served model is the requested one.
CLAUDE_MODEL = "glm-5.2"
CLAUDE_TIER_MODELS = {
    "ANTHROPIC_DEFAULT_SONNET_MODEL": CLAUDE_MODEL,
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.3",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "Minimax-M3",
    "ANTHROPIC_SMALL_FAST_MODEL": "Minimax-M3",
}


def claude_tier_exports() -> str:
    """The `export` line that points every model variable Claude Code reads at a catalog id."""
    return "export " + " ".join(f"{name}={model}" for name, model in CLAUDE_TIER_MODELS.items()) + "; "


class GatewayConfigError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise GatewayConfigError(f"{name} is not set: load the lab environment file before using claude-code or codex")
    return value


def gateway_url() -> str:
    """Base URL of the gateway, without a trailing slash."""
    return _required(URL_ENV).rstrip("/")


def no_proxy() -> str:
    """Comma-separated hosts that must bypass any proxy; it has to cover the gateway."""
    return _required(NO_PROXY_ENV)
