/**
 * Demo script: creates multiple fake Copilot CLI sessions
 * so the Pixel Agents extension shows several characters with varied activity.
 *
 * Usage: npx tsx scripts/demo-agents.ts
 *
 * Creates 4 sessions in ~/.copilot/session-state/ that simulate different agent activities.
 * The extension picks them up when you click "+ Agent" or on webviewReady if terminals match.
 *
 * For the extension demo: run this script, then in the Extension Dev Host,
 * press "+ Agent" 4 times (each spawns a copilot --resume <uuid> terminal).
 * OR: use the auto-demo which writes events for you.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const CWD = process.cwd();

interface DemoAgent {
	name: string;
	events: Array<{ type: string; data: Record<string, unknown> }>;
	delayMs: number; // delay between events
}

function uuid(): string { return crypto.randomUUID(); }
function ts(offsetMs = 0): string { return new Date(Date.now() + offsetMs).toISOString(); }

// Agent 1: Developer searching code and editing files
const agent1: DemoAgent = {
	name: 'Code Explorer',
	delayMs: 800,
	events: [
		{ type: 'session.start', data: { sessionId: '', version: 1, producer: 'copilot-agent', startTime: ts(), context: { cwd: CWD } } },
		{ type: 'user.message', data: { content: 'Find all TODO comments and fix them', transformedContent: 'Find all TODO comments and fix them', attachments: [] } },
		{ type: 'assistant.turn_start', data: { turnId: '0' } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: uuid(), name: 'report_intent', arguments: { intent: 'Searching for TODOs' }, type: 'function' },
			{ toolCallId: 'grep-1', name: 'grep', arguments: { pattern: 'TODO', path: '.' }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'grep-1', toolName: 'grep', arguments: { pattern: 'TODO' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'grep-1', success: true, result: { content: 'Found 5 TODOs' } } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: 'edit-1', name: 'edit', arguments: { path: path.join(CWD, 'src', 'main.ts') }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'edit-1', toolName: 'edit', arguments: { path: 'src/main.ts' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'edit-1', success: true, result: { content: 'File edited' } } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: 'edit-2', name: 'edit', arguments: { path: path.join(CWD, 'src', 'utils.ts') }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'edit-2', toolName: 'edit', arguments: { path: 'src/utils.ts' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'edit-2', success: true, result: { content: 'File edited' } } },
		{ type: 'assistant.turn_end', data: { turnId: '0' } },
	],
};

// Agent 2: Running tests and debugging
const agent2: DemoAgent = {
	name: 'Test Runner',
	delayMs: 1200,
	events: [
		{ type: 'session.start', data: { sessionId: '', version: 1, producer: 'copilot-agent', startTime: ts(), context: { cwd: CWD } } },
		{ type: 'user.message', data: { content: 'Run the tests and fix any failures', transformedContent: 'Run the tests and fix any failures', attachments: [] } },
		{ type: 'assistant.turn_start', data: { turnId: '0' } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: uuid(), name: 'report_intent', arguments: { intent: 'Running test suite' }, type: 'function' },
			{ toolCallId: 'ps-1', name: 'powershell', arguments: { command: 'npm test' }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'ps-1', toolName: 'powershell', arguments: { command: 'npm test' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'ps-1', success: true, result: { content: '28 tests passed' } } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: uuid(), name: 'report_intent', arguments: { intent: 'Fixing failing test' }, type: 'function' },
			{ toolCallId: 'view-1', name: 'view', arguments: { path: path.join(CWD, 'src', '__tests__', 'parser.test.ts') }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'view-1', toolName: 'view', arguments: { path: 'parser.test.ts' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'view-1', success: true, result: { content: 'test file...' } } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: 'edit-3', name: 'edit', arguments: { path: path.join(CWD, 'src', '__tests__', 'parser.test.ts') }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'edit-3', toolName: 'edit', arguments: { path: 'parser.test.ts' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'edit-3', success: true, result: { content: 'Fixed' } } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: 'ps-2', name: 'powershell', arguments: { command: 'npm test -- --reporter=verbose' }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'ps-2', toolName: 'powershell', arguments: { command: 'npm test' } } },
	],
};

// Agent 3: Researching on GitHub
const agent3: DemoAgent = {
	name: 'Researcher',
	delayMs: 1000,
	events: [
		{ type: 'session.start', data: { sessionId: '', version: 1, producer: 'copilot-agent', startTime: ts(), context: { cwd: CWD } } },
		{ type: 'user.message', data: { content: 'Find similar projects and compare approaches', transformedContent: 'Find similar projects and compare approaches', attachments: [] } },
		{ type: 'assistant.turn_start', data: { turnId: '0' } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: uuid(), name: 'report_intent', arguments: { intent: 'Exploring similar repos' }, type: 'function' },
			{ toolCallId: 'gh-1', name: 'github-mcp-server-search_repositories', arguments: { query: 'pixel agents vscode' }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'gh-1', toolName: 'github-mcp-server-search_repositories', arguments: { query: 'pixel agents' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'gh-1', success: true, result: { content: 'Found repos' } } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: 'web-1', name: 'web_search', arguments: { query: 'VS Code extension animated characters' }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'web-1', toolName: 'web_search', arguments: { query: 'VS Code extension animated characters' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'web-1', success: true, result: { content: 'Results...' } } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: 'web-2', name: 'web_fetch', arguments: { url: 'https://marketplace.visualstudio.com/search?term=pixel' }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'web-2', toolName: 'web_fetch', arguments: { url: 'https://example.com' } } },
	],
};

// Agent 4: Waiting for permission (shows speech bubble)
const agent4: DemoAgent = {
	name: 'Careful Worker',
	delayMs: 600,
	events: [
		{ type: 'session.start', data: { sessionId: '', version: 1, producer: 'copilot-agent', startTime: ts(), context: { cwd: CWD } } },
		{ type: 'user.message', data: { content: 'Deploy to production', transformedContent: 'Deploy to production', attachments: [] } },
		{ type: 'assistant.turn_start', data: { turnId: '0' } },
		{ type: 'assistant.message', data: { messageId: uuid(), content: '', toolRequests: [
			{ toolCallId: uuid(), name: 'report_intent', arguments: { intent: 'Preparing deployment' }, type: 'function' },
			{ toolCallId: 'view-2', name: 'view', arguments: { path: path.join(CWD, 'package.json') }, type: 'function' },
		] } },
		{ type: 'tool.execution_start', data: { toolCallId: 'view-2', toolName: 'view', arguments: { path: 'package.json' } } },
		{ type: 'tool.execution_complete', data: { toolCallId: 'view-2', success: true, result: { content: '...' } } },
		{ type: 'tool.user_requested', data: { toolCallId: uuid(), toolName: 'powershell', arguments: { command: 'npm run deploy --production' } } },
		{ type: 'assistant.turn_end', data: { turnId: '0' } },
	],
};

const agents = [agent1, agent2, agent3, agent4];

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function writeAgentEvents(agent: DemoAgent, sessionId: string) {
	const sessionDir = path.join(SESSION_DIR, sessionId);
	fs.mkdirSync(sessionDir, { recursive: true });

	// Write workspace.yaml
	fs.writeFileSync(
		path.join(sessionDir, 'workspace.yaml'),
		`id: ${sessionId}\ncwd: ${CWD}\nsummary: ${agent.name}\nsummary_count: 1\ncreated_at: ${ts()}\nupdated_at: ${ts()}\n`,
	);

	const eventsPath = path.join(sessionDir, 'events.jsonl');
	fs.writeFileSync(eventsPath, ''); // Create empty file first

	console.log(`  📝 Writing ${agent.events.length} events (${agent.delayMs}ms apart)...`);

	for (let i = 0; i < agent.events.length; i++) {
		const event = agent.events[i];
		if (event.type === 'session.start') {
			(event.data as Record<string, unknown>).sessionId = sessionId;
		}
		const line = JSON.stringify({
			...event,
			id: uuid(),
			timestamp: ts(i * agent.delayMs),
			parentId: null,
		});
		fs.appendFileSync(eventsPath, line + '\n');
		await sleep(agent.delayMs);
	}
}

async function main() {
	console.log('🎮 Pixel Agents Demo — Spawning 4 simulated Copilot CLI sessions\n');
	console.log(`📁 Session dir: ${SESSION_DIR}`);
	console.log(`📂 CWD: ${CWD}\n`);

	const sessionIds: string[] = [];

	for (let i = 0; i < agents.length; i++) {
		const sid = uuid();
		sessionIds.push(sid);
		console.log(`🤖 Agent ${i + 1} (${agents[i].name}): ${sid}`);
	}

	console.log('\n⏳ Writing events in parallel (staggered)...\n');

	// Write all agents in parallel with slight stagger
	const promises = agents.map((agent, i) =>
		sleep(i * 500).then(() => {
			console.log(`  🚀 Starting ${agent.name}...`);
			return writeAgentEvents(agent, sessionIds[i]);
		}),
	);

	await Promise.all(promises);

	console.log('\n✅ All 4 agents created!\n');
	console.log('📋 To see them in the extension:');
	console.log('   1. Press F5 to launch Extension Development Host');
	console.log('   2. Open the "Pixel Agents" panel');
	console.log('   3. Click "+ Agent" 4 times — each will spawn a copilot --resume <uuid>');
	console.log('   4. The characters will animate based on the simulated events\n');
	console.log('📋 Session IDs for manual testing:');
	sessionIds.forEach((sid, i) => {
		console.log(`   Agent ${i + 1} (${agents[i].name}): copilot --resume ${sid}`);
	});

	console.log('\n🧹 To clean up, delete the session dirs:');
	sessionIds.forEach(sid => {
		console.log(`   rm -rf "${path.join(SESSION_DIR, sid)}"`);
	});
}

main().catch(e => {
	console.error('💥 Demo failed:', e);
	process.exit(1);
});
