"""Query selection (`python -m evals.queries check|select`) on synthetic candidates, labels and descriptions only; no real query is authored here."""

import contextlib
import hashlib
import io
import itertools
import json
import random
import tempfile
import unittest
from pathlib import Path

from evals.arms import DESC_SKILLS
from evals.queries import CLASSES, load_queries, main

DESC_A = {"dev-fix": "Apply the minimal effective patch that restores functionality.",
          "verify-test": "Run the suite and detect whether it was weakened.",
          "qa-review": "Find blocking issues before bad code lands."}
DESC_B = {"dev-fix": "Use when a confirmed bug needs its smallest correct repair", "verify-test": "Use to judge whether a passing run deserves trust now",
          "qa-review": "Use to catch merge blocking defects inside a pending diff"}
DESC_C = {"dev-fix": "Patch one diagnosed defect with minimal change plus regression check", "verify-test": "Decide if tests ran and passed for real reasons",
          "qa-review": "Review changes for correctness hazards that must stop a merge"}
OTHER_SKILLS = ("ops-ask", "dev-feature", "arch-contract")


def text_for(index: int) -> str:
    """Eight words that share no five-word run with any description or other text."""
    return " ".join(f"w{index}x{n}" for n in range(8))


class Workspace(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.src = self.dir / "src"
        for skill in (*DESC_SKILLS, *OTHER_SKILLS):
            (self.src / "skills" / skill).mkdir(parents=True)
            description = DESC_A.get(skill, "Something else.")
            (self.src / "skills" / skill / "SKILL.md").write_text(f'---\nname: {skill}\ndescription: "{description}"\n---\n\nBody.\n')
        self.desc = self.dir / "desc.json"
        self.desc.write_text(json.dumps({"B": DESC_B, "C": DESC_C}))

    def write_jsonl(self, name: str, rows: list[dict]) -> Path:
        path = self.dir / name
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        return path

    def run_main(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def check(self, texts: list[str]) -> tuple[int, str]:
        rows = [{"id": f"c{i}", "skill": "dev-fix", "class": "should-trigger", "text": t, "sibling": None} for i, t in enumerate(texts)]
        code, out, _ = self.run_main("check", "--candidates", str(self.write_jsonl("c.jsonl", rows)), "--src", str(self.src), "--desc-texts", str(self.desc))
        return code, out


class CheckTest(Workspace):
    def test_a_clean_candidate_passes(self):
        self.assertEqual(self.check(["the formatter drops the sign for negative amounts and I need that changed"]), (0, ""))

    def test_a_skill_name_in_the_full_profile_is_rejected_word_bounded_and_case_insensitive(self):
        for text in ("please use dev-fix here", "Use OPS-ASK before this", "run arch-contract, then stop"):
            with self.subTest(text=text):
                code, out = self.check([text])
                self.assertEqual(code, 1)
                self.assertIn("contains skill name", out)
        self.assertEqual(self.check(["the dev-fixture directory is stale"])[0], 0)  # a longer hyphenated word is not the name

    def test_the_word_skill_is_rejected_but_not_skills_or_skillful(self):
        self.assertIn('the word "skill"', self.check(["which Skill should this use"])[1])
        self.assertEqual(self.check(["his skills are skillful"])[0], 0)

    def test_a_five_word_run_from_any_arm_of_any_target_skill_is_rejected(self):
        for arm, desc in (("A", DESC_A), ("B", DESC_B), ("C", DESC_C)):
            for skill in DESC_SKILLS:
                words = desc[skill].split()
                with self.subTest(arm=arm, skill=skill):
                    code, out = self.check([f"my own words {' '.join(words[1:6])} and more"])
                    self.assertEqual(code, 1)
                    self.assertIn(f"arm {arm} description of {skill}", out)

    def test_four_shared_words_pass_and_tokenization_ignores_case_and_punctuation(self):
        self.assertEqual(self.check(["restores functionality and nothing about that"])[0], 0)  # 3 of the words, then different ones
        self.assertEqual(self.check(["x the minimal, EFFECTIVE patch (that) restores y"])[0], 1)  # run: minimal effective patch that restores
        self.assertEqual(self.check(["detect whether it was weakened"])[0], 1)

    def test_every_rejected_id_is_listed_and_the_rest_are_not(self):
        code, out = self.check(["fine words here about nothing special at all", "mentions skill outright"])
        self.assertEqual((code, out.splitlines()[0].split(":")[0]), (1, "c1"))
        self.assertEqual(len(out.splitlines()), 1)

    def test_arms_json_adds_the_skills_of_full_arms(self):
        arms = self.dir / "arms.json"
        arms.write_text(json.dumps({"droid-full": {"tarball": "f.tgz", "skills": ["archify"]}, "droid-dev": {"tarball": "d.tgz", "skills": ["onlydev"]}}))
        rows = [{"id": "c1", "skill": "dev-fix", "class": "should-trigger", "text": "draw it with archify please now", "sibling": None},
                {"id": "c2", "skill": "dev-fix", "class": "should-trigger", "text": "use onlydev for this thing today", "sibling": None}]
        code, out, _ = self.run_main("check", "--candidates", str(self.write_jsonl("c.jsonl", rows)), "--src", str(self.src), "--desc-texts", str(self.desc), "--arms", str(arms))
        self.assertEqual((code, [line.split(":")[0] for line in out.splitlines()]), (1, ["c1"]))


class SelectTest(Workspace):
    def candidates(self, per_cell: int = 12) -> list[dict]:
        rows = []
        for index, (skill, cls) in enumerate(itertools.product(DESC_SKILLS, CLASSES)):
            for n in range(per_cell):
                rows.append({"id": f"{skill}-{cls[:2]}-{n:02d}", "skill": skill, "class": cls, "text": text_for(index * 100 + n), "sibling": "dev-feature" if cls == "near-miss" else None})
        return rows

    def labels(self, rows: list[dict], override: dict[str, tuple[str, str]] | None = None) -> tuple[list[dict], list[dict]]:
        one, two = [], []
        for row in rows:
            first, second = (override or {}).get(row["id"]) or (("target",) * 2 if row["class"] == "should-trigger" else ("sibling", "none"))
            one.append({"id": row["id"], "label": first, "sibling": "dev-feature" if first == "sibling" else None})
            two.append({"id": row["id"], "label": second, "sibling": "dev-feature" if second == "sibling" else None})
        return one, two

    def select(self, rows, override=None, labels=None):
        one, two = labels or self.labels(rows, override)
        out = self.dir / "out"
        code, _, err = self.run_main("select", "--candidates", str(self.write_jsonl("c.jsonl", rows)), "--src", str(self.src), "--desc-texts", str(self.desc),
                                     "--labels", str(self.write_jsonl("l1.jsonl", one)), str(self.write_jsonl("l2.jsonl", two)), "--out", str(out))
        return code, err, out

    def test_ten_per_cell_in_sorted_cell_order_shuffled_with_the_fixed_seed_and_split_six_four(self):
        rows = self.candidates()
        code, _, out = self.select(rows)
        self.assertEqual(code, 0)
        kept = load_queries(out / "queries.json")  # the format load_queries reads
        expected = []
        for skill, cls in sorted(itertools.product(DESC_SKILLS, CLASSES)):
            ids = sorted(r["id"] for r in rows if r["skill"] == skill and r["class"] == cls)
            random.Random(20261121).shuffle(ids)
            expected += [(i, skill, cls, "dev" if n < 6 else "held-out") for n, i in enumerate(ids[:10])]
        self.assertEqual([(q["id"], q["skill"], q["class"], q["split"]) for q in kept], expected)
        self.assertEqual(len(kept), 60)
        text = {r["id"]: r["text"] for r in rows}
        self.assertTrue(all(q["text"] == text[q["id"]] for q in kept))

    def test_the_hash_file_matches_the_queries_file(self):
        _, _, out = self.select(self.candidates())
        digest = hashlib.sha256((out / "queries.json").read_bytes()).hexdigest()
        self.assertEqual((out / "queries.json.sha256").read_text(), f"{digest}  queries.json\n")

    def test_selection_does_not_depend_on_candidate_file_order(self):
        rows = self.candidates()
        _, _, first = self.select(rows)
        before = (first / "queries.json").read_bytes()
        _, _, second = self.select(list(reversed(rows)))
        self.assertEqual((second / "queries.json").read_bytes(), before)

    def test_label_rules(self):
        rows = self.candidates(per_cell=14)
        a, b, c, d, e, f = (f"dev-fix-{cls}-{n}" for cls, n in (("sh", "00"), ("sh", "01"), ("ne", "00"), ("ne", "01"), ("ne", "02"), ("ne", "03")))
        override = {a: ("target", "sibling"),     # should-trigger disagreement: dropped
                    b: ("target", "target"),      # kept
                    c: ("target", "none"),        # near-miss with a target: dropped
                    d: ("none", "none"),          # near-miss naming no sibling: dropped
                    e: ("none", "sibling"),       # kept
                    f: ("sibling", "sibling")}    # kept
        code, _, out = self.select(rows, override)
        self.assertEqual(code, 0)
        dropped = {d["id"]: d["reason"] for d in json.loads((out / "report.json").read_text())["dropped"]}
        for dropped_id in (a, c, d):
            self.assertIn("label:", dropped[dropped_id])
        self.assertIn("no session names a sibling", dropped[d])
        for kept_id in (b, e, f):
            self.assertNotIn(kept_id, {k for k, v in dropped.items() if v.startswith("label:")})

    def test_every_surplus_and_failed_candidate_is_in_the_report_with_a_reason(self):
        rows = self.candidates()
        rows[0] = {**rows[0], "text": "mention the skill outright in this sentence"}
        _, _, out = self.select(rows)
        report = json.loads((out / "report.json").read_text())
        reasons = {d["id"]: d["reason"] for d in report["dropped"]}
        self.assertIn('check: contains the word "skill"', reasons[rows[0]["id"]])
        kept = {q["id"] for q in json.loads((out / "queries.json").read_text())}
        self.assertEqual(set(reasons), {r["id"] for r in rows} - kept)
        self.assertEqual((report["kept"], report["short"]), (60, []))
        self.assertTrue(all(r.startswith("not selected") for k, r in reasons.items() if k != rows[0]["id"]))

    def test_fewer_than_ten_eligible_exits_non_zero_names_the_class_and_writes_no_queries(self):
        rows = self.candidates(per_cell=10)
        override = {"qa-review-ne-00": ("none", "none")}
        code, err, out = self.select(rows, override)
        self.assertEqual(code, 1)
        self.assertIn("qa-review/near-miss: 9 eligible, need 10", err)
        self.assertFalse((out / "queries.json").exists())
        self.assertEqual(json.loads((out / "report.json").read_text())["short"], ["qa-review/near-miss: 9 eligible, need 10"])

    def test_a_class_with_no_candidates_is_short_not_padded(self):
        rows = [r for r in self.candidates() if not (r["skill"] == "verify-test" and r["class"] == "near-miss")]
        code, err, _ = self.select(rows)
        self.assertEqual(code, 1)
        self.assertIn("verify-test/near-miss: 0 eligible", err)

    def test_a_missing_label_drops_the_candidate_and_an_unknown_label_id_is_an_error(self):
        rows = self.candidates()
        one, two = self.labels(rows)
        _, _, out = self.select(rows, labels=(one[1:], two))
        reasons = {d["id"]: d["reason"] for d in json.loads((out / "report.json").read_text())["dropped"]}
        self.assertIn("no label from session 1", reasons[rows[0]["id"]])
        code, err, _ = self.select(rows, labels=([*one, {"id": "ghost", "label": "none", "sibling": None}], two))
        self.assertEqual(code, 2)
        self.assertIn("bad label row", err)


if __name__ == "__main__":
    unittest.main()
