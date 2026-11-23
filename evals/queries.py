"""Trigger queries: a user's request, the skill it targets and its class and split, turned into one Harbor task each.

The queries come from a JSON file the lab does not author: a list of
`{"id", "class", "skill", "split", "text"}`. Every query runs through the shared `scenarios/trigger` template, whose
`instruction.md` has one `{query}` slot, on the fixture workspace described in the README.

`python -m evals.queries check|select` applies preregistration section 6.1 steps 2, 4 and 5 to candidates the lab does not author (see the
README). Word tokenization, used by the five-word-run check: lowercase the text, then take every maximal run of ASCII letters and digits, so
hyphens, apostrophes and punctuation separate words ("don't" is `don`, `t`). Text with no such run has no words.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import random
import re
import sys
from pathlib import Path

from evals.arms import DESC_SKILLS, load_arms, load_desc_texts

CLASSES = ("should-trigger", "near-miss")
SPLITS = ("dev", "held-out")
TEMPLATE = Path(__file__).resolve().parent / "scenarios" / "trigger"
ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")


def load_queries(path: Path) -> list[dict]:
    queries = json.loads(path.read_text(encoding="utf-8"))
    seen: set[str] = set()
    for query in queries:
        problems = [f"{field} {query.get(field)!r}" for field, allowed in (("class", CLASSES), ("split", SPLITS), ("skill", DESC_SKILLS)) if query.get(field) not in allowed]
        if not isinstance(query.get("id"), str) or not ID_PATTERN.fullmatch(query["id"]) or query["id"] in seen:
            problems.append(f"id {query.get('id')!r}")
        if not isinstance(query.get("text"), str) or not query["text"].strip():
            problems.append("text")
        if problems:
            raise ValueError(f"{path}: bad query ({', '.join(problems)})")
        seen.add(query["id"])
    return queries


def unit_name(query: dict) -> str:
    return f"trigger-{query['id']}"


def ledger_fields(query: dict) -> dict:
    return {"query_id": query["id"], "query_class": query["class"], "target_skill": query["skill"], "split": query["split"]}


# Preregistration section 6.1: the selection seed, queries kept per (skill, class) and how many of them are dev.
SEED = 20261121
PER_CLASS = 10
DEV_PER_CLASS = 6
RUN_WORDS = 5
LABELS = ("target", "sibling", "none")
WORD = re.compile(r"[a-z0-9]+")
SKILL_WORD = re.compile(r"(?<![A-Za-z0-9_])skill(?![A-Za-z0-9_])", re.IGNORECASE)


def words(text: str) -> list[str]:
    return WORD.findall(text.lower())


def runs(text: str) -> set[tuple[str, ...]]:
    tokens = words(text)
    return {tuple(tokens[i:i + RUN_WORDS]) for i in range(len(tokens) - RUN_WORDS + 1)}


def read_jsonl(path: Path) -> list[dict]:
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except ValueError as error:
            raise ValueError(f"{path}:{number}: not JSON ({error})") from None
        if not isinstance(row, dict):
            raise ValueError(f"{path}:{number}: not an object")
        rows.append(row)
    return rows


def load_candidates(path: Path) -> list[dict]:
    rows = read_jsonl(path)
    seen: set[str] = set()
    for row in rows:
        problems = [f"{field} {row.get(field)!r}" for field, allowed in (("class", CLASSES), ("skill", DESC_SKILLS)) if row.get(field) not in allowed]
        if not isinstance(row.get("id"), str) or not ID_PATTERN.fullmatch(row["id"]) or row["id"] in seen:
            problems.append(f"id {row.get('id')!r}")
        if not isinstance(row.get("text"), str) or not row["text"].strip():
            problems.append("text")
        if row.get("sibling") is not None and not isinstance(row.get("sibling"), str):
            problems.append("sibling")
        if problems:
            raise ValueError(f"{path}: bad candidate ({', '.join(problems)})")
        seen.add(row["id"])
    return rows


def load_labels(path: Path, candidates: list[dict]) -> dict[str, dict]:
    labels: dict[str, dict] = {}
    known = {c["id"] for c in candidates}
    for row in read_jsonl(path):
        sibling = row.get("sibling")
        if row.get("id") not in known or row["id"] in labels or row.get("label") not in LABELS or (sibling is not None and not isinstance(sibling, str)) \
                or (row["label"] == "sibling" and not sibling):
            raise ValueError(f"{path}: bad label row {row!r}")
        labels[row["id"]] = row
    return labels


def frontmatter_description(skill_file: Path) -> str:
    """The `description:` line of the SKILL.md front matter, outer quotes stripped without unescaping (as the installer reads it)."""
    lines = skill_file.read_text(encoding="utf-8").split("\n")
    end = lines.index("---", 1) if lines[0] == "---" and "---" in lines[1:] else 0
    found = [line for line in lines[1:end] if line.startswith("description:")]
    if len(found) != 1:
        raise ValueError(f"{skill_file}: expected one description line in the front matter, found {len(found)}")
    text = found[0][len("description:"):].strip()
    return text[1:-1] if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'" else text


def full_skill_names(src: Path, arms_path: Path | None) -> set[str]:
    """Skill names of the `full` profile: the source tree's `skills/` directories, plus the skills of every `*-full` arm in arms.json when given
    (external skills come from submodules a bare tree may not have)."""
    names = {p.parent.name for p in (src / "skills").glob("*/SKILL.md")}
    for key, arm in (load_arms(arms_path) if arms_path else {}).items():
        if key.endswith("-full"):
            names |= set(arm["skills"])
    return names


def description_texts(src: Path, desc_json: Path) -> dict[str, dict[str, str]]:
    """Arms A, B and C by skill: A from each target skill's SKILL.md in `src`, B and C from the JSON file."""
    return {"A": {skill: frontmatter_description(src / "skills" / skill / "SKILL.md") for skill in DESC_SKILLS}, **load_desc_texts(desc_json)}


def check_problems(candidate: dict, names: set[str], texts: dict[str, dict[str, str]]) -> list[str]:
    """Why the mechanical checks (6.1 step 2) reject a candidate; empty when it passes."""
    text, problems = candidate["text"], []
    problems += [f"contains skill name {name!r}" for name in sorted(names) if re.search(rf"(?<![A-Za-z0-9_-]){re.escape(name)}(?![A-Za-z0-9_-])", text, re.IGNORECASE)]
    if SKILL_WORD.search(text):
        problems.append('contains the word "skill"')
    mine = runs(text)
    for arm, skill in itertools.product(sorted(texts), DESC_SKILLS):
        shared = sorted(mine & runs(texts[arm][skill]))
        if shared:
            problems.append(f"shares a {RUN_WORDS}-word run with arm {arm} description of {skill}: {' '.join(shared[0])!r}")
    return problems


def eligible(candidate: dict, first: dict | None, second: dict | None) -> str | None:
    """None when the two labels keep the candidate, else why it is dropped (6.1 step 3 as applied here)."""
    if first is None or second is None:
        return f"no label from session {1 if first is None else 2}"
    seen = [first["label"], second["label"]]
    if candidate["class"] == "should-trigger":
        return None if seen == ["target", "target"] else f"should-trigger labelled {seen[0]}/{seen[1]}, both sessions must say target"
    if "target" in seen:
        return f"near-miss labelled {seen[0]}/{seen[1]}: a session says target"
    return None if "sibling" in seen else f"near-miss labelled {seen[0]}/{seen[1]}: no session names a sibling"


def select(candidates: list[dict], first: dict[str, dict], second: dict[str, dict], names: set[str], texts: dict[str, dict[str, str]]) -> tuple[list[dict], list[dict], list[str]]:
    """(kept queries, dropped candidates with reasons, (skill, class) cells with fewer than PER_CLASS eligible)."""
    dropped, pool = [], {}
    for candidate in sorted(candidates, key=lambda c: c["id"]):
        reasons = [f"check: {p}" for p in check_problems(candidate, names, texts)]
        why = eligible(candidate, first.get(candidate["id"]), second.get(candidate["id"]))
        if why:
            reasons.append(f"label: {why}")
        if reasons:
            dropped.append({"id": candidate["id"], "skill": candidate["skill"], "class": candidate["class"], "reason": "; ".join(reasons)})
        else:
            pool.setdefault((candidate["skill"], candidate["class"]), []).append(candidate)
    kept, short = [], []
    for skill, cls in sorted(itertools.product(DESC_SKILLS, CLASSES)):
        ids = pool.get((skill, cls), [])  # already sorted by id
        if len(ids) < PER_CLASS:
            short.append(f"{skill}/{cls}: {len(ids)} eligible, need {PER_CLASS}")
        random.Random(SEED).shuffle(ids)
        for position, candidate in enumerate(ids):
            if position < PER_CLASS:
                kept.append({"id": candidate["id"], "class": cls, "skill": skill, "split": "dev" if position < DEV_PER_CLASS else "held-out", "text": candidate["text"]})
            else:
                dropped.append({"id": candidate["id"], "skill": skill, "class": cls, "reason": f"not selected: position {position + 1} after the shuffle, only {PER_CLASS} kept"})
    return kept, sorted(dropped, key=lambda d: d["id"]), short


def add_check_inputs(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--candidates", type=Path, required=True, help='JSONL: {"id", "skill", "class", "text", "sibling"}')
    parser.add_argument("--src", type=Path, required=True, help="source tree whose skills/<skill>/SKILL.md give arm A and the full profile's skill names")
    parser.add_argument("--desc-texts", type=Path, required=True, help='JSON {"B": {skill: text}, "C": {skill: text}}')
    parser.add_argument("--arms", type=Path, help="arms.json: adds the skills of every *-full arm to the names a query may not contain")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m evals.queries")
    commands = parser.add_subparsers(dest="command", required=True)
    add_check_inputs(commands.add_parser("check", help="print every candidate the mechanical checks reject; exit 1 if any"))
    chosen = commands.add_parser("select", help="apply the checks and the two label files, then select and split")
    add_check_inputs(chosen)
    chosen.add_argument("--labels", type=Path, nargs=2, required=True, metavar=("SESSION1", "SESSION2"), help='JSONL per blind session: {"id", "label", "sibling"}')
    chosen.add_argument("--out", type=Path, required=True, help="directory for queries.json, queries.json.sha256 and report.json")
    args = parser.parse_args(argv)
    try:
        candidates = load_candidates(args.candidates)
        names, texts = full_skill_names(args.src, args.arms), description_texts(args.src, args.desc_texts)
        if args.command == "check":
            rejected = {c["id"]: check_problems(c, names, texts) for c in candidates}
            rejected = {key: value for key, value in rejected.items() if value}
            for key, problems in sorted(rejected.items()):
                print(f"{key}: {'; '.join(problems)}")
            return 1 if rejected else 0
        first, second = (load_labels(path, candidates) for path in args.labels)
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    kept, dropped, short = select(candidates, first, second, names, texts)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "report.json").write_text(json.dumps({"seed": SEED, "kept": len(kept), "short": short, "dropped": dropped}, indent=2) + "\n", encoding="utf-8")
    if short:
        print("not enough eligible candidates, no queries written: " + "; ".join(short), file=sys.stderr)
        return 1
    body = json.dumps(kept, indent=2, ensure_ascii=False) + "\n"
    (args.out / "queries.json").write_text(body, encoding="utf-8")
    (args.out / "queries.json.sha256").write_text(f"{hashlib.sha256(body.encode()).hexdigest()}  queries.json\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
