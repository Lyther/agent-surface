"""The gateway address comes from the environment; a missing value must fail naming the variable."""

import json
import os
from pathlib import Path
import unittest
from unittest import mock

from evals.agents import OPENCODE_MODEL, OPENCODE_OUTPUT_LIMIT, opencode_config
from evals.listing import parse_opencode_bodies
from evals.gateway import GatewayConfigError, gateway_url, no_proxy


class GatewayConfigTest(unittest.TestCase):
    def test_values_come_from_the_environment(self):
        with mock.patch.dict(os.environ, {"LAB_GATEWAY_URL": "http://gateway.example:4000/", "LAB_NO_PROXY": "gateway.example"}):
            self.assertEqual(gateway_url(), "http://gateway.example:4000")
            self.assertEqual(no_proxy(), "gateway.example")

    def test_missing_values_fail_with_the_variable_name(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            for call, name in ((gateway_url, "LAB_GATEWAY_URL"), (no_proxy, "LAB_NO_PROXY")):
                with self.assertRaisesRegex(GatewayConfigError, name):
                    call()


class OpenCodeConfigTest(unittest.TestCase):
    def test_every_request_carries_an_explicit_output_limit_and_the_key_is_a_placeholder(self):
        config = json.loads(opencode_config("http://gateway.example:4000/v1"))
        self.assertIs(config["snapshot"], False)
        provider = config["provider"]["gateway"]
        self.assertEqual(provider["npm"], "@ai-sdk/openai")  # the Responses API, as Codex uses
        self.assertEqual(provider["options"], {"baseURL": "http://gateway.example:4000/v1", "apiKey": "{env:LAB_GATEWAY_KEY}"})
        self.assertEqual(provider["models"][OPENCODE_MODEL]["limit"]["output"], OPENCODE_OUTPUT_LIMIT)
        self.assertEqual((OPENCODE_MODEL, OPENCODE_OUTPUT_LIMIT), ("gpt-5.5", 32000))


class OpenCodeListingTest(unittest.TestCase):
    def test_skills_and_the_output_limit_come_from_the_captured_responses_request(self):
        body = json.loads((Path(__file__).parent / "fixtures" / "listing-opencode-request.json").read_text())
        skills, meta = parse_opencode_bodies([body])
        self.assertEqual(skills, {"customize-opencode": "Use ONLY when editing opencode's own configuration.",
                                  "dev-fix": "Apply the minimal effective patch that restores functionality."})
        self.assertEqual((meta["requested_model"], meta["max_output_tokens"]), ("gpt-5.5", 32000))
        with self.assertRaises(RuntimeError):
            parse_opencode_bodies([{"input": [{"role": "user", "content": "hi"}]}])


if __name__ == "__main__":
    unittest.main()
