#!/bin/sh
# Build the droid image of every ab01 benchmark task; rows to images/bench.jsonl, exit code to images/bench.rc.
export PATH=$HOME/.local/bin:$PATH
cd ~/ab01/repo || exit 2
set --
for d in ~/ab01/bench/terminal-bench/* ~/ab01/bench/swebenchpro/*; do set -- "$@" --task "$d"; done
uv run --frozen --project evals python -m evals.images bench --host-images ~/ab01/images/hosts.json "$@" > ~/ab01/images/bench.jsonl 2> ~/ab01/images/bench.err
echo $? > ~/ab01/images/bench.rc
