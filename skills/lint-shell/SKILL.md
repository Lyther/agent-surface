---
name: lint-shell
description: "Use when writing or reviewing Bash or POSIX sh scripts. Applies strict quoting, set -euo pipefail/set -eu safety, rm guards, and ShellCheck/shfmt rules."
---

## Baseline

Target the shell declared by the script's shebang (`#!/usr/bin/env bash` vs `#!/bin/sh`), and apply the same safety rules to shell snippets inside `Dockerfile`s, `Makefile`s, `justfile`s, and CI workflow YAML (`rules/code.md`). Do not rewrite portable POSIX `sh` into Bash unless Bash features (arrays, `[[ ... ]]`, `pipefail`) materially simplify or harden the script. If a constraint below cannot be met, stop and name the blocker.

## Rules and Examples

### 1. Strict Mode by Execution Context

Standalone executable Bash scripts start with `set -euo pipefail`; standalone POSIX `sh` scripts start with `set -eu` (`pipefail` is not POSIX). Never put `set -e` or `set -u` at the top of a **sourced** script (e.g. env/profile/completion hooks), where an error would terminate the caller's interactive shell—state the sourced-file exception in a header comment instead.

```bash
#!/usr/bin/env bash
set -euo pipefail
```

### 2. Quoting, Argument Arrays, and Masked Exit Codes

Quote every parameter expansion and command substitution (`"$var"`, `"$(cmd)"`) to prevent word-splitting and globbing. Assemble dynamic command flags in Bash arrays (`"${args[@]}"`), never space-separated strings. Separate `local` / `export` / `readonly` declarations from `$(...)` assignments so command failures are not masked by `local`'s `0` exit status (`SC2155`).

```bash
# Bad: word-splits flags, globs paths, and masks git's exit status via `local`
flags="--exclude $pattern"
local head_sha="$(git rev-parse HEAD)"
rsync -a $flags $src_dir/ $dest_dir/

# Good: array arguments, quoted expansions, and unmasked exit status
local head_sha
head_sha="$(git rev-parse HEAD)"
args=(--exclude "$pattern")
rsync -a "${args[@]}" "$src_dir/" "$dest_dir/"
```

### 3. Safe Paths, Temporary Files, and Atomic Writes

Never run `rm -rf` on an unvalidated variable path (`"${var:?}"` aborts if empty or unset, and `--` stops leading-dash option injection). Create temp files/dirs with `mktemp` and clean them up via `trap`, never predictable `/tmp/name.$$` paths. For atomic file updates, write to `mktemp` in the destination directory and `mv` into place.

```bash
# Bad: `rm -rf /` hazard if build_dir is empty, predictable /tmp path, unchecked cd
cd $work_dir
tmp=/tmp/out.$$
rm -rf $build_dir/*

# Good: guarded variable, checked cd, mktemp + EXIT trap
tmp_file=""
cleanup() {
  [[ -n "${tmp_file:-}" ]] && rm -f -- "$tmp_file"
}
trap cleanup EXIT

cd -- "$work_dir" || exit 1
rm -rf -- "${build_dir:?build_dir must be set}"
tmp_file="$(mktemp)"
```

### 4. Forbidden Idioms and Error Discipline

- **Iteration and output**: never write `for f in $(ls ...)`—use a glob with an existence guard (`for f in "$dir"/*.log; do [[ -e "$f" ]] || continue; ...; done`) or `find "$dir" -print0 | while IFS= read -r -d '' f; do ...; done`. Use `printf '%s\n' "$val"` instead of `echo "$val"` for arbitrary strings, `$()` instead of backticks, and `[[ ... ]]` in Bash (`[ "$x" = "y" ]` in POSIX `sh`).
- **No silent suppression**: never add unexplained `cmd || true` or `cmd 2>/dev/null`. Send diagnostics and errors to stderr (`>&2`).
- **ShellCheck directives**: fix warnings instead of silencing them; genuine exceptions require an exact code and inline reason (`# shellcheck disable=SC2016 # intentional literal $HOME for remote ssh`).

## Procedure and Toolchain Gate

1. Identify the `.sh`/`.bash` scripts (or embedded CI/Container shell blocks) touched or under review, and verify dialect, strict mode, quoting, path guards, and error handling against the rules above.
2. Run the syntax, static-analysis, and formatting gates on each touched script, matching syntax check (`bash -n` or `sh -n`) to its shebang:

   ```bash
   bash -n script.sh        # or `sh -n script.sh` for #!/bin/sh
   shellcheck -x script.sh
   shfmt -d script.sh       # respects .editorconfig indentation when present
   ```

3. Report each checked script in the format below; mark any missing tool (`shellcheck`, `shfmt`) as `not available`—never as passed.

## Output

```text
## <script-path>

Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>

Findings:
- [severity] line N: description

Fix:
- concrete action per finding

Verification:
- bash -n / sh -n: PASS/FAIL/not available
- shellcheck -x: PASS/FAIL (error count) / not available
- shfmt -d: PASS/FAIL/not available
```
