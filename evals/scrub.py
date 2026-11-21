"""Receipt credential scrubber.

Secret values come from stdin only, one per line, optionally as NAME=value (NAME becomes the label).
Every regular file under the given paths is scanned as raw bytes for each value, and for the credential
patterns below. Gzip streams and tar archives are also scanned decoded, because SQ0.1 receipts contain
overlay tarballs. Output names the file, byte offset and label or pattern, never the matched bytes.

Exit codes: 0 clean, 1 hits, 2 usage error or unreadable input.
"""

from __future__ import annotations

import argparse
import gzip
import io
import os
import re
import shutil
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Iterator

EXIT_CLEAN, EXIT_HITS, EXIT_USAGE = 0, 1, 2

CHUNK = 1 << 20
# A pattern match never spans more than this many bytes (all quantifiers below are bounded), so the
# tail kept between chunks is enough to find matches that straddle a chunk boundary.
MAX_SPAN = 1024
# Shorter values match unrelated bytes by chance and would quarantine every receipt.
MIN_SECRET_LEN = 8
GZIP_MAGIC = b"\x1f\x8b"
TAR_MAGIC_OFFSET, TAR_MAGIC = 257, b"ustar"
LABEL_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")

# Formats are the providers' published prefixes and lengths; bounded so scans stay linear.
PATTERNS: dict[str, re.Pattern[bytes]] = {
    "anthropic-key": re.compile(rb"sk-ant-[A-Za-z0-9_-]{20,200}"),
    "openai-key": re.compile(rb"sk-(?:proj-|svcacct-|admin-)[A-Za-z0-9_-]{20,200}|\bsk-[A-Za-z0-9]{48}\b"),
    "github-token": re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{36,255}\b|\bgithub_pat_[A-Za-z0-9_]{22,255}"),
    "aws-access-key-id": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "google-api-key": re.compile(rb"\bAIza[A-Za-z0-9_-]{35}\b"),
    "factory-key": re.compile(rb"\bfk-[A-Za-z0-9_-]{20,200}"),
    "pem-private-key": re.compile(rb"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----"),
    "authorization-bearer": re.compile(rb"(?i)authorization[\"']?\s*[:=]\s*[\"']?bearer\s+[A-Za-z0-9._~+/=-]{16,512}"),
    "x-api-key-header": re.compile(rb"(?i)x-api-key[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._~+/=-]{16,512}"),
}


@dataclass(frozen=True)
class Hit:
    kind: str  # "exact" or "pattern"
    name: str  # secret label or pattern name
    path: str  # file, or "archive!member" inside an archive
    offset: int

    def line(self) -> str:
        return f"HIT {self.kind} {self.name} {self.path} offset={self.offset}"


@dataclass(frozen=True)
class Secret:
    label: str
    value: bytes


def parse_secrets(lines: Iterator[str]) -> list[Secret]:
    """Parse stdin lines. Raises ValueError naming the label only, never the value."""
    secrets: list[Secret] = []
    for number, raw in enumerate(lines, 1):
        line = raw.rstrip("\r\n")
        if not line:
            continue
        match = LABEL_RE.match(line)
        label, value = (match.group(1), match.group(2)) if match else (f"secret-{number}", line)
        if len(value.encode()) < MIN_SECRET_LEN:
            raise ValueError(f"secret {label!r} (line {number}) is shorter than {MIN_SECRET_LEN} bytes")
        secrets.append(Secret(label, value.encode()))
    return secrets


def scan_stream(stream: BinaryIO, where: str, secrets: list[Secret]) -> list[Hit]:
    """Scan one byte stream in chunks; offsets are positions in that stream."""
    carry = max([MAX_SPAN] + [len(s.value) for s in secrets])
    hits: list[Hit] = []
    seen: set[tuple[str, int]] = set()
    tail, base = b"", 0
    while True:
        chunk = stream.read(CHUNK)
        data = tail + chunk
        found: list[Hit] = []
        for secret in secrets:
            start = data.find(secret.value)
            while start != -1:
                found.append(Hit("exact", secret.label, where, base + start))
                start = data.find(secret.value, start + 1)
        for name, pattern in PATTERNS.items():
            found.extend(Hit("pattern", name, where, base + m.start()) for m in pattern.finditer(data))
        for hit in found:
            key = (hit.name, hit.offset)
            if key not in seen:
                seen.add(key)
                hits.append(hit)
        if not chunk:
            return hits
        tail = data[-carry:]
        base += len(data) - len(tail)
        seen = {key for key in seen if key[1] >= base}


def scan_file(path: Path, secrets: list[Secret]) -> list[Hit]:
    """Scan raw bytes, then the decoded gzip stream and tar members when the file is one."""
    where = str(path)
    with path.open("rb") as raw:
        hits = scan_stream(raw, where, secrets)
        raw.seek(0)
        head = raw.read(TAR_MAGIC_OFFSET + len(TAR_MAGIC))
    if head.startswith(GZIP_MAGIC):
        with gzip.open(path, "rb") as inner:
            return hits + scan_decoded(inner, where, secrets)
    if head[TAR_MAGIC_OFFSET:] == TAR_MAGIC:
        with path.open("rb") as raw:
            return hits + scan_tar(raw, where, secrets)
    return hits


def scan_decoded(inner: BinaryIO, where: str, secrets: list[Secret]) -> list[Hit]:
    buffered = io.BufferedReader(inner)  # type: ignore[arg-type]
    if buffered.peek(TAR_MAGIC_OFFSET + len(TAR_MAGIC))[TAR_MAGIC_OFFSET : TAR_MAGIC_OFFSET + len(TAR_MAGIC)] == TAR_MAGIC:
        return scan_tar(buffered, where, secrets)
    return scan_stream(buffered, f"{where}!gunzip", secrets)


def scan_tar(stream: BinaryIO, where: str, secrets: list[Secret]) -> list[Hit]:
    hits: list[Hit] = []
    with tarfile.open(fileobj=stream, mode="r|") as archive:
        for member in archive:
            body = archive.extractfile(member) if member.isreg() else None
            if body is not None:
                hits += scan_stream(body, f"{where}!{member.name}", secrets)
    return hits


def scan_paths(paths: list[Path], secrets: list[Secret]) -> tuple[list[Hit], int, list[str]]:
    """Return (hits, files scanned, unreadable files). Symlinks are not followed."""
    hits: list[Hit] = []
    errors: list[str] = []
    scanned = 0
    for root in paths:
        files = [root] if root.is_file() and not root.is_symlink() else sorted(
            p for p in root.rglob("*") if p.is_file() and not p.is_symlink()
        )
        for file in files:
            try:
                hits += scan_file(file, secrets)
                scanned += 1
            except (OSError, tarfile.TarError, EOFError) as error:
                errors.append(f"{file}: {type(error).__name__}")
    return hits, scanned, errors


def quarantine(receipt: Path, quarantine_dir: Path) -> Path:
    """Move a receipt (an attempt directory or file) into quarantine_dir, created 0700."""
    quarantine_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(quarantine_dir, 0o700)
    target = quarantine_dir / receipt.name
    suffix = 0
    while target.exists():
        suffix += 1
        target = quarantine_dir / f"{receipt.name}.{suffix}"
    moved = Path(shutil.move(str(receipt), str(target)))
    os.chmod(moved, 0o700 if moved.is_dir() else 0o600)
    return moved


def scan_receipt(receipt: Path, secrets: list[Secret], quarantine_dir: Path | None) -> list[Hit]:
    """Scan one receipt; on any hit move it into quarantine_dir (when given) and return the hits.

    The caller (the cohort loop) must stop the cohort when the result is non-empty.
    """
    hits, _, errors = scan_paths([receipt], secrets)
    if errors:
        raise OSError("; ".join(errors))
    if hits and quarantine_dir is not None:
        quarantine(receipt, quarantine_dir)
    return hits


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m evals.scrub",
        description="Scan receipts for credentials. Secret values are read from stdin, one per line, as VALUE or NAME=VALUE.",
        epilog="Exit codes: 0 clean, 1 hits, 2 usage error or unreadable file.",
    )
    parser.add_argument("--quarantine", type=Path, metavar="DIR", help="move each path that has hits into DIR (mode 0700)")
    parser.add_argument("paths", nargs="+", type=Path, metavar="PATH")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exit_:
        return EXIT_USAGE if exit_.code else EXIT_CLEAN
    if sys.stdin.isatty():
        print("usage error: secret values must be piped on stdin", file=sys.stderr)
        return EXIT_USAGE
    try:
        secrets = parse_secrets(sys.stdin)
    except ValueError as error:
        print(f"usage error: {error}", file=sys.stderr)
        return EXIT_USAGE
    missing = [p for p in args.paths if not p.exists()]
    if missing:
        print(f"usage error: no such path: {missing[0]}", file=sys.stderr)
        return EXIT_USAGE

    total_hits, total_files, total_errors = 0, 0, 0
    exact = pattern = 0
    for path in args.paths:
        hits, scanned, errors = scan_paths([path], secrets)
        total_files += scanned
        total_errors += len(errors)
        for error in errors:
            print(f"ERROR unreadable {error}", file=sys.stderr)
        for hit in hits:
            print(hit.line())
        exact += sum(h.kind == "exact" for h in hits)
        pattern += sum(h.kind == "pattern" for h in hits)
        total_hits += len(hits)
        if hits and args.quarantine is not None:
            print(f"QUARANTINED {path} -> {quarantine(path, args.quarantine)}")
    print(f"scanned files={total_files} secrets={len(secrets)} exact_hits={exact} pattern_hits={pattern} unreadable={total_errors}")
    if total_hits:
        return EXIT_HITS
    return EXIT_USAGE if total_errors else EXIT_CLEAN


if __name__ == "__main__":
    sys.exit(main())
