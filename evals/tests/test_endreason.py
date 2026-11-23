"""End reason and applied output cap per attempt, from constructed trial results and host records shaped like the real ones.

The codex lines are the real stream of a cut attempt (SQ1 codex diagnosis); the others are built from each host's documented event shape.
"""

import json
import tempfile
import unittest
from pathlib import Path

from evals.agents import OPENCODE_OUTPUT_LIMIT
from evals.cohort import finish_attempt, injected_secrets
from evals.endreason import attempt_end

STARTED = {"started_at": "2026-11-21T10:00:00.000000Z", "finished_at": "2026-11-21T10:01:00.000000Z"}
CODEX_CUT = [
    {"type": "error", "message": "Incomplete response returned, reason: max_output_tokens"},
    {"type": "turn.failed", "error": {"message": "Incomplete response returned, reason: max_output_tokens"}},
]


# The real codex stream of an attempt the gateway's upstream provider refused with HTTP 429 after codex's own retries (SQ0.5 ramp), trimmed.
CODEX_CAPACITY = [
    {"type": "error", "message": "exceeded retry limit, last status: 429 Too Many Requests"},
    {"type": "turn.failed", "error": {"message": "exceeded retry limit, last status: 429 Too Many Requests"}},
]


def exception(kind: str, message: str = "") -> dict:
    return {"exception_type": kind, "exception_message": message}


class EndReasonTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.job = Path(tmp.name)

    def record(self, host: str, events: list[dict]) -> None:
        name = {"codex": "codex.jsonl", "opencode": "opencode.txt", "claude-code": "claude.jsonl", "droid": "droid.jsonl"}[host]
        agent = self.job / "trial" / "agent"
        agent.mkdir(parents=True, exist_ok=True)
        (agent / name).write_text("".join(json.dumps(e) + "\n" for e in events))

    def end(self, host: str, trial: dict) -> dict:
        return attempt_end(trial, self.job, host)

    def test_codex_output_cap_is_not_a_timeout_a_capacity_failure_or_an_exit(self):
        self.record("codex", CODEX_CUT)
        got = self.end("codex", {"agent_execution": STARTED, "exception_info": exception("NonZeroAgentExitCodeError", "codex exec exited 1")})
        self.assertEqual(got["end_reason"], "output_cap")

    def test_codex_without_an_error_ends_with_exit(self):
        self.record("codex", [{"type": "turn.completed", "usage": {}}])
        self.assertEqual(self.end("codex", {"agent_execution": STARTED})["end_reason"], "exit")

    def test_harbor_and_host_timeouts_are_timeouts(self):
        for kind, message in (("AgentTimeoutError", "Agent execution timed out after 900 seconds"), ("NonZeroAgentExitCodeError", "codex exec exited 124")):
            with self.subTest(kind=kind):
                self.assertEqual(self.end("codex", {"agent_execution": STARTED, "exception_info": exception(kind, message)})["end_reason"], "timeout")

    def test_a_provider_limit_in_the_exception_or_the_host_record_is_capacity(self):
        trial = {"agent_execution": STARTED, "exception_info": exception("NonZeroAgentExitCodeError", "opencode emitted error event(s): usage limit reached")}
        self.assertEqual(self.end("opencode", trial)["end_reason"], "capacity")
        self.record("codex", [{"type": "error", "message": "exceeded retry limit, last status: 429 Too Many Requests"}])
        trial = {"agent_execution": STARTED, "exception_info": exception("NonZeroAgentExitCodeError", "codex exec exited 1")}
        self.assertEqual(self.end("codex", trial)["end_reason"], "capacity")

    def test_the_real_codex_429_stream_is_capacity_from_either_event(self):
        trial = {"agent_execution": STARTED, "exception_info": exception("NonZeroAgentExitCodeError", "codex exec exited 1")}
        for events in (CODEX_CAPACITY, CODEX_CAPACITY[:1], CODEX_CAPACITY[1:]):
            with self.subTest(events=len(events)):
                self.record("codex", events)
                self.assertEqual(self.end("codex", trial), {"end_reason": "capacity", "output_cap": None})

    def test_a_capacity_stream_with_no_exception_or_before_the_agent_is_not_capacity(self):
        self.record("codex", CODEX_CAPACITY)
        self.assertEqual(self.end("codex", {"agent_execution": STARTED})["end_reason"], "exit")
        self.assertEqual(self.end("codex", {"exception_info": exception("RuntimeError", "codex exec exited 1")})["end_reason"], "setup_failure")

    def test_any_other_exception_is_an_error_and_one_before_the_agent_is_a_setup_failure(self):
        self.assertEqual(self.end("droid", {"agent_execution": STARTED, "exception_info": exception("NonZeroAgentExitCodeError", "droid exec exited 1")})["end_reason"], "error")
        self.assertEqual(self.end("droid", {"exception_info": exception("RuntimeError", "checksum mismatch")})["end_reason"], "setup_failure")

    def test_opencode_length_finish_is_an_output_cap_and_carries_the_configured_limit(self):
        self.record("opencode", [{"type": "step_finish", "part": {"reason": "tool-calls"}}, {"type": "step_finish", "part": {"reason": "length"}}])
        got = self.end("opencode", {"agent_execution": STARTED})
        self.assertEqual(got, {"end_reason": "output_cap", "output_cap": OPENCODE_OUTPUT_LIMIT})

    def test_opencode_stop_finish_is_an_exit(self):
        self.record("opencode", [{"type": "step_finish", "part": {"reason": "stop"}}])
        self.assertEqual(self.end("opencode", {"agent_execution": STARTED})["end_reason"], "exit")

    def test_claude_code_max_tokens_stop_is_an_output_cap_and_has_no_cap_to_report(self):
        self.record("claude-code", [{"type": "assistant", "message": {"id": "m1", "stop_reason": "max_tokens"}}])
        self.assertEqual(self.end("claude-code", {"agent_execution": STARTED}), {"end_reason": "output_cap", "output_cap": None})

    def test_hosts_without_a_cap_value_report_null(self):
        for host in ("codex", "droid", "claude-code"):
            self.assertIsNone(self.end(host, {"agent_execution": STARTED})["output_cap"])

    def test_the_ledger_row_carries_both_fields(self):
        out = self.job / "out"
        agent = out / "jobs" / "scn-codex-dev-1" / "trial" / "agent"
        agent.mkdir(parents=True)
        (agent / "codex.jsonl").write_text("".join(json.dumps(e) + "\n" for e in CODEX_CUT))
        trial = {"agent_execution": STARTED, "exception_info": exception("NonZeroAgentExitCodeError", "codex exec exited 1")}
        (agent.parent / "result.json").write_text(json.dumps(trial))
        ledger = out / "ledger.jsonl"
        image, arm = {"image_id": "i"}, {"source_commit": "c", "arm_sha256": "a", "skills": [], "desc_arm": "A"}
        finish_attempt(("scn", "codex", "dev", 1), image, arm, "t0", 1, out, injected_secrets({}), ledger, 5.0)
        row = json.loads(ledger.read_text())
        self.assertEqual((row["end_reason"], row["output_cap"], row["exception"]), ("output_cap", None, "NonZeroAgentExitCodeError"))
