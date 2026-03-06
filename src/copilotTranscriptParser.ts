import * as path from 'path';
import type * as vscode from 'vscode';
import type { AgentState } from './types.js';
import {
	TOOL_DONE_DELAY_MS,
	BASH_COMMAND_DISPLAY_MAX_LENGTH,
	TASK_DESCRIPTION_DISPLAY_MAX_LENGTH,
} from './constants.js';

/**
 * Copilot CLI transcript parser — processes events.jsonl lines from
 * ~/.copilot/session-state/<uuid>/events.jsonl and emits the same
 * webview messages that the Claude parser does.
 *
 * Key differences from Claude Code:
 * - Explicit tool lifecycle: tool.execution_start → tool.execution_complete
 * - Explicit turn signals: assistant.turn_start / assistant.turn_end
 * - Explicit permission: tool.user_requested
 * - report_intent tool provides high-quality status labels
 * - No timer-based permission heuristics needed
 */

export function formatCopilotToolStatus(toolName: string, args: Record<string, unknown>): string {
	const base = (p: unknown) => typeof p === 'string' ? path.basename(p) : '';
	switch (toolName) {
		case 'powershell': {
			const cmd = (args.command as string) || '';
			return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026' : cmd}`;
		}
		case 'view': return `Reading ${base(args.path)}`;
		case 'edit': return `Editing ${base(args.path)}`;
		case 'create': return `Creating ${base(args.path)}`;
		case 'glob': return 'Searching files';
		case 'grep': return 'Searching code';
		case 'web_search': return 'Searching the web';
		case 'web_fetch': return 'Fetching web content';
		case 'task': {
			const desc = typeof args.description === 'string' ? args.description : '';
			return desc ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '\u2026' : desc}` : 'Running subtask';
		}
		case 'ask_user': return 'Waiting for your answer';
		case 'report_intent': {
			const intent = typeof args.intent === 'string' ? args.intent : '';
			return intent || 'Working';
		}
		case 'sql': return 'Querying database';
		case 'read_powershell': return 'Reading output';
		case 'write_powershell': return 'Sending input';
		case 'stop_powershell': return 'Stopping process';
		case 'read_agent': return 'Checking agent status';
		default: {
			if (toolName.startsWith('github-mcp-server-')) {
				const action = toolName.replace('github-mcp-server-', '').replace(/_/g, ' ');
				return `GitHub: ${action}`;
			}
			return `Using ${toolName}`;
		}
	}
}

// Tools that should not trigger permission detection
const COPILOT_PERMISSION_EXEMPT_TOOLS = new Set([
	'task', 'ask_user', 'report_intent', 'sql',
	'read_agent', 'list_agents',
]);

export function processCopilotEventLine(
	agentId: number,
	line: string,
	agents: Map<number, AgentState>,
	webview: vscode.Webview | undefined,
): void {
	const agent = agents.get(agentId);
	if (!agent) { return; }
	try {
		const event = JSON.parse(line);
		const type = event.type as string;
		const data = event.data as Record<string, unknown> | undefined;
		if (!data) { return; }

		switch (type) {
			case 'assistant.turn_start':
				// New assistant turn — clear waiting state
				agent.isWaiting = false;
				agent.permissionSent = false;
				agent.hadToolsInTurn = false;
				webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
				break;

			case 'assistant.message':
				processAssistantMessage(agentId, data, agent, webview);
				break;

			case 'tool.execution_start':
				processToolStart(agentId, data, agent, webview);
				break;

			case 'tool.execution_complete':
				processToolComplete(agentId, data, agent, webview);
				break;

			case 'tool.user_requested':
				processToolUserRequested(agentId, data, agent, webview);
				break;

			case 'assistant.turn_end':
				// Definitive turn-end — agent is now waiting for user input
				if (agent.activeToolIds.size > 0) {
					agent.activeToolIds.clear();
					agent.activeToolStatuses.clear();
					agent.activeToolNames.clear();
					agent.activeSubagentToolIds.clear();
					agent.activeSubagentToolNames.clear();
					webview?.postMessage({ type: 'agentToolsClear', id: agentId });
				}
				agent.isWaiting = true;
				agent.permissionSent = false;
				agent.hadToolsInTurn = false;
				webview?.postMessage({
					type: 'agentStatus',
					id: agentId,
					status: 'waiting',
				});
				break;

			case 'user.message':
				// New user prompt — new turn starting
				agent.isWaiting = false;
				agent.permissionSent = false;
				agent.hadToolsInTurn = false;
				if (agent.activeToolIds.size > 0) {
					agent.activeToolIds.clear();
					agent.activeToolStatuses.clear();
					agent.activeToolNames.clear();
					agent.activeSubagentToolIds.clear();
					agent.activeSubagentToolNames.clear();
					webview?.postMessage({ type: 'agentToolsClear', id: agentId });
				}
				webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
				break;

			// session.start, session.info, session.compaction_* — no action needed
		}
	} catch {
		// Ignore malformed lines
	}
}

function processAssistantMessage(
	agentId: number,
	data: Record<string, unknown>,
	agent: AgentState,
	webview: vscode.Webview | undefined,
): void {
	const toolRequests = data.toolRequests as Array<{
		toolCallId?: string;
		name?: string;
		arguments?: Record<string, unknown>;
		type?: string;
	}> | undefined;

	if (!toolRequests || toolRequests.length === 0) { return; }

	agent.hadToolsInTurn = true;

	for (const req of toolRequests) {
		if (!req.toolCallId) { continue; }
		const toolName = req.name || '';
		const args = req.arguments || {};
		const status = formatCopilotToolStatus(toolName, args);

		// report_intent: update status label but don't register as active tool
		if (toolName === 'report_intent') {
			webview?.postMessage({
				type: 'agentToolStart',
				id: agentId,
				toolId: req.toolCallId,
				status,
			});
			// Immediately mark as done — report_intent is instantaneous
			const toolId = req.toolCallId;
			setTimeout(() => {
				webview?.postMessage({
					type: 'agentToolDone',
					id: agentId,
					toolId,
				});
			}, TOOL_DONE_DELAY_MS);
			continue;
		}

		agent.activeToolIds.add(req.toolCallId);
		agent.activeToolStatuses.set(req.toolCallId, status);
		agent.activeToolNames.set(req.toolCallId, toolName);

		webview?.postMessage({
			type: 'agentToolStart',
			id: agentId,
			toolId: req.toolCallId,
			status,
		});
	}
}

function processToolStart(
	agentId: number,
	data: Record<string, unknown>,
	agent: AgentState,
	webview: vscode.Webview | undefined,
): void {
	const toolCallId = data.toolCallId as string | undefined;
	const toolName = data.toolName as string | undefined;
	if (!toolCallId || !toolName) { return; }

	// If this is a sub-agent tool (has mcpServerName or is within a task), track it
	// For now, tool.execution_start confirms the tool is running
	// We already registered it from assistant.message — just update status if needed
	if (!agent.activeToolIds.has(toolCallId)) {
		const args = (data.arguments as Record<string, unknown>) || {};
		const status = formatCopilotToolStatus(toolName, args);
		agent.activeToolIds.add(toolCallId);
		agent.activeToolStatuses.set(toolCallId, status);
		agent.activeToolNames.set(toolCallId, toolName);
		webview?.postMessage({
			type: 'agentToolStart',
			id: agentId,
			toolId: toolCallId,
			status,
		});
	}
}

function processToolComplete(
	agentId: number,
	data: Record<string, unknown>,
	agent: AgentState,
	webview: vscode.Webview | undefined,
): void {
	const toolCallId = data.toolCallId as string | undefined;
	if (!toolCallId) { return; }

	// If the completed tool was a Task, clear its subagent tools
	if (agent.activeToolNames.get(toolCallId) === 'task') {
		agent.activeSubagentToolIds.delete(toolCallId);
		agent.activeSubagentToolNames.delete(toolCallId);
		webview?.postMessage({
			type: 'subagentClear',
			id: agentId,
			parentToolId: toolCallId,
		});
	}

	agent.activeToolIds.delete(toolCallId);
	agent.activeToolStatuses.delete(toolCallId);
	agent.activeToolNames.delete(toolCallId);

	const toolId = toolCallId;
	setTimeout(() => {
		webview?.postMessage({
			type: 'agentToolDone',
			id: agentId,
			toolId,
		});
	}, TOOL_DONE_DELAY_MS);
}

function processToolUserRequested(
	agentId: number,
	data: Record<string, unknown>,
	agent: AgentState,
	webview: vscode.Webview | undefined,
): void {
	const toolName = data.toolName as string | undefined;
	// tool.user_requested means the agent is asking for permission to run a tool
	// This is Copilot CLI's explicit permission signal (no timer heuristic needed)
	if (toolName && !COPILOT_PERMISSION_EXEMPT_TOOLS.has(toolName)) {
		agent.permissionSent = true;
		webview?.postMessage({
			type: 'agentToolPermission',
			id: agentId,
		});
	}
}
