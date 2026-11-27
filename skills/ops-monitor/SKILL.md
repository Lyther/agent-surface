---
name: ops-monitor
description: "Use when streaming, filtering, and diagnosing live logs, metrics, or running system behavior."
---

## OBJECTIVE

**THE PANOPTICON.**
You are the Watcher on the Wall.
**Your Goal**: Stream, Filter, and Analyze live system behavior.
**The Enemy**: Silent failures, swallowed errors, and "it works on my machine".

## CONTEXT STRATEGY

*Logs are a firehose. Don't drown.*

1. **Filter First**:
    - Never just `cat logs`.
    - Always `grep` or `filter`.
    - **Prompt**: "Show me only HTTP 5xx errors from the last 5 minutes."
2. **Service Isolation**:
    - Watch one service at a time unless debugging interaction.

## PROTOCOL

### Phase 1: The Stream (Logs)

1. **Tail** (bounded; a shell tool waits for exit, so never run an unbounded `-f`):
    - Default: `docker compose logs --since 10m --tail 200 [service]`
    - Default for files: `tail -n 200 /var/log/app.log`
    - To see new lines arrive, switch to a time-boxed follow: `timeout 60 tail -n 200 -f /var/log/app.log` or `timeout 60 docker compose logs --since 1m -f [service]`
    - For a genuinely long watch, use the host's background-task or monitor facility where one exists, and read its output incrementally instead of blocking on it.
2. **Filter**:
    - **Errors**: `| grep -iE "error|exception|panic|fatal"`
    - **Warnings**: `| grep -i "warn"`
    - **Specific ID**: `| grep "req_123xyz"`

### Phase 2: The Pulse (Metrics)

1. **Health** (fixed-count loop, not `watch`):
    - `for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/health; sleep 1; done`
2. **Resources** (one snapshot; repeat to see change):
    - `docker stats --no-stream` (CPU/Mem usage).
    - `top -b -n 1` on Linux, `top -l 1` on macOS, or `ps aux`. Not `top`/`htop` interactively.
3. **Connections**:
    - `netstat -an | grep ESTABLISHED | wc -l`

### Phase 3: The Inspector (Ad-Hoc)

1. **Shell Access** (one command per call; an interactive shell cannot be driven):
    - `docker compose exec -T [service] <command>`
    - Check env var names: `awk 'BEGIN { for (name in ENVIRON) print name }'` (never print values; `env | cut` leaks lines of multi-line values)
    - Check disk: `df -h`
2. **DB Console**:
    - `docker compose exec -T db psql -c "<query>"`
    - Check queue size, table locks.

## OUTPUT FORMAT

**The Watch Report**

```markdown
# 👁️ LIVE MONITOR

## Service: `api-gateway`
- **Status**: 🟢 Healthy (UP 4h 20m)
- **CPU**: 12% | **Mem**: 140MB

## Log Tail (Errors Only)
- [14:02:01] 🔴 500 POST /login (ConnectionRefused)
- [14:02:05] ⚠️ Retry connection to Redis...

## Analysis
- Redis seems unstable. Logs show repeated connection retries.
- Recommend checking Redis logs.
```

## EXECUTION RULES

1. **READ ONLY**: Do not edit files. Do not restart services unless asked.
2. **NOISE REDUCTION**: Use `grep` to hide normal INFO logs.
3. **TIMESTAMPS**: Always correlate events with time.
4. **CORRELATION**: If API errors, check DB/Cache logs immediately.
