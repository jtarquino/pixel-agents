#!/usr/bin/env node
/**
 * Pixel Agents — Get Status
 * Parses active Copilot CLI sessions and outputs a text summary of agent activity.
 * Cross-platform: works on Windows, macOS, Linux.
 *
 * Usage: node get-status.js [--cwd <path>]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_STATE_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const targetCwd = process.argv.includes('--cwd')
	? process.argv[process.argv.indexOf('--cwd') + 1]
	: process.cwd();

function normalizePath(p) {
	return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function findActiveSessions() {
	const sessions = [];
	if (!fs.existsSync(SESSION_STATE_DIR)) { return sessions; }

	const entries = fs.readdirSync(SESSION_STATE_DIR, { withFileTypes: true });
	const normalizedCwd = normalizePath(targetCwd);

	for (const entry of entries) {
		if (!entry.isDirectory()) { continue; }
		const sessionDir = path.join(SESSION_STATE_DIR, entry.name);
		const workspaceYaml = path.join(sessionDir, 'workspace.yaml');
		const eventsJsonl = path.join(sessionDir, 'events.jsonl');

		if (!fs.existsSync(eventsJsonl)) { continue; }

		let sessionCwd = '';
		let summary = '';
		if (fs.existsSync(workspaceYaml)) {
			const content = fs.readFileSync(workspaceYaml, 'utf-8');
			const cwdMatch = content.match(/^cwd:\s*(.+)$/m);
			if (cwdMatch) { sessionCwd = normalizePath(cwdMatch[1].trim()); }
			const summaryMatch = content.match(/^summary:\s*(.+)$/m);
			if (summaryMatch) { summary = summaryMatch[1].trim(); }
		}

		// Check if session was active recently (last 30 minutes)
		const stat = fs.statSync(eventsJsonl);
		const ageMs = Date.now() - stat.mtimeMs;
		const isRecent = ageMs < 30 * 60 * 1000;

		if (sessionCwd === normalizedCwd || process.argv.includes('--all')) {
			sessions.push({
				id: entry.name,
				cwd: sessionCwd,
				summary,
				eventsPath: eventsJsonl,
				isRecent,
				lastModified: stat.mtimeMs,
			});
		}
	}

	return sessions.sort((a, b) => b.lastModified - a.lastModified);
}

function parseSessionStatus(eventsPath) {
	const content = fs.readFileSync(eventsPath, 'utf-8');
	const lines = content.split('\n').filter(l => l.trim());

	let status = 'unknown';
	let lastTool = '';
	let lastIntent = '';
	let toolCount = 0;
	let isWaiting = false;

	for (const line of lines) {
		try {
			const event = JSON.parse(line);
			switch (event.type) {
				case 'assistant.turn_start':
					isWaiting = false;
					break;
				case 'assistant.turn_end':
					isWaiting = true;
					status = 'waiting for input';
					break;
				case 'assistant.message':
					if (event.data?.toolRequests?.length > 0) {
						toolCount += event.data.toolRequests.length;
						for (const req of event.data.toolRequests) {
							if (req.name === 'report_intent' && req.arguments?.intent) {
								lastIntent = req.arguments.intent;
							} else if (req.name) {
								lastTool = formatTool(req.name, req.arguments || {});
							}
						}
						status = 'working';
					}
					break;
				case 'tool.user_requested':
					status = 'waiting for permission';
					break;
				case 'user.message':
					isWaiting = false;
					status = 'processing';
					break;
			}
		} catch { /* skip malformed */ }
	}

	if (isWaiting) { status = 'waiting for input'; }

	return {
		status,
		lastTool,
		lastIntent,
		toolCount,
	};
}

function formatTool(name, args) {
	switch (name) {
		case 'powershell': return `running: ${(args.command || '').slice(0, 40)}`;
		case 'view': return `reading ${path.basename(args.path || '')}`;
		case 'edit': return `editing ${path.basename(args.path || '')}`;
		case 'create': return `creating ${path.basename(args.path || '')}`;
		case 'glob': return 'searching files';
		case 'grep': return 'searching code';
		case 'web_search': return 'searching the web';
		case 'task': return `subtask: ${args.description || 'running'}`;
		default:
			if (name.startsWith('github-mcp-server-')) {
				return `GitHub: ${name.replace('github-mcp-server-', '').replace(/_/g, ' ')}`;
			}
			return `using ${name}`;
	}
}

// Main
const sessions = findActiveSessions();

if (sessions.length === 0) {
	console.log('No active Copilot CLI sessions found for this directory.');
	console.log(`Searched: ${SESSION_STATE_DIR}`);
	console.log(`CWD: ${targetCwd}`);
	process.exit(0);
}

console.log(`Found ${sessions.length} session(s):\n`);

for (let i = 0; i < sessions.length; i++) {
	const s = sessions[i];
	const info = parseSessionStatus(s.eventsPath);
	const recent = s.isRecent ? '🟢' : '⚪';
	const statusEmoji = info.status === 'waiting for input' ? '💬'
		: info.status === 'waiting for permission' ? '🔒'
		: info.status === 'working' ? '⚡'
		: '🔄';

	console.log(`${recent} Agent ${i + 1}: ${statusEmoji} ${info.status}`);
	if (info.lastIntent) { console.log(`   Intent: ${info.lastIntent}`); }
	if (info.lastTool) { console.log(`   Last: ${info.lastTool}`); }
	console.log(`   Tools used: ${info.toolCount}`);
	if (s.summary) { console.log(`   Summary: ${s.summary}`); }
	console.log(`   Session: ${s.id.slice(0, 8)}...`);
	console.log('');
}
