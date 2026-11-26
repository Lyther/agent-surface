"""Cohort post-attempt tests: the real finish step and the real scrubber on constructed attempt directories.

Harbor is not run. The only fake is the credential, an obviously invalid value written at test time.
"""

import asyncio
import hashlib
import json
import os
import tempfile
import types
import unittest
from unittest import mock
from pathlib import Path

from evals.agents import HOST_TIMEOUT_MARGIN_SEC, host_timeout
from evals.cohort import AGENT_ENDS_TO_STOP, RETRIES, SETUP_FAILURES_TO_STOP, HostStops, SpendGate, Unit, attempt_name, is_capacity_end, is_launch_failure, limits, next_attempt, run_with_retries, finish_attempt, first_load_fields, first_target_load_seconds, calls_before_first_target_load, injected_secrets, parse_models, parse_spend, plan, row_extra, run_order, spend_reading

FAKE_KEY = "fk-" + "FAKE-not-a-real-factory-key-0123456789"  # built at run time so a secret scanner does not flag the source
IMAGE = {"image_id": "sha256:feed"}
ARM = {"source_commit": "c0ffee", "arm_sha256": "abc123", "skills": ["dev-fix"], "desc_arm": "B"}
CELL = ("controls-no-skill", "droid", "dev", 1)


def setup_failure(exception="RuntimeError"):
    return {"harbor": "arm-codex", "cli_version": "1", "exception": exception, "seconds_agent": None, "end_reason": "setup_failure"}


def agent_end(exception=None, end_reason="exit"):
    return {"harbor": "arm-codex", "cli_version": "1", "exception": exception, "seconds_agent": 60.0, "end_reason": end_reason}


class HostStopsTest(unittest.TestCase):
    def feed(self, rows, host="codex", **options):
        stops = HostStops(**options)
        for row in rows:
            stops.observe(host, row)
        return stops

    def test_with_timeouts_as_outcomes_ends_at_the_agent_cap_never_stop_the_host(self):
        timeout = agent_end("AgentTimeoutError", "timeout")
        rows = [timeout, agent_end("NonZeroAgentExitCodeError", "timeout"), timeout, timeout]
        self.assertTrue(self.feed(rows).stopped("codex"))
        self.assertFalse(self.feed(rows, timeouts_stop=False).stopped("codex"))

    def test_with_timeouts_as_outcomes_an_end_at_the_cap_breaks_a_streak_and_the_other_rules_still_stop(self):
        same = agent_end("NonZeroAgentExitCodeError", "error")
        cap = agent_end("NonZeroAgentExitCodeError", "capacity")
        self.assertFalse(self.feed([same, same, agent_end("AgentTimeoutError", "timeout"), same], timeouts_stop=False).stopped("codex"))
        self.assertTrue(self.feed([same, same, same], timeouts_stop=False).stopped("codex"))
        self.assertTrue(self.feed([cap, cap, cap], timeouts_stop=False).stopped("codex"))
        self.assertTrue(self.feed([setup_failure(), setup_failure()], timeouts_stop=False).stopped("codex"))

    def test_two_consecutive_setup_failures_with_one_exception_stop_the_host(self):
        self.assertEqual(SETUP_FAILURES_TO_STOP, 2)
        stops = self.feed([setup_failure(), setup_failure()])
        self.assertTrue(stops.stopped("codex"))
        self.assertIn("2 consecutive setup failures", stops.reasons["codex"])
        self.assertFalse(stops.stopped("droid"))

    def test_different_exceptions_or_a_success_between_do_not_stop_on_setup(self):
        self.assertFalse(self.feed([setup_failure("RuntimeError"), setup_failure("OSError")]).stopped("codex"))
        self.assertFalse(self.feed([setup_failure(), agent_end(), setup_failure()]).stopped("codex"))

    def test_an_agent_exception_is_not_a_setup_failure(self):
        self.assertFalse(self.feed([agent_end("NonZeroAgentExitCodeError"), agent_end("NonZeroAgentExitCodeError")]).stopped("codex"))

    def test_three_consecutive_ends_at_the_agent_cap_stop_the_host(self):
        self.assertEqual(AGENT_ENDS_TO_STOP, 3)
        timeout = agent_end("AgentTimeoutError", "timeout")
        self.assertFalse(self.feed([timeout, timeout]).stopped("codex"))
        stops = self.feed([timeout, agent_end("NonZeroAgentExitCodeError", "timeout"), timeout])  # Harbor's cap and the host's own timeout are both the cap
        self.assertIn("agent cap", stops.reasons["codex"])

    def test_three_consecutive_ends_in_the_same_agent_exception_stop_the_host(self):
        same = agent_end("NonZeroAgentExitCodeError", "error")
        self.assertTrue(self.feed([same, same, same]).stopped("codex"))
        self.assertFalse(self.feed([same, same, agent_end("RuntimeError", "error")]).stopped("codex"))

    def test_a_normal_exit_or_a_setup_failure_breaks_the_agent_streak(self):
        same = agent_end("NonZeroAgentExitCodeError", "error")
        self.assertFalse(self.feed([same, same, agent_end(), same]).stopped("codex"))
        self.assertFalse(self.feed([same, same, setup_failure(), same]).stopped("codex"))

    def test_skipped_quarantined_and_launch_failure_rows_are_not_observed(self):
        same = agent_end("NonZeroAgentExitCodeError", "error")
        noise = [{"skipped": "spend stop"}, {"status": "quarantined"}, {"harbor": None, "cli_version": None, "exception": None, "seconds_agent": None}]
        self.assertTrue(self.feed([same, noise[0], same, noise[1], noise[2], same]).stopped("codex"))

    def test_three_consecutive_capacity_ends_stop_the_host_whatever_their_exception(self):
        cap = agent_end("NonZeroAgentExitCodeError", "capacity")
        self.assertFalse(self.feed([cap, cap]).stopped("codex"))
        stops = self.feed([cap, agent_end("RuntimeError", "capacity"), cap])
        self.assertIn("upstream capacity", stops.reasons["codex"])
        self.assertFalse(self.feed([cap, cap, agent_end("NonZeroAgentExitCodeError", "error"), cap]).stopped("codex"))

    def test_hosts_are_counted_apart(self):
        stops = HostStops()
        for host in ("codex", "droid", "codex", "droid"):
            stops.observe(host, setup_failure())
        self.assertEqual(sorted(stops.reasons), ["codex", "droid"])
        stops = HostStops()
        for host in ("codex", "droid", "codex"):
            stops.observe(host, setup_failure() if host == "codex" else agent_end())
        self.assertTrue(stops.stopped("codex"))  # another host's row does not break codex's streak


class RowExtraTest(unittest.TestCase):
    def args(self, **given):
        return types.SimpleNamespace(**{"concurrency": 6, "arms_together": False, "timeouts_are_outcomes": False, "purpose": None, "prereg": None, **given})

    def test_a_run_with_timeouts_as_outcomes_says_so_on_every_row(self):
        self.assertEqual(row_extra(self.args(arms_together=True, timeouts_are_outcomes=True, prereg="ab01")),
                         {"concurrency": 6, "arms_together": True, "timeouts_are_outcomes": True, "prereg": "ab01"})
        self.assertNotIn("timeouts_are_outcomes", row_extra(self.args()))


class FirstLoadTest(unittest.TestCase):
    TRIAL = {"agent_execution": {"started_at": "2026-11-21T10:00:00.000000Z"}}

    def test_seconds_run_from_the_agent_start_to_the_first_load(self):
        start = 1795255200.0  # 2026-11-21T10:00:00Z
        self.assertEqual(first_load_fields(self.TRIAL, {"ts": start + 12.34, "calls_before": 3}), {"first_load_seconds": 12.3, "calls_before_first_load": 3})

    def test_the_target_skills_own_first_load_is_timed_not_the_first_of_any_skill(self):
        start = 1795255200.0
        loads = {"qa-review": {"ts": start + 5.0, "calls_before": 1}, "dev-fix": {"ts": start + 40.26, "calls_before": 6}}
        self.assertEqual(first_target_load_seconds(self.TRIAL, loads, "dev-fix"), 40.3)
        self.assertIsNone(first_target_load_seconds(self.TRIAL, loads, "verify-test"))  # the target never loaded
        self.assertIsNone(first_target_load_seconds(self.TRIAL, loads, None))  # not a trigger attempt
        self.assertIsNone(first_target_load_seconds({}, loads, "dev-fix"))  # the agent never started

    def test_calls_before_the_target_skills_own_first_load_not_the_first_of_any_skill(self):
        loads = {"qa-review": {"ts": 5.0, "calls_before": 1}, "dev-fix": {"ts": 40.0, "calls_before": 6}}
        self.assertEqual(calls_before_first_target_load(loads, "dev-fix"), 6)
        self.assertIsNone(calls_before_first_target_load(loads, "verify-test"))  # the target never loaded
        self.assertIsNone(calls_before_first_target_load(loads, None))  # not a trigger attempt

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

    def test_a_retry_is_scanned_in_its_own_directory_and_every_row_stays(self):
        self.attempt_dir("controls-no-skill-droid-dev-1", leak=False)
        self.attempt_dir("controls-no-skill-droid-dev-1-a2", leak=True)
        self.assertFalse(finish_attempt(CELL, IMAGE, ARM, "t0", 1, self.out, self.secrets, self.ledger, extra={"attempt_no": 1}, attempt_no=1))
        self.assertTrue(finish_attempt(CELL, IMAGE, ARM, "t1", 0, self.out, self.secrets, self.ledger, attempt_no=2))
        first, second = self.rows()
        self.assertEqual((first["attempt_no"], first["harbor"]), (1, None))
        self.assertEqual((second["attempt_no"], second["status"]), (2, "quarantined"))
        self.assertTrue((self.out / "jobs" / "controls-no-skill-droid-dev-1").exists())
        self.assertTrue((self.out / "quarantine" / "controls-no-skill-droid-dev-1-a2").is_dir())

    def test_input_echo_is_logged_on_the_row_and_does_not_stop(self):
        sample = "ghp_" + "C" * 36
        name = "controls-no-skill-droid-dev-1"
        self.attempt_dir(name, leak=False)
        (self.out / "logs" / f"{name}.log").write_text("the agent read a skill that says " + sample + "\n")
        known = frozenset({("github-token", hashlib.sha256(sample.encode()).hexdigest())})
        stop = finish_attempt(CELL, IMAGE, ARM, "t0", 0, self.out, self.secrets, self.ledger, known=known)
        (row,) = self.rows()
        self.assertEqual((stop, row["receipt_scan"], row["scrub_input_echo"], "status" in row), (False, "clean", {"github-token": 1}, False))
        self.assertNotIn(sample, self.ledger.read_text())

    def test_the_same_bytes_without_the_list_quarantine_and_the_injected_key_still_does_with_it(self):
        sample = "ghp_" + "C" * 36
        known = frozenset({("github-token", hashlib.sha256(sample.encode()).hexdigest())})
        name = "controls-no-skill-droid-dev-1"
        self.attempt_dir(name, leak=False)
        (self.out / "logs" / f"{name}.log").write_text(sample)
        self.assertTrue(finish_attempt(CELL, IMAGE, ARM, "t0", 0, self.out, self.secrets, self.ledger))
        self.assertEqual(self.rows()[0]["hit_names"], ["github-token"])
        self.attempt_dir(name + "-a2", leak=True)  # the injected key in the trajectory, with the list in force
        self.assertTrue(finish_attempt(CELL, IMAGE, ARM, "t0", 0, self.out, self.secrets, self.ledger, attempt_no=2, known=known))
        self.assertEqual(self.rows()[1]["status"], "quarantined")
        self.assertIn("FACTORY_API_KEY", self.rows()[1]["hit_names"])

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

    def test_a_size_declared_the_way_harbor_reads_it_gives_its_megabytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            task = Path(tmp)
            (task / "task.toml").write_text('[agent]\ntimeout_sec = 900.0\n\n[environment]\ncpus = 1\nmemory = "2G"\n')
            self.assertEqual(limits(self.args(), Unit(task)), {"cpus": 1, "memory_mb": 2048, "agent_timeout_sec": 900.0})
            (task / "task.toml").write_text('[agent]\ntimeout_sec = 900.0\n\n[environment]\ncpus = 1\n')
            with self.assertRaises(ValueError):  # nothing to pass Harbor as the memory cap
                limits(self.args(), Unit(task))
            self.assertEqual(limits(self.args(memory_mb=1024), Unit(task))["memory_mb"], 1024)

    def test_the_host_cli_stops_before_harbor_does(self):
        with mock.patch.dict(os.environ, {"SQ_AGENT_TIMEOUT_SEC": "1800"}):
            self.assertEqual(host_timeout(), 1800 - HOST_TIMEOUT_MARGIN_SEC)
        with mock.patch.dict(os.environ, clear=True), self.assertRaises(KeyError):
            host_timeout()


LAUNCH_FAILED = {"harbor": None, "cli_version": None, "exception": None, "attempt_no": 1}
RAN = {"harbor": "arm-droid", "cli_version": "0.244.0", "seconds_agent": 12.0}


class LaunchRetryTest(unittest.TestCase):
    def test_a_retry_gets_its_own_job_name_and_the_first_attempt_keeps_the_old_one(self):
        self.assertEqual(attempt_name(CELL), "controls-no-skill-droid-dev-1")
        self.assertEqual(attempt_name(CELL, 3), "controls-no-skill-droid-dev-1-a3")

    def test_only_a_row_without_harbor_and_version_is_a_launch_failure(self):
        self.assertTrue(is_launch_failure(LAUNCH_FAILED))
        self.assertFalse(is_launch_failure(RAN))
        self.assertFalse(is_launch_failure({**LAUNCH_FAILED, "status": "quarantined"}))
        self.assertFalse(is_launch_failure({"harbor": None, "cli_version": None, "skipped": "cap"}))
        self.assertFalse(is_launch_failure({**RAN, "exception": "AgentTimeoutError"}))  # an attempt that started and failed is not retried

    def test_next_attempt_resumes_after_the_last_row_and_ends_with_a_result_or_the_retries(self):
        self.assertEqual(next_attempt([]), 1)
        self.assertEqual(next_attempt([LAUNCH_FAILED]), 2)
        self.assertEqual(next_attempt([LAUNCH_FAILED, {**LAUNCH_FAILED, "attempt_no": 2}]), 3)
        self.assertIsNone(next_attempt([LAUNCH_FAILED, {**RAN, "attempt_no": 2}]))
        self.assertIsNone(next_attempt([{**LAUNCH_FAILED, "attempt_no": n} for n in range(1, RETRIES + 2)]))

    def test_a_capacity_end_is_a_retried_try_like_a_launch_failure(self):
        cap = {**RAN, "exception": "NonZeroAgentExitCodeError", "end_reason": "capacity", "attempt_no": 1}
        self.assertTrue(is_capacity_end(cap))
        self.assertFalse(is_capacity_end({**cap, "end_reason": "error"}))
        self.assertFalse(is_capacity_end({"skipped": "upstream capacity ended 4 tries", "end_reason": "capacity"}))
        self.assertEqual(next_attempt([cap]), 2)
        self.assertEqual(next_attempt([LAUNCH_FAILED, {**cap, "attempt_no": 2}]), 3)  # one budget for both kinds
        self.assertIsNone(next_attempt([{**cap, "attempt_no": n} for n in range(1, RETRIES + 2)]))
        self.assertIsNone(next_attempt([{**cap, "attempt_no": n} for n in range(1, RETRIES + 2)] + [{"skipped": "upstream capacity ended 4 tries"}]))
        self.assertIsNone(next_attempt([cap, {**RAN, "attempt_no": 2}]))

    def test_capacity_ends_are_retried_up_to_the_limit_unless_the_host_stopped(self):
        cap = {**RAN, "end_reason": "capacity"}
        calls = []

        async def run_once(number):
            calls.append(number)
            return cap, False

        row, _ = asyncio.run(run_with_retries(run_once, 1))
        self.assertEqual((calls, row), ([1, 2, 3, 4], cap))
        calls.clear()
        asyncio.run(run_with_retries(run_once, 1, lambda: len(calls) >= 2))
        self.assertEqual(calls, [1, 2])

    def test_launch_failures_are_retried_up_to_the_limit_and_nothing_else_is(self):
        def runner(rows):
            calls = []

            async def run_once(number):
                calls.append(number)
                return rows[min(len(calls), len(rows)) - 1], False

            return calls, run_once

        calls, run_once = runner([LAUNCH_FAILED, LAUNCH_FAILED, RAN])
        row, _ = asyncio.run(run_with_retries(run_once, 1))
        self.assertEqual((calls, row), ([1, 2, 3], RAN))
        calls, run_once = runner([LAUNCH_FAILED])
        asyncio.run(run_with_retries(run_once, 1))
        self.assertEqual(calls, [1, 2, 3, 4])  # the first attempt and three retries
        calls, run_once = runner([{**RAN, "exception": "AgentTimeoutError"}])
        asyncio.run(run_with_retries(run_once, 1))
        self.assertEqual(calls, [1])

    def test_a_stop_ends_the_retries(self):
        calls = []

        async def run_once(number):
            calls.append(number)
            return LAUNCH_FAILED, True

        asyncio.run(run_with_retries(run_once, 1))
        self.assertEqual(calls, [1])


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
        self.assertEqual(parse_spend(["droid=1500000:350000", "codex=20000000:3000000"], ["droid", "codex"]),
                         {"droid": (1_500_000, 350_000), "codex": (20_000_000, 3_000_000)})
        for items, hosts in ((["droid=1500000:350000"], ["droid", "claude-code"]), ([], ["droid"]), (["bogus=5:1"], ["droid"]), ([], ["opencode"]), (["droid=0:1"], ["droid"]),
                             (["droid=10"], ["droid"]), (["droid=a:b"], ["droid"])):
            with self.assertRaises(SystemExit, msg=str(items)):
                parse_spend(items, hosts)

    def test_an_uncapped_host_is_an_explicit_choice_per_metered_host(self):
        self.assertEqual(parse_spend(["droid=uncapped", "codex=20000000:3000000"], ["droid", "codex"]), {"droid": None, "codex": (20_000_000, 3_000_000)})
        for items in (["bogus=uncapped"], ["droid=Uncapped"], ["droid=uncapped:1"]):
            with self.assertRaises(SystemExit, msg=str(items)):
                parse_spend(items, ["droid"])

    def test_only_droid_takes_another_model_and_the_id_is_plain(self):
        self.assertEqual(parse_models(["droid=deepseek-v4.1-flash"]), {"droid": "deepseek-v4.1-flash"})
        self.assertEqual(parse_models([]), {})
        for items in (["opencode=gpt-5.5"], ["droid="], ["droid=x y"], ["droid=m;id"], ["droid=-m"]):
            with self.assertRaises(SystemExit, msg=str(items)):
                parse_models(items)

    def test_an_attempt_that_started_the_agent_but_has_no_reading_is_charged_the_reserve(self):
        gate = SpendGate(cap=1000, reserve=100)
        gate.admit(2)
        gate.settle(None, ran=True)  # an agent timeout: the model may have run
        gate.settle(None, ran=False)  # a setup failure
        self.assertEqual(gate.spent, 100)

    def test_a_retried_capacity_end_spends_without_holding_a_slot(self):
        gate = SpendGate(cap=1000, reserve=100)
        gate.admit(1)
        gate.charge(250)  # a capacity end with a reading
        gate.charge(None)  # one without: the reserve
        gate.settle(None, ran=False)  # the cell's slot, its spend already charged
        self.assertEqual((gate.spent, gate.pending), (350, 0))

    def groups(self):
        return [[("s", "h", p, r) for p in ("a", "b", "c")] for r in (1, 2, 3, 4)]

    def test_a_quarantine_launches_nothing_further_and_abandons_the_rest_of_its_group(self):
        ran, abandoned = [], []

        async def run_cell(cell):
            ran.append(cell)
            return cell[3] == 2 and cell[2] == "a"  # the second group's first arm is quarantined

        stopped = asyncio.run(run_order(self.groups(), run_cell, 1, abandon=abandoned.extend))
        self.assertTrue(stopped)
        self.assertEqual([(c[3], c[2]) for c in ran], [(1, "a"), (1, "b"), (1, "c"), (2, "a")])
        self.assertEqual([(c[3], c[2]) for c in abandoned], [(2, "b"), (2, "c")])  # later groups never start and are not recorded

    def test_a_quarantine_in_one_group_also_abandons_the_rest_of_a_group_running_beside_it(self):
        ran, abandoned = [], []

        async def run_cell(cell):
            ran.append((cell[3], cell[2]))
            await asyncio.sleep(0)
            return cell[3] == 1 and cell[2] == "a"

        asyncio.run(run_order(self.groups()[:2], run_cell, 2, abandon=abandoned.extend))
        self.assertNotIn((2, "c"), ran)
        self.assertIn((2, "c"), [(c[3], c[2]) for c in abandoned])

    def test_a_spend_stop_refuses_new_groups_and_lets_started_groups_finish(self):
        gate = SpendGate(cap=700, reserve=100)
        refused, ran = [], []

        def admit(group):
            why = gate.admit(len(group))
            if why:
                refused.append(group[0][3])
            return not why

        async def run_cell(cell):
            ran.append((cell[3], cell[2]))
            gate.settle(100)
            return False

        asyncio.run(run_order(self.groups(), run_cell, 1, admit=admit, abandon=lambda cells: self.fail("a spend stop abandons nothing")))
        self.assertEqual(sorted({r for r, _ in ran}), [1, 2])  # 700 / 100 = 7 attempts: two groups of three fit, the third is refused whole
        self.assertEqual(len(ran), 6)
        self.assertEqual(refused, [3, 4])

    def test_a_host_stop_abandons_that_hosts_started_groups_and_leaves_other_hosts_running(self):
        ran, abandoned = [], []
        stopped_hosts = set()

        async def run_cell(cell):
            ran.append((cell[1], cell[3], cell[2]))
            if cell[1] == "bad" and cell[3] == 1 and cell[2] == "a":
                stopped_hosts.add("bad")  # the host's rule trips on its first attempt
            return False

        groups = [[("s", host, p, r) for p in ("a", "b")] for host in ("bad", "good") for r in (1, 2)]
        stopped = asyncio.run(run_order(groups, run_cell, 1, abandon=abandoned.extend, halted=stopped_hosts.__contains__))
        self.assertFalse(stopped)  # the cohort is not stopped
        self.assertEqual([(c[1], c[3], c[2]) for c in abandoned], [("bad", 1, "b"), ("bad", 2, "a"), ("bad", 2, "b")])  # main's admit refuses a new group beforehand
        self.assertEqual([r for r in ran if r[0] == "good"], [("good", 1, "a"), ("good", 1, "b"), ("good", 2, "a"), ("good", 2, "b")])
        self.assertEqual([r for r in ran if r[0] == "bad"], [("bad", 1, "a")])

    def test_concurrency_above_four_is_not_refused(self):
        running, peak = 0, 0

        async def run_cell(cell):
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.01)
            running -= 1
            return False

        groups = [[("s", "h", "a", r)] for r in range(1, 17)]
        asyncio.run(run_order(groups, run_cell, 8))
        self.assertEqual(peak, 8)

    def test_together_starts_every_arm_of_a_group_at_once_and_counts_groups(self):
        running, peak, order = 0, 0, []

        async def run_cell(cell):
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            order.append(cell[3])
            await asyncio.sleep(0.01)
            running -= 1
            return False

        asyncio.run(run_order(self.groups(), run_cell, 2, together=True))
        self.assertEqual(peak, 6)  # two groups of three arms
        self.assertEqual(len(order), 12)

    def test_together_a_quarantine_starts_no_further_group_and_abandons_nothing(self):
        ran = []

        async def run_cell(cell):
            ran.append((cell[3], cell[2]))
            await asyncio.sleep(0)
            return cell[3] == 2 and cell[2] == "b"

        stopped = asyncio.run(run_order(self.groups(), run_cell, 1, abandon=lambda cells: self.fail("no arm is left to abandon"), together=True))
        self.assertTrue(stopped)
        self.assertEqual(sorted(ran), [(1, "a"), (1, "b"), (1, "c"), (2, "a"), (2, "b"), (2, "c")])

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
