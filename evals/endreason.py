"""Why an attempt ended, and the output cap it ran under, read from the trial result and the host's own record.

`end_reason` is one of:
- `setup_failure`: an exception before the agent started (no agent execution span);
- `output_cap`: the host's record shows a response cut at the output limit (codex: an error or `turn.failed` saying "reason: max_output_tokens";
  opencode: the last `step_finish` reason is `length`; claude-code: the last assistant message's `stop_reason` is `max_tokens`);
- `timeout`: Harbor's agent timeout, or the host CLI's own `timeout` (exit 124);
- `capacity`: another exception whose text, or the host's error text, names a provider limit (rate limit, 429, overload, quota, 5xx);
- `error`: any other exception;
- `exit`: no exception.
droid's record has no output-cap signal, so a droid cap end shows as `error` or `exit`.

`output_cap` is the cap the attempt ran under when it is known: opencode gets `limit.output` from the lab's config, which its requests carry. Codex
sends none and the gateway applies its own default, which shows only in the provider's response, not in the host's session data; droid and claude-code
expose none. Those are null.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from evals.agents import OPENCODE_OUTPUT_LIMIT

TIMEOUT_EXCEPTIONS = ("AgentTimeoutError",)
HOST_TIMEOUT_EXIT = re.compile(r"exited 124\b")
CAPACITY = re.compile(r"rate.?limit|too many requests|\b429\b|overloaded|usage limit|quota|capacity|service unavailable|\b50[0-4]\b", re.IGNORECASE)
CODEX_CAP = re.compile(r"reason:\s*max_output_tokens")
APPLIED_CAP = {"opencode": OPENCODE_OUTPUT_LIMIT}
RECORD = {"opencode": "opencode.txt", "claude-code": "claude.jsonl", "codex": "codex.jsonl", "droid": "droid.jsonl"}


def events(job_dir: Path, host: str) -> list[dict]:
    out = []
    for path in sorted(job_dir.rglob(RECORD[host])):
        for line in path.read_text(errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict):
                out.append(event)
    return out


def host_errors(host: str, found: list[dict]) -> list[str]:
    """Error text the host's record carries."""
    if host == "codex":
        return [str((e.get("error") or e).get("message") or "") for e in found if e.get("type") in ("error", "turn.failed")]
    if host == "opencode":
        return [str(((e.get("error") or {}).get("data") or {}).get("message") or e.get("error") or "") for e in found if e.get("type") == "error"]
    if host == "claude-code":
        return [str(e.get("result") or "") for e in found if e.get("type") == "result" and e.get("is_error")]
    return []


def cut_at_cap(host: str, found: list[dict], errors: list[str]) -> bool:
    if host == "codex":
        return any(CODEX_CAP.search(text) for text in errors)
    if host == "opencode":
        reasons = [(e.get("part") or {}).get("reason") for e in found if e.get("type") == "step_finish"]
        return bool(reasons) and reasons[-1] == "length"
    if host == "claude-code":
        stops = [(e.get("message") or {}).get("stop_reason") for e in found if e.get("type") == "assistant"]
        return bool(stops) and stops[-1] == "max_tokens"
    return False


def attempt_end(trial: dict, job_dir: Path, host: str) -> dict:
    """`end_reason` and `output_cap` for one attempt."""
    exception = trial.get("exception_info")
    kind = exception.get("exception_type") if isinstance(exception, dict) else exception
    message = str(exception.get("exception_message") or "") if isinstance(exception, dict) else ""
    found = events(job_dir, host)
    errors = host_errors(host, found)
    started = bool((trial.get("agent_execution") or {}).get("started_at"))
    if cut_at_cap(host, found, errors):
        reason = "output_cap"
    elif not exception:
        reason = "exit"
    elif not started:
        reason = "setup_failure"
    elif kind in TIMEOUT_EXCEPTIONS or HOST_TIMEOUT_EXIT.search(message):
        reason = "timeout"
    elif CAPACITY.search(" ".join([message, *errors])):
        reason = "capacity"
    else:
        reason = "error"
    return {"end_reason": reason, "output_cap": APPLIED_CAP.get(host)}
