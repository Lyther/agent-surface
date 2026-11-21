"""Cohort post-attempt tests: the real finish step and the real scrubber on constructed attempt directories.

Harbor is not run. The only fake is the credential, an obviously invalid value written at test time.
"""

import asyncio
import json
import os
import tempfile
import types
import unittest
from unittest import mock
from pathlib import Path

from evals.agents import HOST_TIMEOUT_MARGIN_SEC, host_timeout
from evals.cohort import SpendGate, Unit, limits, finish_attempt, first_load_fields, injected_secrets, parse_spend, plan, run_order, spend_reading

FAKE_KEY = "fk-FAKE-not-a-real-factory-key-0123456789"
IMAGE = {"image_id": "sha256:feed"}
ARM = {"source_commit": "c0ffee", "arm_sha256": "abc123", "skills": ["dev-fix"], "desc_arm": "B"}
CELL = ("controls-no-skill", "droid", "dev", 1)


class FirstLoadTest(unittest.TestCase):
    TRIAL = {"agent_execution": {"started_at": "2026-11-21T10:00:00.000000Z"}}

    def test_seconds_run_from_the_agent_start_to_the_first_load(self):
        start = 1795255200.0  # 2026-11-21T10:00:00Z
        self.assertEqual(first_load_fields(self.TRIAL, {"ts": start + 12.34, "calls_before": 3}), {"first_load_seconds": 12.3, "calls_before_first_load": 3})

    def test_no_load_or_no_agent_start_gives_nulls(self):
        nulls = {"first_load_seconds": None, "calls_before_first_load": None}
        self.assertEqual(first_load_fields(self.TRIAL, None), nulls)
        self.assertEqual(first_load_fields({}, {"ts": 1.0, "calls_before": 0}), nulls)


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
        self.assertEqual((row["profile"], row["desc_arm"], row["arm_sha256"], row["dev_fix_installed"]), ("dev", "B", "abc123", True))
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
        cells = [[("controls-no-skill", "droid", "dev", rep)] for rep in (1, 2, 3, 4)]
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


SCENARIOS = Path(__file__).resolve().parents[1] / "scenarios"


class LimitsTest(unittest.TestCase):
    def args(self, **given):
        return types.SimpleNamespace(**{"cpus": None, "memory_mb": None, "agent_timeout_sec": None, **given})

    def test_caps_and_timeout_come_from_the_task_that_declares_them(self):
        self.assertEqual(limits(self.args(), Unit(SCENARIOS / "dev-fix" / "qa-f10-launcher-exec-bit")), {"cpus": 2, "memory_mb": 4096, "agent_timeout_sec": 1800.0})
        self.assertEqual(limits(self.args(), Unit(SCENARIOS / "controls" / "no-skill")), {"cpus": 1, "memory_mb": 2048, "agent_timeout_sec": 600.0})

    def test_a_given_value_overrides_the_declared_one_for_every_unit(self):
        got = limits(self.args(cpus=3, agent_timeout_sec=1200), Unit(SCENARIOS / "dev-fix" / "qa-f10-launcher-exec-bit"))
        self.assertEqual(got, {"cpus": 3, "memory_mb": 4096, "agent_timeout_sec": 1200})

    def test_the_host_cli_stops_before_harbor_does(self):
        with mock.patch.dict(os.environ, {"SQ_AGENT_TIMEOUT_SEC": "1800"}):
            self.assertEqual(host_timeout(), 1800 - HOST_TIMEOUT_MARGIN_SEC)
        with mock.patch.dict(os.environ, clear=True), self.assertRaises(KeyError):
            host_timeout()


class PlanTest(unittest.TestCase):
    ARGS = (["s1", "s2", "s3"], ["codex", "droid"], ["full", "full-descB", "full-descC"], 7, 2)

    def test_every_group_holds_all_arms_of_one_host_scenario_and_repetition(self):
        groups = plan(*self.ARGS)
        self.assertEqual(len(groups), 3 * 2 * 2)
        for group in groups:
            self.assertEqual(sorted(c[2] for c in group), ["full", "full-descB", "full-descC"])
            self.assertEqual(len({(c[0], c[1], c[3]) for c in group}), 1)

    def test_order_follows_the_seed_not_the_argument_order(self):
        scenarios, hosts, profiles, seed, reps = self.ARGS
        first = plan(scenarios, hosts, profiles, seed, reps)
        self.assertEqual(first, plan(scenarios[::-1], hosts[::-1], profiles[::-1], seed, reps))
        self.assertNotEqual(first, plan(scenarios, hosts, profiles, seed + 1, reps))

    def test_arms_are_shuffled_inside_each_group_by_the_group_seed(self):
        groups = plan(*self.ARGS)
        self.assertGreater(len({tuple(c[2] for c in g) for g in groups}), 1)


class AdmissionTest(unittest.TestCase):
    def test_a_group_is_admitted_whole_or_refused_whole(self):
        gate = SpendGate(cap=1000, reserve=100)
        self.assertIsNone(gate.admit(3))  # 300 held
        self.assertIsNone(gate.admit(3))  # 600 held
        self.assertIn("spend stop", gate.admit(5))  # 600 + 500 > 1000
        self.assertEqual(gate.pending, 6)  # the refused group held nothing

    def test_settled_spend_replaces_the_reserve_and_a_missing_reading_costs_the_reserve(self):
        gate = SpendGate(cap=1000, reserve=100)
        gate.admit(3)
        gate.settle(40)
        gate.settle(None)
        gate.settle(None, ran=False)
        self.assertEqual((gate.spent, gate.pending), (140, 0))
        self.assertIsNone(gate.admit(8))  # 140 + 800 <= 1000
        self.assertIn("spend stop", gate.admit(1))

    def test_spend_is_credits_for_droid_and_prompt_plus_output_tokens_for_gateway_hosts(self):
        self.assertEqual(spend_reading("droid", {"factory_credits": 4100, "tokens_in": 9}), 4100)
        self.assertEqual(spend_reading("codex", {"tokens_in": 1000, "tokens_out": 50, "factory_credits": 7}), 1050)
        self.assertEqual(spend_reading("claude-code", {"tokens_in": 1000, "tokens_out": None}), 1000)
        self.assertIsNone(spend_reading("codex", {"tokens_in": None, "tokens_out": 5}))
        self.assertIsNone(spend_reading("droid", {}))

    def test_caps_and_reserves_come_from_the_inputs_and_a_metered_host_needs_them(self):
        self.assertEqual(parse_spend(["droid=1500000:350000", "codex=20000000:3000000"], ["droid", "codex", "opencode"]),
                         {"droid": (1_500_000, 350_000), "codex": (20_000_000, 3_000_000)})
        for items, hosts in ((["droid=1500000:350000"], ["droid", "claude-code"]), ([], ["droid"]), (["opencode=5:1"], ["opencode"]), (["droid=0:1"], ["droid"]),
                             (["droid=10"], ["droid"]), (["droid=a:b"], ["droid"])):
            with self.assertRaises(SystemExit, msg=str(items)):
                parse_spend(items, hosts)

    def test_an_attempt_that_started_the_agent_but_has_no_reading_is_charged_the_reserve(self):
        gate = SpendGate(cap=1000, reserve=100)
        gate.admit(2)
        gate.settle(None, ran=True)  # an agent timeout: the model may have run
        gate.settle(None, ran=False)  # a setup failure
        self.assertEqual(gate.spent, 100)

    def groups(self):
        return [[("s", "h", p, r) for p in ("a", "b", "c")] for r in (1, 2, 3, 4)]

    def test_started_groups_run_all_their_arms_after_a_stop_and_later_groups_do_not_start(self):
        ran = []

        async def run_cell(cell):
            ran.append(cell)
            return cell[3] == 2 and cell[2] == "a"  # the second group asks to stop on its first arm

        self.assertTrue(asyncio.run(run_order(self.groups(), run_cell, 1)))
        self.assertEqual([(c[3], c[2]) for c in ran], [(1, "a"), (1, "b"), (1, "c"), (2, "a"), (2, "b"), (2, "c")])

    def test_a_refused_group_runs_none_of_its_arms(self):
        ran = []

        async def run_cell(cell):
            ran.append(cell[3])
            return False

        self.assertFalse(asyncio.run(run_order(self.groups(), run_cell, 1, admit=lambda g: g[0][3] != 2)))
        self.assertEqual(sorted(set(ran)), [1, 3, 4])
        self.assertEqual(len(ran), 9)


if __name__ == "__main__":
    unittest.main()
