#!/bin/sh
# Wait on the ab01 full run: exit when it ends, when a row is quarantined or skipped, or after $1 minutes for a progress check.
# Runs on the operator machine; AB_HOST is the lab host's SSH name.
host=${AB_HOST:?set AB_HOST to the lab host}
minutes=${1:-40}
end=$(( $(date +%s) + minutes * 60 ))
s=""
while [ "$(date +%s)" -lt "$end" ]; do
  s=$(ssh -o ConnectTimeout=15 -o BatchMode=yes "$host" 'rc=$(cat ~/ab01/full.rc 2>/dev/null); l=$(cat ~/ab01/full/ledger.jsonl 2>/dev/null | wc -l); b=$(grep -c -e "\"status\"" -e "\"skipped\"" ~/ab01/full/ledger.jsonl 2>/dev/null); echo "rc=${rc:-none} rows=$l flagged=${b:-0}"' 2>/dev/null)
  case "$s" in
    rc=none*flagged=0) ;;
    rc=*) echo "$s"; exit 0 ;;
  esac
  sleep 60
done
echo "checkpoint: ${s:-ssh unreachable}"
