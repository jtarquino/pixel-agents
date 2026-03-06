/**
 * Pixel Agents — Electron Main Process
 *
 * Loads the webview-ui React app, watches Copilot CLI sessions,
 * and sends the same message protocol the VS Code extension uses.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PNG } from 'pngjs';

// ── Constants ────────────────────────────────────────────────
const COPILOT_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const POLL_INTERVAL = 2000;
// __dirname = viewer/dist, so repo root is two levels up
const REPO_ROOT = path.join(__dirname, '..', '..');
const ASSET_DIR = path.join(REPO_ROOT, 'webview-ui', 'public', 'assets');
const PNG_ALPHA_THRESHOLD = 10;
const CHAR_COUNT = 6;
const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 32;
const CHAR_FRAMES_PER_ROW = 7;
const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
const WALL_PIECE_WIDTH = 16;
const WALL_PIECE_HEIGHT = 32;
const WALL_GRID_COLS = 4;
const WALL_BITMASK_COUNT = 16;

// ── Types ────────────────────────────────────────────────────
interface SessionInfo {
  uuid: string;
  eventsPath: string;
  lastOffset: number;
  agentId: number;
  cwd?: string;
  summary?: string;
}

interface CopilotEvent {
  type: string;
  data?: Record<string, unknown>;
  id?: string;
  timestamp?: string;
}

// ── Globals ──────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
const sessions = new Map<string, SessionInfo>();
let nextAgentId = 1;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Asset Loading ────────────────────────────────────────────
function pngToSpriteData(pngBuffer: Buffer, w: number, h: number): string[][] {
  const png = PNG.sync.read(pngBuffer);
  const sprite: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      const i = (y * png.width + x) * 4;
      const a = png.data[i + 3];
      if (a < PNG_ALPHA_THRESHOLD) {
        row.push('');
      } else {
        row.push(`#${png.data[i].toString(16).padStart(2, '0')}${png.data[i + 1].toString(16).padStart(2, '0')}${png.data[i + 2].toString(16).padStart(2, '0')}`.toUpperCase());
      }
    }
    sprite.push(row);
  }
  return sprite;
}

function loadCharacterSprites(): { down: string[][][]; up: string[][][]; right: string[][][] }[] | null {
  const charDir = path.join(ASSET_DIR, 'characters');
  if (!fs.existsSync(charDir)) return null;
  const characters: { down: string[][][]; up: string[][][]; right: string[][][] }[] = [];
  for (let ci = 0; ci < CHAR_COUNT; ci++) {
    const filePath = path.join(charDir, `char_${ci}.png`);
    if (!fs.existsSync(filePath)) return null;
    const png = PNG.sync.read(fs.readFileSync(filePath));
    const charData: { down: string[][][]; up: string[][][]; right: string[][][] } = { down: [], up: [], right: [] };
    for (let dirIdx = 0; dirIdx < CHARACTER_DIRECTIONS.length; dirIdx++) {
      const dir = CHARACTER_DIRECTIONS[dirIdx];
      const rowOffsetY = dirIdx * CHAR_FRAME_H;
      const frames: string[][][] = [];
      for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
        const sprite: string[][] = [];
        const frameOffsetX = f * CHAR_FRAME_W;
        for (let y = 0; y < CHAR_FRAME_H; y++) {
          const row: string[] = [];
          for (let x = 0; x < CHAR_FRAME_W; x++) {
            const idx = ((rowOffsetY + y) * png.width + (frameOffsetX + x)) * 4;
            const a = png.data[idx + 3];
            if (a < PNG_ALPHA_THRESHOLD) {
              row.push('');
            } else {
              row.push(`#${png.data[idx].toString(16).padStart(2, '0')}${png.data[idx + 1].toString(16).padStart(2, '0')}${png.data[idx + 2].toString(16).padStart(2, '0')}`.toUpperCase());
            }
          }
          sprite.push(row);
        }
        frames.push(sprite);
      }
      charData[dir] = frames;
    }
    characters.push(charData);
  }
  return characters;
}

function loadWallTiles(): string[][][] | null {
  const wallPath = path.join(ASSET_DIR, 'walls.png');
  if (!fs.existsSync(wallPath)) return null;
  const png = PNG.sync.read(fs.readFileSync(wallPath));
  const sprites: string[][][] = [];
  for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
    const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
    const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
    const sprite: string[][] = [];
    for (let r = 0; r < WALL_PIECE_HEIGHT; r++) {
      const row: string[] = [];
      for (let c = 0; c < WALL_PIECE_WIDTH; c++) {
        const idx = ((oy + r) * png.width + (ox + c)) * 4;
        const a = png.data[idx + 3];
        if (a < PNG_ALPHA_THRESHOLD) {
          row.push('');
        } else {
          row.push(`#${png.data[idx].toString(16).padStart(2, '0')}${png.data[idx + 1].toString(16).padStart(2, '0')}${png.data[idx + 2].toString(16).padStart(2, '0')}`.toUpperCase());
        }
      }
      sprite.push(row);
    }
    sprites.push(sprite);
  }
  return sprites;
}

function loadDefaultLayout(): Record<string, unknown> | null {
  // 1. Try user's saved layout (~/.pixel-agents/layout.json)
  const savedPath = path.join(os.homedir(), '.pixel-agents', 'layout.json');
  if (fs.existsSync(savedPath)) {
    try {
      const layout = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      console.log(`[Viewer] Loaded saved layout from ${savedPath} (${layout.cols}×${layout.rows})`);
      return layout;
    } catch { /* fall through */ }
  }
  // 2. Fall back to bundled default
  const layoutPath = path.join(ASSET_DIR, 'default-layout.json');
  if (!fs.existsSync(layoutPath)) return null;
  return JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
}

// ── Copilot Session Scanning ─────────────────────────────────
function formatToolStatus(toolName: string, input?: Record<string, unknown>): string {
  switch (toolName) {
    case 'powershell': return `Running: ${(input?.command as string)?.slice(0, 40) || 'command'}`;
    case 'view': return `Reading ${(input?.path as string)?.split(/[/\\]/).pop() || 'file'}`;
    case 'edit': return `Editing ${(input?.path as string)?.split(/[/\\]/).pop() || 'file'}`;
    case 'create': return `Creating ${(input?.path as string)?.split(/[/\\]/).pop() || 'file'}`;
    case 'glob': return 'Searching files';
    case 'grep': return 'Searching code';
    case 'web_search': return 'Searching the web';
    case 'web_fetch': return 'Fetching web content';
    case 'task': return `Subtask: ${(input?.description as string) || 'working'}`;
    case 'ask_user': return 'Waiting for your answer';
    case 'report_intent': return (input?.intent as string) || 'Working';
    case 'sql': return 'Querying database';
    case 'read_powershell': return 'Reading output';
    case 'write_powershell': return 'Sending input';
    case 'stop_powershell': return 'Stopping process';
    case 'read_agent': return 'Checking agent status';
    default:
      if (toolName.startsWith('github-mcp-server-')) {
        return `GitHub: ${toolName.replace('github-mcp-server-', '')}`;
      }
      return `Using ${toolName}`;
  }
}

function readWorkspaceYaml(sessionDir: string): { cwd?: string; summary?: string } {
  const yamlPath = path.join(sessionDir, 'workspace.yaml');
  if (!fs.existsSync(yamlPath)) return {};
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const cwdMatch = content.match(/cwd:\s*(.+)/);
  const summaryMatch = content.match(/^summary:\s*(.+)$/m);
  return {
    cwd: cwdMatch?.[1]?.trim(),
    summary: summaryMatch?.[1]?.trim(),
  };
}

function isSessionActive(sessionDir: string): boolean {
  // Primary: session.db locked by a running Copilot CLI process
  // On Windows, rename fails with EBUSY when file is locked by another process
  const dbPath = path.join(sessionDir, 'session.db');
  if (fs.existsSync(dbPath)) {
    try {
      fs.renameSync(dbPath, dbPath); // same-name rename tests lock without side effects
      // Rename succeeded → not locked → check fallback
    } catch {
      return true; // EBUSY → locked → active CLI process
    }
  }
  // Fallback: workspace.yaml created in the last 60 seconds (session just started, no db yet)
  const yamlPath = path.join(sessionDir, 'workspace.yaml');
  if (fs.existsSync(yamlPath)) {
    const stat = fs.statSync(yamlPath);
    if (Date.now() - stat.mtimeMs < 60_000) return true;
  }
  return false;
}

function discoverSessions(): void {
  if (!fs.existsSync(COPILOT_DIR)) return;

  const entries = fs.readdirSync(COPILOT_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const uuid = entry.name;
    if (sessions.has(uuid)) continue;

    const sessionDir = path.join(COPILOT_DIR, uuid);

    // Only show sessions with an active Copilot CLI process
    if (!isSessionActive(sessionDir)) continue;

    const eventsPath = path.join(sessionDir, 'events.jsonl');
    const { cwd, summary } = readWorkspaceYaml(sessionDir);
    const agentId = nextAgentId++;
    sessions.set(uuid, { uuid, eventsPath, lastOffset: 0, agentId, cwd, summary });

    const folderName = summary || cwd?.split(/[/\\]/).pop() || uuid.slice(0, 8);
    send('agentCreated', { id: agentId, folderName });
    console.log(`[Viewer] Discovered active session ${uuid.slice(0, 8)}... (agent #${agentId}) — ${summary || folderName}`);
  }
}

function processEvents(session: SessionInfo): void {
  if (!fs.existsSync(session.eventsPath)) return;

  const stat = fs.statSync(session.eventsPath);
  if (stat.size <= session.lastOffset) return;

  const content = fs.readFileSync(session.eventsPath, 'utf-8');
  const lines = content.split('\n');
  let currentOffset = 0;

  for (const line of lines) {
    currentOffset += Buffer.byteLength(line, 'utf-8') + 1; // +1 for newline
    if (currentOffset <= session.lastOffset) continue;
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as CopilotEvent;
      processEvent(session, event);
    } catch {
      // skip malformed lines
    }
  }

  session.lastOffset = stat.size;
}

function processEvent(session: SessionInfo, event: CopilotEvent): void {
  const id = session.agentId;
  const data = event.data || {};

  switch (event.type) {
    case 'assistant.turn_start':
      send('agentStatus', { id, status: 'active' });
      send('agentToolsClear', { id });
      break;

    case 'assistant.message': {
      const toolRequests = data.toolRequests as Array<{ name: string; id: string; input?: Record<string, unknown> }> | undefined;
      if (toolRequests) {
        for (const req of toolRequests) {
          const status = formatToolStatus(req.name, req.input);
          if (req.name === 'report_intent') {
            // Just update status label, no tool animation
            send('agentStatus', { id, status: 'active' });
          } else {
            send('agentToolStart', { id, toolId: req.id, status });
          }
        }
      }
      break;
    }

    case 'tool.execution_start': {
      const name = data.name as string | undefined;
      const toolId = data.toolRequestId as string || event.id || '';
      if (name) {
        const status = formatToolStatus(name, data.input as Record<string, unknown>);
        send('agentToolStart', { id, toolId, status });
      }
      break;
    }

    case 'tool.execution_complete': {
      const toolId = data.toolRequestId as string || event.id || '';
      send('agentToolDone', { id, toolId });
      break;
    }

    case 'tool.user_requested':
      send('agentToolPermission', { id });
      break;

    case 'assistant.turn_end':
      send('agentStatus', { id, status: 'waiting' });
      break;

    case 'user.message':
      send('agentStatus', { id, status: 'active' });
      send('agentToolPermissionClear', { id });
      break;
  }
}

// ── Window Messaging ─────────────────────────────────────────
function send(type: string, payload: Record<string, unknown>): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pixel-agents-message', { type, ...payload });
}

// ── App Lifecycle ────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Pixel Agents',
    icon: path.join(REPO_ROOT, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the built webview-ui
  const indexPath = path.join(REPO_ROOT, 'dist', 'webview', 'index.html');
  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    // Fallback: try dev server
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendInitialAssets(): void {
  // Character sprites
  const chars = loadCharacterSprites();
  if (chars) {
    send('characterSpritesLoaded', { characters: chars });
    console.log(`[Viewer] Sent ${chars.length} character sprites`);
  }

  // Wall tiles
  const walls = loadWallTiles();
  if (walls) {
    send('wallTilesLoaded', { sprites: walls });
    console.log(`[Viewer] Sent ${walls.length} wall tiles`);
  }

  // Default layout
  const layout = loadDefaultLayout();
  send('layoutLoaded', { layout: layout || null });
  console.log('[Viewer] Sent layout');

  // Settings — sound disabled for standalone viewer
  send('settingsLoaded', { soundEnabled: false });
}

function startPolling(): void {
  pollTimer = setInterval(() => {
    discoverSessions();
    for (const session of sessions.values()) {
      processEvents(session);
    }
  }, POLL_INTERVAL);

  // Initial scan
  discoverSessions();
  for (const session of sessions.values()) {
    processEvents(session);
  }
}

app.whenReady().then(() => {
  createWindow();

  // IPC handlers
  ipcMain.on('pixel-agents-command', (_event, msg: { type: string }) => {
    if (msg.type === 'webviewReady') {
      console.log('[Viewer] Webview ready, sending assets...');
      sendInitialAssets();

      // Send existing agents
      const agentIds = Array.from(sessions.values()).map(s => s.agentId);
      const folderNames: Record<number, string> = {};
      for (const s of sessions.values()) {
        folderNames[s.agentId] = s.summary || s.cwd?.split(/[/\\]/).pop() || s.uuid.slice(0, 8);
      }
      if (agentIds.length > 0) {
        send('existingAgents', { agents: agentIds, agentMeta: {}, folderNames });
      }

      startPolling();
    }
  });
});

app.on('window-all-closed', () => {
  if (pollTimer) clearInterval(pollTimer);
  app.quit();
});
