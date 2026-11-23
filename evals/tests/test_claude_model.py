import shlex
import unittest

from evals.cohort import HOSTS
from evals.gateway import CLAUDE_MODEL, CLAUDE_TIER_MODELS, claude_tier_exports


class ClaudeModelTest(unittest.TestCase):
    def test_every_requested_id_is_a_catalog_id_not_a_claude_one(self):
        ids = {HOSTS["claude-code"]["model"], *CLAUDE_TIER_MODELS.values()}
        self.assertEqual(HOSTS["claude-code"]["model"], CLAUDE_MODEL)
        self.assertFalse([i for i in ids if i.lower().startswith("claude-")])

    def test_exports_set_every_tier_variable_claude_code_reads(self):
        words = shlex.split(claude_tier_exports().rstrip("; "))
        self.assertEqual(words[0], "export")
        self.assertEqual(dict(w.split("=", 1) for w in words[1:]), CLAUDE_TIER_MODELS)
        self.assertEqual(CLAUDE_TIER_MODELS["ANTHROPIC_DEFAULT_SONNET_MODEL"], "glm-5.2")
        self.assertEqual(CLAUDE_TIER_MODELS["ANTHROPIC_DEFAULT_OPUS_MODEL"], "glm-5.3")
        self.assertEqual(CLAUDE_TIER_MODELS["ANTHROPIC_DEFAULT_HAIKU_MODEL"], "Minimax-M3")
