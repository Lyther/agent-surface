"""The gateway address comes from the environment; a missing value must fail naming the variable."""

import os
import unittest
from unittest import mock

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


if __name__ == "__main__":
    unittest.main()
