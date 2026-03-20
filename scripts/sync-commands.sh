#!/usr/bin/env bash
set -euo pipefail

CURSOR_COMMANDS="$HOME/.cursor/commands"
CURSOR_RULES="$CURSOR_COMMANDS/.cursor/rules"
CURSORRULES="$CURSOR_COMMANDS/.cursorrules"
GEMINIRULES="$CURSOR_COMMANDS/.geminirules"
AGENTSMD="$CURSOR_COMMANDS/AGENTS.md"

CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS="$CLAUDE_DIR/commands"
CODEX_DIR="$HOME/.codex"
GEMINI_DIR="$HOME/.gemini"
GEMINI_COMMANDS="$GEMINI_DIR/commands"
ANTIGRAVITY_WORKFLOWS="$GEMINI_DIR/antigravity/global_workflows"

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

    # Only include alwaysApply rules (01-06), skip glob-scoped lang-* rules (10-14)
    for f in $(ls "$CURSOR_RULES"/0[0-9]-*.mdc 2>/dev/null | sort); do
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
        for f in $(ls "$CURSOR_RULES"/0[0-9]-*.mdc 2>/dev/null | sort); do
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
    rm -f "$tmp"
}

# --- Phase 2: Sync flat commands to Claude Code ---

sync_commands() {
    local tracked_file
    tracked_file=$(mktemp)

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
    rm -f "$tracked_file"
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

# --- Phase 4: Codex CLI/Desktop ---

sync_codex() {
    mkdir -p "$CODEX_DIR"
    local target="$CODEX_DIR/AGENTS.md"

    if [ ! -f "$AGENTSMD" ]; then
        echo "  ERROR: AGENTS.md not generated yet"
        return 1
    fi

    if [ ! -f "$target" ] || ! diff -q "$AGENTSMD" "$target" >/dev/null 2>&1; then
        cp "$AGENTSMD" "$target"
        echo "  updated ~/.codex/AGENTS.md"
    else
        echo "  ~/.codex/AGENTS.md unchanged"
    fi
}

# --- Phase 5: Gemini CLI ---

sync_gemini_rules() {
    local target="$GEMINI_DIR/GEMINI.md"

    if [ ! -f "$CURSORRULES" ]; then
        echo "  ERROR: .cursorrules not generated yet"
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    {
        echo "# GEMINI.md — Global Agent Rules"
        echo ""
        echo "> Auto-generated from ~/.cursor/commands/.cursor/rules/. Do not edit directly."
        echo ""
        strip_frontmatter "$CURSORRULES"
    } > "$tmp"

    if [ ! -f "$target" ] || ! diff -q "$tmp" "$target" >/dev/null 2>&1; then
        cp "$tmp" "$target"
        echo "  updated ~/.gemini/GEMINI.md"
    else
        echo "  ~/.gemini/GEMINI.md unchanged"
    fi
    rm -f "$tmp"
}

sync_gemini_commands() {
    mkdir -p "$GEMINI_COMMANDS"
    local tracked_file
    tracked_file=$(mktemp)
    local g_added=0 g_updated=0 g_unchanged=0 g_removed=0

    for md_file in "$CURSOR_COMMANDS"/*.md; do
        [ ! -f "$md_file" ] && continue
        local fname
        fname=$(basename "$md_file")

        local target_cat="${fname%%-*}"
        local cmd_name="${fname#*-}"
        cmd_name="${cmd_name%.md}"

        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue

        mkdir -p "$GEMINI_COMMANDS/$target_cat"
        local toml_path="$GEMINI_COMMANDS/$target_cat/$cmd_name.toml"
        echo "$target_cat/$cmd_name.toml" >> "$tracked_file"

        local first_line
        first_line=$(head -1 "$md_file")
        local desc="${first_line#\#\# }"
        [ "$desc" = "$first_line" ] && desc="$target_cat $cmd_name command"

        local content
        content=$(cat "$md_file")

        local new_toml
        new_toml=$(mktemp)
        {
            printf 'description = "%s"\n\n' "$desc"
            printf 'prompt = """\n'
            printf '%s\n' "$content"
            printf '"""\n'
        } > "$new_toml"

        if [ ! -f "$toml_path" ]; then
            mv "$new_toml" "$toml_path"
            g_added=$((g_added + 1))
        elif ! diff -q "$new_toml" "$toml_path" >/dev/null 2>&1; then
            mv "$new_toml" "$toml_path"
            g_updated=$((g_updated + 1))
        else
            rm -f "$new_toml"
            g_unchanged=$((g_unchanged + 1))
        fi
    done

    while read -r existing; do
        local rel="${existing#"$GEMINI_COMMANDS/"}"
        if ! grep -qxF "$rel" "$tracked_file"; then
            rm "$existing"
            g_removed=$((g_removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$GEMINI_COMMANDS" -name '*.toml' -type f 2>/dev/null)

    rm -f "$tracked_file"
    echo "  gemini commands: $g_added added, $g_updated updated, $g_unchanged unchanged, $g_removed removed"
}

# --- Phase 6: Antigravity workflows ---

sync_antigravity() {
    mkdir -p "$ANTIGRAVITY_WORKFLOWS"
    local tracked_file
    tracked_file=$(mktemp)
    local a_added=0 a_updated=0 a_unchanged=0 a_removed=0

    for md_file in "$CURSOR_COMMANDS"/*.md; do
        [ ! -f "$md_file" ] && continue
        local fname
        fname=$(basename "$md_file")

        local target_cat="${fname%%-*}"
        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue

        local target_path="$ANTIGRAVITY_WORKFLOWS/$fname"
        echo "$fname" >> "$tracked_file"

        local first_heading
        first_heading=$(grep -m1 '^## ' "$md_file" 2>/dev/null | sed 's/^## //' || true)
        [ -z "$first_heading" ] && first_heading=""

        local new_wf
        new_wf=$(mktemp)
        {
            echo "---"
            printf 'description: %s\n' "$first_heading"
            echo "---"
            echo ""
            cat "$md_file"
        } > "$new_wf"

        if [ ! -f "$target_path" ]; then
            mv "$new_wf" "$target_path"
            a_added=$((a_added + 1))
        elif ! diff -q "$new_wf" "$target_path" >/dev/null 2>&1; then
            mv "$new_wf" "$target_path"
            a_updated=$((a_updated + 1))
        else
            rm -f "$new_wf"
            a_unchanged=$((a_unchanged + 1))
        fi
    done

    while read -r existing; do
        local rel
        rel=$(basename "$existing")
        if ! grep -qxF "$rel" "$tracked_file"; then
            rm "$existing"
            a_removed=$((a_removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$ANTIGRAVITY_WORKFLOWS" -name '*.md' -type f 2>/dev/null)

    rm -f "$tracked_file"
    echo "  antigravity: $a_added added, $a_updated updated, $a_unchanged unchanged, $a_removed removed"
}

# --- Main ---

echo "=== Cursor -> All Targets sync ==="
echo ""
echo "source: $CURSOR_COMMANDS"
echo ""

echo "[1/7 rules: generate from .cursor/rules/]"
generate_rules

echo "[2/7 claude: commands]"
sync_commands

echo "[3/7 claude: CLAUDE.md]"
sync_rules

echo "[4/7 claude: settings]"
sync_settings

echo "[5/7 codex: AGENTS.md]"
sync_codex

echo "[6/7 gemini: GEMINI.md + commands]"
sync_gemini_rules
sync_gemini_commands

echo "[7/7 antigravity: workflows]"
sync_antigravity

echo ""
echo "--- summary ---"
echo "claude commands: $added added, $updated updated, $unchanged unchanged, $removed removed"
echo "targets: claude, codex, gemini, antigravity"
echo "note: VS Code Copilot reads AGENTS.md from repo root (already generated)"
echo "note: TRAE skipped (rules path unverified locally)"
echo "done."
