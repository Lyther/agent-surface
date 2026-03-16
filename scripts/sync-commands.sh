#!/usr/bin/env bash
set -eo pipefail

CURSOR_COMMANDS="$HOME/.cursor/commands"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS="$CLAUDE_DIR/commands"
CURSORRULES="$CURSOR_COMMANDS/.cursorrules"

added=0
updated=0
unchanged=0
removed=0

map_category() {
    case "$1" in
        00-BOOT)      echo "boot" ;;
        01-ARCH)      echo "arch" ;;
        02-DEV)       echo "dev" ;;
        03-VERIFY)    echo "verify" ;;
        04-QA)        echo "qa" ;;
        05-SHIP)      echo "ship" ;;
        09-OPS)       echo "ops" ;;
        10-WORKFLOW)  echo "workflow" ;;
        11-LINT)      echo "lint" ;;
        F0-AI)        echo "ai" ;;
        F9-OPS)       echo "f9ops" ;;
        2[0-9]-*)     echo "SKIP" ;;
        scripts)      echo "SKIP" ;;
        .cursor)      echo "SKIP" ;;
        .vscode)      echo "SKIP" ;;
        *)            echo "" ;;
    esac
}

sync_commands() {
    local tracked_file
    tracked_file=$(mktemp)
    trap 'rm -f "$tracked_file"' RETURN

    for cat_dir in "$CURSOR_COMMANDS"/*/; do
        [ ! -d "$cat_dir" ] && continue
        local cat_name
        cat_name=$(basename "$cat_dir")

        local target_cat
        target_cat=$(map_category "$cat_name")
        [ -z "$target_cat" ] && { echo "  WARN: no mapping for '$cat_name', skipping"; continue; }
        [ "$target_cat" = "SKIP" ] && continue

        mkdir -p "$CLAUDE_COMMANDS/$target_cat"

        for md_file in "$cat_dir"*.md; do
            [ ! -f "$md_file" ] && continue
            local fname
            fname=$(basename "$md_file")
            local target="$CLAUDE_COMMANDS/$target_cat/$fname"
            echo "$target_cat/$fname" >> "$tracked_file"

            if [ ! -f "$target" ]; then
                cp "$md_file" "$target"
                added=$((added + 1))
            elif ! diff -q "$md_file" "$target" >/dev/null 2>&1; then
                cp "$md_file" "$target"
                updated=$((updated + 1))
            else
                unchanged=$((unchanged + 1))
            fi
        done
    done

    while read -r existing; do
        local rel="${existing#"$CLAUDE_COMMANDS/"}"
        if ! grep -qxF "$rel" "$tracked_file"; then
            rm "$existing"
            removed=$((removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$CLAUDE_COMMANDS" -name '*.md' -type f 2>/dev/null)
}

# Replacements applied to .cursorrules when emitting CLAUDE.md.
# Format: sed expression per line. Add new transforms here instead of
# editing the sed invocation below.
CLAUDE_TRANSFORMS=(
    's|^# Cursor Rules.*|# CLAUDE.md — Global Agent Rules|'
    's|`~/.cursor/commands`|custom slash commands|g'
    's|`\.cursor/commands`|custom slash commands|g'
    's|\.cursor/lessons\.md|CLAUDE.md lessons section|g'
    's|\.cursor/mission\.md|project context|g'
    's|See `00-BOOT/workflow\.md` (command: `workflow`) for|See `/boot:workflow` command for|g'
    's|Run `learn` command|Run `/ops:learn` command|g'
    's|Use `ask` command|Use `/ops:ask` command|g'
)

emit_rules() {
    local source="$1" target="$2" label="$3"
    shift 3
    local -a transforms=("$@")

    if [ ! -f "$source" ]; then
        echo "  ERROR: $source not found"
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    trap 'rm -f "$tmp"' RETURN

    local sed_args=()
    for t in "${transforms[@]}"; do
        sed_args+=(-e "$t")
    done

    if [ ${#sed_args[@]} -eq 0 ]; then
        cp "$source" "$tmp"
    else
        sed "${sed_args[@]}" "$source" > "$tmp"
    fi

    if [ ! -f "$target" ]; then
        mv "$tmp" "$target"
        echo "  created $label"
    elif ! diff -q "$tmp" "$target" >/dev/null 2>&1; then
        mv "$tmp" "$target"
        echo "  updated $label"
    else
        rm -f "$tmp"
        echo "  $label unchanged"
    fi
}

sync_rules() {
    emit_rules "$CURSORRULES" "$CLAUDE_DIR/CLAUDE.md" "CLAUDE.md" "${CLAUDE_TRANSFORMS[@]}"
}

sync_settings() {
    local target="$CLAUDE_DIR/settings.json"
    if [ -f "$target" ]; then
        echo "  settings.json exists, not overwriting"
        return
    fi

    cat > "$target" << 'SETTINGS'
{
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "Glob",
      "LS",
      "Bash(git *)",
      "Bash(cargo *)",
      "Bash(uv *)",
      "Bash(make *)"
    ],
    "deny": [
      "Bash(curl * | bash)",
      "Bash(rm -rf /)",
      "Bash(git push --force *)"
    ]
  }
}
SETTINGS
    echo "  created settings.json"
}

echo "=== Cursor -> Claude Code sync ==="
echo ""
echo "source: $CURSOR_COMMANDS"
echo "target: $CLAUDE_DIR"
echo ""

echo "[commands]"
sync_commands

echo "[rules]"
sync_rules

echo "[settings]"
sync_settings

echo ""
echo "--- summary ---"
echo "commands: $added added, $updated updated, $unchanged unchanged, $removed removed"
echo "done."
