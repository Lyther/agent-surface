#!/bin/sh
# Parse-only probe of codex and claude with a dash-first prompt, bare and after `--`: empty config homes and no credential
# variables, so a prompt that parses fails at authentication before any model call. Prints exit codes and error classes only.
scratch=$(mktemp -d /tmp/as-parse-probe.XXXXXX) || exit 2
prompt='- Reply with OK.'
run() {
  env -u OPENAI_API_KEY -u CODEX_API_KEY -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u CLAUDE_CODE_OAUTH_TOKEN \
    HOME="$scratch/home" CODEX_HOME="$scratch/codex" CLAUDE_CONFIG_DIR="$scratch/claude" timeout 60 "$@" < /dev/null 2>&1
}
mkdir -p "$scratch/home" "$scratch/codex" "$scratch/claude"
for form in bare marked; do
  if [ "$form" = bare ]; then set -- "$prompt"; else set -- -- "$prompt"; fi
  out=$(run codex exec --json --skip-git-repo-check "$@"); code=$?
  echo "codex $form: exit=$code parse_error=$(printf '%s\n' "$out" | grep -ci 'unexpected argument\|unknown option\|error: unrecognized') auth_error=$(printf '%s\n' "$out" | grep -ci 'auth\|api key\|login\|401')"
  out=$(run claude -p --output-format stream-json --verbose "$@"); code=$?
  echo "claude $form: exit=$code parse_error=$(printf '%s\n' "$out" | grep -ci 'unknown option\|unexpected argument') auth_error=$(printf '%s\n' "$out" | grep -ci 'auth\|api key\|login\|401')"
done
rm -rf "${scratch:?}"
