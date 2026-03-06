---
name: pixel-agents
description: >-
  Visualizes active AI agent sessions as animated pixel art characters in a virtual office.
  Use when user asks to see agents, show their work, visualize activity, monitor agents,
  "ver agentes", "show agents", "what are my agents doing", or "muéstrame los agentes".
license: MIT
---

## Overview

Pixel Agents turns your AI coding sessions into an animated pixel art office. Each active
agent session becomes a character that walks around, sits at desks, and visually reflects
what it's doing — typing when editing, reading when searching, waiting when idle.

## Procedure

### To show the visual agent viewer:
1. Run `scripts/launch-viewer` to open the Pixel Agents Electron window
2. The viewer auto-detects active sessions in `~/.copilot/session-state/`
3. Each session appears as an animated character in a pixel art office
4. The viewer updates in real-time as agents work

### To get a text summary of agent status (no viewer needed):
1. Run `scripts/get-status` to get a text description of all active agents
2. Report the output to the user

### To close the viewer:
1. Run `scripts/close-viewer` to close the Pixel Agents window

## Reference Scripts
- `scripts/launch-viewer.sh` / `scripts/launch-viewer.ps1`: Opens the Electron viewer
- `scripts/get-status.sh` / `scripts/get-status.ps1`: Returns text summary of agent activity
- `scripts/close-viewer.sh` / `scripts/close-viewer.ps1`: Closes the viewer window

## References
- `references/tool-mapping.md`: How AI tool calls map to character animations
