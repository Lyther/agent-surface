#!/bin/sh
# ab01 full run: the prereg's run.tasks through run.sh, with a host-load sampler for the run's duration. Rerunning resumes:
# cohort skips cells that already have attempt rows.
ab=$HOME/ab01
if pgrep -f 'evals[.]cohort' > /dev/null; then
  echo "a cohort is already running" >&2
  exit 2
fi
python3 - "$ab/prereg.json" "$ab/bench" > "$ab/full.args" <<'EOF' || exit 2
import json, sys
run = json.load(open(sys.argv[1]))["run"]
for suite, tasks in run["tasks"].items():
    for task in tasks:
        print(f"--scenario {sys.argv[2]}/{suite}/{task}")
print(f"--reps {run['reps']} --concurrency {run['concurrency_groups']} --seed {run['seed']} --prereg ab01")
EOF
cd "$ab/repo" || exit 2
python3 -m evals.sample record --out "$ab/full-samples.jsonl" --interval 10 2>> "$ab/full-samples.err" < /dev/null &
sampler=$!
# full.args holds generated options over paths without spaces; splitting them into arguments is the intent.
# shellcheck disable=SC2046
"$ab/run.sh" full $(cat "$ab/full.args")
kill -TERM "$sampler"
