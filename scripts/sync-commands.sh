#!/usr/bin/env bash
set -eo pipefail

CURSOR_COMMANDS="$HOME/.cursor/commands"
CURSOR_RULES="$CURSOR_COMMANDS/.cursor/rules"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS="$CLAUDE_DIR/commands"
CURSORRULES="$CURSOR_COMMANDS/.cursorrules"
GEMINIRULES="$CURSOR_COMMANDS/.geminirules"
AGENTSMD="$CURSOR_COMMANDS/AGENTS.md"

added=0
updated=0
unchanged=0
removed=0

# --- Phase 1: Generate rules exports from .cursor/rules/*.mdc (authoritative source) ---

strip_frontmatter() {
    sed '/^---$/,/^---$/d' "$1"
}

generate_rules() {
    local tmp
    tmp=$(mktemp)
    trap 'rm -f "$tmp"' RETURN

    echo "# Cursor Rules — LOVE (Linus Oriented Vibe Enforcement)" > "$tmp"
    echo "" >> "$tmp"

    for f in $(ls "$CURSOR_RULES"/*.mdc 2>/dev/null | sort); do
        strip_frontmatter "$f" >> "$tmp"
        echo "" >> "$tmp"
    done

    if [ ! -f "$CURSORRULES" ] || ! diff -q "$tmp" "$CURSORRULES" >/dev/null 2>&1; then
        cp "$tmp" "$CURSORRULES"
        echo "  updated .cursorrules"
    else
        echo "  .cursorrules unchanged"
    fi

    # Generate .geminirules (condensed version)
    local gemini_tmp
    gemini_tmp=$(mktemp)
    {
        echo "---"
        echo "trigger: always_on"
        echo "---"
        echo ""
        cat "$tmp"
    } > "$gemini_tmp"

    sed -i '' \
        -e 's|`~/.cursor/commands`|custom slash commands|g' \
        -e 's|`\.cursor/commands`|custom slash commands|g' \
        "$gemini_tmp" 2>/dev/null || true

    if [ ! -f "$GEMINIRULES" ] || ! diff -q "$gemini_tmp" "$GEMINIRULES" >/dev/null 2>&1; then
        cp "$gemini_tmp" "$GEMINIRULES"
        echo "  updated .geminirules"
    else
        echo "  .geminirules unchanged"
    fi
    rm -f "$gemini_tmp"

    # Generate AGENTS.md (cross-tool)
    local agents_tmp
    agents_tmp=$(mktemp)
    {
        echo "# AGENTS.md — Cross-Tool Agent Rules"
        echo ""
        echo "> Auto-generated from .cursor/rules/*.mdc. Do not edit directly."
        echo ""
        for f in $(ls "$CURSOR_RULES"/*.mdc 2>/dev/null | sort); do
            strip_frontmatter "$f"
            echo ""
        done
    } > "$agents_tmp"

    if [ ! -f "$AGENTSMD" ] || ! diff -q "$agents_tmp" "$AGENTSMD" >/dev/null 2>&1; then
        cp "$agents_tmp" "$AGENTSMD"
        echo "  updated AGENTS.md"
    else
        echo "  AGENTS.md unchanged"
    fi
    rm -f "$agents_tmp"
}

# --- Phase 2: Sync flat commands to Claude Code ---

sync_commands() {
    local tracked_file
    tracked_file=$(mktemp)
    trap 'rm -f "$tracked_file"' RETURN

    for md_file in "$CURSOR_COMMANDS"/*.md; do
        [ ! -f "$md_file" ] && continue
        local fname
        fname=$(basename "$md_file")

        # Extract category from prefix: "boot-context.md" -> "boot"
        local target_cat="${fname%%-*}"
        local target_name="${fname#*-}"

        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue

        mkdir -p "$CLAUDE_COMMANDS/$target_cat"

        local target="$CLAUDE_COMMANDS/$target_cat/$target_name"
        echo "$target_cat/$target_name" >> "$tracked_file"

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

    while read -r existing; do
        local rel="${existing#"$CLAUDE_COMMANDS/"}"
        if ! grep -qxF "$rel" "$tracked_file"; then
            rm "$existing"
            removed=$((removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$CLAUDE_COMMANDS" -name '*.md' -type f 2>/dev/null)
}

# --- Phase 3: Sync rules to Claude Code ---

CLAUDE_TRANSFORMS=(
    's|^# Cursor Rules.*|# CLAUDE.md — Global Agent Rules|'
    's|`~/.cursor/commands`|custom slash commands|g'
    's|`\.cursor/commands`|custom slash commands|g'
    's|\.cursor/lessons\.md|CLAUDE.md lessons section|g'
    's|\.cursor/mission\.md|project context|g'
    's|See `boot-workflow`|See `/boot:workflow` command|g'
    's|Run `ops-learn`|Run `/ops:learn`|g'
    's|Use `ops-ask`|Use `/ops:ask`|g'
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

echo "[rules: generate from .cursor/rules/]"
generate_rules

echo "[commands]"
sync_commands

echo "[rules: emit CLAUDE.md]"
sync_rules

echo "[settings]"
sync_settings

echo ""
echo "--- summary ---"
echo "commands: $added added, $updated updated, $unchanged unchanged, $removed removed"
echo "done."
