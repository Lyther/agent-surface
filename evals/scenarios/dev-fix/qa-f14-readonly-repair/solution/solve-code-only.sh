#!/bin/bash
# Qualification variant: the correct code change without any test. The verifier must score it 0.
set -e
cd /app
git apply "$(dirname "$0")/fix.patch"
