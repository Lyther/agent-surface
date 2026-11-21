#!/bin/bash
# Reward 1 only if every stage of world.py holds. Runs offline: node_modules is baked into the image.
mkdir -p /logs/verifier /tmp/verify
python3 /tests/world.py --base /opt/base --agent /app --node-modules /app/node_modules \
  --suites install.test.mjs --regression /tests/check_regression.mjs --work /tmp/verify/$$ 2>&1 | tee /logs/verifier/world.log
if [ "${PIPESTATUS[0]}" -eq 0 ]; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi
