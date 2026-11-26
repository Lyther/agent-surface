#!/bin/sh
# usage: run.sh OUTNAME COHORT_ARGS...  The Factory key goes only to the cohort stdin; exit code to OUTNAME.rc.
export PATH=$HOME/.local/bin:$PATH
out=$1; shift
cd ~/ab01/repo/evals || exit 2
grep "^DROID_API_KEY=" ~/.ssh/passwd | cut -d= -f2- | PYTHONPATH=$PWD/.. uv run --frozen python -m evals.cohort \
  --host-images ~/ab01/images/hosts.json --arms ~/ab01/arms/arms.json --out ~/ab01/$out \
  --hosts droid --profiles none,full --arms-together --timeouts-are-outcomes --input-fingerprints ~/ab01/input-fingerprints.json --spend droid=uncapped --model droid=deepseek-v4.1-flash "$@" > ~/ab01/$out.log 2>&1
echo $? > ~/ab01/$out.rc
