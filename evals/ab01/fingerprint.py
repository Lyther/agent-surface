"""ab01 input fingerprints for `cohort --input-fingerprints`: every credential-pattern match in the arm tarballs, the task directories and each
task image's filesystem (streamed from `docker export`), as the sorted {pattern, sha256} list `evals.scrub` loads. No secret is read.

Run from ~/ab01/repo:  PYTHONPATH=$PWD uv run --frozen --project evals python ~/ab01/fingerprint.py OUT.json IMAGES.json PATH...
"""

import json
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from evals.scrub import scan_paths, scan_tar

# Regex scanning holds the GIL, so images are scanned in separate processes; four keeps the export I/O and the host's other jobs reasonable.
WORKERS = 4


def image_matches(tag: str) -> list[tuple[str, str]]:
    created = subprocess.run(["docker", "create", tag, "sh"], capture_output=True, text=True)
    if created.returncode != 0:
        raise RuntimeError(f"docker create {tag} exited {created.returncode}")
    cid = created.stdout.strip()
    try:
        export = subprocess.Popen(["docker", "export", cid], stdout=subprocess.PIPE)
        hits = scan_tar(export.stdout, tag, [])
        export.stdout.close()
        if export.wait() != 0:
            raise RuntimeError(f"docker export {tag} exited {export.returncode}")
    finally:
        subprocess.run(["docker", "rm", "-f", cid], capture_output=True)
    return sorted({(hit.name, hit.digest) for hit in hits})


def main() -> None:
    out, images = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text())
    hits, scanned, errors = scan_paths([Path(p) for p in sys.argv[3:]], [])
    if errors:
        sys.exit("unreadable: " + "; ".join(errors))
    known = {(hit.name, hit.digest) for hit in hits}
    per_source = {"paths": {"files": scanned, "matches": len(known)}}
    with ProcessPoolExecutor(WORKERS) as pool:
        for row, found in zip(images, pool.map(image_matches, [row["tag"] for row in images])):
            per_source[row["scenario"]] = len(found)
            known |= set(found)
    out.write_text(json.dumps([{"pattern": p, "sha256": d} for p, d in sorted(known)], indent=2) + "\n")
    print(json.dumps({"fingerprints": len(known), "patterns": sorted({p for p, _ in known}), "per_source": per_source}))


if __name__ == "__main__":
    main()
