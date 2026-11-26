#!/bin/sh
# Does droid's model see the installed skills? Per arm (the run's own tarballs, extracted into HOME as the lab does), ask for the
# skill list without tools, then give a task that matches dev-fix's description. The key comes on stdin and reaches the
# container only through `docker run -e`; outputs land in ~/ab01/skill-probe, owned by this user.
IFS= read -r FACTORY_API_KEY || exit 3
export FACTORY_API_KEY
image=sq-host/droid:0.244.0
out=$HOME/ab01/skill-probe
mkdir -p "$out" || exit 2
remove=$(python3 -c 'import re, sys; print(re.search(r"DROID_REMOVE_TOOLS = \(\s*\"([^\"]+)\"", open(sys.argv[1]).read()).group(1))' "$HOME/ab01/repo/evals/agents.py") || exit 2
list='Do not call any tools. List the exact names of every skill you can invoke with the Skill tool, one per line, then stop. If you have none, reply NONE.'
fix='In calc.py, add(a, b) returns a - b. The bug is confirmed and diagnosed: it must return a + b. Fix it.'

run() {
  docker run --rm -e FACTORY_API_KEY -e FACTORY_DROID_AUTO_UPDATE_ENABLED=false -e REMOVE="$remove" -e PROMPT="$3" \
    -v "$HOME/ab01/arms/$1/droid.tgz:/tmp/arm.tgz:ro" --entrypoint sh "$image" -c '
      tar -xzf /tmp/arm.tgz -C "$HOME" 2>/dev/null
      mkdir -p /tmp/probe && printf "def add(a, b):\n    return a - b\n" > /tmp/probe/calc.py && cd /tmp/probe &&
      exec droid exec --skip-permissions-unsafe -m deepseek-v4.1-flash --remove-tools "$REMOVE" -o stream-json -- "$PROMPT"' \
    > "$out/$1-$2.jsonl" 2> "$out/$1-$2.err"
  echo "$1-$2: exit=$?"
}

for arm in none full; do
  run "$arm" list "$list"
  run "$arm" fix "$fix"
done
