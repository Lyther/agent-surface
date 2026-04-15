#!/usr/bin/env bash
# sync-commands.sh — Universal sync from one IDE/agent to all others
#
# Syncs commands, rules, settings, and keybindings from a single "king"
# IDE to every other supported tool on the machine. Auto-detects which
# targets are installed; skips the rest.
#
# Usage:
#   ./sync-commands.sh                     # default king: cursor
#   ./sync-commands.sh --king=cursor       # explicit
#   ./sync-commands.sh --king=roo          # Roo Code as source
#   ./sync-commands.sh --king=code         # VS Code as source
#   ./sync-commands.sh --dry-run           # preview without writing
#   ./sync-commands.sh --list              # show detected targets
#
# Supported kings: cursor, code, windsurf, trae, roo
#
# Sync targets (auto-detected):
#   IDEs:       Cursor, VS Code, Windsurf, Trae, VSCodium, Positron, Void
#   Agents:     Claude Code, OpenAI Codex, Gemini CLI, opencode
#   Extensions: Roo Code, Cline, Gemini Code Assist (workspace files)
#   Platforms:  Antigravity
#   Project:    .cursorrules, .windsurfrules, .traerules, .clinerules,
#               .roorules, AGENTS.md, CLAUDE.md, GEMINI.md,
#               .gemini/commands/**/*.toml
#
# Requirements: bash 4+, sed, diff, python3 (for settings JSON filtering)
# License: MIT
set -euo pipefail

# ── Argument parsing ──────────────────────────────────────────

KING="cursor"
DRY_RUN=false
LIST_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --king=*) KING="${arg#--king=}" ;;
        --dry-run) DRY_RUN=true ;;
        --list) LIST_ONLY=true ;;
        -h|--help)
            awk '/^#/{sub(/^# ?/,"");print} /^set /{exit}' "$0" | tail -n +2
            exit 0
            ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

# ── Platform detection ────────────────────────────────────────

case "$(uname -s)" in
    Darwin)
        APP_SUPPORT="$HOME/Library/Application Support"
        SED_INPLACE=(sed -i '')
        ;;
    Linux)
        APP_SUPPORT="${XDG_CONFIG_HOME:-$HOME/.config}"
        SED_INPLACE=(sed -i)
        ;;
    *)
        echo "Unsupported platform: $(uname -s)"
        exit 1
        ;;
esac

# ── Source resolution ─────────────────────────────────────────
# Each king defines where commands, rules, and settings live.

resolve_king() {
    case "$KING" in
        cursor)
            COMMANDS_SRC="$HOME/.cursor/commands"
            RULES_SRC="$COMMANDS_SRC/.cursor/rules"
            SETTINGS_SRC="$APP_SUPPORT/Cursor/User"
            KING_LABEL="Cursor"
            ;;
        code|vscode)
            COMMANDS_SRC="$HOME/.cursor/commands"  # VS Code has no commands dir; fall back
            RULES_SRC="$COMMANDS_SRC/.cursor/rules"
            SETTINGS_SRC="$APP_SUPPORT/Code/User"
            KING_LABEL="VS Code"
            ;;
        windsurf)
            COMMANDS_SRC="$HOME/.cursor/commands"  # Windsurf has no commands dir
            RULES_SRC="$COMMANDS_SRC/.cursor/rules"
            SETTINGS_SRC="$APP_SUPPORT/Windsurf/User"
            KING_LABEL="Windsurf"
            ;;
        trae)
            COMMANDS_SRC="$HOME/.cursor/commands"  # Trae has no commands dir
            RULES_SRC="$COMMANDS_SRC/.cursor/rules"
            SETTINGS_SRC="$APP_SUPPORT/Trae/User"
            KING_LABEL="Trae"
            ;;
        roo)
            COMMANDS_SRC="$HOME/.roo/commands"
            RULES_SRC="$HOME/.roo/rules"
            SETTINGS_SRC="$APP_SUPPORT/Code/User"  # Roo runs inside VS Code
            KING_LABEL="Roo Code"
            ;;
        *)
            echo "Unknown king: $KING"
            echo "Supported: cursor, code, windsurf, trae, roo"
            exit 1
            ;;
    esac

    if [ ! -d "$COMMANDS_SRC" ]; then
        echo "ERROR: commands source not found: $COMMANDS_SRC"
        exit 1
    fi
}

# ── Target registry ───────────────────────────────────────────
# All known VS Code family IDEs (name:app_support_subdir:dot_dir:rulesfile)

ALL_VSCODE_IDES=(
    "Cursor:Cursor:cursor:cursorrules"
    "Code:Code:vscode:NA"
    "Windsurf:Windsurf:windsurf:windsurfrules"
    "Trae:Trae:trae:traerules"
    "VSCodium:VSCodium:vscode-oss:NA"
    "Positron:Positron:positron:NA"
    "Void:Void:void:NA"
)

# IDE-specific settings key prefixes (stripped when syncing TO other IDEs)
ide_specific_prefixes() {
    case "$1" in
        Cursor)    echo "cursor. claudeCode." ;;
        Windsurf)  echo "windsurf." ;;
        Trae)      echo "trae." ;;
        *)         echo "" ;;
    esac
}

# ── Derived paths (set after resolve_king) ────────────────────
# These use COMMANDS_SRC which is set by resolve_king().
# We declare them as empty here; resolve_derived_paths() fills them.

CURSORRULES_FILE=""
GEMINIRULES_FILE=""
AGENTSMD_FILE=""
GEMINI_MD_FILE=""
PROJECT_GEMINI_COMMANDS=""

resolve_derived_paths() {
    CURSORRULES_FILE="$COMMANDS_SRC/.cursorrules"
    GEMINIRULES_FILE="$COMMANDS_SRC/.geminirules"
    AGENTSMD_FILE="$COMMANDS_SRC/AGENTS.md"
    GEMINI_MD_FILE="$COMMANDS_SRC/GEMINI.md"
    PROJECT_GEMINI_COMMANDS="$COMMANDS_SRC/.gemini/commands"
}

CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS="$CLAUDE_DIR/commands"
CODEX_DIR="$HOME/.codex"
CODEX_SKILLS_DIR="$HOME/.agents/skills"
CODEX_SYNC_MARKER=".sync-origin"
GEMINI_DIR="$HOME/.gemini"
GEMINI_COMMANDS="$GEMINI_DIR/commands"
ANTIGRAVITY_WORKFLOWS="$GEMINI_DIR/antigravity/global_workflows"
ROO_DIR="$HOME/.roo"
ROO_COMMANDS="$ROO_DIR/commands"
ROO_RULES="$ROO_DIR/rules"
CLINE_RULES="$HOME/.clinerules"
OPENCODE_DIR="$HOME/.config/opencode"

added=0
updated=0
unchanged=0
removed=0

# ── Utility: write-or-skip ────────────────────────────────────

# Compare $1 (tmp file) with $2 (target). Update if different.
# $3 = label for logging. Respects DRY_RUN.
sync_file() {
    local tmp="$1" target="$2" label="$3"

    if [ ! -s "$tmp" ]; then
        echo "  $label: ERROR empty source"
        rm -f "$tmp"
        return 1
    fi

    if [ ! -f "$target" ]; then
        if $DRY_RUN; then
            echo "  $label: would create"
        else
            mkdir -p "$(dirname "$target")"
            mv "$tmp" "$target"
            echo "  $label: created"
        fi
    elif ! diff -q "$tmp" "$target" >/dev/null 2>&1; then
        if $DRY_RUN; then
            echo "  $label: would update"
        else
            mv "$tmp" "$target"
            echo "  $label: updated"
        fi
    else
        echo "  $label: unchanged"
        rm -f "$tmp"
    fi
}

# ── Helpers (shared) ──────────────────────────────────────────

strip_frontmatter() {
    sed '/^---$/,/^---$/d' "$1" | sed '/./,$!d'
}

extract_learned_sections() {
    local file="$1"
    [ ! -f "$file" ] && return
    sed -n '/^## Learned /,$p' "$file"
}

strip_markdown_inline() {
    printf '%s\n' "$1" | sed -E \
        -e 's/\*\*([^*]+)\*\*/\1/g' \
        -e 's/`([^`]+)`/\1/g' \
        -e 's/[[:space:]]+/ /g' \
        -e 's/^ +//; s/ +$//'
}

escape_toml_basic_string() {
    printf '%s\n' "$1" | sed \
        -e 's/\\/\\\\/g' \
        -e 's/"/\\"/g'
}

escape_yaml_double_quoted() {
    printf '%s\n' "$1" | sed \
        -e 's/\\/\\\\/g' \
        -e 's/"/\\"/g'
}

extract_goal_line() {
    local file="$1"
    awk '
        /^\*\*Your Goal\*\*:/ { sub(/^\*\*Your Goal\*\*:[[:space:]]*/, ""); print; exit }
        /^\*\*Your Job\*\*:/ { sub(/^\*\*Your Job\*\*:[[:space:]]*/, ""); print; exit }
        /^\*\*Goal\*\*:/ { sub(/^\*\*Goal\*\*:[[:space:]]*/, ""); print; exit }
        /^\*\*The Goal\*\*:/ { sub(/^\*\*The Goal\*\*:[[:space:]]*/, ""); print; exit }
    ' "$file"
}

extract_objective_blurb() {
    local file="$1"
    awk '
        /^## OBJECTIVE$/ { in_objective=1; next }
        in_objective && /^## / { exit }
        in_objective && /^[[:space:]]*$/ { next }
        in_objective && /^\*\*The Standard\*\*:/ { next }
        in_objective && /^\*\*The Law\*\*:/ { next }
        in_objective && /^\*\*The Boundary\*\*:/ { next }
        in_objective {
            line=$0
            sub(/^\*\*/, "", line)
            sub(/\*\*$/, "", line)
            print line
            exit
        }
    ' "$file"
}

extract_when_line() {
    local file="$1"
    awk '
        /^## WHEN TO (INVOKE|RUN)$/ { in_when=1; next }
        in_when && /^## / { exit }
        in_when && /^[*-] / {
            sub(/^[*-] /, "")
            print
            exit
        }
        in_when && NF {
            print
            exit
        }
    ' "$file"
}

extract_first_markdown_heading() {
    local file="$1"
    awk '
        /^# / { sub(/^# /, ""); print; exit }
        /^## / { sub(/^## /, ""); print; exit }
    ' "$file"
}

build_codex_description() {
    local file="$1"
    local skill_name="$2"
    local goal when desc

    goal=$(strip_markdown_inline "$(extract_goal_line "$file")")
    if [ -z "$goal" ]; then
        goal=$(strip_markdown_inline "$(extract_objective_blurb "$file")")
    fi
    if [ -z "$goal" ]; then
        goal="Run the ${skill_name//-/ } workflow."
    fi

    when=$(strip_markdown_inline "$(extract_when_line "$file")")
    desc="$goal"
    if [ -n "$when" ]; then
        desc="$desc Relevant when: $when"
    fi

    case "$desc" in
        *[.!?]) ;;
        *) desc="$desc." ;;
    esac

    printf '%s\n' "$desc"
}

build_antigravity_description() {
    local file="$1"
    local workflow_name="$2"
    local desc heading

    desc=$(strip_markdown_inline "$(extract_goal_line "$file")")
    if [ -z "$desc" ]; then
        desc=$(strip_markdown_inline "$(extract_objective_blurb "$file")")
    fi
    if [ -z "$desc" ]; then
        heading=$(strip_markdown_inline "$(extract_first_markdown_heading "$file")")
        desc="$heading"
    fi
    if [ -z "$desc" ]; then
        desc="Run the ${workflow_name//-/ } workflow."
    fi

    printf '%s\n' "$desc"
}

is_syncable_command_filename() {
    local fname="$1"
    local target_cat="${fname%%-*}"
    [ -n "$target_cat" ] || return 1
    [ "$target_cat" != "$fname" ] || return 1
    return 0
}

list_sync_command_sources() {
    local md_file fname

    for md_file in "$COMMANDS_SRC"/*.md; do
        [ ! -f "$md_file" ] && continue
        fname=$(basename "$md_file")
        is_syncable_command_filename "$fname" || continue
        printf '%s\t%s\n' "$md_file" "$fname"
    done

    if [ -f "$COMMANDS_SRC/dev-feature.md" ] && [ ! -f "$COMMANDS_SRC/dev-component.md" ]; then
        printf '%s\t%s\n' "$COMMANDS_SRC/dev-feature.md" "dev-component.md"
    fi
}

emit_codex_skill_body() {
    local file="$1"
    awk '
        /^## PLATFORM DEPLOYMENT$/ { skip=1; next }
        skip && /^## / { skip=0 }
        !skip { print }
    ' "$file"
}

# ── Phase 1: Generate rule exports ───────────────────────────

generate_rules() {
    # If king is Cursor, generate from .cursor/rules/*.mdc
    # Otherwise, the king's rules are already flat — just copy
    if [ "$KING" = "cursor" ] && [ -d "$RULES_SRC" ]; then
        local tmp
        tmp=$(mktemp)

        for f in $(ls "$RULES_SRC"/0[0-9]-*.mdc 2>/dev/null | sort); do
            strip_frontmatter "$f" >> "$tmp"
            echo "" >> "$tmp"
        done

        "${SED_INPLACE[@]}" -e '/./,$!d' -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$tmp" 2>/dev/null || true

        sync_file "$tmp" "$CURSORRULES_FILE" ".cursorrules"

        # .geminirules
        local gemini_tmp
        gemini_tmp=$(mktemp)
        {
            echo "---"
            echo "trigger: always_on"
            echo "---"
            echo ""
            cat "$CURSORRULES_FILE"
        } > "$gemini_tmp"

        "${SED_INPLACE[@]}" \
            -e 's|`~/.cursor/commands`|custom slash commands|g' \
            -e 's|`\.cursor/commands`|custom slash commands|g' \
            "$gemini_tmp" 2>/dev/null || true

        sync_file "$gemini_tmp" "$GEMINIRULES_FILE" ".geminirules"

        # AGENTS.md
        local learned_tmp
        learned_tmp=$(mktemp)
        extract_learned_sections "$AGENTSMD_FILE" > "$learned_tmp"

        local agents_tmp
        agents_tmp=$(mktemp)
        {
            echo "# AGENTS.md — Cross-Tool Agent Rules"
            echo ""
            echo "> Auto-generated by sync-commands.sh from $KING_LABEL rules. Do not edit directly."
            echo ""
            for f in $(ls "$RULES_SRC"/0[0-9]-*.mdc 2>/dev/null | sort); do
                strip_frontmatter "$f"
                echo ""
            done
            if [ -s "$learned_tmp" ]; then
                cat "$learned_tmp"
            fi
        } > "$agents_tmp"

        sync_file "$agents_tmp" "$AGENTSMD_FILE" "AGENTS.md"
        rm -f "$learned_tmp"
    elif [ "$KING" = "roo" ]; then
        # Roo rules are flat .md files in ~/.roo/rules/ — concat them
        local tmp
        tmp=$(mktemp)
        for f in $(ls "$RULES_SRC"/*.md 2>/dev/null | sort); do
            cat "$f" >> "$tmp"
            echo "" >> "$tmp"
        done
        if [ -s "$tmp" ]; then
            local agents_tmp
            agents_tmp=$(mktemp)
            {
                echo "# AGENTS.md — Cross-Tool Agent Rules"
                echo ""
                echo "> Auto-generated by sync-commands.sh from $KING_LABEL rules. Do not edit directly."
                echo ""
                cat "$tmp"
            } > "$agents_tmp"
            sync_file "$agents_tmp" "$AGENTSMD_FILE" "AGENTS.md"
            sync_file "$tmp" "$CURSORRULES_FILE" ".cursorrules"
        else
            echo "  no rules found in $RULES_SRC"
            rm -f "$tmp"
        fi
    else
        echo "  rules generation: skipped (king=$KING has no structured rules)"
    fi
}

# ── Phase 2: Sync commands to Claude Code ─────────────────────

sync_claude_commands() {
    [ ! -d "$CLAUDE_DIR" ] && { echo "  Claude Code: not installed, skipping"; return; }
    local tracked_file
    tracked_file=$(mktemp)

    while IFS=$'\t' read -r md_file fname; do
        [ -z "$md_file" ] && continue

        local target_cat="${fname%%-*}"
        local target_name="${fname#*-}"

        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue

        mkdir -p "$CLAUDE_COMMANDS/$target_cat"

        local target="$CLAUDE_COMMANDS/$target_cat/$target_name"
        echo "$target_cat/$target_name" >> "$tracked_file"

        if [ ! -f "$target" ]; then
            $DRY_RUN || cp "$md_file" "$target"
            added=$((added + 1))
        elif ! diff -q "$md_file" "$target" >/dev/null 2>&1; then
            $DRY_RUN || cp "$md_file" "$target"
            updated=$((updated + 1))
        else
            unchanged=$((unchanged + 1))
        fi
    done < <(list_sync_command_sources)

    while read -r existing; do
        local rel="${existing#"$CLAUDE_COMMANDS/"}"
        if ! grep -qxF "$rel" "$tracked_file"; then
            $DRY_RUN || rm "$existing"
            removed=$((removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$CLAUDE_COMMANDS" -name '*.md' -type f 2>/dev/null)
    rm -f "$tracked_file"
}

# ── Phase 3: Sync CLAUDE.md ──────────────────────────────────

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

sync_claude_rules() {
    [ ! -d "$CLAUDE_DIR" ] && { echo "  Claude Code: not installed, skipping"; return; }
    [ ! -f "$CURSORRULES_FILE" ] && { echo "  ERROR: no .cursorrules to transform"; return; }

    local target="$CLAUDE_DIR/CLAUDE.md"
    local tmp
    tmp=$(mktemp)

    local sed_args=()
    for t in "${CLAUDE_TRANSFORMS[@]}"; do
        sed_args+=(-e "$t")
    done

    sed "${sed_args[@]}" "$CURSORRULES_FILE" > "$tmp"
    sync_file "$tmp" "$target" "CLAUDE.md"
}

sync_claude_settings() {
    [ ! -d "$CLAUDE_DIR" ] && return
    local target="$CLAUDE_DIR/settings.json"
    if [ -f "$target" ]; then
        echo "  settings.json exists, not overwriting"
        return
    fi

    $DRY_RUN && { echo "  would create settings.json"; return; }

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

# ── Phase 4: Sync to OpenAI Codex ────────────────────────────

sync_codex() {
    [ ! -d "$CODEX_DIR" ] && [ ! -d "$CODEX_SKILLS_DIR" ] && {
        echo "  Codex: not installed, skipping"
        return
    }

    # AGENTS.md
    mkdir -p "$CODEX_DIR"
    if [ -f "$AGENTSMD_FILE" ]; then
        local tmp
        tmp=$(mktemp)
        cp "$AGENTSMD_FILE" "$tmp"
        sync_file "$tmp" "$CODEX_DIR/AGENTS.md" "~/.codex/AGENTS.md"
    fi

    # Skills
    mkdir -p "$CODEX_SKILLS_DIR"
    local tracked_file
    tracked_file=$(mktemp)
    local c_added=0 c_updated=0 c_unchanged=0 c_removed=0

    while IFS=$'\t' read -r md_file fname; do
        [ -z "$md_file" ] && continue
        local source_fname
        source_fname=$(basename "$md_file")

        local target_cat="${fname%%-*}"
        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue

        local skill_name="${fname%.md}"
        local skill_dir="$CODEX_SKILLS_DIR/$skill_name"
        local desc
        desc=$(build_codex_description "$md_file" "$skill_name")

        echo "$skill_name" >> "$tracked_file"

        local skill_tmp
        skill_tmp=$(mktemp)
        {
            echo "---"
            printf 'name: %s\n' "$skill_name"
            echo "description: >-"
            printf '  %s\n' "$desc"
            echo "---"
            echo ""
            printf '# %s\n\n' "$skill_name"
            printf 'Use explicit invocation: `$%s`.\n' "$skill_name"
            printf 'This skill is synced from `%s` in the commands source.\n' "$source_fname"
            printf '%s\n' 'Prefer Codex built-ins like `/plan`, `/review`, and `/fork` when they already cover the task; use this skill when you want the specific workflow below.'
            printf 'Treat any legacy slash-command syntax below as source documentation. In Codex, invoke `$%s` and express the same options in natural language.\n' "$skill_name"
            echo ""
            emit_codex_skill_body "$md_file"
        } > "$skill_tmp"

        local metadata_tmp
        metadata_tmp=$(mktemp)
        {
            echo "interface:"
            printf '  display_name: "%s"\n' "$skill_name"
            echo "  short_description: >-"
            printf '    %s\n' "$desc"
            echo "policy:"
            echo "  allow_implicit_invocation: false"
        } > "$metadata_tmp"

        local marker_tmp
        marker_tmp=$(mktemp)
        {
            echo "managed_by: scripts/sync-commands.sh"
            printf 'source: %s\n' "$COMMANDS_SRC"
            printf 'source_file: %s\n' "$source_fname"
            printf 'export_file: %s\n' "$fname"
            printf 'king: %s\n' "$KING"
        } > "$marker_tmp"

        local existed=0
        local changed=0
        [ -d "$skill_dir" ] && existed=1

        $DRY_RUN || mkdir -p "$skill_dir/agents"

        if [ ! -f "$skill_dir/SKILL.md" ] || ! diff -q "$skill_tmp" "$skill_dir/SKILL.md" >/dev/null 2>&1; then
            $DRY_RUN || mv "$skill_tmp" "$skill_dir/SKILL.md"
            changed=1
        else
            rm -f "$skill_tmp"
        fi

        if [ ! -f "$skill_dir/agents/openai.yaml" ] || ! diff -q "$metadata_tmp" "$skill_dir/agents/openai.yaml" >/dev/null 2>&1; then
            $DRY_RUN || mv "$metadata_tmp" "$skill_dir/agents/openai.yaml"
            changed=1
        else
            rm -f "$metadata_tmp"
        fi

        if [ ! -f "$skill_dir/$CODEX_SYNC_MARKER" ] || ! diff -q "$marker_tmp" "$skill_dir/$CODEX_SYNC_MARKER" >/dev/null 2>&1; then
            $DRY_RUN || mv "$marker_tmp" "$skill_dir/$CODEX_SYNC_MARKER"
            changed=1
        else
            rm -f "$marker_tmp"
        fi

        if [ "$existed" -eq 0 ]; then
            c_added=$((c_added + 1))
        elif [ "$changed" -eq 1 ]; then
            c_updated=$((c_updated + 1))
        else
            c_unchanged=$((c_unchanged + 1))
        fi
    done < <(list_sync_command_sources)

    while read -r marker; do
        [ -z "$marker" ] && continue
        local skill_dir
        skill_dir=$(dirname "$marker")
        local skill_name
        skill_name=$(basename "$skill_dir")

        if ! grep -qxF "$skill_name" "$tracked_file"; then
            $DRY_RUN || {
                rm -f \
                    "$skill_dir/SKILL.md" \
                    "$skill_dir/agents/openai.yaml" \
                    "$skill_dir/$CODEX_SYNC_MARKER"
                rmdir "$skill_dir/agents" 2>/dev/null || true
                rmdir "$skill_dir" 2>/dev/null || true
            }
            c_removed=$((c_removed + 1))
            echo "  removed stale codex skill: $skill_name"
        fi
    done < <(find "$CODEX_SKILLS_DIR" -name "$CODEX_SYNC_MARKER" -type f 2>/dev/null)

    rm -f "$tracked_file"
    echo "  codex skills: $c_added added, $c_updated updated, $c_unchanged unchanged, $c_removed removed"
}

# ── Phase 5: Sync to Gemini CLI + Code Assist ─────────────────

emit_gemini_markdown() {
    local target="$1"
    local label="$2"
    local title="$3"
    local tmp
    tmp=$(mktemp)

    {
        printf '# %s\n\n' "$title"
        echo "> Auto-generated by sync-commands.sh from $KING_LABEL. Do not edit directly."
        echo ""
        if [ -f "$GEMINIRULES_FILE" ]; then
            strip_frontmatter "$GEMINIRULES_FILE"
        elif [ -f "$CURSORRULES_FILE" ]; then
            cat "$CURSORRULES_FILE"
        fi
    } > "$tmp"

    sync_file "$tmp" "$target" "$label"
}

sync_gemini_rules() {
    mkdir -p "$GEMINI_DIR"
    emit_gemini_markdown "$GEMINI_MD_FILE" "GEMINI.md" "GEMINI.md — Project Agent Rules"
    emit_gemini_markdown "$GEMINI_DIR/GEMINI.md" "~/.gemini/GEMINI.md" "GEMINI.md — Global Agent Rules"
}

sync_gemini_command_tree() {
    local target_dir="$1"
    local label="$2"
    local tracked_file
    tracked_file=$(mktemp)
    local g_added=0 g_updated=0 g_unchanged=0 g_removed=0

    $DRY_RUN || mkdir -p "$target_dir"

    while IFS=$'\t' read -r md_file fname; do
        [ -z "$md_file" ] && continue

        local target_cat="${fname%%-*}"
        local cmd_name="${fname#*-}"
        cmd_name="${cmd_name%.md}"

        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue

        $DRY_RUN || mkdir -p "$target_dir/$target_cat"
        local toml_path="$target_dir/$target_cat/$cmd_name.toml"
        echo "$target_cat/$cmd_name.toml" >> "$tracked_file"

        local first_line
        first_line=$(head -1 "$md_file")
        local desc="${first_line#\#\# }"
        [ "$desc" = "$first_line" ] && desc="$target_cat $cmd_name command"
        local desc_escaped
        desc_escaped=$(escape_toml_basic_string "$desc")

        local content
        content=$(cat "$md_file")

        local new_toml
        new_toml=$(mktemp)
        {
            printf 'description = "%s"\n\n' "$desc_escaped"
            printf 'prompt = """\n'
            printf '%s\n' "$content"
            printf '"""\n'
        } > "$new_toml"

        if [ ! -f "$toml_path" ]; then
            if $DRY_RUN; then
                rm -f "$new_toml"
            else
                mv "$new_toml" "$toml_path"
            fi
            g_added=$((g_added + 1))
        elif ! diff -q "$new_toml" "$toml_path" >/dev/null 2>&1; then
            if $DRY_RUN; then
                rm -f "$new_toml"
            else
                mv "$new_toml" "$toml_path"
            fi
            g_updated=$((g_updated + 1))
        else
            rm -f "$new_toml"
            g_unchanged=$((g_unchanged + 1))
        fi
    done < <(list_sync_command_sources)

    while read -r existing; do
        local rel="${existing#"$target_dir/"}"
        if ! grep -qxF "$rel" "$tracked_file"; then
            $DRY_RUN || rm "$existing"
            g_removed=$((g_removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$target_dir" -name '*.toml' -type f 2>/dev/null)

    rm -f "$tracked_file"
    echo "  $label: $g_added added, $g_updated updated, $g_unchanged unchanged, $g_removed removed"
}

sync_gemini_commands() {
    sync_gemini_command_tree "$GEMINI_COMMANDS" "gemini global commands"
    sync_gemini_command_tree "$PROJECT_GEMINI_COMMANDS" "gemini project commands"
}

# ── Phase 6: Antigravity workflows ────────────────────────────

sync_antigravity() {
    mkdir -p "$ANTIGRAVITY_WORKFLOWS"
    local tracked_file
    tracked_file=$(mktemp)
    local a_added=0 a_updated=0 a_unchanged=0 a_removed=0

    while IFS=$'\t' read -r md_file fname; do
        [ -z "$md_file" ] && continue
        local target_cat="${fname%%-*}"
        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue
        local workflow_name="${fname%.md}"

        local target_path="$ANTIGRAVITY_WORKFLOWS/$fname"
        echo "$fname" >> "$tracked_file"

        local workflow_desc
        workflow_desc=$(escape_yaml_double_quoted "$(build_antigravity_description "$md_file" "$workflow_name")")

        local new_wf
        new_wf=$(mktemp)
        {
            echo "---"
            printf 'description: "%s"\n' "$workflow_desc"
            echo "---"
            echo ""
            cat "$md_file"
        } > "$new_wf"

        if [ ! -f "$target_path" ]; then
            if $DRY_RUN; then
                rm -f "$new_wf"
            else
                mv "$new_wf" "$target_path"
            fi
            a_added=$((a_added + 1))
        elif ! diff -q "$new_wf" "$target_path" >/dev/null 2>&1; then
            if $DRY_RUN; then
                rm -f "$new_wf"
            else
                mv "$new_wf" "$target_path"
            fi
            a_updated=$((a_updated + 1))
        else
            rm -f "$new_wf"
            a_unchanged=$((a_unchanged + 1))
        fi
    done < <(list_sync_command_sources)

    while read -r existing; do
        local rel
        rel=$(basename "$existing")
        if ! grep -qxF "$rel" "$tracked_file"; then
            $DRY_RUN || rm "$existing"
            a_removed=$((a_removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$ANTIGRAVITY_WORKFLOWS" -name '*.md' -type f 2>/dev/null)

    rm -f "$tracked_file"
    echo "  antigravity: $a_added added, $a_updated updated, $a_unchanged unchanged, $a_removed removed"
}

# ── Phase 7: Roo Code ────────────────────────────────────────

sync_roo() {
    if [ "$KING" = "roo" ]; then
        echo "  Roo Code is king — skipping (source, not target)"
        return
    fi

    [ ! -d "$ROO_DIR" ] && { echo "  Roo Code: not installed, skipping"; return; }

    # Commands: flat .md files in ~/.roo/commands/
    $DRY_RUN || mkdir -p "$ROO_COMMANDS"
    local tracked_file
    tracked_file=$(mktemp)
    local r_added=0 r_updated=0 r_unchanged=0 r_removed=0

    while IFS=$'\t' read -r md_file fname; do
        [ -z "$md_file" ] && continue

        local target_cat="${fname%%-*}"
        [ -z "$target_cat" ] && continue
        [ "$target_cat" = "$fname" ] && continue

        echo "$fname" >> "$tracked_file"

        # Roo commands use frontmatter with description
        local first_heading
        first_heading=$(grep -m1 '^## ' "$md_file" 2>/dev/null | sed 's/^## //' || true)

        local roo_tmp
        roo_tmp=$(mktemp)
        {
            echo "---"
            printf 'description: "%s"\n' "${first_heading:-$fname}"
            echo "---"
            echo ""
            echo ""
            cat "$md_file"
        } > "$roo_tmp"

        local target="$ROO_COMMANDS/$fname"
        if [ ! -f "$target" ]; then
            $DRY_RUN || mv "$roo_tmp" "$target"
            r_added=$((r_added + 1))
        elif ! diff -q "$roo_tmp" "$target" >/dev/null 2>&1; then
            $DRY_RUN || mv "$roo_tmp" "$target"
            r_updated=$((r_updated + 1))
        else
            rm -f "$roo_tmp"
            r_unchanged=$((r_unchanged + 1))
        fi
    done < <(list_sync_command_sources)

    # Remove stale commands that no longer exist in source
    while read -r existing; do
        local rel
        rel=$(basename "$existing")
        if ! grep -qxF "$rel" "$tracked_file"; then
            $DRY_RUN || rm "$existing"
            r_removed=$((r_removed + 1))
            echo "  removed stale: $rel"
        fi
    done < <(find "$ROO_COMMANDS" -name '*.md' -type f 2>/dev/null)

    rm -f "$tracked_file"
    echo "  roo commands: $r_added added, $r_updated updated, $r_unchanged unchanged, $r_removed removed"

    # Rules: copy .cursorrules content as ~/.roo/rules/00-global.md
    $DRY_RUN || mkdir -p "$ROO_RULES"
    if [ -f "$CURSORRULES_FILE" ]; then
        local rules_tmp
        rules_tmp=$(mktemp)
        cp "$CURSORRULES_FILE" "$rules_tmp"
        sync_file "$rules_tmp" "$ROO_RULES/00-global.md" "~/.roo/rules/00-global.md"
    fi
}

# ── Phase 8: Cline ───────────────────────────────────────────

sync_cline() {
    # Cline uses ~/.clinerules (global) or .clinerules/ dir in workspace
    # We sync global rules only
    [ ! -d "$HOME/.cline" ] && { echo "  Cline: not installed, skipping"; return; }

    if [ -f "$CURSORRULES_FILE" ]; then
        local tmp
        tmp=$(mktemp)
        cp "$CURSORRULES_FILE" "$tmp"
        sync_file "$tmp" "$CLINE_RULES" "~/.clinerules"
    else
        echo "  Cline: no rules to sync"
    fi
}

# ── Phase 9: opencode ────────────────────────────────────────

sync_opencode() {
    # opencode reads ~/.config/opencode/AGENTS.md for global rules
    [ ! -d "$OPENCODE_DIR" ] && [ ! -d "$HOME/.opencode" ] && {
        echo "  opencode: not installed, skipping"
        return
    }

    mkdir -p "$OPENCODE_DIR"

    # AGENTS.md
    if [ -f "$AGENTSMD_FILE" ]; then
        local tmp
        tmp=$(mktemp)
        cp "$AGENTSMD_FILE" "$tmp"
        sync_file "$tmp" "$OPENCODE_DIR/AGENTS.md" "~/.config/opencode/AGENTS.md"
    fi

    # Commands: opencode uses ~/.opencode/commands/ (may be symlinked)
    local oc_commands="$HOME/.opencode/commands"
    if [ -d "$oc_commands" ] && [ ! -L "$oc_commands" ]; then
        # Only sync if it's a real dir, not a symlink to another project
        local tracked_file
        tracked_file=$(mktemp)
        local o_added=0 o_updated=0 o_unchanged=0 o_removed=0

        while IFS=$'\t' read -r md_file fname; do
            [ -z "$md_file" ] && continue

            local target_cat="${fname%%-*}"
            [ -z "$target_cat" ] && continue
            [ "$target_cat" = "$fname" ] && continue

            echo "$fname" >> "$tracked_file"
            local target="$oc_commands/$fname"

            if [ ! -f "$target" ]; then
                $DRY_RUN || cp "$md_file" "$target"
                o_added=$((o_added + 1))
            elif ! diff -q "$md_file" "$target" >/dev/null 2>&1; then
                $DRY_RUN || cp "$md_file" "$target"
                o_updated=$((o_updated + 1))
            else
                o_unchanged=$((o_unchanged + 1))
            fi
        done < <(list_sync_command_sources)
        rm -f "$tracked_file"
        echo "  opencode commands: $o_added added, $o_updated updated, $o_unchanged unchanged"
    elif [ -L "$oc_commands" ]; then
        echo "  opencode commands: symlinked, skipping"
    fi
}

# ── Phase 10: VS Code family settings & keybindings ──────────

filter_settings_for_ide() {
    local ide_name="$1"
    local source="$SETTINGS_SRC/settings.json"

    [ ! -f "$source" ] && { echo "  ERROR: settings.json not found at $source" >&2; return 1; }

    python3 -c "
import json, sys, re

with open('$source') as f:
    lines = f.readlines()
    cleaned = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith('//'):
            continue
        cleaned.append(re.sub(r'(?<!:)//.*$', '', line))
    text = '\n'.join(cleaned)
    text = re.sub(r',(\s*[}\]])', r'\1', text)

data = json.loads(text)
ide = '$ide_name'
king = '$KING_LABEL'

# Build set of prefixes to strip for this target IDE
strip = set()
for k in list(data.keys()):
    # Strip king-specific keys for non-king IDEs
    if ide == 'Cursor' and king != 'Cursor':
        pass  # Don't strip cursor.* if target IS Cursor
    elif ide != 'Cursor' and (k.startswith('cursor.') or k.startswith('claudeCode.')):
        strip.add(k)

    if ide != 'Windsurf' and k.startswith('windsurf.'):
        strip.add(k)
    if ide != 'Trae' and k.startswith('trae.'):
        strip.add(k)

for k in strip:
    del data[k]

json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
print()
" 2>/dev/null
}

sync_ide_settings() {
    local source="$SETTINGS_SRC/settings.json"
    [ ! -f "$source" ] && { echo "  settings source not found: $source"; return; }

    echo "  source: $source"

    for entry in "${ALL_VSCODE_IDES[@]}"; do
        IFS=: read -r ide_name app_dir _dot_dir _rules_file <<< "$entry"
        local ide_dir="$APP_SUPPORT/$app_dir/User"

        # Skip the king itself
        if [ "$ide_dir" = "$SETTINGS_SRC" ]; then
            echo "  $ide_name: king (source), skipping"
            continue
        fi

        [ ! -d "$ide_dir" ] && { echo "  $ide_name: not installed, skipping"; continue; }

        local tmp
        tmp=$(mktemp)

        if ! filter_settings_for_ide "$ide_name" > "$tmp" 2>/dev/null || [ ! -s "$tmp" ]; then
            echo "  $ide_name: settings filter failed, skipping"
            rm -f "$tmp"
            continue
        fi

        sync_file "$tmp" "$ide_dir/settings.json" "$ide_name settings.json"
    done
}

sync_ide_keybindings() {
    local source="$SETTINGS_SRC/keybindings.json"
    [ ! -f "$source" ] && { echo "  keybindings source not found, skipping"; return; }

    echo "  source: $source"

    for entry in "${ALL_VSCODE_IDES[@]}"; do
        IFS=: read -r ide_name app_dir _dot_dir _rules_file <<< "$entry"
        local ide_dir="$APP_SUPPORT/$app_dir/User"

        if [ "$ide_dir" = "$SETTINGS_SRC" ]; then
            echo "  $ide_name: king (source), skipping"
            continue
        fi

        [ ! -d "$ide_dir" ] && { echo "  $ide_name: not installed, skipping"; continue; }

        local tmp
        tmp=$(mktemp)

        python3 -c "
import json, re

with open('$source') as f:
    text = f.read()
    text = re.sub(r'//.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r',(\s*[}\]])', r'\1', text)

data = json.loads(text)
ide = '$ide_name'

filtered = []
for binding in data:
    when = binding.get('when', '')
    cmd = binding.get('command', '')
    if ide != 'Cursor' and ('cursor.' in when or 'cursor.' in cmd or 'composerMode' in cmd):
        continue
    filtered.append(binding)

json.dump(filtered, __import__('sys').stdout, indent=4, ensure_ascii=False)
print()
" > "$tmp" 2>/dev/null

        if [ ! -s "$tmp" ]; then
            rm -f "$tmp"
            echo "  $ide_name: keybindings filter failed, skipping"
            continue
        fi

        sync_file "$tmp" "$ide_dir/keybindings.json" "$ide_name keybindings.json"
    done
}

# ── Phase 11: Project-level rule files ────────────────────────
# Syncs .cursorrules -> .windsurfrules, .traerules, .clinerules, .roorules

sync_project_rules() {
    [ ! -f "$CURSORRULES_FILE" ] && { echo "  no .cursorrules to propagate"; return; }

    local src="$CURSORRULES_FILE"

    # .windsurfrules
    local tmp
    tmp=$(mktemp) && cp "$src" "$tmp"
    sync_file "$tmp" "$COMMANDS_SRC/.windsurfrules" ".windsurfrules"

    # .traerules
    tmp=$(mktemp) && cp "$src" "$tmp"
    sync_file "$tmp" "$COMMANDS_SRC/.traerules" ".traerules"

    # .clinerules (project-level)
    tmp=$(mktemp) && cp "$src" "$tmp"
    sync_file "$tmp" "$COMMANDS_SRC/.clinerules" ".clinerules"

    # .roorules (legacy format, some projects still use it)
    tmp=$(mktemp) && cp "$src" "$tmp"
    sync_file "$tmp" "$COMMANDS_SRC/.roorules" ".roorules"
}

# ── --list: show detected targets ─────────────────────────────

cmd_list() {
    echo "=== Detected Targets ==="
    echo ""
    echo "King: $KING_LABEL (source: $COMMANDS_SRC)"
    echo ""

    echo "VS Code Family IDEs:"
    for entry in "${ALL_VSCODE_IDES[@]}"; do
        IFS=: read -r ide_name app_dir _dot_dir _rules_file <<< "$entry"
        local ide_dir="$APP_SUPPORT/$app_dir/User"
        if [ -d "$ide_dir" ]; then
            printf "  %-12s INSTALLED  %s\n" "$ide_name" "$ide_dir"
        else
            printf "  %-12s %-9s  %s\n" "$ide_name" "-" "$ide_dir"
        fi
    done

    echo ""
    echo "Agents & Extensions:"
    local -a agents=(
        "Claude Code:$CLAUDE_DIR"
        "OpenAI Codex:$CODEX_DIR"
        "Gemini CLI:$GEMINI_DIR"
        "Gemini Code Assist Workspace:$PROJECT_GEMINI_COMMANDS"
        "opencode:$OPENCODE_DIR"
        "Roo Code:$ROO_DIR"
        "Cline:$HOME/.cline"
        "Antigravity:$ANTIGRAVITY_WORKFLOWS"
    )
    for entry in "${agents[@]}"; do
        local name="${entry%%:*}"
        local dir="${entry#*:}"
        if [ -d "$dir" ]; then
            printf "  %-16s INSTALLED  %s\n" "$name" "$dir"
        else
            printf "  %-16s %-9s  %s\n" "$name" "-" "$dir"
        fi
    done

    echo ""
    echo "Project Rules (from .cursorrules):"
    for f in .cursorrules .windsurfrules .traerules .clinerules .roorules AGENTS.md CLAUDE.md GEMINI.md .geminirules .gemini/commands/**/*.toml; do
        printf "  %s\n" "$f"
    done
}

# ── Main ──────────────────────────────────────────────────────

resolve_king
resolve_derived_paths

if $LIST_ONLY; then
    cmd_list
    exit 0
fi

PHASE=0
TOTAL=12

phase() {
    PHASE=$((PHASE + 1))
    echo "[$PHASE/$TOTAL $1]"
}

echo "=== sync-commands.sh ==="
echo ""
echo "king:   $KING_LABEL ($KING)"
echo "source: $COMMANDS_SRC"
$DRY_RUN && echo "mode:   DRY RUN (no writes)"
echo ""

phase "rules: generate exports"
generate_rules

phase "claude-code: commands"
sync_claude_commands

phase "claude-code: CLAUDE.md + settings"
sync_claude_rules
sync_claude_settings

phase "codex: AGENTS.md + skills"
sync_codex

phase "gemini: rules + commands"
sync_gemini_rules
sync_gemini_commands

phase "antigravity: workflows"
sync_antigravity

phase "roo-code: commands + rules"
sync_roo

phase "cline: global rules"
sync_cline

phase "opencode: AGENTS.md + commands"
sync_opencode

phase "vscode-family: settings"
sync_ide_settings

phase "vscode-family: keybindings"
sync_ide_keybindings
echo ""

phase "project-rules: .windsurfrules, .traerules, .clinerules, .roorules"
sync_project_rules

echo ""
echo "--- summary ---"
echo "king: $KING_LABEL | commands: $added added, $updated updated, $unchanged unchanged, $removed removed"
echo ""
echo "targets:"
echo "  agents:  claude-code, codex, gemini-cli, opencode"
echo "  exts:    roo-code, cline, gemini-code-assist"
echo "  tools:   antigravity"
echo "  ides:    $(for e in "${ALL_VSCODE_IDES[@]}"; do IFS=: read -r n _ _ _ <<< "$e"; printf '%s ' "$n"; done)"
echo "  project: .cursorrules .windsurfrules .traerules .clinerules .roorules AGENTS.md CLAUDE.md GEMINI.md .gemini/commands/**/*.toml"
echo ""
echo "done."
