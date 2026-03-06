# Pixel Agents

A VS Code extension that turns your AI coding agents into animated pixel art characters in a virtual office.

Each AI agent terminal you open spawns a character that walks around, sits at desks, and visually reflects what the agent is doing — typing when writing code, reading when searching files, waiting when it needs your attention.

**Supported backends:**
- **Claude Code CLI** — the original backend
- **GitHub Copilot CLI** — ✨ new! full support via `copilot --resume <uuid>`

This fork adds GitHub Copilot CLI support. The [original project](https://github.com/pablodelucca/pixel-agents) by pablodelucca is also available as a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=pablodelucca.pixel-agents).


![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## Features

- **One agent, one character** — every AI agent terminal gets its own animated character
- **Dual backend support** — works with both Claude Code and GitHub Copilot CLI
- **Auto-detection** — automatically detects which backend is available (`~/.copilot` → Copilot, `claude` on PATH → Claude)
- **Live activity tracking** — characters animate based on what the agent is actually doing (writing, reading, running commands)
- **Office layout editor** — design your office with floors, walls, and furniture using a built-in editor
- **Speech bubbles** — visual indicators when an agent is waiting for input or needs permission
- **Sound notifications** — optional chime when an agent finishes its turn
- **Sub-agent visualization** — Task tool sub-agents spawn as separate characters linked to their parent
- **Persistent layouts** — your office design is saved and shared across VS Code windows
- **Diverse characters** — 6 diverse characters. These are based on the amazing work of [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Pixel Agents characters" width="320" height="72" style="image-rendering: pixelated;">
</p>

## Requirements

- VS Code 1.109.0 or later
- One of:
  - [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
  - [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) installed and authenticated

## Getting Started

If you just want to use Pixel Agents, the easiest way is to download the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=pablodelucca.pixel-agents). If you want to play with the code, develop, or contribute, then:

### Install from source

```bash
git clone https://github.com/jtarquino/pixel-agents.git
cd pixel-agents
git checkout copilot-cli-support
npm install
cd webview-ui && npm install && cd ..
npm run build
```

Then press **F5** in VS Code to launch the Extension Development Host.

### Usage

1. Open the **Pixel Agents** panel (it appears in the bottom panel area alongside your terminal)
2. Click **+ Agent** to spawn a new agent terminal and its character
   - If Copilot CLI is detected (`~/.copilot` exists), it launches `copilot --resume <uuid>`
   - Otherwise, it falls back to Claude Code CLI
3. Start coding with your AI agent — watch the character react in real time
4. Click a character to select it, then click a seat to reassign it
5. Click **Layout** to open the office editor and customize your space

## Layout Editor

The built-in editor lets you design your office:

- **Floor** — Full HSB color control
- **Walls** — Auto-tiling walls with color customization
- **Tools** — Select, paint, erase, place, eyedropper, pick
- **Undo/Redo** — 50 levels with Ctrl+Z / Ctrl+Y
- **Export/Import** — Share layouts as JSON files via the Settings modal

The grid is expandable up to 64×64 tiles. Click the ghost border outside the current grid to grow it.

### Office Assets

The office tileset used in this project and available via the extension is **[Office Interior Tileset (16x16)](https://donarg.itch.io/officetileset)** by **Donarg**, available on itch.io for **$2 USD**.

This is the only part of the project that is not freely available. The tileset is not included in this repository due to its license. To use Pixel Agents locally with the full set of office furniture and decorations, purchase the tileset and run the asset import pipeline:

```bash
npm run import-tileset
```

Fair warning: the import pipeline is not exactly straightforward — the out-of-the-box tileset assets aren't the easiest to work with, and while I've done my best to make the process as smooth as possible, it may require some manual tweaking. If you have experience creating pixel art office assets and would like to contribute freely usable tilesets for the community, that would be hugely appreciated.

The extension will still work without the tileset — you'll get the default characters and basic layout, but the full furniture catalog requires the imported assets.

## How It Works

Pixel Agents watches AI agent transcript files to track what each agent is doing:

- **Claude Code**: Watches JSONL transcript files in `~/.claude/projects/`
- **Copilot CLI**: Watches `events.jsonl` in `~/.copilot/session-state/<uuid>/`

When an agent uses a tool (like writing a file or running a command), the extension detects it and updates the character's animation accordingly. No modifications to either CLI are needed — it's purely observational.

### Copilot CLI Integration Details

The Copilot CLI backend uses explicit event signals instead of timer-based heuristics:

| Signal | Copilot CLI Event | Claude Code Approach |
|---|---|---|
| Turn end | `assistant.turn_end` (explicit) | Timer/duration heuristic |
| Permission needed | `tool.user_requested` (explicit) | 7s silence heuristic |
| Tool start | `tool.execution_start` | `assistant.content[tool_use]` |
| Tool complete | `tool.execution_complete` | `user.content[tool_result]` |
| Agent status | `report_intent` tool | N/A |

The `report_intent` tool provides rich status labels (e.g., "Exploring codebase", "Fixing tests") that are displayed as character activity text.

The webview runs a lightweight game loop with canvas rendering, BFS pathfinding, and a character state machine (idle → walk → type/read). Everything is pixel-perfect at integer zoom levels.

## Tech Stack

- **Extension**: TypeScript, VS Code Webview API, esbuild
- **Webview**: React 19, TypeScript, Vite, Canvas 2D
- **Testing**: Vitest (unit), real Copilot CLI fixture-based integration tests

### Running Tests

```bash
npm test              # Run unit tests
npm run test:watch    # Watch mode
```

## Known Limitations

- **Agent-terminal sync** — the way agents are connected to terminal instances is not super robust and sometimes desyncs, especially when terminals are rapidly opened/closed or restored across sessions.
- **Heuristic-based status detection (Claude only)** — Claude Code's JSONL format does not provide clear signals for when an agent is waiting for user input. The Copilot CLI backend resolves this with explicit `assistant.turn_end` and `tool.user_requested` events.
- **No sub-agent streaming (Copilot)** — Copilot CLI's `task` tool doesn't stream nested events from sub-agents, so sub-agent characters show a generic "Running subtask" status.
- **Copilot CLI format not stable** — the `events.jsonl` format may change between Copilot CLI versions. Defensive parsing is used.
- **Windows-focused testing** — the extension has been primarily tested on Windows 11. It should work on macOS/Linux but may have unexpected issues.

## Roadmap

There are several areas where contributions would be very welcome:

- **Improve agent-terminal reliability** — more robust connection and sync between characters and Claude Code instances
- **Better status detection** — find or propose clearer signals for agent state transitions (waiting, done, permission needed)
- **Community assets** — freely usable pixel art tilesets or characters that anyone can use without purchasing third-party assets
- **Agent creation and definition** — define agents with custom skills, system prompts, names, and skins before launching them
- **Desks as directories** — click on a desk to select a working directory, drag and drop agents or click-to-assign to move them to specific desks/projects
- **Claude Code agent teams** — native support for [agent teams](https://code.claude.com/docs/en/agent-teams), visualizing multi-agent coordination and communication
- **Git worktree support** — agents working in different worktrees to avoid conflict from parallel work on the same files
- **Support for other agentic frameworks** — [OpenCode](https://github.com/nichochar/opencode), or really any kind of agentic experiment you'd want to run inside a pixel art interface (see [simile.ai](https://simile.ai/) for inspiration)

If any of these interest you, feel free to open an issue or submit a PR.

## Contributions

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for instructions on how to contribute to this project.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Supporting the Project

If you find Pixel Agents useful, consider supporting its development:

<a href="https://github.com/sponsors/pablodelucca">
  <img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github" alt="GitHub Sponsors">
</a>
<a href="https://ko-fi.com/pablodelucca">
  <img src="https://img.shields.io/badge/Support-Ko--fi-ff5e5b?logo=ko-fi" alt="Ko-fi">
</a>

## License

This project is licensed under the [MIT License](LICENSE).
