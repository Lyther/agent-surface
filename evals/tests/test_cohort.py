"""Cohort post-attempt tests: the real finish step and the real scrubber on constructed attempt directories.

Harbor is not run. The only fake is the credential, an obviously invalid value written at test time.
"""

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from evals.cohort import finish_attempt, injected_secrets, run_order

FAKE_KEY = "fk-FAKE-not-a-real-factory-key-0123456789"
IMAGE = {"image_id": "sha256:feed"}
ARM = {"source_commit": "c0ffee", "arm_sha256": "abc123", "skills": ["dev-fix"]}
CELL = ("controls-no-skill", "droid", "dev", 1)


class CohortFinishTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.out = Path(tmp.name)
        self.ledger = self.out / "ledger.jsonl"
        self.secrets = injected_secrets({"FACTORY_API_KEY": FAKE_KEY})

    def attempt_dir(self, name: str, leak: bool) -> None:
        job = self.out / "jobs" / name / "trial" / "agent"
        job.mkdir(parents=True)
        (job / "droid.jsonl").write_text(json.dumps({"type": "message", "text": FAKE_KEY if leak else "OK"}) + "\n")
        (self.out / "logs").mkdir(exist_ok=True)
        (self.out / "logs" / f"{name}.log").write_text("harbor log\n")

    def rows(self) -> list[dict]:
        return [json.loads(line) for line in self.ledger.read_text().splitlines()]

    def test_clean_attempt_is_ledgered_and_does_not_stop(self):
        self.attempt_dir("controls-no-skill-droid-dev-1", leak=False)
        stop = finish_attempt(CELL, IMAGE, ARM, "t0", 0, self.out, self.secrets, self.ledger, 12.34)
        self.assertFalse(stop)
        (row,) = self.rows()
        self.assertEqual((row["receipt_scan"], row["seconds_total"], row["image_id"]), ("clean", 12.3, "sha256:feed"))
        self.assertEqual((row["profile"], row["desc_arm"], row["arm_sha256"], row["dev_fix_installed"]), ("dev", "A", "abc123", True))
        self.assertNotIn("status", row)
        self.assertTrue((self.out / "jobs" / "controls-no-skill-droid-dev-1").exists())

    def test_planted_secret_quarantines_ledgers_and_stops(self):
        self.attempt_dir("controls-no-skill-droid-dev-1", leak=True)
        stop = finish_attempt(CELL, IMAGE, ARM, "t0", 0, self.out, self.secrets, self.ledger)
        self.assertTrue(stop)
        (row,) = self.rows()
        self.assertEqual(row["status"], "quarantined")
        self.assertEqual((row["hits"], row["hit_names"]), (2, ["FACTORY_API_KEY", "factory-key"]))  # exact value and key-prefix pattern
        self.assertNotIn("verifier_reward", row)
        self.assertNotIn(FAKE_KEY, self.ledger.read_text())
        self.assertFalse((self.out / "jobs" / "controls-no-skill-droid-dev-1").exists())
        self.assertTrue((self.out / "quarantine" / "controls-no-skill-droid-dev-1").is_dir())

    def test_pattern_hit_without_an_injected_secret_quarantines(self):
        self.attempt_dir("controls-no-skill-opencode-dev-1", leak=False)
        log = self.out / "logs" / "controls-no-skill-opencode-dev-1.log"
        log.write_text("Authorization: Bearer " + "a" * 32 + "\n")
        stop = finish_attempt(("controls-no-skill", "opencode", "dev", 1), IMAGE, ARM, "t0", 0, self.out, [], self.ledger)
        self.assertTrue(stop)
        self.assertEqual(self.rows()[0]["hit_names"], ["authorization-bearer"])

    def test_cohort_stops_after_the_leaking_attempt_and_keeps_earlier_rows(self):
        cells = [("controls-no-skill", "droid", "dev", rep) for rep in (1, 2, 3, 4)]
        started = []

        async def run_cell(cell):
            started.append(cell[3])
            name = "controls-no-skill-droid-dev-%d" % cell[3]
            self.attempt_dir(name, leak=cell[3] == 2)
            return finish_attempt(cell, IMAGE, ARM, "t0", 0, self.out, self.secrets, self.ledger)

        stopped = asyncio.run(run_order(cells, run_cell, concurrency=1))
        self.assertTrue(stopped)
        self.assertEqual(started, [1, 2])
        self.assertEqual([r.get("status", "clean") for r in self.rows()], ["clean", "quarantined"])


if __name__ == "__main__":
    unittest.main()
