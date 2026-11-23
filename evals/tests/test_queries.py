"""Trigger queries: loading, the task each one becomes, the cohort unit and the fixture workspace the queries refer to.

The sample file is test-only; the real queries are written separately. The fixture workspace is run for real with node.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from evals.cohort import make_units
from evals.images import HOST_BASE, scenario_tag, write_task
from evals.queries import TEMPLATE, load_queries

FIXTURES = Path(__file__).parent / "fixtures"
HOST = {"host": "droid", "tag": "sq-host/droid:1"}


class LoadQueriesTest(unittest.TestCase):
    def test_sample_loads(self):
        queries = load_queries(FIXTURES / "queries-sample.json")
        self.assertEqual([q["id"] for q in queries], ["sample-fix-01", "sample-test-01"])

    def test_bad_queries_are_refused(self):
        good = json.loads((FIXTURES / "queries-sample.json").read_text())[0]
        for change in ({"class": "maybe"}, {"split": "test"}, {"skill": "dev-feature"}, {"text": " "}, {"id": "Bad Id"}):
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "q.json"
                path.write_text(json.dumps([{**good, **change}]))
                with self.assertRaises(ValueError, msg=str(change)):
                    load_queries(path)
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "q.json"
                path.write_text(json.dumps([good, good]))
                with self.assertRaises(ValueError):
                    load_queries(path)


class TriggerUnitTest(unittest.TestCase):
    def test_a_query_becomes_a_task_with_its_text_as_the_whole_instruction(self):
        (unit,) = [u for n, u in make_units([], load_queries(FIXTURES / "queries-sample.json")).items() if n == "trigger-sample-fix-01"]
        self.assertFalse(unit.verify)
        self.assertEqual(unit.fields, {"query_id": "sample-fix-01", "query_class": "should-trigger", "target_skill": "dev-fix", "split": "dev"})
        with tempfile.TemporaryDirectory() as tmp:
            dest = write_task(unit.template, HOST, Path(tmp) / "t", unit.subs, scenario_tag(unit.template, "droid"))
            self.assertEqual((dest / "instruction.md").read_text().strip(), unit.subs["query"])
            self.assertIn('docker_image = "sq-scn/trigger:droid"', (dest / "task.toml").read_text())
            self.assertFalse((dest / "tests").exists())

    def test_every_query_gets_its_own_unit_on_the_one_template(self):
        units = make_units([], load_queries(FIXTURES / "queries-sample.json"))
        self.assertEqual(sorted(units), ["trigger-sample-fix-01", "trigger-sample-test-01"])
        self.assertEqual({u.template for u in units.values()}, {TEMPLATE})

    def test_template_builds_on_the_shared_base(self):
        self.assertEqual((TEMPLATE / "environment" / "Dockerfile").read_text().splitlines()[0], f"FROM {HOST_BASE}")


class FixtureWorkspaceTest(unittest.TestCase):
    """The workspace at /app: the committed tree plus the uncommitted change on top of it."""

    def workspace(self) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        app = Path(tmp.name) / "app"
        shutil.copytree(TEMPLATE / "environment" / "app", app)
        shutil.copytree(TEMPLATE / "environment" / "change", app, dirs_exist_ok=True)
        return app

    def test_the_suite_passes_with_one_skipped_test(self):
        done = subprocess.run(["node", "--test"], cwd=self.workspace(), capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stdout[-600:])
        self.assertIn("pass 8", done.stdout)
        self.assertIn("skipped 1", done.stdout)

    def test_the_diagnosed_bug_reproduces(self):
        app = self.workspace()
        script = 'import("./src/amount.js").then(m => console.log(m.formatCents(-5), m.formatCents(-1250)))'
        done = subprocess.run(["node", "-e", script], cwd=app, capture_output=True, text=True)
        self.assertEqual(done.stdout.strip(), "0.05 -12.50")


if __name__ == "__main__":
    unittest.main()
