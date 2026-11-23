"""The served-model probe: which model answered a tiny request sent the way the agent's requests are sent.

The gateway answers every request with the id that was requested in the body, so the served model is in the gateway's response headers
(`x-litellm-model-name`, the deployment's `x-litellm-model-id`, and the provider's `llm_provider-x-account-deployment` when it returns one).
The probe is one non-streaming request on the host's own wire (Messages for claude-code, Responses for codex and opencode), with the host's model
id and key, to the same gateway address. Droid has no gateway: its `droid exec` stream-json opens with an init event that names the session's model.

A cohort probes every host at its start and at its end (`evals/cohort.py`); a host whose two values differ is not poolable (preregistration section 8, rule 5).
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request

from evals.gateway import GATEWAY_HOSTS

PROMPT = "Say hi in one word."
# Basis: the lab's earlier gateway probes used a 120 s curl limit; a probe that hangs must not hold a cohort's start.
TIMEOUT_SEC = 120
# The Messages wire needs a limit in the request; this is only enough for a short reply.
MESSAGES_MAX_TOKENS = 64
ANTHROPIC_VERSION = "2023-06-01"
WIRES = {"claude-code": "/v1/messages", "codex": "/v1/responses", "opencode": "/v1/responses"}
# Which response header carries which part of the identity.
SERVED_HEADERS = {"model": "x-litellm-model-name", "deployment": "x-litellm-model-id", "provider": "llm_provider-x-account-deployment"}
FIELDS = (*SERVED_HEADERS, "reported")


def _body_model(body: str) -> str | None:
    """The `model` the response body names: a JSON object's own field, or the first event of an event stream (`message.model` or `response.model`)."""
    candidates = [body.strip()] + [line[5:].strip() for line in body.splitlines() if line.startswith("data:")][:1]
    for text in candidates:
        try:
            obj = json.loads(text)
        except ValueError:
            continue
        if not isinstance(obj, dict):
            continue
        for node in (obj, obj.get("message"), obj.get("response")):
            if isinstance(node, dict) and isinstance(node.get("model"), str):
                return node["model"]
    return None


def parse_gateway_response(headers: dict[str, str], body: str) -> dict:
    """The served identity out of one gateway response: `{model, deployment, provider, reported}`, each a string or None.

    `reported` is the model the body names, which is the requested id on the Messages wire and so is no evidence by itself. A response with no
    `x-litellm-model-name` has not told us what served it: the result is all None with a `reason`.
    """
    lowered = {key.lower(): value for key, value in headers.items()}
    record = {field: lowered.get(header) for field, header in SERVED_HEADERS.items()}
    record["reported"] = _body_model(body)
    if record["model"] is None:
        return {**{field: None for field in FIELDS}, "reason": f"the response has no {SERVED_HEADERS['model']} header"}
    return record


def parse_droid_stream(stdout: str) -> dict:
    """The model named by the init event of a `droid exec -o stream-json` stream, as `{model: str}`; else `{model: None, reason}`.

    Droid reports the session's model, not a server-side confirmation: it is as much as the host exposes.
    """
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict) and event.get("type") == "system" and event.get("subtype") == "init":
            if isinstance(event.get("model"), str):
                return {"model": event["model"]}
            return {"model": None, "reason": "the init event names no model"}
    return {"model": None, "reason": "the output has no init event"}


def request_for(host: str, base_url: str, model: str, key: str) -> urllib.request.Request:
    """The probe request on the host's wire; the key goes in a header, never in the URL."""
    path = WIRES[host]
    if host == "claude-code":
        payload = {"model": model, "max_tokens": MESSAGES_MAX_TOKENS, "messages": [{"role": "user", "content": PROMPT}]}
        extra = {"anthropic-version": ANTHROPIC_VERSION}
    else:
        payload = {"model": model, "input": PROMPT, "stream": False}
        extra = {}
    headers = {"content-type": "application/json", "authorization": f"Bearer {key}", **extra}
    return urllib.request.Request(base_url.rstrip("/") + path, json.dumps(payload).encode(), headers, method="POST")


def probe_gateway(host: str, base_url: str, model: str, key: str) -> dict:
    """Probe one gateway host. Never raises: a failure is a record with `model` None and the reason (no key, URL or body text)."""
    try:
        with urllib.request.urlopen(request_for(host, base_url, model, key), timeout=TIMEOUT_SEC) as reply:
            return parse_gateway_response(dict(reply.headers.items()), reply.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as err:
        err.close()
        reason = f"HTTP {err.code}"
    except (urllib.error.URLError, OSError, ValueError) as err:
        reason = f"request failed ({type(err).__name__})"
    return {**{field: None for field in FIELDS}, "reason": reason}


def droid_command(image: str, model: str) -> list[str]:
    """`docker run` of the host image with the key passed by name from this process's environment, so it is never in argv."""
    return ["docker", "run", "--rm", "--cpus", "1", "--memory", "2048m", "-e", "FACTORY_API_KEY", "-e", "FACTORY_DROID_AUTO_UPDATE_ENABLED=false",
            image, "timeout", str(TIMEOUT_SEC - 10), "droid", "exec", "-m", model, "-o", "stream-json", PROMPT]


def probe_droid(image: str, model: str, key: str) -> dict:
    """Probe droid through a throwaway container of its host image; never raises."""
    try:
        done = subprocess.run(droid_command(image, model), capture_output=True, text=True, timeout=TIMEOUT_SEC, env={**os.environ, "FACTORY_API_KEY": key})
    except (OSError, subprocess.TimeoutExpired) as err:
        return {"model": None, "reason": f"droid probe failed ({type(err).__name__})"}
    found = parse_droid_stream(done.stdout)
    if found["model"] is None and done.returncode != 0:
        found["reason"] += f"; droid exec exited {done.returncode}"
    return found


def identity(record: dict | None) -> tuple | None:
    """What two probes are compared on: every identity field, never the free-text reason."""
    if record is None or record.get("model") is None:
        return None
    return tuple(record.get(field) for field in FIELDS)


def compare(host: str, start: dict | None, end: dict | None) -> dict:
    """The cohort's served-model verdict for one host: `poolable` and, when not, `why`.

    A gateway host must have named its model at both ends. Droid may expose nothing (then both ends read None, which is equal and not evidence
    of a change); a probe that read a model at one end only is a change.
    """
    first, last = identity(start), identity(end)
    if host in GATEWAY_HOSTS and (first is None or last is None):
        return {"poolable": False, "why": "the gateway did not name the served model at " + ("the start" if first is None else "the end")}
    if first != last:
        return {"poolable": False, "why": "the served model at the start differs from the one at the end"}
    return {"poolable": True, "why": None}


def ledger_value(record: dict | None) -> str | None:
    """The row's `served_model`: the model name the cohort's start probe read, None when it read none."""
    return None if record is None else record.get("model")
