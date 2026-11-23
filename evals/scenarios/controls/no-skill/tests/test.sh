#!/bin/bash
mkdir -p /logs/verifier
if grep -qx "42" /app/CONTROL.txt 2>/dev/null; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi
