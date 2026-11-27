#!/bin/sh
# Rule probe on the lab host (rule_probe.py). The Factory key goes from the host's secret file to the driver's stdin; then
# the lab's scrubber checks every attempt for it and for credential patterns outside ab01's known inputs, and moves an
# attempt with a hit to quarantine/. Exit codes to probe.rc and scrub.rc. Start it detached: setsid nohup sh rule-probe.sh
out=$HOME/ab02/rule-probe
evals=$HOME/ab02/repo/evals
mkdir -p "$out" || exit 2
grep "^DROID_API_KEY=" ~/.ssh/passwd | cut -d= -f2- | python3 "$evals/ab01/rule_probe.py" "$HOME/ab01" "$evals/agents.py" "$out" > "$out/probe.log" 2>&1
echo $? > "$out/probe.rc"
grep "^DROID_API_KEY=" ~/.ssh/passwd | cut -d= -f2- | python3 "$evals/scrub.py" --known "$HOME/ab01/input-fingerprints.json" --quarantine "$out/quarantine" "$out"/R?/* > "$out/scrub.log" 2>&1
echo $? > "$out/scrub.rc"
