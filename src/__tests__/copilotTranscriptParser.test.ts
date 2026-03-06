import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { processCopilotEventLine, formatCopilotToolStatus } from '../copilotTranscriptParser.js';
import type { AgentState } from '../types.js';

// Mock vscode module
vi.mock('vscode', () => ({}));

function createMockAgent(id: number): AgentState {
	return {
		id,
		terminalRef: {} as AgentState['terminalRef'],
		projectDir: '/tmp/test',
		jsonlFile: '/tmp/test/events.jsonl',
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
	};
}

function createMockWebview() {
	const messages: Array<Record<string, unknown>> = [];
	return {
		messages,
		postMessage: vi.fn((msg: Record<string, unknown>) => {
			messages.push(msg);
			return true;
		}),
	};
}

describe('formatCopilotToolStatus', () => {
	it('formats powershell tool with command', () => {
		expect(formatCopilotToolStatus('powershell', { command: 'npm install' }))
			.toBe('Running: npm install');
	});

	it('truncates long powershell commands', () => {
		const longCmd = 'a'.repeat(50);
		const result = formatCopilotToolStatus('powershell', { command: longCmd });
		expect(result.length).toBeLessThan(50);
		expect(result).toContain('…');
	});

	it('formats view tool', () => {
		expect(formatCopilotToolStatus('view', { path: '/home/user/src/main.ts' }))
			.toBe('Reading main.ts');
	});

	it('formats edit tool', () => {
		expect(formatCopilotToolStatus('edit', { path: '/src/utils.ts' }))
			.toBe('Editing utils.ts');
	});

	it('formats create tool', () => {
		expect(formatCopilotToolStatus('create', { path: '/src/new.ts' }))
			.toBe('Creating new.ts');
	});

	it('formats glob tool', () => {
		expect(formatCopilotToolStatus('glob', {})).toBe('Searching files');
	});

	it('formats grep tool', () => {
		expect(formatCopilotToolStatus('grep', {})).toBe('Searching code');
	});

	it('formats web_search tool', () => {
		expect(formatCopilotToolStatus('web_search', {})).toBe('Searching the web');
	});

	it('formats task tool with description', () => {
		expect(formatCopilotToolStatus('task', { description: 'Run tests' }))
			.toBe('Subtask: Run tests');
	});

	it('formats ask_user tool', () => {
		expect(formatCopilotToolStatus('ask_user', {})).toBe('Waiting for your answer');
	});

	it('formats report_intent with intent text', () => {
		expect(formatCopilotToolStatus('report_intent', { intent: 'Exploring codebase' }))
			.toBe('Exploring codebase');
	});

	it('formats sql tool', () => {
		expect(formatCopilotToolStatus('sql', {})).toBe('Querying database');
	});

	it('formats github MCP tools', () => {
		expect(formatCopilotToolStatus('github-mcp-server-search_repositories', {}))
			.toBe('GitHub: search repositories');
	});

	it('formats unknown tools', () => {
		expect(formatCopilotToolStatus('custom_tool', {})).toBe('Using custom_tool');
	});
});

describe('processCopilotEventLine', () => {
	let agents: Map<number, AgentState>;
	let webview: ReturnType<typeof createMockWebview>;
	const agentId = 1;

	beforeEach(() => {
		agents = new Map();
		agents.set(agentId, createMockAgent(agentId));
		webview = createMockWebview();
	});

	it('handles assistant.turn_start — sets agent active', () => {
		const event = {
			type: 'assistant.turn_start',
			data: { turnId: '0' },
			id: 'test-1',
			timestamp: '2026-03-06T17:00:00Z',
		};
		processCopilotEventLine(agentId, JSON.stringify(event), agents, webview as unknown as import('vscode').Webview);

		const agent = agents.get(agentId)!;
		expect(agent.isWaiting).toBe(false);
		expect(webview.postMessage).toHaveBeenCalledWith({
			type: 'agentStatus',
			id: agentId,
			status: 'active',
		});
	});

	it('handles assistant.message with toolRequests — emits agentToolStart', () => {
		const event = {
			type: 'assistant.message',
			data: {
				messageId: 'msg-1',
				content: '',
				toolRequests: [
					{
						toolCallId: 'tool-1',
						name: 'view',
						arguments: { path: '/src/main.ts' },
						type: 'function',
					},
					{
						toolCallId: 'tool-2',
						name: 'grep',
						arguments: { pattern: 'TODO' },
						type: 'function',
					},
				],
			},
			id: 'test-2',
			timestamp: '2026-03-06T17:00:01Z',
		};
		processCopilotEventLine(agentId, JSON.stringify(event), agents, webview as unknown as import('vscode').Webview);

		const agent = agents.get(agentId)!;
		expect(agent.activeToolIds.size).toBe(2);
		expect(agent.hadToolsInTurn).toBe(true);

		const toolStartMessages = webview.messages.filter(m => m.type === 'agentToolStart');
		expect(toolStartMessages).toHaveLength(2);
		expect(toolStartMessages[0]).toMatchObject({
			type: 'agentToolStart',
			id: agentId,
			toolId: 'tool-1',
			status: 'Reading main.ts',
		});
		expect(toolStartMessages[1]).toMatchObject({
			type: 'agentToolStart',
			id: agentId,
			toolId: 'tool-2',
			status: 'Searching code',
		});
	});

	it('handles tool.execution_complete — emits agentToolDone', async () => {
		// First register the tool
		const agent = agents.get(agentId)!;
		agent.activeToolIds.add('tool-1');
		agent.activeToolStatuses.set('tool-1', 'Reading main.ts');
		agent.activeToolNames.set('tool-1', 'view');

		const event = {
			type: 'tool.execution_complete',
			data: {
				toolCallId: 'tool-1',
				success: true,
				result: { content: 'file contents...' },
			},
			id: 'test-3',
			timestamp: '2026-03-06T17:00:02Z',
		};
		processCopilotEventLine(agentId, JSON.stringify(event), agents, webview as unknown as import('vscode').Webview);

		expect(agent.activeToolIds.size).toBe(0);

		// agentToolDone is sent with a 300ms delay
		await new Promise(resolve => setTimeout(resolve, 350));
		const doneMessages = webview.messages.filter(m => m.type === 'agentToolDone');
		expect(doneMessages).toHaveLength(1);
		expect(doneMessages[0]).toMatchObject({
			type: 'agentToolDone',
			id: agentId,
			toolId: 'tool-1',
		});
	});

	it('handles assistant.turn_end — sets agent waiting', () => {
		const event = {
			type: 'assistant.turn_end',
			data: { turnId: '0' },
			id: 'test-4',
			timestamp: '2026-03-06T17:00:03Z',
		};
		processCopilotEventLine(agentId, JSON.stringify(event), agents, webview as unknown as import('vscode').Webview);

		const agent = agents.get(agentId)!;
		expect(agent.isWaiting).toBe(true);
		expect(webview.postMessage).toHaveBeenCalledWith({
			type: 'agentStatus',
			id: agentId,
			status: 'waiting',
		});
	});

	it('handles tool.user_requested — emits permission', () => {
		const event = {
			type: 'tool.user_requested',
			data: {
				toolCallId: 'tool-req-1',
				toolName: 'local_shell',
				arguments: { command: 'npm install' },
			},
			id: 'test-5',
			timestamp: '2026-03-06T17:00:04Z',
		};
		processCopilotEventLine(agentId, JSON.stringify(event), agents, webview as unknown as import('vscode').Webview);

		const agent = agents.get(agentId)!;
		expect(agent.permissionSent).toBe(true);
		expect(webview.postMessage).toHaveBeenCalledWith({
			type: 'agentToolPermission',
			id: agentId,
		});
	});

	it('handles report_intent — emits tool start/done quickly', async () => {
		const event = {
			type: 'assistant.message',
			data: {
				messageId: 'msg-intent',
				content: '',
				toolRequests: [
					{
						toolCallId: 'intent-1',
						name: 'report_intent',
						arguments: { intent: 'Exploring codebase' },
						type: 'function',
					},
				],
			},
			id: 'test-6',
			timestamp: '2026-03-06T17:00:05Z',
		};
		processCopilotEventLine(agentId, JSON.stringify(event), agents, webview as unknown as import('vscode').Webview);

		// report_intent should NOT be in active tools
		const agent = agents.get(agentId)!;
		expect(agent.activeToolIds.has('intent-1')).toBe(false);

		// Should emit agentToolStart with intent text
		const startMessages = webview.messages.filter(m => m.type === 'agentToolStart');
		expect(startMessages).toHaveLength(1);
		expect(startMessages[0]).toMatchObject({
			status: 'Exploring codebase',
		});

		// Should auto-emit agentToolDone after delay
		await new Promise(resolve => setTimeout(resolve, 350));
		const doneMessages = webview.messages.filter(m => m.type === 'agentToolDone');
		expect(doneMessages).toHaveLength(1);
	});

	it('handles user.message — clears agent state', () => {
		const agent = agents.get(agentId)!;
		agent.isWaiting = true;
		agent.activeToolIds.add('stale-tool');

		const event = {
			type: 'user.message',
			data: {
				content: 'Fix the bug',
				transformedContent: 'Fix the bug',
				attachments: [],
			},
			id: 'test-7',
			timestamp: '2026-03-06T17:00:06Z',
		};
		processCopilotEventLine(agentId, JSON.stringify(event), agents, webview as unknown as import('vscode').Webview);

		expect(agent.isWaiting).toBe(false);
		expect(agent.activeToolIds.size).toBe(0);
	});

	it('processes real fixture events without errors', () => {
		const fixturePath = path.join(__dirname, 'fixtures', 'copilot-events.jsonl');
		const lines = fs.readFileSync(fixturePath, 'utf-8').split('\n').filter(l => l.trim());

		for (const line of lines) {
			expect(() => {
				processCopilotEventLine(agentId, line, agents, webview as unknown as import('vscode').Webview);
			}).not.toThrow();
		}

		// Should have processed multiple events
		expect(webview.messages.length).toBeGreaterThan(0);
	});
});
