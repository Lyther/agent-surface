#!/bin/bash
# Reward 1 only if the agent copied the body-only heading, which the frontmatter and listing do not contain.
mkdir -p /logs/verifier
if grep -q "Workflow Mode (run ledger v3)" /app/CONTROL.txt 2>/dev/null; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi
