#!/bin/bash
# usage: fetch-packs.sh LIST ROOT
# Fetch every pinned pack of LIST (`path url sha` per line; blank lines and # comments are skipped) into ROOT/path.
# Any fetch or archive failure, or a pack that ends up empty, fails the whole script: a build must not succeed with a missing pack.
set -euo pipefail
list=$1
root=$2
while read -r path url sha; do
  case "$path" in '' | '#'*) continue ;; esac
  gitdir=$(mktemp -d)
  git init -q "$gitdir"
  # HTTP/1.1: through the lab's build proxy the default HTTP/2 fetch of archify failed every time ("expected flush after ref listing").
  git -c http.version=HTTP/1.1 -C "$gitdir" fetch -q --depth 1 "$url" "$sha"
  mkdir -p "$root/$path"
  git -C "$gitdir" archive "$sha" | tar -x -C "$root/$path"
  if [ -z "$(ls -A "$root/$path")" ]; then
    echo "pack $path is empty at $sha" >&2
    exit 1
  fi
  rm -rf "$gitdir"
done < "$list"
