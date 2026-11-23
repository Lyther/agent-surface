import tempfile
import unittest
from pathlib import Path

from evals.images import scenario_tag, write_task

HOST = {"host": "droid", "tag": "sq-host/droid:1"}
CONFIG = '[metadata]\nx = 1\n\n[agent]\ntimeout_sec = 900.0\n\n[environment]\ncpus = 1\n'


def template(root: Path, name: str, own_environment: bool) -> Path:
    task = root / name
    task.mkdir()
    (task / "task.toml").write_text(CONFIG)
    (task / "instruction.md").write_text("Use {skill_file}.")
    if own_environment:
        (task / "environment").mkdir()
        (task / "environment" / "Dockerfile").write_text("FROM x\n")
    return task


class WriteTaskTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_task_without_environment_runs_on_the_host_image(self):
        dest = write_task(template(self.root, "plain", False), HOST, self.root / "out", {"skill_file": "/s"})
        self.assertIn('docker_image = "sq-host/droid:1"', (dest / "task.toml").read_text())
        self.assertEqual((dest / "instruction.md").read_text(), "Use /s.")

    def test_agent_timeout_is_set_in_the_copy_and_never_in_the_template(self):
        source = template(self.root, "plain", False)
        dest = write_task(source, HOST, self.root / "out", None, None, 1200)
        self.assertIn("[agent]\ntimeout_sec = 1200.0", (dest / "task.toml").read_text())
        self.assertIn("timeout_sec = 900.0", (source / "task.toml").read_text())

    def test_task_with_environment_runs_on_its_prebuilt_image_and_drops_the_dockerfile(self):
        source = template(self.root, "own", True)
        dest = write_task(source, HOST, self.root / "out", None, scenario_tag(source, "droid"))
        self.assertIn('docker_image = "sq-scn/own:droid"', (dest / "task.toml").read_text())
        self.assertFalse((dest / "environment").exists())
        self.assertTrue((source / "environment" / "Dockerfile").exists())

    def test_task_with_environment_refuses_to_run_without_its_image(self):
        with self.assertRaises(ValueError):
            write_task(template(self.root, "own", True), HOST, self.root / "out")


if __name__ == "__main__":
    unittest.main()
