#!/usr/bin/env bash
# Watch Ralph's live tool calls (Bash commands, Read, Edit, etc.) as they happen.
#
# Why this exists: the default .ralph/live.log strips command content and only
# shows "⚡ [Bash]" markers. The raw JSON stream has the full command — this
# script tails it and pretty-prints just the interesting bits.
#
# Usage:
#   ./scripts/ralph-watch.sh             # all tools, color
#   ./scripts/ralph-watch.sh --bash      # Bash commands only
#   ./scripts/ralph-watch.sh --tools     # tool name + input summary only
#
# Auto-follows when Ralph rotates to a new loop's log file.
set -euo pipefail

LOG_DIR="${HOME}/myclaw-aios/.ralph/logs"
FILTER_MODE="${1:-all}"

# ANSI colors
C_DIM=$'\033[2m'
C_CYAN=$'\033[36m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_MAGENTA=$'\033[35m'
C_GRAY=$'\033[90m'
C_BOLD=$'\033[1m'
C_RST=$'\033[0m'

# jq filter: extract finalized tool_use blocks from assistant messages.
# Skips stream_event deltas (those are partial); only emits when a turn lands.
build_filter() {
  case "$1" in
    --bash|bash)
      # Bash only
      cat <<'JQ'
select(.type == "assistant") |
  .message.content[]? |
  select(.type == "tool_use" and .name == "Bash") |
  {
    ts:   (now | strftime("%H:%M:%S")),
    desc: (.input.description // "(no desc)"),
    cmd:  (.input.command // "")
  }
JQ
      ;;
    --tools|tools)
      # Tool name + first param value only (terse)
      cat <<'JQ'
select(.type == "assistant") |
  .message.content[]? |
  select(.type == "tool_use") |
  {
    ts:   (now | strftime("%H:%M:%S")),
    tool: .name,
    arg:  (.input.command // .input.file_path // .input.pattern // .input.url // .input.path // .input.description // (.input | tostring | .[0:120]))
  }
JQ
      ;;
    *)
      # All tools, full input shown
      cat <<'JQ'
select(.type == "assistant") |
  .message.content[]? |
  select(.type == "tool_use") |
  {
    ts:   (now | strftime("%H:%M:%S")),
    tool: .name,
    desc: (.input.description // ""),
    body: (
      if .name == "Bash"   then .input.command
      elif .name == "Read" then ("file: " + (.input.file_path // "?"))
      elif .name == "Edit" then ("file: " + (.input.file_path // "?"))
      elif .name == "Write" then ("file: " + (.input.file_path // "?"))
      elif .name == "Grep" then ("pattern: " + (.input.pattern // "?") + (if .input.path then " in " + .input.path else "" end))
      elif .name == "Glob" then ("pattern: " + (.input.pattern // "?"))
      elif .name == "WebFetch" then ("url: " + (.input.url // "?"))
      elif .name == "TodoWrite" then (.input.todos | length | tostring) + " todos"
      else (.input | tostring | .[0:200])
      end
    )
  }
JQ
      ;;
  esac
}

format_row() {
  # Reads jq output (newline-separated JSON objects), prints colored rows.
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    case "$FILTER_MODE" in
      --bash|bash)
        ts=$(jq -r '.ts // empty' <<<"$line")
        desc=$(jq -r '.desc // empty' <<<"$line")
        cmd=$(jq -r '.cmd // empty' <<<"$line")
        printf "%s%s%s %s%s%s\n  %s$%s %s\n" \
          "$C_GRAY" "$ts" "$C_RST" \
          "$C_CYAN" "$desc" "$C_RST" \
          "$C_GREEN" "$C_RST" "$cmd"
        ;;
      --tools|tools)
        ts=$(jq -r '.ts // empty' <<<"$line")
        tool=$(jq -r '.tool // empty' <<<"$line")
        arg=$(jq -r '.arg // empty' <<<"$line")
        printf "%s%s%s %s[%s]%s %s\n" \
          "$C_GRAY" "$ts" "$C_RST" \
          "$C_MAGENTA" "$tool" "$C_RST" \
          "$arg"
        ;;
      *)
        ts=$(jq -r '.ts // empty' <<<"$line")
        tool=$(jq -r '.tool // empty' <<<"$line")
        desc=$(jq -r '.desc // empty' <<<"$line")
        body=$(jq -r '.body // empty' <<<"$line")
        # Tool color
        case "$tool" in
          Bash)             tcol="$C_GREEN" ;;
          Read|Glob|Grep)   tcol="$C_CYAN" ;;
          Write|Edit)       tcol="$C_YELLOW" ;;
          WebFetch)         tcol="$C_MAGENTA" ;;
          *)                tcol="$C_BOLD" ;;
        esac
        if [[ -n "$desc" && "$desc" != "null" ]]; then
          printf "%s%s%s %s[%s]%s %s%s%s\n  %s\n" \
            "$C_GRAY" "$ts" "$C_RST" \
            "$tcol" "$tool" "$C_RST" \
            "$C_DIM" "$desc" "$C_RST" \
            "$body"
        else
          printf "%s%s%s %s[%s]%s %s\n" \
            "$C_GRAY" "$ts" "$C_RST" \
            "$tcol" "$tool" "$C_RST" \
            "$body"
        fi
        ;;
    esac
  done
}

find_current_log() {
  # Most-recently-modified claude_output_*.log (excluding _stream.log
  # siblings) — within the last 5 minutes so we don't latch onto a
  # stale finished-loop log. Ralph's claude calls run up to 20 min so
  # we'll catch the active file on the next 5s poll either way.
  find "$LOG_DIR" -maxdepth 1 -name 'claude_output_*.log' \
    ! -name '*_stream.log' -mmin -5 -type f 2>/dev/null \
    | xargs -r ls -t 2>/dev/null \
    | head -1
}

replay_recent() {
  # On first attach, replay the last 5 tool calls so the user sees
  # something immediately instead of staring at a blank pane until
  # the next event lands.
  local f="$1"
  echo "${C_DIM}── recent (last 5 tool calls from active log) ──${C_RST}"
  tail -n 500 "$f" 2>/dev/null \
    | jq -c --unbuffered "$JQ_FILTER" 2>/dev/null \
    | tail -n 5 \
    | format_row
  echo "${C_DIM}── live now ──${C_RST}"
}

JQ_FILTER=$(build_filter "$FILTER_MODE")

echo "${C_DIM}=== Ralph live tool watcher (mode: ${FILTER_MODE}) ===${C_RST}"
echo "${C_DIM}Polling for active loop's log every 5s. Ctrl+C to exit.${C_RST}"
echo ""

current=""
tail_pid=""
while true; do
  latest=$(find_current_log)
  if [[ -n "$latest" && "$latest" != "$current" ]]; then
    if [[ -n "$tail_pid" ]]; then
      kill "$tail_pid" 2>/dev/null || true
      wait "$tail_pid" 2>/dev/null || true
    fi
    current="$latest"
    echo ""
    echo "${C_BOLD}${C_YELLOW}── now tailing $(basename "$current") ──${C_RST}"
    replay_recent "$current"
    # Start tail+jq+format pipeline in background so we can swap files.
    ( tail -n 0 -F "$current" 2>/dev/null \
        | jq -c --unbuffered "$JQ_FILTER" 2>/dev/null \
        | format_row ) &
    tail_pid=$!
  fi
  sleep 5
done
