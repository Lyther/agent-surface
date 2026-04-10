#!/usr/bin/env bash
set -euo pipefail

CURSOR_COMMANDS="$HOME/.cursor/commands"
CURSOR_RULES="$CURSOR_COMMANDS/.cursor/rules"
CURSORRULES="$CURSOR_COMMANDS/.cursorrules"
GEMINIRULES="$CURSOR_COMMANDS/.geminirules"
AGENTSMD="$CURSOR_COMMANDS/AGENTS.md"
PROJECT_GEMINI_MD="$CURSOR_COMMANDS/GEMINI.md"

# --- VS Code family: settings & keybindings sync (Cursor = golden source) ---

CURSOR_APP_SUPPORT="$HOME/Library/Application Support/Cursor/User"
VSCODE_IDES=(
    "Code:$HOME/Library/Application Support/Code/User"
    "Windsurf:$HOME/Library/Application Support/Windsurf/User"
    "Trae:$HOME/Library/Application Support/Trae/User"
)

# Keys that are Cursor-specific and must be stripped for vanilla VS Code
CURSOR_ONLY_KEY_PREFIXES=(
    '"cursor\.'
    '"claudeCode\.'
)

# Keys that are IDE-specific and should be stripped for ALL non-origin IDEs
# (each IDE may have its own equivalent; we remove stale ones from Cursor's export)
STRIP_FOREIGN_KEY_PREFIXES=(
    '"github\.copilot'
    '"geminicodeassist\.'
    '"windsurf\.'
    '"trae\.'
)

CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS="$CLAUDE_DIR/commands"
CODEX_DIR="$HOME/.codex"
CODEX_SKILLS_DIR="$HOME/.agents/skills"
CODEX_SYNC_MARKER=".cursor-sync-origin"
GEMINI_DIR="$HOME/.gemini"
GEMINI_COMMANDS="$GEMINI_DIR/commands"
ANTIGRAVITY_WORKFLOWS="$GEMINI_DIR/antigravity/global_workflows"

added=0
updated=0
unchanged=0
removed=0

# --- Phase 1: Generate rules exports from .cursor/rules/*.mdc (authoritative source) ---

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

emit_codex_skill_body() {
    local file="$1"
    awk '
        /^## PLATFORM DEPLOYMENT$/ { skip=1; next }
        skip && /^## / { skip=0 }
        !skip { print }
    ' "$file"
}

generate_rules() {
    local tmp
    tmp=$(mktemp)

    # Only include alwaysApply rules (01-06), skip glob-scoped lang-* rules (10-14)
    for f in $(ls "$CURSOR_RULES"/0[0-9]-*.mdc 2>/dev/null | sort); do
        strip_frontmatter "$f" >> "$tmp"
        echo "" >> "$tmp"
    done

    # Trim leading/trailing blank lines
    sed -i '' -e '/./,$!d' -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$tmp" 2>/dev/null || true

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

    # Generate AGENTS.md (cross-tool), preserving learned sections
    local learned_tmp
    learned_tmp=$(mktemp)
    extract_learned_sections "$AGENTSMD" > "$learned_tmp"

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
        if [ -s "$learned_tmp" ]; then
            cat "$learned_tmp"
        fi
    } > "$agents_tmp"

    if [ ! -f "$AGENTSMD" ] || ! diff -q "$agents_tmp" "$AGENTSMD" >/dev/null 2>&1; then
        cp "$agents_tmp" "$AGENTSMD"
        echo "  updated AGENTS.md"
    else
        echo "  AGENTS.md unchanged"
    fi
    rm -f "$agents_tmp" "$learned_tmp"
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

sync_codex_rules() {
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

sync_codex_skills() {
    mkdir -p "$CODEX_SKILLS_DIR"

    local tracked_file
    tracked_file=$(mktemp)
    local c_added=0 c_updated=0 c_unchanged=0 c_removed=0

    for md_file in "$CURSOR_COMMANDS"/*.md; do
        [ ! -f "$md_file" ] && continue
        local fname
        fname=$(basename "$md_file")

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
            printf 'This skill is synced from `%s` in `~/.cursor/commands`.\n' "$fname"
            printf '%s\n' 'Prefer Codex built-ins like `/plan`, `/review`, and `/fork` when they already cover the task; use this skill when you want the specific workflow below.'
            printf 'Treat any legacy slash-command syntax below as source documentation from Cursor. In Codex, invoke `$%s` and express the same options in natural language or inline parameters.\n' "$skill_name"
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
            printf 'source_repo: %s\n' "$CURSOR_COMMANDS"
            printf 'source_file: %s\n' "$fname"
        } > "$marker_tmp"

        local existed=0
        local changed=0
        [ -d "$skill_dir" ] && existed=1

        mkdir -p "$skill_dir/agents"

        if [ ! -f "$skill_dir/SKILL.md" ] || ! diff -q "$skill_tmp" "$skill_dir/SKILL.md" >/dev/null 2>&1; then
            mv "$skill_tmp" "$skill_dir/SKILL.md"
            changed=1
        else
            rm -f "$skill_tmp"
        fi

        if [ ! -f "$skill_dir/agents/openai.yaml" ] || ! diff -q "$metadata_tmp" "$skill_dir/agents/openai.yaml" >/dev/null 2>&1; then
            mv "$metadata_tmp" "$skill_dir/agents/openai.yaml"
            changed=1
        else
            rm -f "$metadata_tmp"
        fi

        if [ ! -f "$skill_dir/$CODEX_SYNC_MARKER" ] || ! diff -q "$marker_tmp" "$skill_dir/$CODEX_SYNC_MARKER" >/dev/null 2>&1; then
            mv "$marker_tmp" "$skill_dir/$CODEX_SYNC_MARKER"
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
    done

    while read -r marker; do
        [ -z "$marker" ] && continue
        local skill_dir
        skill_dir=$(dirname "$marker")
        local skill_name
        skill_name=$(basename "$skill_dir")

        if ! grep -qxF "$skill_name" "$tracked_file"; then
            rm -f \
                "$skill_dir/SKILL.md" \
                "$skill_dir/agents/openai.yaml" \
                "$skill_dir/$CODEX_SYNC_MARKER"
            rmdir "$skill_dir/agents" 2>/dev/null || true
            rmdir "$skill_dir" 2>/dev/null || true
            c_removed=$((c_removed + 1))
            echo "  removed stale codex skill: $skill_name"
        fi
    done < <(find "$CODEX_SKILLS_DIR" -name "$CODEX_SYNC_MARKER" -type f 2>/dev/null)

    rm -f "$tracked_file"
    echo "  codex skills: $c_added added, $c_updated updated, $c_unchanged unchanged, $c_removed removed"
}

sync_codex() {
    sync_codex_rules
    sync_codex_skills
}

# --- Phase 5: Gemini CLI + Code Assist ---

emit_gemini_markdown() {
    local target="$1"
    local label="$2"
    local title="$3"
    local tmp
    tmp=$(mktemp)

    {
        printf '# %s\n\n' "$title"
        echo "> Auto-generated from ~/.cursor/commands/.cursor/rules/. Do not edit directly."
        echo ""
        strip_frontmatter "$GEMINIRULES"
    } > "$tmp"

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

sync_gemini_rules() {
    if [ ! -f "$GEMINIRULES" ]; then
        echo "  ERROR: .geminirules not generated yet"
        return 1
    fi

    mkdir -p "$GEMINI_DIR"
    emit_gemini_markdown "$PROJECT_GEMINI_MD" "GEMINI.md" "GEMINI.md — Project Agent Rules"
    emit_gemini_markdown "$GEMINI_DIR/GEMINI.md" "~/.gemini/GEMINI.md" "GEMINI.md — Global Agent Rules"
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

# --- Phase 7: VS Code family settings & keybindings sync ---

# Filter Cursor settings.json for a target IDE.
# $1 = target IDE name (Code, Windsurf, Trae)
# Reads from CURSOR_APP_SUPPORT/settings.json, writes filtered JSON to stdout.
filter_settings_for_ide() {
    local ide_name="$1"
    local source="$CURSOR_APP_SUPPORT/settings.json"

    if [ ! -f "$source" ]; then
        echo "  ERROR: Cursor settings.json not found at $source" >&2
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    cp "$source" "$tmp"

    # Strip Cursor-specific keys for non-Cursor IDEs
    case "$ide_name" in
        Code)
            # VS Code doesn't understand cursor.* or claudeCode.* keys
            for prefix in "${CURSOR_ONLY_KEY_PREFIXES[@]}"; do
                # Remove lines matching "cursor.xxx": ... (handles single-line and start of multi-line)
                # Use python for reliable JSON-aware filtering
                :
            done
            ;;
    esac

    # Use python for reliable JSON key filtering (jq not guaranteed)
    python3 -c "
import json, sys, re

with open('$tmp') as f:
    # Strip comments (JSONC -> JSON)
    lines = f.readlines()
    cleaned = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith('//'):
            continue
        # Remove inline comments (naive but works for settings.json)
        cleaned.append(re.sub(r'(?<!:)//.*$', '', line))
    text = '\n'.join(cleaned)

    # Handle trailing commas before } or ]
    text = re.sub(r',(\s*[}\]])', r'\1', text)

data = json.loads(text)

ide = '$ide_name'

# Keys to always strip (foreign IDE specific)
foreign = set()
for k in list(data.keys()):
    # Strip cursor.* and claudeCode.* for non-Cursor IDEs
    if ide != 'Cursor':
        if k.startswith('cursor.') or k.startswith('claudeCode.'):
            foreign.add(k)

    # Strip windsurf.* for non-Windsurf, trae.* for non-Trae
    if ide != 'Windsurf' and k.startswith('windsurf.'):
        foreign.add(k)
    if ide != 'Trae' and k.startswith('trae.'):
        foreign.add(k)

for k in foreign:
    del data[k]

json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
print()  # trailing newline
" 2>/dev/null

    rm -f "$tmp"
}

sync_ide_settings() {
    echo "  source: $CURSOR_APP_SUPPORT/settings.json"

    for entry in "${VSCODE_IDES[@]}"; do
        local ide_name="${entry%%:*}"
        local ide_dir="${entry#*:}"

        if [ ! -d "$ide_dir" ]; then
            echo "  $ide_name: skipped (not installed)"
            continue
        fi

        local target="$ide_dir/settings.json"
        local tmp
        tmp=$(mktemp)

        if ! filter_settings_for_ide "$ide_name" > "$tmp" 2>/dev/null; then
            echo "  $ide_name: ERROR filtering settings"
            rm -f "$tmp"
            continue
        fi

        # Check for empty/invalid output
        if [ ! -s "$tmp" ]; then
            echo "  $ide_name: ERROR empty filtered output"
            rm -f "$tmp"
            continue
        fi

        if [ ! -f "$target" ]; then
            mv "$tmp" "$target"
            echo "  $ide_name: created settings.json"
        elif ! diff -q "$tmp" "$target" >/dev/null 2>&1; then
            mv "$tmp" "$target"
            echo "  $ide_name: updated settings.json"
        else
            rm -f "$tmp"
            echo "  $ide_name: settings.json unchanged"
        fi
    done
}

sync_ide_keybindings() {
    local source="$CURSOR_APP_SUPPORT/keybindings.json"

    if [ ! -f "$source" ]; then
        echo "  keybindings: no source file, skipping"
        return
    fi

    echo "  source: $source"

    for entry in "${VSCODE_IDES[@]}"; do
        local ide_name="${entry%%:*}"
        local ide_dir="${entry#*:}"

        if [ ! -d "$ide_dir" ]; then
            echo "  $ide_name: skipped (not installed)"
            continue
        fi

        local target="$ide_dir/keybindings.json"

        # Filter out Cursor-specific keybindings for non-Cursor IDEs
        local tmp
        tmp=$(mktemp)

        python3 -c "
import json, re

with open('$source') as f:
    text = f.read()
    # Strip JSONC comments
    text = re.sub(r'//.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r',(\s*[}\]])', r'\1', text)

data = json.loads(text)
ide = '$ide_name'

filtered = []
for binding in data:
    when = binding.get('when', '')
    cmd = binding.get('command', '')

    # Skip Cursor-specific bindings for non-Cursor IDEs
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

        if [ ! -f "$target" ]; then
            mv "$tmp" "$target"
            echo "  $ide_name: created keybindings.json"
        elif ! diff -q "$tmp" "$target" >/dev/null 2>&1; then
            mv "$tmp" "$target"
            echo "  $ide_name: updated keybindings.json"
        else
            rm -f "$tmp"
            echo "  $ide_name: keybindings.json unchanged"
        fi
    done
}

sync_ide_family() {
    sync_ide_settings
    echo ""
    sync_ide_keybindings
}

# --- Phase 8: Project-level rules sync for Windsurf & Trae ---

sync_project_rules() {
    # Windsurf uses .windsurfrules at project root (same format as .cursorrules)
    # Trae uses .traerules at project root
    # These are synced per-project, not globally — but we sync them for the commands repo itself
    local commands_root="$CURSOR_COMMANDS"

    if [ -f "$commands_root/.cursorrules" ]; then
        local wr="$commands_root/.windsurfrules"
        if [ ! -f "$wr" ] || ! diff -q "$commands_root/.cursorrules" "$wr" >/dev/null 2>&1; then
            cp "$commands_root/.cursorrules" "$wr"
            echo "  updated .windsurfrules"
        else
            echo "  .windsurfrules unchanged"
        fi

        local tr="$commands_root/.traerules"
        if [ ! -f "$tr" ] || ! diff -q "$commands_root/.cursorrules" "$tr" >/dev/null 2>&1; then
            cp "$commands_root/.cursorrules" "$tr"
            echo "  updated .traerules"
        else
            echo "  .traerules unchanged"
        fi
    fi
}

# --- Main ---

echo "=== Cursor -> All Targets sync ==="
echo ""
echo "source: $CURSOR_COMMANDS"
echo ""

echo "[1/10 rules: generate from .cursor/rules/]"
generate_rules

echo "[2/10 claude: commands]"
sync_commands

echo "[3/10 claude: CLAUDE.md]"
sync_rules

echo "[4/10 claude: settings]"
sync_settings

echo "[5/10 codex: AGENTS.md + skills]"
sync_codex

echo "[6/10 gemini: project/home GEMINI.md + commands]"
sync_gemini_rules
sync_gemini_commands

echo "[7/10 antigravity: workflows]"
sync_antigravity

echo "[8/10 vscode-family: settings]"
sync_ide_settings

echo "[9/10 vscode-family: keybindings]"
sync_ide_keybindings

echo "[10/10 project-rules: .windsurfrules, .traerules]"
sync_project_rules

echo ""
echo "--- summary ---"
echo "claude commands: $added added, $updated updated, $unchanged unchanged, $removed removed"
echo "targets: claude, codex-agents, codex-skills, gemini-cli, gemini-code-assist, antigravity"
echo "vscode family: Code, Windsurf, Trae (settings + keybindings from Cursor)"
echo "project rules: .windsurfrules, .traerules (from .cursorrules)"
echo "done."
