#!/usr/bin/env bash
# Pixel Agents — Launch Viewer
# Detects the current Copilot CLI session and opens the Electron viewer.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SESSION_STATE_DIR="$HOME/.copilot/session-state"
CWD="${1:-$(pwd)}"
DRY_RUN="${DRY_RUN:-false}"
PID_FILE="/tmp/pixel-agents-viewer.pid"

# Normalize path for comparison
normalize_path() {
  echo "$1" | tr '\\' '/' | sed 's:/*$::' | tr '[:upper:]' '[:lower:]'
}

# Find the most recently modified session matching the CWD
find_session() {
  local target_cwd
  target_cwd="$(normalize_path "$CWD")"
  local best_session=""
  local best_mtime=0

  if [ ! -d "$SESSION_STATE_DIR" ]; then
    echo "ERROR: No Copilot sessions found at $SESSION_STATE_DIR" >&2
    exit 1
  fi

  for session_dir in "$SESSION_STATE_DIR"/*/; do
    [ -d "$session_dir" ] || continue
    local workspace_yaml="$session_dir/workspace.yaml"
    local events_jsonl="$session_dir/events.jsonl"
    [ -f "$workspace_yaml" ] && [ -f "$events_jsonl" ] || continue

    # Extract cwd from workspace.yaml
    local session_cwd
    session_cwd=$(grep "^cwd:" "$workspace_yaml" | sed 's/^cwd:\s*//' | tr -d '\r')
    session_cwd="$(normalize_path "$session_cwd")"

    if [ "$session_cwd" = "$target_cwd" ]; then
      local mtime
      mtime=$(stat -c %Y "$events_jsonl" 2>/dev/null || stat -f %m "$events_jsonl" 2>/dev/null || echo 0)
      if [ "$mtime" -gt "$best_mtime" ]; then
        best_mtime=$mtime
        best_session="$(basename "$session_dir")"
      fi
    fi
  done

  if [ -z "$best_session" ]; then
    # Fallback: most recently modified session regardless of CWD
    for session_dir in "$SESSION_STATE_DIR"/*/; do
      [ -d "$session_dir" ] || continue
      local events_jsonl="$session_dir/events.jsonl"
      [ -f "$events_jsonl" ] || continue
      local mtime
      mtime=$(stat -c %Y "$events_jsonl" 2>/dev/null || stat -f %m "$events_jsonl" 2>/dev/null || echo 0)
      if [ "$mtime" -gt "$best_mtime" ]; then
        best_mtime=$mtime
        best_session="$(basename "$session_dir")"
      fi
    done
  fi

  echo "$best_session"
}

SESSION_ID="$(find_session)"

if [ -z "$SESSION_ID" ]; then
  echo "ERROR: No active Copilot CLI session found" >&2
  exit 1
fi

echo "Found session: $SESSION_ID"

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY_RUN: would launch viewer for session $SESSION_ID"
  exit 0
fi

# Kill existing viewer if running
if [ -f "$PID_FILE" ]; then
  old_pid=$(cat "$PID_FILE")
  if kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" 2>/dev/null || true
    sleep 0.5
  fi
  rm -f "$PID_FILE"
fi

# Launch Electron viewer
npx pixel-agents --session "$SESSION_ID" &
echo $! > "$PID_FILE"
echo "Pixel Agents viewer launched — monitoring session $SESSION_ID (PID: $!)"
