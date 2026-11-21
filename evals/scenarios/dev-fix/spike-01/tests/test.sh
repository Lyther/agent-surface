#!/bin/bash
# Reward 1 only if the hidden fix tests pass and a regression test was added.
mkdir -p /logs/verifier
cd /app || exit 1
fix=1; reg=1
python -m pytest -q -p no:cacheprovider -c /dev/null --rootdir /app /tests/hidden_test_paging.py && fix=0
python /tests/check_regression.py && reg=0
if [ "$fix" -eq 0 ] && [ "$reg" -eq 0 ]; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi
