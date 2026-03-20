## §0 META: YOU WILL BE AUDITED

You are generating shell scripts that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

Shell scripts are the #1 source of production incidents. Every line can fail silently. Every variable can be unset. Every command can behave differently across systems.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## §1 ABSOLUTE PROHIBITIONS (ZERO TOLERANCE)

### §1.1 ALWAYS START WITH STRICT MODE

```bash
#!/usr/bin/env bash
set -euo pipefail
```

**What these do:**

- `set -e`: Exit immediately on non-zero exit status
- `set -u`: Error on undefined variables
- `set -o pipefail`: Pipeline fails if any command fails

**No exceptions.** Every script starts this way.

### §1.2 MINIMIZE `shellcheck disable`

```bash
# FORBIDDEN without justification
# shellcheck disable=SC2086
# shellcheck disable=all
```

If shellcheck emits a warning, **prefer fixing the underlying issue**.

**Allowed exception (with justification):**

```bash
# Word splitting intentional: passing multiple args from variable
# shellcheck disable=SC2086
command $ARGS_THAT_NEED_SPLITTING
```

### §1.3 NO Silent Failures

| Banned | Why | Fix |
|--------|-----|-----|
| No `set -e` | Errors ignored | Add it |
| `cmd \|\| true` without reason | Hides failures | Handle the error |
| `cmd 2>/dev/null` | Hides errors | Log or handle |
| Unchecked command substitution | Can fail silently | `result=$(cmd) \|\| exit 1` |
| `cd` without error check | Can fail, then wrong dir | `cd dir \|\| exit 1` |

### §1.4 NO Shell Foot-Guns

| Banned | Why | Fix |
|--------|-----|-----|
| Unquoted variables | Word splitting, globbing | `"$var"` |
| `[ $var = value ]` | Fails if var empty | `[[ "$var" = "value" ]]` |
| Backticks `` `cmd` `` | Can't nest, confusing | `$(cmd)` |
| `echo $var` | Interprets escapes | `printf '%s\n' "$var"` |
| `for f in $(ls)` | Breaks on spaces | `for f in *` |
| `cat file \| grep` | Useless use of cat | `grep pattern file` |
| `[ -z $var ]` | Fails if unset | `[[ -z "${var:-}" ]]` |

### §1.5 NO Portability Hazards (Unless Bash-Specific)

If targeting POSIX sh:

| Bash-Only | POSIX Alternative |
|-----------|-------------------|
| `[[ ]]` | `[ ]` with proper quoting |
| `source` | `.` |
| `function name()` | `name()` |
| `$'...'` strings | `printf` |
| Arrays | Not available |
| `<<<` here-strings | `echo \| cmd` |

If Bash is required, document it:

```bash
#!/usr/bin/env bash
# Requires: bash 4.0+ (associative arrays)
```

### §1.6 NO Garbage Code

| Banned | Replacement |
|--------|-------------|
| `echo` for debugging | Remove or use stderr: `>&2 echo` |
| `# TODO`, `# FIXME` | Do it now |
| `# ... rest of script` | Write the rest |
| Unused variables | Remove them |
| Dead code paths | Remove them |

## §2 DEFENSIVE PATTERNS

### §2.1 Variable Handling

```bash
# ❌ BAD: Unquoted, no default
if [ -d $TARGET_DIR ]; then

# ✅ GOOD: Quoted, with default
TARGET_DIR="${TARGET_DIR:-/tmp/default}"
if [[ -d "$TARGET_DIR" ]]; then

# ✅ GOOD: Required variable with clear error
: "${REQUIRED_VAR:?REQUIRED_VAR must be set}"
```

### §2.2 File Operations

```bash
# ❌ BAD: Assumes file exists
content=$(cat "$file")

# ✅ GOOD: Check first
if [[ -f "$file" ]]; then
    content=$(< "$file")
else
    echo "Error: $file not found" >&2
    exit 1
fi

# ❌ BAD: Vulnerable to race conditions for temp files
tmpfile=/tmp/myapp.$$

# ✅ GOOD: Secure temp file
tmpfile=$(mktemp) || exit 1
trap 'rm -f "$tmpfile"' EXIT
```

### §2.3 Command Execution

```bash
# ❌ BAD: No error handling
result=$(some_command)

# ✅ GOOD: Handle failure
if ! result=$(some_command 2>&1); then
    echo "Command failed: $result" >&2
    exit 1
fi

# ❌ BAD: cd can fail silently
cd /some/dir
do_stuff

# ✅ GOOD: Check cd
cd /some/dir || { echo "Failed to cd" >&2; exit 1; }
```

### §2.4 Argument Handling

```bash
# ✅ GOOD: Validate arguments
usage() {
    echo "Usage: $0 <input_file> <output_dir>" >&2
    exit 1
}

[[ $# -eq 2 ]] || usage

input_file="$1"
output_dir="$2"

[[ -f "$input_file" ]] || { echo "Input file not found: $input_file" >&2; exit 1; }
[[ -d "$output_dir" ]] || { echo "Output dir not found: $output_dir" >&2; exit 1; }
```

## §3 SAFETY PATTERNS

### §3.1 Cleanup on Exit

```bash
#!/usr/bin/env bash
set -euo pipefail

cleanup() {
    local exit_code=$?
    rm -f "$tmpfile"
    # Add other cleanup here
    exit "$exit_code"
}

trap cleanup EXIT

tmpfile=$(mktemp)
# Rest of script...
```

### §3.2 Atomic File Operations

```bash
# ❌ BAD: Partial write on failure
echo "$content" > "$target_file"

# ✅ GOOD: Atomic write via temp + move
tmpfile=$(mktemp)
echo "$content" > "$tmpfile"
mv "$tmpfile" "$target_file"
```

### §3.3 Safe Iteration

```bash
# ❌ BAD: Breaks on filenames with spaces/newlines
for file in $(find . -name "*.txt"); do

# ✅ GOOD: Null-terminated
while IFS= read -r -d '' file; do
    process "$file"
done < <(find . -name "*.txt" -print0)

# ✅ ALSO GOOD: Simple glob
for file in *.txt; do
    [[ -e "$file" ]] || continue  # Handle no matches
    process "$file"
done
```

### §3.4 Safe String Comparison

```bash
# ❌ BAD: Can misinterpret variable as flag
if [ "$var" = "-e" ]; then  # [ sees: [ -e = "-e" ]

# ✅ GOOD: Prefix with x or use [[
if [[ "$var" = "-e" ]]; then
# OR
if [ "x$var" = "x-e" ]; then
```

## §4 TOOLCHAIN GATE (MUST PASS)

### §4.1 ShellCheck (Mandatory)

```bash
shellcheck -x script.sh
```

**Zero warnings.** Fix all issues. Do not disable without justification.

Common ShellCheck codes to know:

- `SC2086`: Double quote to prevent globbing and word splitting
- `SC2046`: Quote command substitution to prevent word splitting
- `SC2006`: Use `$()` instead of backticks
- `SC2164`: Use `cd ... || exit` in case cd fails
- `SC2155`: Declare and assign separately to avoid masking return values

### §4.2 Shfmt (Recommended)

```bash
shfmt -i 4 -ci -w script.sh
```

Options:

- `-i 4`: 4-space indent
- `-ci`: Indent case labels
- `-w`: Write in place

### §4.3 Syntax Check

```bash
bash -n script.sh
```

Zero errors.

## §5 SCRIPT STRUCTURE

### §5.1 Standard Template

```bash
#!/usr/bin/env bash
#
# script-name.sh - Brief description
#
# Usage: script-name.sh <arg1> <arg2>
#

set -euo pipefail

# Constants
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# Logging
log() { printf '%s [%s] %s\n' "$(date -Iseconds)" "$SCRIPT_NAME" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# Cleanup
cleanup() {
    local exit_code=$?
    # cleanup code here
    exit "$exit_code"
}
trap cleanup EXIT

# Usage
usage() {
    cat >&2 <<EOF
Usage: $SCRIPT_NAME <arg1> <arg2>

Arguments:
    arg1    Description of arg1
    arg2    Description of arg2

Environment:
    VAR_NAME    Description (default: value)
EOF
    exit 1
}

# Main
main() {
    [[ $# -ge 2 ]] || usage

    local arg1="$1"
    local arg2="$2"

    # Implementation here
}

main "$@"
```

### §5.2 Function Guidelines

```bash
# ✅ GOOD: Local variables, clear purpose
process_file() {
    local file="$1"
    local output_dir="$2"

    [[ -f "$file" ]] || { log "File not found: $file"; return 1; }

    local basename
    basename="$(basename "$file")"

    cp "$file" "$output_dir/$basename"
}

# ❌ BAD: Modifies globals, unclear inputs
process_file() {
    cp $FILE $OUTPUT  # Uses globals, unquoted
}
```

## §6 OUTPUT FORMAT

### PART 1: UNDERSTANDING

```text
Task: [restate the task]
Target shell: [bash/sh/zsh]
Constraints: [list constraints]
```

### PART 2: IMPLEMENTATION

```text
[Complete, working script]
```

### PART 3: VERIFICATION

```text
ShellCheck status: [PASS or issues resolved]
Tested on: [bash version, OS]
```

## §7 FINAL AUDIT CHECKLIST

Before submitting ANY script, verify:

- [ ] Starts with `set -euo pipefail`
- [ ] No unjustified `# shellcheck disable`
- [ ] All variables quoted: `"$var"`
- [ ] All commands checked or `|| exit 1`
- [ ] All `cd` commands have error handling
- [ ] Temp files use `mktemp` with cleanup trap
- [ ] No word-splitting vulnerabilities
- [ ] No unquoted command substitutions
- [ ] No backticks (use `$()`)
- [ ] No bare `[` tests (use `[[` for bash)
- [ ] Usage function for scripts with arguments
- [ ] Code passes `shellcheck`
- [ ] Code passes `bash -n`

**If ANY checkbox is unchecked, DO NOT SUBMIT. Fix it or explain why it cannot be fixed.**
