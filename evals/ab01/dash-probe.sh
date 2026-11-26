#!/bin/sh
# Reproduce the dash-first instruction fault with the real droid binary in the host image: the prompt as a bare operand, then after `--`.
# The key comes on stdin and reaches the container only through `docker run -e`.
IFS= read -r FACTORY_API_KEY || exit 3
export FACTORY_API_KEY
image=sq-host/droid:0.244.0
prompt='- Reply with the single word OK and nothing else.'
for form in bare marked; do
  if [ "$form" = bare ]; then set -- "$prompt"; else set -- -- "$prompt"; fi
  out=$(docker run --rm -e FACTORY_API_KEY -e FACTORY_DROID_AUTO_UPDATE_ENABLED=false --entrypoint droid "$image" \
    exec --skip-permissions-unsafe -m deepseek-v4.1-flash -o stream-json "$@" 2>&1)
  code=$?
  unknown=$(printf '%s\n' "$out" | grep -c "unknown option")
  result=$(printf '%s\n' "$out" | grep -c '"type":"completion"\|"type":"result"')
  echo "$form: exit=$code unknown_option_lines=$unknown result_events=$result"
done
