#!/usr/bin/env bash
#
# strip-ai-attribution.sh - Remove AI vendor trailers/signatures from commit messages.
#
# Usage:
#   strip-ai-attribution.sh [--check] <commit-message-file>
#

set -euo pipefail

SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
readonly SCRIPT_NAME

check_only=false
tmp_file=""
removed_file=""

cleanup() {
    [[ -n "${tmp_file:-}" ]] && rm -f -- "$tmp_file"
    [[ -n "${removed_file:-}" ]] && rm -f -- "$removed_file"
}
trap cleanup EXIT

die() {
    printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2
    exit 1
}

usage() {
    die "usage: $SCRIPT_NAME [--check] <commit-message-file>"
}

main() {
    if [[ "${1:-}" == "--check" ]]; then
        check_only=true
        shift
    fi

    [[ $# -eq 1 ]] || usage
    local msg_file="$1"
    [[ -f "$msg_file" ]] || die "commit message file not found: $msg_file"

    tmp_file="$(mktemp)" || die "failed to create temp file"
    removed_file="$(mktemp)" || die "failed to create temp file"

    perl -Mstrict -Mwarnings -e '
        my ($in, $out, $removed) = @ARGV;
        open my $fh, "<", $in or die "read $in: $!";
        local $/;
        my $text = <$fh>;
        close $fh;

        my @removed;
        my @kept;
        for my $line (split /\n/, $text, -1) {
            if (is_ai_ad_line($line)) {
                push @removed, $line;
                next;
            }
            push @kept, $line;
        }

        while (@kept > 1 && $kept[-1] eq "" && $kept[-2] eq "") {
            pop @kept;
        }

        open my $out_fh, ">", $out or die "write $out: $!";
        print {$out_fh} join("\n", @kept);
        close $out_fh;

        open my $removed_fh, ">", $removed or die "write $removed: $!";
        print {$removed_fh} join("\n", @removed);
        print {$removed_fh} "\n" if @removed;
        close $removed_fh;

        sub is_ai_ad_line {
            my ($line) = @_;
            return 1 if $line =~ /^\s*Co-authored-by:\s*.*<\s*(?:cursoragent\@cursor\.com|noreply\@anthropic\.com)\s*>\s*$/i;
            return 1 if $line =~ /^\s*(?:🤖\s*)?Generated(?:[ -]|\s)+(?:by|with)\s+.*(?:Claude\s+Code|Cursor(?:\s+Agent)?)/i;
            return 1 if $line =~ /^\s*(?:Generated-by|Generated-with):\s+.*(?:Claude\s+Code|Cursor(?:\s+Agent)?)/i;
            return 0;
        }
    ' "$msg_file" "$tmp_file" "$removed_file"

    if cmp -s -- "$msg_file" "$tmp_file"; then
        return 0
    fi

    if [[ "$check_only" == true ]]; then
        printf '%s: AI attribution or vendor advertising found in commit message:\n' "$SCRIPT_NAME" >&2
        sed 's/^/  /' "$removed_file" >&2
        return 1
    fi

    cat -- "$tmp_file" >"$msg_file"
    printf '%s: removed AI attribution/vendor advertising line(s):\n' "$SCRIPT_NAME" >&2
    sed 's/^/  /' "$removed_file" >&2
}

main "$@"
