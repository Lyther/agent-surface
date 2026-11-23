"""Prefix each stdin line with the wall-clock time in epoch seconds (sub-second); the watcher pipes inotifywait through it."""

import sys
import time

for line in sys.stdin:
    sys.stdout.write(f"{time.time():.3f} {line}")
    sys.stdout.flush()
