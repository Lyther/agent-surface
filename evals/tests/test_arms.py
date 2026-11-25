"""Arm tests on a tiny constructed source tree: dropped skills, path independence and reproducible packing.

The installer is not run here (it needs the full sources and node dependencies); the real arms are checked
by `evals.images arms` on the lab host. These tests cover the lab's own code around it.
"""

import json
import os
import shutil
import tarfile
import tempfile
import unittest
from pathlib import Path

from evals.arms import (DESC_SKILLS, PACK_MTIME, PROFILES, add_operator_files, check_arms, check_desc_arms, load_desc_texts, pack, prepare_all,
                        prepare_source, set_description)

REPO = Path(__file__).resolve().parents[2]
WORLD = REPO / "evals" / "world.py"


def make_source(root: Path) -> Path:
    (root / "skills" / "dev-fix").mkdir(parents=True)
    (root / "skills" / "dev-fix" / "SKILL.md").write_text("---\nname: dev-fix\ndescription: \"Committed.\"\n---\nbody\n")
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


# SUBSTITUTE_JUSTIFICATION
# - replaces: scripts/agent-surface.mjs (the installer), for the codex host only
# - necessity: the installer's `--no-mcps` mode is not on this branch's tree, so a real render cannot run here
# - real-proof: BLOCKED: needs the branch that adds `install --no-mcps`; a render on a lab host with relative paths covers it
# It resolves --dest against its working directory, as the real installer does; everything else here is the real arm-building path.
FAKE_INSTALLER = """import fs from 'node:fs';
import path from 'node:path';
const dest = path.resolve(process.argv[process.argv.indexOf('--dest') + 1]);
for (const name of fs.readdirSync('skills')) fs.cpSync(path.join('skills', name), path.join(dest, '.agents', 'skills', name), {recursive: true});
"""


class RelativePathsTest(unittest.TestCase):
    def build(self, tmp: Path, src: str, out: str) -> dict:
        make_source(tmp / "lab" / "src")
        (tmp / "lab" / "src" / "skills" / "other").mkdir()
        (tmp / "lab" / "src" / "skills" / "other" / "SKILL.md").write_text("---\nname: other\n---\nbody\n")
        (tmp / "lab" / "src" / "scripts").mkdir()
        (tmp / "lab" / "src" / "scripts" / "agent-surface.mjs").write_text(FAKE_INSTALLER)
        cwd = os.getcwd()
        os.chdir(tmp / "lab")
        try:
            return prepare_all(Path(src), ["codex"], ["full", "full-minus-dev-fix"], Path(out))
        finally:
            os.chdir(cwd)

    @unittest.skipUnless(shutil.which("node"), "node is not available")
    def test_relative_src_and_out_render_the_same_skills_as_absolute_ones(self):
        with tempfile.TemporaryDirectory() as tmp:
            arms = self.build(Path(tmp).resolve(), "src", "arms")
        self.assertEqual(arms["codex-full"]["skills"], ["dev-fix", "other", "qa-review"])
        self.assertEqual(arms["codex-full-minus-dev-fix"]["skills"], ["other", "qa-review"])


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
    def test_profiles_are_the_named_arms(self):
        self.assertEqual(list(PROFILES), ["none", "dev-minus-dev-fix", "dev", "full", "full-minus-dev-fix", "full-descB", "full-descC"])
        self.assertEqual([n for n, p in PROFILES.items() if not p.installed], ["none"])
        self.assertEqual([PROFILES[n].desc_arm for n in ("full", "full-descB", "full-descC")], ["A", "B", "C"])
        self.assertEqual(PROFILES["full-descB"].installs, PROFILES["full"].installs)
        self.assertEqual(PROFILES["full"].installs, ("external", "development,cybersecurity,private"))
        self.assertNotIn("modding", ",".join(PROFILES["full"].installs))

    def arm(self, host, profile, skills):
        return {"host": host, "profile": profile, "dropped_skills": list(PROFILES[profile].drop_skills), "skills": skills,
                "installed": PROFILES[profile].installed}

    def test_check_accepts_consistent_arms_and_flags_a_wrong_drop(self):
        good = {
            "h-dev": self.arm("h", "dev", ["dev-fix", "a"]), "h-dev-minus-dev-fix": self.arm("h", "dev-minus-dev-fix", ["a"]),
            "h-full": self.arm("h", "full", ["dev-fix", "a", "b"]), "h-full-minus-dev-fix": self.arm("h", "full-minus-dev-fix", ["a", "b"]),
        }
        self.assertEqual(check_arms(good), [])
        bad = dict(good, **{"h-dev-minus-dev-fix": self.arm("h", "dev-minus-dev-fix", ["a", "dev-fix"])})
        self.assertTrue(check_arms(bad))

    def test_check_flags_an_empty_arm_and_a_wrong_exclusion_count(self):
        arms = {"h-full": self.arm("h", "full", ["dev-fix", "a", "b"]), "h-full-minus-dev-fix": self.arm("h", "full-minus-dev-fix", [])}
        problems = check_arms(arms)
        self.assertTrue(any("h-full-minus-dev-fix" in p and "no skills" in p for p in problems), problems)
        short = dict(arms, **{"h-full-minus-dev-fix": self.arm("h", "full-minus-dev-fix", ["a"])})
        self.assertTrue(any("expected 2" in p for p in check_arms(short)), check_arms(short))

    def test_check_accepts_an_empty_none_arm_and_flags_one_with_skills(self):
        arms = {"h-none": self.arm("h", "none", []), "h-full": self.arm("h", "full", ["dev-fix", "a"])}
        self.assertEqual(check_arms(arms), [])
        problems = check_arms(dict(arms, **{"h-none": self.arm("h", "none", ["dev-fix"])}))
        self.assertTrue(any("h-none" in p and "installs nothing" in p for p in problems), problems)


class NoneArmTest(unittest.TestCase):
    def test_none_runs_no_installer_and_packs_an_empty_home(self):
        # The source has no installer script, so any installer run would fail the render.
        with tempfile.TemporaryDirectory() as tmp:
            src = make_source(Path(tmp) / "src")
            out = Path(tmp) / "arms"
            arms = prepare_all(src, ["claude-code", "codex"], ["none"], out)
            for host in ("claude-code", "codex"):
                arm = arms[f"{host}-none"]
                self.assertEqual((arm["skills"], arm["installed"], arm["dropped_skills"]), ([], False, []))
                self.assertEqual(list((out / "none" / host / "home").iterdir()), [])
                with tarfile.open(out / arm["tarball"]) as tar:
                    self.assertEqual(tar.getnames(), [])
            self.assertEqual(arms["claude-code-none"]["arm_sha256"], arms["codex-none"]["arm_sha256"])


TEXTS = {arm: {skill: f"Use {arm} for {skill}, when it fits." for skill in DESC_SKILLS} for arm in ("B", "C")}


def skill_text(name: str, description: str) -> str:
    return f'---\nname: {name}\ndescription: "{description}"\n---\n\nbody of {name}\n'


class DescriptionTextsTest(unittest.TestCase):
    def test_texts_load_and_bad_texts_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "desc.json"
            path.write_text(json.dumps(TEXTS))
            self.assertEqual(load_desc_texts(path), TEXTS)
            for arm, skill, text in (("B", "dev-fix", "x" * 201), ("C", "qa-review", 'has "quotes"'), ("B", "verify-test", "two\nlines"), ("C", "dev-fix", " ")):
                bad = json.loads(json.dumps(TEXTS))
                bad[arm][skill] = text
                path.write_text(json.dumps(bad))
                with self.assertRaises(ValueError, msg=text[:12]):
                    load_desc_texts(path)
            path.write_text(json.dumps({"B": TEXTS["B"]}))
            with self.assertRaises(ValueError):
                load_desc_texts(path)

    def test_only_the_description_line_changes_and_the_source_stays(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = make_source(Path(tmp) / "src")
            out = prepare_source(src, (), Path(tmp) / "work", {"dev-fix": "Use when a bug is diagnosed."})
            self.assertEqual((out / "skills" / "dev-fix" / "SKILL.md").read_text(), "---\nname: dev-fix\ndescription: \"Use when a bug is diagnosed.\"\n---\nbody\n")
            self.assertEqual((src / "skills" / "dev-fix" / "SKILL.md").read_text(), "---\nname: dev-fix\ndescription: \"Committed.\"\n---\nbody\n")

    def test_a_skill_without_exactly_one_description_line_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "SKILL.md"
            path.write_text("---\nname: x\n---\ndescription: not front matter\n")
            with self.assertRaises(ValueError):
                set_description(path, "t")


class DescArmCheckTest(unittest.TestCase):
    """The tarball diff of a description arm against `full` lists exactly the three SKILL.md files and, in each, only the description line."""

    def build(self, tmp: Path, name: str, arm: str, tweak=None) -> dict:
        home = tmp / name / "home"
        (home / ".agent-surface").mkdir(parents=True)
        (home / ".agent-surface" / "codex-manifest.json").write_text(json.dumps({"generated_at": name, "managed": ["a"]}))
        for skill in (*DESC_SKILLS, "other"):
            (home / ".agents" / "skills" / skill / "agents").mkdir(parents=True)
            text = TEXTS[arm][skill] if arm != "A" and skill in DESC_SKILLS else f"Committed {skill}."
            (home / ".agents" / "skills" / skill / "SKILL.md").write_text(skill_text(skill, text))
            (home / ".agents" / "skills" / skill / "agents" / "openai.yaml").write_text(f"interface:\n  short_description: >-\n    {text}\npolicy:\n  x: 1\n")
        if tweak:
            tweak(home)
        pack(home, tmp / f"{name}.tgz")
        return {"host": "codex", "tarball": f"{name}.tgz", "desc_arm": arm}

    def arms(self, tmp: Path, tweak=None) -> dict:
        return {"codex-full": self.build(tmp, "full", "A"), "codex-full-descB": self.build(tmp, "b", "B", tweak)}

    def test_a_clean_description_arm_passes_despite_the_manifest_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check_desc_arms(self.arms(Path(tmp)), Path(tmp), TEXTS), [])

    def test_another_file_another_line_or_an_unapproved_text_fails(self):
        def other_skill(home):
            (home / ".agents" / "skills" / "other" / "SKILL.md").write_text(skill_text("other", "Edited."))

        def extra_line(home):
            path = home / ".agents" / "skills" / "dev-fix" / "SKILL.md"
            path.write_text(path.read_text() + "more\n")

        def wrong_text(home):
            path = home / ".agents" / "skills" / "qa-review" / "SKILL.md"
            path.write_text(skill_text("qa-review", "Not the approved text."))

        def body_line(home):
            path = home / ".agents" / "skills" / "verify-test" / "SKILL.md"
            path.write_text(path.read_text().replace("body of", "changed body of"))

        for tweak in (other_skill, extra_line, wrong_text, body_line):
            with self.subTest(tweak.__name__), tempfile.TemporaryDirectory() as tmp:
                self.assertTrue(check_desc_arms(self.arms(Path(tmp), tweak), Path(tmp), TEXTS))

    def test_an_arm_that_leaves_a_skill_unchanged_fails(self):
        def revert(home):
            (home / ".agents" / "skills" / "dev-fix" / "SKILL.md").write_text(skill_text("dev-fix", "Committed dev-fix."))
            (home / ".agents" / "skills" / "dev-fix" / "agents" / "openai.yaml").write_text("interface:\n  short_description: >-\n    Committed dev-fix.\npolicy:\n  x: 1\n")

        with tempfile.TemporaryDirectory() as tmp:
            problems = check_desc_arms(self.arms(Path(tmp), revert), Path(tmp), TEXTS)
            self.assertTrue(any("dev-fix SKILL.md does not differ" in p for p in problems))


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
