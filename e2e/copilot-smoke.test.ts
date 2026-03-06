/**
 * Copilot CLI Smoke Test
 *
 * Validates that the Copilot transcript parser works with REAL Copilot CLI output.
 * Requires: copilot CLI authenticated and on PATH.
 *
 * Run: npx tsx e2e/copilot-smoke.test.ts
 *
 * This test:
 * 1. Generates a UUID
 * 2. Runs `copilot --resume <uuid> -p "what is 2+2" -s`
 * 3. Waits for events.jsonl to appear
 * 4. Feeds real events through the parser
 * 5. Asserts meaningful messages were emitted
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { execSync, spawn } from 'child_process';

// Import parser (relative to src)
import { processCopilotEventLine, formatCopilotToolStatus } from '../src/copilotTranscriptParser.js';

// Minimal mock for AgentState and vscode.Webview
interface MockAgentState {
	id: number;
	terminalRef: Record<string, unknown>;
	projectDir: string;
	jsonlFile: string;
	fileOffset: number;
	lineBuffer: string;
	activeToolIds: Set<string>;
	activeToolStatuses: Map<string, string>;
	activeToolNames: Map<string, string>;
	activeSubagentToolIds: Map<string, Set<string>>;
	activeSubagentToolNames: Map<string, Map<string, string>>;
	isWaiting: boolean;
	permissionSent: boolean;
	hadToolsInTurn: boolean;
}

const messages: Array<Record<string, unknown>> = [];
const mockWebview = {
	postMessage: (msg: Record<string, unknown>) => {
		messages.push(msg);
		return true;
	},
};

async function main() {
	console.log('🔍 Copilot CLI Smoke Test');
	console.log('========================\n');

	// 1. Check if copilot is available
	try {
		execSync('copilot --version', { stdio: 'pipe' });
		console.log('✅ Copilot CLI found on PATH');
	} catch {
		console.log('❌ Copilot CLI not found on PATH. Skipping smoke test.');
		process.exit(0);
	}

	// 2. Generate UUID
	const sessionId = crypto.randomUUID();
	const sessionDir = path.join(os.homedir(), '.copilot', 'session-state', sessionId);
	const eventsPath = path.join(sessionDir, 'events.jsonl');
	console.log(`📝 Session ID: ${sessionId}`);
	console.log(`📁 Events path: ${eventsPath}\n`);

	// 3. Run copilot with a simple prompt
	console.log('🚀 Launching: copilot --resume <uuid> -p "what is 2+2" -s');
	const child = spawn('copilot', ['--resume', sessionId, '-p', 'what is 2+2', '-s'], {
		stdio: 'pipe',
		shell: true,
	});

	let stdout = '';
	child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
	child.stderr?.on('data', (data: Buffer) => { /* ignore stderr */ });

	// 4. Wait for events.jsonl to appear (max 30s)
	console.log('⏳ Waiting for events.jsonl...');
	const startTime = Date.now();
	const timeout = 60_000;

	while (!fs.existsSync(eventsPath) && Date.now() - startTime < timeout) {
		await new Promise(resolve => setTimeout(resolve, 500));
	}

	if (!fs.existsSync(eventsPath)) {
		console.log('❌ events.jsonl never appeared after 60s');
		child.kill();
		process.exit(1);
	}
	console.log(`✅ events.jsonl found (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`);

	// 5. Wait for the process to complete (max 60s more)
	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			child.kill();
			resolve();
		}, timeout);
		child.on('close', () => {
			clearTimeout(timer);
			resolve();
		});
	});

	// 6. Read and parse events
	const content = fs.readFileSync(eventsPath, 'utf-8');
	const lines = content.split('\n').filter(l => l.trim());
	console.log(`📊 Total events: ${lines.length}`);

	const agents = new Map<number, MockAgentState>();
	agents.set(1, {
		id: 1,
		terminalRef: {},
		projectDir: sessionDir,
		jsonlFile: eventsPath,
		fileOffset: 0,
		lineBuffer: '',
		activeToolIds: new Set(),
		activeToolStatuses: new Map(),
		activeToolNames: new Map(),
		activeSubagentToolIds: new Map(),
		activeSubagentToolNames: new Map(),
		isWaiting: false,
		permissionSent: false,
		hadToolsInTurn: false,
	});

	for (const line of lines) {
		try {
			processCopilotEventLine(1, line, agents as any, mockWebview as any);
		} catch (e) {
			console.log(`⚠️  Parse error on line: ${e}`);
		}
	}

	// 7. Report results
	console.log(`\n📬 Messages emitted: ${messages.length}`);

	const eventTypes = lines.map(l => {
		try { return JSON.parse(l).type; } catch { return 'unknown'; }
	});
	const typeCounts: Record<string, number> = {};
	for (const t of eventTypes) {
		typeCounts[t] = (typeCounts[t] || 0) + 1;
	}
	console.log('\n📋 Event type breakdown:');
	for (const [type, count] of Object.entries(typeCounts).sort()) {
		console.log(`   ${type}: ${count}`);
	}

	const msgTypes: Record<string, number> = {};
	for (const m of messages) {
		const t = m.type as string;
		msgTypes[t] = (msgTypes[t] || 0) + 1;
	}
	console.log('\n📋 Message type breakdown:');
	for (const [type, count] of Object.entries(msgTypes).sort()) {
		console.log(`   ${type}: ${count}`);
	}

	// 8. Assertions
	let passed = 0;
	let failed = 0;

	function assert(condition: boolean, msg: string) {
		if (condition) {
			console.log(`  ✅ ${msg}`);
			passed++;
		} else {
			console.log(`  ❌ ${msg}`);
			failed++;
		}
	}

	console.log('\n🧪 Assertions:');
	assert(lines.length > 0, 'At least one event in events.jsonl');
	assert(eventTypes.includes('session.start'), 'Has session.start event');
	assert(eventTypes.includes('assistant.turn_end'), 'Has assistant.turn_end event');
	assert(messages.length > 0, 'Parser emitted at least one message');
	assert(messages.some(m => m.type === 'agentStatus'), 'Has agentStatus message');
	assert(
		messages.some(m => m.type === 'agentStatus' && m.status === 'waiting'),
		'Has agentStatus:waiting (turn ended)',
	);

	console.log(`\n${passed} passed, ${failed} failed`);

	// Cleanup
	try {
		fs.rmSync(sessionDir, { recursive: true, force: true });
		console.log('🧹 Cleaned up session directory');
	} catch { /* ignore */ }

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error('💥 Smoke test crashed:', e);
	process.exit(1);
});
