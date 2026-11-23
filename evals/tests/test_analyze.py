"""Analysis tests on synthetic ledgers whose numbers were worked out by hand (the Wilson and Newcombe values come from the closed formulas).

Nothing is replaced: `analyze.py` reads the parameter file and ledger rows, and the rows here are constructed in the shape `evals/cohort.py` writes.
"""

import json
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

from evals.analyze import AnalysisError, analyse, bootstrap, classify, denominators, load_params, main, need_better, newcombe, percentile, read_contrast, wilson, z_value

PARAMS_FILE = Path(__file__).parent / "fixtures" / "analysis-params-example.json"
PARAMS = load_params(PARAMS_FILE)
PROFILE = {"A": "full", "B": "full-descB", "C": "full-descC"}
Z = z_value(Fraction("0.95"))


def trigger_row(arm, qid, cls, rep, loaded, skill="dev-fix", host="codex", split="held-out", **more):
    profile = PROFILE[arm]
    row = {"scenario": f"trigger-{qid}", "profile": profile, "desc_arm": arm, "host": host, "rep": rep, "harbor": f"arm-{host}", "cli_version": "1",
           "arm_sha256": PARAMS.arms[f"{host}-{profile}"]["arm_sha256"], "prereg": "sq1-t1", "query_id": qid, "query_class": cls, "target_skill": skill,
           "split": split, "skills_loaded": loaded, "exception": None, "seconds_agent": 30.0, "verifier_reward": None, "audit_disagreements": []}
    return row | more


def trigger_cell(arm, loads: dict[str, list[list[str]]], cls, **more):
    """Rows of one arm: `loads` maps a query id to its repetitions' loaded skills."""
    return [trigger_row(arm, qid, cls, rep, loaded, **more) for qid, reps in loads.items() for rep, loaded in enumerate(reps, 1)]


def outcome_row(profile, scenario, rep, reward, loaded=(), host="codex", **more):
    row = {"scenario": scenario, "profile": profile, "desc_arm": "A", "host": host, "rep": rep, "harbor": f"arm-{host}", "cli_version": "1",
           "arm_sha256": PARAMS.arms[f"{host}-{profile}"]["arm_sha256"], "prereg": "sq1-o1", "skills_loaded": list(loaded), "exception": None, "seconds_agent": 600.0,
           "verifier_reward": reward, "dev_fix_installed": profile == "full", "audit_disagreements": [], "workspace_skill_reads": []}
    return row | more


def outcome_cell(profile, scenario, rewards, loads=()):
    """Rows of one arm and scenario; `loads` maps a scenario to how many of its first repetitions loaded the asset."""
    count = dict(loads).get(scenario, 0)
    return [outcome_row(profile, scenario, rep, r, ["dev-fix"] if rep <= count else []) for rep, r in enumerate(rewards, 1)]


def contrast(result, host, skill, candidate, base):
    return next(c for c in result["trigger"][host]["contrasts"] if (c["skill"], c["candidate"], c["base"]) == (skill, candidate, base))


def cell(result, host, skill, arm, metric):
    return next(c for c in result["trigger"][host]["cells"] if (c["skill"], c["arm"], c["metric"]) == (skill, arm, metric))


NO = [[], []]
YES = [["dev-fix"], ["dev-fix"]]
HALF = [["dev-fix"], []]


class FormulaTest(unittest.TestCase):
    def test_wilson_zero_of_five_has_the_closed_form_upper_bound(self):
        low, high = wilson(0, 5, Z)
        self.assertAlmostEqual(low, 0.0, places=9)
        self.assertAlmostEqual(high, Z * Z / (5 + Z * Z), places=9)  # 3.8416 / 8.8416
        self.assertAlmostEqual(high, 0.4345, places=4)

    def test_wilson_values(self):
        for x, n, low, high in ((6, 8, 0.4093, 0.9285), (1, 8, 0.0224, 0.4709), (1, 5, 0.0362, 0.6245), (5, 5, 0.5655, 1.0)):
            got = wilson(x, n, Z)
            self.assertAlmostEqual(got[0], low, places=4)
            self.assertAlmostEqual(got[1], high, places=4)
        self.assertIsNone(wilson(0, 0, Z))

    def test_newcombe_values(self):
        for args, low, high in (((5, 5, 1, 5), 0.1926, 0.9638), ((3, 5, 3, 5), -0.4649, 0.4649), ((0, 5, 0, 5), -0.4345, 0.4345)):
            got = newcombe(*args, Z)
            self.assertAlmostEqual(got[0], low, places=4)
            self.assertAlmostEqual(got[1], high, places=4)

    def test_units_needed_are_two_thirds_rounded_up(self):
        self.assertEqual([need_better(n, PARAMS) for n in (1, 2, 3, 4, 6, 8, 12)], [1, 2, 2, 3, 4, 6, 8])

    def test_percentile_interpolates(self):
        self.assertEqual(percentile([0.0, 1.0, 2.0, 3.0, 4.0], 0.25), 1.0)
        self.assertEqual(percentile([0.0, 10.0], 0.5), 5.0)

    def test_the_rule_needs_both_the_size_and_the_count(self):
        # Mean +0.25 over four units but only two better: size is enough, count is not.
        self.assertEqual(classify("recall", Fraction(1, 4), 2, 0, 4, PARAMS), "criterion not met")
        self.assertEqual(classify("recall", Fraction(1, 4), 3, 0, 4, PARAMS), "gain")
        self.assertEqual(classify("recall", Fraction(1, 11), 4, 0, 4, PARAMS), "criterion not met")  # below +0.10
        self.assertEqual(classify("false_trigger", Fraction(-1, 4), 3, 0, 4, PARAMS), "gain")  # lower false triggers are good
        self.assertEqual(classify("false_trigger", Fraction(1, 4), 0, 3, 4, PARAMS), "harm")
        self.assertEqual(classify("recall", Fraction(1, 10), 3, 0, 4, PARAMS), "gain")  # exactly +0.10 counts

    def test_reading_of_a_contrast(self):
        ok = "criterion not met"
        self.assertEqual(read_contrast({"recall": "gain", "false_trigger": ok, "misrouting": ok}, "B"), "B better")
        self.assertEqual(read_contrast({"recall": ok, "false_trigger": "harm", "misrouting": ok}, "B"), "B worse")
        self.assertEqual(read_contrast({"recall": "gain", "false_trigger": "harm", "misrouting": ok}, "B"), "mixed")
        self.assertEqual(read_contrast({"recall": ok, "false_trigger": "gain", "misrouting": ok}, "C"), "not detected")


class BootstrapTest(unittest.TestCase):
    def test_constant_reps_and_equal_effect_collapse_to_the_difference(self):
        pairs = [([1] * 5, [0] * 5)] * 4
        got = bootstrap(pairs, "s", 10000, Fraction("0.95"))
        self.assertEqual(got, {"stage1_and_2": [1.0, 1.0], "stage1_only": [1.0, 1.0]})

    def test_stage_two_widens_what_stage_one_alone_reports_as_certain(self):
        # The two queries differ by 0.4 and 0.4 (2 of 5 against 0, then 3 of 5 against 1): stage 1 alone is a point, stage 2 is not.
        pairs = [([1, 1, 0, 0, 0], [0, 0, 0, 0, 0]), ([1, 1, 1, 0, 0], [1, 0, 0, 0, 0])]
        got = bootstrap(pairs, "s", 2000, Fraction("0.95"))
        self.assertLess(got["stage1_only"][0], got["stage1_only"][1] + 1e-12)
        self.assertGreater(got["stage1_and_2"][1] - got["stage1_and_2"][0], got["stage1_only"][1] - got["stage1_only"][0])

    def test_same_seed_same_interval_and_no_pairs_no_interval(self):
        pairs = [([1, 0, 1, 0, 0], [0, 0, 1, 0, 0]), ([1, 1, 0, 1, 1], [0, 1, 0, 0, 0]), ([0, 0, 0, 1, 0], [0, 0, 0, 0, 0]), ([1, 0, 0, 0, 0], [1, 1, 0, 0, 1])]
        self.assertEqual(bootstrap(pairs, "k", 500, Fraction("0.95")), bootstrap(pairs, "k", 500, Fraction("0.95")))
        self.assertNotEqual(bootstrap(pairs, "k", 500, Fraction("0.95")), bootstrap(pairs, "other", 500, Fraction("0.95")))
        self.assertIsNone(bootstrap([], "k", 500, Fraction("0.95")))


class TriggerTest(unittest.TestCase):
    def equal_arms(self):
        rows = []
        for arm in "ABC":
            rows += trigger_cell(arm, {"q1": YES, "q2": HALF, "q3": NO, "q4": NO}, "should-trigger")
            rows += trigger_cell(arm, {"n1": HALF, "n2": NO, "n3": NO, "n4": NO}, "near-miss")
        return rows

    def test_equal_arms_have_equal_rates_and_no_detected_effect(self):
        result = analyse(self.equal_arms(), PARAMS)
        recall = cell(result, "codex", "dev-fix", "A", "recall")
        self.assertEqual((recall["successes"], recall["attempts"], recall["rate"]), (3, 8, 0.375))
        self.assertAlmostEqual(recall["wilson"][0], 0.1368, places=4)
        self.assertAlmostEqual(recall["wilson"][1], 0.6943, places=4)
        fa = cell(result, "codex", "dev-fix", "A", "false_trigger")
        self.assertEqual((fa["successes"], fa["attempts"]), (1, 8))
        self.assertAlmostEqual(fa["wilson"][0], 0.0224, places=4)
        for candidate, base in (("B", "A"), ("C", "A"), ("C", "B")):
            found = contrast(result, "codex", "dev-fix", candidate, base)
            self.assertEqual(found["reading"], "not detected")
            for metric in ("recall", "false_trigger", "misrouting"):
                self.assertEqual((found[metric]["mean_difference"], found[metric]["better"], found[metric]["worse"], found[metric]["class"]), (0.0, 0, 0, "criterion not met"))
            self.assertEqual(found["recall"]["tied"], 4)
            self.assertEqual(found["recall"]["interval"]["stage1_only"], [0.0, 0.0])
            low, high = found["recall"]["interval"]["stage1_and_2"]
            self.assertLessEqual(low, 0.0)
            self.assertGreaterEqual(high, 0.0)

    def test_a_known_effect_is_a_gain_with_hand_counted_units(self):
        rows = []
        rows += trigger_cell("A", {"q1": NO, "q2": NO, "q3": HALF, "q4": NO}, "should-trigger")
        rows += trigger_cell("B", {"q1": YES, "q2": YES, "q3": YES, "q4": NO}, "should-trigger")
        for arm in "AB":
            rows += trigger_cell(arm, {"n1": NO, "n2": NO, "n3": NO, "n4": NO}, "near-miss")
        found = contrast(analyse(rows, PARAMS), "codex", "dev-fix", "B", "A")["recall"]
        # unit differences 1, 1, 0.5, 0: mean 0.625, three better, one tied; 3 is ceil(8/3).
        self.assertEqual((found["units"], found["better"], found["tied"], found["worse"]), (4, 3, 1, 0))
        self.assertEqual((found["mean_difference"], found["class"]), (0.625, "gain"))
        self.assertEqual((found["successes_x"], found["attempts_x"], found["successes_y"], found["attempts_y"]), (6, 8, 1, 8))
        result = analyse(rows, PARAMS)
        self.assertEqual(contrast(result, "codex", "dev-fix", "B", "A")["reading"], "B better")
        self.assertAlmostEqual(cell(result, "codex", "dev-fix", "B", "recall")["wilson"][0], 0.4093, places=4)

    def test_a_gain_with_a_false_trigger_harm_is_mixed(self):
        rows = []
        rows += trigger_cell("A", {"q1": NO, "q2": NO, "q3": NO, "q4": NO}, "should-trigger") + trigger_cell("B", {"q1": YES, "q2": YES, "q3": YES, "q4": YES}, "should-trigger")
        rows += trigger_cell("A", {"n1": NO, "n2": NO, "n3": NO, "n4": NO}, "near-miss") + trigger_cell("B", {"n1": YES, "n2": YES, "n3": YES, "n4": NO}, "near-miss")
        found = contrast(analyse(rows, PARAMS), "codex", "dev-fix", "B", "A")
        self.assertEqual((found["recall"]["class"], found["false_trigger"]["class"], found["reading"]), ("gain", "harm", "mixed"))
        self.assertEqual((found["false_trigger"]["mean_difference"], found["false_trigger"]["worse"]), (0.75, 3))

    def test_misrouting_host_added_and_the_matrix(self):
        sibling, host_added, both = [["qa-trace"]], [["review"]], [["dev-fix", "qa-trace"]]
        rows = trigger_cell("A", {"q1": sibling * 2, "q2": host_added * 2, "q3": both * 2, "q4": NO}, "should-trigger")
        result = analyse(rows, PARAMS)
        misrouted = cell(result, "codex", "dev-fix", "A", "misrouting")
        self.assertEqual((misrouted["successes"], misrouted["attempts"]), (2, 8))  # q1 only: q3 loaded the target, q2 loaded nothing installed
        added = next(c for c in result["trigger"]["codex"]["host_added_loaded"] if (c["skill"], c["arm"]) == ("dev-fix", "A"))
        self.assertEqual((added["successes"], added["attempts"]), (2, 8))  # q2 only; the host-added load is not misrouting
        self.assertEqual(result["trigger"]["codex"]["misrouting_matrix"], [{"arm": "A", "target": "dev-fix", "loaded": {"qa-trace": 2}}])
        self.assertEqual(cell(result, "codex", "dev-fix", "A", "recall")["successes"], 2)

    def test_dev_split_and_other_hosts_stay_out_of_the_primary(self):
        rows = trigger_cell("A", {"q1": YES, "q2": NO, "q3": NO, "q4": NO}, "should-trigger")
        rows += trigger_cell("A", {"d1": YES}, "should-trigger", split="dev")
        rows += trigger_cell("A", {"q1": NO}, "should-trigger", host="droid")
        result = analyse(rows, PARAMS)
        self.assertEqual(cell(result, "codex", "dev-fix", "A", "recall")["attempts"], 8)
        self.assertEqual(cell(result, "droid", "dev-fix", "A", "recall")["attempts"], 2)

    def test_pooled_units_cover_every_skill_and_the_comparison_count_is_printed(self):
        rows = []
        for skill in ("dev-fix", "verify-test"):
            hit = [[skill], [skill]]
            rows += trigger_cell("A", {f"{skill}-q1": NO, f"{skill}-q2": NO}, "should-trigger", skill=skill)
            rows += trigger_cell("B", {f"{skill}-q1": hit, f"{skill}-q2": hit}, "should-trigger", skill=skill)
        result = analyse(rows, PARAMS)
        pooled = contrast(result, "codex", "pooled", "B", "A")["recall"]
        self.assertEqual((pooled["units"], pooled["mean_difference"], pooled["class"]), (4, 1.0, "gain"))
        self.assertEqual(contrast(result, "codex", "verify-test", "B", "A")["recall"]["units"], 2)
        self.assertEqual(result["trigger"]["codex"]["comparisons"], 27)

    def test_the_analysis_is_deterministic(self):
        rows = self.equal_arms()
        self.assertEqual(json.dumps(analyse(rows, PARAMS)), json.dumps(analyse(list(rows), PARAMS)))


class FirstLoadTest(unittest.TestCase):
    def test_median_over_the_attempts_that_loaded_with_the_load_count(self):
        rows = [trigger_row("A", "q1", "should-trigger", rep, ["dev-fix"], first_target_load_seconds=s, first_load_seconds=s - 5.0, calls_before_first_load=0, calls_before_first_target_load=c) for rep, (s, c) in enumerate(((10.0, 1), (30.0, 3), (20.0, 2)), 1)]
        rows.append(trigger_row("A", "q2", "should-trigger", 1, [], first_target_load_seconds=None, first_load_seconds=None, calls_before_first_load=None, calls_before_first_target_load=None))
        got = next(e for e in analyse(rows, PARAMS)["trigger"]["codex"]["first_load"] if (e["skill"], e["arm"]) == ("dev-fix", "A"))
        self.assertEqual((got["attempts"], got["loaded"], got["median_seconds"], got["median_calls"]), (4, 3, 20.0, 2))
        self.assertLessEqual(got["interval_seconds"][0], 20.0)
        self.assertGreaterEqual(got["interval_seconds"][1], 20.0)
        none = next(e for e in analyse(rows, PARAMS)["trigger"]["codex"]["first_load"] if (e["skill"], e["arm"]) == ("dev-fix", "B"))
        self.assertEqual((none["loaded"], none["median_seconds"], none["interval_seconds"]), (0, None, None))


class DenominatorTest(unittest.TestCase):
    def rows(self):
        base = trigger_cell("A", {"q1": YES}, "should-trigger")  # two completed attempts
        extra = [
            trigger_row("A", "q2", "should-trigger", 1, [], exception="RuntimeError", seconds_agent=None),  # setup failure
            trigger_row("A", "q2", "should-trigger", 2, ["dev-fix"], exception="AgentTimeoutError"),  # agent-end failure; its load counts
            {"scenario": "trigger-q3", "profile": "full", "host": "codex", "rep": 1, "skipped": "spend stop", "prereg": "sq1-t1", "query_id": "q3",
             "query_class": "should-trigger", "target_skill": "dev-fix", "split": "held-out"},
            {"scenario": "trigger-q3", "profile": "full", "host": "codex", "rep": 2, "skipped": "quarantine stop", "group_incomplete": True, "prereg": "sq1-t1",
             "query_id": "q3", "query_class": "should-trigger", "target_skill": "dev-fix", "split": "held-out"},
            {"scenario": "trigger-q4", "profile": "full", "host": "codex", "rep": 1, "status": "quarantined", "hits": 1, "prereg": "sq1-t1", "query_id": "q4",
             "query_class": "should-trigger", "target_skill": "dev-fix", "split": "held-out"},
            # a launch failure retried: only the second try is an attempt
            trigger_row("A", "q5", "should-trigger", 1, [], harbor=None, cli_version=None, seconds_agent=None),
            trigger_row("A", "q5", "should-trigger", 1, [], attempt_no=2),
            # a capacity end retried: only the retry is an attempt; its partial load is never read
            trigger_row("A", "q7", "should-trigger", 1, ["dev-fix"], exception="NonZeroAgentExitCodeError", end_reason="capacity"),
            trigger_row("A", "q7", "should-trigger", 1, [], attempt_no=2),
            # a capacity cell that used up its retries is skipped, the capacity tries kept as the record
            trigger_row("A", "q8", "should-trigger", 1, ["dev-fix"], exception="NonZeroAgentExitCodeError", end_reason="capacity"),
            {"scenario": "trigger-q8", "profile": "full", "host": "codex", "rep": 1, "skipped": "upstream capacity ended 4 tries", "prereg": "sq1-t1", "query_id": "q8",
             "query_class": "should-trigger", "target_skill": "dev-fix", "split": "held-out"},
            # a cell whose every try was a launch failure is no attempt
            trigger_row("A", "q6", "should-trigger", 1, [], harbor=None, cli_version=None, seconds_agent=None),
        ]
        return base + extra

    def test_counts_per_attempt_class_and_the_denominator(self):
        result = analyse(self.rows(), PARAMS)
        entry = result["denominators"]["trigger"][0]
        self.assertEqual({k: entry[k] for k in ("completed", "setup_failure", "agent_end_failure", "verifier_failure", "skipped", "group_incomplete", "quarantined", "denominator", "launch_failure_cells")},
                         {"completed": 4, "setup_failure": 1, "agent_end_failure": 1, "verifier_failure": 0, "skipped": 2, "group_incomplete": 1, "quarantined": 1, "denominator": 10, "launch_failure_cells": 1})
        self.assertEqual((entry["capacity_tries"], entry["capacity_cells"]), (2, 0))
        self.assertEqual((entry["host"], entry["arm"], entry["split"]), ("codex", "A", "held-out"))

    def test_every_row_that_is_an_attempt_is_in_the_rate_denominator(self):
        result = analyse(self.rows(), PARAMS)
        recall = cell(result, "codex", "dev-fix", "A", "recall")
        # 10 attempts (the capacity ends are not); loads: q1 twice and the agent-end failure's load once, not the capacity ends' loads.
        self.assertEqual((recall["successes"], recall["attempts"]), (3, 10))

    def test_a_cell_with_only_capacity_ends_and_no_skip_row_is_reported_not_counted(self):
        rows = [outcome_row("full", "dev-fix-s1", 1, 1, end_reason="capacity", exception="NonZeroAgentExitCodeError"), outcome_row("full", "dev-fix-s1", 2, 1)]
        table = denominators(rows, True, lambda r: r["profile"])
        self.assertEqual((table[0]["capacity_tries"], table[0]["capacity_cells"], table[0]["completed"], table[0]["denominator"]), (1, 1, 1, 1))

    def test_a_verifier_failure_is_an_outcome_attempt_with_reward_zero(self):
        rows = [outcome_row("full", "dev-fix-s1", 1, None), outcome_row("full", "dev-fix-s1", 2, 1)]
        table = denominators(rows, True, lambda r: r["profile"])
        self.assertEqual((table[0]["verifier_failure"], table[0]["completed"], table[0]["denominator"]), (1, 1, 2))


class OutcomeTest(unittest.TestCase):
    def result(self, with_rewards, without_rewards, loads):
        rows = []
        for name, a, b in zip(("dev-fix-s1", "dev-fix-s2", "dev-fix-s3"), with_rewards, without_rewards):
            rows += outcome_cell("full", name, a, loads) + outcome_cell("full-minus-dev-fix", name, b)
        return analyse(rows, PARAMS)["outcome"]["codex"]

    def test_one_better_scenario_of_three_is_not_a_practical_gain(self):
        got = self.result([[1] * 5, [1, 1, 1, 0, 0], [0] * 5], [[1, 0, 0, 0, 0], [1, 1, 1, 0, 0], [0] * 5], [("dev-fix-s1", 5), ("dev-fix-s2", 3)])
        first = got["per_scenario"][0]
        self.assertEqual((first["with"], first["without"], first["difference"]), ({"successes": 5, "attempts": 5}, {"successes": 1, "attempts": 5}, 0.8))
        self.assertAlmostEqual(first["newcombe"][0], 0.1926, places=4)
        self.assertAlmostEqual(first["newcombe"][1], 0.9638, places=4)
        self.assertAlmostEqual(got["per_scenario"][1]["newcombe"][0], -0.4649, places=4)
        self.assertAlmostEqual(got["per_scenario"][2]["newcombe"][1], 0.4345, places=4)
        # mean (0.8 + 0 + 0) / 3; one better of three, two needed.
        self.assertEqual((got["by_scenario"]["mean_difference"], got["by_scenario"]["better"], got["by_scenario"]["needed"], got["by_scenario"]["class"]), (0.266667, 1, 2, "criterion not met"))
        self.assertEqual(got["share_better"], 0.333333)
        # s2 and s3 share a fix: two units, both must be better.
        self.assertEqual((got["merged_shared_fix"]["units"], got["merged_shared_fix"]["better"], got["merged_shared_fix"]["class"]), (2, 1, "criterion not met"))
        self.assertEqual({k: got["load_rate_with"][k] for k in ("attempts_with_asset_loaded", "attempts", "rate")}, {"attempts_with_asset_loaded": 8, "attempts": 15, "rate": 0.533333})
        self.assertAlmostEqual(got["load_rate_with"]["wilson"][0], 0.3012, places=3)
        self.assertEqual(first["load_rate"], 1.0)

    def test_two_better_scenarios_are_a_gain_and_a_zero_load_rate_is_flagged(self):
        got = self.result([[1] * 5, [1, 1, 1, 1, 0], [1, 0, 0, 0, 0]], [[0] * 5, [1, 0, 0, 0, 0], [0] * 5], [])
        self.assertEqual([e["difference"] for e in got["per_scenario"]], [1.0, 0.6, 0.2])
        self.assertEqual((got["by_scenario"]["mean_difference"], got["by_scenario"]["better"], got["by_scenario"]["class"]), (0.6, 3, "gain"))
        self.assertEqual((got["merged_shared_fix"]["units"], got["merged_shared_fix"]["mean_difference"], got["merged_shared_fix"]["class"]), (2, 0.7, "gain"))
        self.assertTrue(got["unexplained_by_the_skill"])

    def test_equal_arms_have_zero_differences(self):
        got = self.result([[1, 1, 0, 0, 0]] * 3, [[1, 1, 0, 0, 0]] * 3, [("dev-fix-s1", 1)])
        self.assertEqual([e["difference"] for e in got["per_scenario"]], [0.0] * 3)
        self.assertEqual((got["by_scenario"]["better"], got["by_scenario"]["worse"], got["by_scenario"]["class"]), (0, 0, "criterion not met"))
        self.assertFalse(got["unexplained_by_the_skill"])

    def test_a_row_with_no_reward_counts_zero(self):
        rows = outcome_cell("full", "dev-fix-s1", [1, 1, 1, 1, 1]) + outcome_cell("full-minus-dev-fix", "dev-fix-s1", [0] * 5)
        rows[0] = outcome_row("full", "dev-fix-s1", 1, None)
        got = analyse(rows, PARAMS)["outcome"]["codex"]["per_scenario"][0]
        self.assertEqual(got["with"], {"successes": 4, "attempts": 5})


class SensitivityTest(unittest.TestCase):
    def tables(self, rows):
        return analyse(rows, PARAMS)["sensitivity"]["tables"]

    def base(self):
        rows = []
        for arm in "AB":
            rows += trigger_cell(arm, {"q1": YES, "q2": YES}, "should-trigger")
        return rows

    def test_the_setup_failure_table_drops_exactly_those_rows(self):
        rows = self.base() + [trigger_row("A", "q3", "should-trigger", 1, [], exception="RuntimeError", seconds_agent=None)]
        primary = cell(analyse(rows, PARAMS), "codex", "dev-fix", "A", "recall")
        table = self.tables(rows)["i_without_setup_failures"]["trigger"]["codex"]["cells"]
        dropped = next(c for c in table if (c["skill"], c["arm"], c["metric"]) == ("dev-fix", "A", "recall"))
        self.assertEqual((primary["attempts"], dropped["attempts"]), (5, 4))

    def test_the_disagreement_table_drops_unexplained_ones_only(self):
        unexplained = {"skill": "dev-fix", "cause": "SKILL.md open after the startup scan with no matching tool call in the host record"}
        expected = {"skill": "dev-fix", "cause": "audit cannot see a load by skill tool call: the host opens no skill file for it"}
        rows = self.base()
        rows[0] = trigger_row("A", "q1", "should-trigger", 1, ["dev-fix"], audit_disagreements=[unexplained])
        rows[1] = trigger_row("A", "q1", "should-trigger", 2, ["dev-fix"], audit_disagreements=[expected])
        table = self.tables(rows)["ii_without_workspace_reads_and_unexplained_disagreements"]["trigger"]["codex"]["cells"]
        self.assertEqual(next(c for c in table if (c["skill"], c["arm"], c["metric"]) == ("dev-fix", "A", "recall"))["attempts"], 3)

    def test_workspace_reads_matter_for_the_outcome_cohort_only(self):
        rows = outcome_cell("full", "dev-fix-s1", [1] * 5) + outcome_cell("full-minus-dev-fix", "dev-fix-s1", [0] * 5)
        rows[0]["workspace_skill_reads"] = ["/app/skills/dev-fix/SKILL.md"]
        table = self.tables(rows)["ii_without_workspace_reads_and_unexplained_disagreements"]["outcome"]["codex"]["per_scenario"][0]
        self.assertEqual(table["with"]["attempts"], 4)
        trig = self.base()
        trig[0]["workspace_skill_reads"] = ["/x/SKILL.md"]
        kept = self.tables(trig)["ii_without_workspace_reads_and_unexplained_disagreements"]["trigger"]["codex"]["cells"]
        self.assertEqual(next(c for c in kept if (c["skill"], c["arm"], c["metric"]) == ("dev-fix", "A", "recall"))["attempts"], 4)

    def test_the_group_table_drops_every_arm_of_a_touched_group(self):
        rows = self.base() + [{"scenario": "trigger-q1", "profile": "full-descB", "host": "codex", "rep": 1, "skipped": "stop", "prereg": "sq1-t1", "query_id": "q1",
                               "query_class": "should-trigger", "target_skill": "dev-fix", "split": "held-out"}]
        rows = [r for r in rows if not (r.get("desc_arm") == "B" and r["query_id"] == "q1" and r["rep"] == 1 and "skipped" not in r)] + []
        table = self.tables(rows)["iii_without_groups_touched_by_skipped_or_quarantined_rows"]["trigger"]["codex"]["cells"]
        # q1 rep 1 is gone from arm A as well: A keeps q1 rep 2 and both reps of q2.
        self.assertEqual(next(c for c in table if (c["skill"], c["arm"], c["metric"]) == ("dev-fix", "A", "recall"))["attempts"], 3)

    def test_all_query_table_exists_only_when_the_parameters_allow_it(self):
        self.assertNotIn("v_all_queries_dev_and_held_out", self.tables(self.base()))
        raw = json.loads(PARAMS_FILE.read_text())
        raw["pool_dev_queries"] = True
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "p.json"
            path.write_text(json.dumps(raw))
            pooled = load_params(path)
        rows = self.base() + trigger_cell("A", {"d1": YES}, "should-trigger", split="dev")
        table = analyse(rows, pooled)["sensitivity"]["tables"]["v_all_queries_dev_and_held_out"]["trigger"]["codex"]["cells"]
        self.assertEqual(next(c for c in table if (c["skill"], c["arm"], c["metric"]) == ("dev-fix", "A", "recall"))["attempts"], 6)


class CommandTest(unittest.TestCase):
    def run_main(self, rows, extra=()):
        with tempfile.TemporaryDirectory() as tmp:
            ledger, out = Path(tmp) / "ledger.jsonl", Path(tmp) / "result.json"
            ledger.write_text("".join(json.dumps(r) + "\n" for r in rows))
            code = main(["--params", str(PARAMS_FILE), "--ledger", str(ledger), "--out", str(out), *extra])
            return code, json.loads(out.read_text()) if out.exists() else None

    def test_end_to_end_on_a_ledger_file_records_the_input_hashes(self):
        code, result = self.run_main(trigger_cell("A", {"q1": YES}, "should-trigger") + outcome_cell("full", "dev-fix-s1", [1] * 5))
        self.assertEqual(code, 0)
        self.assertEqual(result["prereg"], "sq1-synthetic")
        self.assertEqual(len(result["inputs"]["analyze_sha256"]), 64)
        self.assertEqual(result["rows"], {"trigger": 2, "outcome": 5, "other_cohorts_ignored": 0})

    def test_other_cohorts_and_pilot_rows_are_ignored(self):
        rows = trigger_cell("A", {"q1": YES}, "should-trigger") + trigger_cell("A", {"q9": YES}, "should-trigger", prereg="sq1-t1-pilot")
        _, result = self.run_main(rows)
        self.assertEqual(result["rows"]["other_cohorts_ignored"], 2)

    def test_a_row_with_another_arm_hash_stops_the_analysis(self):
        code, result = self.run_main([trigger_row("A", "q1", "should-trigger", 1, [], arm_sha256="0" * 64)])
        self.assertEqual((code, result), (2, None))
        with self.assertRaises(AnalysisError):
            analyse([outcome_row("full-minus-dev-fix", "dev-fix-s1", 1, 0, dev_fix_installed=True)], PARAMS)

    def test_a_malformed_parameter_file_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "p.json"
            path.write_text("{}")
            with self.assertRaises(AnalysisError):
                load_params(path)


if __name__ == "__main__":
    unittest.main()
