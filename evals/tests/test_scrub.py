"""Scrubber tests. Every credential here is an obviously fake value written at test time."""

import contextlib
import gzip
import hashlib
import io
import json
import os
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

from evals import scrub

FAKE = "FAKE-not-a-real-credential-0123456789"
REPO = Path(__file__).resolve().parents[2]


def run_cli(args: list[str], stdin: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "evals.scrub", *args],
        input=stdin, capture_output=True, text=True, cwd=REPO, env={**os.environ, "PYTHONPATH": str(REPO)},
    )


def add_tar_member(archive: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    archive.addfile(info, io.BytesIO(data))


class ScrubTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name) / "receipt"
        (self.root / "a" / "b").mkdir(parents=True)
        (self.root / "clean.txt").write_text("nothing to see\n")
        self.secrets = [scrub.Secret("FAKE_KEY", FAKE.encode())]

    def scan(self):
        return scrub.scan_paths([self.root], self.secrets)

    def test_clean_tree(self):
        hits, scanned, errors = self.scan()
        self.assertEqual((hits, scanned, errors), ([], 1, []))

    def test_exact_hit_in_nested_file_reports_offset(self):
        (self.root / "a" / "b" / "log.txt").write_text("xx" + FAKE + "\n")
        hits, _, _ = self.scan()
        self.assertEqual([(h.kind, h.name, h.offset) for h in hits], [("exact", "FAKE_KEY", 2)])
        self.assertTrue(hits[0].path.endswith("a/b/log.txt"))

    def test_exact_hit_in_binary_file(self):
        (self.root / "blob.bin").write_bytes(os.urandom(4096) + FAKE.encode() + b"\x00\xff")
        hits, _, _ = self.scan()
        self.assertEqual([h.name for h in hits if h.kind == "exact"], ["FAKE_KEY"])

    def test_hit_straddling_chunk_boundary_found_once(self):
        offset = scrub.CHUNK - 5
        (self.root / "big.bin").write_bytes(b"." * offset + FAKE.encode() + b"." * 100)
        hits, _, _ = self.scan()
        self.assertEqual([h.offset for h in hits], [offset])

    def test_hit_in_gzip_stream(self):
        (self.root / "x.gz").write_bytes(gzip.compress(b"head " + FAKE.encode()))
        hits, _, _ = self.scan()
        self.assertEqual([(h.path.endswith("x.gz!gunzip"), h.offset) for h in hits], [(True, 5)])

    def test_hit_in_tar_and_tgz_members(self):
        plain, packed = self.root / "o.tar", self.root / "o.tgz"
        for path, mode in ((plain, "w"), (packed, "w:gz")):
            with tarfile.open(path, mode) as archive:
                add_tar_member(archive, "pkg/ok.txt", b"fine")
                add_tar_member(archive, "pkg/leak.txt", b"k=" + FAKE.encode())
        hits, _, _ = self.scan()
        members = sorted({h.path.split("!", 1)[1] for h in hits if "!" in h.path})
        self.assertEqual(members, ["pkg/leak.txt"])
        self.assertEqual({Path(h.path.split("!")[0]).name for h in hits if "!" in h.path}, {"o.tar", "o.tgz"})

    def test_each_pattern_family(self):
        samples = {
            "anthropic-key": b"sk-ant-api03-" + b"A" * 30,
            "openai-key": b"sk-proj-" + b"B" * 30,
            "github-token": b"ghp_" + b"C" * 36,
            "aws-access-key-id": b"AKIA" + b"D" * 16,
            "google-api-key": b"AIza" + b"E" * 35,
            "factory-key": b"fk-" + b"F" * 30,
            "pem-private-key": b"-----BEGIN " + b"OPENSSH PRIVATE KEY-----",
            "authorization-bearer": b"Authorization: Bearer " + b"G" * 24,
            "x-api-key-header": b"x-api-key: " + b"H" * 24,
        }
        self.assertEqual(set(samples), set(scrub.PATTERNS))
        for name, sample in samples.items():
            with self.subTest(name):
                (self.root / "p.txt").write_bytes(b"prefix " + sample + b" suffix")
                hits, _, _ = scrub.scan_paths([self.root], [])
                self.assertIn(name, {h.name for h in hits})

    def test_redacted_placeholders_are_not_patterns(self):
        (self.root / "r.txt").write_text("Authorization: Bearer [REDACTED]\nx-api-key: <token>\nsk-ant-xxx\n")
        hits, _, _ = scrub.scan_paths([self.root], [])
        self.assertEqual(hits, [])

    def test_a_pattern_hit_carries_the_hash_of_its_bytes_and_an_exact_hit_none(self):
        sample = b"ghp_" + b"C" * 36
        (self.root / "p.txt").write_bytes(b"token " + sample + b" end")
        (self.root / "e.txt").write_text(FAKE)
        hits, _, _ = self.scan()
        self.assertEqual({(h.kind, h.digest) for h in hits}, {("pattern", hashlib.sha256(sample).hexdigest()), ("exact", None)})

    def known_input(self, sample: bytes) -> frozenset:
        inputs = Path(self._tmp.name) / "inputs"
        inputs.mkdir()
        (inputs / "SKILL.md").write_bytes(b"example: " + sample + b"\n")
        listing = scrub.fingerprints([inputs])
        self.assertEqual(listing, [{"pattern": "github-token", "sha256": hashlib.sha256(sample).hexdigest()}])
        path = Path(self._tmp.name) / "known.json"
        path.write_text(json.dumps(listing))
        return scrub.load_known(path)

    def test_a_pattern_hit_on_a_known_input_is_an_echo_and_does_not_quarantine(self):
        sample = b"ghp_" + b"C" * 36
        known = self.known_input(sample)
        (self.root / "t.txt").write_bytes(b"the agent read " + sample)
        vault = Path(self._tmp.name) / "vault"
        hits, echoes = scrub.scan_receipt(self.root, self.secrets, vault, known)
        self.assertEqual((hits, [(e.kind, e.name) for e in echoes]), ([], [("pattern", "github-token")]))
        self.assertTrue(self.root.exists())

    def test_a_pattern_hit_that_is_not_on_the_list_still_quarantines(self):
        known = self.known_input(b"ghp_" + b"C" * 36)
        (self.root / "t.txt").write_bytes(b"new bytes " + b"ghp_" + b"D" * 36)
        hits, echoes = scrub.scan_receipt(self.root, self.secrets, Path(self._tmp.name) / "vault", known)
        self.assertEqual(([h.name for h in hits], echoes), (["github-token"], []))
        self.assertFalse(self.root.exists())

    def test_an_exact_secret_value_is_never_excused_even_when_its_pattern_form_is_listed(self):
        secret = b"ghp_" + b"C" * 36
        known = self.known_input(secret)
        (self.root / "t.txt").write_bytes(b"leaked " + secret)
        hits, echoes = scrub.scan_receipt(self.root, [scrub.Secret("GH", secret)], Path(self._tmp.name) / "vault", known)
        self.assertEqual([(h.kind, h.name) for h in hits], [("exact", "GH")])
        self.assertEqual(len(echoes), 1)  # the pattern form of the same bytes is the echo; the exact value is the hit
        self.assertFalse(self.root.exists())

    def test_quarantine_moves_receipt_with_mode_0700(self):
        (self.root / "leak.txt").write_text(FAKE)
        vault = Path(self._tmp.name) / "vault"
        hits, _ = scrub.scan_receipt(self.root, self.secrets, vault)
        self.assertTrue(hits)
        self.assertFalse(self.root.exists())
        self.assertEqual(stat.S_IMODE(vault.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((vault / "receipt").stat().st_mode), 0o700)
        self.assertEqual((vault / "receipt" / "leak.txt").read_text(), FAKE)

    def test_clean_receipt_is_not_quarantined(self):
        vault = Path(self._tmp.name) / "vault"
        self.assertEqual(scrub.scan_receipt(self.root, self.secrets, vault), ([], []))
        self.assertTrue(self.root.exists())

    def test_short_secret_is_a_usage_error(self):
        with self.assertRaises(ValueError) as caught:
            scrub.parse_secrets(iter(["NAME=abc\n"]))
        self.assertNotIn("abc", str(caught.exception).replace("NAME", ""))

    def test_label_prefix_and_unlabelled_secret(self):
        parsed = scrub.parse_secrets(iter([f"K={FAKE}\n", FAKE + "-two\n"]))
        self.assertEqual([(s.label, s.value) for s in parsed], [("K", FAKE.encode()), ("secret-2", (FAKE + "-two").encode())])


class CliTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name) / "attempt"
        self.root.mkdir()

    def test_exit_codes_and_no_secret_in_output(self):
        (self.root / "f.txt").write_text("a " + FAKE + " b")
        (self.root / "g.txt").write_text("Authorization: Bearer " + "Z" * 30)
        hit = run_cli([str(self.root)], f"FAKE_KEY={FAKE}\n")
        self.assertEqual(hit.returncode, scrub.EXIT_HITS)
        self.assertIn("exact FAKE_KEY", hit.stdout)
        self.assertIn("pattern authorization-bearer", hit.stdout)
        for stream in (hit.stdout, hit.stderr):
            self.assertNotIn(FAKE, stream)
            self.assertNotIn("Z" * 10, stream)
            self.assertNotIn(FAKE[10:], stream)

    def test_clean_exit_zero(self):
        (self.root / "f.txt").write_text("fine")
        done = run_cli([str(self.root)], f"FAKE_KEY={FAKE}\n")
        self.assertEqual(done.returncode, scrub.EXIT_CLEAN)
        self.assertIn("exact_hits=0", done.stdout)

    def test_usage_errors(self):
        self.assertEqual(run_cli([str(self.root / "missing")], FAKE + "\n").returncode, scrub.EXIT_USAGE)
        self.assertEqual(run_cli([], FAKE + "\n").returncode, scrub.EXIT_USAGE)
        short = run_cli([str(self.root)], "abc\n")
        self.assertEqual(short.returncode, scrub.EXIT_USAGE)
        self.assertNotIn("abc\n", short.stderr.replace("secret-1", ""))

    def test_cli_fingerprint_then_known_makes_an_echo(self):
        inputs = Path(self._tmp.name) / "inputs"
        inputs.mkdir()
        sample = "ghp_" + "C" * 36
        (inputs / "doc.md").write_text("example " + sample)
        listing = Path(self._tmp.name) / "known.json"
        made = run_cli(["--fingerprint", str(listing), str(inputs)], "")
        self.assertEqual((made.returncode, json.loads(listing.read_text())[0]["pattern"]), (scrub.EXIT_CLEAN, "github-token"))
        self.assertNotIn(sample, made.stdout + made.stderr + listing.read_text())
        (self.root / "f.txt").write_text("echo " + sample)
        plain = run_cli([str(self.root)], f"FAKE_KEY={FAKE}\n")
        known = run_cli(["--known", str(listing), str(self.root)], f"FAKE_KEY={FAKE}\n")
        self.assertEqual((plain.returncode, known.returncode), (scrub.EXIT_HITS, scrub.EXIT_CLEAN))
        self.assertIn("ECHO pattern github-token", known.stdout)
        self.assertIn("input_echoes=1", known.stdout)

    def test_cli_quarantine_flag(self):
        (self.root / "f.txt").write_text(FAKE)
        vault = Path(self._tmp.name) / "vault"
        done = run_cli(["--quarantine", str(vault), str(self.root)], FAKE + "\n")
        self.assertEqual(done.returncode, scrub.EXIT_HITS)
        self.assertFalse(self.root.exists())
        self.assertTrue((vault / "attempt" / "f.txt").exists())
        self.assertNotIn(FAKE, done.stdout + done.stderr)


if __name__ == "__main__":
    unittest.main()
