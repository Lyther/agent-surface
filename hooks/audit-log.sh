#!/usr/bin/env sh
# agent-surface example hook: fail-open, metadata-only local audit log.
#
# Records only a UTC timestamp and the event name passed as the first argument.
# It never logs file contents, command text, prompt text, or tool input, so it
# cannot leak secrets. It drains stdin and always exits 0, so it can neither
# block nor stall the agent loop. Wire it from a target hook config as:
#   sh .cursor/hooks/audit-log.sh <eventName>
event=${1:-unknown}

# Drain the JSON the runtime sends on stdin without inspecting or storing it.
cat >/dev/null 2>&1 || true

log_dir=.agent-surface/hooks
mkdir -p "$log_dir" 2>/dev/null || exit 0
printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)" "$event" >>"$log_dir/audit.log" 2>/dev/null || true
exit 0
