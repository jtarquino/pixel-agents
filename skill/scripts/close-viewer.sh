#!/usr/bin/env bash
# Pixel Agents — Close Viewer
PID_FILE="/tmp/pixel-agents-viewer.pid"
if [ -f "$PID_FILE" ]; then
  pid=$(cat "$PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Pixel Agents viewer closed (PID: $pid)"
  else
    echo "Viewer process not running"
  fi
  rm -f "$PID_FILE"
else
  echo "No viewer PID file found"
fi
