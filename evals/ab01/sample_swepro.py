import json, random, re, sys
from pathlib import Path
root, out = Path(sys.argv[1]), Path(sys.argv[2])
lang = {"ansible/ansible": "python", "internetarchive/openlibrary": "python", "qutebrowser/qutebrowser": "python",
        "flipt-io/flipt": "go", "gravitational/teleport": "go", "future-architect/vuls": "go", "navidrome/navidrome": "go",
        "protonmail/webclients": "ts", "element-hq/element-web": "ts", "nodebb/nodebb": "js", "tutao/tutanota": "ts"}
by_repo = {}
for d in sorted(p.name for p in root.iterdir() if p.is_dir()):
    m = re.match(r"^instance_([^_]+)__(.+?)-[0-9a-f]{40}", d)
    by_repo.setdefault(f"{m.group(1)}/{m.group(2)}", []).append(d)
rng = random.Random(20261126)
repos = sorted(by_repo, key=lambda r: (-len(by_repo[r]), r))[:10]
sample = [{"repo": r, "language": lang[r], "task": rng.choice(by_repo[r])} for r in repos]
out.write_text(json.dumps(sample, indent=1))
for s in sample:
    froms = [l.split()[1] for l in (root / s["task"] / "environment" / "Dockerfile").read_text().splitlines() if l.startswith("FROM ")]
    print(s["language"], s["repo"], s["task"][:70], froms[:1])
