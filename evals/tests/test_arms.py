"""Arm tests on a tiny constructed source tree: dropped skills, path independence and reproducible packing.

The installer is not run here (it needs the full sources and node dependencies); the real arms are checked
by `evals.images arms` on the lab host. These tests cover the lab's own code around it.
"""

import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path

from evals.arms import PACK_MTIME, PROFILES, add_operator_files, check_arms, pack, prepare_source

REPO = Path(__file__).resolve().parents[2]
WORLD = REPO / "evals" / "world.py"


def make_source(root: Path) -> Path:
    (root / "skills" / "dev-fix").mkdir(parents=True)
    (root / "skills" / "dev-fix" / "SKILL.md").write_text("---\nname: dev-fix\n---\nbody\n")
    (root / "skills" / "qa-review").mkdir()
    (root / "skills" / "qa-review" / "SKILL.md").write_text("---\nname: qa-review\n---\nbody\n")
    (root / "registry").mkdir()
    (root / "registry" / "development-assets.json").write_text(json.dumps({"category": "development", "skills": ["dev-fix", "qa-review"]}))
    return root


class PrepareSourceTest(unittest.TestCase):
    def test_dropped_skill_is_removed_without_touching_the_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = make_source(Path(tmp) / "src")
            out = prepare_source(src, ("dev-fix",), Path(tmp) / "work")
            self.assertFalse((out / "skills" / "dev-fix").exists())
            self.assertEqual(json.loads((out / "registry" / "development-assets.json").read_text())["skills"], ["qa-review"])
            self.assertTrue((src / "skills" / "dev-fix" / "SKILL.md").exists())
            self.assertEqual(json.loads((src / "registry" / "development-assets.json").read_text())["skills"], ["dev-fix", "qa-review"])


class PackTest(unittest.TestCase):
    def tree(self, root: Path, mtime: int) -> Path:
        (root / "a").mkdir(parents=True)
        for name, body in (("a/one", "1"), ("two", "2")):
            (root / name).write_text(body)
            os.utime(root / name, (mtime, mtime))
        return root

    def test_the_same_content_packs_to_the_same_bytes_wherever_it_lives(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = pack(self.tree(Path(tmp) / "x" / "home", 1000), Path(tmp) / "one.tgz")
            second = pack(self.tree(Path(tmp) / "deeper" / "y" / "home", 2000), Path(tmp) / "two.tgz")
            self.assertEqual(first, second)
            with tarfile.open(Path(tmp) / "one.tgz") as tar:
                self.assertEqual(sorted(tar.getnames()), ["a", "a/one", "two"])
                self.assertTrue(all(m.uid == 0 and m.mtime == PACK_MTIME for m in tar.getmembers()))


class ProfilesTest(unittest.TestCase):
    def test_profiles_are_the_four_named_arms(self):
        self.assertEqual(list(PROFILES), ["dev-minus-dev-fix", "dev", "full", "full-minus-dev-fix"])
        self.assertEqual(PROFILES["full"].installs, ("external", "development,cybersecurity,private"))
        self.assertNotIn("modding", ",".join(PROFILES["full"].installs))

    def arm(self, host, profile, skills):
        return {"host": host, "dropped_skills": list(PROFILES[profile].drop_skills), "skills": skills}

    def test_check_accepts_consistent_arms_and_flags_a_wrong_drop(self):
        good = {
            "h-dev": self.arm("h", "dev", ["dev-fix", "a"]), "h-dev-minus-dev-fix": self.arm("h", "dev-minus-dev-fix", ["a"]),
            "h-full": self.arm("h", "full", ["dev-fix", "a", "b"]), "h-full-minus-dev-fix": self.arm("h", "full-minus-dev-fix", ["a", "b"]),
        }
        self.assertEqual(check_arms(good), [])
        bad = dict(good, **{"h-dev-minus-dev-fix": self.arm("h", "dev-minus-dev-fix", ["a", "dev-fix"])})
        self.assertTrue(check_arms(bad))


class OperatorFilesTest(unittest.TestCase):
    def test_claude_code_gets_the_rules_import_and_other_hosts_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            for host in ("opencode", "droid", "codex"):
                add_operator_files(Path(tmp) / host, host)
                self.assertFalse((Path(tmp) / host).exists())
            home = Path(tmp) / "claude-code"
            (home / ".claude").mkdir(parents=True)
            add_operator_files(home, "claude-code")
            self.assertEqual((home / ".claude" / "CLAUDE.md").read_text(), "@agent-surface/rules.md\n")


class VerifierCopiesTest(unittest.TestCase):
    def test_every_scenario_ships_a_byte_identical_world_py(self):
        copies = sorted((REPO / "evals" / "scenarios").glob("dev-fix/*/tests/world.py"))
        self.assertTrue(copies)
        for copy in copies:
            self.assertEqual(copy.read_bytes(), WORLD.read_bytes(), str(copy))


if __name__ == "__main__":
    unittest.main()
