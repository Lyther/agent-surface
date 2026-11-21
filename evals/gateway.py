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
GATEWAY_HOSTS = ("claude-code", "codex")


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
