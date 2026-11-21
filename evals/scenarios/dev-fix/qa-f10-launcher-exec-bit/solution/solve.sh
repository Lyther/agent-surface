#!/bin/bash
# The real fix: code diff plus the regression test it shipped with.
set -e
cd /app
git apply "$(dirname "$0")/fix.patch" "$(dirname "$0")/tests.patch"
