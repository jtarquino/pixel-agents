import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';
import type { AgentState } from './types.js';
import { processCopilotEventLine } from './copilotTranscriptParser.js';
import { FILE_WATCHER_POLL_INTERVAL_MS } from './constants.js';

/**
 * Copilot CLI file watcher — watches events.jsonl in
 * ~/.copilot/session-state/<uuid>/events.jsonl
 *
 * Unlike Claude Code which stores all sessions in one project directory,
 * Copilot CLI stores each session in its own directory with an events.jsonl file.
 */

export function getCopilotSessionDir(): string {
	return path.join(os.homedir(), '.copilot', 'session-state');
}

export function getCopilotEventsPath(sessionId: string): string {
	return path.join(getCopilotSessionDir(), sessionId, 'events.jsonl');
}

export function startCopilotFileWatching(
	agentId: number,
	eventsPath: string,
	agents: Map<number, AgentState>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	webview: vscode.Webview | undefined,
): void {
	// Primary: fs.watch
	try {
		const watcher = fs.watch(eventsPath, () => {
			readCopilotNewLines(agentId, agents, webview);
		});
		fileWatchers.set(agentId, watcher);
	} catch (e) {
		console.log(`[Pixel Agents] fs.watch failed for Copilot agent ${agentId}: ${e}`);
	}

	// Secondary: fs.watchFile (stat-based polling, reliable cross-platform)
	try {
		fs.watchFile(eventsPath, { interval: FILE_WATCHER_POLL_INTERVAL_MS }, () => {
			readCopilotNewLines(agentId, agents, webview);
		});
	} catch (e) {
		console.log(`[Pixel Agents] fs.watchFile failed for Copilot agent ${agentId}: ${e}`);
	}

	// Tertiary: manual poll as last resort
	const interval = setInterval(() => {
		if (!agents.has(agentId)) {
			clearInterval(interval);
			try { fs.unwatchFile(eventsPath); } catch { /* ignore */ }
			return;
		}
		readCopilotNewLines(agentId, agents, webview);
	}, FILE_WATCHER_POLL_INTERVAL_MS);
	pollingTimers.set(agentId, interval);
}

export function readCopilotNewLines(
	agentId: number,
	agents: Map<number, AgentState>,
	webview: vscode.Webview | undefined,
): void {
	const agent = agents.get(agentId);
	if (!agent) { return; }
	try {
		const stat = fs.statSync(agent.jsonlFile);
		if (stat.size <= agent.fileOffset) { return; }

		const buf = Buffer.alloc(stat.size - agent.fileOffset);
		const fd = fs.openSync(agent.jsonlFile, 'r');
		fs.readSync(fd, buf, 0, buf.length, agent.fileOffset);
		fs.closeSync(fd);
		agent.fileOffset = stat.size;

		const text = agent.lineBuffer + buf.toString('utf-8');
		const lines = text.split('\n');
		agent.lineBuffer = lines.pop() || '';

		for (const line of lines) {
			if (!line.trim()) { continue; }
			processCopilotEventLine(agentId, line, agents, webview);
		}
	} catch (e) {
		console.log(`[Pixel Agents] Read error for Copilot agent ${agentId}: ${e}`);
	}
}

/**
 * Scan ~/.copilot/session-state/ for existing sessions that match
 * the given workspace cwd. Returns session IDs (UUIDs) that match.
 */
export function findMatchingCopilotSessions(workspaceCwd: string): string[] {
	const sessionDir = getCopilotSessionDir();
	const matches: string[] = [];

	try {
		const entries = fs.readdirSync(sessionDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) { continue; }
			const workspaceYaml = path.join(sessionDir, entry.name, 'workspace.yaml');
			try {
				const content = fs.readFileSync(workspaceYaml, 'utf-8');
				const cwdMatch = content.match(/^cwd:\s*(.+)$/m);
				if (cwdMatch) {
					const sessionCwd = cwdMatch[1].trim();
					if (normalizePath(sessionCwd) === normalizePath(workspaceCwd)) {
						matches.push(entry.name);
					}
				}
			} catch { /* workspace.yaml may not exist */ }
		}
	} catch { /* session-state dir may not exist */ }

	return matches;
}

function normalizePath(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
