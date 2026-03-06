# Pixel Agents → Copilot CLI: Implementation Plan

## Problem Statement

[pixel-agents](https://github.com/pablodelucca/pixel-agents) is a VS Code extension that visualizes AI coding agents (currently Claude Code only) as animated pixel art characters in a virtual office. The goal is to create a fork at `jtarquino/pixel-agents` that adds GitHub Copilot CLI support, allowing Copilot CLI sessions to be visualized with the same pixel art characters.

## Architecture Analysis

### Current System (Claude Code)
| Component | File | Claude-Specific Logic |
|---|---|---|
| Transcript parsing | `src/transcriptParser.ts` | Reads `assistant`/`user`/`system`/`progress` JSONL records |
| File watching | `src/fileWatcher.ts` | Watches `~/.claude/projects/<hash>/<session>.jsonl` |
| Agent lifecycle | `src/agentManager.ts` | Launches `claude --session-id <uuid>` terminals |
| Timer/permission | `src/timerManager.ts` | 7s silence heuristic for permission detection |
| View provider | `src/PixelAgentsViewProvider.ts` | Wires everything together |
| Webview (React) | `webview-ui/src/` | **Backend-agnostic** — receives generic messages |

### Target System (Copilot CLI)
| Aspect | Copilot CLI |
|---|---|
| Session location | `~/.copilot/session-state/<uuid>/events.jsonl` |
| Metadata | `~/.copilot/session-state/<uuid>/workspace.yaml` (contains `cwd`) |
| Event types | `session.start`, `user.message`, `assistant.message` (with `toolRequests[]`), `assistant.turn_start`, `assistant.turn_end`, `tool.execution_start`, `tool.execution_complete`, `tool.user_requested`, `session.info`, `session.compaction_start/complete` |
| Terminal launch | **`copilot --resume <uuid>`** — starts a new session with a pre-generated UUID (analogous to Claude's `--session-id`) |
| Session management | `/session` (show info), `/resume` (switch sessions), `/rename` (rename session) |
| Tool names | `powershell`, `view`, `edit`, `create`, `glob`, `grep`, `task`, `web_search`, `web_fetch`, `ask_user`, `report_intent`, `sql`, `read_powershell`, `write_powershell`, `stop_powershell`, `read_agent`, `github-mcp-server-*`, etc. |
| Turn end signal | `assistant.turn_end` (explicit event — no timer heuristic needed) |
| Permission signal | `tool.user_requested` (explicit event — not silence-based) |
| Additional flags | `--allow-all-tools` (auto-approve), `--model <model>` (select AI model), `--add-dir <dir>` |

### Key Event Format Mapping

```
Claude Code                          → Copilot CLI
─────────────────────────────────────────────────────────
assistant.content[tool_use]          → assistant.message.toolRequests[]
user.content[tool_result]            → tool.execution_complete
system(turn_duration)                → assistant.turn_end
progress(agent_progress)             → (no nested sub-agent streaming)
N/A                                  → tool.user_requested (explicit permission)
N/A                                  → tool.execution_start (explicit start)
N/A                                  → report_intent tool (agent status labels)
```

---

## Model Evaluation Consensus

Three AI models (Gemini, Codex, Opus) independently evaluated this plan. Here's the synthesis:

### ✅ All Three Agree On
1. **Webview needs zero changes** — the message protocol (`agentToolStart`/`agentToolDone`/`agentStatus`) is already backend-agnostic
2. **~~Session discovery is the hardest problem~~** → **RESOLVED**: `copilot --resume <uuid>` allows pre-generating session IDs, same pattern as Claude's `--session-id`
3. **Phase 2 (full abstraction) is premature** — over-engineered for only 2 backends; a simpler approach is better
4. **Tests should be written alongside code**, not deferred to a final phase
5. **Copilot's `events.jsonl` format is not a stable API** — defensive parsing and version checking needed
6. **Unit tests on the transcript parser have the highest ROI**

### ⚠️ Disagreement Points
| Topic | Gemini (8/10) | Codex (7/10) | Opus (7/10) |
|---|---|---|---|
| **Abstraction approach** | Formal interface/strategy | Shared event schema | Fork-and-replace (copy files) |
| **Session discovery** | Watch parent dir + parse workspace.yaml | In-memory transport | ~~Snapshot-diff~~ → **RESOLVED with `--resume <uuid>`** |
| **Sub-agent support** | Assumes same as Claude | Flags as risk | Confirms no nested streaming in Copilot |
| **report_intent** | Not mentioned | Not mentioned | **Recommends using as UX status labels** ✨ |
| **Terminal scraping** | Suggests as fallback | Not mentioned | Not recommended |

### 📋 Adopted Decisions
Based on the consensus + new findings:
- **Fork-and-replace** approach (Opus): copy backend files into `copilot/` variants, single config toggle
- **`copilot --resume <uuid>`** for session bonding: extension generates UUID, launches terminal, watches `~/.copilot/session-state/<uuid>/events.jsonl` — identical to Claude's pattern
- **`report_intent` as status labels** (Opus): use intent text for character activity labels
- **Tests alongside code** (all three): not deferred to Phase 5
- **Explicit signals** over heuristics: `assistant.turn_end` and `tool.user_requested` replace timer-based detection

---

## Implementation Plan

### Phase 1: Fork & CI Setup
- [ ] Fork `pablodelucca/pixel-agents` → `jtarquino/pixel-agents`
- [ ] Clone locally to `C:\jtarquino\PixelAgent`
- [ ] Create branch `copilot-cli-support`
- [ ] Add GitHub Actions CI workflow: `npm run check-types && npm run lint && npm run build`
- [ ] Verify CI passes on the unmodified codebase

**Validation**: CI green on push ✅

### Phase 2: Copilot Transcript Parser
- [ ] Create `src/copilotTranscriptParser.ts`
  - Map `assistant.message` → `agentToolStart` for each `toolRequest`
  - Map `tool.execution_complete` → `agentToolDone` (with 300ms delay)
  - Map `assistant.turn_end` → `agentStatus: 'waiting'`
  - Map `tool.user_requested` → permission bubble
  - Map `report_intent` tool → status label (not animation)
  - Map `task` tool → sub-agent character creation
- [ ] Create Copilot `formatToolStatus()`:
  - `powershell` → "Running: ..." (typing animation)
  - `view` → "Reading ..." (reading animation)
  - `edit`/`create` → "Editing ..." (typing animation)
  - `glob`/`grep` → "Searching..." (reading animation)
  - `web_search`/`web_fetch` → "Searching web" (reading animation)
  - `task` → "Subtask: ..." (sub-agent)
  - `ask_user` → "Waiting for your answer" (permission bubble)
  - `report_intent` → show intent text as label
  - `sql` → "Querying database" (typing animation)
- [ ] Create `src/__tests__/copilotTranscriptParser.test.ts` with fixture JSONL data
  - Test: `assistant.message` with `toolRequests[]` → emits `agentToolStart`
  - Test: `tool.execution_complete` → emits `agentToolDone`
  - Test: `assistant.turn_end` → emits `agentStatus: 'waiting'`
  - Test: `tool.user_requested` → emits permission event
  - Test: `report_intent` → updates status, no animation

**Validation**: Unit tests pass, `npm run check-types` passes ✅

### Phase 3: Copilot File Watcher & Session Discovery
- [ ] Create `src/copilotFileWatcher.ts`
  - Watch `~/.copilot/session-state/<uuid>/events.jsonl` (known path from pre-generated UUID)
  - Implement hybrid `fs.watch` + polling (same strategy as current, adapted for Copilot path structure)
  - Also scan `~/.copilot/session-state/` for existing sessions matching current workspace `cwd` (via `workspace.yaml`)
- [ ] Create `src/copilotAgentManager.ts`
  - Generate UUID with `crypto.randomUUID()`
  - Launch terminal with **`copilot --resume <uuid>`** (creates new session with known ID)
  - Watch `~/.copilot/session-state/<uuid>/events.jsonl` — path is deterministic, no discovery needed
  - Agent persistence to `workspaceState`
  - Session restore: match persisted session UUIDs to existing `~/.copilot/session-state/<uuid>/` dirs
- [ ] Create `src/__tests__/copilotFileWatcher.test.ts`
  - Test: watches correct events.jsonl path for given UUID
  - Test: discovers existing sessions matching workspace cwd
  - Test: handles session dir creation delay (polling)

**Validation**: Unit tests pass, `npm run check-types` passes ✅

### Phase 4: Integration & Config Toggle
- [ ] Add `AGENT_BACKEND` constant to `src/constants.ts` (`'claude' | 'copilot' | 'auto'`)
- [ ] Update `PixelAgentsViewProvider.ts` to wire correct backend based on config
- [ ] Auto-detect: check for `copilot` on PATH → use Copilot backend; check for `claude` → use Claude backend
- [ ] Add VS Code setting `pixel-agents.backend` for manual override
- [ ] Update `extension.ts` with new command registrations if needed
- [ ] Ensure webview message format identical for both backends

**Validation**: Build succeeds, extension activates without error ✅

### Phase 5: Multi-Layer Automated Validation
This phase ensures the extension **actually works visually** without human intervention, using 4 validation layers:

#### Layer 1: Unit Tests (vitest)
- [ ] Add `vitest` test runner to the project
- [ ] `src/__tests__/copilotTranscriptParser.test.ts` — feed fixture JSONL → assert webview messages
- [ ] `src/__tests__/copilotFileWatcher.test.ts` — temp dirs → assert discovery and watching
- [ ] Snapshot test: parse a captured real `events.jsonl` → snapshot full message sequence

#### Layer 2: Standalone Webview Visual Test (Playwright + Vite dev server)
The webview is a React/Vite app. It can run standalone in a browser with a mock VS Code API.
- [ ] Create `webview-ui/src/mockVscodeApi.ts` — mock `acquireVsCodeApi` for browser use
- [ ] Create `e2e/fixtures/copilot-events.jsonl` — captured from a real Copilot CLI session
- [ ] Create `e2e/eventReplay.ts` — reads fixture JSONL, posts events to the webview via `window.postMessage` at realistic intervals
- [ ] Create `e2e/webview-visual.spec.ts` (Playwright):
  1. Start Vite dev server (`npm run dev` in `webview-ui/`)
  2. Open `http://localhost:5173` in Playwright browser
  3. Inject mock VS Code API + replay fixture events
  4. Wait for characters to appear on canvas
  5. **Screenshot the canvas** → `toMatchSnapshot('agents-active.png')` (visual regression)
  6. Replay `assistant.turn_end` → verify character goes to idle state
  7. **Screenshot idle state** → `toMatchSnapshot('agents-idle.png')`
- [ ] Add npm script: `npm run test:visual` → starts Vite, runs Playwright, stops Vite

#### Layer 3: VS Code Integration Test (@vscode/test-electron)
- [ ] Create `e2e/vscode-integration.test.ts`:
  1. Launch VS Code with the extension installed (headless/CI-friendly)
  2. Create temp `~/.copilot/session-state/<uuid>/` directory with `workspace.yaml` and empty `events.jsonl`
  3. Execute `pixel-agents.showPanel` command
  4. Append events to `events.jsonl` from fixture file
  5. Assert extension detected the session (via extension API output channel logs)
  6. Assert no unhandled errors
- [ ] This validates the backend pipeline: file watcher → transcript parser → webview message dispatch

#### Layer 4: Live Copilot CLI Smoke Test
- [ ] Create `e2e/copilot-smoke.test.ts` — full end-to-end:
  1. Generate UUID
  2. Run `copilot --resume <uuid> -p "what is 2+2" --allow-all-tools -s` (non-interactive, silent)
  3. Wait for `~/.copilot/session-state/<uuid>/events.jsonl` to appear
  4. Feed the real events through the Copilot transcript parser
  5. Assert: at least one `agentToolStart` and one `assistant.turn_end` message emitted
  6. **This proves the parser handles real Copilot CLI output, not just fixtures**
- [ ] This test requires Copilot CLI auth — mark as `@smoke` tag, run manually or in authenticated CI

#### CI Pipeline (GitHub Actions)
```yaml
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest  # Also test on windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install && cd webview-ui && npm install && cd ..
      - run: npm run check-types      # TypeScript
      - run: npm run lint              # ESLint
      - run: npm run build             # Full build (esbuild + vite)
      - run: npm test                  # Layer 1: Unit tests
      - run: npx playwright install --with-deps chromium
      - run: npm run test:visual       # Layer 2: Visual tests
      # Layer 3 & 4 run on manual trigger or authenticated runners
```

**Validation**: CI green + visual snapshots match baselines + smoke test passes ✅

### Phase 6: Documentation & Polish
- [ ] Update README.md with Copilot CLI support documentation
- [ ] Add COPILOT.md instructions file for the extension
- [ ] Update package.json metadata for the fork
- [ ] PR to upstream with optional contribution if appropriate

**Validation**: README accurate, extension installable ✅

---

## Tool Name → Animation Mapping (Copilot CLI)

| Copilot Tool | Animation | Status Text |
|---|---|---|
| `powershell` | Typing | `Running: <command>` |
| `view` | Reading | `Reading <file>` |
| `edit` | Typing | `Editing <file>` |
| `create` | Typing | `Creating <file>` |
| `glob` | Reading | `Searching files` |
| `grep` | Reading | `Searching code` |
| `web_search` | Reading | `Searching the web` |
| `web_fetch` | Reading | `Fetching web content` |
| `task` | Sub-agent spawn | `Subtask: <description>` |
| `ask_user` | Permission bubble | `Waiting for your answer` |
| `report_intent` | No animation (label only) | `<intent text>` |
| `sql` | Typing | `Querying database` |
| `read_powershell` | Reading | `Reading output` |
| `write_powershell` | Typing | `Sending input` |
| `stop_powershell` | Typing | `Stopping process` |
| `read_agent` | Reading | `Checking agent status` |
| `github-mcp-server-*` | Reading | `Using GitHub: <action>` |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Copilot CLI events.jsonl format changes | Extension breaks | Check `data.version` in `session.start`, defensive parsing |
| Session dir creation delay | Agent appears before events start | Poll `events.jsonl` with same 1s interval as Claude |
| No sub-agent streaming events | Sub-agent characters show as "active" without tool detail | Document limitation, show generic "Running subtask" |
| Multiple Copilot sessions for same workspace | Agent confusion | Track all matching sessions, bond latest to newest agent |
| Windows path normalization | Session cwd mismatch | Normalize paths before comparison (lowercase, consistent separators) |
| `--resume <uuid>` behavior change | Session bonding breaks | Version-check Copilot CLI, fall back to workspace.yaml scanning |

---

## Progress Tracking

| Phase | Status | Notes |
|---|---|---|
| Phase 1: Fork & CI | 🔴 Not started | |
| Phase 2: Transcript Parser | 🔴 Not started | |
| Phase 3: File Watcher & Discovery | 🔴 Not started | |
| Phase 4: Integration & Config | 🔴 Not started | |
| Phase 5: Testing & CI | 🔴 Not started | |
| Phase 6: Documentation | 🔴 Not started | |
