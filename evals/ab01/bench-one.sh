#!/bin/sh
# Build the droid image of one ab01 task: rows to images/bench-$1.jsonl, exit code to images/bench-$1.rc.
export PATH=$HOME/.local/bin:$PATH
cd ~/ab01/repo || exit 2
uv run --frozen --project evals python -m evals.images bench --host-images ~/ab01/images/hosts.json --task ~/ab01/bench/swebenchpro/$1 > ~/ab01/images/bench-$1.jsonl 2> ~/ab01/images/bench-$1.err
echo $? > ~/ab01/images/bench-$1.rc
