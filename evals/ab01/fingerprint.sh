#!/bin/sh
export PATH=$HOME/.local/bin:$PATH
cd ~/ab01/repo || exit 2
PYTHONPATH=$PWD uv run --frozen --project evals python ~/ab01/fingerprint.py ~/ab01/input-fingerprints.json ~/ab01/images/bench-images.json ~/ab01/arms/none/droid.tgz ~/ab01/arms/full/droid.tgz ~/ab01/bench/terminal-bench ~/ab01/bench/swebenchpro > ~/ab01/fingerprint.log 2>&1
echo $? > ~/ab01/fingerprint.rc
