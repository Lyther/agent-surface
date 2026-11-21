"""Token accounting: both hosts' usage shapes (trimmed real runs) normalise to the same ledger meaning.

`tokens_in` is the whole prompt summed over requests, `tokens_cache` its cached part, `model_requests` the number
of model requests.
"""

import types
import unittest
from pathlib import Path

from evals.agents import ArmClaude, ArmCodex

FIXTURES = Path(__file__).parent / "fixtures"


def populate(agent_class, fixture: str):
    agent = object.__new__(agent_class)
    agent.logs_dir = FIXTURES / fixture
    context = types.SimpleNamespace(n_input_tokens=None, n_output_tokens=None, n_cache_tokens=None, metadata=None)
    agent.populate_context_post_run(context)
    return context


class UsageTest(unittest.TestCase):
    def test_claude_code_input_includes_cache_reads_and_writes(self):
        context = populate(ArmClaude, "usage-claude-code")
        # usage: input 4372 (uncached) + 23104 cache reads + 0 cache writes
        self.assertEqual((context.n_input_tokens, context.n_cache_tokens, context.n_output_tokens), (27476, 23104, 102))
        self.assertEqual(context.metadata["model_requests"], 2)  # streamed assistant events repeat one message id

    def test_codex_input_is_already_the_whole_prompt(self):
        context = populate(ArmCodex, "usage-codex")
        self.assertEqual((context.n_input_tokens, context.n_cache_tokens, context.n_output_tokens), (57465, 56448, 509))
        self.assertEqual(context.metadata["model_requests"], 3)


if __name__ == "__main__":
    unittest.main()
