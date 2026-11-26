#!/bin/sh
# Qualify ab01 tasks: rows to ~/ab01/$1/qual.jsonl, log to ~/ab01/$1.log, exit code to ~/ab01/$1.rc. The key goes from the passwd file straight to stdin.
export PATH=$HOME/.local/bin:$PATH
out=$1; shift
cd ~/ab01/repo || exit 2
grep '^DROID_API_KEY=' ~/.ssh/passwd | cut -d= -f2- | PYTHONPATH=$PWD uv run --frozen --project evals python ~/ab01/qualify.py --host-images ~/ab01/images/hosts.json --out ~/ab01/$out --model deepseek-v4.1-flash --concurrency 6 "$@" > ~/ab01/$out.log 2>&1
echo $? > ~/ab01/$out.rc
