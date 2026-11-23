"""The scenario images fetch their pinned skill packs with `fetch-packs.sh`; a failed or empty pack must fail the build.

Real git runs against local repositories (file URLs), so the script's fetch, archive and emptiness checks are the real ones.
"""

import subprocess
import tempfile
import unittest
from pathlib import Path

SCENARIOS = Path(__file__).resolve().parents[1] / "scenarios" / "dev-fix"
SCRIPT = SCENARIOS / "qa-f13-umask-widening" / "environment" / "fetch-packs.sh"
GIT = ["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false"]


def make_repo(root: Path, name: str, files: dict[str, str]) -> tuple[str, str]:
    """A local repository with one commit of `files` (none: an empty tree); returns its URL and commit sha."""
    repo = root / name
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    for rel, body in files.items():
        (repo / rel).write_text(body)
    subprocess.run([*GIT, "-C", str(repo), "add", "-A"], check=True)
    subprocess.run([*GIT, "-C", str(repo), "commit", "-q", "--allow-empty", "-m", "pack"], check=True)
    sha = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    return f"file://{repo}", sha


class FetchPacksTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.good = make_repo(self.root, "good", {"SKILL.md": "body\n"})
        self.empty = make_repo(self.root, "empty", {})

    def run_script(self, lines: list[str]) -> subprocess.CompletedProcess:
        listing = self.root / "list.txt"
        listing.write_text("\n".join(lines) + "\n")
        return subprocess.run(["bash", str(SCRIPT), str(listing), str(self.root / "app")], capture_output=True, text=True)

    def test_every_pack_is_fetched_and_comments_and_blank_lines_are_skipped(self):
        done = self.run_script(["# a comment", "", f"external/a {self.good[0]} {self.good[1]}", f"external/b {self.good[0]} {self.good[1]}"])
        self.assertEqual(done.returncode, 0, done.stderr)
        for pack in ("a", "b"):
            self.assertEqual((self.root / "app" / "external" / pack / "SKILL.md").read_text(), "body\n")

    def test_a_failed_fetch_on_the_first_line_fails_the_build_although_the_last_line_works(self):
        # The old `while read ...; done < list` returned only the last iteration's status, so this list built successfully with `a` empty.
        done = self.run_script([f"external/a {self.good[0]} {'0' * 40}", f"external/b {self.good[0]} {self.good[1]}"])
        self.assertNotEqual(done.returncode, 0)
        self.assertFalse((self.root / "app" / "external" / "b").exists())  # it stopped at the failure

    def test_a_pack_that_fetches_but_is_empty_fails_the_build(self):
        done = self.run_script([f"external/a {self.empty[0]} {self.empty[1]}", f"external/b {self.good[0]} {self.good[1]}"])
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("external/a is empty", done.stderr)

    def test_both_scenarios_use_the_same_script_and_list_their_packs_with_the_omission_explained(self):
        for name in ("qa-f13-umask-widening", "qa-f14-readonly-repair"):
            env = SCENARIOS / name / "environment"
            self.assertEqual((env / "fetch-packs.sh").read_bytes(), SCRIPT.read_bytes())
            self.assertIn("RUN bash /opt/fetch-packs.sh /opt/submodules.txt /app", (env / "Dockerfile").read_text())
            packs = [line.split()[0] for line in (env / "submodules.txt").read_text().splitlines() if line and not line.startswith("#")]
            self.assertIn("external/archify", packs)
            self.assertNotIn("external/trailofbits-skills", packs)
            self.assertIn("trailofbits-skills is left out on purpose", (env / "submodules.txt").read_text())


if __name__ == "__main__":
    unittest.main()
