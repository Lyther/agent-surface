"""Served-model probe tests on recorded response shapes (`fixtures/served/`, headers and first events of real gateway answers).

SUBSTITUTE_JUSTIFICATION
- replaces: the gateway, as a loopback HTTP server that replays a recorded response
- necessity: the real gateway needs the operator's key and a network route this suite never has
- real-proof: BLOCKED: the live probe at a cohort's start and end needs the gateway key and address; it is not run here
The parsers and the request builder are the real code, and the fixtures are real recordings (trimmed to the identity headers and the first body event).
"""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from evals.cohort import cohort_metadata
from evals.served import compare, droid_command, identity, ledger_value, parse_droid_stream, parse_gateway_response, probe_gateway, request_for

FIXTURES = Path(__file__).parent / "fixtures" / "served"
FAKE_KEY = "sk-" + "FAKE-not-a-real-gateway-key"


def recorded(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def parse(name: str) -> dict:
    shot = recorded(name)
    return parse_gateway_response(shot["headers"], shot["body"])


class ParseTest(unittest.TestCase):
    def test_messages_wire_serves_another_model_than_the_body_names(self):
        record = parse("messages-stream-glm.json")
        self.assertEqual(record["model"], "azure/glm-5.2")
        self.assertEqual(record["reported"], "claude-sonnet-5-5")  # the body echoes the requested id
        self.assertIsNone(record["provider"])

    def test_responses_wire_reads_gateway_and_provider_fields(self):
        record = parse("responses-stream-gpt55.json")
        self.assertEqual(record["model"], "openai/responses/gpt-5.5-2026-04-24")
        self.assertEqual(record["provider"], "deployment-gpt-5.5-2026-04-24-platform-global")
        self.assertEqual(record["reported"], "deployment-gpt-5.5-2026-04-24-platform-global")
        self.assertEqual(len(record["deployment"]), 64)

    def test_a_body_cut_short_still_gives_the_header_fields(self):
        record = parse("chat-gpt55-cut-body.json")
        self.assertEqual(record["model"], "openai/responses/gpt-5.5-2026-04-24")
        self.assertIsNone(record["reported"])

    def test_header_names_are_case_insensitive(self):
        shot = recorded("messages-stream-glm.json")
        record = parse_gateway_response({k.upper(): v for k, v in shot["headers"].items()}, shot["body"])
        self.assertEqual(record["model"], "azure/glm-5.2")

    def test_no_model_header_is_no_evidence(self):
        shot = recorded("messages-stream-glm.json")
        headers = {k: v for k, v in shot["headers"].items() if k != "x-litellm-model-name"}
        record = parse_gateway_response(headers, shot["body"])
        self.assertIsNone(record["model"])
        self.assertIn("x-litellm-model-name", record["reason"])
        self.assertIsNone(identity(record))

    def test_droid_init_event_names_the_model(self):
        self.assertEqual(parse_droid_stream((FIXTURES / "droid-init.jsonl").read_text()), {"model": "claude-sonnet-5"})

    def test_droid_stream_without_a_model_records_null_with_a_reason(self):
        no_init = (Path(__file__).parent / "fixtures" / "droid-no-skill" / "agent" / "droid.jsonl").read_text()
        found = parse_droid_stream(no_init)
        self.assertIsNone(found["model"])
        self.assertEqual(found["reason"], "the init event names no model")
        self.assertEqual(parse_droid_stream("")["reason"], "the output has no init event")


class Gateway(BaseHTTPRequestHandler):
    shot: dict = {}
    seen: list = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers["content-length"]))
        Gateway.seen.append({"path": self.path, "headers": dict(self.headers.items()), "body": json.loads(body)})
        data = Gateway.shot["body"].encode()
        self.send_response(Gateway.shot["status"])
        for key, value in Gateway.shot["headers"].items():
            self.send_header(key, value)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        return


class ProbeTest(unittest.TestCase):
    def serve(self, shot: dict) -> str:
        Gateway.shot, Gateway.seen = shot, []
        server = HTTPServer(("127.0.0.1", 0), Gateway)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f"http://127.0.0.1:{server.server_port}"

    def test_claude_code_probe_uses_the_messages_wire_and_reads_the_served_model(self):
        url = self.serve(recorded("messages-stream-glm.json"))
        record = probe_gateway("claude-code", url, "claude-sonnet-5-5", FAKE_KEY)
        sent = Gateway.seen[0]
        self.assertEqual(sent["path"], "/v1/messages")
        self.assertEqual(sent["body"]["model"], "claude-sonnet-5-5")
        self.assertEqual({k.lower(): v for k, v in sent["headers"].items()}["authorization"], f"Bearer {FAKE_KEY}")
        self.assertEqual(record["model"], "azure/glm-5.2")

    def test_codex_and_opencode_probe_the_responses_wire(self):
        url = self.serve(recorded("responses-stream-gpt55.json"))
        for host in ("codex", "opencode"):
            record = probe_gateway(host, url, "gpt-5.5", FAKE_KEY)
            self.assertEqual(Gateway.seen[-1]["path"], "/v1/responses")
            self.assertEqual(Gateway.seen[-1]["body"]["model"], "gpt-5.5")
            self.assertEqual(record["provider"], "deployment-gpt-5.5-2026-04-24-platform-global")

    def test_a_gateway_error_is_a_null_record_that_never_carries_the_key(self):
        url = self.serve({"status": 401, "headers": {}, "body": "{}"})
        record = probe_gateway("codex", url, "gpt-5.5", FAKE_KEY)
        self.assertIsNone(record["model"])
        self.assertEqual(record["reason"], "HTTP 401")
        self.assertNotIn(FAKE_KEY, json.dumps(record))

    def test_an_unreachable_gateway_is_a_null_record(self):
        record = probe_gateway("codex", "http://127.0.0.1:1", "gpt-5.5", FAKE_KEY)
        self.assertIsNone(record["model"])
        self.assertTrue(record["reason"].startswith("request failed"))

    def test_the_key_is_never_in_the_url_or_the_droid_command(self):
        self.assertNotIn(FAKE_KEY, request_for("codex", "http://gw", "gpt-5.5", FAKE_KEY).full_url)
        self.assertNotIn(FAKE_KEY, " ".join(droid_command("sha256:feed", "claude-sonnet-5")))


class CompareTest(unittest.TestCase):
    A = parse("messages-stream-glm.json")
    B = parse("responses-stream-gpt55.json")

    def test_equal_start_and_end_are_poolable(self):
        self.assertEqual(compare("claude-code", self.A, dict(self.A)), {"poolable": True, "why": None})

    def test_a_remapped_model_is_not_poolable(self):
        verdict = compare("claude-code", self.A, self.B)
        self.assertFalse(verdict["poolable"])
        self.assertIn("differs", verdict["why"])

    def test_the_same_name_behind_another_deployment_is_not_poolable(self):
        moved = {**self.A, "deployment": "0" * 64}
        self.assertFalse(compare("claude-code", self.A, moved)["poolable"])

    def test_a_reason_text_is_not_a_difference(self):
        self.assertTrue(compare("codex", {**self.B, "reason": "x"}, self.B)["poolable"])

    def test_a_gateway_host_that_named_no_model_is_not_poolable(self):
        nothing = parse_gateway_response({}, "")
        self.assertIn("start", compare("codex", nothing, self.B)["why"])
        self.assertIn("end", compare("codex", self.B, nothing)["why"])
        self.assertFalse(compare("codex", nothing, nothing)["poolable"])

    def test_droid_that_exposes_nothing_is_equal_to_itself_but_not_to_a_named_model(self):
        none = parse_droid_stream("")
        named = parse_droid_stream((FIXTURES / "droid-init.jsonl").read_text())
        self.assertTrue(compare("droid", none, dict(none))["poolable"])
        self.assertFalse(compare("droid", none, named)["poolable"])
        self.assertTrue(compare("droid", named, dict(named))["poolable"])

    def test_the_ledger_value_is_the_model_name_or_none(self):
        self.assertEqual(ledger_value(self.A), "azure/glm-5.2")
        self.assertIsNone(ledger_value(parse_droid_stream("")))


class CohortMetadataTest(unittest.TestCase):
    def test_start_then_end_marks_each_host_on_its_own_pair(self):
        a, b = parse("messages-stream-glm.json"), parse("responses-stream-gpt55.json")
        running = cohort_metadata({}, "sq1-test", ["claude-code", "codex"], {"claude-code": a, "codex": b}, None)
        self.assertIsNone(running["served_model"]["codex"]["poolable"])
        self.assertIsNone(running["ended"])
        done = cohort_metadata(running, "sq1-test", ["claude-code", "codex"], {"claude-code": a, "codex": b}, {"claude-code": b, "codex": dict(b)})
        self.assertEqual(done["started"], running["started"])
        self.assertFalse(done["served_model"]["claude-code"]["poolable"])
        self.assertTrue(done["served_model"]["codex"]["poolable"])
        self.assertEqual(done["served_model"]["codex"]["start"]["model"], "openai/responses/gpt-5.5-2026-04-24")
        self.assertEqual(done["prereg"], "sq1-test")


if __name__ == "__main__":
    unittest.main()
